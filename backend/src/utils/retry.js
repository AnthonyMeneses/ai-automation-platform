const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function defaultShouldRetry(err) {
  const status = err.status || err.statusCode;
  if (status && RETRYABLE_STATUS.has(status)) return true;
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;
  if (err.cause && err.cause.code && RETRYABLE_CODES.has(err.cause.code)) return true;
  return false;
}

// Exponential backoff with jitter. Only retries errors that look transient.
async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseMs = 300,
    factor = 2,
    maxMs = 5000,
    shouldRetry = defaultShouldRetry,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !shouldRetry(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * factor ** (attempt - 1));
      const delay = backoff * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }
}

module.exports = { withRetry, defaultShouldRetry };
