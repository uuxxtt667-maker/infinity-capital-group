const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { getSettings } = require('../middleware/settings');

router.get('/', requireLogin, async (req, res) => {
  const user     = res.locals.user;
  const refs     = await db.users.findAsync({ referredBy: user._id });
  refs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const refPlans = {};
  for (const r of refs) {
    if (!refPlans[r.planId]) {
      refPlans[r.planId] = await db.plans.findOneAsync({ _id: r.planId });
    }
    r.planName = (refPlans[r.planId] || {}).name || 'Free';
  }
  /* Build a proper referral link using the actual request host */
  const proto   = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host    = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
  const refLink = `${proto}://${host}/register?ref=${user.referralCode}`;
  const settings = getSettings();
  const commissionRate = settings.referralRate || 10;
  res.render('referrals', { user, refs, refLink, commissionRate });
});

module.exports = router;
