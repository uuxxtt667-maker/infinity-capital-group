/* ── Crash Game Engine ── */
(function(){
'use strict';

/* ── State ── */
const State = {
  WAITING: 'waiting',
  BETTING: 'betting',
  FLYING:  'flying',
  CRASHED: 'crashed'
};

let gameState   = State.WAITING;
let multiplier  = 1.00;
let crashPoint  = 1.00;
let startTime   = 0;
let roundId     = 0;
let animFrame   = null;
let countdown   = 7;
let countTimer  = null;

/* ── Particle system ── */
const particles = [];
let rocketWorldX = 0, rocketWorldY = 0, rocketAngle = 0;

const bet1 = { amount: 500, autoCashout: 2.00, placed: false, cashedOut: false };
const bet2 = { amount: 500, autoCashout: 2.00, placed: false, cashedOut: false };

let balance = typeof CRASH_BALANCE !== 'undefined' ? CRASH_BALANCE : 5000;
const currency = typeof CRASH_CURRENCY !== 'undefined' ? CRASH_CURRENCY : 'PKR';

/* ── History ── */
const history = [1.02, 1.45, 2.35, 3.67, 1.15, 4.20, 2.10, 5.88, 1.01, 3.22, 1.67, 8.44, 2.01];

/* ── Fake players ── */
const NAMES = [
  'Ali_786','Zainab01','CryptoKing','MoonWalker','Lucky777',
  'GameChanger','HashMaster','QueenBee','DesertWolf','ProGamer',
  'Raja302','StarBoy','LegendX','NightOwl','SpeedKing',
  'ZeroHero','BlueMoon','SkyRider','DiamondHands','IronFist'
];
const AVATARS = ['👤','🦊','🐺','🦁','🐯','🦅','🦋','🎭','👑','🔥','⚡','💎','🚀','🌙','⭐'];
let livePlayers = [];

function genPlayers() {
  const count = 12 + Math.floor(Math.random() * 8);
  livePlayers = [];
  const usedNames = new Set();
  for (let i = 0; i < count; i++) {
    let name;
    do { name = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (usedNames.has(name));
    usedNames.add(name);
    const bets = [40, 50, 80, 100, 120, 150, 200, 300, 450, 500, 650, 850, 1250];
    livePlayers.push({
      name,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      bet: bets[Math.floor(Math.random() * bets.length)],
      cashoutAt: null,
      won: null
    });
  }
}

/* ── Canvas setup ── */
const canvas  = document.getElementById('crashCanvas');
const ctx     = canvas.getContext('2d');
let W = 0, H = 0;
const points  = [];

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  W = canvas.width  = rect.width;
  H = canvas.height = rect.height;
}
resizeCanvas();
window.addEventListener('resize', ()=>{ resizeCanvas(); if(gameState!==State.FLYING) drawIdle(); });

/* ── Crash point generation ── */
function generateCrashPoint() {
  const e = 2 ** 32;
  const r = Math.random();
  if (r < 0.03) return 1.00;
  const raw = (100 * e / (e - Math.floor(r * e))) / 100;
  return Math.max(1.01, Math.min(raw, 50));
}

/* ── Multiplier from elapsed time ── */
function calcMultiplier(elapsedMs) {
  return Math.max(1.00, Math.pow(Math.E, 0.09 * (elapsedMs / 1000)));
}

/* ── Color for multiplier ── */
function multColor(m) {
  if (m < 2)   return '#4ade80';
  if (m < 5)   return '#a78bfa';
  if (m < 10)  return '#fb923c';
  return '#f43f5e';
}

/* ── Particle helpers ── */
function emitParticles(x, y, angle) {
  const now = Date.now();

  /* Tail sparkles — emitted from engine, spread slightly off-axis */
  for (let i = 0; i < 5; i++) {
    const spread  = (Math.random() - 0.5) * 1.1;
    const speed   = 1.2 + Math.random() * 2.5;
    const tailAng = angle + Math.PI + spread;   /* opposite direction = behind rocket */
    particles.push({
      x:     x + (Math.random() - 0.5) * 6,
      y:     y + (Math.random() - 0.5) * 6,
      vx:    Math.cos(tailAng) * speed,
      vy:    Math.sin(tailAng) * speed,
      life:  1.0,
      decay: 0.028 + Math.random() * 0.025,
      r:     1.5 + Math.random() * 3,
      type:  'spark'
    });
  }

  /* Floating glow blobs — larger, slower, drift upward */
  if (Math.random() < 0.4) {
    particles.push({
      x:     x + (Math.random() - 0.5) * 20,
      y:     y + (Math.random() - 0.5) * 20,
      vx:    (Math.random() - 0.5) * 0.6,
      vy:    -0.4 - Math.random() * 0.8,
      life:  1.0,
      decay: 0.018 + Math.random() * 0.012,
      r:     5 + Math.random() * 9,
      type:  'blob'
    });
  }

  /* Starbursts — rare, bright, fast */
  if (Math.random() < 0.15) {
    const ang = Math.random() * Math.PI * 2;
    particles.push({
      x:     x + Math.cos(ang) * (8 + Math.random() * 14),
      y:     y + Math.sin(ang) * (8 + Math.random() * 14),
      vx:    Math.cos(ang) * 0.4,
      vy:    Math.sin(ang) * 0.4,
      life:  1.0,
      decay: 0.055 + Math.random() * 0.04,
      r:     1 + Math.random() * 2,
      type:  'star'
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life);
    ctx.save();
    if (p.type === 'spark') {
      /* Bright tight dot with sharp glow */
      ctx.shadowColor = '#00e676';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,255,160,${alpha * 0.95})`;
      ctx.fill();
    } else if (p.type === 'blob') {
      /* Soft radial glow blob */
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0,   `rgba(0,230,118,${alpha * 0.45})`);
      g.addColorStop(0.5, `rgba(0,200,83,${alpha * 0.2})`);
      g.addColorStop(1,   'rgba(0,230,118,0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      /* Star — cross shape */
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 10;
      ctx.strokeStyle = `rgba(200,255,220,${alpha})`;
      ctx.lineWidth   = 1.5;
      const len = p.r * 3.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(p.x - len, p.y); ctx.lineTo(p.x + len, p.y);
      ctx.moveTo(p.x, p.y - len); ctx.lineTo(p.x, p.y + len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ── Rocket drawing — matches screenshot: solid green body, dark window, fins ── */
function drawRocket(rx, ry, angle, crashed) {
  /* s = rocket half-height; sized relative to canvas */
  const s = Math.max(32, Math.min(W, H) * 0.11);

  const bodyColor = crashed ? '#cc0000' : '#00e676';
  const glowColor = crashed ? 'rgba(180,0,0,0.7)'  : 'rgba(0,230,118,0.65)';

  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(angle);

  /* ── Outer radial glow halo ── */
  const halo = ctx.createRadialGradient(s * 0.3, 0, s * 0.3, s * 0.3, 0, s * 2.8);
  halo.addColorStop(0,   glowColor);
  halo.addColorStop(0.4, crashed ? 'rgba(180,0,0,0.12)' : 'rgba(0,230,118,0.12)');
  halo.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(s * 0.3, 0, s * 2.8, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  /* ── Bottom fin — pushed further back for longer body ── */
  ctx.beginPath();
  ctx.moveTo(-s * 0.2,  s * 0.5);
  ctx.lineTo(-s * 0.85, s * 1.05);
  ctx.lineTo(-s * 1.0,  s * 0.5);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;
  ctx.fill();

  /* ── Top fin ── */
  ctx.beginPath();
  ctx.moveTo(-s * 0.2,  -s * 0.5);
  ctx.lineTo(-s * 0.85, -s * 1.05);
  ctx.lineTo(-s * 1.0,  -s * 0.5);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();

  /* ── Small rear stabiliser (bottom) ── */
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, s * 0.28);
  ctx.lineTo(-s * 1.25, s * 0.5);
  ctx.lineTo(-s * 1.05, s * 0.28);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();

  /* ── Small rear stabiliser (top) ── */
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, -s * 0.28);
  ctx.lineTo(-s * 1.25, -s * 0.5);
  ctx.lineTo(-s * 1.05, -s * 0.28);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.shadowBlur = 0;

  /* ── Main rocket body — elongated, nose at +x, tail at -x ── */
  ctx.beginPath();
  ctx.moveTo(s * 1.7, 0);                                               /* pointed nose */
  ctx.bezierCurveTo(s * 1.4, -s * 0.5,  s * 0.3,  -s * 0.56, -s * 0.75, -s * 0.52);
  ctx.bezierCurveTo(-s * 1.0, -s * 0.45, -s * 1.1, -s * 0.25, -s * 1.1, 0);
  ctx.bezierCurveTo(-s * 1.1,  s * 0.25, -s * 1.0,  s * 0.45, -s * 0.75,  s * 0.52);
  ctx.bezierCurveTo( s * 0.3,   s * 0.56,  s * 1.4,  s * 0.5,   s * 1.7, 0);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.shadowBlur = 0;

  /* ── Highlight stripe along top edge ── */
  ctx.beginPath();
  ctx.moveTo(s * 1.2, -s * 0.18);
  ctx.bezierCurveTo(s * 0.8, -s * 0.46, s * 0.1, -s * 0.5, -s * 0.55, -s * 0.44);
  ctx.bezierCurveTo(s * 0.1, -s * 0.3,  s * 0.8, -s * 0.22, s * 1.2,  -s * 0.08);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  ctx.restore();
}

/* ── Draw canvas ── */
function drawFrame() {
  ctx.clearRect(0, 0, W, H);
  if (!W || !H) return;

  const PAD_L = 38, PAD_B = 28, PAD_T = 20, PAD_R = 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  /* Grid */
  const maxMult = Math.max(multiplier * 1.2, 5);
  const maxTime = Math.max((Date.now() - startTime) / 1000, 10);
  ctx.strokeStyle = 'rgba(30,43,32,0.6)';
  ctx.lineWidth = 0.5;
  const ySteps = [1, 2, 3, 4, 5, 8, 10, 15, 20];
  for (const y of ySteps) {
    if (y > maxMult * 1.1) break;
    const py = PAD_T + plotH - (y - 1) / (maxMult - 1) * plotH;
    ctx.beginPath(); ctx.moveTo(PAD_L, py); ctx.lineTo(PAD_L + plotW, py); ctx.stroke();
    ctx.fillStyle = 'rgba(74,94,77,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText(y + 'x', 2, py + 4);
  }
  const xSteps = [0, 2, 4, 6, 8, 10];
  for (const x of xSteps) {
    if (x > maxTime * 1.1) break;
    const px = PAD_L + (x / maxTime) * plotW;
    ctx.beginPath(); ctx.moveTo(px, PAD_T); ctx.lineTo(px, PAD_T + plotH); ctx.stroke();
    ctx.fillStyle = 'rgba(74,94,77,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText(x + 's', px - 6, H - 8);
  }

  if (points.length < 2) return;

  /* Gradient fill under curve */
  const gradient = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + plotH);
  gradient.addColorStop(0, 'rgba(0,230,118,0.25)');
  gradient.addColorStop(1, 'rgba(0,230,118,0.02)');

  function toCanvas(t, m) {
    const px = PAD_L + (t / maxTime) * plotW;
    const py = PAD_T + plotH - Math.max(0, (m - 1) / (maxMult - 1)) * plotH;
    return [px, py];
  }

  ctx.beginPath();
  let [x0, y0] = toCanvas(points[0][0], points[0][1]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = toCanvas(points[i][0], points[i][1]);
    ctx.lineTo(x1, y1);
  }
  const lastPt = points[points.length - 1];
  const [lx, ly] = toCanvas(lastPt[0], lastPt[1]);
  ctx.lineTo(lx, PAD_T + plotH);
  ctx.lineTo(PAD_L, PAD_T + plotH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  /* Curve line — draw twice: outer glow then inner bright line */
  const curveColor  = gameState === State.CRASHED ? '#ff4444' : '#00e676';
  const glowColor   = gameState === State.CRASHED ? 'rgba(255,68,68,0.4)' : 'rgba(0,230,118,0.35)';

  function traceCurve() {
    [x0, y0] = toCanvas(points[0][0], points[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = toCanvas(points[i][0], points[i][1]);
      ctx.lineTo(x1, y1);
    }
  }

  /* Outer glow pass */
  ctx.beginPath(); traceCurve();
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 8;
  ctx.shadowColor = curveColor;
  ctx.shadowBlur = 20;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  /* Inner bright line */
  ctx.beginPath(); traceCurve();
  ctx.strokeStyle = curveColor;
  ctx.lineWidth = 3;
  ctx.shadowColor = curveColor;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  /* Rocket at tip + particles */
  if ((gameState === State.FLYING || gameState === State.CRASHED) && points.length > 1) {
    const [rx, ry] = toCanvas(lastPt[0], lastPt[1]);
    const lookback = Math.min(8, points.length - 1);
    const prev = points[points.length - 1 - lookback];
    const [px2, py2] = toCanvas(prev[0], prev[1]);
    const angle = Math.atan2(ry - py2, rx - px2);

    /* Store for particle emitter */
    rocketWorldX = rx; rocketWorldY = ry; rocketAngle = angle;

    if (gameState === State.FLYING) {
      emitParticles(rx, ry, angle);

      /* ── Exhaust burst cone at engine tail ── */
      const s = Math.max(32, Math.min(W, H) * 0.11);
      const t = Date.now() / 60;
      const flicker = 0.82 + Math.sin(t) * 0.18;
      const tailX = rx + Math.cos(angle + Math.PI) * s * 0.72;
      const tailY = ry + Math.sin(angle + Math.PI) * s * 0.72;
      const burstLen = s * 2.6 * flicker;

      /* Outer soft cone */
      ctx.save();
      ctx.translate(tailX, tailY);
      ctx.rotate(angle + Math.PI);
      const coneGrad = ctx.createLinearGradient(0, 0, burstLen, 0);
      coneGrad.addColorStop(0,   'rgba(120,255,160,0.9)');
      coneGrad.addColorStop(0.3, 'rgba(0,230,118,0.6)');
      coneGrad.addColorStop(0.7, 'rgba(0,180,80,0.2)');
      coneGrad.addColorStop(1,   'rgba(0,230,118,0)');
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.22);
      ctx.quadraticCurveTo(burstLen * 0.5, -s * 0.35 * flicker, burstLen, 0);
      ctx.quadraticCurveTo(burstLen * 0.5,  s * 0.35 * flicker, 0,  s * 0.22);
      ctx.closePath();
      ctx.fillStyle = coneGrad;
      ctx.shadowColor = '#00e676';
      ctx.shadowBlur  = 22;
      ctx.fill();

      /* Bright inner core streak */
      const coreGrad = ctx.createLinearGradient(0, 0, burstLen * 0.7, 0);
      coreGrad.addColorStop(0,   'rgba(220,255,230,1)');
      coreGrad.addColorStop(0.4, 'rgba(0,230,118,0.85)');
      coreGrad.addColorStop(1,   'rgba(0,230,118,0)');
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.08);
      ctx.quadraticCurveTo(burstLen * 0.4, 0, burstLen * 0.7, 0);
      ctx.quadraticCurveTo(burstLen * 0.4, 0, 0, s * 0.08);
      ctx.closePath();
      ctx.fillStyle = coreGrad;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    updateParticles();
    drawParticles();

    /* ── Pulsing ring aura around rocket ── */
    if (gameState === State.FLYING) {
      const pulse = 0.55 + Math.sin(Date.now() / 180) * 0.45;
      const auraR = Math.max(22, Math.min(W, H) * 0.07) * 1.8;
      const aura  = ctx.createRadialGradient(rx, ry, auraR * 0.3, rx, ry, auraR * (1 + pulse * 0.35));
      aura.addColorStop(0,   `rgba(0,230,118,${0.22 * pulse})`);
      aura.addColorStop(0.5, `rgba(0,230,118,${0.09 * pulse})`);
      aura.addColorStop(1,   'rgba(0,230,118,0)');
      ctx.beginPath();
      ctx.arc(rx, ry, auraR * (1 + pulse * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = aura;
      ctx.fill();
    }

    drawRocket(rx, ry, angle, gameState === State.CRASHED);
  }

  /* Mountain silhouette at bottom */
  ctx.fillStyle = 'rgba(0,230,118,0.04)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W * 0.15, H - 25);
  ctx.lineTo(W * 0.3, H - 10);
  ctx.lineTo(W * 0.45, H - 35);
  ctx.lineTo(W * 0.6, H - 15);
  ctx.lineTo(W * 0.75, H - 40);
  ctx.lineTo(W * 0.88, H - 20);
  ctx.lineTo(W, H - 30);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawIdle() {
  ctx.clearRect(0, 0, W, H);
  /* Mountain only */
  ctx.fillStyle = 'rgba(0,230,118,0.04)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W * 0.15, H - 25);
  ctx.lineTo(W * 0.3, H - 10);
  ctx.lineTo(W * 0.45, H - 35);
  ctx.lineTo(W * 0.6, H - 15);
  ctx.lineTo(W * 0.75, H - 40);
  ctx.lineTo(W * 0.88, H - 20);
  ctx.lineTo(W, H - 30);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

/* ── Game loop ── */
function gameLoop() {
  const elapsed = Date.now() - startTime;
  multiplier = calcMultiplier(elapsed);

  /* Auto cashout players */
  livePlayers.forEach(p => {
    if (!p.cashoutAt && p.won === null) {
      const threshold = 1.1 + Math.random() * (crashPoint * 0.85 - 1.1);
      if (multiplier >= threshold) {
        p.cashoutAt = multiplier;
        p.won = true;
      }
    }
  });

  /* Auto cashout bets */
  if (bet1.placed && !bet1.cashedOut && multiplier >= bet1.autoCashout) {
    cashoutBet(1, false);
  }
  if (bet2.placed && !bet2.cashedOut && multiplier >= bet2.autoCashout) {
    cashoutBet(2, false);
  }

  /* Record point */
  points.push([elapsed / 1000, multiplier]);

  /* Check crash */
  if (multiplier >= crashPoint) {
    doCrash();
    return;
  }

  updateMultiplierUI();
  renderLivePlayers();
  drawFrame();
  animFrame = requestAnimationFrame(gameLoop);
}

/* ── Start round ── */
function startBetting() {
  gameState = State.BETTING;
  multiplier = 1.00;
  countdown = 7;
  points.length = 0;
  crashPoint = generateCrashPoint();
  genPlayers();

  bet1.placed = false; bet1.cashedOut = false;
  bet2.placed = false; bet2.cashedOut = false;
  particles.length = 0;

  const cdEl   = document.getElementById('cdNum');
  const cdWrap = document.getElementById('cdOverlay');
  const crashOv = document.getElementById('crashOverlay');
  const cashBtn = document.getElementById('cashoutBtn');

  cdWrap.classList.add('visible');
  crashOv.classList.remove('visible');
  setMultiDisplay('STARTING...', 'waiting');
  cashBtn.disabled = true;
  cashBtn.className = 'cg-cashout-btn waiting-state';

  updateBetButtons();
  renderLivePlayers();
  drawIdle();

  cdEl.textContent = countdown;
  countTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countTimer);
      cdWrap.classList.remove('visible');
      startFlying();
    } else {
      cdEl.textContent = countdown;
    }
  }, 1000);
}

function startFlying() {
  gameState = State.FLYING;
  startTime = Date.now();
  multiplier = 1.00;
  points.length = 0;

  const cashBtn = document.getElementById('cashoutBtn');
  cashBtn.disabled = false;
  cashBtn.className = 'cg-cashout-btn';
  updateCashoutBtn();
  updateBetButtons();

  /* place pending bets */
  if (bet1.placed) deductBalance(bet1.amount);
  if (bet2.placed) deductBalance(bet2.amount);

  animFrame = requestAnimationFrame(gameLoop);
}

function doCrash() {
  gameState = State.CRASHED;
  if (animFrame) cancelAnimationFrame(animFrame);

  /* Remaining players lose */
  livePlayers.forEach(p => { if (p.won === null) p.won = false; });

  /* Player bets lose if not cashed out */
  if (bet1.placed && !bet1.cashedOut) showToast(`BET 1 LOST — Crashed at ${crashPoint.toFixed(2)}x`, 'lose');
  if (bet2.placed && !bet2.cashedOut) showToast(`BET 2 LOST — Crashed at ${crashPoint.toFixed(2)}x`, 'lose');

  setMultiDisplay(crashPoint.toFixed(2) + 'x', 'crashed');
  document.getElementById('crashOverlay').classList.add('visible');

  const cashBtn = document.getElementById('cashoutBtn');
  cashBtn.disabled = true;
  cashBtn.className = 'cg-cashout-btn waiting-state';

  updateBetButtons();
  renderLivePlayers();
  points.push([points.length > 0 ? points[points.length-1][0] : 0, crashPoint]);
  drawFrame();

  /* Add to history */
  addHistory(crashPoint);

  roundId++;
  setTimeout(startBetting, 3500);
}

/* ── Cashout ── */
function cashoutBet(num, manual) {
  const bet = num === 1 ? bet1 : bet2;
  if (!bet.placed || bet.cashedOut || gameState !== State.FLYING) return;
  bet.cashedOut = true;
  const payout = bet.amount * multiplier;
  balance += payout;
  updateBalanceUI();
  const profit = (payout - bet.amount).toFixed(2);
  showToast(`BET ${num} CASHED OUT at ${multiplier.toFixed(2)}x! +${currency} ${profit}`, 'win');
  updateBetButtons();
  updateCashoutBtn();
}

/* ── Place bet ── */
function placeBet(num) {
  const bet = num === 1 ? bet1 : bet2;
  if (gameState !== State.BETTING && gameState !== State.WAITING) return;
  if (bet.placed) { bet.placed = false; updateBetButtons(); return; }
  if (bet.amount > balance) { showToast('Insufficient balance', 'lose'); return; }
  bet.placed = true;
  updateBetButtons();
  showToast(`BET ${num} placed — ${currency} ${bet.amount}`, '');
}

function deductBalance(amount) {
  balance -= amount;
  updateBalanceUI();
}

/* ── UI helpers ── */
function setMultiDisplay(val, cls) {
  const el = document.getElementById('multiValue');
  el.textContent = val;
  el.className = 'cg-multi-value ' + cls;
  const lbl = document.getElementById('multiLabel');
  if (cls === 'crashed') lbl.textContent = 'CRASHED!';
  else if (cls === 'waiting') lbl.textContent = 'NEXT ROUND SOON';
  else lbl.textContent = 'FLYING HIGH!';
}

function updateMultiplierUI() {
  const el = document.getElementById('multiValue');
  el.textContent = multiplier.toFixed(2) + 'x';
  el.style.color = '';
  el.className = 'cg-multi-value';
  updateCashoutBtn();
}

function updateCashoutBtn() {
  const btn = document.getElementById('cashoutBtn');
  const multi = document.getElementById('cashoutMulti');
  if (gameState === State.FLYING) {
    multi.textContent = multiplier.toFixed(2) + 'x';
    /* check if either bet is active */
    const anyActive = (bet1.placed && !bet1.cashedOut) || (bet2.placed && !bet2.cashedOut);
    btn.disabled = !anyActive;
  }
}

function updateBetButtons() {
  [1, 2].forEach(n => {
    const bet = n === 1 ? bet1 : bet2;
    const btn = document.getElementById('placeBtn' + n);
    const badge = document.getElementById('betBadge' + n);
    const isGreen = n === 1;

    if (gameState === State.FLYING) {
      if (bet.placed && !bet.cashedOut) {
        btn.textContent = '⚡ CASH OUT';
        btn.className = 'cg-place-btn cancel-btn';
        btn.disabled = false;
      } else if (bet.cashedOut) {
        btn.innerHTML = `CASHED OUT <span class="cg-potential">✓ WON</span>`;
        btn.disabled = true;
        btn.className = 'cg-place-btn ' + (isGreen ? 'green-btn' : 'purple-btn');
      } else {
        btn.innerHTML = `PLACE BET<br><span class="cg-potential">NOT PLACED</span>`;
        btn.disabled = true;
        btn.className = 'cg-place-btn ' + (isGreen ? 'green-btn' : 'purple-btn');
      }
    } else if (gameState === State.BETTING) {
      if (bet.placed) {
        btn.innerHTML = `CANCEL BET<br><span class="cg-potential">${currency} ${bet.amount.toLocaleString()}</span>`;
        btn.className = 'cg-place-btn cancel-btn';
        btn.disabled = false;
      } else {
        const potential = (bet.amount * bet.autoCashout).toFixed(2);
        btn.innerHTML = `PLACE BET<br><span class="cg-potential">POTENTIAL: ${currency} ${parseFloat(potential).toLocaleString()}</span>`;
        btn.className = 'cg-place-btn ' + (isGreen ? 'green-btn' : 'purple-btn');
        btn.disabled = false;
      }
    } else {
      const potential = (bet.amount * bet.autoCashout).toFixed(2);
      btn.innerHTML = `PLACE BET<br><span class="cg-potential">POTENTIAL: ${currency} ${parseFloat(potential).toLocaleString()}</span>`;
      btn.className = 'cg-place-btn ' + (isGreen ? 'green-btn' : 'purple-btn');
      btn.disabled = true;
    }

    if (badge) {
      badge.style.display = (gameState === State.FLYING && bet.placed && !bet.cashedOut) ? 'inline-flex' : 'none';
    }
  });
}

function updateBalanceUI() {
  const els = document.querySelectorAll('.cg-balance-val');
  els.forEach(el => el.textContent = currency + ' ' + balance.toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits:2}));
}

function addHistory(val) {
  history.unshift(val);
  if (history.length > 20) history.pop();
  renderHistory();
}

function renderHistory() {
  const wrap = document.getElementById('historyBar');
  if (!wrap) return;
  wrap.innerHTML = '';
  history.slice(0, 12).forEach(v => {
    const el = document.createElement('span');
    el.className = 'cg-hist-item ' + (v < 2 ? 'c-low' : v < 5 ? 'c-med' : v < 10 ? 'c-high' : 'c-mega');
    el.textContent = v.toFixed(2) + 'x';
    wrap.appendChild(el);
  });
  const icon = document.createElement('span');
  icon.className = 'cg-hist-chart-icon';
  icon.innerHTML = '<i class="fas fa-chart-bar"></i>';
  wrap.appendChild(icon);
}

function renderLivePlayers() {
  const tbody = document.getElementById('livePlayersTbody');
  if (!tbody) return;
  const countEl = document.getElementById('liveCount');
  if (countEl) countEl.textContent = livePlayers.length + (bet1.placed ? 1 : 0) + (bet2.placed ? 1 : 0) + 230;

  tbody.innerHTML = '';
  const toShow = livePlayers.slice(0, 14);
  toShow.forEach(p => {
    const tr = document.createElement('tr');
    let cashoutHTML = '<span class="cg-cashout-val pending">-</span>';
    if (p.won === true && p.cashoutAt) {
      const color = p.cashoutAt < 5 ? 'won' : 'purple-won';
      cashoutHTML = `<span class="cg-cashout-val ${color}">${p.cashoutAt.toFixed(2)}x</span>`;
    } else if (p.won === false) {
      cashoutHTML = `<span class="cg-cashout-val lost">-</span>`;
    }
    tr.innerHTML = `
      <td><span class="cg-player-name"><span class="cg-avatar">${p.avatar}</span>${p.name}</span></td>
      <td class="cg-bet-amt">₨${p.bet.toLocaleString()}</td>
      <td>${cashoutHTML}</td>`;
    tbody.appendChild(tr);
  });
}

/* ── Amount controls ── */
function setupControls(num) {
  const bet = num === 1 ? bet1 : bet2;
  const inp = document.getElementById('betAmt' + num);
  const autoInp = document.getElementById('autoCash' + num);

  document.getElementById('betMinus' + num).addEventListener('click', () => {
    bet.amount = Math.max(10, bet.amount - 100);
    inp.value = bet.amount;
    updateBetButtons();
  });
  document.getElementById('betPlus' + num).addEventListener('click', () => {
    bet.amount = bet.amount + 100;
    inp.value = bet.amount;
    updateBetButtons();
  });
  inp.addEventListener('input', () => {
    bet.amount = Math.max(10, parseInt(inp.value) || 10);
    updateBetButtons();
  });

  document.getElementById('autoMinus' + num).addEventListener('click', () => {
    bet.autoCashout = Math.max(1.10, parseFloat((bet.autoCashout - 0.1).toFixed(2)));
    autoInp.value = bet.autoCashout.toFixed(2);
    updateBetButtons();
  });
  document.getElementById('autoPlus' + num).addEventListener('click', () => {
    bet.autoCashout = parseFloat((bet.autoCashout + 0.1).toFixed(2));
    autoInp.value = bet.autoCashout.toFixed(2);
    updateBetButtons();
  });
  autoInp.addEventListener('input', () => {
    bet.autoCashout = Math.max(1.10, parseFloat(autoInp.value) || 2.00);
    updateBetButtons();
  });

  /* Preset amounts */
  document.querySelectorAll(`[data-amt-preset="${num}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      bet.amount = parseInt(btn.dataset.val);
      inp.value = bet.amount;
      document.querySelectorAll(`[data-amt-preset="${num}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBetButtons();
    });
  });

  /* Preset auto cashout */
  document.querySelectorAll(`[data-auto-preset="${num}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      bet.autoCashout = parseFloat(btn.dataset.val);
      autoInp.value = bet.autoCashout.toFixed(2);
      document.querySelectorAll(`[data-auto-preset="${num}"]`).forEach(b => b.classList.remove('active', 'purple-active'));
      btn.classList.add(num === 1 ? 'active' : 'purple-active');
      updateBetButtons();
    });
  });
}

/* ── Toast ── */
let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('cgToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cg-toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

/* ── Cashout all button ── */
document.getElementById('cashoutBtn').addEventListener('click', () => {
  if (bet1.placed && !bet1.cashedOut) cashoutBet(1, true);
  if (bet2.placed && !bet2.cashedOut) cashoutBet(2, true);
});

/* ── Place bet buttons ── */
document.getElementById('placeBtn1').addEventListener('click', () => {
  if (gameState === State.FLYING && bet1.placed && !bet1.cashedOut) cashoutBet(1, true);
  else placeBet(1);
});
document.getElementById('placeBtn2').addEventListener('click', () => {
  if (gameState === State.FLYING && bet2.placed && !bet2.cashedOut) cashoutBet(2, true);
  else placeBet(2);
});

/* ── Pay tabs ── */
document.querySelectorAll('.cg-pay-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.cg-pay-tab').forEach(t => t.classList.remove('active','green','purple'));
    tab.classList.add('active', tab.dataset.color || 'green');
  });
});

/* ── Ping simulation ── */
function updatePing() {
  const el = document.getElementById('pingVal');
  if (el) el.textContent = (60 + Math.floor(Math.random() * 50)) + 'ms';
}
setInterval(updatePing, 3000);

/* ── Init ── */
setupControls(1);
setupControls(2);
renderHistory();
genPlayers();
renderLivePlayers();
drawIdle();
updateBalanceUI();
updateBetButtons();

setTimeout(startBetting, 800);

})();
