const db = require('../services/db');

async function create({ adminUserId, tokenHash, expiresAt, ip, userAgent }) {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (admin_user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [adminUserId, tokenHash, expiresAt, ip, userAgent]
  );
  return rows[0];
}

async function findByHash(tokenHash) {
  const { rows } = await db.query(
    `SELECT id, admin_user_id, token_hash, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function revoke(id, replacedBy = null) {
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by = $2
     WHERE id = $1 AND revoked_at IS NULL`,
    [id, replacedBy]
  );
}

async function revokeByHash(tokenHash) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

// Token-reuse response: a revoked token being replayed means the family may be
// stolen, so every active session for that admin is killed.
async function revokeAllForAdmin(adminUserId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE admin_user_id = $1 AND revoked_at IS NULL`,
    [adminUserId]
  );
}

module.exports = { create, findByHash, revoke, revokeByHash, revokeAllForAdmin };
