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
app.use('/referrals',    require('./routes/referrals'));
app.use('/transactions', require('./routes/transactions'));
app.use('/admin',        require('./routes/admin'));
app.use('/markets',      require('./routes/markets'));
app.use('/',             require('./routes/prices'));

// 404
app.use((req, res) => res.status(404).send('<h2>404 — Page not found. <a href="/">Go home</a></h2>'));

const PORT = process.env.PORT || 3001;
seed().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅  CryptoPTC running at http://localhost:${PORT}`);
    console.log(`    Admin login: admin / Admin@1234\n`);
  });
});
