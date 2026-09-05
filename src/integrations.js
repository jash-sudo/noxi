const crypto = require('crypto');

async function sendResetEmail(to, resetUrl) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { sent: false, reason: 'email_not_configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: 'NOXI password reset', html: `<p>Reset your NOXI password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires soon.</p>` })
  });
  if (!response.ok) throw new Error(`email provider returned ${response.status}`);
  return { sent: true };
}

function storageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET);
}

async function uploadToStorage(buffer, mime, originalName, userId) {
  if (!storageConfigured()) throw new Error('storage is not configured');
  const extMap = { 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','audio/mpeg':'mp3','audio/ogg':'ogg' };
  const ext = extMap[mime];
  if (!ext) throw new Error('unsupported file type');
  const name = `${userId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const bucket = encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET);
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${name}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': mime, 'x-upsert': 'false' },
    body: buffer
  });
  if (!response.ok) throw new Error(`storage provider returned ${response.status}`);
  return `${base}/storage/v1/object/public/${bucket}/${name}`;
}

function verifyRewardSignature(rawBody, signature) {
  const secret = process.env.REWARDED_AD_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}

module.exports = { sendResetEmail, storageConfigured, uploadToStorage, verifyRewardSignature };
