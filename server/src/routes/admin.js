const router = require('express').Router();
const { z } = require('zod');
const { User, AgentProfile, Ticket, Engagement } = require('../models');
const { wrap, auth, validate } = require('../middleware');
const { hoursOf } = require('../lib/slots');

router.use(auth('admin'));

router.get(
  '/agents',
  wrap(async (req, res) => {
    const profiles = await AgentProfile.find().populate('user', 'name email createdAt').sort({ verified: 1, createdAt: -1 });
    res.json(
      profiles
        .filter((p) => p.user)
        .map((p) => ({
          id: p.user._id,
          name: p.user.name,
          email: p.user.email,
          headline: p.headline,
          bio: p.bio,
          timezone: p.timezone,
          hourlyRate: p.hourlyRate,
          languages: p.languages.map((l) => ({ code: l.code, level: l.level })),
          weeklyHours: hoursOf(p.availableSlots),
          verified: p.verified,
          rating: p.ratingCount ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null,
          joined: p.user.createdAt,
        }))
    );
  })
);

router.post(
  '/agents/:id/verify',
  validate(z.object({ verified: z.boolean() })),
  wrap(async (req, res) => {
    const p = await AgentProfile.findOneAndUpdate({ user: req.params.id }, { verified: req.body.verified }, { returnDocument: 'after' });
    if (!p) return res.status(404).json({ error: 'Agent not found' });
    res.json({ verified: p.verified });
  })
);

router.get(
  '/stats',
  wrap(async (req, res) => {
    const [clients, agents, verified, engagements, byStatus, resolved] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'agent' }),
      AgentProfile.countDocuments({ verified: true }),
      Engagement.find({ status: 'active' }, 'slots clientRate hourlyRate'),
      Ticket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Ticket.find({ firstResponseAt: { $exists: true } }, 'createdAt firstResponseAt firstResponseDueAt').limit(2000),
    ]);
    const by = Object.fromEntries(byStatus.map((r) => [r._id, r.n]));
    const respTimes = resolved.map((t) => (t.firstResponseAt - t.createdAt) / 60000);
    const avgFirstResponseMin = respTimes.length ? Math.round((respTimes.reduce((a, b) => a + b, 0) / respTimes.length) * 10) / 10 : null;
    const slaMet = resolved.filter((t) => t.firstResponseAt <= t.firstResponseDueAt).length;
    const weeklyRevenue = engagements.reduce((s, e) => s + hoursOf(e.slots) * (e.clientRate - e.hourlyRate), 0);
    res.json({
      clients, agents, verifiedAgents: verified,
      activeEngagements: engagements.length,
      weeklyPlatformRevenue: Math.round(weeklyRevenue * 100) / 100,
      tickets: { queued: by.queued || 0, assigned: by.assigned || 0, in_progress: by.in_progress || 0, resolved: by.resolved || 0 },
      avgFirstResponseMin,
      slaAttainmentPct: resolved.length ? Math.round((slaMet / resolved.length) * 100) : null,
    });
  })
);

module.exports = router;
