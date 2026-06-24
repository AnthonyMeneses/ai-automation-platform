const config = require('../config');
const { logger } = require('../utils/logger');
const { withRetry } = require('../utils/retry');

// Always logs; additionally POSTs to ADMIN_NOTIFY_WEBHOOK_URL when configured
// (Slack incoming webhook, Zapier, etc). Delivery failures never propagate.
async function notifyAdmin(subject, message, log = logger) {
  log.warn({ subject, notification: message }, 'admin notification');
  if (!config.notifyWebhookUrl) return;

  try {
    await withRetry(async () => {
      const response = await fetch(config.notifyWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          text: `*${subject}*\n${message}`,
          sent_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const err = new Error(`notify webhook responded ${response.status}`);
        err.status = response.status;
        throw err;
      }
    }, { retries: 2 });
  } catch (err) {
    log.error({ err: { message: err.message } }, 'failed to deliver admin notification');
  }
}

module.exports = { notifyAdmin };
