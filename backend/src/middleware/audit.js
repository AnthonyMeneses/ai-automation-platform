const db = require('../services/db');
const { logger } = require('../utils/logger');

// Audit writes must never break the request that triggered them.
async function recordAudit(req, action, resourceType = null, resourceId = null, metadata = null) {
  try {
    await db.query(
      `INSERT INTO audit_logs (admin_user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.admin ? req.admin.id : null,
        action,
        resourceType,
        resourceId,
        metadata ? JSON.stringify(metadata) : null,
        req.ip || null,
        req.get('user-agent') || null,
      ]
    );
  } catch (err) {
    (req.log || logger).error({ err }, 'failed to write audit log');
  }
}

module.exports = { recordAudit };
