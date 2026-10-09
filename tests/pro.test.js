const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pro = require('../js/pro.js');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const pages = ['pro/index.html', 'pro/success/index.html', 'pro/cancel/index.html'];

test('API base is the public mour-backend host and rejects odd values', () => {
  assert.equal(pro.FALLBACK_API_BASE, 'https://mour-backend.onrender.com');
  assert.match(read('js/pro-config.js'), /https:\/\/mour-backend\.onrender\.com/);
  assert.equal(pro.resolveApiBase(''), 'https://mour-backend.onrender.com');
  assert.equal(pro.resolveApiBase('https://api.mourapp.com/ignored'), 'https://api.mourapp.com');
  assert.equal(pro.resolveApiBase('http://127.0.0.1:9'), 'http://127.0.0.1:9');
  assert.equal(pro.resolveApiBase('http://evil.example'), 'https://mour-backend.onrender.com');
  assert.equal(pro.resolveApiBase('javascript:alert(1)'), 'https://mour-backend.onrender.com');
  assert.equal(pro.resolveApiBase('https://user:pass@mour-backend.onrender.com'), 'https://mour-backend.onrender.com');
});

test('offer state follows GET /me/pro and does not sell over an existing subscription', () => {
  assert.equal(pro.decideOffer(null).mode, 'signed_out');
  assert.equal(pro.primaryAction(pro.decideOffer(null)), 'sign_in');
  assert.equal(pro.decideOffer({ source: 'none', status: 'none', pro: false }).mode, 'subscribe');
  assert.equal(pro.primaryAction(pro.decideOffer({ source: 'none', pro: false })), 'checkout');
  assert.equal(pro.decideOffer({ source: 'apple', status: 'active', pro: true }).mode, 'apple');
  assert.equal(pro.decideOffer({ source: 'apple', status: 'grace_period', double_billed: true }).mode, 'apple');
  assert.equal(pro.primaryAction(pro.decideOffer({ source: 'apple', status: 'active' })), 'none');
  assert.equal(pro.decideOffer({ source: 'stripe', status: 'active', pro: true }).mode, 'stripe');
  assert.equal(pro.decideOffer({ source: 'stripe', status: 'grace_period' }).mode, 'stripe');
  assert.equal(pro.primaryAction(pro.decideOffer({ source: 'stripe', status: 'active' })), 'portal');
  assert.equal(pro.decideOffer({ source: 'none', pro: true }).mode, 'unknown');
});

test('renewal copy and Apple line stay plain', () => {
  assert.equal(
    pro.APPLE_LINE,
    'You already have Pro through the App Store — manage it in Apple Settings'
  );
  assert.equal(pro.renewalNote({ source: 'apple', status: 'active' }), pro.APPLE_LINE);
  const note = pro.renewalNote({ source: 'stripe', renewal_date: '2026-11-09T18:00:00.000Z' });
  assert.match(note, /^Renews Nov \d, 2026 at \$9\.99\/month\. Cancel anytime\.$/);
  assert.equal(pro.renewalNote({ source: 'stripe' }), '$9.99/month. Cancel anytime.');
  assert.match(pro.stripeStatusText({ status: 'active', renewal_date: '2026-11-09T18:00:00.000Z' }), /Status: Active\./);
  assert.match(pro.stripeStatusText({ status: 'grace_period' }), /Payment retrying/);
  assert.equal(pro.isProActive({ source: 'stripe', status: 'active', pro: true }), true);
  assert.equal(pro.isProActive({ source: 'apple', status: 'active', pro: true }), true);
  assert.equal(pro.isProActive({ source: 'stripe', status: 'grace_period', pro: true }), true);
  assert.equal(pro.isProActive({ source: 'none', status: 'none', pro: false }), false);
  assert.equal(pro.isProActive({ source: 'stripe', status: 'none', pro: false }), false);
  assert.equal(pro.isProActive(null), false);
  assert.equal(pro.CONFIRM_GIVE_UP_MS, 30000);
  assert.ok(pro.CONFIRM_POLL_MS >= 1000 && pro.CONFIRM_POLL_MS < pro.CONFIRM_GIVE_UP_MS);
  assert.match(pro.CONFIRM_FALLBACK, /still confirming/i);
  assert.match(pro.CONFIRM_FALLBACK, /leave this page/);
  assert.equal(pro.PRO_READY_TITLE, "You're Pro! 🎉");
});

test('only Stripe https links are followed', () => {
  assert.equal(pro.isStripeRedirect('https://checkout.stripe.com/c/pay/cs_test_123'), true);
  assert.equal(pro.isStripeRedirect('https://billing.stripe.com/p/session/test_123'), true);
  assert.equal(pro.isStripeRedirect('https://checkout.stripe.com.evil.com/pay'), false);
  assert.equal(pro.isStripeRedirect('https://evil.com/checkout.stripe.com'), false);
  assert.equal(pro.isStripeRedirect('http://checkout.stripe.com/pay'), false);
  assert.equal(pro.isStripeRedirect('javascript:alert(1)'), false);
  assert.equal(pro.isStripeRedirect('https://user:pass@checkout.stripe.com/pay'), false);
});

test('phone numbers match the documented U.S. OTP body', () => {
  assert.deepEqual(pro.normalizePhone('(202) 555-0177'), {
    national: '2025550177',
    country_code: '+1',
    e164: '+12025550177',
  });
  assert.deepEqual(pro.normalizePhone('+1 202 555 0177').e164, '+12025550177');
  assert.equal(pro.normalizePhone('555'), null);
});

test('known billing errors stay calm', () => {
  assert.equal(pro.calmError(409, { code: 'ALREADY_PRO_VIA_APPLE' }).kind, 'apple');
  assert.equal(pro.calmError(409, { code: 'ALREADY_PRO_VIA_STRIPE' }).kind, 'stripe');
  assert.equal(pro.calmError(401, { code: 'AUTH_REQUIRED' }).kind, 'auth');
  assert.match(pro.calmError(503, { code: 'PRO_PRICE_NOT_CONFIGURED' }).text, /Free MOUR stays fully usable/);
  assert.match(pro.calmError(429, { code: 'OTP_LOCKED' }, 'verify').text, /Too many attempts/);
  assert.match(pro.calmError(403, { code: 'DEMO_READ_ONLY' }).text, /demo sign-in/);
});

test('pages state the price, benefits, and an equal Not now, with no dark patterns', () => {
  const offer = read('pro/index.html');
  const success = read('pro/success/index.html');
  const cancel = read('pro/cancel/index.html');
  const css = read('css/pro.css');
  const banned = [
    /countdown/i,
    /limited time/i,
    /hurry/i,
    /last chance/i,
    /only \d+ left/i,
    /don'?t miss/i,
    /miss out/i,
    /act now/i,
    /spots left/i,
    /expires in/i,
    /subscribe with apple/i,
    /type="checkbox"/i,
    /onclick=/i,
    /<script(?![^>]*\ssrc=)/i,
  ];
  for (const file of pages.concat(['js/pro.js', 'js/pro-config.js', 'css/pro.css'])) {
    const text = read(file);
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
  }
  assert.match(offer, /\$9\.99<\/span><span class="pro-per">\/month<\/span>\s*<span class="pro-anytime">Cancel anytime/);
  assert.equal(offer.includes('pro-sep'), false);
  assert.match(offer, /id="pro-subscribe"[\s\S]*\$9\.99 a month, renews monthly until you cancel\.[\s\S]*id="pro-not-now"/);
  assert.match(offer, /2 free boosts every month/);
  assert.match(offer, /Unused boosts don't roll over/);
  assert.match(offer, /Half-price rush fees/);
  assert.match(offer, /\$2\.50 photo · \$5 video/);
  assert.match(offer, /Saved spots/);
  assert.match(offer, /Plus one-tap "Repost this gig"/);
  assert.match(offer, /Faster support/);
  assert.match(offer, /A real person, front of the line/);
  assert.match(offer, /Free MOUR stays fully usable\./);
  assert.match(offer, /Sign in with your MOUR account/);
  assert.match(offer, />Subscribe</);
  assert.match(offer, />Not now</);
  assert.match(offer, /id="pro-subscribe" class="pro-btn pro-btn-primary"/);
  assert.match(offer, /id="pro-not-now" class="pro-btn pro-btn-outline"/);
  assert.match(offer, /You already have Pro through the App Store — manage it in Apple Settings/);
  assert.match(css, /\.pro-btn \{[^}]*min-height: 56px/s);
  assert.match(css, /\.pro-btn-primary \{[^}]*border: 2px solid #fff/s);
  assert.match(css, /\.pro-btn-outline \{[^}]*border: 2px solid rgba\(255, 255, 255, 0\.92\)/s);
  assert.match(success, /Confirming…/);
  assert.match(success, /id="pro-success-title"/);
  assert.match(read('js/pro.js'), /You're Pro! 🎉/);
  assert.match(success, /2 free boosts every month/);
  assert.match(success, /\$9\.99\/month\. Cancel anytime\./);
  assert.match(success, />Done</);
  assert.match(cancel, /No charge was made/);
  assert.match(cancel, /Free MOUR stays fully usable\./);
  assert.match(cancel, /There is no deadline\./);
  assert.match(cancel, /href="\/">Back to MOUR/);
  assert.equal(offer.includes('checked'), false);
  assert.equal(success.includes('<script'), true);
  assert.match(success, /src="\/js\/pro\.js"/);
  assert.equal(cancel.includes('<script'), false);
});

test('redirects cover the backend default success path and new pages', () => {
  const redirects = read('_redirects');
  assert.match(redirects, /\/pro\/confirmed\s+\/pro\/success\/\s+302/);
  assert.match(redirects, /\/pro\/success\s+\/pro\/success\/\s+301/);
  assert.match(redirects, /\/pro\/cancel\s+\/pro\/cancel\/\s+301/);
  assert.match(redirects, /\/pro\s+\/pro\/\s+301/);
});

test('new files do not contain secrets', () => {
  const banned = [
    /sk_live_[A-Za-z0-9]+/,
    /sk_test_[A-Za-z0-9]+/,
    /whsec_[A-Za-z0-9]+/,
    /price_[A-Za-z0-9]{8,}/,
    /BEGIN (RSA |OPENSSH )?PRIVATE KEY/,
    /AKIA[0-9A-Z]{16}/,
    /JWT_SECRET\s*=\s*\S+/,
  ];
  const files = pages.concat(['js/pro.js', 'js/pro-config.js', 'css/pro.css', '_headers', '_redirects']);
  for (const file of files) {
    const text = read(file);
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
  }
});
