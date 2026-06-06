const Datastore = require('@seald-io/nedb');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const crypto    = require('crypto');
const fs        = require('fs');
const os        = require('os');

/*
 * DATA_DIR resolution (priority order):
 * 1. DATA_DIR env var — explicit override
 * 2. HOME dir + /ptcdata — auto-detected on Hostinger/Linux (survives redeployments)
 * 3. ./data — local development fallback
 *
 * On Hostinger, HOME=/home/u123456789 which is OUTSIDE the deployment
 * folder, so data persists automatically across redeploys — no config needed.
 */
function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  // Auto-detect persistent home directory on Linux/Hostinger
  if (process.env.HOME && process.env.HOME.startsWith('/home/')) {
    return path.join(process.env.HOME, 'ptcdata');
  }
  return path.join(__dirname, 'data');
}
/* Pick the first candidate directory we can actually create AND write to.
   This prevents a hard crash on startup if the preferred location (e.g.
   $HOME/ptcdata) is read-only or unavailable in the hosting container. */
function ensureWritableDir() {
  const candidates = [
    resolveDataDir(),
    path.join(__dirname, 'data'),
    path.join(os.tmpdir(), 'ptcdata'),
  ];
  for (const d of candidates) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.accessSync(d, fs.constants.W_OK);
      return d;
    } catch (e) {
      console.warn('[db] cannot use data dir', d, '—', e.message);
    }
  }
  // Last resort: tmp dir root (always writable)
  return os.tmpdir();
}
const dir = ensureWritableDir();
console.log('\n[db] ✅ Database directory:', dir, '\n');

const db = {
  users:        new Datastore({ filename: path.join(dir, 'users.db'),        autoload: true }),
  plans:        new Datastore({ filename: path.join(dir, 'plans.db'),        autoload: true }),
  ads:          new Datastore({ filename: path.join(dir, 'ads.db'),          autoload: true }),
  clicks:       new Datastore({ filename: path.join(dir, 'clicks.db'),       autoload: true }),
  deposits:     new Datastore({ filename: path.join(dir, 'deposits.db'),     autoload: true }),
  withdrawals:  new Datastore({ filename: path.join(dir, 'withdrawals.db'),  autoload: true }),
  transactions: new Datastore({ filename: path.join(dir, 'transactions.db'), autoload: true }),
  planRequests: new Datastore({ filename: path.join(dir, 'plan_requests.db'),autoload: true }),
};

// Indexes
db.users.ensureIndex({ fieldName: 'username', unique: true });
db.users.ensureIndex({ fieldName: 'email',    unique: true });
db.users.ensureIndex({ fieldName: 'referralCode', unique: true });
db.clicks.ensureIndex({ fieldName: 'key', unique: true }); // userId+adId+date

async function seed() {
  /* ── Seed plans ── */
  const planCount = await db.plans.countAsync({});
  if (planCount === 0) {
    await db.plans.insertAsync([
      { _id: 'plan1', name: 'Free',     price: 0,     dailyClicks: 5,   clickValue: 0.001, dailyRoi: 0,  durationDays: 36500, color: '#6c757d', icon: 'fas fa-gift',    active: true },
      { _id: 'plan2', name: 'Starter',  price: 10,    dailyClicks: 15,  clickValue: 0.003, dailyRoi: 5,  durationDays: 30,    color: '#00d4ff', icon: 'fas fa-rocket',  active: true },
      { _id: 'plan3', name: 'Silver',   price: 500,   dailyClicks: 30,  clickValue: 0.005, dailyRoi: 8,  durationDays: 180,   color: '#c0c0c0', icon: 'fas fa-medal',   active: true },
      { _id: 'plan4', name: 'Gold',     price: 2000,  dailyClicks: 60,  clickValue: 0.012, dailyRoi: 12, durationDays: 270,   color: '#ffd700', icon: 'fas fa-crown',   active: true },
      { _id: 'plan5', name: 'Platinum', price: 5000,  dailyClicks: 120, clickValue: 0.025, dailyRoi: 15, durationDays: 365,   color: '#b9f2ff', icon: 'fas fa-gem',     active: true },
      { _id: 'plan6', name: 'Diamond',  price: 20000, dailyClicks: 250, clickValue: 0.060, dailyRoi: 18, durationDays: 365,   color: '#9b59b6', icon: 'fas fa-diamond', active: true },
      { _id: 'plan7', name: 'Elite',    price: 50000, dailyClicks: 500, clickValue: 0.100, dailyRoi: 20, durationDays: 365,   color: '#f5a623', icon: 'fas fa-crown',   active: true },
    ]);
    await db.ads.insertAsync([
      { title: 'CryptoNews Daily',       url: 'https://example.com/ad1', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
      { title: 'Forex Pro Platform',     url: 'https://example.com/ad2', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
      { title: 'Bitcoin Investment Hub', url: 'https://example.com/ad3', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
      { title: 'DeFi Protocol Launch',   url: 'https://example.com/ad4', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
      { title: 'NFT Marketplace',        url: 'https://example.com/ad5', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
      { title: 'BlockChain Academy',     url: 'https://example.com/ad6', credit: 0.001, viewSeconds: 30, clicksAvailable: 9999, clicksDone: 0, minPlanId: 'plan1', active: true },
    ]);
  }

  /* ── Always ensure admin user exists (runs on every startup) ── */
  const adminExists = await db.users.findOneAsync({ isAdmin: true });
  if (!adminExists) {
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cryptoptc.com';
    const adminHash = bcrypt.hashSync(adminPass, 10);
    await db.users.insertAsync({
      username: 'admin', email: adminEmail,
      password: adminHash, referralCode: 'ADMIN001',
      referredBy: null, planId: 'plan1', planExpires: null,
      balance: 0, totalEarned: 0, totalWithdrawn: 0,
      totalInvested: 0, referralEarnings: 0,
      clicksToday: 0, lastClickReset: null,
      isAdmin: true, isActive: true, emailVerified: true,
      createdAt: new Date(),
    });
    console.log(`\n✅ Admin created — username: admin  password: ${adminPass}\n`);
  }

  /* ── Migration: ensure Diamond & Elite exist ── */
  for (const plan of [
    { _id: 'plan6', name: 'Diamond', price: 20000, dailyClicks: 250, clickValue: 0.060, dailyRoi: 18, durationDays: 365, color: '#9b59b6', icon: 'fas fa-diamond', active: true },
    { _id: 'plan7', name: 'Elite',   price: 50000, dailyClicks: 500, clickValue: 0.100, dailyRoi: 20, durationDays: 365, color: '#f5a623', icon: 'fas fa-crown',   active: true },
  ]) {
    const exists = await db.plans.findOneAsync({ _id: plan._id });
    if (!exists) await db.plans.insertAsync(plan);
  }

  /* ── Guarantee every user has a unique referral code ──
     Registration already assigns one, but this backfills any legacy or
     edge-case account that is missing/blank so referrals never break. */
  const genRef = () => crypto.randomBytes(8).toString('hex').slice(0, 8).toUpperCase();
  const allUsers = await db.users.findAsync({});
  for (const u of allUsers) {
    if (u.referralCode) continue;
    let code = genRef();
    while (await db.users.findOneAsync({ referralCode: code })) code = genRef();
    await db.users.updateAsync({ _id: u._id }, { $set: { referralCode: code } });
    console.log(`[seed] assigned referral code to ${u.username}: ${code}`);
  }
}

module.exports = { db, seed };
