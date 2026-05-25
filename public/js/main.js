/* ===== APEXINVEST — main.js ===== */
'use strict';

/* ── Nav toggle ── */
document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.getElementById('navToggle');
    const navMenu   = document.getElementById('navMenu');
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
        document.addEventListener('click', e => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target))
                navMenu.classList.remove('open');
        });
    }
});

/* ── Copy boxes ── */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.copy || el.textContent.trim()).then(() => {
                const orig = el.innerHTML;
                el.innerHTML = '<i class="fas fa-check"></i> Copied!';
                el.style.color = 'var(--green)';
                setTimeout(() => { el.innerHTML = orig; el.style.color = ''; }, 1800);
            });
        });
    });
    document.querySelectorAll('.copy-box').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.copy || el.textContent.trim()).then(() => {
                const orig = el.textContent;
                el.textContent = 'Copied!';
                setTimeout(() => (el.textContent = orig), 1500);
            });
        });
    });
});

/* ── Tabs ── */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tabs').forEach(group => {
        group.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === btn.dataset.tab));
            });
        });
    });
});

/* ── Animated counters ── */
function animateCounter(el) {
    const target = parseFloat(el.dataset.counter);
    const suffix = el.dataset.suffix || '';
    const isFloat = String(target).includes('.');
    const duration = 2000;
    const start = performance.now();
    function step(now) {
        const p    = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 4);
        const val  = target * ease;
        el.textContent = (isFloat ? val.toFixed(2) : Math.round(val).toLocaleString()) + suffix;
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
const counterObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting && e.target.dataset.counter !== undefined) {
            animateCounter(e.target);
            counterObs.unobserve(e.target);
        }
    });
}, { threshold: 0.3 });
document.querySelectorAll('[data-counter]').forEach(el => counterObs.observe(el));

/* ── Password strength ── */
document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('regPassword');
    const pwdBar   = document.getElementById('pwdBar');
    const pwdLabel = document.getElementById('pwdLabel');
    const pwdWrap  = document.getElementById('pwdStrength');
    if (!pwdInput) return;
    pwdInput.addEventListener('input', () => {
        const v = pwdInput.value;
        let score = 0;
        if (v.length >= 8)          score++;
        if (/[A-Z]/.test(v))        score++;
        if (/[0-9]/.test(v))        score++;
        if (/[^a-zA-Z0-9]/.test(v)) score++;
        if (pwdWrap) pwdWrap.style.display = 'block';
        const pcts   = ['25%','50%','75%','100%'];
        const colors = ['#ff4757','#ffa502','#f5a623','#00e676'];
        const labels = ['Weak','Fair','Good','Strong'];
        if (pwdBar)   { pwdBar.style.width = pcts[score-1]||'0'; pwdBar.style.background = colors[score-1]||''; }
        if (pwdLabel) pwdLabel.textContent = labels[score-1] || '';
    });
});

/* ── Mini sparkline ── */
function drawSparkline(canvasId, data, color, fill) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth  || 200;
    const H = canvas.offsetHeight || 48;
    canvas.width  = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, W, H);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const rng = max - min || 1;
    const pts = data.map((v, i) => [
        (i / (data.length - 1)) * W,
        H - ((v - min) / rng) * H * 0.85 - H * 0.075
    ]);

    const pathPoints = () => {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i-1][0] + pts[i][0]) / 2;
            ctx.bezierCurveTo(mx, pts[i-1][1], mx, pts[i][1], pts[i][0], pts[i][1]);
        }
    };

    if (fill) {
        ctx.beginPath(); pathPoints();
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, color + '35');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad; ctx.fill();
    }
    ctx.beginPath(); pathPoints();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
}

/* ── Donut chart ── */
function drawDonut(canvasId, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const size = 110;
    canvas.width = canvas.height = size * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cx = size / 2, cy = size / 2, r = 44, inner = 28;
    const total = data.reduce((a, b) => a + b, 0);
    let start = -Math.PI / 2;
    data.forEach((val, i) => {
        const angle = (val / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        start += angle;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#131726';
    ctx.fill();
}

/* ── 6-month performance chart ── */
function drawPerfChart() {
    const canvas = document.getElementById('perfChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth  || 400;
    const H = canvas.offsetHeight || 140;
    canvas.width  = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const labels = ['Dec','Jan','Feb','Mar','Apr','May'];
    const series = [
        { data: [10,15,19,24,31,38], color: '#3d8ef0', dash: [] },
        { data: [10,12,15,17,22,26], color: '#00e676', dash: [] },
        { data: [10,11,12,13,14,15], color: '#f5a623', dash: [4,3] },
    ];
    const min = 8, max = 42, rng = max - min;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    [0,1,2,3].forEach(i => {
        const y = 8 + i * (H - 24) / 3;
        ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(W - 10, y); ctx.stroke();
    });

    series.forEach(s => {
        const pts = s.data.map((v, i) => [
            18 + (i / (s.data.length - 1)) * (W - 30),
            H - 18 - ((v - min) / rng) * (H - 32)
        ]);
        ctx.beginPath();
        ctx.setLineDash(s.dash);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i-1][0] + pts[i][0]) / 2;
            ctx.bezierCurveTo(mx, pts[i-1][1], mx, pts[i][1], pts[i][0], pts[i][1]);
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    });

    ctx.fillStyle = 'rgba(138,148,184,0.5)';
    ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    labels.forEach((l, i) => {
        const x = 18 + (i / (labels.length - 1)) * (W - 30);
        ctx.fillText(l, x, H - 3);
    });
}

/* ── Seed data ── */
const seedBTC = () => [65200,66100,67800,66500,68200,67000,67420];
const seedFX  = () => [1.092,1.088,1.085,1.090,1.082,1.086,1.0842];
const seedSP  = () => [5720,5750,5780,5800,5820,5835,5842];
const seedRE  = () => [3800000,3900000,3950000,4000000,4100000,4150000,4200000];

function renderAllCharts() {
    drawSparkline('chart-btc',      seedBTC(), '#3d8ef0', true);
    drawSparkline('dash-chart-btc', seedBTC(), '#3d8ef0', true);
    drawSparkline('chart-fx',       seedFX(),  '#ff4757', true);
    drawSparkline('dash-chart-fx',  seedFX(),  '#ff4757', true);
    drawSparkline('chart-sp',       seedSP(),  '#9b59b6', true);
    drawSparkline('dash-chart-sp',  seedSP(),  '#9b59b6', true);
    drawSparkline('chart-re',       seedRE(),  '#27ae60', true);
    drawSparkline('dash-chart-re',  seedRE(),  '#27ae60', true);
    drawDonut('donutChart', [35,30,20,15], ['#f5a623','#9b59b6','#00e676','#3d8ef0']);
    drawPerfChart();
}

/* ── Live price state ── */
const live = { btc: 67420, btcChg: 2.4, eth: 3512, ethChg: 1.8, sol: 142.6, solChg: 3.1 };

function jitter(base, pct = 0.0015) { return base * (1 + (Math.random() - 0.5) * pct * 2); }

function setEl(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function setChange(priceId, chgId, price, chg, prefix = '$', decimals = 0) {
    const p = document.getElementById(priceId);
    const c = document.getElementById(chgId);
    if (p) p.textContent = prefix + (decimals ? price.toFixed(decimals) : price.toLocaleString('en-US', {maximumFractionDigits: 0}));
    if (c) {
        c.textContent = (chg >= 0 ? '▲' : '▼') + Math.abs(chg).toFixed(2) + '%';
        c.className   = 't-change ' + (chg >= 0 ? 'up' : 'dn');
    }
}

function updateAllPrices() {
    setChange('t-btc',  'tc-btc',  live.btc,  live.btcChg);
    setChange('t-eth',  'tc-eth',  live.eth,  live.ethChg);
    setChange('t-sol',  'tc-sol',  live.sol,  live.solChg);
    setChange('dt-btc', 'dtc-btc', live.btc,  live.btcChg);
    setChange('dt-eth', 'dtc-eth', live.eth,  live.ethChg);
    setChange('dt-sol', 'dtc-sol', live.sol,  live.solChg);

    // Market cards
    const btcPriceEl = document.getElementById('lm-btc-price') || document.getElementById('mc-btc-price');
    const btcChgEl   = document.getElementById('lm-btc-chg')   || document.getElementById('mc-btc-chg');
    if (btcPriceEl) btcPriceEl.textContent = '$' + live.btc.toLocaleString('en-US', {maximumFractionDigits: 0});
    if (btcChgEl)   { btcChgEl.textContent = (live.btcChg>=0?'▲':'▼') + ' ' + Math.abs(live.btcChg).toFixed(2) + '% Today'; btcChgEl.className = 'mc-change ' + (live.btcChg>=0?'up':'dn'); }

    // Redraw BTC chart with live tip
    const btcData = seedBTC().map(v => v * (1 + (Math.random()-0.5)*0.004));
    btcData[btcData.length-1] = live.btc;
    drawSparkline('chart-btc',      btcData, '#3d8ef0', true);
    drawSparkline('dash-chart-btc', btcData, '#3d8ef0', true);
}

async function fetchLivePrices() {
    try {
        const r = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
            { signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const d = await r.json();
        if (d.bitcoin)  { live.btc = d.bitcoin.usd;   live.btcChg = +d.bitcoin.usd_24h_change.toFixed(2); }
        if (d.ethereum) { live.eth = d.ethereum.usd;  live.ethChg = +d.ethereum.usd_24h_change.toFixed(2); }
        if (d.solana)   { live.sol = d.solana.usd;    live.solChg = +d.solana.usd_24h_change.toFixed(2); }
        updateAllPrices();
    } catch (_) {}
}

function simulateTick() {
    live.btc = jitter(live.btc, 0.0012);
    live.eth = jitter(live.eth, 0.0018);
    live.sol = jitter(live.sol, 0.0025);
    updateAllPrices();
}

/* ── Balance display update ── */
function updateBalanceDisplay(newBalance) {
    document.querySelectorAll('[data-balance]').forEach(el => {
        el.textContent = '$' + parseFloat(newBalance).toFixed(4);
    });
}

/* ── Toast notifications ── */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;';
        document.body.appendChild(container);
        const style = document.createElement('style');
        style.textContent = `.toast{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.75rem 1.25rem;font-size:.85rem;display:flex;align-items:center;gap:.5rem;transform:translateX(130%);transition:transform .3s ease;min-width:220px;box-shadow:0 4px 20px rgba(0,0,0,.45)}.toast.show{transform:translateX(0)}.toast-success{border-left:3px solid var(--green);color:var(--green)}.toast-error{border-left:3px solid var(--red);color:var(--red)}.toast-info{border-left:3px solid var(--gold);color:var(--gold)}`;
        document.head.appendChild(style);
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'exclamation-circle':'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, 3500);
}

/* ── Ad timer ── */
let activeAdTimer = null;

function startAdTimer(adId, seconds, btn, earningStr) {
    if (activeAdTimer) return;
    const timerContainer = document.getElementById('timer-' + adId);
    const timerFill      = document.getElementById('timer-fill-' + adId);
    const timerText      = document.getElementById('timer-text-' + adId);
    if (!timerContainer) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Viewing…';
    timerContainer.style.display = 'block';
    let remaining = seconds;
    timerFill.style.width = '100%';
    activeAdTimer = setInterval(() => {
        remaining--;
        timerFill.style.width = (remaining / seconds * 100) + '%';
        timerText.textContent = remaining + 's remaining…';
        if (remaining <= 0) {
            clearInterval(activeAdTimer); activeAdTimer = null;
            creditAd(adId, btn, timerContainer, earningStr);
        }
    }, 1000);
    const adUrl = btn.dataset.url;
    if (adUrl) window.open(adUrl, '_blank');
}

function creditAd(adId, btn, timerContainer, earningStr) {
    const csrf = window.__adCsrf
              || document.querySelector('meta[name="csrf-token"]')?.content
              || document.querySelector('input[name="_csrf"]')?.value || '';
    fetch('/ads/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ad_id=${adId}&_csrf=${csrf}`
    })
    .then(r => r.json())
    .then(data => {
        timerContainer.style.display = 'none';
        if (data.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Credited!';
            btn.classList.remove('btn-primary','btn-gold');
            btn.classList.add('btn-success');
            showToast('+' + earningStr + ' credited!', 'success');
            updateBalanceDisplay(data.new_balance);
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> View Ad';
            showToast(data.message || 'Error.', 'error');
        }
    })
    .catch(() => {
        timerContainer.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> View Ad';
        showToast('Network error.', 'error');
    });
}

/* ── Crypto amount calculator ── */
function initCryptoCalc() {
    const amountInput  = document.getElementById('amount_usd');
    const cryptoSelect = document.getElementById('crypto_type');
    const cryptoResult = document.getElementById('crypto_amount_display');
    if (!amountInput || !cryptoSelect || !cryptoResult) return;
    const rates = { BTC: parseFloat(document.getElementById('btc-rate')?.value || live.btc), USDT: 1 };
    function recalc() {
        const usd    = parseFloat(amountInput.value) || 0;
        const crypto = cryptoSelect.value;
        cryptoResult.textContent = (usd / (rates[crypto] || 1)).toFixed(8) + ' ' + crypto;
    }
    amountInput.addEventListener('input', recalc);
    cryptoSelect.addEventListener('change', recalc);
    recalc();
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    renderAllCharts();
    fetchLivePrices();
    initCryptoCalc();
    setInterval(simulateTick,    7000);
    setInterval(fetchLivePrices, 30000);
    window.addEventListener('resize', renderAllCharts);
});
