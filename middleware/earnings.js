/* ════════════════════════════════════════════════════════════════
   DAILY PROFIT ACCRUAL
   ----------------------------------------------------------------
   When a user activates a paid plan we stamp the principal amount,
   the activation time and a "lastDailyPayout" pointer on their record
   (see routes/admin.js). This job credits each active investor their
   daily profit — based on the plan's ANNUAL ROI — once every 24 hours.

       dailyProfit = principal × (annualRoi / 100) / 365

   The first payout lands 24h after activation. If the server was down
   for a while the job pays every full 24h period that elapsed (capped
   at the plan's expiry), so no earnings are ever lost or double-paid.
═══════════════════════════════════════════════════════════════════ */
const { db } = require('../database');

const DAY_MS = 24 * 60 * 60 * 1000;
let _running = false;

function annualRoiOf(plan) {
  if (!plan) return 0;
  return plan.annualRoi !== undefined ? plan.annualRoi : (plan.dailyRoi || 0);
}

async function runDailyEarnings() {
  if (_running) return;            // never overlap two passes
  _running = true;
  const now = Date.now();
  let credited = 0;

  try {
    const users = await db.users.findAsync({ isAdmin: false });

    for (const u of users) {
      /* Only paid, currently-active plans earn ROI */
      if (!u.planId || u.planId === 'plan1') continue;
      const principal = u.planAmount || 0;
      if (principal <= 0) continue;

      /* Pay from the last payout pointer, falling back to activation time */
      const startRef = u.lastDailyPayout ? new Date(u.lastDailyPayout).getTime()
                     : (u.planActivatedAt ? new Date(u.planActivatedAt).getTime() : null);
      if (!startRef) continue;     // legacy record with no timestamp — skip

      /* Never accrue past the plan's expiry date */
      const expires = u.planExpires ? new Date(u.planExpires).getTime() : Infinity;
      const effectiveNow = Math.min(now, expires);

      const days = Math.floor((effectiveNow - startRef) / DAY_MS);
      if (days <= 0) continue;     // less than a full 24h since last payout

      const newPointer = new Date(startRef + days * DAY_MS);

      const plan = await db.plans.findOneAsync({ _id: u.planId });
      const annRoi = annualRoiOf(plan);
      const dailyProfit = +(principal * (annRoi / 100) / 365).toFixed(4);

      if (dailyProfit <= 0) {
        /* Nothing to pay (0% plan) — still advance the pointer */
        await db.users.updateAsync({ _id: u._id }, { $set: { lastDailyPayout: newPointer } });
        continue;
      }

      const total = +(dailyProfit * days).toFixed(4);
      await db.users.updateAsync({ _id: u._id }, {
        $inc: { balance: total, totalEarned: total },
        $set: { lastDailyPayout: newPointer },
      });
      await db.transactions.insertAsync({
        userId:      u._id,
        type:        'roi_earning',
        amount:      total,
        description: `Daily profit — ${(plan && plan.name) || 'Plan'} (${annRoi}% annual)` + (days > 1 ? ` ×${days} days` : ''),
        createdAt:   new Date(),
      });
      credited++;
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

module.exports = { runDailyEarnings, startEarningsScheduler };
