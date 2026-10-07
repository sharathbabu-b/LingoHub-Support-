const test = require('node:test');
const assert = require('node:assert/strict');
const { hubSchema } = require('../src/routes/hubs');

const baseHub = {
  name: 'Global support',
  industry: 'Software',
  companySize: '11-50',
  country: 'Sweden',
  website: 'https://example.com',
  supportContext: 'SaaS billing and onboarding.',
  languages: [{ code: 'en', minLevel: 'C1' }],
  skills: ['billing'],
  requiredSkills: ['billing'],
  channels: ['email', 'chat'],
  tier: 'tier1',
  ticketVolume: 80,
  timezone: 'UTC',
  grid: [{ day: 0, hour: 9 }],
  maxRate: 40,
  requires24x7: false,
  status: 'active',
};

test('active Hub validates company and support requirement fields', () => {
  assert.deepEqual(hubSchema.parse(baseHub), baseHub);
});

test('active Hub requires a language and at least one coverage hour', () => {
  assert.equal(hubSchema.safeParse({ ...baseHub, languages: [] }).success, false);
  assert.equal(hubSchema.safeParse({ ...baseHub, grid: [] }).success, false);
});

test('24/7 Hub requires every hour and rejects duplicate schedule cells', () => {
  const fullWeek = Array.from({ length: 168 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24 }));
  assert.equal(hubSchema.safeParse({ ...baseHub, requires24x7: true, grid: fullWeek }).success, true);
  assert.equal(hubSchema.safeParse({ ...baseHub, requires24x7: true }).success, false);
  assert.equal(hubSchema.safeParse({ ...baseHub, grid: [baseHub.grid[0], baseHub.grid[0]] }).success, false);
});