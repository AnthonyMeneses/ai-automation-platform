const db = require('../services/db');
const { escapeLike } = require('../utils/sanitize');

async function list({ search = null, limit, offset }) {
  const searchParam = search ? `%${escapeLike(search)}%` : null;
  const where = `($1::text IS NULL OR c.business_name ILIKE $1 OR c.email ILIKE $1)`;

  const { rows } = await db.query(
    `SELECT c.id, c.business_name, c.email, c.phone, c.subscription_tier, c.status, c.created_at,
            s.status AS subscription_status, s.amount_cents, s.current_period_end,
            p.last_payment_at, p.last_payment_status
     FROM clients c
     LEFT JOIN LATERAL (
       SELECT status, amount_cents, current_period_end
       FROM subscriptions
       WHERE client_id = c.id
       ORDER BY created_at DESC
       LIMIT 1
     ) s ON TRUE
     LEFT JOIN LATERAL (
       SELECT created_at AS last_payment_at, status AS last_payment_status
       FROM payments
       WHERE client_id = c.id
       ORDER BY created_at DESC
       LIMIT 1
     ) p ON TRUE
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [searchParam, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM clients c WHERE ${where}`,
    [searchParam]
  );

  return { clients: rows, total: countRows[0].total };
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, business_name, email, phone, twilio_phone_number, subscription_tier,
            status, stripe_customer_id, created_at, updated_at
     FROM clients
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ businessName, email, phone = null }) {
  const { rows } = await db.query(
    `INSERT INTO clients (business_name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id, business_name, email, phone, subscription_tier, status, stripe_customer_id, created_at`,
    [businessName, email, phone]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT id, business_name, email FROM clients WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function setStripeCustomerId(clientId, stripeCustomerId) {
  await db.query(`UPDATE clients SET stripe_customer_id = $1 WHERE id = $2`, [
    stripeCustomerId,
    clientId,
  ]);
}

// Kept in sync with the price the client actually subscribed to (driven by the
// Stripe subscription webhook), so the dashboard tier never drifts from billing.
async function setSubscriptionTier(clientId, tier) {
  await db.query(`UPDATE clients SET subscription_tier = $1 WHERE id = $2`, [tier, clientId]);
}

async function findByStripeCustomerId(stripeCustomerId) {
  const { rows } = await db.query(
    `SELECT id, business_name FROM clients WHERE stripe_customer_id = $1`,
    [stripeCustomerId]
  );
  return rows[0] || null;
}

async function findByTwilioNumber(phoneNumber) {
  const { rows } = await db.query(
    `SELECT id, business_name FROM clients WHERE twilio_phone_number = $1`,
    [phoneNumber]
  );
  return rows[0] || null;
}

async function dashboardStats() {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM clients) AS total_clients,
       (SELECT COUNT(*)::int FROM subscriptions WHERE status IN ('active', 'trialing')) AS active_subscriptions,
       (SELECT COUNT(*)::int FROM support_tickets WHERE status = 'open') AS open_tickets,
       (SELECT COUNT(*)::int FROM phone_calls WHERE created_at > now() - interval '7 days') AS calls_last_7_days,
       (SELECT COUNT(*)::int FROM payments WHERE status = 'failed' AND created_at > now() - interval '30 days') AS failed_payments_30d,
       (SELECT COUNT(*)::int FROM payroll_connections WHERE api_status = 'error') AS payroll_errors,
       (SELECT COUNT(*)::int FROM leads WHERE status = 'new') AS new_leads`
  );

  const { rows: recentCalls } = await db.query(
    `SELECT pc.id, pc.caller_phone, pc.call_outcome, pc.ai_intent, pc.created_at, c.business_name
     FROM phone_calls pc
     LEFT JOIN clients c ON c.id = pc.client_id
     ORDER BY pc.created_at DESC
     LIMIT 8`
  );

  const { rows: failedPayments } = await db.query(
    `SELECT p.id, p.amount_cents, p.currency, p.failure_reason, p.created_at, c.business_name
     FROM payments p
     JOIN clients c ON c.id = p.client_id
     WHERE p.status = 'failed'
     ORDER BY p.created_at DESC
     LIMIT 5`
  );

  const { rows: recentLeads } = await db.query(
    `SELECT id, business_name, email, plan_interest, status, created_at
     FROM leads
     WHERE status = 'new'
     ORDER BY created_at DESC
     LIMIT 5`
  );

  return {
    totals: rows[0],
    recent_calls: recentCalls,
    recent_failed_payments: failedPayments,
    recent_leads: recentLeads,
  };
}

module.exports = {
  list,
  create,
  findById,
  findByEmail,
  setStripeCustomerId,
  setSubscriptionTier,
  findByStripeCustomerId,
  findByTwilioNumber,
  dashboardStats,
};
