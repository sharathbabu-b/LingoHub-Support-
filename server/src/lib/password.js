const { z } = require('zod');

// bcrypt only uses the first 72 BYTES of a password; longer input would be silently truncated.
const MAX_BYTES = 72;
const MIN_LEN = 10;

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd123', 'qwerty123456', 'qwertyuiop', '1234567890', '12345678910',
  '0123456789', 'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'administrator', 'changeme123', 'abc1234567',
  'qwerty12345', '1q2w3e4r5t', 'zaq12wsx3e', 'trustno1234', 'monkey12345', 'dragon12345', 'football123', 'baseball123',
  'superman123', 'princess123', 'sunshine123', 'whatever123', 'lingohub123',
]);

const passwordSchema = z
  .string()
  .min(MIN_LEN, `Use at least ${MIN_LEN} characters`)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= MAX_BYTES, `Use at most ${MAX_BYTES} bytes (about ${MAX_BYTES} characters)`)
  .refine((v) => !COMMON.has(v.toLowerCase()), 'That password is too common. Choose something less guessable')
  .refine((v) => new Set(v).size >= 4, 'Use a more varied password');

// Reject passwords that embed the account's email name (only when it is long enough to be meaningful).
function containsEmailName(password, email) {
  const local = String(email).toLowerCase().split('@')[0];
  return local.length >= 4 && password.toLowerCase().includes(local);
}

module.exports = { passwordSchema, containsEmailName, MIN_LEN, MAX_BYTES };
