const crypto = require('crypto');

function formatMoney(n, d = 4) {
  return '$' + Number(n || 0).toFixed(d);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function generateCode(len = 8) {
  return crypto.randomBytes(8).toString('hex').slice(0, len).toUpperCase();
}

/*
 * Stateless HMAC-based CSRF — works without session persistence.
 * Token = timestamp.HMAC(secret, timestamp)
 * Valid for 2 hours. No session read/write needed.
 */
const CSRF_SECRET = process.env.SESSION_SECRET || 'ptc-csrf-hmac-key-2024';
const CSRF_TTL    = 2 * 60 * 60 * 1000; // 2 hours

function generateCSRF(req) {
  const ts    = Date.now();
  const hmac  = crypto.createHmac('sha256', CSRF_SECRET).update(String(ts)).digest('hex');
  return ts + '.' + hmac;
}

function verifyCSRF(req) {
  const token = (req.body && req.body._csrf) || '';
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const ts  = parseInt(token.slice(0, dot), 10);
  const sig = token.slice(dot + 1);
  if (isNaN(ts) || Date.now() - ts > CSRF_TTL) return false;
  const expected = crypto.createHmac('sha256', CSRF_SECRET).update(String(ts)).digest('hex');
  /* constant-time compare */
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return sig === expected;
  }
}

function isPlanActive(user) {
  if (user.planId === 'plan1') return true;
  if (!user.planExpires) return false;
  return new Date(user.planExpires) > new Date();
}

function getCryptoAmount(usd, crypto) {
  const rates = { BTC: 68000, USDT: 1 };
  return (usd / (rates[crypto] || 1)).toFixed(8);
}

function statusBadge(status) {
  const map = {
    pending:    'badge-warning',
    confirmed:  'badge-success',
    completed:  'badge-success',
    processing: 'badge-info',
    rejected:   'badge-danger',
  };
  return `<span class="badge ${map[status] || 'badge-secondary'}">${status}</span>`;
}

module.exports = { formatMoney, formatDate, generateCode, generateCSRF, verifyCSRF, isPlanActive, getCryptoAmount, statusBadge };
