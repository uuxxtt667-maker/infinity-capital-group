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

function generateCSRF(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function verifyCSRF(req) {
  return req.body._csrf && req.session.csrf && req.body._csrf === req.session.csrf;
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
