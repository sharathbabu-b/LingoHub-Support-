// Ticket routing: language-matched, on-shift, least-loaded.
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_TICKETS || 5);

/**
 * engagements: [{ agentId, slots:[] }] active for this client + ticket language
 * loads: { [agentId]: openTicketCount }
 * nowSlot: current UTC half-hour slot index
 * Returns agentId or null (ticket stays queued).
 */
function pickAgent(engagements, loads, nowSlot, cap = MAX_CONCURRENT) {
  let best = null;
  for (const e of engagements) {
    if (!e.slots.includes(nowSlot)) continue; // not on shift right now
    const load = loads[e.agentId] || 0;
    if (load >= cap) continue;
    if (!best || load < best.load) best = { agentId: e.agentId, load };
  }
  return best ? best.agentId : null;
}

const SLA_DEFAULT_MIN = 15;
const PRIORITY_SLA_FACTOR = { urgent: 0.5, high: 0.75, normal: 1, low: 2 };

function firstResponseDue(createdAt, slaMinutes, priority = 'normal') {
  const factor = PRIORITY_SLA_FACTOR[priority] || 1;
  return new Date(createdAt.getTime() + Math.round(slaMinutes * factor) * 60000);
}

// 'ok' | 'at_risk' (<25% of window left) | 'breached' | 'met'
function slaState(ticket, now = new Date()) {
  const due = ticket.firstResponseDueAt && new Date(ticket.firstResponseDueAt);
  if (!due) return 'ok';
  if (ticket.firstResponseAt) return new Date(ticket.firstResponseAt) <= due ? 'met' : 'breached';
  if (now > due) return 'breached';
  const total = due - new Date(ticket.createdAt);
  return due - now < total * 0.25 ? 'at_risk' : 'ok';
}

module.exports = { pickAgent, firstResponseDue, slaState, MAX_CONCURRENT, SLA_DEFAULT_MIN };
