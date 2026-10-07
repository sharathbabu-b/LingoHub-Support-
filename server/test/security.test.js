// Security tests that need no database (they exercise paths that reject before any query runs).
process.env.JWT_SECRET = 'a-test-secret-that-is-long-enough-0123456789';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { passwordSchema, containsEmailName } = require('../src/lib/password');

const SECRET = process.env.JWT_SECRET;
let server;
let base;
test.before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (p, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => ({})) };
};
const claims = { sub: '64b000000000000000000001', role: 'admin', tv: 0 };
const good = { algorithm: 'HS256', issuer: 'lingohub', audience: 'lingohub-web' };

test('JWT: forged "alg: none" token is rejected', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, iss: 'lingohub', aud: 'lingohub-web' })}.`;
  assert.equal((await call('/api/auth/me', { token: forged })).status, 401);
});

test('JWT: wrong secret, expired, wrong audience/issuer, wrong algorithm are all rejected', async () => {
  const bad = [
    jwt.sign(claims, 'some-other-secret-some-other-secret-1', good),
    jwt.sign(claims, SECRET, { ...good, expiresIn: -10 }),
    jwt.sign(claims, SECRET, { ...good, audience: 'someone-else' }),
    jwt.sign(claims, SECRET, { ...good, issuer: 'evil' }),
    jwt.sign(claims, SECRET, { ...good, algorithm: 'HS512' }),
  ];
  for (const token of bad) assert.equal((await call('/api/auth/me', { token })).status, 401);
  assert.equal((await call('/api/auth/me')).status, 401);
  assert.equal((await call('/api/auth/me', { token: 'not-a-jwt' })).status, 401);
});

test('headers: CSP forbids inline scripts, no x-powered-by, API responses are not cacheable', async () => {
  const r = await call('/api/health');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('register: consent, password policy and role are enforced server-side', async () => {
  const ok = { name: 'Test User', email: 'tu@example.com', password: 'a-Good-Passphrase-42', role: 'client', company: 'Acme', acceptPrivacy: true };
  const cases = [
    [{ ...ok, acceptPrivacy: undefined }, /Privacy Notice/],
    [{ ...ok, acceptPrivacy: false }, /Privacy Notice/],
    [{ ...ok, password: 'short' }, /at least 10/],
    [{ ...ok, password: 'password123' }, /too common/],
    [{ ...ok, password: 'aaaaaaaaaaaa' }, /varied/],
    [{ ...ok, password: 'x'.repeat(80) }, /at most 72/],
    [{ ...ok, password: 'é'.repeat(40) }, /at most 72/], // 80 bytes, only 40 characters
    [{ ...ok, role: 'admin' }, /role/],
    [{ ...ok, email: 'nope' }, /valid email/],
  ];
  for (const [body, re] of cases) {
    const r = await call('/api/auth/register', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, re);
  }
});

test('login: attempts are throttled per IP+email, other emails unaffected', async () => {
  const attempt = (email) => call('/api/auth/login', { method: 'POST', body: { email, password: '' } }); // fails validation: no DB needed
  for (let i = 0; i < 10; i++) assert.equal((await attempt('victim@example.com')).status, 400);
  assert.equal((await attempt('victim@example.com')).status, 429);
  assert.equal((await attempt('VICTIM@example.com')).status, 429, 'case variants share the same bucket');
  assert.equal((await attempt('someone-else@example.com')).status, 400);
});

test('protected endpoints demand authentication', async () => {
  for (const [m, p] of [['GET', '/api/auth/export'], ['DELETE', '/api/auth/me'], ['POST', '/api/auth/change-password'], ['POST', '/api/auth/logout-all'], ['GET', '/api/admin/stats'], ['GET', '/api/client/billing'], ['GET', '/api/agent/profile'], ['GET', '/api/tickets']]) {
    assert.equal((await call(p, { method: m })).status, 401, `${m} ${p}`);
  }
});

test('general API request limit returns a standard 429 response', async () => {
  let limited = null;
  for (let attempt = 0; attempt < 310 && !limited; attempt++) {
    const response = await call('/api/health');
    if (response.status === 429) limited = response;
  }
  assert.ok(limited, 'request above the API limit should be rejected');
  assert.match(limited.data.error, /request limit/i);
  assert.ok(limited.headers.get('ratelimit-limit'));
});

test('password policy unit checks', () => {
  assert.ok(passwordSchema.safeParse('correct horse battery').success);
  assert.ok(!passwordSchema.safeParse('Password123').success, 'common password rejected case-insensitively');
  assert.ok(!passwordSchema.safeParse('PASSWORD123').success);
  assert.ok(containsEmailName('sanjaysharath-1', 'sanjay@x.com'));
  assert.ok(!containsEmailName('abc-anything-here', 'a@x.com'), 'short email names are not matched');
});

test('production refuses to start without a strong JWT_SECRET', () => {
  const cfg = path.join(__dirname, '../src/config.js');
  const run = (env) => {
    try {
      execFileSync(process.execPath, ['-e', `require(${JSON.stringify(cfg)})`], { env: { PATH: process.env.PATH, ...env }, stdio: 'pipe' });
      return 'started';
    } catch (e) {
      return String(e.stderr);
    }
  };
  assert.match(run({ NODE_ENV: 'production' }), /JWT_SECRET must be set/);
  assert.match(run({ NODE_ENV: 'production', JWT_SECRET: 'too-short' }), /at least 32/);
  assert.equal(run({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }), 'started');
});
