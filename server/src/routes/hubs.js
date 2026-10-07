const router = require('express').Router();
const { z } = require('zod');
const { SupportHub, Invitation } = require('../models');
const { wrap, auth, validate } = require('../middleware');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const { isValidTimezone, gridToUtcSlots, utcSlotsToGrid } = require('../lib/slots');
const { SKILLS, CHANNELS, TIERS } = require('../lib/capabilities');

router.use(auth('client'));

const gridSchema = z.array(z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) }).strict()).max(168)
  .refine((grid) => new Set(grid.map((cell) => `${cell.day}:${cell.hour}`)).size === grid.length, 'duplicate schedule hour');
const hubSchema = z.object({
  name: z.string().trim().min(2).max(100),
  industry: z.string().trim().max(80).default(''),
  companySize: z.string().trim().max(32).default(''),
  country: z.string().trim().max(80).default(''),
  website: z.string().trim().max(200).default(''),
  supportContext: z.string().trim().max(1000).default(''),
  languages: z.array(z.object({ code: z.enum(LANGUAGE_CODES), minLevel: z.enum(LEVEL_CODES).default('C1') }).strict()).max(12),
  skills: z.array(z.enum(SKILLS)).max(SKILLS.length).default([]),
  requiredSkills: z.array(z.enum(SKILLS)).max(SKILLS.length).default([]),
  channels: z.array(z.enum(CHANNELS)).min(1).max(CHANNELS.length),
  tier: z.enum(TIERS).default('tier1'),
  ticketVolume: z.number().int().min(0).max(100000).default(0),
  timezone: z.string().refine(isValidTimezone, 'unknown timezone'),
  grid: gridSchema,
  maxRate: z.number().min(1).max(1000).nullable().default(null),
  requires24x7: z.boolean().default(false),
  status: z.enum(['draft', 'active']).default('draft'),
}).strict()
  .refine((hub) => new Set(hub.languages.map((language) => language.code)).size === hub.languages.length, 'duplicate language')
  .refine((hub) => hub.status !== 'active' || (hub.languages.length > 0 && hub.grid.length > 0), 'active hubs need languages and coverage hours')
  .refine((hub) => !hub.requires24x7 || hub.grid.length === 168, '24/7 hubs must include all 168 weekly hours');

const view = (hub) => ({
  id: hub._id,
  name: hub.name,
  industry: hub.industry,
  companySize: hub.companySize,
  country: hub.country,
  website: hub.website,
  supportContext: hub.supportContext,
  languages: hub.languages.map(({ code, minLevel }) => ({ code, minLevel })),
  skills: hub.skills,
  requiredSkills: hub.requiredSkills,
  channels: hub.channels,
  tier: hub.tier,
  ticketVolume: hub.ticketVolume,
  timezone: hub.timezone,
  grid: utcSlotsToGrid(hub.slots, hub.timezone),
  maxRate: hub.maxRate,
  requires24x7: hub.requires24x7,
  status: hub.status,
  createdAt: hub.createdAt,
  updatedAt: hub.updatedAt,
});

router.get('/', wrap(async (req, res) => {
  const hubs = await SupportHub.find({ client: req.user._id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 });
  res.json(hubs.map(view));
}));

router.post('/', validate(hubSchema), wrap(async (req, res) => {
  const { grid, timezone, ...fields } = req.body;
  const hub = await SupportHub.create({ client: req.user._id, ...fields, timezone, slots: gridToUtcSlots(grid, timezone) });
  res.status(201).json(view(hub));
}));

router.get('/:id', wrap(async (req, res) => {
  const hub = await SupportHub.findOne({ _id: req.params.id, client: req.user._id, status: { $ne: 'archived' } });
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  res.json(view(hub));
}));

router.put('/:id', validate(hubSchema), wrap(async (req, res) => {
  const { grid, timezone, ...fields } = req.body;
  const hub = await SupportHub.findOneAndUpdate(
    { _id: req.params.id, client: req.user._id, status: { $ne: 'archived' } },
    { ...fields, timezone, slots: gridToUtcSlots(grid, timezone) },
    { returnDocument: 'after', runValidators: true }
  );
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  res.json(view(hub));
}));

router.delete('/:id', wrap(async (req, res) => {
  const hub = await SupportHub.findOneAndUpdate(
    { _id: req.params.id, client: req.user._id, status: { $ne: 'archived' } },
    { status: 'archived' },
    { returnDocument: 'after' }
  );
  if (!hub) return res.status(404).json({ error: 'Support Hub not found' });
  await Invitation.updateMany({ hub: hub._id, status: 'pending' }, { status: 'expired', respondedAt: new Date() });
  res.json({ ok: true });
}));

module.exports = { router, hubSchema, skills: SKILLS };