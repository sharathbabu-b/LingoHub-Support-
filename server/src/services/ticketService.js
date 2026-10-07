const { Ticket, Engagement, nextTicketNumber } = require('../models');
const { slotAt } = require('../lib/slots');
const { pickAgent, firstResponseDue, slaState } = require('../lib/routing');

const OPEN = ['assigned', 'in_progress'];

async function agentLoads(agentIds) {
  const rows = await Ticket.aggregate([
    { $match: { agent: { $in: agentIds }, status: { $in: OPEN } } },
    { $group: { _id: '$agent', n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id.toString(), r.n]));
}

// Try to assign a ticket to an on-shift agent engaged by this client for this language.
async function routeTicket(ticket, now = new Date()) {
  if (ticket.status !== 'queued') return ticket;
  const engs = await Engagement.find({ client: ticket.client, language: ticket.language, status: 'active' });
  if (!engs.length) return ticket;
  const loads = await agentLoads(engs.map((e) => e.agent));
  const agentId = pickAgent(
    engs.map((e) => ({ agentId: e.agent.toString(), slots: e.slots })),
    loads,
    slotAt(now)
  );
  if (!agentId) return ticket;
  const updated = await Ticket.findOneAndUpdate(
    { _id: ticket._id, status: 'queued' }, // guard: another sweep may have routed it
    { agent: agentId, status: 'assigned', assignedAt: now },
    { returnDocument: 'after' }
  );
  return updated || ticket;
}

async function createTicket({ client, customerName, customerEmail, language, subject, priority = 'normal', message, source }) {
  const now = new Date();
  const number = await nextTicketNumber(client._id);
  const ticket = await Ticket.create({
    client: client._id,
    number,
    customerName,
    customerEmail: customerEmail || '',
    language,
    subject,
    priority,
    source,
    messages: message ? [{ from: 'customer', authorName: customerName, body: message, at: now }] : [],
    firstResponseDueAt: firstResponseDue(now, client.slaMinutes || 15, priority),
  });
  return routeTicket(ticket, now);
}

// Sweep all queued tickets (oldest first). Called on an interval and after hires.
async function routeQueued(now = new Date()) {
  const queued = await Ticket.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(500);
  let assigned = 0;
  for (const t of queued) {
    const r = await routeTicket(t, now);
    if (r.status !== 'queued') assigned++;
  }
  return assigned;
}

const present = (t) => {
  const o = t.toObject ? t.toObject() : t;
  return { ...o, sla: slaState(o) };
};

module.exports = { routeTicket, createTicket, routeQueued, present, OPEN };
