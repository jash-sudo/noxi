const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Follow docs/FULL_SETUP.md to create the free hosted Postgres database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function userById(id) {
  return one('SELECT * FROM users WHERE id=$1', [id]);
}

async function userByUsername(username) {
  return one('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username]);
}

async function userByEmail(email) {
  return one('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
}

async function profileBundle(userId) {
  const profile = await one('SELECT * FROM profiles WHERE user_id=$1', [userId]);
  const links = (await query('SELECT * FROM links WHERE user_id=$1 AND visible=TRUE ORDER BY position,id', [userId])).rows;
  const socials = (await query('SELECT * FROM social_links WHERE user_id=$1 ORDER BY position,id', [userId])).rows;
  return { profile, links, socials };
}

async function setting(key, fallback) {
  const row = await one('SELECT value FROM site_settings WHERE key=$1', [key]);
  return row ? row.value : fallback;
}

async function audit(adminUserId, targetUserId, action, reason = '', metadata = {}) {
  await query(
    'INSERT INTO audit_logs(admin_user_id,target_user_id,action,reason,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
    [adminUserId, targetUserId || null, action, reason, JSON.stringify(metadata)]
  );
}

module.exports = { pool, query, one, tx, userById, userByUsername, userByEmail, profileBundle, setting, audit };
