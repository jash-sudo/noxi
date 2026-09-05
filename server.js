require('dotenv').config();

const required = ['SESSION_SECRET','DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[NOXI] missing ${key}. Follow docs/FULL_SETUP.md.`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV === 'production' && process.env.SESSION_SECRET.length < 32) {
  console.error('[NOXI] SESSION_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

const app = require('./src/app');
const internalExtra = require('./src/internal-extra');
const PORT = Number(process.env.PORT || 3000);

app.use('/api/internal', internalExtra);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOXI] web service listening on port ${PORT}`);
});
