const router = require('express').Router();
const { z } = require('zod');
const { AgentProfile, Engagement, Invitation, SupportHub, Ticket } = require('../models');
const { wrap, auth, validate } = require('../middleware');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const { isValidTimezone, gridToUtcSlots, utcSlotsToGrid, hoursOf, coverageHeat } = require('../lib/slots');
const { freeSlotsFor } = require('../services/agentService');
const { routeQueued } = require('../services/ticketService');
const { SKILLS, CHANNELS, TIERS } = require('../lib/capabilities');
const { rankAgents } = require('../lib/matching');

router.use(auth('agent'));

const gridSchema = z.array(z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) })).max(168);

const profileSchema = z.object({
  headline: z.string().trim().max(120).default(''),
  bio: z.string().trim().max(1000).default(''),
  skills: z.array(z.enum(SKILLS)).max(SKILLS.length).default([]),
  experienceYears: z.number().int().min(0).max(50).default(0),
  channels: z.array(z.enum(CHANNELS)).min(1).max(CHANNELS.length).default(['email', 'chat']),
  tiers: z.array(z.enum(TIERS)).min(1).max(TIERS.length).default(['tier1']),
  timezone: z.string().refine(isValidTimezone, 'unknown timezone'),
  hourlyRate: z.number().min(1).max(500),
  languages: z
    .array(z.object({ code: z.enum(LANGUAGE_CODES), level: z.enum(LEVEL_CODES) }))
    .min(1, 'add at least one language')
    .max(8)
    .refine((a) => new Set(a.map((l) => l.code)).size === a.length, 'duplicate language'),
  grid: gridSchema,
});

async function profileView(profile, tz) {
  const zone = tz || profile.timezone;
  const free = await freeSlotsFor(profile);
  return {
    headline: profile.headline,
    bio: profile.bio,
    skills: profile.skills || [],
    experienceYears: profile.experienceYears || 0,
    channels: profile.channels || ['email', 'chat'],
    tiers: profile.tiers || ['tier1'],
    timezone: profile.timezone,
    hourlyRate: profile.hourlyRate,
    languages: profile.languages.map((l) => ({ code: l.code, level: l.level })),
    verified: profile.verified,
    rating: profile.ratingCount ? Math.round((profile.ratingSum / profile.ratingCount) * 10) / 10 : null,
    ratingCount: profile.ratingCount,
    grid: utcSlotsToGrid(profile.availableSlots, zone),
    committedGrid: utcSlotsToGrid(
      profile.availableSlots.filter((s) => !free.includes(s)),
      zone
    ),
    weeklyHoursAvailable: hoursOf(profile.availableSlots),
    weeklyHoursFree: hoursOf(free),
  };
}

router.get(
  '/profile',
  wrap(async (req, res) => {
    const p = await AgentProfile.findOne({ user: req.user._id });
    res.json(await profileView(p, req.query.tz && isValidTimezone(req.query.tz) ? req.query.tz : undefined));
  })
);

router.put(
  '/profile',
  validate(profileSchema),
  wrap(async (req, res) => {
    const { grid, timezone, ...rest } = req.body;
    const p = await AgentProfile.findOne({ user: req.user._id });
    const newSlots = gridToUtcSlots(grid, timezone);
    // Can't remove hours you've already committed to a client.
    const engs = await Engagement.find({ agent: req.user._id, status: 'active' }, 'slots');
    const committed = new Set(engs.flatMap((e) => e.slots));
    const kept = new Set(newSlots);
    const dropped = [...committed].filter((s) => !kept.has(s));
    if (dropped.length) {
      return res.status(409).json({ error: `Those changes would remove ${dropped.length / 2} hours/week already committed to clients. End the engagement first.` });
    }
    p.set({ ...rest, timezone, availableSlots: newSlots });
    await p.save();
    routeQueued().catch(() => {});
    res.json(await profileView(p));
  })
);

router.get('/invitations', wrap(async (req, res) => {
  const now = new Date();
  await Invitation.updateMany({ agent: req.user._id, status: 'pending', expiresAt: { $lte: now } }, { status: 'expired', respondedAt: now });
  const invitations = await Invitation.find({ agent: req.user._id }).populate('client', 'company').populate('hub', 'name tier').sort({ createdAt: -1 });
  res.json(invitations.map((invite) => ({
    id: invite._id,
    company: invite.client ? invite.client.company : 'Company',
    hubName: invite.hub ? invite.hub.name : 'Archived Support Hub',
    tier: invite.hub ? invite.hub.tier : 'tier1',
    language: invite.language,
    slots: invite.slots,
    weeklyHours: hoursOf(invite.slots),
    hourlyRate: invite.hourlyRate,
    clientRate: invite.clientRate,
    matchScore: invite.matchScore,
    scoreBreakdown: invite.scoreBreakdown,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  })));
}));

router.post('/invitations/:id/accept', wrap(async (req, res) => {
  const now = new Date();
  const invite = await Invitation.findOneAndUpdate(
    { _id: req.params.id, agent: req.user._id, status: 'pending', expiresAt: { $gt: now } },
    { status: 'accepted', respondedAt: now },
    { returnDocument: 'after' }
  );
  if (!invite) {
    const expired = await Invitation.findOneAndUpdate(
      { _id: req.params.id, agent: req.user._id, status: 'pending', expiresAt: { $lte: now } },
      { status: 'expired', respondedAt: now },
      { returnDocument: 'after' }
    );
    return res.status(expired ? 410 : 409).json({ error: expired ? 'This invitation has expired' : 'Invitation is unavailable or already answered' });
  }

  const restorePending = async () => {
    invite.status = 'pending';
    invite.respondedAt = undefined;
    await invite.save();
  };
  let engagement;
  try {
    const [profile, hub] = await Promise.all([
      AgentProfile.findOne({ user: req.user._id }),
      SupportHub.findById(invite.hub),
    ]);
    if (!profile || !profile.verified || !hub || hub.status === 'archived') {
      invite.status = 'expired';
      await invite.save();
      return res.status(409).json({ error: 'Your verification or this Support Hub is no longer active' });
    }
    const free = new Set(await freeSlotsFor(profile));
    const language = hub.languages.find((item) => item.code === invite.language);
    const hubSlots = new Set(hub.slots);
    const candidate = {
      id: req.user._id.toString(),
      name: req.user.name,
      languages: profile.languages.map((item) => ({ code: item.code, level: item.level })),
      skills: profile.skills || [],
      experienceYears: profile.experienceYears || 0,
      channels: profile.channels || ['email', 'chat'],
      tiers: profile.tiers || ['tier1'],
      timezone: profile.timezone,
      hourlyRate: profile.hourlyRate,
      freeSlots: [...free],
    };
    const eligible = profile.hourlyRate === invite.hourlyRate && language && invite.slots.every((slot) => free.has(slot) && hubSlots.has(slot)) && rankAgents([candidate], {
      language: invite.language,
      minLevel: language.minLevel,
      slots: invite.slots,
      maxRate: hub.maxRate,
      skills: hub.skills,
      requiredSkills: hub.requiredSkills,
      channels: hub.channels,
      tier: hub.tier,
      timezone: hub.timezone,
    }).length > 0;
    if (!eligible) {
      await restorePending();
      return res.status(409).json({ error: 'The invitation no longer matches your availability or this Hub’s requirements' });
    }

    engagement = await Engagement.create({
      client: invite.client,
      agent: req.user._id,
      hub: invite.hub,
      language: invite.language,
      slots: invite.slots,
      hourlyRate: profile.hourlyRate,
      clientRate: invite.clientRate,
    });
    const competing = await Engagement.find({
      agent: req.user._id,
      status: 'active',
      _id: { $ne: engagement._id },
      createdAt: { $lte: engagement.createdAt },
    }, 'slots');
    if (competing.some((other) => invite.slots.some((slot) => other.slots.includes(slot)))) {
      await Engagement.deleteOne({ _id: engagement._id });
      engagement = null;
      await restorePending();
      return res.status(409).json({ error: 'Some invitation hours were just committed elsewhere' });
    }
    invite.engagement = engagement._id;
    await invite.save();
    routeQueued().catch(() => {});
    return res.json({ id: invite._id, status: invite.status, engagementId: engagement._id });
  } catch (error) {
    if (engagement) await Engagement.deleteOne({ _id: engagement._id });
    await restorePending();
    throw error;
  }
}));

router.post('/invitations/:id/reject', wrap(async (req, res) => {
  const invite = await Invitation.findOneAndUpdate(
    { _id: req.params.id, agent: req.user._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { status: 'rejected', respondedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!invite) return res.status(409).json({ error: 'Invitation is unavailable or already answered' });
  res.json({ id: invite._id, status: invite.status });
}));

router.get(
  '/engagements',
  wrap(async (req, res) => {
    const engs = await Engagement.find({ agent: req.user._id, status: 'active' }).populate('client', 'company');
    res.json(
      engs.map((e) => ({
        id: e._id,
        company: e.client && e.client.company,
        language: e.language,
        weeklyHours: hoursOf(e.slots),
        hourlyRate: e.hourlyRate,
        weeklyEarnings: Math.round(hoursOf(e.slots) * e.hourlyRate * 100) / 100,
        since: e.createdAt,
      }))
    );
  })
);

// Agent's own on-shift heat (their committed hours), for the "my week" view.
router.get(
  '/week',
  wrap(async (req, res) => {
    const p = await AgentProfile.findOne({ user: req.user._id });
    const engs = await Engagement.find({ agent: req.user._id, status: 'active' }, 'slots');
    const tz = req.query.tz && isValidTimezone(req.query.tz) ? req.query.tz : p.timezone;
    res.json({ timezone: tz, cells: coverageHeat(engs.map((e) => e.slots), tz) });
  })
);

router.get(
  '/stats',
  wrap(async (req, res) => {
    const [open, resolved] = await Promise.all([
      Ticket.countDocuments({ agent: req.user._id, status: { $in: ['assigned', 'in_progress'] } }),
      Ticket.countDocuments({ agent: req.user._id, status: 'resolved' }),
    ]);
    res.json({ open, resolved });
  })
);

module.exports = router;
