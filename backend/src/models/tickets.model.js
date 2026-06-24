const db = require('../services/db');

async function listByClient(clientId) {
  const { rows } = await db.query(
    `SELECT id, subject, message, status, priority, resolved_at, created_at, updated_at
     FROM support_tickets
     WHERE client_id = $1
     ORDER BY created_at DESC`,
    [clientId]
  );
  return rows;
}

async function listAll({ status = null, limit, offset }) {
  const where = `($1::text IS NULL OR st.status = $1)`;

  const { rows } = await db.query(
    `SELECT st.id, st.client_id, c.business_name, st.subject, st.message, st.status,
            st.priority, st.resolved_at, st.created_at
     FROM support_tickets st
     JOIN clients c ON c.id = st.client_id
     WHERE ${where}
     ORDER BY
       CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       st.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM support_tickets st WHERE ${where}`,
    [status]
  );

  return { tickets: rows, total: countRows[0].total };
}

// Scoped to the client so a ticket id can never be resolved across tenants.
async function resolve(clientId, ticketId, adminUserId) {
  const { rows } = await db.query(
    `UPDATE support_tickets
     SET status = 'resolved', resolved_at = now(), resolved_by = $3
     WHERE id = $1 AND client_id = $2
     RETURNING id, subject, status, resolved_at`,
    [ticketId, clientId, adminUserId]
  );
  return rows[0] || null;
}

module.exports = { listByClient, listAll, resolve };
