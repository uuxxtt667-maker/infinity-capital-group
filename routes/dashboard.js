const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { getSettings }  = require('../middleware/settings');
const { accrueUserEarnings } = require('../middleware/earnings');

router.get('/', requireLogin, async (req, res) => {
  const user = res.locals.user;

  /* Credit any daily profit owed since the last payout, right now.
     Works even if the hourly background timer didn't run (idle hosting). */
  try { await accrueUserEarnings(user); } catch (e) { console.error('[earnings] dashboard accrual:', e.message); }

  const transactions = await db.transactions.findAsync({ userId: user._id });
  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recentTx    = transactions.slice(0, 10);
  const refCount    = await db.users.countAsync({ referredBy: user._id });
  const pendingDeps    = await db.deposits.countAsync({ userId: user._id, status: 'pending' });
  const pendingPlanReq = await db.planRequests.findOneAsync({ userId: user._id, status: 'pending' });
  const plan           = user.plan || {};

  const settings     = getSettings();
  const referralRate = settings.referralRate || 10;
  res.render('dashboard', { user, plan, recentTx, refCount, pendingDeps, pendingPlanReq, referralRate });
});

module.exports = router;
