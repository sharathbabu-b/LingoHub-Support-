const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { extractedRequirementSchema, parseRequirement } = require('../src/services/aiService');

const validDraft = {
  summary: 'Japanese and English support on weekday evenings.',
  languages: [
    { code: 'ja', minLevel: 'native' },
    { code: 'en', minLevel: 'C1' },
  ],
  skills: ['billing'],
  channels: ['email', 'chat'],
  tier: 'tier1',
  timezone: 'UTC',
  grid: [{ day: 0, hour: 18 }, { day: 0, hour: 19 }],
  requires24x7: false,
  maxRate: null,
  assumptions: [],
  questions: [],
};

test('AI requirement output validates supported editable fields', () => {
  assert.deepEqual(extractedRequirementSchema.parse(validDraft), validDraft);
});

test('AI requirement output rejects unsupported languages and invalid schedules', () => {
  const invalid = {
    ...validDraft,
    languages: [{ code: 'xx', minLevel: 'C1' }],
    timezone: 'Mars/Olympus',
    grid: [{ day: 7, hour: 24 }],
  };
  assert.equal(extractedRequirementSchema.safeParse(invalid).success, false);
});

test('AI requirement output requires a complete, unique schedule for 24/7 coverage', () => {
  const fullWeek = Array.from({ length: 168 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24 }));
  assert.equal(extractedRequirementSchema.safeParse({ ...validDraft, grid: fullWeek, requires24x7: true }).success, true);
  assert.equal(extractedRequirementSchema.safeParse({ ...validDraft, requires24x7: true }).success, false);
  assert.equal(extractedRequirementSchema.safeParse({ ...validDraft, grid: [validDraft.grid[0], validDraft.grid[0]] }).success, false);
});

test('AI requirement parsing reports missing provider configuration without a network call', async () => {
  const previousKey = config.openAiApiKey;
  const previousProvider = config.aiProvider;
  config.openAiApiKey = '';
  config.aiProvider = 'openai';
  try {
    await assert.rejects(parseRequirement('Japanese and English weekday support'), /AI is not configured yet/);
  } finally {
    config.openAiApiKey = previousKey;
    config.aiProvider = previousProvider;
  }
});