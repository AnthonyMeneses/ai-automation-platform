jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: { end: jest.fn() },
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/services/db');
const app = require('../src/app');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const REFRESH_ID = '22222222-2222-4222-8222-222222222222';

function buildAdmin(passwordHash) {
  return {
    id: ADMIN_ID,
    email: 'owner@example.com',
    name: 'Owner',
    password_hash: passwordHash,
    is_active: true,
  };
}

function mockDbFor(admin, refreshRow = null) {
  db.query.mockImplementation((sql) => {
    if (/FROM admin_users/i.test(sql)) return Promise.resolve({ rows: admin ? [admin] : [] });
    if (/INSERT INTO refresh_tokens/i.test(sql)) {
      return Promise.resolve({ rows: [{ id: REFRESH_ID }] });
    }
    if (/SELECT id, admin_user_id, token_hash/i.test(sql)) {
      return Promise.resolve({ rows: refreshRow ? [refreshRow] : [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

function cookieValue(setCookies, name) {
  const cookie = (setCookies || []).find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.split(';')[0] : null;
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [] });
  });

  test('rejects a malformed body with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('rejects unknown email with a generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('rejects a wrong password with the same generic 401', async () => {
    mockDbFor(buildAdmin(await bcrypt.hash('correct horse battery', 10)));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('issues httpOnly auth cookies on valid credentials', async () => {
    mockDbFor(buildAdmin(await bcrypt.hash('correct horse battery', 10)));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'correct horse battery' });

    expect(res.status).toBe(200);
    expect(res.body.admin).toEqual({ id: ADMIN_ID, email: 'owner@example.com', name: 'Owner' });

    const cookies = res.headers['set-cookie'];
    const joined = cookies.join(';;');
    expect(joined).toContain('access_token=');
    expect(joined).toContain('refresh_token=');
    expect(joined).toContain('csrf_token=');
    expect(cookies.find((c) => c.startsWith('access_token='))).toContain('HttpOnly');
    expect(cookies.find((c) => c.startsWith('csrf_token='))).not.toContain('HttpOnly');
  });
});

describe('POST /api/auth/refresh', () => {
  test('rotates the refresh token for a valid session', async () => {
    const admin = buildAdmin(await bcrypt.hash('correct horse battery', 10));
    mockDbFor(admin);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'correct horse battery' });
    const refreshCookie = cookieValue(login.headers['set-cookie'], 'refresh_token');

    mockDbFor(admin, {
      id: REFRESH_ID,
      admin_user_id: ADMIN_ID,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      revoked_at: null,
    });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', [refreshCookie]);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';;')).toContain('access_token=');
  });

  test('revokes the whole session family when a revoked token is replayed', async () => {
    const admin = buildAdmin(await bcrypt.hash('correct horse battery', 10));
    mockDbFor(admin, {
      id: REFRESH_ID,
      admin_user_id: ADMIN_ID,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      revoked_at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['refresh_token=stolen-token-value']);
    expect(res.status).toBe(401);
    const revokeAll = db.query.mock.calls.find(([sql]) =>
      /UPDATE refresh_tokens SET revoked_at = now\(\) WHERE admin_user_id/i.test(sql)
    );
    expect(revokeAll).toBeTruthy();
  });
});

describe('admin route protection', () => {
  test('blocks unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/clients');
    expect(res.status).toBe(401);
  });

  test('blocks cookie-authenticated writes without a CSRF header', async () => {
    const admin = buildAdmin(await bcrypt.hash('correct horse battery', 10));
    mockDbFor(admin);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'correct horse battery' });
    const accessCookie = cookieValue(login.headers['set-cookie'], 'access_token');

    const res = await request(app)
      .post(`/api/admin/clients/${ADMIN_ID}/support-tickets/${REFRESH_ID}/resolve`)
      .set('Cookie', [accessCookie]);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CSRF');
  });

  test('allows the same write when the CSRF header matches the cookie', async () => {
    const admin = buildAdmin(await bcrypt.hash('correct horse battery', 10));
    mockDbFor(admin);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'correct horse battery' });
    const cookies = login.headers['set-cookie'];
    const accessCookie = cookieValue(cookies, 'access_token');
    const csrfCookie = cookieValue(cookies, 'csrf_token');
    const csrfToken = csrfCookie.split('=')[1];

    const res = await request(app)
      .post(`/api/admin/clients/${ADMIN_ID}/support-tickets/${REFRESH_ID}/resolve`)
      .set('Cookie', [accessCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);

    // CSRF passed; the mocked db has no such ticket, so the route 404s.
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });
});
