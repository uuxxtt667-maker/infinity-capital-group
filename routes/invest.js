const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF } = require('../middleware/helpers');

/* ─────────────────────────────────────────────────────────────
   GET /invest?plan=<planId>
   Show the "Activate Plan" page for users with sufficient balance,
   or a "Deposit Funds" prompt when balance is too low.
───────────────────────────────────────────────────────────── */
router.get('/', requireLogin, async (req, res) => {
  const user   = res.locals.user;
  const planId = req.query.plan;
  if (!planId) return res.redirect('/plans');

  const plan = await db.plans.findOneAsync({ _id: planId, active: true });
  if (!plan) { req.flash('error', 'Plan not found.'); return res.redirect('/plans'); }

  const annRoi  = plan.annualRoi !== undefined ? plan.annualRoi : (plan.dailyRoi || 0);
  const minAmt  = plan.price  || 0;
  const maxAmt  = plan.maxPrice > 0 ? plan.maxPrice : null;
  const balance = user.balance || 0;

  /* Check for an already-pending request from this user */
  const existingReq = await db.planRequests.findOneAsync({ userId: user._id, status: 'pending' });

  res.render('invest', {
    user, plan, annRoi, minAmt, maxAmt, balance,
    hasEnough:   balance >= minAmt,
    existingReq,
    csrf: generateCSRF(req),
    error: null,
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /invest
   Validate → deduct balance → create pending planRequest record
───────────────────────────────────────────────────────────── */
router.post('/', requireLogin, async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/plans'); }

  const user   = res.locals.user;
  const planId = req.body.plan_id;
  const amount = parseFloat(req.body.invest_amount);

  const plan = await db.plans.findOneAsync({ _id: planId, active: true });
  if (!plan) { req.flash('error', 'Plan not found.'); return res.redirect('/plans'); }

  const annRoi = plan.annualRoi !== undefined ? plan.annualRoi : (plan.dailyRoi || 0);
  const minAmt = plan.price || 0;
  const maxAmt = plan.maxPrice > 0 ? plan.maxPrice : Infinity;

  const renderError = (error) =>
    res.render('invest', {
      user, plan, annRoi, minAmt, maxAmt: plan.maxPrice > 0 ? plan.maxPrice : null,
      balance: user.balance || 0,
      hasEnough: (user.balance || 0) >= minAmt,
      existingReq: null,
      csrf: generateCSRF(req),
      error,
    });

  if (isNaN(amount) || amount < minAmt)
    return renderError(`Minimum investment for ${plan.name} is $${minAmt.toLocaleString()}.`);
  if (amount > maxAmt)
    return renderError(`Maximum investment for ${plan.name} is $${plan.maxPrice.toLocaleString()}.`);

  /* Re-read balance fresh to avoid race conditions */
  const freshUser = await db.users.findOneAsync({ _id: user._id });
  if ((freshUser.balance || 0) < amount) {
    req.flash('error', `Insufficient balance. You have $${(freshUser.balance || 0).toFixed(2)} — deposit more funds.`);
    return res.redirect('/deposit');
  }

  /* Block if another pending request already exists */
  const existingReq = await db.planRequests.findOneAsync({ userId: user._id, status: 'pending' });
  if (existingReq) {
    req.flash('error', 'You already have a pending plan activation request. Please wait for it to be reviewed.');
    return res.redirect('/dashboard');
  }

  /* Deduct balance (funds are held until admin decision) */
  await db.users.updateAsync({ _id: user._id }, { $inc: { balance: -amount } });

  /* Create the plan request record */
  await db.planRequests.insertAsync({
    userId:    user._id,
    planId:    plan._id,
    planName:  plan.name,
    amountUsd: amount,
    status:    'pending',
    createdAt: new Date(),
  });

  req.flash('success', `Your <strong>${plan.name}</strong> plan activation request has been submitted. Admin will review it within 1 hour. $${amount.toFixed(2)} has been held from your balance.`);
  return res.redirect('/dashboard');
});

module.exports = router;
