const router   = require('express').Router();
const { db }   = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, saveSettings, getCustomize, saveCustomize, CUSTOMIZE_DEFAULTS } = require('../middleware/settings');

router.use(requireAdmin);

// ── Dashboard ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const users       = await db.users.findAsync({ isAdmin: false });
  const deposits    = await db.deposits.findAsync({});
  const withdrawals = await db.withdrawals.findAsync({});

  const totalDeposited  = deposits.filter(d => d.status === 'confirmed').reduce((s, d) => s + (d.amountUsd || 0), 0);
  const totalWithdrawn  = withdrawals.filter(w => w.status === 'completed').reduce((s, w) => s + (w.amountUsd || 0), 0);
  const pendingDeps     = deposits.filter(d => d.status === 'pending').length;
  const pendingWds      = withdrawals.filter(w => w.status === 'pending').length;
  const totalBalances   = users.reduce((s, u) => s + (u.balance || 0), 0);

  const recentUsers = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  for (const u of recentUsers) {
    const p = await db.plans.findOneAsync({ _id: u.planId });
    u.planName = (p || {}).name || 'Free';
  }

  const recentDeps = deposits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  for (const d of recentDeps) {
    const u = await db.users.findOneAsync({ _id: d.userId });
    d.username = (u || {}).username || '?';
  }

  res.render('admin/index', {
    stats: { totalUsers: users.length, totalDeposited, totalWithdrawn, pendingDeps, pendingWds, totalBalances },
    recentUsers,
    recentDeps,
  });
});

// ── Users ────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const q          = req.query.q || '';
  const statusFilter = req.query.status || 'all';
  let users        = await db.users.findAsync({});

  if (q) users = users.filter(u => (u.username || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').toLowerCase().includes(q.toLowerCase()));
  if (statusFilter === 'active')   users = users.filter(u => u.isActive);
  if (statusFilter === 'inactive') users = users.filter(u => !u.isActive);

  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const u of users) {
    const p = await db.plans.findOneAsync({ _id: u.planId });
    u.planName = (p || {}).name || 'Free';
  }
  const plans = await db.plans.findAsync({ active: true });
  res.render('admin/users', { users, q, statusFilter, plans });
});

router.post('/users/toggle', async (req, res) => {
  const u = await db.users.findOneAsync({ _id: req.body.user_id });
  if (u && !u.isAdmin) await db.users.updateAsync({ _id: u._id }, { $set: { isActive: !u.isActive } });
  req.flash('success', `User ${u && u.isActive ? 'deactivated' : 'activated'}.`);
  res.redirect('/admin/users');
});

router.post('/users/credit', async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (amount > 0) {
    await db.users.updateAsync({ _id: req.body.user_id }, { $inc: { balance: amount, totalEarned: amount } });
    await db.transactions.insertAsync({ userId: req.body.user_id, type: 'manual', amount, description: 'Manual credit by admin', createdAt: new Date() });
    req.flash('success', `User credited $${amount.toFixed(2)}`);
  }
  res.redirect('/admin/users');
});

router.post('/users/debit', async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const userId = req.body.user_id;
  if (!amount || amount <= 0) { req.flash('error', 'Invalid amount.'); return res.redirect('/admin/users'); }
  const user = await db.users.findOneAsync({ _id: userId });
  if (!user) { req.flash('error', 'User not found.'); return res.redirect('/admin/users'); }
  if ((user.balance || 0) < amount) { req.flash('error', `Insufficient balance. User has $${(user.balance || 0).toFixed(2)}.`); return res.redirect('/admin/users'); }
  await db.users.updateAsync({ _id: userId }, { $inc: { balance: -amount } });
  await db.transactions.insertAsync({ userId, type: 'manual', amount: -amount, description: 'Manual debit by admin', createdAt: new Date() });
  req.flash('success', `Debited $${amount.toFixed(2)} from ${user.username}.`);
  res.redirect('/admin/users');
});

router.post('/users/edit', async (req, res) => {
  const { user_id, username, email, balance, planId, isActive } = req.body;
  const user = await db.users.findOneAsync({ _id: user_id });
  if (!user) { req.flash('error', 'User not found.'); return res.redirect('/admin/users'); }
  const updateData = {
    username: username || user.username,
    email:    email    || user.email,
    balance:  parseFloat(balance) || 0,
    planId:   planId   || user.planId,
    isActive: isActive === 'on' || isActive === 'true' || isActive === '1',
  };
  await db.users.updateAsync({ _id: user_id }, { $set: updateData });
  req.flash('success', `User ${updateData.username} updated.`);
  res.redirect('/admin/users');
});

// ── Plans ────────────────────────────────────────────────────
router.get('/plans', async (req, res) => {
  const plans = await db.plans.findAsync({});
  plans.sort((a, b) => (a.price || 0) - (b.price || 0));
  let editPlan = null;
  if (req.query.edit) {
    editPlan = await db.plans.findOneAsync({ _id: req.query.edit });
  }
  res.render('admin/plans', { plans, editPlan });
});

router.post('/plans/save', async (req, res) => {
  const { plan_id, name, price, maxPrice, annualRoi, durationDays, withdrawalFreq, features, color, icon } = req.body;
  const active = req.body.active === 'on';
  const data = {
    name:          name || 'Unnamed Plan',
    price:         parseFloat(price)     || 0,
    maxPrice:      parseFloat(maxPrice)  || 0,
    annualRoi:     parseFloat(annualRoi) || 0,
    durationDays:  parseInt(durationDays)|| 365,
    withdrawalFreq:withdrawalFreq        || 'Monthly',
    features:      (features || '').trim(),
    color:         color || '#3d8ef0',
    icon:          icon  || 'fas fa-star',
    active,
  };
  if (plan_id) {
    await db.plans.updateAsync({ _id: plan_id }, { $set: data });
    req.flash('success', `Plan "${name}" updated.`);
  } else {
    await db.plans.insertAsync({ ...data, createdAt: new Date() });
    req.flash('success', `Plan "${name}" created.`);
  }
  res.redirect('/admin/plans');
});

router.post('/plans/delete', async (req, res) => {
  const plan = await db.plans.findOneAsync({ _id: req.body.plan_id });
  await db.plans.removeAsync({ _id: req.body.plan_id });
  req.flash('success', `Plan "${(plan || {}).name || ''}" deleted.`);
  res.redirect('/admin/plans');
});

// ── Plan Activation Requests ─────────────────────────────────
router.get('/plan-requests', async (req, res) => {
  const filter = req.query.status || 'pending';
  let reqs     = await db.planRequests.findAsync(filter === 'all' ? {} : { status: filter });
  reqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const r of reqs) {
    const u = await db.users.findOneAsync({ _id: r.userId });
    r.username    = (u || {}).username || '?';
    r.userBalance = (u || {}).balance  || 0;
  }
  const pendingCount = (await db.planRequests.findAsync({ status: 'pending' })).length;
  res.render('admin/plan-requests', { reqs, filter, pendingCount });
});

router.post('/plan-requests/action', async (req, res) => {
  const { request_id, action } = req.body;
  const planReq = await db.planRequests.findOneAsync({ _id: request_id, status: 'pending' });
  if (!planReq) {
    req.flash('error', 'Request not found or already processed.');
    return res.redirect('/admin/plan-requests');
  }

  if (action === 'approve') {
    const plan = await db.plans.findOneAsync({ _id: planReq.planId });
    if (plan) {
      const expires = new Date(Date.now() + plan.durationDays * 86400000);
      await db.users.updateAsync({ _id: planReq.userId }, {
        $set: { planId: plan._id, planExpires: expires },
        $inc: { totalInvested: planReq.amountUsd },
      });
      await db.transactions.insertAsync({
        userId:      planReq.userId,
        type:        'plan_purchase',
        amount:      planReq.amountUsd,
        description: `Plan activated: ${plan.name}`,
        createdAt:   new Date(),
      });
      /* Referral commission */
      const investor = await db.users.findOneAsync({ _id: planReq.userId });
      if (investor && investor.referredBy) {
        const settings  = getSettings();
        const rate      = (settings.referralRate || 10) / 100;
        const commission = +(planReq.amountUsd * rate).toFixed(4);
        await db.users.updateAsync({ _id: investor.referredBy }, { $inc: { balance: commission, referralEarnings: commission } });
        await db.transactions.insertAsync({ userId: investor.referredBy, type: 'referral_earning', amount: commission, description: 'Referral plan commission', createdAt: new Date() });
      }
    }
    await db.planRequests.updateAsync({ _id: request_id }, { $set: { status: 'approved', processedAt: new Date() } });
    req.flash('success', `Plan request approved — ${planReq.planName} activated for user.`);

  } else if (action === 'reject') {
    /* Refund the held balance */
    await db.users.updateAsync({ _id: planReq.userId }, { $inc: { balance: planReq.amountUsd } });
    await db.transactions.insertAsync({
      userId:      planReq.userId,
      type:        'manual',
      amount:      planReq.amountUsd,
      description: `Plan request refunded: ${planReq.planName}`,
      createdAt:   new Date(),
    });
    await db.planRequests.updateAsync({ _id: request_id }, { $set: { status: 'rejected', processedAt: new Date() } });
    req.flash('info', 'Request rejected. Funds refunded to user balance.');
  }

  res.redirect('/admin/plan-requests');
});

// ── Deposits ─────────────────────────────────────────────────
router.get('/deposits', async (req, res) => {
  const filter = req.query.status || 'pending';
  let deps     = await db.deposits.findAsync(filter === 'all' ? {} : { status: filter });
  deps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const d of deps) {
    const u = await db.users.findOneAsync({ _id: d.userId });
    d.username = (u || {}).username || '?';
    if (d.planId) { const p = await db.plans.findOneAsync({ _id: d.planId }); d.planName = (p || {}).name; }
  }
  const pendingCount = (await db.deposits.findAsync({ status: 'pending' })).length;
  res.render('admin/deposits', { deps, filter, pendingCount });
});

router.post('/deposits/action', async (req, res) => {
  const { deposit_id, action } = req.body;
  const dep = await db.deposits.findOneAsync({ _id: deposit_id, status: 'pending' });
  if (!dep) { req.flash('error', 'Deposit not found or already processed.'); return res.redirect('/admin/deposits'); }

  if (action === 'confirm') {
    await db.users.updateAsync({ _id: dep.userId }, { $inc: { balance: dep.amountUsd } });
    await db.transactions.insertAsync({ userId: dep.userId, type: 'deposit', amount: dep.amountUsd, description: `Deposit confirmed: ${dep.cryptoType}`, createdAt: new Date() });

    if (dep.planId && dep.planId !== 'plan1') {
      const plan = await db.plans.findOneAsync({ _id: dep.planId });
      if (plan) {
        const expires = new Date(Date.now() + plan.durationDays * 86400000);
        await db.users.updateAsync({ _id: dep.userId }, { $set: { planId: plan._id, planExpires: expires }, $inc: { totalInvested: dep.amountUsd } });
        await db.transactions.insertAsync({ userId: dep.userId, type: 'plan_purchase', amount: dep.amountUsd, description: `Plan activated: ${plan.name}`, createdAt: new Date() });

        const depositor = await db.users.findOneAsync({ _id: dep.userId });
        if (depositor && depositor.referredBy) {
          const settings   = getSettings();
          const rate        = (settings.referralRate || 10) / 100;
          const commission  = +(dep.amountUsd * rate).toFixed(4);
          await db.users.updateAsync({ _id: depositor.referredBy }, { $inc: { balance: commission, referralEarnings: commission } });
          await db.transactions.insertAsync({ userId: depositor.referredBy, type: 'referral_earning', amount: commission, description: 'Referral deposit commission', createdAt: new Date() });
        }
      }
    }
    await db.deposits.updateAsync({ _id: deposit_id }, { $set: { status: 'confirmed' } });
    req.flash('success', 'Deposit confirmed and balance credited.');
  } else if (action === 'reject') {
    await db.deposits.updateAsync({ _id: deposit_id }, { $set: { status: 'rejected' } });
    req.flash('info', 'Deposit rejected.');
  }
  res.redirect('/admin/deposits');
});

// ── Withdrawals ──────────────────────────────────────────────
router.get('/withdrawals', async (req, res) => {
  const filter = req.query.status || 'pending';
  let wds      = await db.withdrawals.findAsync(filter === 'all' ? {} : { status: filter });
  wds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const w of wds) {
    const u = await db.users.findOneAsync({ _id: w.userId });
    w.username = (u || {}).username || '?';
  }
  const pendingCount = (await db.withdrawals.findAsync({ status: 'pending' })).length;
  res.render('admin/withdrawals', { wds, filter, pendingCount });
});

router.post('/withdrawals/action', async (req, res) => {
  const { wd_id, action } = req.body;
  const wd = await db.withdrawals.findOneAsync({ _id: wd_id });
  if (!wd) return res.redirect('/admin/withdrawals');

  if (action === 'complete') {
    await db.withdrawals.updateAsync({ _id: wd_id }, { $set: { status: 'completed' } });
    req.flash('success', 'Withdrawal marked as completed.');
  } else if (action === 'process') {
    await db.withdrawals.updateAsync({ _id: wd_id }, { $set: { status: 'processing' } });
    req.flash('info', 'Withdrawal marked as processing.');
  } else if (action === 'reject') {
    await db.withdrawals.updateAsync({ _id: wd_id }, { $set: { status: 'rejected' } });
    await db.users.updateAsync({ _id: wd.userId }, { $inc: { balance: wd.amountUsd, totalWithdrawn: -(wd.amountUsd || 0) } });
    await db.transactions.insertAsync({ userId: wd.userId, type: 'manual', amount: wd.amountUsd, description: 'Withdrawal refunded by admin', createdAt: new Date() });
    req.flash('info', 'Withdrawal rejected and amount refunded to user.');
  }
  res.redirect('/admin/withdrawals');
});

// ── Transactions ─────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  const typeFilter = req.query.type || 'all';
  let txs = await db.transactions.findAsync(typeFilter === 'all' ? {} : { type: typeFilter });
  txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  txs = txs.slice(0, 200);
  for (const t of txs) {
    const u = await db.users.findOneAsync({ _id: t.userId });
    t.username = (u || {}).username || '?';
  }
  res.render('admin/transactions', { txs, typeFilter });
});

// ── Ads ──────────────────────────────────────────────────────
router.get('/ads', async (req, res) => {
  const ads   = await db.ads.findAsync({});
  const plans = await db.plans.findAsync({ active: true });
  ads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.render('admin/ads', { ads, plans, editAd: null, error: null });
});

router.get('/ads/edit/:id', async (req, res) => {
  const editAd = await db.ads.findOneAsync({ _id: req.params.id });
  const ads    = await db.ads.findAsync({});
  const plans  = await db.plans.findAsync({ active: true });
  ads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.render('admin/ads', { ads, plans, editAd, error: null });
});

router.post('/ads/save', async (req, res) => {
  const { ad_id, title, url, credit, view_seconds, clicks_available, min_plan_id } = req.body;
  const active = req.body.is_active === 'on';
  const data   = { title, url, credit: parseFloat(credit), viewSeconds: parseInt(view_seconds), clicksAvailable: parseInt(clicks_available), minPlanId: min_plan_id, active };
  if (ad_id) await db.ads.updateAsync({ _id: ad_id }, { $set: data });
  else        await db.ads.insertAsync({ ...data, clicksDone: 0, createdAt: new Date() });
  req.flash('success', ad_id ? 'Ad updated.' : 'Ad created.');
  res.redirect('/admin/ads');
});

router.post('/ads/delete', async (req, res) => {
  await db.ads.removeAsync({ _id: req.body.ad_id });
  req.flash('success', 'Ad deleted.');
  res.redirect('/admin/ads');
});

// ── Settings ─────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const settings = getSettings();
  res.render('admin/settings', { settings });
});

router.post('/settings', (req, res) => {
  const { siteName, announcement, usdtBep20Address, usdtErc20Address, usdtSolAddress, usdtTrc20Address,
          minDeposit, minWithdrawal, referralRate, alphaVantageKey, iexCloudKey,
          smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = req.body;
  const maintenanceMode = req.body.maintenanceMode === 'on';
  // preserve existing smtpPass if field left blank (password masking)
  const existing = require('../middleware/settings').getSettings();
  saveSettings({
    siteName:           siteName              || 'APEXINVEST',
    maintenanceMode,
    announcement:       announcement          || '',
    usdtBep20Address:   usdtBep20Address      || '',
    usdtErc20Address:   usdtErc20Address      || '',
    usdtSolAddress:     usdtSolAddress        || '',
    usdtTrc20Address:   usdtTrc20Address      || '',
    minDeposit:         parseFloat(minDeposit)      || 10,
    minWithdrawal:      parseFloat(minWithdrawal)   || 5,
    referralRate:       parseFloat(referralRate)     || 10,
    alphaVantageKey:    (alphaVantageKey  || '').trim(),
    iexCloudKey:        (iexCloudKey      || '').trim(),
    smtpHost:           (smtpHost   || '').trim(),
    smtpPort:           parseInt(smtpPort)    || 587,
    smtpUser:           (smtpUser   || '').trim(),
    smtpPass:           smtpPass ? smtpPass.trim() : (existing.smtpPass || ''),
    smtpFrom:           (smtpFrom   || '').trim(),
  });
  req.flash('success', 'Settings saved successfully.');
  res.redirect('/admin/settings');
});

// ── Site Customizer ──────────────────────────────────────────
router.get('/customize', (req, res) => {
  const customize = getCustomize();
  res.render('admin/customize', { customize, CUSTOMIZE_DEFAULTS, tab: req.query.tab || 'branding', contentPage: req.query.page || 'hero' });
});

router.post('/customize/branding', (req, res) => {
  const { logoText, logoAccent, footerTagline, supportEmail, telegramLink, whatsappLink, footerDisclaimer } = req.body;
  saveCustomize({ logoText, logoAccent, footerTagline, supportEmail, telegramLink, whatsappLink, footerDisclaimer });
  req.flash('success', 'Branding updated.');
  res.redirect('/admin/customize?tab=branding');
});

router.post('/customize/colors', (req, res) => {
  const { colorBg, colorBg2, colorCard, colorBorder, colorPrimary, colorGold, colorGreen, colorRed, colorPurple, colorText, colorText2, colorText3 } = req.body;
  saveCustomize({ colorBg, colorBg2, colorCard, colorBorder, colorPrimary, colorGold, colorGreen, colorRed, colorPurple, colorText, colorText2, colorText3 });
  req.flash('success', 'Colors updated.');
  res.redirect('/admin/customize?tab=colors');
});

router.post('/customize/fonts', (req, res) => {
  const fontFamily  = req.body.fontPreset === 'custom' ? req.body.fontCustom : req.body.fontPreset;
  const fontUrl     = req.body.fontUrl     || '';
  const rawFs = (req.body.fontSizeBase || '15').toString().replace(/px/gi, '');
  const fontSizeBase = rawFs + 'px';
  saveCustomize({ fontFamily, fontUrl, fontSizeBase });
  req.flash('success', 'Fonts updated.');
  res.redirect('/admin/customize?tab=fonts');
});

router.post('/customize/backgrounds', (req, res) => {
  const fields = ['bgHome','bgOverlayHome','colorBgHome',
    'bgDashboard','bgOverlayDashboard','colorBgDashboard',
    'bgPlans','bgOverlayPlans','colorBgPlans',
    'bgDeposit','bgOverlayDeposit','bgWithdraw','bgOverlayWithdraw',
    'bgLogin','bgOverlayLogin','bgRegister','bgOverlayRegister','bgAdmin','bgOverlayAdmin',
    'bgAbout','bgOverlayAbout','bgHow','bgOverlayHow',
    'bgAnalytics','bgOverlayAnalytics','bgPortfolio','bgOverlayPortfolio',
    'bgContact','bgOverlayContact',
    'bgHeroSlideInterval','bgHeroSlideOverlay',
    'bgBottomSlideInterval','bgBottomSlideOverlay'];
  const data = {};
  fields.forEach(f => { data[f] = req.body[f] !== undefined ? req.body[f] : ''; });

  // Parse multi-image arrays
  const heroRaw   = req.body['bgHeroImages[]']   || req.body.bgHeroImages   || [];
  const bottomRaw = req.body['bgBottomImages[]']  || req.body.bgBottomImages || [];
  const toArr = v => (Array.isArray(v) ? v : [v]).map(s => (s||'').trim()).filter(Boolean);
  data.bgHeroImages   = JSON.stringify(toArr(heroRaw));
  data.bgBottomImages = JSON.stringify(toArr(bottomRaw));

  saveCustomize(data);
  req.flash('success', 'Backgrounds updated.');
  res.redirect('/admin/customize?tab=backgrounds');
});

router.post('/customize/content', (req, res) => {
  const allContentFields = [
    'navInvestNow','navSignIn',
    'heroBadge','heroTitle','heroSubtitle','heroCta1','heroCta2',
    'stat1Val','stat1Lbl','stat2Val','stat2Lbl','stat3Val','stat3Lbl','stat4Val','stat4Lbl','stat5Val','stat5Lbl',
    'aboutTitle','aboutSubtitle',
    'aboutCard1Title','aboutCard1Desc','aboutCard2Title','aboutCard2Desc',
    'aboutCard3Title','aboutCard3Desc','aboutCard4Title','aboutCard4Desc',
    'howTitle','howSubtitle',
    'step1Title','step1Desc','step2Title','step2Desc','step3Title','step3Desc','step4Title','step4Desc',
    'feat1Title','feat1Desc','feat2Title','feat2Desc','feat3Title','feat3Desc','feat4Title','feat4Desc','feat5Title','feat5Desc',
    'analyticsTitle','analyticsSubtitle',
    'portfolioTitle','portfolioSubtitle',
    'contactTitle','contactSubtitle','contactPhone','contactFormTitle',
    'plansTitle','plansSubtitle',
    'loginTitle','loginSubtitle','registerTitle','registerSubtitle',
    // Charts & Data
    'mixTotal','mix1Name','mix1Pct','mix2Name','mix2Pct','mix3Name','mix3Pct','mix4Name','mix4Pct','mix5Name','mix5Pct',
    'portTotal','portGrowthPct','portGrowthLabel',
    'port1Name','port1Pct','port1USD','port2Name','port2Pct','port2USD','port3Name','port3Pct','port3USD',
    'port4Name','port4Pct','port4USD','port5Name','port5Pct','port5USD',
    'hold1Name','hold1Pct','hold1Chg','hold2Name','hold2Pct','hold2Chg','hold3Name','hold3Pct','hold3Chg',
    'hold4Name','hold4Pct','hold4Chg','hold5Name','hold5Pct','hold5Chg',
    'perfBadge','perfMonths',
    'perfCryptoPts','perfCryptoReturn','perfStocksPts','perfStocksReturn',
    'perfForexPts','perfForexReturn','perfREPts','perfREReturn',
  ];
  const data = {};
  allContentFields.forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
  saveCustomize(data);
  req.flash('success', 'Content updated.');
  res.redirect('/admin/customize?tab=content&page=' + (req.body._page || 'hero'));
});

router.post('/customize/reset', (req, res) => {
  const section = req.body.section;
  const sectionMap = {
    branding:    ['logoText','logoAccent','footerTagline','supportEmail','telegramLink','whatsappLink','footerDisclaimer'],
    colors:      ['colorBg','colorBg2','colorCard','colorBorder','colorPrimary','colorGold','colorGreen','colorRed','colorPurple','colorText','colorText2','colorText3'],
    fonts:       ['fontFamily','fontUrl','fontSizeBase'],
    backgrounds: ['bgHome','bgOverlayHome','colorBgHome','bgDashboard','bgOverlayDashboard','colorBgDashboard','bgPlans','bgOverlayPlans','colorBgPlans','bgDeposit','bgOverlayDeposit','bgWithdraw','bgOverlayWithdraw','bgLogin','bgOverlayLogin','bgRegister','bgOverlayRegister','bgAdmin','bgOverlayAdmin','bgAbout','bgOverlayAbout','bgHow','bgOverlayHow','bgAnalytics','bgOverlayAnalytics','bgPortfolio','bgOverlayPortfolio','bgContact','bgOverlayContact','bgHeroImages','bgHeroSlideInterval','bgHeroSlideOverlay','bgBottomImages','bgBottomSlideInterval','bgBottomSlideOverlay'],
    content:     ['navInvestNow','navSignIn','heroBadge','heroTitle','heroSubtitle','heroCta1','heroCta2','stat1Val','stat1Lbl','stat2Val','stat2Lbl','stat3Val','stat3Lbl','stat4Val','stat4Lbl','stat5Val','stat5Lbl','aboutTitle','aboutSubtitle','aboutCard1Title','aboutCard1Desc','aboutCard2Title','aboutCard2Desc','aboutCard3Title','aboutCard3Desc','aboutCard4Title','aboutCard4Desc','howTitle','howSubtitle','step1Title','step1Desc','step2Title','step2Desc','step3Title','step3Desc','step4Title','step4Desc','feat1Title','feat1Desc','feat2Title','feat2Desc','feat3Title','feat3Desc','feat4Title','feat4Desc','feat5Title','feat5Desc','analyticsTitle','analyticsSubtitle','portfolioTitle','portfolioSubtitle','contactTitle','contactSubtitle','contactPhone','contactFormTitle','plansTitle','plansSubtitle','loginTitle','loginSubtitle','registerTitle','registerSubtitle','mixTotal','mix1Name','mix1Pct','mix2Name','mix2Pct','mix3Name','mix3Pct','mix4Name','mix4Pct','mix5Name','mix5Pct','portTotal','portGrowthPct','portGrowthLabel','port1Name','port1Pct','port1USD','port2Name','port2Pct','port2USD','port3Name','port3Pct','port3USD','port4Name','port4Pct','port4USD','port5Name','port5Pct','port5USD','hold1Name','hold1Pct','hold1Chg','hold2Name','hold2Pct','hold2Chg','hold3Name','hold3Pct','hold3Chg','hold4Name','hold4Pct','hold4Chg','hold5Name','hold5Pct','hold5Chg','perfBadge','perfMonths','perfCryptoPts','perfCryptoReturn','perfStocksPts','perfStocksReturn','perfForexPts','perfForexReturn','perfREPts','perfREReturn'],
  };
  const keys = section && sectionMap[section] ? sectionMap[section] : Object.keys(CUSTOMIZE_DEFAULTS);
  const reset = {};
  keys.forEach(k => { reset[k] = CUSTOMIZE_DEFAULTS[k]; });
  saveCustomize(reset);
  req.flash('success', `${section ? section.charAt(0).toUpperCase()+section.slice(1) : 'All'} settings reset to defaults.`);
  res.redirect('/admin/customize?tab=' + (section || 'branding'));
});

module.exports = router;
