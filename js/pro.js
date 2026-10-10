/* MOUR Pro pages. Purchase goes through mour-backend only.
   Depends on mour-backend #112 and #113:
     POST /api/v1/auth/send-otp
     POST /api/v1/auth/verify-otp
     POST /api/v1/auth/logout
     GET  /api/v1/me/pro
     POST /api/v1/me/pro/checkout
     POST /api/v1/me/pro/portal
   There is no magic-link route. Sign-in is the existing email or SMS OTP. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.MourPro = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { api.mount(); });
  } else {
    api.mount();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var FALLBACK_API_BASE = 'https://mour-backend.onrender.com';
  var TOKEN_KEY = 'mour_auth_token';
  var APPLE_LINE = 'You already have Pro through the App Store — manage it in Apple Settings';
  var CONFIRM_POLL_MS = 2000;
  var CONFIRM_GIVE_UP_MS = 30000;
  var CONFIRM_FALLBACK = "We're still confirming your subscription. You can leave this page. It will show in MOUR once it finishes. It renews monthly until you cancel.";
  var PRO_READY_TITLE = "You're Pro! 🎉";

  function resolveApiBase(raw, fallback) {
    var backup = fallback || FALLBACK_API_BASE;
    var candidate = String(raw || '').trim() || backup;
    var parsed;
    try {
      parsed = new URL(candidate);
    } catch (err) {
      return backup;
    }
    if (parsed.username || parsed.password) return backup;
    var host = parsed.hostname.toLowerCase();
    var local = host === 'localhost' || host === '127.0.0.1';
    if (parsed.protocol === 'http:' && local) return parsed.origin;
    if (parsed.protocol !== 'https:') return backup;
    return parsed.origin;
  }

  function configuredApiBase() {
    var fromBody = '';
    if (typeof document !== 'undefined' && document.body) {
      fromBody = document.body.getAttribute('data-api-base') || '';
    }
    var fromConfig = typeof globalThis !== 'undefined' ? globalThis.MOUR_PRO_DEFAULT_API_BASE : '';
    return resolveApiBase(fromBody || fromConfig || FALLBACK_API_BASE);
  }

  function isStripeRedirect(value) {
    var parsed;
    try {
      parsed = new URL(String(value || ''));
    } catch (err) {
      return false;
    }
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol !== 'https:') return false;
    var host = parsed.hostname.toLowerCase();
    return host === 'stripe.com' || host.endsWith('.stripe.com');
  }

  function formatRenewalDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function renewalNote(view) {
    if (view && view.source === 'apple') return APPLE_LINE;
    var when = formatRenewalDate(view && view.renewal_date);
    if (when) return 'Renews ' + when + '. Cancel anytime.';
    return 'Renews monthly until you cancel.';
  }

  function checkoutBody(plan) {
    if (plan !== 'pro' && plan !== 'pro_plus') return null;
    return { plan: plan };
  }

  function isProActive(view) {
    if (!view || view.success === false) return false;
    var source = String(view.source || '');
    var status = String(view.status || '');
    if (source !== 'stripe' && source !== 'apple') return false;
    return status === 'active' || status === 'grace_period' || view.pro === true;
  }

  function decideOffer(view) {
    if (!view) return { mode: 'signed_out' };
    var source = String(view.source || 'none');
    var status = String(view.status || 'none');
    var renewal = view.renewal_date || null;
    if (source === 'apple') return { mode: 'apple', status: status, renewal_date: renewal };
    if (source === 'stripe') return { mode: 'stripe', status: status, renewal_date: renewal };
    if (view.pro === true) return { mode: 'unknown', status: status, renewal_date: renewal };
    return { mode: 'subscribe', status: status, renewal_date: renewal };
  }

  function primaryAction(decision) {
    if (!decision) return 'none';
    if (decision.mode === 'stripe') return 'portal';
    if (decision.mode === 'subscribe') return 'checkout';
    if (decision.mode === 'signed_out') return 'sign_in';
    return 'none';
  }

  function stripeStatusText(view) {
    var status = String((view && view.status) || '');
    var label = status === 'grace_period' ? 'Payment retrying' : (status === 'active' ? 'Active' : 'On file');
    var when = formatRenewalDate(view && view.renewal_date);
    var renew = when ? ' Renews ' + when + '.' : '';
    return 'Status: ' + label + '.' + renew + ' Cancel anytime.';
  }

  function normalizePhone(raw) {
    var trimmed = String(raw || '').trim();
    var digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (digits.length !== 10) return null;
    return {
      national: digits,
      country_code: '+1',
      e164: '+1' + digits,
    };
  }

  function calmError(status, data, context) {
    var code = data && data.code ? String(data.code) : '';
    if (code === 'ALREADY_PRO_VIA_APPLE') return { kind: 'apple' };
    if (code === 'ALREADY_PRO_VIA_STRIPE') return { kind: 'stripe' };
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID' || status === 401) return { kind: 'auth' };
    if (code === 'DEMO_READ_ONLY') {
      return { kind: 'text', text: "This demo sign-in can't subscribe. Sign in with your MOUR account." };
    }
    if (code === 'OTP_LOCKED' || status === 429) {
      return { kind: 'text', text: 'Too many attempts. Wait a bit, then request a new code.' };
    }
    if (code === 'PRO_PORTAL_UNAVAILABLE') {
      return { kind: 'text', text: "There's no Stripe subscription to manage." };
    }
    if (
      code === 'PRO_PRICE_NOT_CONFIGURED' ||
      code === 'STRIPE_NOT_CONFIGURED' ||
      code === 'PRO_PAYWALL_DISABLED' ||
      code === 'PRO_SCHEMA_MISSING' ||
      code === 'PRO_CHECKOUT_FAILED' ||
      code === 'PRO_PORTAL_FAILED' ||
      status === 503 ||
      status === 502
    ) {
      return { kind: 'text', text: "Subscribe isn't available yet. Free MOUR stays fully usable." };
    }
    if (context === 'verify' && (status === 400 || status === 403)) {
      return { kind: 'text', text: "That code didn't match. You can try again or send a new one." };
    }
    if (context === 'send' && (status === 400 || status === 403 || status === 422)) {
      return { kind: 'text', text: 'Check the email or mobile number and try again.' };
    }
    if (status === 0) {
      return { kind: 'text', text: "We couldn't reach MOUR. Free MOUR stays fully usable." };
    }
    return { kind: 'text', text: "That didn't go through. Free MOUR stays fully usable." };
  }

  function sessionToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function setSessionToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* private mode */ }
  }

  function request(path, options) {
    options = options || {};
    var headers = { Accept: 'application/json' };
    if (options.body) headers['Content-Type'] = 'application/json';
    var token = options.token !== undefined ? options.token : sessionToken();
    if (token && options.auth !== false) headers.Authorization = 'Bearer ' + token;
    return fetch(configuredApiBase() + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: null };
    });
  }

  function setStatus(text) {
    var el = document.getElementById('pro-status');
    if (el) el.textContent = text || '';
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = hidden;
  }

  function mount() {
    if (!document.body) return;
    var page = document.body.getAttribute('data-pro-page');
    if (page === 'offer') mountOffer();
    else if (page === 'success') mountSuccess();
  }

  function mountSuccess() {
    var title = document.getElementById('pro-success-title');
    var thanks = document.getElementById('pro-thanks');
    var unlocked = document.getElementById('pro-unlocked');
    var note = document.getElementById('pro-renewal');
    var pending = document.getElementById('pro-confirm-note');
    var star = document.getElementById('pro-star');
    var confetti = document.getElementById('pro-confetti');
    var started = Date.now();
    var stopped = false;

    function showPending() {
      if (title) title.textContent = 'Confirming…';
      document.title = 'Confirming — MOUR Pro';
      setHidden(thanks, true);
      setHidden(unlocked, true);
      setHidden(note, true);
      setHidden(star, true);
      setHidden(confetti, true);
      if (pending) {
        pending.hidden = false;
        pending.textContent = 'This usually takes a few seconds.';
      }
    }

    function showReady(view) {
      stopped = true;
      if (title) title.textContent = PRO_READY_TITLE;
      document.title = "You're Pro — MOUR";
      setHidden(thanks, false);
      setHidden(unlocked, false);
      setHidden(star, false);
      setHidden(confetti, false);
      setHidden(pending, true);
      if (note) {
        note.hidden = false;
        note.textContent = renewalNote(view);
      }
    }

    function showFallback() {
      stopped = true;
      if (title) title.textContent = 'Confirming…';
      setHidden(thanks, true);
      setHidden(unlocked, true);
      setHidden(note, true);
      setHidden(star, true);
      setHidden(confetti, true);
      if (pending) {
        pending.hidden = false;
        pending.textContent = CONFIRM_FALLBACK;
      }
    }

    function tick() {
      if (stopped) return;
      if (Date.now() - started >= CONFIRM_GIVE_UP_MS) {
        showFallback();
        return;
      }
      var finish = function (view) {
        if (stopped) return;
        if (isProActive(view)) {
          showReady(view);
          return;
        }
        if (Date.now() - started >= CONFIRM_GIVE_UP_MS) {
          showFallback();
          return;
        }
        setTimeout(tick, CONFIRM_POLL_MS);
      };
      if (!sessionToken()) {
        finish(null);
        return;
      }
      request('/api/v1/me/pro', { method: 'GET' }).then(function (result) {
        finish(result.ok && result.data && result.data.success !== false ? result.data : null);
      });
    }

    showPending();
    tick();
  }

  function planLabel(plan) {
    return plan === 'pro_plus' ? 'Pro Plus' : 'Pro';
  }

  function mountOffer() {
    var planButtons = Array.prototype.slice.call(document.querySelectorAll('[data-plan]'));
    var notNow = document.getElementById('pro-not-now');
    var retry = document.getElementById('pro-retry');
    var signIn = document.getElementById('pro-sign-in');
    var apple = document.getElementById('pro-apple');
    var stripeBox = document.getElementById('pro-stripe');
    var stripeStatus = document.getElementById('pro-stripe-status');
    var legal = document.getElementById('pro-legal');
    var signOut = document.getElementById('pro-sign-out');
    var sendBtn = document.getElementById('pro-send-code');
    var verifyBtn = document.getElementById('pro-verify');
    var resetBtn = document.getElementById('pro-reset-destination');
    var emailBtn = document.getElementById('pro-channel-email');
    var phoneBtn = document.getElementById('pro-channel-phone');
    var emailInput = document.getElementById('pro-email');
    var phoneInput = document.getElementById('pro-phone');
    var codeInput = document.getElementById('pro-code');
    var codeRow = document.getElementById('pro-code-row');
    var destinationRow = document.getElementById('pro-destination-row');
    var channel = 'email';
    var pending = null;
    var busy = false;

    function destinationField() {
      return channel === 'phone' ? phoneInput : emailInput;
    }

    function showChannel(next) {
      channel = next === 'phone' ? 'phone' : 'email';
      if (emailBtn) emailBtn.setAttribute('aria-pressed', channel === 'email' ? 'true' : 'false');
      if (phoneBtn) phoneBtn.setAttribute('aria-pressed', channel === 'phone' ? 'true' : 'false');
      setHidden(document.getElementById('pro-email-field'), channel !== 'email');
      setHidden(document.getElementById('pro-phone-field'), channel !== 'phone');
    }

    function showCodeStep(on) {
      setHidden(codeRow, !on);
      setHidden(destinationRow, on);
      setHidden(sendBtn, on);
      if (!on && codeInput) codeInput.value = '';
    }

    function applyMode(decision, view) {
      var mode = decision.mode;
      var showPlans = mode === 'signed_out' || mode === 'subscribe' || mode === 'stripe';
      planButtons.forEach(function (btn) {
        var plan = btn.getAttribute('data-plan');
        var block = btn.closest('.pro-subscribe-block');
        btn.dataset.mode = mode;
        setHidden(block, !showPlans);
        if (mode === 'stripe') {
          btn.textContent = 'Switch plan';
          btn.setAttribute('aria-label', 'Switch plan for ' + planLabel(plan));
        } else {
          btn.textContent = 'Subscribe';
          btn.setAttribute('aria-label', 'Subscribe to ' + planLabel(plan));
        }
      });
      setHidden(retry, mode !== 'unknown');
      setHidden(apple, mode !== 'apple');
      setHidden(stripeBox, mode !== 'stripe');
      setHidden(signIn, mode !== 'signed_out');
      setHidden(signOut, mode === 'signed_out' || mode === 'checking');
      if (stripeStatus && mode === 'stripe') stripeStatus.textContent = stripeStatusText(view);
      if (legal) {
        if (mode === 'apple') {
          legal.hidden = true;
        } else if (mode === 'stripe') {
          legal.hidden = false;
          legal.textContent = 'Switch plan opens the Stripe customer portal.';
        } else if (mode === 'checking' || mode === 'unknown') {
          legal.hidden = true;
        } else {
          legal.hidden = false;
          legal.textContent = "You'll confirm payment on Stripe Checkout.";
        }
      }
    }

    function refreshPro() {
      if (!sessionToken()) {
        applyMode(decideOffer(null));
        return Promise.resolve();
      }
      setStatus('Checking your MOUR account…');
      return request('/api/v1/me/pro', { method: 'GET' }).then(function (result) {
        var code = result.data && result.data.code;
        if (result.status === 401 || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') {
          setSessionToken('');
          applyMode(decideOffer(null));
          setStatus('That sign-in expired. Sign in again with your MOUR account.');
          return;
        }
        if (!result.ok || !result.data || result.data.success === false) {
          applyMode({ mode: 'unknown' });
          setStatus("We couldn't check your subscription. Try again. Free MOUR stays fully usable.");
          return;
        }
        applyMode(decideOffer(result.data), result.data);
        setStatus('');
      });
    }

    function setBusy(on) {
      busy = on;
      planButtons.concat([sendBtn, verifyBtn, retry]).forEach(function (el) {
        if (!el) return;
        el.disabled = on;
        el.setAttribute('aria-busy', on ? 'true' : 'false');
      });
    }

    function goStripe(url, failure) {
      if (!isStripeRedirect(url)) {
        setStatus(failure);
        return;
      }
      window.location.assign(url);
    }

    function startCheckout(plan) {
      var body = checkoutBody(plan);
      if (!body) return;
      setBusy(true);
      setStatus('Continuing to Stripe Checkout…');
      request('/api/v1/me/pro/checkout', { method: 'POST', body: body }).then(function (result) {
        setBusy(false);
        if (!result.ok) {
          var err = calmError(result.status, result.data, 'checkout');
          if (err.kind === 'apple' || err.kind === 'stripe' || err.kind === 'auth') {
            refreshPro();
            return;
          }
          setStatus(err.text);
          return;
        }
        goStripe(result.data && result.data.url, "Checkout didn't return a Stripe link. No charge was made.");
      });
    }

    function startPortal() {
      setBusy(true);
      setStatus('Opening the customer portal…');
      request('/api/v1/me/pro/portal', { method: 'POST', body: {} }).then(function (result) {
        setBusy(false);
        if (!result.ok) {
          var err = calmError(result.status, result.data, 'portal');
          if (err.kind === 'apple' || err.kind === 'stripe' || err.kind === 'auth') {
            refreshPro();
            return;
          }
          setStatus(err.text);
          return;
        }
        goStripe(result.data && result.data.url, "The portal didn't return a Stripe link.");
      });
    }

    function onPlanClick(event) {
      if (busy) return;
      var btn = event.currentTarget;
      var mode = btn.dataset.mode || 'signed_out';
      var plan = btn.getAttribute('data-plan');
      if (mode === 'signed_out') {
        setHidden(signIn, false);
        var field = destinationField();
        if (field) field.focus();
        setStatus('Sign in with your MOUR account to subscribe.');
        return;
      }
      if (mode === 'stripe') startPortal();
      else if (mode === 'subscribe') startCheckout(plan);
    }

    function sendCode() {
      if (busy) return;
      var body;
      if (channel === 'email') {
        var email = emailInput ? emailInput.value.trim() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setStatus('Enter the email on your MOUR account.');
          return;
        }
        body = { channel: 'email', email: email };
        pending = { channel: 'email', email: email };
      } else {
        var phone = normalizePhone(phoneInput ? phoneInput.value : '');
        if (!phone) {
          setStatus('Enter the 10-digit U.S. mobile number on your MOUR account, or use email.');
          return;
        }
        body = { phone_number: phone.national, country_code: phone.country_code };
        pending = { channel: 'sms', phone_number: phone.e164 };
      }
      setBusy(true);
      setStatus('Sending a code…');
      request('/api/v1/auth/send-otp', { method: 'POST', body: body, auth: false }).then(function (result) {
        setBusy(false);
        if (!result.ok) {
          pending = null;
          setStatus(calmError(result.status, result.data, 'send').text);
          return;
        }
        showCodeStep(true);
        if (codeInput) codeInput.focus();
        setStatus('Enter the 4-digit code. It is good for 5 minutes.');
      });
    }

    function verifyCode() {
      if (busy || !pending) return;
      var code = codeInput ? String(codeInput.value || '').replace(/\D/g, '') : '';
      if (code.length !== 4) {
        setStatus('Enter the 4-digit code.');
        return;
      }
      var body = pending.channel === 'email'
        ? { channel: 'email', email: pending.email, otp_code: code }
        : { channel: 'sms', phone_number: pending.phone_number, otp_code: code };
      setBusy(true);
      setStatus('Checking the code…');
      request('/api/v1/auth/verify-otp', { method: 'POST', body: body, auth: false }).then(function (result) {
        setBusy(false);
        var token = result.data && result.data.auth_token;
        if (!result.ok || !token) {
          if (result.ok && !token) {
            setStatus("That code was accepted, but no session came back. Try again.");
            return;
          }
          setStatus(calmError(result.status, result.data, 'verify').text);
          return;
        }
        setSessionToken(token);
        if (codeInput) codeInput.value = '';
        showCodeStep(false);
        pending = null;
        refreshPro();
      });
    }

    function resetDestination() {
      pending = null;
      showCodeStep(false);
      setStatus('');
    }

    function signOut() {
      var token = sessionToken();
      setSessionToken('');
      pending = null;
      showCodeStep(false);
      var done = token
        ? request('/api/v1/auth/logout', { method: 'POST', body: {}, token: token })
        : Promise.resolve();
      done.then(function () {
        applyMode(decideOffer(null));
        setStatus('Signed out. Free MOUR stays fully usable.');
      });
    }

    function onNotNow(event) {
      var ref = document.referrer;
      if (!ref) return;
      var from;
      try { from = new URL(ref); } catch (err) { return; }
      if (from.origin !== window.location.origin) return;
      event.preventDefault();
      window.history.back();
    }

    if (emailBtn) emailBtn.addEventListener('click', function () { showChannel('email'); });
    if (phoneBtn) phoneBtn.addEventListener('click', function () { showChannel('phone'); });
    if (sendBtn) sendBtn.addEventListener('click', sendCode);
    if (verifyBtn) verifyBtn.addEventListener('click', verifyCode);
    if (resetBtn) resetBtn.addEventListener('click', resetDestination);
    planButtons.forEach(function (btn) {
      btn.addEventListener('click', onPlanClick);
    });
    if (retry) retry.addEventListener('click', function () { refreshPro(); });
    if (signOut) signOut.addEventListener('click', signOut);
    if (notNow) notNow.addEventListener('click', onNotNow);
    [emailInput, phoneInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          sendCode();
        }
      });
    });
    if (codeInput) {
      codeInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          verifyCode();
        }
      });
    }

    showChannel('email');
    showCodeStep(false);
    if (sessionToken()) {
      applyMode({ mode: 'checking' });
      refreshPro();
    } else {
      applyMode(decideOffer(null));
    }
  }

  return {
    APPLE_LINE: APPLE_LINE,
    FALLBACK_API_BASE: FALLBACK_API_BASE,
    resolveApiBase: resolveApiBase,
    isStripeRedirect: isStripeRedirect,
    formatRenewalDate: formatRenewalDate,
    renewalNote: renewalNote,
    isProActive: isProActive,
    CONFIRM_POLL_MS: CONFIRM_POLL_MS,
    CONFIRM_GIVE_UP_MS: CONFIRM_GIVE_UP_MS,
    CONFIRM_FALLBACK: CONFIRM_FALLBACK,
    PRO_READY_TITLE: PRO_READY_TITLE,
    checkoutBody: checkoutBody,
    decideOffer: decideOffer,
    primaryAction: primaryAction,
    stripeStatusText: stripeStatusText,
    normalizePhone: normalizePhone,
    calmError: calmError,
    mount: mount,
  };
});
