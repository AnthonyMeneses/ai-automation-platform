const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../utils/errors');

// Primary auth is the httpOnly access_token cookie; a Bearer header is also
// accepted for programmatic clients (those skip CSRF checks since the browser
// never attaches a Bearer header cross-site).
function requireAuth(req, res, next) {
  let token = req.cookies && req.cookies.access_token;
  if (!token) {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) token = header.slice(7);
  }
  if (!token) return next(new AppError(401, 'Authentication required'));

  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    if (payload.type !== 'access') throw new Error('wrong token type');
    req.admin = { id: payload.sub, email: payload.email, name: payload.name };
    return next();
  } catch (err) {
    return next(new AppError(401, 'Invalid or expired session'));
  }
}

module.exports = { requireAuth };
