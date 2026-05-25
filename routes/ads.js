const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF, isPlanActive } = require('../middleware/helpers');

router.get('/', requireLogin, async (req, res) => {
  const user  = res.locals.user;
  const plan  = user.plan || {};
  const today = new Date().toISOString().slice(0, 10);

  const allAds      = await db.ads.findAsync({ active: true });
  const allPlans    = await db.plans.findAsync({});
  const todayClicks = await db.clicks.findAsync({ userId: user._id, date: today });
  const clickedIds  = new Set(todayClicks.map(c => c.adId));

  /* Build a price-based tier map: planId → price (free plan = 0) */
  const planPriceMap = {};
  allPlans.forEach(p => { planPriceMap[p._id] = p.price || 0; });
  planPriceMap['plan1'] = 0; /* free plan fallback */

  const userPlanPrice = planPriceMap[user.planId] !== undefined
    ? planPriceMap[user.planId]
    : (plan.price || 0);

  const ads = allAds
    .filter(a => {
      const minPrice = planPriceMap[a.minPlanId] !== undefined ? planPriceMap[a.minPlanId] : 0;
      return minPrice <= userPlanPrice && a.clicksAvailable > a.clicksDone;
    })
    .map(a => ({ ...a, clickedToday: clickedIds.has(a._id) }));

  const clicksLeft = Math.max(0, (plan.dailyClicks || 5) - user.clicksToday);
  const csrf       = generateCSRF(req);

  res.render('ads', { user, plan, ads, clicksLeft, csrf, planActive: isPlanActive(user) });
});

// AJAX: credit ad click
router.post('/click', requireLogin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!verifyCSRF(req)) return res.json({ success: false, message: 'Invalid CSRF.' });

  const user  = res.locals.user;
  const adId  = req.body.ad_id;
  const plan  = user.plan || {};
  const today = new Date().toISOString().slice(0, 10);

  if (!isPlanActive(user)) return res.json({ success: false, message: 'Plan expired.' });
  if (user.clicksToday >= (plan.dailyClicks || 5)) return res.json({ success: false, message: 'Daily limit reached.' });

  const ad = await db.ads.findOneAsync({ _id: adId, active: true });
  if (!ad || ad.clicksDone >= ad.clicksAvailable) return res.json({ success: false, message: 'Ad unavailable.' });

  const key = `${user._id}_${adId}_${today}`;
  const dup = await db.clicks.findOneAsync({ key });
  if (dup) return res.json({ success: false, message: 'Already clicked today.' });

  const earnings = plan.clickValue || 0.001;
  try {
    await db.clicks.insertAsync({ key, userId: user._id, adId, date: today, earnings, createdAt: new Date() });
    await db.users.updateAsync({ _id: user._id }, { $inc: { balance: earnings, totalEarned: earnings, clicksToday: 1 } });
    await db.ads.updateAsync({ _id: adId }, { $inc: { clicksDone: 1 } });
    await db.transactions.insertAsync({ userId: user._id, type: 'click_earning', amount: earnings, description: `Ad click: ${ad.title}`, createdAt: new Date() });

    const fresh = await db.users.findOneAsync({ _id: user._id });
    res.json({ success: true, new_balance: fresh.balance });
  } catch (e) {
    res.json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
