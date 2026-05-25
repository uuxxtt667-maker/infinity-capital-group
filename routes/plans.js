const router = require('express').Router();
const { db }  = require('../database');
const { isPlanActive } = require('../middleware/helpers');

/* Public — no login required to view plans */
router.get('/', async (req, res) => {
  const plans = await db.plans.findAsync({ active: true });
  plans.sort((a, b) => a.price - b.price);
  const user = res.locals.user;
  res.render('plans', { plans, user, planActive: user ? isPlanActive(user) : false });
});

module.exports = router;
