// Public API for the client's own product / helpdesk to push tickets in.
// Auth: `x-api-key: lh_...` header (one key per client account, rotatable).
const router = require('express').Router();
const { z } = require('zod');
const { User, Ticket } = require('../models');
const { wrap, validate } = require('../middleware');
const { LANGUAGE_CODES } = require('../lib/meta');
const { createTicket, present } = require('../services/ticketService');

const byKey = wrap(async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing x-api-key header' });
  const client = await User.findOne({ apiKey: key, role: 'client' });
  if (!client) return res.status(401).json({ error: 'Invalid API key' });
  req.client = client;
  next();
});

router.post(
  '/tickets',
  byKey,
  validate(
    z.object({
      customerName: z.string().trim().min(1).max(100),
      customerEmail: z.string().trim().email().or(z.literal('')).default(''),
      language: z.enum(LANGUAGE_CODES),
      subject: z.string().trim().min(1).max(200),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      message: z.string().trim().min(1).max(10000),
    })
  ),
  wrap(async (req, res) => {
    const t = await createTicket({ client: req.client, source: 'api', ...req.body });
    res.status(201).json({ number: t.number, status: t.status, assigned: !!t.agent, firstResponseDueAt: t.firstResponseDueAt });
  })
);

router.post(
  '/tickets/:number/reply',
  byKey,
  validate(z.object({ message: z.string().trim().min(1).max(10000) })),
  wrap(async (req, res) => {
    const t = await Ticket.findOne({ client: req.client._id, number: Number(req.params.number) });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if (t.status === 'resolved') return res.status(409).json({ error: 'Ticket is resolved' });
    t.messages.push({ from: 'customer', authorName: t.customerName, body: req.body.message, at: new Date() });
    await t.save();
    res.json({ number: t.number, status: t.status });
  })
);

router.get(
  '/tickets/:number',
  byKey,
  wrap(async (req, res) => {
    const t = await Ticket.findOne({ client: req.client._id, number: Number(req.params.number) });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const p = present(t);
    res.json({ number: t.number, status: t.status, sla: p.sla, messages: t.messages.filter((m) => m.from !== 'system') });
  })
);

module.exports = router;
