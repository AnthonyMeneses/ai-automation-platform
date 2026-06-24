const { Pool } = require('pg');
const config = require('../config');
const { logger } = require('../utils/logger');

// Supabase's pooled connections require SSL; rejectUnauthorized is relaxed
// because Supabase terminates TLS with a certificate not in the default chain.
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected postgres client error');
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    logger.warn({ duration, rowCount: result.rowCount }, 'slow query');
  }
  return result;
}

module.exports = { query, pool };
