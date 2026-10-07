const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const { wrap, auth, validate } = require('../middleware');
const { parseRequirement } = require('../services/aiService');

router.use(auth('client'));

const parseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI drafts. Please wait and try again.' },
});

router.post(
  '/parse-requirement',
  parseLimiter,
  validate(z.object({ requirement: z.string().trim().min(12).max(2000) })),
  wrap(async (req, res) => {
    res.json(await parseRequirement(req.body.requirement));
  })
);

module.exports = router;