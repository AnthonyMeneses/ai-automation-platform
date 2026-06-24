const db = require('../services/db');

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT id, email, name, password_hash, is_active
     FROM admin_users
     WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, email, name, password_hash, is_active
     FROM admin_users
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function touchLastLogin(id) {
  await db.query(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [id]);
}

module.exports = { findByEmail, findById, touchLastLogin };
