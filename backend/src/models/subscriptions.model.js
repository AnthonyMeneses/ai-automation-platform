const db = require('../services/db');

async function upsertFromStripe({
  clientId,
  stripeSubscriptionId,
  status,
  amountCents,
  currency,
  cancelAtPeriodEnd,
  currentPeriodStart,
  currentPeriodEnd,
}) {
  const { rows } = await db.query(
    `INSERT INTO subscriptions
       (client_id, stripe_subscription_id, status, amount_cents, currency,
        cancel_at_period_end, current_period_start, current_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       status = EXCLUDED.status,
       amount_cents = EXCLUDED.amount_cents,
       currency = EXCLUDED.currency,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end
     RETURNING id`,
    [
      clientId,
      stripeSubscriptionId,
      status,
      amountCents,
      currency,
      cancelAtPeriodEnd,
      currentPeriodStart,
      currentPeriodEnd,
    ]
  );
  return rows[0];
}

async function markCanceled(stripeSubscriptionId) {
  await db.query(
    `UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
}

async function markPastDue(stripeSubscriptionId) {
  await db.query(
    `UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
}

async function findByStripeId(stripeSubscriptionId) {
  const { rows } = await db.query(
    `SELECT id, client_id, status FROM subscriptions WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  return rows[0] || null;
}

async function findByClient(clientId) {
  const { rows } = await db.query(
    `SELECT id, stripe_subscription_id, status, amount_cents, currency,
            cancel_at_period_end, current_period_start, current_period_end, created_at
     FROM subscriptions
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

// Idempotent: Stripe retries webhook deliveries, so duplicate invoice events
// update the existing row instead of inserting twice.
async function recordPayment({
  clientId,
  subscriptionId,
  stripeInvoiceId,
  stripePaymentIntentId,
  amountCents,
  currency,
  status,
  failureReason,
  paidAt,
}) {
  const { rows } = await db.query(
    `INSERT INTO payments
       (client_id, subscription_id, stripe_invoice_id, stripe_payment_intent_id,
        amount_cents, currency, status, failure_reason, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       status = EXCLUDED.status,
       failure_reason = EXCLUDED.failure_reason,
       paid_at = EXCLUDED.paid_at
     RETURNING id`,
    [
      clientId,
      subscriptionId,
      stripeInvoiceId,
      stripePaymentIntentId,
      amountCents,
      currency,
      status,
      failureReason,
      paidAt,
    ]
  );
  return rows[0];
}

async function listPaymentsByClient(clientId, limit = 25) {
  const { rows } = await db.query(
    `SELECT id, stripe_invoice_id, amount_cents, currency, status, failure_reason,
            paid_at, created_at
     FROM payments
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [clientId, limit]
  );
  return rows;
}

module.exports = {
  upsertFromStripe,
  markCanceled,
  markPastDue,
  findByStripeId,
  findByClient,
  recordPayment,
  listPaymentsByClient,
};
