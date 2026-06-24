const config = require('./src/config');
const app = require('./src/app');
const db = require('./src/services/db');
const { logger } = require('./src/utils/logger');

async function main() {
  // Surface any inactive integrations (missing optional keys) on boot.
  for (const warning of config.warnings) {
    logger.warn({ config: true }, warning);
  }

  // Fail fast if the database is unreachable rather than serving 500s.
  await db.query('SELECT 1');

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'server listening');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await db.pool.end();
      process.exit(0);
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
