const { AgentProfile, Engagement } = require('../models');
const { subtract, union } = require('../lib/slots');

// Slots an agent is available for but not yet committed to any client.
async function freeSlotsFor(profile) {
  const userId = profile.user && profile.user._id ? profile.user._id : profile.user; // may be populated
  const engs = await Engagement.find({ agent: userId, status: 'active' }, 'slots');
  return subtract(profile.availableSlots, union(...engs.map((e) => e.slots)));
}

async function loadVerifiedAgents() {
  const profiles = await AgentProfile.find({ verified: true, 'languages.0': { $exists: true } }).populate('user', 'name');
  const out = [];
  for (const p of profiles) {
    if (!p.user) continue;
    out.push({
      id: p.user._id.toString(),
      name: p.user.name,
      headline: p.headline,
      languages: p.languages.map((l) => ({ code: l.code, level: l.level })),
      skills: p.skills || [],
      experienceYears: p.experienceYears || 0,
      channels: p.channels || ['email', 'chat'],
      tiers: p.tiers || ['tier1'],
      timezone: p.timezone,
      hourlyRate: p.hourlyRate,
      rating: p.ratingCount ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null,
      ratingCount: p.ratingCount,
      freeSlots: await freeSlotsFor(p),
    });
  }
  return out;
}

module.exports = { freeSlotsFor, loadVerifiedAgents };
