const { z } = require('zod');
const config = require('../config');
const { LANGUAGES, LEVELS, LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');
const { isValidTimezone } = require('../lib/slots');
const { SKILLS, CHANNELS, TIERS } = require('../lib/capabilities');

const slotSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
});

const extractedRequirementSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  languages: z.array(z.object({ code: z.enum(LANGUAGE_CODES), minLevel: z.enum(LEVEL_CODES) }).strict()).max(12),
  skills: z.array(z.enum(SKILLS)).max(SKILLS.length),
  channels: z.array(z.enum(CHANNELS)).min(1).max(CHANNELS.length),
  tier: z.enum(TIERS),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
  grid: z.array(slotSchema.strict()).max(168),
  requires24x7: z.boolean(),
  maxRate: z.number().min(1).max(1000).nullable(),
  assumptions: z.array(z.string().trim().min(1).max(180)).max(6),
  questions: z.array(z.string().trim().min(1).max(180)).max(5),
}).strict()
  .refine((draft) => new Set(draft.grid.map((cell) => `${cell.day}:${cell.hour}`)).size === draft.grid.length, 'Duplicate schedule hour')
  .refine((draft) => !draft.requires24x7 || draft.grid.length === 168, '24/7 draft must include every weekly hour');

const serviceError = (message, status = 503) => Object.assign(new Error(message), { status });

async function parseWithOpenAI(requirement) {
  if (!config.openAiApiKey) {
    throw serviceError('AI is not configured yet. Add OPENAI_API_KEY to the server environment, then restart the API.');
  }

  const languageOptions = LANGUAGES.map((language) => `${language.code}=${language.name}`).join(', ');
  const levelOptions = LEVELS.map((level) => `${level.code}=${level.label}`).join(', ');
  const system = [
    'Extract a draft support requirement from the user text. Return JSON only with keys: summary, languages, skills, channels, tier, timezone, grid, requires24x7, maxRate, assumptions, questions.',
    'languages is an array of {code,minLevel}; use only these language codes: ' + languageOptions,
    'Use only these minimum levels: ' + levelOptions,
    'Use only these skills: ' + SKILLS.join(', '),
    'Use only these channels: ' + CHANNELS.join(', ') + '. Use only these support tiers: ' + TIERS.join(', '),
    'timezone must be a valid IANA timezone. If omitted or ambiguous, use UTC and mention the assumption or ask a question.',
    'grid is an array of {day,hour} local weekly hours, with Monday=0 through Sunday=6 and hour 0-23. Include only explicitly requested coverage; leave empty if unclear.',
    'requires24x7 is true only when the user explicitly asks for continuous 24/7 coverage; when true, grid must include all 168 weekly hours.',
    'When support channels are unspecified, return email and chat and mention that as an assumption. When tier is unspecified, default to tier1 and mention that as an assumption.',
    'maxRate is a numeric USD agent hourly-rate ceiling, or null when not stated.',
    'Do not invent requirements. Put uncertain details in questions and defaults in assumptions. Do not choose agents, rank candidates, or make eligibility decisions.',
  ].join('\n');

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: config.openAiModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: requirement },
        ],
      }),
    });
  } catch {
    throw serviceError('The AI service could not be reached. Please try again.', 503);
  }

  if (!response.ok) throw serviceError('The AI service could not create a draft. Please try again.', 502);
  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw serviceError('The AI service returned an unreadable draft. Please try again.', 502);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw serviceError('The AI service returned an invalid draft. Please try again.', 502);
  }

  const result = extractedRequirementSchema.safeParse(parsed);
  if (!result.success) throw serviceError('The AI draft did not pass validation. Please edit your requirement and try again.', 502);
  return result.data;
}

const providers = { openai: parseWithOpenAI };

async function parseRequirement(requirement) {
  const provider = providers[config.aiProvider];
  if (!provider) throw serviceError(`AI provider "${config.aiProvider}" is not supported.`);
  return provider(requirement);
}

module.exports = { extractedRequirementSchema, parseRequirement };