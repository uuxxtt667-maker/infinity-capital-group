'use strict';
/**
 * /api/live-prices
 *
 * Aggregates prices from three sources and serves them to the front-end.
 *
 *  Crypto  → Binance public REST  (no key, very generous limits)
 *  Forex   → Alpha Vantage        (requires free key: alphavantage.co)
 *  Stocks  → IEX Cloud            (requires free key: iexcloud.io)
 *
 * All results are cached in memory so the page can poll every few seconds
 * without hammering external APIs.
 */
const express  = require('express');
const https    = require('https');
const router   = express.Router();
const { getSettings } = require('../middleware/settings');

// ─── cache ────────────────────────────────────────────────────────────────────
const cache = {
  binance: { ts: 0, data: {} },
  forex:   { ts: 0, data: {} },
  gold:    { ts: 0, data: {} },
  stocks:  { ts: 0, data: {} },
};

// How often to re-fetch each source (milliseconds)
const TTL = {
  binance: 5_000,     // Binance: 5 s  (1200 req/min limit, very safe)
  forex:   300_000,   // Alpha Vantage free = 25 req/day → refresh every 5 min
  gold:    300_000,
  stocks:  60_000,    // IEX Cloud free = 50k msg/month → 1-min refresh is fine
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10_000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ─── Binance REST (public, no API key) ───────────────────────────────────────
async function refreshBinance() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
  const qs = encodeURIComponent(JSON.stringify(symbols));
  const data = await getJson(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${qs}`
  );
  const out = {};
  for (const t of data) {
    out[t.symbol] = {
      price: parseFloat(t.lastPrice),
      chg:   parseFloat(parseFloat(t.priceChangePercent).toFixed(2)),
    };
  }
  return out;
}

// ─── Alpha Vantage  (forex + gold) ───────────────────────────────────────────
async function refreshAlphaVantage(apiKey) {
  const pairs = [['EUR', 'USD'], ['GBP', 'USD'], ['XAU', 'USD']];
  const forex = {};
  let   gold  = null;

  for (const [from, to] of pairs) {
    try {
      const url =
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE` +
        `&from_currency=${from}&to_currency=${to}&apikey=${apiKey}`;
      const d = await getJson(url);
      const r = d['Realtime Currency Exchange Rate'];
      if (r) {
        const price = parseFloat(r['5. Exchange Rate']);
        if (from === 'XAU') gold = price;
        else forex[`${from}USD`] = price;
      }
    } catch (e) {
      console.warn(`[prices] Alpha Vantage ${from}/${to}: ${e.message}`);
    }
  }
  return { forex, gold };
}

// ─── IEX Cloud  (stocks) ─────────────────────────────────────────────────────
async function refreshIEX(apiKey) {
  // Sandbox tokens start with "Tpk_", production with "pk_"
  const base = apiKey.startsWith('Tpk_')
    ? 'https://sandbox.iexapis.com/stable'
    : 'https://cloud.iexapis.com/stable';

  const url = `${base}/stock/market/batch?symbols=SPY,QQQ,USO&types=quote&token=${apiKey}`;
  const d   = await getJson(url);

  const out = {};
  // SPY ≈ S&P 500 / 10  (SPY tracks ~1/10th of S&P 500)
  if (d.SPY?.quote) {
    const spy = d.SPY.quote;
    out.sp  = { price: Math.round(spy.latestPrice * 10), chg: +(spy.changePercent * 100).toFixed(2) };
  }
  // QQQ ≈ NASDAQ-100 / 37  (QQQ tracks ~1/37th of NASDAQ-100)
  if (d.QQQ?.quote) {
    const qqq = d.QQQ.quote;
    out.nas = { price: Math.round(qqq.latestPrice * 37), chg: +(qqq.changePercent * 100).toFixed(2) };
  }
  // USO ≈ crude oil ETF  (rough proxy for WTI)
  if (d.USO?.quote) {
    const uso = d.USO.quote;
    out.oil = { price: +uso.latestPrice.toFixed(2), chg: +(uso.changePercent * 100).toFixed(2) };
  }
  return out;
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.get('/api/live-prices', async (req, res) => {
  const settings = getSettings();
  const avKey    = settings.alphaVantageKey  || process.env.ALPHA_VANTAGE_KEY  || '';
  const iexKey   = settings.iexCloudKey      || process.env.IEX_CLOUD_KEY      || '';
  const now      = Date.now();
  const out      = { ts: now, sources: {} };

  /* ── Binance (always, no key needed) ── */
  if (now - cache.binance.ts > TTL.binance) {
    try {
      cache.binance.data = await refreshBinance();
      cache.binance.ts   = now;
      out.sources.binance = 'live';
    } catch (e) {
      console.warn('[prices] Binance REST error:', e.message);
      out.sources.binance = 'cached';
    }
  } else {
    out.sources.binance = 'cached';
  }
  out.binance = cache.binance.data;

  /* ── Alpha Vantage (forex + gold) ── */
  if (avKey) {
    if (now - cache.forex.ts > TTL.forex) {
      try {
        const { forex, gold } = await refreshAlphaVantage(avKey);
        if (Object.keys(forex).length) { cache.forex.data = forex; cache.forex.ts = now; }
        if (gold !== null)              { cache.gold.data  = { XAUUSD: gold }; cache.gold.ts = now; }
        out.sources.alphavantage = 'live';
      } catch (e) {
        console.warn('[prices] Alpha Vantage error:', e.message);
        out.sources.alphavantage = 'error';
      }
    } else {
      out.sources.alphavantage = 'cached';
    }
    out.forex = cache.forex.data;
    out.gold  = cache.gold.data;
  }

  /* ── IEX Cloud (stocks) ── */
  if (iexKey) {
    if (now - cache.stocks.ts > TTL.stocks) {
      try {
        cache.stocks.data = await refreshIEX(iexKey);
        cache.stocks.ts   = now;
        out.sources.iex   = 'live';
      } catch (e) {
        console.warn('[prices] IEX Cloud error:', e.message);
        out.sources.iex = 'error';
      }
    } else {
      out.sources.iex = 'cached';
    }
    out.stocks = cache.stocks.data;
  }

  res.set('Cache-Control', 'no-store');
  res.json(out);
});

module.exports = router;
