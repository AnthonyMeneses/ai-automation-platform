jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ id: 'lead-1', created_at: new Date().toISOString() }] }),
  pool: { end: jest.fn() },
}));

const request = require('supertest');
const db = require('../src/services/db');
const app = require('../src/app');

describe('POST /api/public/leads', () => {
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [{ id: 'lead-1' }] });
  });

  test('accepts a valid lead and stores it', async () => {
    const res = await request(app).post('/api/public/leads').send({
      business_name: 'Corner Cafe',
      email: 'owner@cornercafe.com',
      phone: '+15125550100',
      plan: 'pro',
      message: 'I want AI to answer my phones.',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO leads/i.test(sql));
    expect(insert).toBeTruthy();
    expect(insert[1]).toEqual(
      expect.arrayContaining(['Corner Cafe', 'owner@cornercafe.com', 'pro', 'landing'])
    );
  });

  test('rejects an invalid email with 400 and stores nothing', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ business_name: 'X Co', email: 'not-an-email' });
    expect(res.status).toBe(400);
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO leads/i.test(sql));
    expect(insert).toBeUndefined();
  });

  test('rejects a too-short business name with 400', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ business_name: 'X', email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('silently drops a honeypot-filled submission (bot) without storing', async () => {
    const res = await request(app).post('/api/public/leads').send({
      business_name: 'Spam Co',
      email: 'bot@spam.com',
      company_website: 'http://spam.example',
    });
    // Honeypot filled → looks successful to the bot, but nothing is stored.
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO leads/i.test(sql));
    expect(insert).toBeUndefined();
  });

  test('accepts an empty optional plan/message', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ business_name: 'Minimal Co', email: 'min@co.com', plan: '', message: '' });
    expect(res.status).toBe(201);
  });
});
