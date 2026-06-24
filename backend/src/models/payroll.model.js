const db = require('../services/db');

async function findConnectionByClient(clientId) {
  const { rows } = await db.query(
    `SELECT id, client_id, payroll_service, api_status, encrypted_credentials,
            last_sync_at, last_error, created_at
     FROM payroll_connections
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

async function listConnections() {
  const { rows } = await db.query(
    `SELECT pc.id, pc.client_id, c.business_name, pc.payroll_service, pc.api_status,
            pc.last_sync_at, pc.last_error
     FROM payroll_connections pc
     JOIN clients c ON c.id = pc.client_id
     ORDER BY c.business_name ASC`
  );
  return rows;
}

async function updateConnectionStatus(connectionId, status, error = null) {
  await db.query(
    `UPDATE payroll_connections
     SET api_status = $2,
         last_error = $3,
         last_sync_at = CASE WHEN $2 = 'synced' THEN now() ELSE last_sync_at END
     WHERE id = $1`,
    [connectionId, status, error]
  );
}

async function startSyncLog(connectionId, clientId) {
  const { rows } = await db.query(
    `INSERT INTO payroll_sync_logs (connection_id, client_id, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [connectionId, clientId]
  );
  return rows[0];
}

async function finishSyncLog(logId, status, validationResult = null, errorMessage = null) {
  await db.query(
    `UPDATE payroll_sync_logs
     SET status = $2, validation_result = $3, error_message = $4, finished_at = now()
     WHERE id = $1`,
    [logId, status, validationResult ? JSON.stringify(validationResult) : null, errorMessage]
  );
}

async function latestSyncLog(clientId) {
  const { rows } = await db.query(
    `SELECT id, status, validation_result, error_message, started_at, finished_at
     FROM payroll_sync_logs
     WHERE client_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

module.exports = {
  findConnectionByClient,
  listConnections,
  updateConnectionStatus,
  startSyncLog,
  finishSyncLog,
  latestSyncLog,
};
