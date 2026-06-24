const rateLimit = require('express-rate-limit');
const config = require('../config');

const skip = () => config.env === 'test';
const common = { standardHeaders: 'draft-7', legacyHeaders: false, skip };

// Brute-force guard: 10 attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const apiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 300,
  message: { error: 'Too many requests. Slow down.' },
});

const webhookLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 600,
  message: { error: 'Too many requests.' },
});

// Public unauthenticated forms (lead capture): strict, to blunt spam/abuse.
const publicFormLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many submissions. Please try again later.' },
});

module.exports = { loginLimiter, apiLimiter, webhookLimiter, publicFormLimiter };
