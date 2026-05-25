const router = require('express').Router();
const { db }  = require('../database');

router.get('/', async (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  const plans = await db.plans.findAsync({ active: true });
  plans.sort((a, b) => a.price - b.price);
  res.render('index', { plans });
});

module.exports = router;
