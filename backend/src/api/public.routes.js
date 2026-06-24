const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { validate, z } = require('../middleware/validate');
const { publicFormLimiter } = require('../middleware/rateLimit');
const { sanitizeForModel } = require('../utils/sanitize');
const leadsModel = require('../models/leads.model');

const router = express.Router();

// Public "get started" form. Unauthenticated, so it is tightly rate limited,
// validated, and spam-guarded with a honeypot. Never trust anything here.
const leadSchema = z.object({
  business_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  // Honeypot: a hidden field real users never fill. Bots that fill every input
  // get a 201 but are silently dropped (so they don't detect the filter).
  company_website: z.string().max(255).optional(),
});

router.post(
  '/leads',
  publicFormLimiter,
  validate({ body: leadSchema }),
  asyncHandler(async (req, res) => {
    if (req.body.company_website) {
      return res.status(201).json({ ok: true });
    }

    await leadsModel.create({
      businessName: req.body.business_name,
      email: req.body.email,
      phone: req.body.phone || null,
      planInterest: req.body.plan || null,
      message: req.body.message ? sanitizeForModel(req.body.message, 2000) : null,
      source: 'landing',
      ip: req.ip || null,
      userAgent: req.get('user-agent') || null,
    });

    return res.status(201).json({ ok: true });
  })
);

module.exports = router;
