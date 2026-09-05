require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[NOXI] DATABASE_URL is missing. Copy .env.example to .env and add the private Postgres URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : undefined
});

(async()=>{
  try {
    const sql = fs.readFileSync(path.join(__dirname,'..','db','schema.sql'),'utf8');
    await pool.query(sql);
    console.log('[NOXI] database schema ready');
  } catch (e) {
    console.error('[NOXI] database setup failed:',e.message);
    process.exitCode=1;
  } finally {
    await pool.end();
  }
})();
