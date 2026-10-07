require('dotenv').config();
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;

if (isProd) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters in production'
    );
  }
} else if (!jwtSecret) {
  // Development only: generate a temporary secret.
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    'JWT_SECRET not set: using a random per-process secret. Everyone is signed out on restart.'
  );
}

const tp = process.env.TRUST_PROXY;

const trustProxy =
  tp === undefined ||
  tp === '' ||
  tp === 'false'
    ? false
    : /^\d+$/.test(tp)
      ? Number(tp)
      : tp === 'true'
        ? 1
        : false;

module.exports = {
  isProd,
  port: Number(process.env.PORT || 4000),

  mongoUri: process.env.MONGO_URI,

  aiProvider: process.env.AI_PROVIDER || 'openai',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  jwtSecret,
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  jwtIssuer: 'lingohub',
  jwtAudience: 'lingohub-web',

  trustProxy,

  clientOrigin:
    process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  platformFee: Number(process.env.PLATFORM_FEE || 0.15),

  routingIntervalMs:
    Number(process.env.ROUTING_INTERVAL_MS || 20000),
};