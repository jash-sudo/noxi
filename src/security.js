const crypto = require('crypto');

const RESERVED = new Set(['admin','api','login','logout','register','dashboard','settings','support','help','donate','premium','privacy','terms','report','static','health','reset','forgot','staff','noxi','www']);

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function validUsername(value) {
  const v = String(value || '');
  return /^[a-zA-Z0-9_-]{3,20}$/.test(v) && !RESERVED.has(v.toLowerCase());
}

function validUrl(value, { allowEmpty = true } = {}) {
  if (!value && allowEmpty) return true;
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && value.length <= 800;
  } catch {
    return false;
  }
}

function color(value, fallback = '#ffffff') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

function int(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function newCsrf(req) {
  if (!req.session.csrf) req.session.csrf = token(24);
  return req.session.csrf;
}

function csrfField(req) {
  return `<input type="hidden" name="_csrf" value="${esc(newCsrf(req))}">`;
}

function verifyCsrf(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/internal/') || req.path === '/api/rewards/provider-callback') return next();
  const supplied = req.body?._csrf || req.get('x-csrf-token');
  if (!supplied || !req.session.csrf || !timingSafeEqual(supplied, req.session.csrf)) {
    return res.status(403).send('invalid csrf token');
  }
  next();
}

module.exports = { esc, validUsername, validUrl, color, int, token, hashToken, timingSafeEqual, newCsrf, csrfField, verifyCsrf };
