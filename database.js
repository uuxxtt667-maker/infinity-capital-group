const Datastore = require('@seald-io/nedb');
const bcrypt    = require('bcryptjs');
const path      = require('path');

/* DATA_DIR env var lets Hostinger/VPS point to a persistent storage path */
const dir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
require('fs').mkdirSync(dir, { recursive: true });
console.log('[db] data directory:', dir);

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
    const adminHash = bcrypt.hashSync('Admin@1234', 12);
    await db.users.insertAsync({
      username: 'admin', email: 'admin@cryptoptc.com',
      password: adminHash, referralCode: 'ADMIN001',
      referredBy: null, planId: 'plan1', planExpires: null,
      balance: 0, totalEarned: 0, totalWithdrawn: 0,
      totalInvested: 0, referralEarnings: 0,
      clicksToday: 0, lastClickReset: null,
      isAdmin: true, isActive: true, createdAt: new Date(),
    });
    console.log('Database seeded. Admin login: admin / Admin@1234');
  }

  /* Migration: ensure Diamond & Elite exist for already-seeded DBs */
  for (const plan of [
    { _id: 'plan6', name: 'Diamond', price: 20000, dailyClicks: 250, clickValue: 0.060, dailyRoi: 18, durationDays: 365, color: '#9b59b6', icon: 'fas fa-diamond', active: true },
    { _id: 'plan7', name: 'Elite',   price: 50000, dailyClicks: 500, clickValue: 0.100, dailyRoi: 20, durationDays: 365, color: '#f5a623', icon: 'fas fa-crown',   active: true },
  ]) {
    const exists = await db.plans.findOneAsync({ _id: plan._id });
    if (!exists) await db.plans.insertAsync(plan);
  }
}

module.exports = { db, seed };
