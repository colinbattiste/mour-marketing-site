/**
 * MOUR APP — Core Application Controller
 * Continuous Scroll Opaque 3D Globe with Active Radar Sweep Animation
 * Earth spins dynamically when scrolling, rotates smoothly when idle
 * Founding Eye waitlist (mour-backend API), Earnings Calculator, 3D Tilt Viewfinder
 */

(function() {
  'use strict';

  // ==========================================================================
  // OPAQUE 3D SPINNING GLOBE WITH CENTER RADAR SCANNING ENGINE
  // ==========================================================================
  const canvas = document.getElementById('mour-scroll-canvas');
  let ctx = null;
  let width = 0;
  let height = 0;

  // Globe Physics & Rotation
  let globeAngle = 0;
  let currentScrollY = 0;
  let lastScrollY = 0;
  let scrollVelocity = 0;
  const IDLE_ROTATION_SPEED = 0.003; // Smooth idle rotation when not scrolling
  let radarAngle = 0;

  // Landmass Data Points (Lat/Lon coordinates approximating major world continents)
  const landPoints = [];

  function generateLandPoints() {
    landPoints.length = 0;
    // Helper to generate a cluster of dots for a continent
    function addCluster(centerLat, centerLon, latRadius, lonRadius, count) {
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        const v = Math.random();
        const lat = centerLat + (Math.random() - 0.5) * latRadius * 2;
        const lon = centerLon + (Math.random() - 0.5) * lonRadius * 2;
        landPoints.push({
          lat: (lat * Math.PI) / 180,
          lon: (lon * Math.PI) / 180
        });
      }
    }

    // North America (USA, Canada, Mexico)
    addCluster(45, -100, 15, 30, 120);
    addCluster(32, -90, 10, 20, 100);
    addCluster(22, -100, 6, 12, 50);

    // South America
    addCluster(-10, -55, 18, 14, 110);
    addCluster(-30, -60, 14, 10, 60);

    // Europe
    addCluster(50, 15, 12, 22, 100);

    // Africa
    addCluster(5, 20, 20, 18, 140);
    addCluster(-20, 25, 12, 12, 70);

    // Asia & Middle East
    addCluster(45, 80, 18, 45, 180);
    addCluster(28, 75, 14, 25, 120);
    addCluster(32, 115, 15, 25, 140);
    addCluster(15, 105, 10, 15, 60);

    // Australia
    addCluster(-25, 135, 12, 18, 80);
  }

  // Active "Eye" Creator Beacons (Miami, New York, Los Angeles, London, Tokyo)
  const creatorBeacons = [
    { name: 'Miami, FL', lat: (25.76 * Math.PI) / 180, lon: (-80.19 * Math.PI) / 180 },
    { name: 'New York, NY', lat: (40.71 * Math.PI) / 180, lon: (-74.00 * Math.PI) / 180 },
    { name: 'Los Angeles, CA', lat: (34.05 * Math.PI) / 180, lon: (-118.24 * Math.PI) / 180 },
    { name: 'London, UK', lat: (51.50 * Math.PI) / 180, lon: (-0.12 * Math.PI) / 180 },
    { name: 'Tokyo, JP', lat: (35.67 * Math.PI) / 180, lon: (139.65 * Math.PI) / 180 }
  ];

  function resizeCanvas() {
    if (!canvas) return;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function drawGlobeScene() {
    if (!ctx) return;

    // Track scroll velocity
    const targetScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const deltaY = targetScrollY - lastScrollY;
    scrollVelocity = deltaY;
    lastScrollY = targetScrollY;

    // Earth spins dynamically with scroll; when not scrolling, rotates smoothly at idle speed
    if (Math.abs(scrollVelocity) > 0.1) {
      globeAngle += scrollVelocity * 0.0035;
    } else {
      globeAngle += IDLE_ROTATION_SPEED;
    }

    // Radar scan sweeps continuously in the center
    radarAngle += 0.025;

    ctx.clearRect(0, 0, width, height);

    // Globe Position & Size (Center of screen, comfortable background size)
    const globeRadius = Math.min(width, height) * 0.32;
    const globeX = width / 2;
    // Globe smoothly stays centered in viewport
    const globeY = height * 0.50;

    // 1. Globe Ambient Shadow & Outer Atmospheric Glow
    ctx.save();
    const glowGrad = ctx.createRadialGradient(
      globeX, globeY, globeRadius * 0.85,
      globeX, globeY, globeRadius * 1.3
    );
    glowGrad.addColorStop(0, 'rgba(0, 229, 255, 0.22)');
    glowGrad.addColorStop(0.5, 'rgba(0, 131, 146, 0.08)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(globeX, globeY, globeRadius * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Opaque 3D Sphere Base (Dark Navy/Slate Deep Globe)
    ctx.save();
    ctx.beginPath();
    ctx.arc(globeX, globeY, globeRadius, 0, Math.PI * 2);
    ctx.clip(); // Keep all internal globe drawings strictly inside the sphere

    // Spherical Shading Gradient (gives rich 3D curvature)
    const sphereGrad = ctx.createRadialGradient(
      globeX - globeRadius * 0.35, globeY - globeRadius * 0.35, globeRadius * 0.1,
      globeX, globeY, globeRadius
    );
    sphereGrad.addColorStop(0, '#0E1A38'); // Top light reflection
    sphereGrad.addColorStop(0.6, '#071026'); // Mid body
    sphereGrad.addColorStop(1, '#020712'); // Dark rim shadow
    ctx.fillStyle = sphereGrad;
    ctx.fillRect(globeX - globeRadius, globeY - globeRadius, globeRadius * 2, globeRadius * 2);

    // 3. 3D Projected Latitude & Longitude Coordinate Lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)';

    // Latitude parallels
    const lats = [-60, -40, -20, 0, 20, 40, 60];
    for (const latDeg of lats) {
      const latRad = (latDeg * Math.PI) / 180;
      const y = globeY - Math.sin(latRad) * globeRadius;
      const r = Math.cos(latRad) * globeRadius;
      ctx.beginPath();
      ctx.ellipse(globeX, y, r, r * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Longitude meridians (rotating with globeAngle)
    const numMeridians = 12;
    for (let m = 0; m < numMeridians; m++) {
      const lonOffset = (m * Math.PI * 2) / numMeridians + globeAngle;
      const cosLon = Math.cos(lonOffset);
      const sinLon = Math.sin(lonOffset);

      // Only draw the front-facing hemisphere of the meridian
      if (cosLon > -0.1) {
        ctx.beginPath();
        const rx = Math.abs(sinLon) * globeRadius;
        ctx.ellipse(globeX, globeY, rx, globeRadius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 4. Draw Projected Continents (Glowing Cyan/Teal Geo-Dots)
    ctx.fillStyle = '#00E5FF';
    for (let i = 0; i < landPoints.length; i++) {
      const p = landPoints[i];
      // 3D Spherical Projection onto view plane
      const lon = p.lon + globeAngle;
      const cosLat = Math.cos(p.lat);
      const sinLat = Math.sin(p.lat);
      const cosLon = Math.cos(lon);
      const sinLon = Math.sin(lon);

      // Z coordinate (positive means facing camera)
      const z = cosLat * cosLon;
      if (z > 0) {
        const x = globeX + cosLat * sinLon * globeRadius;
        const y = globeY - sinLat * globeRadius;

        // Size and brightness scale with 3D depth towards viewer
        const dotSize = Math.max(1, z * 2.2);
        ctx.globalAlpha = Math.min(0.85, z * 0.9);
        ctx.fillRect(x, y, dotSize, dotSize);
      }
    }
    ctx.globalAlpha = 1.0;

    // 5. Active "Eye" Creator Telemetry Beacons (Pulsing Targets on Globe)
    for (const beacon of creatorBeacons) {
      const lon = beacon.lon + globeAngle;
      const cosLat = Math.cos(beacon.lat);
      const sinLat = Math.sin(beacon.lat);
      const cosLon = Math.cos(lon);
      const sinLon = Math.sin(lon);

      const z = cosLat * cosLon;
      if (z > 0.15) {
        const bx = globeX + cosLat * sinLon * globeRadius;
        const by = globeY - sinLat * globeRadius;

        // Pulsing Gold Beacon
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(bx, by, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(250, 204, 21, ${0.8 - pulse * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 6. Central High-Tech Radar Scanning Beam in Middle of Globe
    ctx.save();
    ctx.translate(globeX, globeY);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, globeRadius, radarAngle, radarAngle + 0.45);
    ctx.closePath();

    const radarGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, globeRadius);
    radarGrad.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
    radarGrad.addColorStop(0.7, 'rgba(0, 229, 255, 0.15)');
    radarGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = radarGrad;
    ctx.fill();

    // Radar Scanning Leading Line
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(radarAngle + 0.45) * globeRadius, Math.sin(radarAngle + 0.45) * globeRadius);
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // Exit sphere clipping

    // 7. Globe Outer Rings & Targeting Brackets (Cyber Optical Reticle)
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(globeX, globeY, globeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric Dashed Radar Ring around the Globe
    ctx.save();
    ctx.translate(globeX, globeY);
    ctx.rotate(globeAngle * 0.5);
    ctx.setLineDash([8, 14]);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, globeRadius * 1.08, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal Angle Ticks
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    for (let a = 0; a < 4; a++) {
      const angle = (a * Math.PI) / 2;
      const x1 = Math.cos(angle) * (globeRadius * 1.04);
      const y1 = Math.sin(angle) * (globeRadius * 1.04);
      const x2 = Math.cos(angle) * (globeRadius * 1.14);
      const y2 = Math.sin(angle) * (globeRadius * 1.14);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    requestAnimationFrame(drawGlobeScene);
  }

  // ==========================================================================
  // SCROLL PROGRESS BAR & PARALLAX SHIFTS
  // ==========================================================================
  const scrollProgressBar = document.getElementById('scroll-progress');
  const siteHeader = document.querySelector('.site-header');
  const heroParallaxBg = document.querySelector('.hero-parallax-bg');
  const telemetryBadges = document.querySelectorAll('.telemetry-badge');

  function handleScroll() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    // Scroll progress bar
    if (scrollProgressBar) {
      const pct = Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
      scrollProgressBar.style.width = pct + '%';
    }

    // Header styling
    if (siteHeader) {
      if (scrollY > 40) siteHeader.classList.add('scrolled');
      else siteHeader.classList.remove('scrolled');
    }

    // Hero background subtle parallax
    if (heroParallaxBg && scrollY < 1200) {
      heroParallaxBg.style.transform = `translateY(${scrollY * 0.22}px)`;
    }

    // Floating telemetry badges shift
    if (telemetryBadges.length > 0 && scrollY < 1000) {
      telemetryBadges.forEach((badge, idx) => {
        const speed = (idx + 1) * 0.08;
        badge.style.transform = `translateY(${scrollY * -speed}px)`;
      });
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });

  // ==========================================================================
  // 3D PERSPECTIVE TILT ON CAMERA HUD & SERVICE CARDS
  // ==========================================================================
  const cameraHudCard = document.querySelector('.camera-hud-card');
  if (cameraHudCard) {
    cameraHudCard.addEventListener('mousemove', (e) => {
      const rect = cameraHudCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -12;
      const rotateY = ((x - centerX) / centerX) * 12;

      cameraHudCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;

      const reticleCoord = document.getElementById('hud-live-coord');
      if (reticleCoord) {
        reticleCoord.textContent = `X: ${(x / rect.width * 100).toFixed(1)}% | Y: ${(y / rect.height * 100).toFixed(1)}%`;
      }
    });

    cameraHudCard.addEventListener('mouseleave', () => {
      cameraHudCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
  }

  const serviceCards = document.querySelectorAll('.service-card');
  serviceCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  });

  // Live HUD Recording Timer Simulation
  const hudTimer = document.getElementById('hud-rec-timer');
  if (hudTimer) {
    let seconds = 868;
    setInterval(() => {
      seconds++;
      const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      hudTimer.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  // ==========================================================================
  // CREATOR EARNINGS CALCULATOR
  // ==========================================================================
  const gigsSlider = document.getElementById('calc-gigs');
  const bountySlider = document.getElementById('calc-bounty');
  const gigsDisplay = document.getElementById('calc-gigs-val');
  const bountyDisplay = document.getElementById('calc-bounty-val');
  const weeklyEarnDisplay = document.getElementById('calc-weekly-earnings');
  const monthlyEarnDisplay = document.getElementById('calc-monthly-earnings');

  function updateEarnings() {
    if (!gigsSlider || !bountySlider) return;
    const gigs = parseInt(gigsSlider.value, 10);
    const bounty = parseInt(bountySlider.value, 10);

    const weekly = gigs * bounty;
    const monthly = weekly * 4.33;

    if (gigsDisplay) gigsDisplay.textContent = `${gigs} gigs / wk`;
    if (bountyDisplay) bountyDisplay.textContent = `$${bounty} / gig`;

    if (weeklyEarnDisplay) weeklyEarnDisplay.textContent = `$${weekly.toLocaleString()}`;
    if (monthlyEarnDisplay) monthlyEarnDisplay.textContent = `$${Math.round(monthly).toLocaleString()}`;
  }

  if (gigsSlider && bountySlider) {
    gigsSlider.addEventListener('input', updateEarnings);
    bountySlider.addEventListener('input', updateEarnings);
    updateEarnings();
  }

  // Phone Number Auto-Formatter
  const phoneInput = document.getElementById('mour_phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
      e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });
  }

  // ==========================================================================
  // FOUNDING EYE VIP WAITLIST FORM SUBMISSION (mour-backend API)
  // ==========================================================================
  const MOUR_WAITLIST_URL = 'https://mour-backend.onrender.com/api/v1/eyes/waitlist';
  const FORMSPREE_FALLBACK_URL = 'https://formspree.io/f/mbgjgdoj';

  function postWaitlistJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch (err) {
      return {};
    }
  }

  async function fallbackWaitlistToFormspree(payload) {
    try {
      await postWaitlistJson(FORMSPREE_FALLBACK_URL, {
        ...payload,
        _subject: 'New MOUR Founding Eye Registration: ' + (payload.Full_Name || '')
      });
    } catch (err) {
      console.warn('Formspree waitlist fallback failed:', err);
    }
  }

  window.submitMourApplication = async function() {
    const btn = document.getElementById('mour_submit_btn');
    const errBox = document.getElementById('mour_error_msg');
    const formBox = document.getElementById('mour_form_inner');
    const successBox = document.getElementById('mour_success_card');

    const nameField = document.getElementById('mour_full_name');
    const dobField = document.getElementById('mour_dob');
    const emailField = document.getElementById('mour_email');
    const phoneField = document.getElementById('mour_phone');
    const cityField = document.getElementById('mour_city');
    const deviceField = document.getElementById('mour_device');
    const ageCheck = document.getElementById('mour_age');
    const termsCheck = document.getElementById('mour_terms');

    function showError(msg) {
      if (errBox) {
        errBox.textContent = '⚠️ ' + msg;
        errBox.style.display = 'block';
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    if (errBox) errBox.style.display = 'none';

    if (!nameField.value.trim()) { showError('Please enter your Full Legal Name.'); nameField.focus(); return; }
    if (!dobField.value) { showError('Please enter your Date of Birth.'); dobField.focus(); return; }
    if (!emailField.value.trim() || !emailField.value.includes('@')) { showError('Please enter a valid Email Address.'); emailField.focus(); return; }
    if (!phoneField.value.trim() || phoneField.value.replace(/\D/g, '').length < 10) { showError('Please enter a 10-digit Mobile Phone Number.'); phoneField.focus(); return; }
    if (!cityField.value.trim()) { showError('Please enter your City & State.'); cityField.focus(); return; }
    if (!deviceField.value.trim()) { showError('Please enter your Phone or Camera Model.'); deviceField.focus(); return; }
    if (!ageCheck.checked) { showError('You must certify that you are at least 18 years old.'); return; }
    if (!termsCheck.checked) { showError('You must agree to the MOUR Terms of Service.'); return; }

    const originalBtnText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Encrypting & Transmitting to MOUR...';
    }

    function restoreButton() {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalBtnText;
      }
    }

    const payload = {
      Full_Name: nameField.value.trim(),
      Date_of_Birth: dobField.value,
      email: emailField.value.trim(),
      Mobile_Phone: phoneField.value.trim(),
      City_State: cityField.value.trim(),
      Device_Camera_Model: deviceField.value.trim(),
      Age_18_Verified: 'Yes',
      Terms_Agreed: 'Yes',
      Role: 'Eye (Creator)',
      VIP_Tier: 'Founding Eye VIP'
    };

    try {
      const response = await postWaitlistJson(MOUR_WAITLIST_URL, payload);
      const data = await readResponseJson(response);
      const apiSucceeded = (response.ok || data.success === true) && data.success !== false;

      if (apiSucceeded) {
        showSuccessState(nameField.value.trim(), cityField.value.trim());
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        showError(data.error || 'Please check your information and try again.');
        restoreButton();
        return;
      }

      console.warn('Waitlist API returned ' + response.status + ', attempting Formspree fallback');
      await fallbackWaitlistToFormspree(payload);
      showError(data.error || 'We could not confirm your registration with MOUR. Please try again in a moment.');
      restoreButton();
    } catch (err) {
      console.warn('Waitlist API network error, attempting Formspree fallback:', err);
      await fallbackWaitlistToFormspree(payload);
      showError('Connection error. Please check your network and try again.');
      restoreButton();
    }
  };

  function showSuccessState(name, city) {
    const formBox = document.getElementById('mour_form_inner');
    const successBox = document.getElementById('mour_success_card');
    const nameSpan = document.getElementById('mour_success_name');
    const passName = document.getElementById('pass-holder-name');
    const passCity = document.getElementById('pass-holder-city');

    if (nameSpan) nameSpan.textContent = name;
    if (passName) passName.textContent = name;
    if (passCity) passCity.textContent = city || 'Verified Territory';

    if (formBox) formBox.style.display = 'none';
    if (successBox) successBox.style.display = 'block';
    successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Mobile Menu Toggle
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-active');
    });
  }

  // Smooth scroll links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
          if (navLinks) navLinks.classList.remove('mobile-active');
        }
      }
    });
  });

  // Copy Voucher Code
  window.copyVoucherCode = function() {
    const code = 'MOUR-FOUNDER-5GIFT';
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-voucher');
      if (btn) {
        btn.textContent = '✓ Copied to Clipboard!';
        btn.style.background = '#10B981';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.textContent = 'Copy Voucher Code';
          btn.style.background = 'var(--accent-gold)';
          btn.style.color = '#000';
        }, 2500);
      }
    });
  };

  // Founding Eyes VIP Enrollment Ad Interaction
  window.activateFoundingEyePromo = function(promoLabel) {
    const target = document.getElementById('mour_form_inner') || document.getElementById('waitlist');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const card = document.querySelector('.waitlist-card');
    if (card) {
      card.classList.remove('vip-card-highlight');
      // Trigger reflow to restart animation
      void card.offsetWidth;
      card.classList.add('vip-card-highlight');
      setTimeout(() => {
        card.classList.remove('vip-card-highlight');
      }, 3500);
    }

    const nameInput = document.getElementById('mour_full_name');
    if (nameInput) {
      setTimeout(() => nameInput.focus(), 500);
    }

    showToastNotification(`⚡ Founding Eye Status: 100% Accepted! First Gig Escrow Bonuses Unlocked.`);
  };

  // Toast Notification System
  function showToastNotification(msg) {
    let toast = document.getElementById('mour-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mour-toast';
      toast.style.position = 'fixed';
      toast.style.bottom = '28px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      toast.style.background = 'rgba(7, 16, 38, 0.95)';
      toast.style.border = '1px solid #00E5FF';
      toast.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 229, 255, 0.4)';
      toast.style.color = '#FFFFFF';
      toast.style.fontFamily = 'var(--font-mono)';
      toast.style.fontSize = '12px';
      toast.style.padding = '12px 24px';
      toast.style.borderRadius = '999px';
      toast.style.zIndex = '9999';
      toast.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      toast.style.opacity = '0';
      toast.style.pointerEvents = 'none';
      toast.style.whiteSpace = 'nowrap';
      document.body.appendChild(toast);
    }

    toast.innerHTML = msg;
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';

    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      toast.style.opacity = '0';
    }, 4000);
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    if (canvas) {
      resizeCanvas();
      generateLandPoints();
      window.addEventListener('resize', () => {
        resizeCanvas();
      });
      requestAnimationFrame(drawGlobeScene);
    }
  });

})();
