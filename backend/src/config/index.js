const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function fail(message) {
  throw new Error(`Configuration error: ${message}`);
}

const env = process.env.NODE_ENV || 'development';

// Non-fatal startup warnings (logged by server.js once the logger exists).
// Used for missing optional integration keys so the app still boots and serves
// the dashboard + landing page — each integration simply stays inactive until
// its key is provided.
const warnings = [];

// Hard requirements — the app cannot run safely without these.
const required = ['DATABASE_URL', 'JWT_SECRET'];
// Required in production because their localhost defaults are wrong there and
// would break cookies, CORS, redirects, and webhook signature checks.
const requiredInProduction = ['FRONTEND_URL', 'PUBLIC_BASE_URL'];
// Optional integrations — missing means that feature is inactive, not a crash.
const optionalIntegrations = {
  ANTHROPIC_API_KEY: 'AI call analysis, payroll review, and website generation',
  STRIPE_SECRET_KEY: 'Stripe checkout links and billing portal',
  STRIPE_WEBHOOK_SECRET: 'Stripe webhook processing (subscriptions, invoices)',
  TWILIO_ACCOUNT_SID: 'Twilio call webhooks',
  TWILIO_AUTH_TOKEN: 'Twilio webhook signature verification',
  PAYROLL_ENCRYPTION_KEY: 'payroll credential storage (ADP/Gusto sync)',
};

for (const key of required) {
  if (!process.env[key]) fail(`${key} is required`);
}
if (process.env.JWT_SECRET.length < 32) {
  fail('JWT_SECRET must be at least 32 characters');
}

// Malformed (vs. absent) secrets are still fatal — a wrong key is worse silent.
if (process.env.PAYROLL_ENCRYPTION_KEY && !/^[0-9a-f]{64}$/i.test(process.env.PAYROLL_ENCRYPTION_KEY)) {
  fail('PAYROLL_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}
if (!['strict', 'lax', 'none'].includes(process.env.COOKIE_SAMESITE || 'strict')) {
  fail('COOKIE_SAMESITE must be one of strict, lax, none');
}

if (env === 'production') {
  for (const key of requiredInProduction) {
    if (!process.env[key]) fail(`${key} is required in production`);
  }
  for (const [key, feature] of Object.entries(optionalIntegrations)) {
    if (!process.env[key]) warnings.push(`${key} is not set — ${feature} is disabled until you add it.`);
  }
}

const port = Number(process.env.PORT || 3000);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

module.exports = {
  env,
  warnings,
  port,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
  frontendUrl,
  logLevel: process.env.LOG_LEVEL || (env === 'development' ? 'debug' : 'info'),
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  cookieSameSite: process.env.COOKIE_SAMESITE || 'strict',
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: 'ai-automation-platform',
    audience: 'admin-dashboard',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 7),
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-sonnet-4-6',
    complexModel: process.env.CLAUDE_COMPLEX_MODEL || 'claude-fable-5',
    enableComplexModel: process.env.CLAUDE_ENABLE_COMPLEX_MODEL !== 'false',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Stripe Price IDs per plan tier (Dashboard → Products). Without these,
    // checkout links can't be generated for that tier.
    prices: {
      starter: process.env.STRIPE_PRICE_STARTER || '',
      pro: process.env.STRIPE_PRICE_PRO || '',
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE || '',
    },
    checkoutSuccessUrl:
      process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${frontendUrl}/clients?billing=success`,
    checkoutCancelUrl:
      process.env.STRIPE_CHECKOUT_CANCEL_URL || `${frontendUrl}/clients?billing=canceled`,
    billingPortalReturnUrl:
      process.env.STRIPE_BILLING_PORTAL_RETURN_URL || `${frontendUrl}/clients`,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
  },
  payroll: {
    encryptionKey: process.env.PAYROLL_ENCRYPTION_KEY || '',
    signingSecret: process.env.PAYROLL_SIGNING_SECRET || '',
    useMock: process.env.PAYROLL_USE_MOCK === 'true' || env !== 'production',
    adp: {
      clientId: process.env.ADP_CLIENT_ID || '',
      clientSecret: process.env.ADP_CLIENT_SECRET || '',
    },
    gusto: {
      apiToken: process.env.GUSTO_API_TOKEN || '',
    },
  },
  notifyWebhookUrl: process.env.ADMIN_NOTIFY_WEBHOOK_URL || '',
};
