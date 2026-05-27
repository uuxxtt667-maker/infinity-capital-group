const router   = require('express').Router();
const { getSettings } = require('../middleware/settings');
const { db }   = require('../database');

/* ── helpers ─────────────────────────────── */
function escape(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${escape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

/* ── GET /sitemap.xml ────────────────────── */
router.get('/sitemap.xml', async (req, res) => {
  const settings = getSettings();
  const base     = (settings.siteUrl || '').replace(/\/+$/, '') ||
                   `${req.protocol}://${req.get('host')}`;
  const now      = today();

  /* Static public pages */
  const staticUrls = [
    { path: '/',         freq: 'daily',   pri: '1.0' },
    { path: '/markets',  freq: 'hourly',  pri: '0.9' },
    { path: '/plans',    freq: 'weekly',  pri: '0.9' },
    { path: '/register', freq: 'monthly', pri: '0.8' },
    { path: '/login',    freq: 'monthly', pri: '0.5' },
  ];

  const entries = staticUrls.map(u =>
    urlEntry(`${base}${u.path}`, now, u.freq, u.pri)
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n${entries.join('\n')}\n</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

/* ── GET /robots.txt ─────────────────────── */
router.get('/robots.txt', (req, res) => {
  const settings = getSettings();
  const base     = (settings.siteUrl || '').replace(/\/+$/, '') ||
                   `${req.protocol}://${req.get('host')}`;

  const txt = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Disallow private / admin paths',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /deposit',
    'Disallow: /withdraw',
    'Disallow: /transactions',
    'Disallow: /referrals',
    'Disallow: /security',
    'Disallow: /invest',
    'Disallow: /verify-email',
    'Disallow: /reset-password',
    'Disallow: /admin-recover',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(txt);
});

module.exports = router;
