const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { db }   = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF } = require('../middleware/helpers');
const { getSettings } = require('../middleware/settings');
const { sendOTP } = require('../middleware/mailer');

function gen6() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* USDT network options */
const WITHDRAW_NETWORKS = [
  { key: 'USDT_BEP20', label: 'BNB Smart Chain (BEP-20)', standard: 'BEP-20' },
  { key: 'USDT_ERC20', label: 'Ethereum (ERC-20)',         standard: 'ERC-20' },
  { key: 'USDT_SOL',   label: 'Solana (SPL)',              standard: 'SPL'    },
  { key: 'USDT_TRC20', label: 'Tron (TRC-20)',             standard: 'TRC-20' },
];

/* ── GET /withdraw ─────────────────────────── */
router.get('/', requireLogin, async (req, res) => {
  const user     = res.locals.user;
  const settings = getSettings();
  const hist = (await db.withdrawals.findAsync({ userId: user._id }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('withdraw', {
    user, hist, csrf: generateCSRF(req), error: null,
    networks: WITHDRAW_NETWORKS, minWithdrawal: settings.minWithdrawal || 5,
  });
});

/* ── POST /withdraw ────────────────────────── */
router.post('/', requireLogin, async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/withdraw'); }

  const user     = res.locals.user;
  const settings = getSettings();
  const minWd    = settings.minWithdrawal || 5;

  const renderErr = (error) =>
    db.withdrawals.findAsync({ userId: user._id }).then(hist => {
      hist.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.render('withdraw', { user, hist, csrf: generateCSRF(req), error, networks: WITHDRAW_NETWORKS, minWithdrawal: minWd });
    });

  const amount = parseFloat(req.body.amount);
  const netKey = req.body.network_key;
  const wallet = (req.body.wallet_address || '').trim();
  const net    = WITHDRAW_NETWORKS.find(n => n.key === netKey);

  if (isNaN(amount) || amount < minWd)    return renderErr(`Minimum withdrawal is $${minWd}.`);
  if (amount > (user.balance || 0))       return renderErr('Insufficient balance.');
  if (!net)                               return renderErr('Please select a valid USDT network.');
  if (wallet.length < 20)                 return renderErr('Enter a valid wallet address (min 20 characters).');

  const pending = await db.withdrawals.findOneAsync({ userId: user._id, status: { $in: ['pending', 'processing'] } });
  if (pending) return renderErr('You already have a pending withdrawal. Wait for it to be processed.');

  // Require withdrawal PIN to be set
  if (!user.withdrawPin) {
    req.flash('error', 'You must set a withdrawal PIN in Security Settings before making a withdrawal.');
    return res.redirect('/security');
  }

  // Generate OTP, store pending withdrawal in session
  const otp = gen6();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  req.session.pendingWithdrawal = {
    userId:       user._id,
    amount,
    networkKey:   net.key,
    networkLabel: net.label,
    networkStd:   net.standard,
    wallet,
    otp,
    otpExpires:   otpExpires.toISOString(),
  };

  try { await sendOTP(user.email, otp, 'withdraw', null); } catch (e) { console.error('[mailer]', e.message); }

  req.flash('info', `A verification code was sent to ${user.email}. Enter it below with your PIN.`);
  res.redirect('/withdraw/verify');
});

/* ── GET /withdraw/verify ──────────────────── */
router.get('/verify', requireLogin, (req, res) => {
  const pw = req.session.pendingWithdrawal;
  if (!pw || pw.userId !== res.locals.user._id) {
    req.flash('error', 'No pending withdrawal. Please start again.');
    return res.redirect('/withdraw');
  }
  res.render('withdraw-verify', { csrf: generateCSRF(req), pending: pw });
});

/* ── POST /withdraw/verify ─────────────────── */
router.post('/verify', requireLogin, async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/withdraw/verify'); }

  const user = res.locals.user;
  const pw   = req.session.pendingWithdrawal;

  if (!pw || pw.userId !== user._id) {
    req.flash('error', 'Session expired. Please start withdrawal again.');
    return res.redirect('/withdraw');
  }

  const { otp, pin } = req.body;

  // Check OTP
  if (!otp || otp.trim() !== pw.otp) {
    req.flash('error', 'Incorrect verification code. Please try again.');
    return res.redirect('/withdraw/verify');
  }
  if (new Date() > new Date(pw.otpExpires)) {
    req.flash('error', 'Verification code expired. Please request a new withdrawal.');
    delete req.session.pendingWithdrawal;
    return res.redirect('/withdraw');
  }

  // Check PIN
  const freshUser = await db.users.findOneAsync({ _id: user._id });
  if (!freshUser.withdrawPin || !bcrypt.compareSync((pin || '').trim(), freshUser.withdrawPin)) {
    req.flash('error', 'Incorrect withdrawal PIN. Please try again.');
    return res.redirect('/withdraw/verify');
  }

  // Re-validate balance (could have changed)
  const settings = getSettings();
  const minWd    = settings.minWithdrawal || 5;
  if (pw.amount > (freshUser.balance || 0)) {
    req.flash('error', 'Insufficient balance.');
    delete req.session.pendingWithdrawal;
    return res.redirect('/withdraw');
  }
  if (pw.amount < minWd) {
    req.flash('error', `Minimum withdrawal is $${minWd}.`);
    delete req.session.pendingWithdrawal;
    return res.redirect('/withdraw');
  }

  // Check for pending withdrawal (race condition guard)
  const existingPending = await db.withdrawals.findOneAsync({ userId: user._id, status: { $in: ['pending', 'processing'] } });
  if (existingPending) {
    req.flash('error', 'You already have a pending withdrawal.');
    delete req.session.pendingWithdrawal;
    return res.redirect('/withdraw');
  }

  // Process withdrawal
  const createdAt = new Date();
  await db.users.updateAsync({ _id: user._id }, { $inc: { balance: -pw.amount, totalWithdrawn: pw.amount } });
  const wd = await db.withdrawals.insertAsync({
    userId:       user._id,
    amountUsd:    pw.amount,
    cryptoType:   `USDT (${pw.networkStd})`,
    networkKey:   pw.networkKey,
    networkLabel: pw.networkLabel,
    walletAddress: pw.wallet,
    status:       'pending',
    createdAt,
  });
  await db.transactions.insertAsync({
    userId: user._id, type: 'withdrawal', amount: pw.amount,
    description: `Withdrawal via USDT ${pw.networkStd}`,
    refId: wd._id, createdAt,
  });

  // Store success data for confirmation page
  req.session.lastWithdrawal = {
    refId:        wd._id,
    amount:       pw.amount,
    networkLabel: pw.networkLabel,
    networkStd:   pw.networkStd,
    wallet:       pw.wallet,
    submittedAt:  createdAt.toISOString(),
  };
  delete req.session.pendingWithdrawal;
  req.session.save(() => res.redirect('/withdraw/success'));
});

/* ── GET /withdraw/success ─────────────────── */
router.get('/success', requireLogin, (req, res) => {
  const wd = req.session.lastWithdrawal;
  if (!wd) return res.redirect('/transactions');
  delete req.session.lastWithdrawal;
  res.render('withdraw-success', { wd });
});

/* ── POST /withdraw/verify/resend ──────────── */
router.post('/verify/resend', requireLogin, async (req, res) => {
  const user = res.locals.user;
  const pw   = req.session.pendingWithdrawal;
  if (!pw || pw.userId !== user._id) return res.redirect('/withdraw');

  const otp = gen6();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  pw.otp        = otp;
  pw.otpExpires = otpExpires.toISOString();
  req.session.pendingWithdrawal = pw;

  try { await sendOTP(user.email, otp, 'withdraw', null); } catch (e) { console.error('[mailer]', e.message); }
  req.flash('info', 'A new verification code was sent to your email.');
  res.redirect('/withdraw/verify');
});

module.exports = router;
