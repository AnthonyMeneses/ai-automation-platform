const crypto = require('crypto');
const { AppError } = require('../utils/errors');

// Double-submit CSRF protection for cookie-authenticated requests, on top of
// SameSite=Strict cookies. The csrf_token cookie is readable by the frontend,
// which must echo it in the x-csrf-token header on state-changing requests.
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Bearer-token clients are not cookie-authenticated; CSRF does not apply.
  const usesCookieAuth = Boolean(req.cookies && req.cookies.access_token);
  if (!usesCookieAuth && (req.get('authorization') || '').startsWith('Bearer ')) {
    return next();
  }

  const header = req.get('x-csrf-token') || '';
  const cookie = (req.cookies && req.cookies.csrf_token) || '';
  const headerBuf = Buffer.from(header);
  const cookieBuf = Buffer.from(cookie);

  if (
    !header ||
    !cookie ||
    headerBuf.length !== cookieBuf.length ||
    !crypto.timingSafeEqual(headerBuf, cookieBuf)
  ) {
    return next(new AppError(403, 'CSRF token missing or invalid'));
  }
  return next();
}

module.exports = csrfProtection;
