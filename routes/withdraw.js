const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF } = require('../middleware/helpers');
const { getSettings } = require('../middleware/settings');

/* USDT network options for withdrawal */
const WITHDRAW_NETWORKS = [
  { key: 'USDT_BEP20', label: 'BNB Smart Chain (BEP-20)', standard: 'BEP-20' },
  { key: 'USDT_ERC20', label: 'Ethereum (ERC-20)',         standard: 'ERC-20' },
  { key: 'USDT_SOL',   label: 'Solana (SPL)',              standard: 'SPL'    },
  { key: 'USDT_TRC20', label: 'Tron (TRC-20)',             standard: 'TRC-20' },
];

router.get('/', requireLogin, async (req, res) => {
  const user     = res.locals.user;
  const settings = getSettings();
  const hist = (await db.withdrawals.findAsync({ userId: user._id })).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  res.render('withdraw', { user, hist, csrf: generateCSRF(req), error: null, networks: WITHDRAW_NETWORKS, minWithdrawal: settings.minWithdrawal || 5 });
});

router.post('/', requireLogin, async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/withdraw'); }
  const user     = res.locals.user;
  const settings = getSettings();
  const minWd    = settings.minWithdrawal || 5;

  const render = (error) => {
    db.withdrawals.findAsync({ userId: user._id }).then(hist => {
      hist.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
      res.render('withdraw', { user, hist, csrf: generateCSRF(req), error, networks: WITHDRAW_NETWORKS, minWithdrawal: minWd });
    });
  };

  const amount  = parseFloat(req.body.amount);
  const netKey  = req.body.network_key;
  const wallet  = (req.body.wallet_address || '').trim();

  const net = WITHDRAW_NETWORKS.find(n => n.key === netKey);

  if (isNaN(amount) || amount < minWd)   return render(`Minimum withdrawal is $${minWd}.`);
  if (amount > (user.balance || 0))      return render('Insufficient balance.');
  if (!net)                              return render('Please select a valid USDT network.');
  if (wallet.length < 20)               return render('Enter a valid wallet address (min 20 characters).');

  const pending = await db.withdrawals.findOneAsync({ userId: user._id, status: { $in: ['pending','processing'] } });
  if (pending) return render('You already have a pending withdrawal. Wait for it to be processed.');

  await db.users.updateAsync({ _id: user._id }, { $inc: { balance: -amount, totalWithdrawn: amount } });
  const wd = await db.withdrawals.insertAsync({
    userId:        user._id,
    amountUsd:     amount,
    cryptoType:    `USDT (${net.standard})`,
    networkKey:    net.key,
    networkLabel:  net.label,
    walletAddress: wallet,
    status:       'pending',
    createdAt:     new Date(),
  });
  await db.transactions.insertAsync({ userId: user._id, type: 'withdrawal', amount, description: `Withdrawal via USDT ${net.standard}`, refId: wd._id, createdAt: new Date() });

  req.flash('success', `Withdrawal of $${amount.toFixed(2)} submitted. Processing within 24 hours.`);
  res.redirect('/transactions');
});

module.exports = router;
