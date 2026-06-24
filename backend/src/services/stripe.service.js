const Stripe = require('stripe');
const config = require('../config');
const { AppError } = require('../utils/errors');
const clientsModel = require('../models/clients.model');
const subscriptions = require('../models/subscriptions.model');
const { notifyAdmin } = require('./notify.service');

const stripe = new Stripe(config.stripe.secretKey || 'sk_test_placeholder');

// Requires the raw (unparsed) request body — app.js mounts express.raw() for
// the stripe webhook path before the JSON body parser.
function constructEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

async function handleEvent(event, log) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return upsertSubscription(event.data.object, log);
    case 'customer.subscription.deleted':
      return subscriptions.markCanceled(event.data.object.id);
    case 'invoice.payment_succeeded':
      return recordInvoice(event.data.object, 'succeeded', log);
    case 'invoice.payment_failed':
      return handleFailedInvoice(event.data.object, log);
    default:
      log.debug({ type: event.type }, 'ignoring unhandled stripe event');
      return null;
  }
}

async function upsertSubscription(subscription, log) {
  const client = await clientsModel.findByStripeCustomerId(subscription.customer);
  if (!client) {
    log.warn({ customer: subscription.customer }, 'stripe subscription for unknown customer');
    return null;
  }
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  const priceId = item && item.price ? item.price.id : null;
  const tier = priceId ? tierForPrice(priceId) : null;
  if (tier) await clientsModel.setSubscriptionTier(client.id, tier);

  return subscriptions.upsertFromStripe({
    clientId: client.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    amountCents: item && item.price ? item.price.unit_amount || 0 : 0,
    currency: (subscription.currency || 'usd').toLowerCase(),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
  });
}

async function recordInvoice(invoice, status, log) {
  const client = await clientsModel.findByStripeCustomerId(invoice.customer);
  if (!client) {
    log.warn({ customer: invoice.customer }, 'stripe invoice for unknown customer');
    return null;
  }
  const subscription = invoice.subscription
    ? await subscriptions.findByStripeId(invoice.subscription)
    : null;

  return subscriptions.recordPayment({
    clientId: client.id,
    subscriptionId: subscription ? subscription.id : null,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: invoice.payment_intent || null,
    amountCents: status === 'succeeded' ? invoice.amount_paid || 0 : invoice.amount_due || 0,
    currency: (invoice.currency || 'usd').toLowerCase(),
    status,
    failureReason:
      status === 'failed'
        ? (invoice.last_finalization_error && invoice.last_finalization_error.message) ||
          'Payment failed'
        : null,
    paidAt: status === 'succeeded' ? new Date() : null,
  });
}

async function handleFailedInvoice(invoice, log) {
  await recordInvoice(invoice, 'failed', log);
  if (invoice.subscription) {
    await subscriptions.markPastDue(invoice.subscription);
  }
  const amount = ((invoice.amount_due || 0) / 100).toFixed(2);
  await notifyAdmin(
    'Payment failed',
    `Stripe invoice ${invoice.id} for customer ${invoice.customer} failed (${amount} ${invoice.currency || 'usd'}).`,
    log
  );
}

// ---------------------------------------------------------------------------
// Billing onboarding — the revenue path: turn a client row into a paying
// Stripe subscriber via hosted Checkout, then let them self-manage via the
// billing portal.
// ---------------------------------------------------------------------------

function priceForTier(tier) {
  const priceId = config.stripe.prices[tier];
  if (!priceId) {
    throw new AppError(
      400,
      `No Stripe price is configured for the "${tier}" plan. Set STRIPE_PRICE_${tier.toUpperCase()}.`
    );
  }
  return priceId;
}

function tierForPrice(priceId) {
  const match = Object.entries(config.stripe.prices).find(([, id]) => id && id === priceId);
  return match ? match[0] : null;
}

// Returns the client's Stripe customer id, creating and persisting one on first
// use so a client row and its Stripe customer stay linked.
async function getOrCreateCustomer(client) {
  if (client.stripe_customer_id) return client.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: client.email,
    name: client.business_name,
    metadata: { client_id: client.id },
  });
  await clientsModel.setStripeCustomerId(client.id, customer.id);
  return customer.id;
}

// Hosted Stripe Checkout link for a subscription on the given tier. Send the
// returned URL to the client; on payment, Stripe fires the subscription
// webhook which records the subscription and syncs the tier.
async function createCheckoutSession(client, tier) {
  const price = priceForTier(tier);
  const customerId = await getOrCreateCustomer(client);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: config.stripe.checkoutSuccessUrl,
    cancel_url: config.stripe.checkoutCancelUrl,
    subscription_data: { metadata: { client_id: client.id, tier } },
    metadata: { client_id: client.id, tier },
    allow_promotion_codes: true,
  });
  return session.url;
}

// Stripe-hosted billing portal so a client can update their card, view
// invoices, or cancel — no card data ever touches this server.
async function createBillingPortalSession(client) {
  if (!client.stripe_customer_id) {
    throw new AppError(409, 'This client has no Stripe customer yet — send a checkout link first.');
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: config.stripe.billingPortalReturnUrl,
  });
  return session.url;
}

module.exports = {
  constructEvent,
  handleEvent,
  createCheckoutSession,
  createBillingPortalSession,
  tierForPrice,
};
