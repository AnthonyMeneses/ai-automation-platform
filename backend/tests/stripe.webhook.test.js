jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: { end: jest.fn() },
}));

const request = require('supertest');
const Stripe = require('stripe');
const db = require('../src/services/db');
const app = require('../src/app');

const stripe = new Stripe('sk_test_dummy');
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return { payload, header };
}

function postWebhook(payload, header) {
  return request(app)
    .post('/api/webhooks/stripe')
    .set('stripe-signature', header)
    .set('content-type', 'application/json')
    .send(payload);
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [] });
  });

  test('rejects an invalid signature with 400', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'bogus')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('records a successful invoice payment', async () => {
    db.query.mockImplementation((sql) => {
      if (/FROM clients/i.test(sql)) return Promise.resolve({ rows: [{ id: CLIENT_ID }] });
      return Promise.resolve({ rows: [] });
    });

    const event = {
      id: 'evt_test_1',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_1',
          customer: 'cus_test_1',
          subscription: 'sub_test_1',
          amount_paid: 19900,
          amount_due: 19900,
          currency: 'usd',
          payment_intent: 'pi_test_1',
        },
      },
    };
    const { payload, header } = signedPayload(event);
    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO payments/i.test(sql));
    expect(insert).toBeTruthy();
    expect(insert[1]).toEqual(
      expect.arrayContaining([CLIENT_ID, 'in_test_1', 19900, 'succeeded'])
    );
  });

  test('marks the subscription past_due and records the failure on failed payment', async () => {
    db.query.mockImplementation((sql) => {
      if (/FROM clients/i.test(sql)) return Promise.resolve({ rows: [{ id: CLIENT_ID }] });
      return Promise.resolve({ rows: [] });
    });

    const event = {
      id: 'evt_test_2',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_2',
          customer: 'cus_test_1',
          subscription: 'sub_test_1',
          amount_due: 19900,
          currency: 'usd',
        },
      },
    };
    const { payload, header } = signedPayload(event);
    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    const pastDue = db.query.mock.calls.find(([sql]) => /SET status = 'past_due'/i.test(sql));
    expect(pastDue).toBeTruthy();
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO payments/i.test(sql));
    expect(insert[1]).toEqual(expect.arrayContaining(['failed']));
  });

  test('upserts subscriptions from customer.subscription.updated', async () => {
    db.query.mockImplementation((sql) => {
      if (/FROM clients/i.test(sql)) return Promise.resolve({ rows: [{ id: CLIENT_ID }] });
      if (/INSERT INTO subscriptions/i.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'sub-row-id' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const event = {
      id: 'evt_test_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_1',
          customer: 'cus_test_1',
          status: 'active',
          currency: 'usd',
          cancel_at_period_end: false,
          current_period_start: 1760000000,
          current_period_end: 1762600000,
          items: { data: [{ price: { unit_amount: 19900 } }] },
        },
      },
    };
    const { payload, header } = signedPayload(event);
    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    const upsert = db.query.mock.calls.find(([sql]) => /INSERT INTO subscriptions/i.test(sql));
    expect(upsert).toBeTruthy();
    expect(upsert[1]).toEqual(expect.arrayContaining(['sub_test_1', 'active', 19900]));
  });

  test('ignores unknown customers without crashing', async () => {
    const event = {
      id: 'evt_test_4',
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_test_4', customer: 'cus_unknown', amount_paid: 100, currency: 'usd' } },
    };
    const { payload, header } = signedPayload(event);
    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO payments/i.test(sql));
    expect(insert).toBeUndefined();
  });
});
