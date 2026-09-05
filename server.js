require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'noxi-personal' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOXI] personal page listening on port ${PORT}`);
});
