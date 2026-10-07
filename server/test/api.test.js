// End-to-end API test. Needs a real MongoDB; skipped unless TEST_MONGO_URI is set.
//   TEST_MONGO_URI=mongodb://127.0.0.1:27017/lingohub_test npm test
// WARNING: the target database is dropped at the start of the run.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, newApiKey } = require('../src/models');

const URI = process.env.TEST_MONGO_URI;
const TEST_PASSWORD = 'LingoHub-Test-2026';

test('full flow: agent -> verify -> match -> hire -> ticket -> reply -> resolve -> rate', { skip: !URI && 'set TEST_MONGO_URI to run' }, async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../src/app');
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  await User.create([
    { name: 'Test Admin', email: 'admin@test.invalid', role: 'admin', passwordHash },
    { name: 'Test Client', email: 'client@test.invalid', role: 'client', company: 'Test Company', apiKey: newApiKey(), passwordHash },
  ]);

  const server = createApp().listen(0);
  t.after(async () => {
    server.close();
    await mongoose.disconnect();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const login = async (email) => (await call('/auth/login', { method: 'POST', body: { email, password: TEST_PASSWORD } })).data;

  const allWeek = [];
  for (let day = 0; day < 7; day++) for (let hour = 0; hour < 24; hour++) allWeek.push({ day, hour });

  // auth basics
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'missing-user@test.invalid', password: 'wrong' } })).status, 401);
  assert.equal((await call('/client/plan')).status, 401);

  // new Swedish agent registers, sets 24/7 availability, is unverified at first
  const reg = await call('/auth/register', { method: 'POST', body: { name: 'Elin Berg', email: 'elin@test.dev', password: 'LingoHub-Demo-2026', role: 'agent', acceptPrivacy: true } });
  assert.equal(reg.status, 201);
  const agentToken = reg.data.token;
  assert.equal((await call('/client/hubs', { token: agentToken })).status, 403);
  assert.equal((await call('/admin/stats', { token: agentToken })).status, 403);
  assert.equal((await call('/agent/invitations', { token: agentToken })).status, 200);
  const prof = await call('/agent/profile', {
    method: 'PUT',
    token: agentToken,
    body: { headline: 'Swedish support', bio: '', skills: ['billing'], experienceYears: 3, channels: ['email', 'chat'], tiers: ['tier1'], timezone: 'UTC', hourlyRate: 9, languages: [{ code: 'sv', level: 'native' }], grid: allWeek },
  });
  assert.equal(prof.status, 200);
  assert.equal(prof.data.weeklyHoursAvailable, 168);

  const clientAuth = await login('client@test.invalid');
  assert.equal((await call('/agent/profile', { token: clientAuth.token })).status, 403);
  assert.equal((await call('/agent/invitations', { token: clientAuth.token })).status, 403);
  assert.equal((await call('/admin/stats', { token: clientAuth.token })).status, 403);
  const plan = { timezone: 'UTC', grid: allWeek, languages: [{ code: 'sv', minLevel: 'C1' }], maxRate: null };
  const hubBody = {
    name: 'Swedish customer care',
    industry: 'Software',
    companySize: '11-50',
    country: 'Sweden',
    website: 'https://lingohub.dev',
    supportContext: 'SaaS billing and customer onboarding.',
    languages: [{ code: 'sv', minLevel: 'C1' }],
    skills: ['billing'],
    requiredSkills: ['billing'],
    channels: ['email', 'chat'],
    tier: 'tier1',
    ticketVolume: 120,
    timezone: 'UTC',
    grid: allWeek,
    maxRate: null,
    requires24x7: true,
    status: 'active',
  };
  const hubResponse = await call('/client/hubs', { method: 'POST', token: clientAuth.token, body: hubBody });
  assert.equal(hubResponse.status, 201);
  const hubId = hubResponse.data.id;

  let m = await call('/client/match', { method: 'POST', token: clientAuth.token, body: plan });
  assert.equal(m.data.results[0].team.length, 0, 'unverified agents must not be matched');

  // admin verifies
  const admin = await login('admin@test.invalid');
  assert.equal((await call('/client/hubs', { token: admin.token })).status, 403);
  assert.equal((await call('/agent/profile', { token: admin.token })).status, 403);
  assert.equal((await call('/client/match', { method: 'POST', token: admin.token, body: plan })).status, 403);
  assert.equal((await call(`/admin/agents/${reg.data.user.id}/verify`, { method: 'POST', token: admin.token, body: { verified: true } })).status, 200);

  m = await call('/client/match', { method: 'POST', token: clientAuth.token, body: plan });
  const r = m.data.results[0];
  assert.equal(r.coveragePct, 100);
  assert.equal(r.team.length, 1);
  assert.equal(r.team[0].assignedHours, 168);
  assert.equal(r.team[0].clientRate, 10.35); // 9 * 1.15
  const hubMatch = await call(`/client/hubs/${hubId}/match`, { method: 'POST', token: clientAuth.token });
  assert.equal(hubMatch.status, 200);
  assert.deepEqual(hubMatch.data.results[0].team[0].scoreBreakdown, { language: 100, availability: 100, skills: 100, experience: 60, timezone: 100 });

  // Invite; active hours are committed only after the agent accepts.
  const invite = await call(`/client/hubs/${hubId}/invitations`, { method: 'POST', token: clientAuth.token, body: { agentId: r.team[0].agentId, language: 'sv', slots: r.team[0].assignedSlots } });
  assert.equal(invite.status, 201);
  assert.equal(invite.data.status, 'pending');
  assert.equal((await call('/agent/invitations', { token: agentToken })).data[0].status, 'pending');
  const accepted = await call(`/agent/invitations/${invite.data.id}/accept`, { method: 'POST', token: agentToken });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.status, 'accepted');
  assert.equal((await call(`/client/hubs/${hubId}/invitations`, { token: clientAuth.token })).data[0].status, 'accepted');
  const c2 = await call('/auth/register', { method: 'POST', body: { name: 'Other', email: 'c2@test.dev', password: TEST_PASSWORD, role: 'client', company: 'Other Co', acceptPrivacy: true } });
  const directHire = await call('/client/hire', { method: 'POST', token: c2.data.token, body: { assignments: [{ agentId: r.team[0].agentId, language: 'sv', slots: r.team[0].assignedSlots }] } });
  assert.equal(directHire.status, 410, 'engagements must require an accepted invitation');

  // agent can't shrink committed hours
  const shrink = await call('/agent/profile', { method: 'PUT', token: agentToken, body: { headline: '', bio: '', timezone: 'UTC', hourlyRate: 9, languages: [{ code: 'sv', level: 'native' }], grid: [] } });
  assert.equal(shrink.status, 409);

  // ticket in Swedish is routed immediately (agent is on shift 24/7)
  const created = await call('/tickets', { method: 'POST', token: clientAuth.token, body: { customerName: 'Anna', language: 'sv', subject: 'Faktura saknas', message: 'Jag har inte fått min faktura.' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'assigned');
  const id = created.data._id;

  // a language with no coverage stays queued
  const queued = await call('/tickets', { method: 'POST', token: clientAuth.token, body: { customerName: 'Pierre', language: 'fr', subject: 'Bonjour', message: 'Aide' } });
  assert.equal(queued.data.status, 'queued');

  // isolation: other client cannot see it
  assert.equal((await call(`/tickets/${id}`, { token: c2.data.token })).status, 404);

  // agent replies -> first response recorded, SLA met
  const reply = await call(`/tickets/${id}/messages`, { method: 'POST', token: agentToken, body: { body: 'Hej Anna! Jag skickar den nu.' } });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.status, 'in_progress');
  assert.equal(reply.data.sla, 'met');

  // resolve + rate
  assert.equal((await call(`/tickets/${id}/resolve`, { method: 'POST', token: agentToken })).data.status, 'resolved');
  assert.equal((await call(`/tickets/${id}/rate`, { method: 'POST', token: clientAuth.token, body: { csat: 5 } })).status, 200);
  assert.equal((await call(`/tickets/${id}/rate`, { method: 'POST', token: clientAuth.token, body: { csat: 4 } })).status, 409);
  assert.equal((await call('/agent/profile', { token: agentToken })).data.rating, 5);

  // public intake API
  const { apiKey } = (await call('/client/settings', { token: clientAuth.token })).data;
  assert.equal((await call('/v1/tickets', { method: 'POST', body: {} })).status, 401);
  const viaApi = await call('/v1/tickets', { method: 'POST', headers: { 'x-api-key': apiKey }, body: { customerName: 'Bo', language: 'sv', subject: 'Hej', message: 'Fråga' } });
  assert.equal(viaApi.status, 201);
  assert.equal(viaApi.data.assigned, true);
  const got = await call(`/v1/tickets/${viaApi.data.number}`, { headers: { 'x-api-key': apiKey } });
  assert.equal(got.data.messages.length, 1);

  // billing
  const bill = (await call('/client/billing', { token: clientAuth.token })).data;
  assert.equal(bill.weeklyTotal, 1738.8); // 168h * 10.35
});
