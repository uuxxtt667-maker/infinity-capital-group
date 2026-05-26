const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF } = require('../middleware/helpers');

router.use(requireLogin);

/* ── GET /security ─────────────────────────────── */
router.get('/', (req, res) => {
  res.render('security', { csrf: generateCSRF(req) });
});

/* ── POST /security/set-pin ─────────────────────── */
router.post('/set-pin', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/security'); }
  const user = res.locals.user;
  const { password, pin, pin_confirm } = req.body;

  if (!bcrypt.compareSync(password || '', user.password)) {
    req.flash('error', 'Incorrect password. PIN not changed.');
    return res.redirect('/security');
  }
  const pinStr = (pin || '').trim();
  if (!/^\d{4,6}$/.test(pinStr)) {
    req.flash('error', 'PIN must be 4–6 digits (numbers only).');
    return res.redirect('/security');
  }
  if (pinStr !== (pin_confirm || '').trim()) {
    req.flash('error', 'PINs do not match.');
    return res.redirect('/security');
  }

  const hash = bcrypt.hashSync(pinStr, 10);
  await db.users.updateAsync({ _id: user._id }, { $set: { withdrawPin: hash } });
  req.flash('success', 'Withdrawal PIN set successfully.');
  res.redirect('/security');
});

/* ── POST /security/remove-pin ─────────────────── */
router.post('/remove-pin', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/security'); }
  const user = res.locals.user;
  const { password } = req.body;

  if (!bcrypt.compareSync(password || '', user.password)) {
    req.flash('error', 'Incorrect password. PIN not removed.');
    return res.redirect('/security');
  }
  await db.users.updateAsync({ _id: user._id }, { $set: { withdrawPin: null } });
  req.flash('success', 'Withdrawal PIN removed.');
  res.redirect('/security');
});

/* ── POST /security/change-password ─────────────── */
router.post('/change-password', async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/security'); }
  const user = res.locals.user;
  const { current_password, new_password, confirm_password } = req.body;

  if (!bcrypt.compareSync(current_password || '', user.password)) {
    req.flash('error', 'Current password is incorrect.');
    return res.redirect('/security');
  }
  if (!new_password || new_password.length < 8) {
    req.flash('error', 'New password must be at least 8 characters.');
    return res.redirect('/security');
  }
  if (new_password !== confirm_password) {
    req.flash('error', 'New passwords do not match.');
    return res.redirect('/security');
  }

  const hash = bcrypt.hashSync(new_password, 12);
  await db.users.updateAsync({ _id: user._id }, { $set: { password: hash } });
  req.flash('success', 'Password changed successfully. Please log in again with your new password.');
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
