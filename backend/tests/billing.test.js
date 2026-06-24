const mockCustomersCreate = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    webhooks: { constructEvent: jest.fn() },
  }))
);
jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const config = require('../src/config');
const db = require('../src/services/db');
const stripeService = require('../src/services/stripe.service');

beforeAll(() => {
  config.stripe.prices.pro = 'price_pro_123';
  config.stripe.prices.enterprise = 'price_ent_456';
  config.stripe.prices.starter = '';
});

const baseClient = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'owner@biz.example',
  business_name: 'Biz Co',
  stripe_customer_id: null,
};

describe('createCheckoutSession', () => {
  test('creates a customer on first use and returns the checkout url', async () => {
    mockCustomersCreate.mockResolvedValue({ id: 'cus_new_1' });
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const url = await stripeService.createCheckoutSession(baseClient, 'pro');

    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: baseClient.email, metadata: { client_id: baseClient.id } })
    );
    // Persists the new customer id back to the client row.
    const update = db.query.mock.calls.find(([sql]) =>
      /UPDATE clients SET stripe_customer_id/i.test(sql)
    );
    expect(update[1]).toEqual(['cus_new_1', baseClient.id]);

    const params = mockCheckoutCreate.mock.calls[0][0];
    expect(params.mode).toBe('subscription');
    expect(params.customer).toBe('cus_new_1');
    expect(params.line_items[0].price).toBe('price_pro_123');
  });

  test('reuses an existing Stripe customer', async () => {
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_2' });

    await stripeService.createCheckoutSession(
      { ...baseClient, stripe_customer_id: 'cus_existing' },
      'enterprise'
    );

    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockCheckoutCreate.mock.calls[0][0].customer).toBe('cus_existing');
    expect(mockCheckoutCreate.mock.calls[0][0].line_items[0].price).toBe('price_ent_456');
  });

  test('rejects a tier with no configured price (400) without calling Stripe', async () => {
    await expect(stripeService.createCheckoutSession(baseClient, 'starter')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });
});

describe('createBillingPortalSession', () => {
  test('returns a portal url for an existing subscriber', async () => {
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session/x' });
    const url = await stripeService.createBillingPortalSession({
      ...baseClient,
      stripe_customer_id: 'cus_existing',
    });
    expect(url).toBe('https://billing.stripe.com/session/x');
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' })
    );
  });

  test('rejects with 409 when the client has no Stripe customer', async () => {
    await expect(stripeService.createBillingPortalSession(baseClient)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });
});

describe('tierForPrice', () => {
  test('maps a configured price id back to its tier', () => {
    expect(stripeService.tierForPrice('price_pro_123')).toBe('pro');
    expect(stripeService.tierForPrice('price_unknown')).toBeNull();
  });
});
