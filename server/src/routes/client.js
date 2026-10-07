const router = require('express').Router();
const { z } = require('zod');
const { Plan, SupportHub, Invitation, Engagement, AgentProfile, User, newApiKey } = require('../models');
const { wrap, auth, validate } = require('../middleware');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const config = require('../config');
const S = require('../lib/slots');
const { rankAgents, recommendTeam } = require('../lib/matching');
const { loadVerifiedAgents, freeSlotsFor } = require('../services/agentService');

router.use(auth('client'));

const round2 = (n) => Math.round(n * 100) / 100;
const clientRate = (rate) => round2(rate * (1 + config.platformFee));
const tzOf = (q, fallback = 'UTC') => (q && S.isValidTimezone(q) ? q : fallback);

async function matchRequirements(clientId, requirement) {
  const { timezone, languages, maxRate } = requirement;
  const required = requirement.slots;
  if (!required.length) return { error: 'Select the hours you need covered' };
  const agents = await loadVerifiedAgents();
  const mine = await Engagement.find({ client: clientId, status: 'active' });
  const pool = agents.map((a) => ({ ...a, freeSlots: [...a.freeSlots] }));

  const results = languages.map((language) => {
    const alreadyCovered = S.union(...mine.filter((e) => e.language === language.code).map((e) => e.slots));
    const toCover = S.subtract(required, alreadyCovered);
    const ranked = rankAgents(pool, {
      language: language.code,
      minLevel: language.minLevel,
      slots: toCover,
      maxRate,
      skills: requirement.skills || [],
      requiredSkills: requirement.requiredSkills || [],
      channels: requirement.channels || [],
      tier: requirement.tier || 'tier1',
      timezone,
    });
    const rec = recommendTeam(ranked, toCover);
    for (const pick of rec.team) {
      const agent = pool.find((candidate) => candidate.id === pick.agentId);
      agent.freeSlots = S.subtract(agent.freeSlots, pick.assignedSlots);
    }
    return {
      language: language.code,
      minLevel: language.minLevel,
      requiredHours: S.hoursOf(required),
      alreadyCoveredHours: S.hoursOf(S.intersect(required, alreadyCovered)),
      coveragePct: toCover.length ? rec.coveragePct : 100,
      candidates: ranked.length,
      weeklyHours: rec.weeklyHours,
      weeklyCost: round2(rec.team.reduce((sum, pick) => sum + pick.assignedHours * clientRate(pick.hourlyRate), 0)),
      gapGrid: S.utcSlotsToGrid(rec.gapSlots, timezone),
      gapHours: S.hoursOf(rec.gapSlots),
      team: rec.team.map((pick) => ({
        agentId: pick.agentId,
        name: pick.name,
        headline: pick.headline,
        level: pick.level,
        languages: pick.languages,
        skills: pick.skills,
        experienceYears: pick.experienceYears,
        channels: pick.channels,
        tiers: pick.tiers,
        timezone: pick.timezone,
        verified: pick.verified,
        rating: pick.rating,
        ratingCount: pick.ratingCount,
        score: pick.score,
        scoreBreakdown: pick.scoreBreakdown,
        hourlyRate: pick.hourlyRate,
        clientRate: clientRate(pick.hourlyRate),
        assignedHours: pick.assignedHours,
        weeklyCost: round2(pick.assignedHours * clientRate(pick.hourlyRate)),
        assignedGrid: S.utcSlotsToGrid(pick.assignedSlots, timezone),
        assignedSlots: pick.assignedSlots,
      })),
      alternatives: ranked
        .filter((candidate) => !rec.team.some((pick) => pick.agentId === candidate.agentId))
        .slice(0, 6)
        .map((candidate) => ({
          agentId: candidate.agentId,
          name: candidate.name,
          level: candidate.level,
          verified: candidate.verified,
          rating: candidate.rating,
          hourlyRate: candidate.hourlyRate,
          clientRate: clientRate(candidate.hourlyRate),
          overlapPct: candidate.overlapPct,
          overlapHours: candidate.overlapHours,
          score: candidate.score,
          scoreBreakdown: candidate.scoreBreakdown,
        })),
    };
  });
  return { timezone, results };
}

const planSchema = z.object({
  timezone: z.string().refine(S.isValidTimezone, 'unknown timezone'),
  grid: z.array(z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) })).max(168),
  languages: z
    .array(z.object({ code: z.enum(LANGUAGE_CODES), minLevel: z.enum(LEVEL_CODES).default('C1') }))
    .min(1, 'choose at least one language')
    .max(12)
    .refine((a) => new Set(a.map((l) => l.code)).size === a.length, 'duplicate language'),
  maxRate: z.number().min(1).max(1000).nullable().default(null), // max AGENT hourly rate
});

// ---- coverage plan ----
router.get(
  '/plan',
  wrap(async (req, res) => {
    const plan = await Plan.findOne({ client: req.user._id });
    const tz = tzOf(req.query.tz, plan ? plan.timezone : 'UTC');
    if (!plan) return res.json({ timezone: tz, grid: [], languages: [], maxRate: null });
    res.json({ timezone: tz, grid: S.utcSlotsToGrid(plan.slots, tz), languages: plan.languages.map((l) => ({ code: l.code, minLevel: l.minLevel })), maxRate: plan.maxRate });
  })
);

router.put(
  '/plan',
  validate(planSchema),
  wrap(async (req, res) => {
    const { grid, timezone, languages, maxRate } = req.body;
    const plan = await Plan.findOneAndUpdate(
      { client: req.user._id },
      { slots: S.gridToUtcSlots(grid, timezone), timezone, languages, maxRate },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ timezone, grid: S.utcSlotsToGrid(plan.slots, timezone), languages, maxRate });
  })
);

// ---- matching ----
router.post(
  '/match',
  validate(planSchema),
  wrap(async (req, res) => {
    const { grid, timezone, languages, maxRate } = req.body;
    const response = await matchRequirements(req.user._id, { ...req.body, slots: S.gridToUtcSlots(grid, timezone) });
    if (response.error) return res.status(400).json({ error: response.error });
    res.json(response);
  })
);

router.post('/hubs/:hubId/match', wrap(async (req, res) => {
  const hub = await SupportHub.findOne({ _id: req.params.hubId, client: req.user._id, status: { $ne: 'archived' } });
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  const response = await matchRequirements(req.user._id, {
    timezone: hub.timezone,
    languages: hub.languages,
    slots: hub.slots,
    maxRate: hub.maxRate,
    skills: hub.skills,
    requiredSkills: hub.requiredSkills,
    channels: hub.channels,
    tier: hub.tier,
  });
  if (response.error) return res.status(400).json({ error: response.error });
  res.json({ ...response, hubId: hub._id, hubName: hub.name });
}));

router.post('/hubs/:hubId/invitations', validate(z.object({
  agentId: z.string().length(24),
  language: z.enum(LANGUAGE_CODES),
  slots: z.array(z.number().int().min(0).max(335)).min(1).max(336),
}).strict()), wrap(async (req, res) => {
  const hub = await SupportHub.findOne({ _id: req.params.hubId, client: req.user._id, status: { $ne: 'archived' } });
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  const language = hub.languages.find((item) => item.code === req.body.language);
  if (!language) return res.status(400).json({ error: 'Language is not part of this Support Hub' });

  const profile = await AgentProfile.findOne({ user: req.body.agentId }).populate('user', 'name');
  if (!profile || !profile.verified || !profile.user) return res.status(400).json({ error: 'Agent is not verified or available' });
  const slots = S.union(req.body.slots);
  const hubSlots = new Set(hub.slots);
  if (slots.some((slot) => !hubSlots.has(slot))) return res.status(400).json({ error: 'Invitation hours must be inside the Support Hub schedule' });
  const freeSlots = new Set(await freeSlotsFor(profile));
  if (slots.some((slot) => !freeSlots.has(slot))) return res.status(409).json({ error: 'Some requested hours are no longer available' });

  const candidate = {
    id: profile.user._id.toString(),
    name: profile.user.name,
    languages: profile.languages.map((item) => ({ code: item.code, level: item.level })),
    skills: profile.skills || [],
    experienceYears: profile.experienceYears || 0,
    channels: profile.channels || ['email', 'chat'],
    tiers: profile.tiers || ['tier1'],
    timezone: profile.timezone,
    hourlyRate: profile.hourlyRate,
    rating: profile.ratingCount ? profile.ratingSum / profile.ratingCount : null,
    ratingCount: profile.ratingCount || 0,
    freeSlots: [...freeSlots],
  };
  const ranked = rankAgents([candidate], {
    language: language.code,
    minLevel: language.minLevel,
    slots,
    maxRate: hub.maxRate,
    skills: hub.skills,
    requiredSkills: hub.requiredSkills,
    channels: hub.channels,
    tier: hub.tier,
    timezone: hub.timezone,
  });
  if (!ranked.length) return res.status(400).json({ error: 'Agent does not meet the Support Hub requirements' });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  await Invitation.updateMany({ hub: hub._id, agent: req.body.agentId, language: language.code, status: 'pending', expiresAt: { $lte: now } }, { status: 'expired', respondedAt: now });
  const existing = await Invitation.findOne({ hub: hub._id, agent: req.body.agentId, language: language.code, status: 'pending' });
  if (existing) return res.status(409).json({ error: 'An invitation is already pending for this agent' });

  const invite = await Invitation.create({
    client: req.user._id,
    agent: req.body.agentId,
    hub: hub._id,
    language: language.code,
    slots,
    hourlyRate: candidate.hourlyRate,
    clientRate: clientRate(candidate.hourlyRate),
    matchScore: ranked[0].score,
    scoreBreakdown: ranked[0].scoreBreakdown,
    expiresAt,
  });
  res.status(201).json({ id: invite._id, status: invite.status, expiresAt: invite.expiresAt, matchScore: invite.matchScore });
}));

router.get('/hubs/:hubId/invitations', wrap(async (req, res) => {
  const hub = await SupportHub.findOne({ _id: req.params.hubId, client: req.user._id });
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  await Invitation.updateMany({ hub: hub._id, status: 'pending', expiresAt: { $lte: new Date() } }, { status: 'expired', respondedAt: new Date() });
  const invites = await Invitation.find({ hub: hub._id }).populate('agent', 'name email').sort({ createdAt: -1 });
  res.json(invites.map((invite) => ({
    id: invite._id,
    agent: invite.agent ? { id: invite.agent._id, name: invite.agent.name, email: invite.agent.email } : null,
    language: invite.language,
    status: invite.status,
    matchScore: invite.matchScore,
    scoreBreakdown: invite.scoreBreakdown,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  })));
}));

// Agent consent is required; active engagements are created by accepting a Hub invitation.
router.post('/hire', (req, res) => res.status(410).json({ error: 'Direct hiring is retired. Send an invitation from a Support Hub.' }));

router.get(
  '/engagements',
  wrap(async (req, res) => {
    const tz = tzOf(req.query.tz);
    const engs = await Engagement.find({ client: req.user._id, status: 'active' }).sort({ language: 1 });
    const profiles = await AgentProfile.find({ user: { $in: engs.map((e) => e.agent) } }).populate('user', 'name');
    const byUser = Object.fromEntries(profiles.map((p) => [p.user._id.toString(), p]));
    res.json(
      engs.map((e) => {
        const p = byUser[e.agent.toString()];
        return {
          id: e._id,
          language: e.language,
          agentName: p ? p.user.name : 'Agent',
          headline: p ? p.headline : '',
          rating: p && p.ratingCount ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null,
          weeklyHours: S.hoursOf(e.slots),
          clientRate: e.clientRate,
          weeklyCost: round2(S.hoursOf(e.slots) * e.clientRate),
          grid: S.utcSlotsToGrid(e.slots, tz),
          since: e.createdAt,
        };
      })
    );
  })
);

router.delete(
  '/engagements/:id',
  wrap(async (req, res) => {
    const e = await Engagement.findOneAndUpdate({ _id: req.params.id, client: req.user._id, status: 'active' }, { status: 'ended', endedAt: new Date() });
    if (!e) return res.status(404).json({ error: 'Engagement not found' });
    res.json({ ok: true });
  })
);

// ---- live coverage ----
router.get(
  '/coverage',
  wrap(async (req, res) => {
    const [plan, hubs, engs] = await Promise.all([
      Plan.findOne({ client: req.user._id }),
      SupportHub.find({ client: req.user._id, status: 'active' }),
      Engagement.find({ client: req.user._id, status: 'active' }),
    ]);
    const tz = tzOf(req.query.tz, plan ? plan.timezone : hubs[0] ? hubs[0].timezone : 'UTC');
    const requiredByLanguage = new Map();
    const addRequirement = (code, slots) => {
      const current = requiredByLanguage.get(code) || [];
      requiredByLanguage.set(code, S.union(current, slots));
    };
    if (plan) for (const language of plan.languages) addRequirement(language.code, plan.slots);
    for (const hub of hubs) for (const language of hub.languages) addRequirement(language.code, hub.slots);
    for (const engagement of engs) if (!requiredByLanguage.has(engagement.language)) requiredByLanguage.set(engagement.language, []);

    const out = [...requiredByLanguage.keys()].map((code) => {
      const required = requiredByLanguage.get(code) || [];
      const lists = engs.filter((e) => e.language === code).map((e) => e.slots);
      const covered = S.union(...lists);
      const reqCovered = S.intersect(required, covered);
      return {
        language: code,
        requiredHours: S.hoursOf(required),
        coveragePct: required.length ? Math.round((reqCovered.length / required.length) * 100) : null,
        heat: S.coverageHeat(lists, tz),
        required: S.utcSlotsToGrid(required, tz),
      };
    });
    res.json({ timezone: tz, languages: out });
  })
);

// ---- billing ----
router.get(
  '/billing',
  wrap(async (req, res) => {
    const engs = await Engagement.find({ client: req.user._id, status: 'active' }).populate('agent', 'name');
    const lines = engs.map((e) => ({
      id: e._id,
      agentName: e.agent ? e.agent.name : 'Agent',
      language: e.language,
      weeklyHours: S.hoursOf(e.slots),
      clientRate: e.clientRate,
      weeklyCost: round2(S.hoursOf(e.slots) * e.clientRate),
    }));
    const weekly = round2(lines.reduce((s, l) => s + l.weeklyCost, 0));
    res.json({ lines, weeklyTotal: weekly, monthlyEstimate: round2((weekly * 52) / 12), platformFeePct: Math.round(config.platformFee * 100), currency: 'USD' });
  })
);

// ---- settings / integration ----
router.get('/settings', (req, res) => res.json({ apiKey: req.user.apiKey, slaMinutes: req.user.slaMinutes, company: req.user.company }));

router.put(
  '/settings',
  validate(z.object({ slaMinutes: z.number().int().min(1).max(1440) })),
  wrap(async (req, res) => {
    req.user.slaMinutes = req.body.slaMinutes;
    await req.user.save();
    res.json({ slaMinutes: req.user.slaMinutes });
  })
);

router.post(
  '/rotate-key',
  wrap(async (req, res) => {
    req.user.apiKey = newApiKey();
    await req.user.save();
    res.json({ apiKey: req.user.apiKey });
  })
);

module.exports = router;
