const router = require('express').Router();
const { z } = require('zod');
const { Ticket, User, AgentProfile } = require('../models');
const { wrap, auth, validate } = require('../middleware');
const { LANGUAGE_CODES } = require('../lib/meta');
const { createTicket, present, OPEN } = require('../services/ticketService');

router.use(auth('client', 'agent', 'admin'));

// What a given user may see.
const scope = (u) => (u.role === 'client' ? { client: u._id } : u.role === 'agent' ? { agent: u._id } : {});

async function loadScoped(req) {
  return Ticket.findOne({ _id: req.params.id, ...scope(req.user) });
}

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  customerEmail: z.string().trim().email().or(z.literal('')).default(''),
  language: z.enum(LANGUAGE_CODES),
  subject: z.string().trim().min(1).max(200),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  message: z.string().trim().min(1).max(10000),
});

router.post(
  '/',
  auth('client'),
  validate(createSchema),
  wrap(async (req, res) => {
    const t = await createTicket({ client: req.user, source: 'dashboard', ...req.body });
    res.status(201).json(present(t));
  })
);

router.get(
  '/',
  wrap(async (req, res) => {
    const q = { ...scope(req.user) };
    if (req.query.status === 'open') q.status = { $in: ['queued', ...OPEN] };
    else if (['queued', 'assigned', 'in_progress', 'resolved'].includes(req.query.status)) q.status = req.query.status;
    if (LANGUAGE_CODES.includes(req.query.language)) q.language = req.query.language;
    const tickets = await Ticket.find(q, '-messages').sort({ createdAt: -1 }).limit(200).populate('agent', 'name').populate('client', 'company');
    res.json(tickets.map((t) => ({ ...present(t), agentName: t.agent ? t.agent.name : null, company: t.client ? t.client.company : null, agent: t.agent ? t.agent._id : null, client: t.client ? t.client._id : null })));
  })
);

router.get(
  '/stats',
  wrap(async (req, res) => {
    const rows = await Ticket.aggregate([{ $match: scope(req.user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const open = await Ticket.find({ ...scope(req.user), status: { $in: ['queued', ...OPEN] } }, 'createdAt firstResponseDueAt firstResponseAt');
    const atRisk = open.filter((t) => present(t).sla === 'at_risk').length;
    const breached = open.filter((t) => present(t).sla === 'breached').length;
    res.json({ queued: by.queued || 0, assigned: by.assigned || 0, in_progress: by.in_progress || 0, resolved: by.resolved || 0, atRisk, breached });
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const t = await loadScoped(req);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    await t.populate('agent', 'name');
    res.json({ ...present(t), agentName: t.agent ? t.agent.name : null, agent: t.agent ? t.agent._id : null });
  })
);

router.post(
  '/:id/messages',
  auth('client', 'agent'),
  validate(z.object({ body: z.string().trim().min(1).max(10000) })),
  wrap(async (req, res) => {
    const t = await loadScoped(req);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if (t.status === 'resolved') return res.status(409).json({ error: 'Ticket is resolved' });
    const now = new Date();
    if (req.user.role === 'agent') {
      if (t.status === 'queued') return res.status(409).json({ error: 'Ticket is not assigned yet' });
      t.messages.push({ from: 'agent', authorName: req.user.name, body: req.body.body, at: now });
      if (!t.firstResponseAt) t.firstResponseAt = now;
      t.status = 'in_progress';
    } else {
      t.messages.push({ from: 'customer', authorName: t.customerName, body: req.body.body, at: now });
    }
    await t.save();
    res.json(present(t));
  })
);

router.post(
  '/:id/resolve',
  auth('client', 'agent'),
  wrap(async (req, res) => {
    const t = await loadScoped(req);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if (t.status === 'queued') return res.status(409).json({ error: 'Ticket has not been picked up yet' });
    if (t.status !== 'resolved') {
      t.status = 'resolved';
      t.resolvedAt = new Date();
      t.messages.push({ from: 'system', authorName: 'LingoHub', body: `Resolved by ${req.user.name}`, at: t.resolvedAt });
      await t.save();
    }
    res.json(present(t));
  })
);

router.post(
  '/:id/rate',
  auth('client'),
  validate(z.object({ csat: z.number().int().min(1).max(5) })),
  wrap(async (req, res) => {
    const t = await loadScoped(req);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if (t.status !== 'resolved' || !t.agent) return res.status(409).json({ error: 'Only resolved tickets can be rated' });
    if (t.csat) return res.status(409).json({ error: 'Already rated' });
    t.csat = req.body.csat;
    await t.save();
    await AgentProfile.updateOne({ user: t.agent }, { $inc: { ratingSum: req.body.csat, ratingCount: 1 } });
    res.json(present(t));
  })
);

module.exports = router;
