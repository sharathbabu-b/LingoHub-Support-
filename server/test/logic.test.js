const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/lib/slots');
const { rankAgents, recommendTeam } = require('../src/lib/matching');
const { pickAgent, firstResponseDue, slaState } = require('../src/lib/routing');

const JAN = new Date('2026-01-15T12:00:00Z'); // no DST ambiguity for fixed-offset checks
const JUL = new Date('2026-07-15T12:00:00Z');

test('tz offsets', () => {
  assert.equal(S.tzOffsetMinutes('Asia/Kolkata', JAN), 330);
  assert.equal(S.tzOffsetMinutes('Europe/Berlin', JAN), 60);
  assert.equal(S.tzOffsetMinutes('Europe/Berlin', JUL), 120);
  assert.equal(S.tzOffsetMinutes('America/New_York', JAN), -300);
  assert.equal(S.tzOffsetMinutes('UTC', JAN), 0);
});

test('timezone validation', () => {
  assert.ok(S.isValidTimezone('Asia/Tokyo'));
  assert.ok(!S.isValidTimezone('Mars/Olympus'));
});

test('IST Monday 09:00-10:00 -> UTC Monday 03:30-04:30', () => {
  const slots = S.gridToUtcSlots([{ day: 0, hour: 9 }], 'Asia/Kolkata', JAN);
  // Monday 03:30 UTC = slot 7, 04:00 = 8
  assert.deepEqual(slots, [7, 8]);
});

test('grid -> slots -> grid round trip across zones', () => {
  for (const tz of ['Asia/Kolkata', 'Europe/Berlin', 'Asia/Tokyo', 'America/New_York', 'UTC']) {
    const grid = [];
    for (let d = 0; d < 5; d++) for (let h = 9; h < 17; h++) grid.push({ day: d, hour: h });
    const back = S.utcSlotsToGrid(S.gridToUtcSlots(grid, tz, JAN), tz, JAN);
    assert.deepEqual(back, grid, tz);
  }
});

test('week wraparound: Sunday 23:00 in Tokyo lands in Sunday UTC 14:00', () => {
  const slots = S.gridToUtcSlots([{ day: 6, hour: 23 }], 'Asia/Tokyo', JAN);
  assert.deepEqual(slots, [6 * 48 + 28, 6 * 48 + 29]);
  // Monday 03:00 Tokyo -> Sunday 18:00 UTC (wraps backward over the week boundary)
  const w = S.gridToUtcSlots([{ day: 0, hour: 3 }], 'Asia/Tokyo', JAN);
  assert.deepEqual(w, [6 * 48 + 36, 6 * 48 + 37]);
});

test('slotAt is Monday-based half-hour index', () => {
  assert.equal(S.slotAt(new Date('2026-01-12T00:00:00Z')), 0); // Monday
  assert.equal(S.slotAt(new Date('2026-01-12T00:30:00Z')), 1);
  assert.equal(S.slotAt(new Date('2026-01-18T23:59:00Z')), 335); // Sunday end
});

test('coverage heat counts overlapping agents and flags gaps', () => {
  const a = S.gridToUtcSlots([{ day: 0, hour: 10 }, { day: 0, hour: 11 }], 'UTC');
  const b = S.gridToUtcSlots([{ day: 0, hour: 11 }], 'UTC');
  const heat = S.coverageHeat([a, b], 'UTC');
  const at = (d, h) => heat.find((c) => c.day === d && c.hour === h).count;
  assert.equal(at(0, 10), 1);
  assert.equal(at(0, 11), 2);
  assert.equal(at(0, 12), 0);
});

// ---- matching ----
const mkAgent = (id, lang, level, rate, gridHours, extra = {}) => ({
  id, name: id, languages: [{ code: lang, level }], hourlyRate: rate, rating: null,
  freeSlots: S.gridToUtcSlots(gridHours.map((h) => ({ day: 0, hour: h })), 'UTC'), ...extra,
});
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test('rankAgents filters by language, level, rate and overlap', () => {
  const need = { language: 'de', minLevel: 'C1', slots: S.gridToUtcSlots(range(8, 16).map((h) => ({ day: 0, hour: h })), 'UTC'), maxRate: 20 };
  const agents = [
    mkAgent('good', 'de', 'native', 12, range(8, 16)),
    mkAgent('lowlevel', 'de', 'B2', 8, range(8, 16)),
    mkAgent('expensive', 'de', 'native', 30, range(8, 16)),
    mkAgent('wronglang', 'fr', 'native', 10, range(8, 16)),
    mkAgent('nooverlap', 'de', 'native', 10, range(20, 23)),
  ];
  const r = rankAgents(agents, need);
  assert.deepEqual(r.map((x) => x.agentId), ['good']);
  assert.equal(r[0].overlapPct, 100);
  assert.deepEqual(r[0].scoreBreakdown, { language: 100, availability: 100, skills: 100, experience: 0, timezone: 50 });
});

test('rankAgents applies PRD skill, channel and tier filters and explains the weighted score', () => {
  const hours = range(8, 10).map((hour) => ({ day: 0, hour }));
  const need = {
    language: 'de',
    minLevel: 'C1',
    slots: S.gridToUtcSlots(hours, 'UTC', JAN),
    maxRate: null,
    skills: ['billing', 'api-support'],
    requiredSkills: ['billing'],
    channels: ['email', 'chat'],
    tier: 'tier1',
    timezone: 'UTC',
    referenceDate: JAN,
  };
  const agents = [
    mkAgent('fit', 'de', 'C2', 12, [8, 9], { skills: ['billing'], experienceYears: 4, channels: ['email', 'chat'], tiers: ['tier1'], timezone: 'Europe/Paris' }),
    mkAgent('missing-skill', 'de', 'native', 12, [8, 9], { skills: [], channels: ['email', 'chat'], tiers: ['tier1'], timezone: 'UTC' }),
    mkAgent('missing-channel', 'de', 'native', 12, [8, 9], { skills: ['billing', 'api-support'], channels: ['email'], tiers: ['tier1'], timezone: 'UTC' }),
    mkAgent('wrong-tier', 'de', 'native', 12, [8, 9], { skills: ['billing', 'api-support'], channels: ['email', 'chat'], tiers: ['tier2'], timezone: 'UTC' }),
  ];

  const result = rankAgents(agents, need);
  assert.deepEqual(result.map((agent) => agent.agentId), ['fit']);
  assert.deepEqual(result[0].scoreBreakdown, { language: 90, availability: 100, skills: 50, experience: 80, timezone: 91.67 });
  assert.equal(result[0].score, 0.84);
  assert.equal(result[0].verified, true);
});

test('recommendTeam covers the window with minimal overlap and no double billing', () => {
  const need = { language: 'ja', minLevel: 'C1', slots: S.gridToUtcSlots(range(0, 24).map((h) => ({ day: 0, hour: h })), 'UTC'), maxRate: null };
  const agents = [
    mkAgent('a', 'ja', 'native', 10, range(0, 10)),
    mkAgent('b', 'ja', 'native', 10, range(8, 18)),
    mkAgent('c', 'ja', 'C1', 9, range(16, 24)),
  ];
  const ranked = rankAgents(agents, need);
  const rec = recommendTeam(ranked, need.slots);
  assert.equal(rec.coveragePct, 100);
  assert.equal(rec.gapSlots.length, 0);
  assert.equal(rec.weeklyHours, 24); // exactly the window, no overlap billed
  const all = rec.team.flatMap((t) => t.assignedSlots);
  assert.equal(new Set(all).size, all.length);
});

test('recommendTeam reports gaps when supply is short', () => {
  const need = { language: 'ko', minLevel: 'B2', slots: S.gridToUtcSlots(range(0, 24).map((h) => ({ day: 0, hour: h })), 'UTC') };
  const rec = recommendTeam(rankAgents([mkAgent('a', 'ko', 'native', 10, range(0, 6))], need), need.slots);
  assert.equal(rec.coveragePct, 25);
  assert.equal(rec.gapSlots.length, 36);
});

// ---- routing ----
test('pickAgent: on-shift, least loaded, respects cap', () => {
  const eng = [{ agentId: 'a', slots: [10, 11] }, { agentId: 'b', slots: [10] }, { agentId: 'c', slots: [50] }];
  assert.equal(pickAgent(eng, { a: 3, b: 1 }, 10), 'b');
  assert.equal(pickAgent(eng, { a: 5, b: 5 }, 10), null); // both at cap
  assert.equal(pickAgent(eng, {}, 11), 'a'); // only a on shift
  assert.equal(pickAgent(eng, {}, 99), null); // nobody on shift -> queued
});

test('SLA window shrinks with priority and states evolve', () => {
  const created = new Date('2026-01-15T10:00:00Z');
  assert.equal(firstResponseDue(created, 20, 'urgent').toISOString(), '2026-01-15T10:10:00.000Z');
  assert.equal(firstResponseDue(created, 20, 'low').toISOString(), '2026-01-15T10:40:00.000Z');
  const t = { createdAt: created, firstResponseDueAt: new Date('2026-01-15T10:20:00Z') };
  assert.equal(slaState(t, new Date('2026-01-15T10:05:00Z')), 'ok');
  assert.equal(slaState(t, new Date('2026-01-15T10:17:00Z')), 'at_risk');
  assert.equal(slaState(t, new Date('2026-01-15T10:21:00Z')), 'breached');
  assert.equal(slaState({ ...t, firstResponseAt: new Date('2026-01-15T10:10:00Z') }, new Date('2026-01-15T11:00:00Z')), 'met');
});
