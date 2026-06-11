/* ════════════════════════════════════════════════════════════════
   DAILY PROFIT ACCRUAL
   ----------------------------------------------------------------
   When a user activates a paid plan we stamp the principal amount,
   the activation time and a "lastDailyPayout" pointer on their record
   (see routes/admin.js). Each active investor is credited their daily
   profit — based on the plan's ANNUAL ROI — once every 24 hours.

       dailyProfit = principal × (annualRoi / 100) / 365

   The first payout lands 24h after activation. If time was missed (server
   down, or app idle-spun-down on shared hosting) the catch-up pays every
   full 24h period that elapsed (capped at plan expiry), so earnings are
   never lost or double-paid.

   Accrual runs from TWO triggers, so it works on any hosting:
     1. A background timer (hourly) — see startEarningsScheduler().
     2. Lazily, whenever the user loads their dashboard — accrueUserEarnings().
   Both call the same idempotent core; the 24h gate + pointer make double
   payment impossible regardless of how often they run.
═══════════════════════════════════════════════════════════════════ */
const { db } = require('../database');

const DAY_MS = 24 * 60 * 60 * 1000;
let _running = false;

function annualRoiOf(plan) {
  if (!plan) return 0;
  return plan.annualRoi !== undefined ? plan.annualRoi : (plan.dailyRoi || 0);
}

/* Credit one user any full days of profit owed since their last payout.
   Returns the amount credited (0 if nothing was due). Safe to call often. */
async function accrueUserEarnings(user, nowMs = Date.now()) {
  if (!user || user.isAdmin) return 0;

  /* Only paid, currently-active plans earn ROI */
  if (!user.planId || user.planId === 'plan1') return 0;
  /* Prefer the tracked plan principal; fall back to totalInvested for
     accounts activated before planAmount tracking existed. */
  const principal = user.planAmount || user.totalInvested || 0;
  if (principal <= 0) return 0;

  /* Pay from the last payout pointer, falling back to activation time */
  const startRef = user.lastDailyPayout ? new Date(user.lastDailyPayout).getTime()
                 : (user.planActivatedAt ? new Date(user.planActivatedAt).getTime() : null);
  if (!startRef) return 0;          // legacy record with no timestamp — skip

  /* Never accrue past the plan's expiry date */
  const expires = user.planExpires ? new Date(user.planExpires).getTime() : Infinity;
  const effectiveNow = Math.min(nowMs, expires);

  const days = Math.floor((effectiveNow - startRef) / DAY_MS);
  if (days <= 0) return 0;          // less than a full 24h since last payout

  const newPointer = new Date(startRef + days * DAY_MS);

  const plan   = await db.plans.findOneAsync({ _id: user.planId });
  const annRoi = annualRoiOf(plan);
  const dailyProfit = +(principal * (annRoi / 100) / 365).toFixed(4);

  if (dailyProfit <= 0) {
    /* Nothing to pay (0% plan) — still advance the pointer */
    await db.users.updateAsync({ _id: user._id }, { $set: { lastDailyPayout: newPointer } });
    return 0;
  }

  const total = +(dailyProfit * days).toFixed(4);
  await db.users.updateAsync({ _id: user._id }, {
    $inc: { balance: total, totalEarned: total },
    $set: { lastDailyPayout: newPointer },
  });
  await db.transactions.insertAsync({
    userId:      user._id,
    type:        'roi_earning',
    amount:      total,
    description: `Daily profit — ${(plan && plan.name) || 'Plan'} (${annRoi}% annual)` + (days > 1 ? ` ×${days} days` : ''),
    createdAt:   new Date(),
  });

  /* Keep the in-memory object consistent for the current request */
  user.balance     = (user.balance || 0)     + total;
  user.totalEarned = (user.totalEarned || 0) + total;
  user.lastDailyPayout = newPointer;
  return total;
}

/* Sweep every investor — used by the background timer. */
async function runDailyEarnings() {
  if (_running) return;             // never overlap two passes
  _running = true;
  const now = Date.now();
  let credited = 0;
  try {
    const users = await db.users.findAsync({ isAdmin: false });
    for (const u of users) {
      const paid = await accrueUserEarnings(u, now);
      if (paid > 0) credited++;
    }
  } catch (err) {
    console.error('[earnings] accrual error:', err.message);
  } finally {
    _running = false;
  }
  if (credited) console.log(`[earnings] daily profit credited to ${credited} investor(s)`);
}

/* Run shortly after boot, then hourly. The 24h gate inside the job
   means hourly ticks are cheap and only pay when a day has elapsed. */
function startEarningsScheduler() {
  setTimeout(runDailyEarnings, 15 * 1000);            // catch-up soon after startup
  setInterval(runDailyEarnings, 60 * 60 * 1000);      // re-check every hour
}

module.exports = { runDailyEarnings, startEarningsScheduler, accrueUserEarnings };
