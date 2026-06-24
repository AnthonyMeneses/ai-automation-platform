const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError, asyncHandler } = require('../utils/errors');
const { loginLimiter } = require('../middleware/rateLimit');
const { validate, z } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const adminUsers = require('../models/adminUsers.model');
const refreshTokens = require('../models/refreshTokens.model');
const { sha256, randomToken } = require('../utils/crypto');

const router = express.Router();

// Compared against when the email doesn't exist, so response timing doesn't
// reveal which addresses have accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', 10);

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(1024),
});

function signAccessToken(admin) {
  return jwt.sign(
    { email: admin.email, name: admin.name, type: 'access' },
    config.jwt.secret,
    {
      subject: String(admin.id),
      expiresIn: config.jwt.accessTtl,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
}

async function issueTokens(admin, req) {
  const accessToken = signAccessToken(admin);
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  const row = await refreshTokens.create({
    adminUserId: admin.id,
    tokenHash: sha256(refreshToken),
    expiresAt,
    ip: req.ip || null,
    userAgent: req.get('user-agent') || null,
  });
  return { accessToken, refreshToken, refreshTokenId: row.id, csrfToken: randomToken(24) };
}

function cookieOptions(extra = {}) {
  const sameSite = config.cookieSameSite;
  return {
    httpOnly: true,
    secure: config.env === 'production' || sameSite === 'none',
    sameSite,
    path: '/',
    ...extra,
  };
}

function setAuthCookies(res, tokens) {
  const refreshMaxAge = config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000;
  res.cookie('access_token', tokens.accessToken, cookieOptions({ maxAge: 15 * 60 * 1000 }));
  // Refresh token is only ever sent to /api/auth endpoints.
  res.cookie('refresh_token', tokens.refreshToken, cookieOptions({ maxAge: refreshMaxAge, path: '/api/auth' }));
  // CSRF token is intentionally readable by the frontend (double-submit).
  res.cookie('csrf_token', tokens.csrfToken, cookieOptions({ httpOnly: false, maxAge: refreshMaxAge }));
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', cookieOptions());
  res.clearCookie('refresh_token', cookieOptions({ path: '/api/auth' }));
  res.clearCookie('csrf_token', cookieOptions({ httpOnly: false }));
}

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const admin = await adminUsers.findByEmail(email);
    const passwordOk = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);

    if (!admin || !passwordOk || !admin.is_active) {
      await recordAudit(req, 'login_failed', 'admin_user', admin ? admin.id : null, { email });
      throw new AppError(401, 'Invalid email or password');
    }

    const tokens = await issueTokens(admin, req);
    setAuthCookies(res, tokens);
    await adminUsers.touchLastLogin(admin.id);
    req.admin = { id: admin.id };
    await recordAudit(req, 'login_success', 'admin_user', admin.id);

    res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies && req.cookies.refresh_token;
    if (!raw) throw new AppError(401, 'Refresh token required');

    const stored = await refreshTokens.findByHash(sha256(raw));
    if (!stored) throw new AppError(401, 'Invalid refresh token');

    // A revoked token being replayed means it may be stolen: kill the family.
    if (stored.revoked_at) {
      await refreshTokens.revokeAllForAdmin(stored.admin_user_id);
      req.log.warn({ adminUserId: stored.admin_user_id }, 'refresh token reuse detected; all sessions revoked');
      throw new AppError(401, 'Invalid refresh token');
    }
    if (new Date(stored.expires_at) < new Date()) {
      throw new AppError(401, 'Refresh token expired');
    }

    const admin = await adminUsers.findById(stored.admin_user_id);
    if (!admin || !admin.is_active) throw new AppError(401, 'Account disabled');

    const tokens = await issueTokens(admin, req);
    await refreshTokens.revoke(stored.id, tokens.refreshTokenId);
    setAuthCookies(res, tokens);

    res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies && req.cookies.refresh_token;
    if (raw) await refreshTokens.revokeByHash(sha256(raw));

    // Best-effort identification for the audit trail; logout works regardless.
    const access = req.cookies && req.cookies.access_token;
    if (access) {
      try {
        const payload = jwt.verify(access, config.jwt.secret, {
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
        });
        req.admin = { id: payload.sub };
      } catch (err) {
        // expired token at logout is fine
      }
    }
    await recordAudit(req, 'logout');

    clearAuthCookies(res);
    res.json({ ok: true });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;
