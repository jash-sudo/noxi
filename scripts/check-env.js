require('dotenv').config();
const crypto = require('crypto');

const requiredProd = ['SESSION_SECRET','OWNER_SETUP_TOKEN','BASE_URL'];
let failed = false;

function weak(v='') {
  return !v || v.length < 32 || /change-me|example|dev-only/i.test(v);
}

if (process.env.NODE_ENV === 'production') {
  for (const key of requiredProd) {
    if (weak(process.env[key])) {
      console.error(`[NOXI] ${key} is missing or too weak for production.`);
      failed = true;
    }
  }
  if (!process.env.DATABASE_URL) {
    console.error('[NOXI] DATABASE_URL is required in production so user data is not stored in ephemeral SQLite.');
    failed = true;
  }
}

if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.length < 40) {
  console.error('[NOXI] DISCORD_BOT_TOKEN looks invalid.');
  failed = true;
}

if (failed) process.exit(1);
console.log('[NOXI] environment check passed');
console.log('[NOXI] generate a secret with:');
console.log(`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
