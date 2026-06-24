const db = require('../services/db');

async function list({ action = null, resourceType = null, limit, offset }) {
  const where = `($1::text IS NULL OR al.action = $1)
       AND ($2::text IS NULL OR al.resource_type = $2)`;

  const { rows } = await db.query(
    `SELECT al.id, al.action, al.resource_type, al.resource_id, al.metadata,
            al.ip_address, al.user_agent, al.created_at, au.email AS admin_email
     FROM audit_logs al
     LEFT JOIN admin_users au ON au.id = al.admin_user_id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT $3 OFFSET $4`,
    [action, resourceType, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM audit_logs al WHERE ${where}`,
    [action, resourceType]
  );

  return { logs: rows, total: countRows[0].total };
}

module.exports = { list };
