const fs   = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

const DEFAULTS = {
  siteName:           'APEXINVEST',
  siteUrl:            '',
  maintenanceMode:    false,
  announcement:       '',
  /* USDT deposit addresses per network */
  usdtBep20Address:   '',   /* Binance Smart Chain (BEP-20) */
  usdtErc20Address:   '',   /* Ethereum (ERC-20) */
  usdtSolAddress:     '',   /* Solana (SPL) */
  usdtTrc20Address:   '',   /* Tron (TRC-20) */
  minDeposit:         10,
  minWithdrawal:      5,
  referralRate:       10,
  /* ── Live-price API keys ── */
  alphaVantageKey:    '',   /* Alpha Vantage  — forex / gold / stocks */
  iexCloudKey:        '',   /* IEX Cloud      — stocks (SPY/QQQ/USO)  */
  /* ── Email / SMTP ── */
  smtpHost:           '',
  smtpPort:           587,
  smtpUser:           '',
  smtpPass:           '',
  smtpFrom:           '',
};

const CUSTOMIZE_DEFAULTS = {
  /* ── Branding ─────────────────────────────────── */
  logoText:        'APEX',
  logoAccent:      'INVEST',
  footerTagline:   'A professional investment platform for Crypto, Forex, Stocks & Real Estate. Powered by expert fund managers.',
  supportEmail:    'support@apexinvest.com',
  telegramLink:    '',
  whatsappLink:    '',
  footerDisclaimer:'All investments carry risk. Past performance does not guarantee future results. Only invest what you can afford to lose.',

  /* ── Colors ───────────────────────────────────── */
  colorBg:         '#ffffff',
  colorBg2:        '#f8fafc',
  colorCard:       '#ffffff',
  colorBorder:     '#e2e8f0',
  colorPrimary:    '#3d8ef0',
  colorGold:       '#f5a623',
  colorGreen:      '#059669',
  colorRed:        '#dc2626',
  colorPurple:     '#7c3aed',
  colorText:       '#1e293b',
  colorText2:      '#64748b',
  colorText3:      '#94a3b8',

  /* ── Fonts ────────────────────────────────────── */
  fontFamily:      "'Segoe UI', system-ui, sans-serif",
  fontUrl:         '',
  fontSizeBase:    '15px',

  /* ── Page Backgrounds ─────────────────────────── */
  bgHome:        '', bgOverlayHome:     '0', colorBgHome: '#ffffff',
  bgDashboard:   '', bgOverlayDashboard:'0', colorBgDashboard: '',
  bgPlans:       '', bgOverlayPlans:    '0', colorBgPlans: '',
  bgDeposit:     '', bgOverlayDeposit:  '0',
  bgWithdraw:    '', bgOverlayWithdraw: '0',
  bgLogin:       '', bgOverlayLogin:    '0',
  bgRegister:    '', bgOverlayRegister: '0',
  bgAdmin:       '', bgOverlayAdmin:    '0',

  /* ── Landing Page Section Backgrounds ────────────────────── */
  bgAbout:       '', bgOverlayAbout:     '0',
  bgHow:         '', bgOverlayHow:       '0',
  bgAnalytics:   '', bgOverlayAnalytics: '0',
  bgPortfolio:   '', bgOverlayPortfolio: '0',
  bgContact:     '', bgOverlayContact:   '0',

  /* ── Landing Page Section Slideshows ──────────────────────── */
  bgHeroImages:         '[]',  // JSON array of image URLs for hero (top) slideshow
  bgHeroSlideInterval:  '5',   // seconds between hero slides
  bgHeroSlideOverlay:   '0',   // 0–0.95 darkness overlay on hero slides
  bgBottomImages:       '[]',  // JSON array of image URLs for bottom banner slideshow
  bgBottomSlideInterval:'6',
  bgBottomSlideOverlay: '0.4', // darker default since bottom has text on it

  /* ── Content / Texts ──────────────────────────── */
  navInvestNow:    'Invest Now',
  navSignIn:       'Sign In',

  /* Hero */
  heroBadge:       'Trusted Investment Company',
  heroTitle:       'Grow Your Wealth.<br>Earn Daily Returns.',
  heroSubtitle:    'Invest in Crypto &middot; Forex &middot; Stocks &middot; Real Estate &mdash; we manage, you earn',
  heroCta1:        'Start Investing Free',
  heroCta2:        'Sign In to Dashboard',

  /* Stats Bar */
  stat1Val:'$48M+',   stat1Lbl:'Assets Managed',
  stat2Val:'12,400+', stat2Lbl:'Active Investors',
  stat3Val:'50% Max', stat3Lbl:'Annual Return',
  stat4Val:'100%',    stat4Lbl:'Payout on Time',
  stat5Val:'99.9%',   stat5Lbl:'Platform Uptime',

  /* About Us */
  aboutTitle:    'The Future of <span class="grad">Multi-Asset Investing</span>',
  aboutSubtitle: 'A next-generation investment platform combining crypto, forex, stocks and real estate into one powerful portfolio.',
  aboutCard1Title:'Global Markets',   aboutCard1Desc:'Access opportunities across 120+ countries and all major asset classes.',
  aboutCard2Title:'Secure & Trusted', aboutCard2Desc:'Regulated platform with industry-leading security standards.',
  aboutCard3Title:'Real-Time Data',   aboutCard3Desc:'Get real-time market data and advanced analytics to stay ahead.',
  aboutCard4Title:'24/7 Support',     aboutCard4Desc:'Dedicated support team available anytime to help you grow.',

  /* How It Works */
  howTitle:    'Start Earning in <span class="grad">4 Simple Steps</span>',
  howSubtitle: 'From registration to your first withdrawal — it takes just a few clicks.',
  step1Title:'Create Account',  step1Desc:'Sign up in less than 2 minutes and verify your email to secure your account.',
  step2Title:'Choose a Plan',   step2Desc:'Select an investment plan that suits your goals and budget. Low risk, high return.',
  step3Title:'Fund & Invest',   step3Desc:'Deposit funds and let our experts & algorithms work for you.',
  step4Title:'Earn & Withdraw', step4Desc:'Earn daily returns and withdraw your profits anytime, hassle-free.',

  /* Features */
  feat1Title:'Live Market Data',    feat1Desc:'Real-time prices and charts across all major markets.',
  feat2Title:'Advanced Analytics',  feat2Desc:'Powerful tools & AI insights to help you make smart investment decisions.',
  feat3Title:'Secure & Trusted',    feat3Desc:'256-bit SSL encryption and multi-layer protection for your assets.',
  feat4Title:'24/7 Support',        feat4Desc:'Our expert team is available round the clock to assist you.',
  feat5Title:'Instant Withdrawals', feat5Desc:'Fast withdrawals with multiple payment options. No waiting.',

  /* Analytics */
  analyticsTitle:    'Market <span class="grad">Intelligence</span>',
  analyticsSubtitle: 'AI-powered insights and real-time analytics across all asset classes.',

  /* Portfolio */
  portfolioTitle:    'Diversified <span class="grad">Portfolio Management</span>',
  portfolioSubtitle: 'Spread your investments across multiple asset classes for optimal risk-adjusted returns.',

  /* Contact */
  contactTitle:    'Get in <span class="grad">Touch</span>',
  contactSubtitle: 'Our support team is available 24/7 to help you with anything.',
  contactPhone:    'Mon-Fri, 9am-9pm UTC',
  contactFormTitle:'Send a Message',

  /* Plans Page */
  plansTitle:      'Choose Your Investment Plan',
  plansSubtitle:   'All plans include yearly compounding &middot; Withdraw anytime after lock-in',

  /* Login / Register */
  loginTitle:      'Welcome Back',
  loginSubtitle:   'Sign in to your investment account',
  registerTitle:   'Create Account',
  registerSubtitle:'Start your investment journey today',

  /* ── Portfolio Mix (bottom-row donut) ────────────────────── */
  mixTotal:  '$124K',
  mix1Name:  'Crypto',    mix1Pct: '37',
  mix2Name:  'Forex',     mix2Pct: '23',
  mix3Name:  'Stocks',    mix3Pct: '20',
  mix4Name:  'Real Est.', mix4Pct: '12',
  mix5Name:  'Commod.',   mix5Pct: '8',

  /* ── Portfolio Section (large donut + allocations) ───────── */
  portTotal:       '$501K',
  portGrowthPct:   '+27.6%',
  portGrowthLabel: 'Total Return (6M)',
  port1Name: 'Cryptocurrency', port1Pct: '30', port1USD: '$150K',
  port2Name: 'Forex & FX',     port2Pct: '25', port2USD: '$125K',
  port3Name: 'Stocks',         port3Pct: '20', port3USD: '$100K',
  port4Name: 'Real Estate',    port4Pct: '15', port4USD: '$75K',
  port5Name: 'Commodities',    port5Pct: '10', port5USD: '$51K',

  /* ── Holdings Table ──────────────────────────────────────── */
  hold1Name: 'Bitcoin (BTC)',  hold1Pct: '22.5%', hold1Chg: '+12.4%',
  hold2Name: 'Ethereum (ETH)', hold2Pct: '18.3%', hold2Chg: '-0.3%',
  hold3Name: 'Gold (XAU)',     hold3Pct: '10.2%', hold3Chg: '+0.8%',
  hold4Name: 'Apple (AAPL)',   hold4Pct: '8.1%',  hold4Chg: '+6.2%',
  hold5Name: 'EUR/USD',        hold5Pct: '7.5%',  hold5Chg: '+3.8%',

  /* ── Performance Chart ───────────────────────────────────── */
  perfBadge:        '+24.8%',
  perfMonths:       'Feb,Mar,Apr,May,Jun,Jul',
  perfCryptoReturn: '+46%',   perfCryptoPts: '0,14,22,32,40,46',
  perfStocksReturn: '+19%',   perfStocksPts: '0,8,12,16,21,19',
  perfForexReturn:  '+8.7%',  perfForexPts:  '0,3,5,7,8,8.7',
  perfREReturn:     '+16%',   perfREPts:     '0,5,9,12,14,16',

  /* ── Testimonials ────────────────────────────────────────── */
  test1Name: 'James Robertson', test1Role: 'Crypto Investor', test1Stars: '5',
  test1Text: 'Incredible platform! I\'ve been earning consistent returns every week. The withdrawal process is fast and transparent.',
  test2Name: 'Sarah Mitchell',  test2Role: 'Forex Trader',    test2Stars: '5',
  test2Text: 'I was skeptical at first, but after 3 months my investment has grown beyond my expectations. Highly recommended!',
  test3Name: 'David Chen',      test3Role: 'Stock Investor',  test3Stars: '5',
  test3Text: 'Best investment platform I\'ve used. The team is professional, support is excellent, and returns are real.',

  /* ── Advanced — Social Links ─────────────────────────────── */
  socialTwitter:   '',
  socialFacebook:  '',
  socialInstagram: '',
  socialLinkedIn:  '',
  socialYouTube:   '',
  socialTikTok:    '',

  /* ── Advanced — SEO ──────────────────────────────────────── */
  seoDescription: 'A professional investment platform for Crypto, Forex, Stocks & Real Estate. Earn daily returns with expert fund management.',
  seoKeywords:    'investment, crypto, forex, stocks, real estate, daily returns, passive income',
  faviconUrl:     '',
  ogImage:        '',

  /* ── Advanced — Floating Contact Buttons ─────────────────── */
  floatingBtnsEnabled:  'false',
  floatingBtnPosition:  'right',
  floatingTelegramLink: '',
  floatingWhatsappLink: '',

  /* ── Advanced — Custom Code ──────────────────────────────── */
  customCss: '',
  customJs:  '',

  /* ── Advanced — Promo Popup ──────────────────────────────── */
  popupEnabled:  'false',
  popupDelay:    '3',
  popupTitle:    '🎁 Welcome Bonus!',
  popupText:     'Sign up today and get a <strong>10% bonus</strong> on your first deposit. Limited time offer!',
  popupBtnText:  'Claim Bonus',
  popupBtnLink:  '/register',
  popupBg:       '#161b22',
};

function getSettings() {
  try {
    const raw  = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Object.assign({}, DEFAULTS, data);
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

function getCustomize() {
  try {
    const raw  = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Object.assign({}, CUSTOMIZE_DEFAULTS, data.customize || {});
  } catch (e) {
    return Object.assign({}, CUSTOMIZE_DEFAULTS);
  }
}

function saveSettings(obj) {
  const current = getSettings();
  // preserve existing customize blob
  try {
    const raw  = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.customize) current.customize = data.customize;
  } catch (e) {}
  const merged = Object.assign({}, current, obj);
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

function saveCustomize(obj) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) {}
  file.customize = Object.assign({}, CUSTOMIZE_DEFAULTS, file.customize || {}, obj);
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(file, null, 2), 'utf8');
}

module.exports = { getSettings, saveSettings, getCustomize, saveCustomize, CUSTOMIZE_DEFAULTS };
