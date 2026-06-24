const db = require('../services/db');

async function create({ businessName, email, phone, planInterest, message, source, ip, userAgent }) {
  const { rows } = await db.query(
    `INSERT INTO leads (business_name, email, phone, plan_interest, message, source, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [businessName, email, phone, planInterest, message, source, ip, userAgent]
  );
  return rows[0];
}

async function list({ status = null, limit, offset }) {
  const where = `($1::text IS NULL OR status = $1)`;

  const { rows } = await db.query(
    `SELECT id, business_name, email, phone, plan_interest, message, source, status,
            converted_client_id, created_at
     FROM leads
     WHERE ${where}
     ORDER BY
       CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM leads WHERE ${where}`,
    [status]
  );

  return { leads: rows, total: countRows[0].total };
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, business_name, email, phone, plan_interest, message, status, converted_client_id
     FROM leads
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function setStatus(id, status, convertedClientId = null) {
  const { rows } = await db.query(
    `UPDATE leads
     SET status = $2,
         converted_client_id = COALESCE($3, converted_client_id)
     WHERE id = $1
     RETURNING id, status, converted_client_id`,
    [id, status, convertedClientId]
  );
  return rows[0] || null;
}

module.exports = { create, list, findById, setStatus };
