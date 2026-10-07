const jwt = require('jsonwebtoken');
const config = require('./config');
const { User } = require('./models');

const VERIFY_OPTS = { algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience };

// `tv` = the user's tokenVersion at issue time. Bumping tokenVersion (password change, "sign out everywhere",
// account deletion) invalidates every token issued before it.
const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, tv: user.tokenVersion || 0 }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpires,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });

// Wrap async route handlers so rejections reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function auth(...roles) {
  return wrap(async (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, VERIFY_OPTS);
    } catch {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }
    const user = await User.findById(payload.sub);
    // The role is always taken from the database, never trusted from the token.
    if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) return res.status(401).json({ error: 'Session expired, please sign in again' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Not allowed for your role' });
    req.user = user;
    next();
  });
}

// Validate req.body (or other source) with a zod schema.
const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    return res.status(400).json({ error: msg });
  }
  req[source] = r.data;
  next();
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already in use' });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
}

module.exports = { signToken, wrap, auth, validate, errorHandler };
