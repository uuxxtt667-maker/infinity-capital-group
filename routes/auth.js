const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { db }  = require('../database');
const { generateCode, generateCSRF, verifyCSRF } = require('../middleware/helpers');
const { sendOTP } = require('../middleware/mailer');

/* ─── helpers ─────────────────────────────── */
function gen6() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* ════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════ */
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { csrf: generateCSRF(req) });
});

router.post('/login', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/login'); }
  const { login, password } = req.body;
  const user = await db.users.findOneAsync({ $or: [{ username: login }, { email: login }] });
  if (!user || !user.isActive || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Invalid credentials.');
    return res.redirect('/login');
  }
  // Email not yet verified → resend OTP and redirect to verify page
  if (user.emailVerified === false) {
    const otp = gen6();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await db.users.updateAsync({ _id: user._id }, { $set: { otpCode: otp, otpExpires } });
    req.session.pendingUserId = user._id;
    try { await sendOTP(user.email, otp, 'verify', null); } catch (e) { console.error('[mailer]', e.message); }
    req.flash('info', 'Your email is not verified. We sent a new code to ' + user.email);
    return res.redirect('/verify-email');
  }
  // 2FA enabled → send OTP and redirect to 2FA page
  if (user.twoFAEnabled) {
    const otp = gen6();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    req.session.login2fa = { userId: user._id, otp, otpExpires: otpExpires.toISOString() };
    try { await sendOTP(user.email, otp, '2fa', null); } catch (e) { console.error('[mailer]', e.message); }
    req.flash('info', `A security code was sent to ${user.email}.`);
    return res.redirect('/login/2fa');
  }
  req.session.userId = user._id;
  req.flash('success', `Welcome back, ${user.username}!`);
  res.redirect('/dashboard');
});

/* ════════════════════════════════════════════
   LOGIN 2FA
════════════════════════════════════════════ */
router.get('/login/2fa', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  if (!req.session.login2fa) return res.redirect('/login');
  res.render('login-2fa', { csrf: generateCSRF(req) });
});

router.post('/login/2fa', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/login/2fa'); }
  if (!req.session.login2fa) return res.redirect('/login');

  const { otp } = req.body;
  const { userId, otp: storedOtp, otpExpires } = req.session.login2fa;

  if (!otp || otp.trim() !== storedOtp) {
    req.flash('error', 'Incorrect code. Please try again.');
    return res.redirect('/login/2fa');
  }
  if (new Date() > new Date(otpExpires)) {
    req.flash('error', 'Code expired. Please sign in again.');
    delete req.session.login2fa;
    return res.redirect('/login');
  }

  delete req.session.login2fa;
  req.session.userId = userId;
  const user = await db.users.findOneAsync({ _id: userId });
  req.flash('success', `Welcome back, ${(user || {}).username || ''}!`);
  res.redirect('/dashboard');
});

router.post('/login/2fa/resend', async (req, res) => {
  if (!req.session.login2fa) return res.redirect('/login');
  const user = await db.users.findOneAsync({ _id: req.session.login2fa.userId });
  if (!user) return res.redirect('/login');

  const otp = gen6();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  req.session.login2fa = { userId: user._id, otp, otpExpires: otpExpires.toISOString() };
  try { await sendOTP(user.email, otp, '2fa', null); } catch (e) { console.error('[mailer]', e.message); }
  req.flash('info', `A new security code was sent to ${user.email}.`);
  res.redirect('/login/2fa');
});

/* ════════════════════════════════════════════
   REGISTER
════════════════════════════════════════════ */
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { csrf: generateCSRF(req), ref: req.query.ref || '' });
});

router.post('/register', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request. Please refresh and try again.'); return res.redirect('/register'); }
  const { username, email, password, confirm_password, ref_code } = req.body;

  if (!username || username.length < 3) { req.flash('error', 'Username must be at least 3 characters.'); return res.redirect('/register'); }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { req.flash('error', 'Username may only contain letters, numbers and underscores.'); return res.redirect('/register'); }
  if (!email || !email.includes('@')) { req.flash('error', 'Please enter a valid email address.'); return res.redirect('/register'); }
  if (!password || password.length < 8) { req.flash('error', 'Password must be at least 8 characters.'); return res.redirect('/register'); }
  if (password !== confirm_password) { req.flash('error', 'Passwords do not match. Please try again.'); return res.redirect('/register'); }

  const exists = await db.users.findOneAsync({ $or: [{ username }, { email }] });
  if (exists) { req.flash('error', 'That username or email is already registered. Please sign in or use a different one.'); return res.redirect('/register'); }

  let referredBy = null;
  if (ref_code) {
    const referrer = await db.users.findOneAsync({ referralCode: ref_code.toUpperCase() });
    if (referrer) referredBy = referrer._id;
  }

  let code = generateCode();
  while (await db.users.findOneAsync({ referralCode: code })) code = generateCode();

  const otp = gen6();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  const hash = bcrypt.hashSync(password, 12);

  const user = await db.users.insertAsync({
    username, email, password: hash, referralCode: code,
    referredBy, planId: 'plan1', planExpires: null,
    balance: 0, totalEarned: 0, totalWithdrawn: 0,
    totalInvested: 0, referralEarnings: 0,
    clicksToday: 0, lastClickReset: null,
    isAdmin: false, isActive: true, createdAt: new Date(),
    emailVerified: false, otpCode: otp, otpExpires,
  });

  // Send verification email (non-blocking — failure just logs)
  try { await sendOTP(email, otp, 'verify', null); } catch (e) { console.error('[mailer]', e.message); }

  req.session.pendingUserId = user._id;
  req.flash('info', `A verification code was sent to ${email}. Please enter it below.`);
  res.redirect('/verify-email');
});

/* ════════════════════════════════════════════
   VERIFY EMAIL
════════════════════════════════════════════ */
router.get('/verify-email', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  if (!req.session.pendingUserId) return res.redirect('/register');
  res.render('verify-email', { csrf: generateCSRF(req) });
});

router.post('/verify-email', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/verify-email'); }
  if (!req.session.pendingUserId) return res.redirect('/register');

  const code = (req.body.otp || '').trim();
  const user = await db.users.findOneAsync({ _id: req.session.pendingUserId });

  if (!user) { req.flash('error', 'Session expired. Please register again.'); return res.redirect('/register'); }
  if (!code || user.otpCode !== code) { req.flash('error', 'Incorrect code. Please try again.'); return res.redirect('/verify-email'); }
  if (new Date() > new Date(user.otpExpires)) { req.flash('error', 'Code expired. Please request a new one.'); return res.redirect('/verify-email'); }

  await db.users.updateAsync({ _id: user._id }, { $set: { emailVerified: true, otpCode: null, otpExpires: null } });
  delete req.session.pendingUserId;
  req.session.userId = user._id;
  req.flash('success', `Email verified! Welcome to the platform, ${user.username}!`);
  res.redirect('/dashboard');
});

// Resend verification code
router.post('/verify-email/resend', async (req, res) => {
  if (!req.session.pendingUserId) return res.redirect('/register');
  const user = await db.users.findOneAsync({ _id: req.session.pendingUserId });
  if (!user) return res.redirect('/register');

  const otp = gen6();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  await db.users.updateAsync({ _id: user._id }, { $set: { otpCode: otp, otpExpires } });
  try { await sendOTP(user.email, otp, 'verify', null); } catch (e) { console.error('[mailer]', e.message); }

  req.flash('info', `A new code was sent to ${user.email}.`);
  res.redirect('/verify-email');
});

/* ════════════════════════════════════════════
   FORGOT PASSWORD
════════════════════════════════════════════ */
router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('forgot-password', { csrf: generateCSRF(req) });
});

router.post('/forgot-password', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/forgot-password'); }
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) { req.flash('error', 'Please enter your email address.'); return res.redirect('/forgot-password'); }

  const user = await db.users.findOneAsync({ email });
  // Always show success message (don't reveal if email exists)
  if (user) {
    const otp = gen6();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await db.users.updateAsync({ _id: user._id }, { $set: { resetOtp: otp, resetOtpExpires: otpExpires } });
    try { await sendOTP(email, otp, 'reset', null); } catch (e) { console.error('[mailer]', e.message); }
    req.session.resetEmail = email;
  }

  req.flash('info', `If that email exists in our system, a reset code has been sent.`);
  res.redirect('/reset-password');
});

/* ════════════════════════════════════════════
   RESET PASSWORD
════════════════════════════════════════════ */
router.get('/reset-password', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  if (!req.session.resetEmail) return res.redirect('/forgot-password');
  res.render('reset-password', { csrf: generateCSRF(req), email: req.session.resetEmail });
});

router.post('/reset-password', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/reset-password'); }
  if (!req.session.resetEmail) return res.redirect('/forgot-password');

  const { otp, password, confirm_password } = req.body;
  const email = req.session.resetEmail;

  if (!otp) { req.flash('error', 'Please enter the verification code.'); return res.redirect('/reset-password'); }
  if (!password || password.length < 8) { req.flash('error', 'Password must be at least 8 characters.'); return res.redirect('/reset-password'); }
  if (password !== confirm_password) { req.flash('error', 'Passwords do not match.'); return res.redirect('/reset-password'); }

  const user = await db.users.findOneAsync({ email });
  if (!user || !user.resetOtp || user.resetOtp !== otp) {
    req.flash('error', 'Invalid or expired code. Please try again.');
    return res.redirect('/reset-password');
  }
  if (new Date() > new Date(user.resetOtpExpires)) {
    req.flash('error', 'Code expired. Please request a new reset code.');
    return res.redirect('/forgot-password');
  }

  const hash = bcrypt.hashSync(password, 12);
  await db.users.updateAsync({ _id: user._id }, { $set: { password: hash, resetOtp: null, resetOtpExpires: null } });
  delete req.session.resetEmail;

  req.flash('success', 'Password updated! You can now sign in with your new password.');
  res.redirect('/login');
});

// Resend reset code
router.post('/reset-password/resend', async (req, res) => {
  if (!req.session.resetEmail) return res.redirect('/forgot-password');
  const email = req.session.resetEmail;
  const user = await db.users.findOneAsync({ email });
  if (user) {
    const otp = gen6();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await db.users.updateAsync({ _id: user._id }, { $set: { resetOtp: otp, resetOtpExpires: otpExpires } });
    try { await sendOTP(email, otp, 'reset', null); } catch (e) { console.error('[mailer]', e.message); }
  }
  req.flash('info', 'A new reset code has been sent to your email.');
  res.redirect('/reset-password');
});

/* ════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════ */
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
