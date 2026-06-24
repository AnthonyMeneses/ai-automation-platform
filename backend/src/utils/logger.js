const crypto = require('crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');
const config = require('../config');

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'password',
    '*.password',
    '*.password_hash',
    'token',
    '*.token',
    '*.access_token',
    '*.refresh_token',
    'apiKey',
    '*.apiKey',
    '*.api_key',
    '*.encrypted_credentials',
  ],
  censor: '[REDACTED]',
};

// stdout by default (12-factor; the host platform captures logs). LOG_DIR
// switches to daily-rotated files kept for 7 days.
let transport;
if (config.env === 'development') {
  transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
  };
} else if (process.env.LOG_DIR) {
  transport = {
    target: 'pino-roll',
    options: {
      file: `${process.env.LOG_DIR}/app.log`,
      frequency: 'daily',
      limit: { count: 7 },
      mkdir: true,
    },
  };
}

const logger = pino({
  level: config.env === 'test' ? 'silent' : config.logLevel,
  redact,
  transport: config.env === 'test' ? undefined : transport,
});

const httpLogger = pinoHttp({
  logger,
  genReqId: () => crypto.randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
});

module.exports = { logger, httpLogger };
