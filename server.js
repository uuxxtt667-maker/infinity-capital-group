const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const methodOverride = require('method-override');
const path           = require('path');
const { seed }       = require('./database');
const { loadUser }   = require('./middleware/auth');
const { formatMoney, formatDate, statusBadge, isPlanActive } = require('./middleware/helpers');
const { getSettings, getCustomize } = require('./middleware/settings');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  secret: 'ptc-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

app.use(flash());

// Expose helpers and flash to all views
app.use(loadUser);
app.use((req, res, next) => {
  res.locals.success  = req.flash('success');
  res.locals.error    = req.flash('error');
  res.locals.info     = req.flash('info');
  res.locals.fmt      = formatMoney;
  res.locals.fmtDate  = formatDate;
  res.locals.badge    = statusBadge;
  res.locals.planActive = isPlanActive;
  const _settings       = getSettings();
  const _customize      = getCustomize();
  res.locals.siteName   = _settings.siteName || 'APEXINVEST';
  res.locals.siteCustomize = _customize;
  res.locals.path       = req.path;
  next();
});

// Routes
app.use('/',             require('./routes/index'));
app.use('/',             require('./routes/auth'));
app.use('/dashboard',    require('./routes/dashboard'));
// ads route disabled — click-ads feature removed
app.use('/plans',        require('./routes/plans'));
app.use('/deposit',      require('./routes/deposit'));
app.use('/invest',       require('./routes/invest'));
app.use('/withdraw',     require('./routes/withdraw'));
app.use('/security',     require('./routes/security'));
app.use('/referrals',    require('./routes/referrals'));
app.use('/transactions', require('./routes/transactions'));
app.use('/admin',        require('./routes/admin'));
app.use('/markets',      require('./routes/markets'));
app.use('/',             require('./routes/prices'));

// ── Admin account recovery (no login required) ───────────────
const bcryptSrv  = require('bcryptjs');
const { generateCSRF: _csrf, verifyCSRF: _vcsrf } = require('./middleware/helpers');
const { getSettings: _gs, saveSettings: _ss } = require('./middleware/settings');

app.get('/admin-recover', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin-recover', { csrf: _csrf(req) });
});

app.post('/admin-recover', async (req, res) => {
  if (!_vcsrf(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/admin-recover'); }
  const { recovery_key, new_password, confirm_password } = req.body;
  const s = _gs();

  if (!s.adminRecoveryKeyHash) {
    req.flash('error', 'No recovery key is set. Use Forgot Password or the server-side reset script.');
    return res.redirect('/admin-recover');
  }
  if (!recovery_key || !bcryptSrv.compareSync(recovery_key.trim(), s.adminRecoveryKeyHash)) {
    req.flash('error', 'Invalid recovery key.');
    return res.redirect('/admin-recover');
  }
  if (!new_password || new_password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    return res.redirect('/admin-recover');
  }
  if (new_password !== confirm_password) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/admin-recover');
  }

  const { db: _db } = require('./database');
  const adminUser = await _db.users.findOneAsync({ isAdmin: true });
  if (!adminUser) { req.flash('error', 'Admin account not found.'); return res.redirect('/admin-recover'); }

  const hash = bcryptSrv.hashSync(new_password, 12);
  await _db.users.updateAsync({ _id: adminUser._id }, { $set: { password: hash, twoFAEnabled: false } });
  // Invalidate the used recovery key (one-time use)
  _ss({ adminRecoveryKeyHash: null });

  req.flash('success', 'Admin password reset successfully. Please sign in with your new password.');
  res.redirect('/login');
});

// 404
app.use((req, res) => res.status(404).send('<h2>404 — Page not found. <a href="/">Go home</a></h2>'));

const PORT = process.env.PORT || 3001;
seed().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅  CryptoPTC running at http://localhost:${PORT}`);
    console.log(`    Admin login: admin / Admin@1234\n`);
  });
});
