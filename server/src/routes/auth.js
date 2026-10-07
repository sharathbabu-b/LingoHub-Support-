const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { z } = require('zod');
const { User, AgentProfile, Plan, SupportHub, Invitation, Engagement, Ticket, Counter, newApiKey } = require('../models');
const { signToken, wrap, auth, validate } = require('../middleware');
const { LANGUAGES, LEVELS } = require('../lib/meta');
const { passwordSchema, containsEmailName } = require('../lib/password');

const BCRYPT_COST = 12;
// Compared against when the email is unknown, so "no such user" costs the same time as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', BCRYPT_COST);

const limiterBase = { standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait and try again.' } };
// Per IP + email: slows targeted guessing of one account. Successful logins don't count.
const loginLimiter = rateLimit({
  ...limiterBase,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String((req.body && req.body.email) || '').toLowerCase().slice(0, 254)}`,
});
const registerLimiter = rateLimit({ ...limiterBase, windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => ipKeyGenerator(req.ip) });
const sensitiveLimiter = rateLimit({ ...limiterBase, windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (req) => ipKeyGenerator(req.ip) });

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: passwordSchema,
  role: z.enum(['client', 'agent']),
  company: z.string().trim().max(120).optional(),
  acceptPrivacy: z.literal(true, 'You must accept the Privacy Notice to create an account'),
});

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, company: u.company });

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  wrap(async (req, res) => {
    const { name, email, password, role, company } = req.body;
    if (role === 'client' && !company) return res.status(400).json({ error: 'company: required for client accounts' });
    if (password.toLowerCase() === email || containsEmailName(password, email)) {
      return res.status(400).json({ error: 'Your password must not contain your email address' });
    }
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists' });
    const user = await User.create({
      name,
      email,
      role,
      company: role === 'client' ? company : undefined,
      apiKey: role === 'client' ? newApiKey() : undefined,
      privacyAcceptedAt: new Date(),
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
    });
    if (role === 'agent') await AgentProfile.create({ user: user._id });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  loginLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) })),
  wrap(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    // Always run bcrypt, whether or not the user exists.
    const ok = await bcrypt.compare(req.body.password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Incorrect email or password' });
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));

router.get('/meta', (req, res) => {
  const timezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
  res.json({ languages: LANGUAGES, levels: LEVELS, timezones: ['UTC', ...timezones.filter((t) => t !== 'UTC')] });
});

// ---- session & password management ----

router.post(
  '/change-password',
  sensitiveLimiter,
  auth(),
  validate(z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema })),
  wrap(async (req, res) => {
    if (!(await bcrypt.compare(req.body.currentPassword, req.user.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect' });
    if (req.body.newPassword === req.body.currentPassword) return res.status(400).json({ error: 'Choose a password you have not used before' });
    if (containsEmailName(req.body.newPassword, req.user.email)) return res.status(400).json({ error: 'Your password must not contain your email address' });
    req.user.passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_COST);
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1; // signs out every other session
    await req.user.save();
    res.json({ token: signToken(req.user) });
  })
);

router.post(
  '/logout-all',
  auth(),
  wrap(async (req, res) => {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save();
    res.json({ ok: true });
  })
);

// ---- GDPR: right of access / portability (Art. 15, 20) ----
router.get(
  '/export',
  sensitiveLimiter,
  auth(),
  wrap(async (req, res) => {
    const u = req.user;
    const out = {
      exportedAt: new Date().toISOString(),
      account: { id: u._id, name: u.name, email: u.email, role: u.role, company: u.company, industry: u.industry, companySize: u.companySize, country: u.country, website: u.website, supportContext: u.supportContext, slaMinutes: u.slaMinutes, privacyAcceptedAt: u.privacyAcceptedAt, createdAt: u.createdAt },
    };
    if (u.role === 'agent') {
      out.profile = await AgentProfile.findOne({ user: u._id }).select('-_id -__v').lean();
      out.engagements = await Engagement.find({ agent: u._id }).select('-__v').lean();
      out.invitations = await Invitation.find({ agent: u._id }).select('-__v').lean();
      out.tickets = await Ticket.find({ agent: u._id }).select('-__v').lean();
    } else if (u.role === 'client') {
      out.coveragePlan = await Plan.findOne({ client: u._id }).select('-__v').lean();
      out.supportHubs = await SupportHub.find({ client: u._id }).select('-__v').lean();
      out.invitations = await Invitation.find({ client: u._id }).select('-__v').lean();
      out.engagements = await Engagement.find({ client: u._id }).select('-__v').lean();
      out.tickets = await Ticket.find({ client: u._id }).select('-__v').lean();
    }
    res.setHeader('Content-Disposition', 'attachment; filename="lingohub-data-export.json"');
    res.json(out);
  })
);

// ---- GDPR: right to erasure (Art. 17) ----
router.delete(
  '/me',
  sensitiveLimiter,
  auth(),
  validate(z.object({ password: z.string().min(1).max(200) })),
  wrap(async (req, res) => {
    const u = req.user;
    if (u.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be deleted from the app' });
    if (!(await bcrypt.compare(req.body.password, u.passwordHash))) return res.status(401).json({ error: 'Password is incorrect' });

    if (u.role === 'agent') {
      await Engagement.updateMany({ agent: u._id, status: 'active' }, { status: 'ended', endedAt: new Date() });
      // Remove the agent's name from conversations, put their open tickets back in the queue, detach the rest.
      await Ticket.updateMany({ agent: u._id }, { $set: { 'messages.$[m].authorName': 'Former agent' } }, { arrayFilters: [{ 'm.from': 'agent' }] });
      await Ticket.updateMany({ agent: u._id, status: { $in: ['assigned', 'in_progress'] } }, { $set: { status: 'queued', assignedAt: null } });
      await Ticket.updateMany({ agent: u._id }, { $set: { agent: null } });
      await Promise.all([AgentProfile.deleteOne({ user: u._id }), Invitation.deleteMany({ agent: u._id })]);
    } else {
      // A client's tickets contain their customers' personal data, so they are erased with the account.
      await Promise.all([
        Ticket.deleteMany({ client: u._id }),
        Plan.deleteOne({ client: u._id }),
        SupportHub.deleteMany({ client: u._id }),
        Invitation.deleteMany({ client: u._id }),
        Engagement.deleteMany({ client: u._id }),
        Counter.deleteOne({ _id: `ticket:${u._id}` }),
      ]);
    }
    await User.deleteOne({ _id: u._id });
    res.json({ ok: true });
  })
);

module.exports = router;
