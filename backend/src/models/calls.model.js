const db = require('../services/db');

// Allowlist for dynamic updates; anything not listed here cannot be written
// through updateBySid no matter what a webhook sends.
const UPDATABLE_COLUMNS = new Set([
  'duration_seconds',
  'call_outcome',
  'transcript',
  'recording_url',
  'ai_intent',
  'ai_sentiment',
  'ai_summary',
  'ai_action_items',
]);

async function create({ clientId, twilioCallSid, direction, callerPhone, toPhone, outcome }) {
  const { rows } = await db.query(
    `INSERT INTO phone_calls (client_id, twilio_call_sid, direction, caller_phone, to_phone, call_outcome)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (twilio_call_sid) DO NOTHING
     RETURNING id`,
    [clientId, twilioCallSid, direction, callerPhone, toPhone, outcome]
  );
  return rows[0] || null;
}

async function updateBySid(twilioCallSid, fields) {
  const sets = [];
  const values = [twilioCallSid];
  for (const [key, value] of Object.entries(fields)) {
    if (!UPDATABLE_COLUMNS.has(key) || value === undefined) continue;
    values.push(key === 'ai_action_items' ? JSON.stringify(value) : value);
    sets.push(`${key} = $${values.length}`);
  }
  if (sets.length === 0) return;
  await db.query(
    `UPDATE phone_calls SET ${sets.join(', ')} WHERE twilio_call_sid = $1`,
    values
  );
}

async function findBySid(twilioCallSid) {
  const { rows } = await db.query(
    `SELECT id, client_id, twilio_call_sid, transcript FROM phone_calls WHERE twilio_call_sid = $1`,
    [twilioCallSid]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT pc.*, c.business_name
     FROM phone_calls pc
     LEFT JOIN clients c ON c.id = pc.client_id
     WHERE pc.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Client isolation: when clientId is provided the call must belong to it.
async function findByClientAndId(clientId, id) {
  const { rows } = await db.query(
    `SELECT pc.*, c.business_name
     FROM phone_calls pc
     LEFT JOIN clients c ON c.id = pc.client_id
     WHERE pc.id = $1 AND pc.client_id = $2`,
    [id, clientId]
  );
  return rows[0] || null;
}

async function list({ clientId = null, outcome = null, from = null, to = null, limit, offset }) {
  const where = `($1::uuid IS NULL OR pc.client_id = $1)
       AND ($2::text IS NULL OR pc.call_outcome = $2)
       AND ($3::timestamptz IS NULL OR pc.created_at >= $3)
       AND ($4::timestamptz IS NULL OR pc.created_at <= $4)`;

  const { rows } = await db.query(
    `SELECT pc.id, pc.client_id, c.business_name, pc.direction, pc.caller_phone, pc.to_phone,
            pc.duration_seconds, pc.call_outcome, pc.ai_intent, pc.ai_sentiment, pc.created_at,
            left(coalesce(pc.transcript, ''), 120) AS transcript_preview
     FROM phone_calls pc
     LEFT JOIN clients c ON c.id = pc.client_id
     WHERE ${where}
     ORDER BY pc.created_at DESC
     LIMIT $5 OFFSET $6`,
    [clientId, outcome, from, to, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM phone_calls pc
     WHERE ${where}`,
    [clientId, outcome, from, to]
  );

  return { calls: rows, total: countRows[0].total };
}

module.exports = { create, updateBySid, findBySid, findById, findByClientAndId, list };
