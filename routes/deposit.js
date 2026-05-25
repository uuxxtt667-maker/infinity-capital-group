const router = require('express').Router();
const { db }  = require('../database');
const { requireLogin } = require('../middleware/auth');
const { generateCSRF, verifyCSRF } = require('../middleware/helpers');
const { getSettings } = require('../middleware/settings');

/* USDT network definitions ─────────────────────────────────── */
const NETWORKS = {
  USDT_BEP20: { label: 'BNB Smart Chain (BSC)',  token: 'USDT',  standard: 'BEP-20', settingsKey: 'usdtBep20Address', confirmTime: '~5 min'  },
  USDT_ERC20: { label: 'Ethereum',                token: 'USDT',  standard: 'ERC-20', settingsKey: 'usdtErc20Address', confirmTime: '~15 min' },
  USDT_SOL:   { label: 'Solana',                  token: 'USDT',  standard: 'SPL',    settingsKey: 'usdtSolAddress',   confirmTime: '~1 min'  },
  USDT_TRC20: { label: 'Tron',                    token: 'USDT',  standard: 'TRC-20', settingsKey: 'usdtTrc20Address', confirmTime: '~5 min'  },
};

function getEnabledNetworks(settings) {
  return Object.entries(NETWORKS)
    .filter(([, n]) => settings[n.settingsKey])
    .map(([key, n]) => ({ key, ...n, address: settings[n.settingsKey] }));
}

router.get('/', requireLogin, async (req, res) => {
  const user     = res.locals.user;
  const settings = getSettings();
  const planId   = req.query.plan || null;
  const selPlan  = planId ? await db.plans.findOneAsync({ _id: planId }) : null;
  const myDeps   = await db.deposits.findAsync({ userId: user._id });
  myDeps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const networks = getEnabledNetworks(settings);

  res.render('deposit', {
    user, selPlan, myDeps, csrf: generateCSRF(req),
    step: 1, deposit: null, error: null,
    minDeposit: settings.minDeposit || 10,
    networks,
  });
});

router.post('/', requireLogin, async (req, res) => {
  if (!verifyCSRF(req)) { req.flash('error', 'Invalid request.'); return res.redirect('/deposit'); }
  const user     = res.locals.user;
  const settings = getSettings();
  const networks = getEnabledNetworks(settings);

  /* ── Step 1 → create deposit record ─────────────────────── */
  if (req.body.create_deposit) {
    const amount  = parseFloat(req.body.amount_usd);
    const netKey  = req.body.network_key;
    const planId  = req.body.plan_id || null;
    const minDep  = settings.minDeposit || 10;

    const renderStep1 = (error) => {
      db.deposits.findAsync({ userId: user._id }).then(deps => {
        deps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.render('deposit', {
          user, selPlan: null, myDeps: deps, csrf: generateCSRF(req),
          step: 1, deposit: null, error, minDeposit: minDep, networks,
        });
      });
    };

    if (isNaN(amount) || amount < minDep) return renderStep1(`Minimum deposit is $${minDep}.`);
    const net = networks.find(n => n.key === netKey);
    if (!net) return renderStep1('Please select a valid network.');

    const dep = await db.deposits.insertAsync({
      userId:        user._id,
      amountUsd:     amount,
      cryptoType:    `USDT (${net.standard})`,
      networkKey:    net.key,
      networkLabel:  net.label,
      cryptoAmount:  amount.toFixed(6),   /* USDT 1:1 with USD */
      walletAddress: net.address,
      txHash:        null,
      planId,
      status:       'pending',
      createdAt:     new Date(),
    });

    const myDeps = (await db.deposits.findAsync({ userId: user._id }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.render('deposit', {
      user, selPlan: null, myDeps, csrf: generateCSRF(req),
      step: 2, deposit: dep, error: null,
      minDeposit: minDep, networks,
    });
  }

  /* ── Step 2 → submit tx hash ─────────────────────────────── */
  if (req.body.submit_txhash) {
    const depId  = req.body.deposit_id;
    const txHash = (req.body.tx_hash || '').trim();
    const dep    = await db.deposits.findOneAsync({ _id: depId, userId: user._id, status: 'pending' });
    if (!dep || txHash.length < 10) {
      req.flash('error', 'Invalid deposit or transaction hash.');
      return res.redirect('/deposit');
    }
    await db.deposits.updateAsync({ _id: depId }, { $set: { txHash } });
    req.flash('success', 'Transaction ID submitted! Your deposit is now <strong>Pending Review</strong>. We will confirm it within 1 hour.');
    return res.redirect('/deposit');
  }

  res.redirect('/deposit');
});

module.exports = router;
