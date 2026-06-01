const { db } = require('../database');

async function loadUser(req, res, next) {
  res.locals.user = null;
  if (req.session && req.session.userId) {
    try {
      const user = await db.users.findOneAsync({ _id: req.session.userId });
      if (user && user.isActive) {
        const plan = await db.plans.findOneAsync({ _id: user.planId });
        user.plan = plan || {};
        res.locals.user = user;
      }
    } catch (e) { /* ignore */ }
  }
  next();
}

function requireLogin(req, res, next) {
  if (!res.locals.user) {
    const next_ = encodeURIComponent(req.originalUrl);
    return res.redirect('/login?next=' + next_);
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.user || !res.locals.user.isAdmin) return res.redirect('/dashboard');
  next();
}

module.exports = { loadUser, requireLogin, requireAdmin };
