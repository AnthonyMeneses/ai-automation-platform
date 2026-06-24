/* eslint-disable no-console */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Usage: node scripts/create-admin.js <email> <password> [name]
// Falls back to ADMIN_EMAIL / ADMIN_PASSWORD from the environment.
async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js <email> <password> [name]');
    console.error('(or set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env)');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         is_active = TRUE`,
      [email.toLowerCase(), hash, name]
    );
    console.log(`Admin user ${email.toLowerCase()} is ready.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
