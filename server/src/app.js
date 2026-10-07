const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { errorHandler } = require('./middleware');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"], // no inline scripts: the main XSS mitigation, since the JWT lives in browser storage
          styleSrc: ["'self'"],
          styleSrcAttr: ["'unsafe-inline'"], // React inline style={{}} attributes only
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null, // set at your TLS terminator; forcing it here breaks plain-http installs
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );
  app.use(cors({ origin: config.clientOrigin === '*' ? true : config.clientOrigin.split(',') }));
  app.use(express.json({ limit: '200kb' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'API request limit reached. Please wait and try again.' } });
  const intakeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Rate limit exceeded' } });
  // Keep API responses (tokens, personal data) out of shared caches.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authLimiter, require('./routes/auth'));
  app.use('/api/ai', require('./routes/ai'));
  app.use('/api/hubs', require('./routes/hubs').router);
  app.use('/api/agent', require('./routes/agent'));
  app.use('/api/client', require('./routes/client'));
  app.use('/api/tickets', require('./routes/tickets'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/v1', intakeLimiter, require('./routes/intake'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app in production (single-process deploy).
  const dist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    // SPA fallback (Express 5 no longer accepts the '*' path pattern).
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
