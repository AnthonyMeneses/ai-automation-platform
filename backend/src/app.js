const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { httpLogger } = require('./utils/logger');
const { apiLimiter, webhookLimiter } = require('./middleware/rateLimit');
const csrfProtection = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./api/auth.routes');
const adminRoutes = require('./api/admin.routes');
const publicRoutes = require('./api/public.routes');
const webhookRoutes = require('./api/webhooks.routes');

const app = express();

// Running behind one proxy hop (Railway/Heroku/nginx); makes req.ip and
// req.secure reflect the real client.
app.set('trust proxy', 1);

app.use(httpLogger);
app.use(helmet());

if (config.env === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(cors({ origin: config.frontendUrl, credentials: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Webhooks mount before the JSON parser: Stripe signature verification needs
// the raw body, and Twilio posts form-encoded payloads.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/webhooks', webhookLimiter, express.urlencoded({ extended: false }), webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api', apiLimiter);
// Public (unauthenticated) endpoints — no CSRF, its own strict limiter.
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', csrfProtection, adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
