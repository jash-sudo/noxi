require('dotenv').config();

let failed = false;
const prod = process.env.NODE_ENV === 'production';

function weak(value = '') {
  return !value || value.length < 32 || /replace-with|change-me|example|dev-only/i.test(value);
}

if (!process.env.DATABASE_URL) {
  console.error('[NOXI] DATABASE_URL is required.');
  failed = true;
}

if (!process.env.SESSION_SECRET || (prod && weak(process.env.SESSION_SECRET))) {
  console.error('[NOXI] SESSION_SECRET is missing or too weak.');
  failed = true;
}

if (prod) {
  if (!/^https:\/\//i.test(process.env.BASE_URL || '')) {
    console.error('[NOXI] BASE_URL must be an https:// URL in production.');
    failed = true;
  }
  for (const key of ['OWNER_SETUP_TOKEN','NOXI_INTERNAL_API_SECRET']) {
    if (weak(process.env[key] || '')) {
      console.error(`[NOXI] ${key} is missing or too weak for production.`);
      failed = true;
    }
  }
}

if (process.env.DISCORD_BOT_TOKEN && !process.env.NOXI_INTERNAL_API_SECRET) {
  console.error('[NOXI] Discord bot requires NOXI_INTERNAL_API_SECRET.');
  failed = true;
}

if (process.env.REWARDED_ADS_ENABLED === 'true' && !process.env.REWARDED_AD_WEBHOOK_SECRET) {
  console.error('[NOXI] Rewarded ads cannot be enabled without REWARDED_AD_WEBHOOK_SECRET.');
  failed = true;
}

if ((process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET)) {
  console.error('[NOXI] Supabase Storage requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET together.');
  failed = true;
}

if (failed) process.exit(1);
console.log('[NOXI] environment check passed');
console.log('[NOXI] generate a secret with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
