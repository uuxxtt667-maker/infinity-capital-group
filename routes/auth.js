const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { db }  = require('../database');
const { generateCode, generateCSRF, verifyCSRF } = require('../middleware/helpers');

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
  req.session.userId = user._id;
  req.flash('success', `Welcome back, ${user.username}!`);
  res.redirect('/dashboard');
});

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

  const hash = bcrypt.hashSync(password, 12);
  const user = await db.users.insertAsync({
    username, email, password: hash, referralCode: code,
    referredBy, planId: 'plan1', planExpires: null,
    balance: 0, totalEarned: 0, totalWithdrawn: 0,
    totalInvested: 0, referralEarnings: 0,
    clicksToday: 0, lastClickReset: null,
    isAdmin: false, isActive: true, createdAt: new Date(),
  });

  req.session.userId = user._id;
  req.flash('success', `Welcome to CryptoPTC, ${username}!`);
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
