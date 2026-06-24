jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const { deterministicValidate, signPayload } = require('../src/services/payroll.service');

function validBatch() {
  return {
    pay_period: { start: '2026-05-25', end: '2026-06-07' },
    employees: [
      { id: 'e1', name: 'A', hours: 80, hourly_rate_cents: 2000, gross_pay_cents: 160000 },
      { id: 'e2', name: 'B', hours: 40, hourly_rate_cents: 2500, gross_pay_cents: 100000 },
    ],
    total_gross_cents: 260000,
  };
}

describe('deterministicValidate', () => {
  test('accepts a clean batch', () => {
    const { errors, warnings } = deterministicValidate(validBatch());
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  test('rejects an empty batch', () => {
    const { errors } = deterministicValidate({ employees: [] });
    expect(errors).toContain('Payroll data contains no employees');
  });

  test('rejects sub-minimum-wage rates', () => {
    const batch = validBatch();
    batch.employees[0].hourly_rate_cents = 500;
    batch.employees[0].gross_pay_cents = 40000;
    batch.total_gross_cents = 140000;
    const { errors } = deterministicValidate(batch);
    expect(errors.some((e) => e.includes('minimum wage'))).toBe(true);
  });

  test('rejects impossible hours and negative pay', () => {
    const batch = validBatch();
    batch.employees[0].hours = 400;
    batch.employees[1].gross_pay_cents = -5;
    const { errors } = deterministicValidate(batch);
    expect(errors.some((e) => e.includes('sanity limit'))).toBe(true);
    expect(errors.some((e) => e.includes('negative gross pay'))).toBe(true);
  });

  test('rejects a batch total that does not match the employee sum', () => {
    const batch = validBatch();
    batch.total_gross_cents = 999999;
    const { errors } = deterministicValidate(batch);
    expect(errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  test('warns on unusually high but plausible hours', () => {
    const batch = validBatch();
    batch.employees[0].hours = 95;
    batch.employees[0].gross_pay_cents = 190000;
    batch.total_gross_cents = 290000;
    const { errors, warnings } = deterministicValidate(batch);
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unusually high'))).toBe(true);
  });
});

describe('signPayload', () => {
  test('produces a timestamped HMAC signature', () => {
    const headers = signPayload({ total: 100 });
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  test('signature changes when the payload changes', () => {
    const a = signPayload({ total: 100 });
    const b = signPayload({ total: 101 });
    expect(a['X-Signature']).not.toBe(b['X-Signature']);
  });
});
