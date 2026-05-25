const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
  const user   = res.locals.user;
  const filter = req.query.type || 'all';
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 20;

  const query = { userId: user._id };
  if (filter !== 'all') query.type = filter;

  const allTx = await db.transactions.findAsync(query);
  allTx.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = allTx.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const txs   = allTx.slice((page - 1) * limit, page * limit);

  res.render('transactions', { user, txs, total, pages, page, filter });
});

module.exports = router;
