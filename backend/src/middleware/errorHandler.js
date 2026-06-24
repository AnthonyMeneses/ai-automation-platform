const { AppError } = require('../utils/errors');
const { logger } = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler: full details go to the log, sanitized message + request
// id go to the client. 5xx bodies never leak internals.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status =
    err instanceof AppError ? err.statusCode : err.statusCode || err.status || 500;
  const log = req.log || logger;

  if (status >= 500) {
    log.error({ err, requestId: req.id }, 'request failed');
  } else {
    log.warn({ message: err.message, status, requestId: req.id }, 'request rejected');
  }

  if (res.headersSent) return;

  const body = {
    error: status >= 500 ? 'Internal server error' : err.message,
    requestId: req.id,
  };
  if (status < 500 && err.details) body.details = err.details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
