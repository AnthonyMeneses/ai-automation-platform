/* eslint-disable no-console */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Development seed data: a dev admin plus three clients with subscriptions,
// payments, websites, calls (with transcripts), payroll connections, and
// support tickets. Idempotent — safe to run repeatedly.
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'change-me-now-please';
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: using default dev admin credentials (admin@example.com / change-me-now-please).');
    console.warn('Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env or run scripts/create-admin.js.');
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, name)
     VALUES ($1, $2, 'Admin')
     ON CONFLICT (email) DO NOTHING`,
    [email, hash]
  );
  console.log(`admin ready: ${email}`);
}

async function ensureClient(client) {
  const { rows } = await pool.query(`SELECT id FROM clients WHERE lower(email) = lower($1)`, [
    client.email,
  ]);
  if (rows.length > 0) return rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO clients (business_name, email, phone, twilio_phone_number, subscription_tier, status, stripe_customer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      client.business_name,
      client.email,
      client.phone,
      client.twilio_phone_number,
      client.subscription_tier,
      client.status,
      client.stripe_customer_id,
    ]
  );
  return inserted.rows[0].id;
}

async function seedClient(clientId, data) {
  await pool.query(
    `INSERT INTO subscriptions (client_id, stripe_subscription_id, status, amount_cents, current_period_start, current_period_end)
     VALUES ($1, $2, $3, $4, now() - interval '12 days', now() + interval '18 days')
     ON CONFLICT (stripe_subscription_id) DO NOTHING`,
    [clientId, data.stripe_subscription_id, data.subscription_status, data.amount_cents]
  );

  for (const payment of data.payments) {
    await pool.query(
      `INSERT INTO payments (client_id, stripe_invoice_id, amount_cents, status, failure_reason, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (stripe_invoice_id) DO NOTHING`,
      [
        clientId,
        payment.invoice_id,
        data.amount_cents,
        payment.status,
        payment.failure_reason || null,
        payment.status === 'succeeded' ? payment.at : null,
        payment.at,
      ]
    );
  }

  await pool.query(
    `INSERT INTO websites (client_id, domain, template_id, content, published, published_url, last_published_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (client_id) DO NOTHING`,
    [
      clientId,
      data.domain,
      data.template_id,
      JSON.stringify({ hero_title: data.business_name, theme: 'clean', sections: ['hero', 'services', 'contact'] }),
      data.published,
      data.published ? `https://${data.domain}` : null,
    ]
  );

  for (const call of data.calls) {
    await pool.query(
      `INSERT INTO phone_calls
         (client_id, twilio_call_sid, direction, caller_phone, to_phone, duration_seconds,
          transcript, call_outcome, ai_intent, ai_sentiment, ai_summary, ai_action_items, created_at)
       VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (twilio_call_sid) DO NOTHING`,
      [
        clientId,
        call.sid,
        call.from,
        data.twilio_phone_number,
        call.duration,
        call.transcript,
        call.outcome,
        call.intent,
        call.sentiment,
        call.summary,
        JSON.stringify(call.action_items),
        call.at,
      ]
    );
  }

  const connection = await pool.query(
    `INSERT INTO payroll_connections (client_id, payroll_service, api_status, last_sync_at, last_error)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id, payroll_service) DO NOTHING
     RETURNING id`,
    [
      clientId,
      data.payroll_service,
      data.payroll_status,
      data.payroll_status === 'synced' ? new Date() : null,
      data.payroll_error || null,
    ]
  );
  if (connection.rows[0]) {
    await pool.query(
      `INSERT INTO payroll_sync_logs (connection_id, client_id, status, validation_result, error_message, finished_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [
        connection.rows[0].id,
        clientId,
        data.payroll_status === 'synced' ? 'success' : 'error',
        JSON.stringify({ is_valid: data.payroll_status === 'synced', errors: [], warnings: [] }),
        data.payroll_error || null,
      ]
    );
  }

  for (const ticket of data.tickets) {
    const existing = await pool.query(
      `SELECT 1 FROM support_tickets WHERE client_id = $1 AND subject = $2`,
      [clientId, ticket.subject]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO support_tickets (client_id, subject, message, status, priority)
         VALUES ($1, $2, $3, $4, $5)`,
        [clientId, ticket.subject, ticket.message, ticket.status, ticket.priority]
      );
    }
  }
}

const CLIENTS = [
  {
    business_name: 'Bright Smile Dental',
    email: 'office@brightsmiledental.example',
    phone: '+15125550111',
    twilio_phone_number: '+15125550199',
    subscription_tier: 'pro',
    status: 'active',
    stripe_customer_id: 'cus_seed_brightsmile',
    stripe_subscription_id: 'sub_seed_brightsmile',
    subscription_status: 'active',
    amount_cents: 19900,
    domain: 'brightsmiledental.example',
    template_id: 'healthcare-01',
    published: true,
    payments: [
      { invoice_id: 'in_seed_bs_1', status: 'succeeded', at: new Date(Date.now() - 40 * 864e5) },
      { invoice_id: 'in_seed_bs_2', status: 'succeeded', at: new Date(Date.now() - 10 * 864e5) },
    ],
    calls: [
      {
        sid: 'CA_seed_bs_1',
        from: '+15125550321',
        duration: 48,
        outcome: 'voicemail',
        transcript:
          "Hi, this is Maria Gonzales. I chipped a tooth this morning and I'm in a lot of pain. Can someone call me back today? My number is the one I'm calling from. Thank you.",
        intent: 'scheduling',
        sentiment: 'negative',
        summary: 'Patient with a chipped tooth requesting an urgent same-day callback.',
        action_items: ['Call Maria Gonzales back today', 'Offer emergency appointment slot'],
        at: new Date(Date.now() - 2 * 864e5),
      },
      {
        sid: 'CA_seed_bs_2',
        from: '+15125550456',
        duration: 31,
        outcome: 'voicemail',
        transcript:
          'Hello, just checking whether you take Delta Dental insurance, and what a cleaning costs without insurance. You can text me back if that is easier.',
        intent: 'inquiry',
        sentiment: 'neutral',
        summary: 'Caller asking about Delta Dental coverage and self-pay cleaning price.',
        action_items: ['Reply with insurance and pricing info'],
        at: new Date(Date.now() - 6 * 864e5),
      },
    ],
    payroll_service: 'gusto',
    payroll_status: 'synced',
    tickets: [
      {
        subject: 'Update office hours on website',
        message: 'We are now closed Fridays. Can you update the site footer and the hours section?',
        status: 'open',
        priority: 'normal',
      },
    ],
  },
  {
    business_name: 'Lakeside Auto Repair',
    email: 'service@lakesideauto.example',
    phone: '+15125550222',
    twilio_phone_number: '+15125550299',
    subscription_tier: 'starter',
    status: 'active',
    stripe_customer_id: 'cus_seed_lakeside',
    stripe_subscription_id: 'sub_seed_lakeside',
    subscription_status: 'past_due',
    amount_cents: 9900,
    domain: 'lakesideautorepair.example',
    template_id: 'services-02',
    published: true,
    payments: [
      { invoice_id: 'in_seed_la_1', status: 'succeeded', at: new Date(Date.now() - 35 * 864e5) },
      {
        invoice_id: 'in_seed_la_2',
        status: 'failed',
        failure_reason: 'Your card was declined.',
        at: new Date(Date.now() - 4 * 864e5),
      },
    ],
    calls: [
      {
        sid: 'CA_seed_la_1',
        from: '+15125550789',
        duration: 64,
        outcome: 'voicemail',
        transcript:
          "Yeah hi, my check engine light came on driving on 183 and the car is shaking pretty bad. I don't think I should drive it. Do you guys do towing or work with anyone? Call me back, it's Dave.",
        intent: 'support',
        sentiment: 'negative',
        summary: 'Dave has a shaking car with a check engine light and asks about towing options.',
        action_items: ['Call Dave back about towing', 'Reserve a diagnostic slot'],
        at: new Date(Date.now() - 1 * 864e5),
      },
    ],
    payroll_service: 'adp',
    payroll_status: 'error',
    payroll_error: 'ADP auth responded with 401',
    tickets: [
      {
        subject: 'Payment failed - card expired',
        message: 'Our card on file expired. How do we update billing details?',
        status: 'open',
        priority: 'high',
      },
    ],
  },
  {
    business_name: 'Petal & Stem Florist',
    email: 'hello@petalandstem.example',
    phone: '+15125550333',
    twilio_phone_number: '+15125550399',
    subscription_tier: 'enterprise',
    status: 'trial',
    stripe_customer_id: 'cus_seed_petal',
    stripe_subscription_id: 'sub_seed_petal',
    subscription_status: 'trialing',
    amount_cents: 39900,
    domain: 'petalandstem.example',
    template_id: 'retail-03',
    published: false,
    payments: [],
    calls: [
      {
        sid: 'CA_seed_ps_1',
        from: '+15125550654',
        duration: 52,
        outcome: 'voicemail',
        transcript:
          "Hi! I'm getting married October 17th and I love your arrangements on Instagram. Could I get a quote for bridal party flowers, around eight bouquets plus centerpieces for twelve tables?",
        intent: 'sales',
        sentiment: 'positive',
        summary: 'Wedding inquiry for Oct 17: 8 bouquets and centerpieces for 12 tables.',
        action_items: ['Send wedding package quote', 'Schedule consultation call'],
        at: new Date(Date.now() - 3 * 864e5),
      },
    ],
    payroll_service: 'gusto',
    payroll_status: 'pending',
    tickets: [
      {
        subject: 'Help connecting Gusto',
        message: 'We signed up for Gusto last week. What do you need from us to connect payroll?',
        status: 'in_progress',
        priority: 'normal',
      },
    ],
  },
];

async function main() {
  await ensureAdmin();
  for (const data of CLIENTS) {
    const clientId = await ensureClient(data);
    await seedClient(clientId, data);
    console.log(`seeded ${data.business_name} (${clientId})`);
  }
  await pool.end();
  console.log('seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
