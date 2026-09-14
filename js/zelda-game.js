/**
 * MOUR APP — "MOUR BOUNTY RUSH: THE 1-MINUTE GIG RACE"
 * Real-time competitive on-demand gig hunter mini-game
 * Player vs 3 Independent Rival AI Creators racing to collect the most bounty money!
 * Features: 60-second blitz, detailed city street map, independent rival behaviors, centered header/footer
 */

(function() {
  'use strict';

  // --- Audio Synthesizer (Web Audio API Chiptune & Arcade SFX) ---
  let audioCtx = null;
  let audioMuted = false;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, delay = 0, vol = 0.15) {
    if (audioMuted) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const start = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(start);
      osc.stop(start + duration);
    } catch (e) {}
  }

  function playSound(name) {
    if (audioMuted) return;
    initAudio();

    if (name === 'cash') {
      playTone(987.77, 'sine', 0.1, 0, 0.2); // B5
      playTone(1318.51, 'sine', 0.22, 0.08, 0.25); // E6
    } else if (name === 'big_cash') {
      [523, 659, 783, 1046, 1318].forEach((f, i) => {
        playTone(f, 'square', 0.14, i * 0.06, 0.18);
      });
    } else if (name === 'shutter') {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const bufferSize = audioCtx.sampleRate * 0.08;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      noise.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
    } else if (name === 'rival_claim') {
      playTone(280, 'sawtooth', 0.1, 0, 0.12);
      playTone(200, 'sawtooth', 0.15, 0.08, 0.14);
    } else if (name === 'spawn_alert') {
      playTone(880, 'triangle', 0.08, 0, 0.14);
      playTone(1174, 'triangle', 0.12, 0.06, 0.16);
    } else if (name === 'whistle') {
      playTone(620, 'sine', 0.35, 0, 0.22);
      playTone(540, 'sine', 0.55, 0.25, 0.25);
    }
  }

  // --- Game Settings: EXACTLY 1 MINUTE TIME LIMIT ---
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 440;
  const TOTAL_TIME_SECONDS = 60; // Exactly 1 minute as requested

  // Game State
  const game = {
    isRunning: false,
    isGameOver: false,
    timeLeft: TOTAL_TIME_SECONDS,
    lastFrameTime: performance.now(),
    gigSpawnTimer: 0,
    difficultyMultiplier: 1.0,
    floatingTexts: [],
    particles: []
  };

  // Main Player (Center Spawn, Cutout Glasses, Distinct Glowing Cyan Aura)
  const player = {
    id: 'player',
    name: 'YOU (MOUR Eye)',
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2 + 10,
    radius: 14,
    speed: 3.5,
    color: '#00E5FF',
    score: 0,
    gigsCount: 0,
    isPlayer: true
  };

  // 3 Sparsed-Out Rival AI Creators with Independent Roles & Personalities
  const rivals = [
    {
      id: 'rival_speedy',
      name: 'Speedy Snap',
      x: 70,
      y: 90, // Northwest corner
      vx: 0, vy: 0,
      radius: 13,
      baseSpeed: 2.1,
      currentSpeed: 2.1,
      personality: 'closest',
      wobbleSeed: Math.random() * 10,
      color: '#FACC15', // Yellow runner
      score: 0,
      gigsCount: 0,
      targetGig: null
    },
    {
      id: 'rival_alex',
      name: 'Pro Alex',
      x: CANVAS_WIDTH - 70,
      y: 95, // Northeast corner
      vx: 0, vy: 0,
      radius: 13,
      baseSpeed: 2.2,
      currentSpeed: 2.2,
      personality: 'value_per_dist',
      wobbleSeed: Math.random() * 10,
      color: '#C084FC', // Purple photographer
      score: 0,
      gigsCount: 0,
      targetGig: null
    },
    {
      id: 'rival_phantom',
      name: 'Phantom Drone',
      x: CANVAS_WIDTH - 90,
      y: CANVAS_HEIGHT - 65, // Southeast corner
      vx: 0, vy: 0,
      radius: 13,
      baseSpeed: 2.3,
      currentSpeed: 2.3,
      personality: 'highest_value',
      wobbleSeed: Math.random() * 10,
      color: '#F43F5E', // Red cyber drone
      score: 0,
      gigsCount: 0,
      targetGig: null
    }
  ];

  // City Street Blocks Definition (for realistic urban blocks & corners layout)
  const cityBlocks = [
    { x: 30, y: 75, w: 180, h: 95, type: 'building', name: 'MOUR Tech Labs' },
    { x: 265, y: 75, w: 190, h: 95, type: 'plaza', name: 'Metropolis Plaza' },
    { x: 510, y: 75, w: 180, h: 95, type: 'building', name: 'Escrow Tower' },

    { x: 30, y: 220, w: 180, h: 95, type: 'building', name: 'Skyline Studios' },
    { x: 265, y: 220, w: 190, h: 95, type: 'park', name: 'Cyber Park' },
    { x: 510, y: 220, w: 180, h: 95, type: 'building', name: 'Founding Eye HQ' },

    { x: 30, y: 360, w: 180, h: 65, type: 'building', name: 'South District' },
    { x: 265, y: 360, w: 190, h: 65, type: 'building', name: 'Transit Center' },
    { x: 510, y: 360, w: 180, h: 65, type: 'building', name: 'East Wharf' }
  ];

  // Active Gigs Array
  const activeGigs = [];
  let nextGigId = 1;

  function spawnGig() {
    if (activeGigs.length >= 6) return;

    // Pick a street location (between blocks / on road networks)
    const streetNodes = [
      { x: 120, y: 195 }, { x: 240, y: 195 }, { x: 360, y: 195 }, { x: 480, y: 195 }, { x: 600, y: 195 },
      { x: 120, y: 335 }, { x: 240, y: 335 }, { x: 360, y: 335 }, { x: 480, y: 335 }, { x: 600, y: 335 },
      { x: 235, y: 120 }, { x: 235, y: 260 }, { x: 485, y: 120 }, { x: 485, y: 260 },
      { x: 360, y: 120 }, { x: 360, y: 265 }, { x: 120, y: 120 }, { x: 600, y: 120 }
    ];

    const spot = streetNodes[Math.floor(Math.random() * streetNodes.length)];
    const x = spot.x + (Math.random() - 0.5) * 35;
    const y = spot.y + (Math.random() - 0.5) * 30;

    const roll = Math.random();
    let type, value, radius, color, label, icon, lifespan;

    if (roll < 0.45) {
      type = 'snap';
      value = Math.floor(Math.random() * 4 + 5) * 5; // $25 - $45
      radius = 16;
      color = '#10B981';
      label = `$${value} Photo`;
      icon = '📸';
      lifespan = 18;
    } else if (roll < 0.80) {
      type = 'video';
      value = Math.floor(Math.random() * 9 + 13) * 5; // $65 - $110
      radius = 20;
      color = '#00E5FF';
      label = `$${value} 4K Video`;
      icon = '🎥';
      lifespan = 16;
    } else {
      type = 'mega';
      value = Math.floor(Math.random() * 15 + 30) * 5; // $150 - $225!
      radius = 26;
      color = '#FACC15';
      label = `🔥 $${value} BREAKING`;
      icon = '⭐';
      lifespan = 14;
      playSound('spawn_alert');
    }

    activeGigs.push({
      id: nextGigId++,
      x, y, type, value, radius, color, label, icon,
      maxLife: lifespan,
      life: lifespan,
      pulsePhase: Math.random() * Math.PI
    });
  }

  // Keyboard Input State
  const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false
  };

  let canvas, ctx;

  function addFloatingText(x, y, text, color) {
    game.floatingTexts.push({
      x, y, text, color,
      alpha: 1.0,
      vy: -1.2,
      life: 55
    });
  }

  function addCaptureSparks(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 3 + 1;
      game.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: Math.random() * 2.5 + 1.2,
        color,
        alpha: 1.0,
        decay: Math.random() * 0.035 + 0.02
      });
    }
  }

  // --- Independent AI Rivals (No Unison Movement, Distinct Target Allocation) ---
  function updateRivals(time) {
    // Collect set of already targeted gigs so rivals sparse out
    const claimedTargets = new Set();

    for (let i = 0; i < rivals.length; i++) {
      const rival = rivals[i];
      rival.wobbleSeed += 0.04;

      // Validate current target
      if (!rival.targetGig || !activeGigs.includes(rival.targetGig)) {
        rival.targetGig = null;

        // Filter for available gigs that aren't already chased by another rival
        let candidates = activeGigs.filter(g => !claimedTargets.has(g.id));
        if (candidates.length === 0) candidates = activeGigs; // Fallback if crowded

        if (candidates.length > 0) {
          if (rival.personality === 'highest_value') {
            // Phantom Drone hunts highest paying
            rival.targetGig = [...candidates].sort((a, b) => b.value - a.value)[0];
          } else if (rival.personality === 'closest') {
            // Speedy hunts closest
            rival.targetGig = [...candidates].sort((a, b) => {
              const d1 = Math.hypot(a.x - rival.x, a.y - rival.y);
              const d2 = Math.hypot(b.x - rival.x, b.y - rival.y);
              return d1 - d2;
            })[0];
          } else {
            // Pro Alex weighs value over distance
            rival.targetGig = [...candidates].sort((a, b) => {
              const d1 = Math.hypot(a.x - rival.x, a.y - rival.y);
              const d2 = Math.hypot(b.x - rival.x, b.y - rival.y);
              return (b.value / (d2 + 20)) - (a.value / (d1 + 20));
            })[0];
          }
        }
      }

      if (rival.targetGig) {
        claimedTargets.add(rival.targetGig.id);

        // Move with individual steering and slight organic wobble (breaks unison!)
        const dx = rival.targetGig.x - rival.x;
        const dy = rival.targetGig.y - rival.y;
        const dist = Math.hypot(dx, dy);

        rival.currentSpeed = rival.baseSpeed * game.difficultyMultiplier;

        // Add subtle lateral wobble perpendicular to path so they take natural curves
        const wobble = Math.sin(rival.wobbleSeed + i * 1.5) * 0.4;
        const normX = dx / (dist || 1);
        const normY = dy / (dist || 1);
        const perpX = -normY * wobble;
        const perpY = normX * wobble;

        if (dist > 3) {
          rival.x += (normX + perpX) * rival.currentSpeed;
          rival.y += (normY + perpY) * rival.currentSpeed;
        }

        // Check if rival reached and claimed the gig
        if (dist < rival.radius + rival.targetGig.radius) {
          const claimedGig = rival.targetGig;
          rival.score += claimedGig.value;
          rival.gigsCount++;
          playSound('rival_claim');

          addFloatingText(claimedGig.x, claimedGig.y, `-${claimedGig.label} by ${rival.name}`, rival.color);
          addCaptureSparks(claimedGig.x, claimedGig.y, rival.color);

          const idx = activeGigs.indexOf(claimedGig);
          if (idx !== -1) activeGigs.splice(idx, 1);
          rival.targetGig = null;
          updateLeaderboardUI();
        }
      }
    }
  }

  // --- Player Updates ---
  function updatePlayer() {
    let dx = 0;
    let dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    let currentSpeed = player.speed;
    if (keys.sprint) currentSpeed *= 1.4;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    player.x += dx * currentSpeed;
    player.y += dy * currentSpeed;

    // Bounds containment
    const topBarHeight = 55;
    player.x = Math.max(player.radius, Math.min(CANVAS_WIDTH - player.radius, player.x));
    player.y = Math.max(topBarHeight + player.radius, Math.min(CANVAS_HEIGHT - player.radius, player.y));

    // Player snags gig!
    for (let i = activeGigs.length - 1; i >= 0; i--) {
      const g = activeGigs[i];
      const dist = Math.hypot(player.x - g.x, player.y - g.y);

      if (dist < player.radius + g.radius) {
        player.score += g.value;
        player.gigsCount++;

        playSound('shutter');
        if (g.type === 'mega') {
          playSound('big_cash');
        } else {
          playSound('cash');
        }

        addFloatingText(g.x, g.y, `+${g.label}!`, '#00E5FF');
        addCaptureSparks(g.x, g.y, g.color);

        activeGigs.splice(i, 1);
        updateLeaderboardUI();
      }
    }
  }

  function updateLeaderboardUI() {
    const participants = [player, ...rivals].sort((a, b) => b.score - a.score);

    const lbContainer = document.getElementById('bounty-live-leaderboard');
    if (lbContainer) {
      lbContainer.innerHTML = participants.map((p, rank) => {
        const isMe = p.isPlayer;
        const medal = rank === 0 ? '👑 1st' : rank === 1 ? '2nd' : rank === 2 ? '3rd' : '4th';
        return `
          <div class="lb-row ${isMe ? 'lb-me' : ''}" style="color: ${p.color};">
            <span class="lb-rank">${medal}</span>
            <span class="lb-name">${isMe ? '★ ' + p.name : p.name}</span>
            <span class="lb-gigs">(${p.gigsCount} gigs)</span>
            <span class="lb-cash">$${p.score.toLocaleString()}</span>
          </div>
        `;
      }).join('');
    }
  }

  // --- Main Update Loop ---
  function update(delta, time) {
    if (game.isGameOver) return;

    // 1-Minute Countdown Clock
    game.timeLeft -= delta;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      endGame();
      return;
    }

    // Progressive Difficulty (Rivals accelerate throughout the 1 minute)
    const progress = 1 - (game.timeLeft / TOTAL_TIME_SECONDS);
    game.difficultyMultiplier = 1.0 + progress * 0.9;

    // Gig Spawn Timer (Frequent spawns keep the 60s intense!)
    game.gigSpawnTimer += delta;
    const spawnRate = Math.max(1.4, 2.5 - progress * 1.0);
    if (game.gigSpawnTimer >= spawnRate) {
      game.gigSpawnTimer = 0;
      spawnGig();
    }

    // Age out gigs
    for (let i = activeGigs.length - 1; i >= 0; i--) {
      activeGigs[i].life -= delta;
      if (activeGigs[i].life <= 0) {
        addFloatingText(activeGigs[i].x, activeGigs[i].y, 'EXPIRED', '#64748B');
        activeGigs.splice(i, 1);
      }
    }

    updatePlayer();
    updateRivals(time);

    // Floating text update
    for (let i = game.floatingTexts.length - 1; i >= 0; i--) {
      const ft = game.floatingTexts[i];
      ft.y += ft.vy;
      ft.life--;
      ft.alpha = ft.life / 55;
      if (ft.life <= 0) game.floatingTexts.splice(i, 1);
    }

    // Particles update
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) game.particles.splice(i, 1);
    }
  }

  function endGame() {
    game.isGameOver = true;
    playSound('whistle');

    const participants = [player, ...rivals].sort((a, b) => b.score - a.score);
    const didPlayerWin = participants[0].isPlayer;

    const overlay = document.getElementById('bounty-game-over-modal');
    const titleEl = document.getElementById('bounty-game-over-title');
    const descEl = document.getElementById('bounty-game-over-desc');
    const voucherCard = document.getElementById('bounty-voucher-card');

    if (overlay) {
      overlay.style.display = 'flex';
      if (didPlayerWin) {
        playSound('big_cash');
        titleEl.innerHTML = `🏆 VICTORY! 1ST PLACE FOUNDING EYE!`;
        descEl.innerHTML = `You took 1st place with <strong>$${player.score.toLocaleString()}</strong> in completed gigs! Your \$5 Digital Gift Card Voucher is unlocked:`;
        if (voucherCard) voucherCard.style.display = 'block';

        const codeInput = document.getElementById('mour_vip_code');
        if (codeInput) codeInput.value = 'MOUR-FOUNDER-5GIFT (Bounty Champion 1st Place)';
      } else {
        const winner = participants[0];
        titleEl.innerHTML = `⏱️ TIME'S UP! (60s BLITZ)`;
        descEl.innerHTML = `<strong>${winner.name}</strong> won with \$${winner.score.toLocaleString()}. You finished with <strong>\$${player.score.toLocaleString()}</strong>. Play again to beat the rivals and claim your \$5 gift card voucher!`;
        if (voucherCard) voucherCard.style.display = 'none';
      }
    }
  }

  // --- Draw Loop: DETAILED REALISTIC CITY STREET MAP BACKGROUND ---
  function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Asphalt Road Network Base
    ctx.fillStyle = '#080F24'; // Deep dark asphalt
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. City Blocks, Buildings, Parks & Rooftops
    for (const block of cityBlocks) {
      // Sidewalk Curbs
      ctx.fillStyle = '#172545';
      ctx.fillRect(block.x - 5, block.y - 5, block.w + 10, block.h + 10);

      if (block.type === 'building') {
        // Modern Dark Building Rooftop
        ctx.fillStyle = '#0B1530';
        ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.strokeStyle = '#1E325A';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(block.x, block.y, block.w, block.h);

        // Helipad or HVAC details on roof
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '9px "Space Grotesk", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.fillText(block.name, block.x + block.w / 2, block.y + block.h / 2 + 3);
      } else if (block.type === 'plaza') {
        // Metropolis Pedestrian Plaza with Tile Grid
        ctx.fillStyle = '#0D203D';
        ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x, block.y, block.w, block.h);

        // Plaza Centerpiece
        ctx.fillStyle = '#00E5FF';
        ctx.beginPath();
        ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 9px "Space Grotesk", monospace';
        ctx.fillStyle = '#00E5FF';
        ctx.textAlign = 'center';
        ctx.fillText(block.name, block.x + block.w / 2, block.y + block.h - 10);
      } else if (block.type === 'park') {
        // Green Cyber Park
        ctx.fillStyle = '#062B28';
        ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x, block.y, block.w, block.h);

        // Digital Trees
        ctx.fillStyle = '#10B981';
        for (let tx = block.x + 25; tx < block.x + block.w - 20; tx += 40) {
          ctx.beginPath();
          ctx.arc(tx, block.y + block.h / 2, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = '9px "Space Grotesk", monospace';
        ctx.fillStyle = '#A7F3D0';
        ctx.textAlign = 'center';
        ctx.fillText(block.name, block.x + block.w / 2, block.y + block.h - 10);
      }
    }

    // 3. Street Lane Markings & Crosswalks
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.25)'; // Yellow dashed road divider
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);

    // Horizontal street centerlines
    ctx.beginPath();
    ctx.moveTo(0, 195); ctx.lineTo(CANVAS_WIDTH, 195);
    ctx.moveTo(0, 335); ctx.lineTo(CANVAS_WIDTH, 335);
    ctx.stroke();

    // Vertical street centerlines
    ctx.beginPath();
    ctx.moveTo(237, 55); ctx.lineTo(237, CANVAS_HEIGHT);
    ctx.moveTo(482, 55); ctx.lineTo(482, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalk zebra stripes at intersections
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    const zebraIntersections = [
      { x: 215, y: 185, w: 45, h: 20 },
      { x: 460, y: 185, w: 45, h: 20 },
      { x: 215, y: 325, w: 45, h: 20 },
      { x: 460, y: 325, w: 45, h: 20 }
    ];
    for (const z of zebraIntersections) {
      for (let s = 0; s < z.w; s += 8) {
        ctx.fillRect(z.x + s, z.y, 4, z.h);
      }
    }

    // Street Name Signs along roads & intersections
    ctx.font = 'bold 8px "Space Grotesk", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.textAlign = 'center';

    // Horizontal street names
    ctx.fillText('◄ 5TH AVENUE ►', 120, 199);
    ctx.fillText('◄ 5TH AVENUE ►', 360, 199);
    ctx.fillText('◄ 5TH AVENUE ►', 600, 199);

    ctx.fillText('◄ SUNSET BLVD ►', 120, 339);
    ctx.fillText('◄ SUNSET BLVD ►', 360, 339);
    ctx.fillText('◄ SUNSET BLVD ►', 600, 339);

    // Vertical street names
    ctx.save();
    ctx.translate(237, 130);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('◄ BROADWAY ►', 0, 3);
    ctx.restore();

    ctx.save();
    ctx.translate(482, 130);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('◄ OCEAN DRIVE ►', 0, 3);
    ctx.restore();

    ctx.save();
    ctx.translate(237, 275);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('◄ BROADWAY ►', 0, 3);
    ctx.restore();

    ctx.save();
    ctx.translate(482, 275);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('◄ OCEAN DRIVE ►', 0, 3);
    ctx.restore();

    // Corner Traffic Lights at Intersections
    const cornerSignals = [
      { x: 213, y: 173, color: '#10B981' },
      { x: 261, y: 173, color: '#EF4444' },
      { x: 213, y: 217, color: '#EF4444' },
      { x: 261, y: 217, color: '#10B981' },
      { x: 458, y: 173, color: '#FACC15' },
      { x: 506, y: 173, color: '#10B981' },
      { x: 458, y: 217, color: '#10B981' },
      { x: 506, y: 217, color: '#EF4444' },
      { x: 213, y: 313, color: '#10B981' },
      { x: 261, y: 313, color: '#EF4444' },
      { x: 213, y: 357, color: '#EF4444' },
      { x: 261, y: 357, color: '#10B981' },
      { x: 458, y: 313, color: '#10B981' },
      { x: 506, y: 313, color: '#FACC15' },
      { x: 458, y: 357, color: '#EF4444' },
      { x: 506, y: 357, color: '#10B981' }
    ];
    for (const sig of cornerSignals) {
      ctx.fillStyle = '#060D1E';
      ctx.fillRect(sig.x - 3, sig.y - 3, 6, 6);
      ctx.fillStyle = sig.color;
      ctx.beginPath();
      ctx.arc(sig.x, sig.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw Active Gigs (Beacon Circles & Floating Bounty Tags)
    for (const gig of activeGigs) {
      gig.pulsePhase += 0.08;
      const pulse = (Math.sin(gig.pulsePhase) + 1) / 2;

      // Radar Beacon
      ctx.strokeStyle = gig.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gig.x, gig.y, gig.radius + pulse * 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = gig.color;
      ctx.beginPath();
      ctx.arc(gig.x, gig.y, gig.radius * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // Icon
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gig.icon, gig.x, gig.y + 4);

      // Value Pill Tag
      ctx.fillStyle = '#060E22';
      ctx.fillRect(gig.x - 34, gig.y - gig.radius - 18, 68, 15);
      ctx.strokeStyle = gig.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(gig.x - 34, gig.y - gig.radius - 18, 68, 15);

      ctx.font = 'bold 9px "Space Grotesk", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(gig.label, gig.x, gig.y - gig.radius - 7);

      // Expiry ring
      const lifePct = gig.life / gig.maxLife;
      ctx.strokeStyle = lifePct > 0.3 ? gig.color : '#EF4444';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(gig.x, gig.y, gig.radius * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifePct);
      ctx.stroke();
    }

    // 5. Draw AI Rivals (Each in their own distinct color and corner)
    for (const rival of rivals) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(rival.x, rival.y + 10, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rival.color;
      ctx.beginPath();
      ctx.arc(rival.x, rival.y, rival.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#000';
      ctx.fillRect(rival.x - 4, rival.y - 3, 2.5, 2.5);
      ctx.fillRect(rival.x + 2, rival.y - 3, 2.5, 2.5);

      ctx.font = '9px "Space Grotesk", monospace';
      ctx.fillStyle = rival.color;
      ctx.textAlign = 'center';
      ctx.fillText(`${rival.name} ($${rival.score})`, rival.x, rival.y - 17);
    }

    // 6. Draw Main Player (PROMINENT CUTOUT GLASSES & GLOWING CYAN AURA)
    const auraPulse = (Math.sin(Date.now() / 140) + 1) / 2;
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.45 + auraPulse * 0.45})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 6 + auraPulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 12, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#008392';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cutout Glasses Visor
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(player.x - 7, player.y - 4, 14, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(player.x - 5, player.y - 3, 4, 3);
    ctx.fillRect(player.x + 1, player.y - 3, 4, 3);

    // Indicator Arrow
    ctx.fillStyle = '#FACC15';
    ctx.font = 'bold 10px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ YOU', player.x, player.y - 21);

    // 7. Particles & Floating Cash Popups
    for (const p of game.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    for (const ft of game.floatingTexts) {
      ctx.font = 'bold 12px "Space Grotesk", monospace';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.alpha;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1.0;

    // 8. Top Center HUD Banner (Centered 1-Minute Clock & Stats)
    ctx.fillStyle = 'rgba(7, 14, 34, 0.95)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 50);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(CANVAS_WIDTH, 50);
    ctx.stroke();

    const mins = Math.floor(game.timeLeft / 60);
    const secs = Math.floor(game.timeLeft % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Timer (Left)
    ctx.font = 'bold 16px "Space Grotesk", monospace';
    ctx.fillStyle = game.timeLeft < 15 ? '#EF4444' : '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(`⏱️ ${timeStr}`, 16, 32);

    // Centered Title & Player Cash
    ctx.font = 'bold 14px "Space Grotesk", monospace';
    ctx.fillStyle = '#00E5FF';
    ctx.textAlign = 'center';
    ctx.fillText(`YOUR EARNINGS: $${player.score.toLocaleString()} (${player.gigsCount} gigs)`, CANVAS_WIDTH / 2, 32);

    // Right-aligned blitz tag
    ctx.font = '11px "Space Grotesk", monospace';
    ctx.fillStyle = '#FACC15';
    ctx.textAlign = 'right';
    ctx.fillText('⚡ 60s BLITZ', CANVAS_WIDTH - 16, 32);
  }

  function loop(timestamp) {
    const delta = (timestamp - game.lastFrameTime) / 1000;
    game.lastFrameTime = timestamp;

    if (game.isRunning && !game.isGameOver) {
      update(delta, timestamp);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) { keys.up = true; e.preventDefault(); }
      if (['ArrowDown', 'KeyS'].includes(e.code)) { keys.down = true; e.preventDefault(); }
      if (['ArrowLeft', 'KeyA'].includes(e.code)) { keys.left = true; e.preventDefault(); }
      if (['ArrowRight', 'KeyD'].includes(e.code)) { keys.right = true; e.preventDefault(); }
      if (['ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) { keys.sprint = true; }
      if (e.code === 'KeyM') {
        window.toggleBountyAudio();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
      if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
      if (['ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) keys.sprint = false;
    });

    // Mobile Virtual Touch Controls
    const btnUp = document.getElementById('btn-dpad-up');
    const btnDown = document.getElementById('btn-dpad-down');
    const btnLeft = document.getElementById('btn-dpad-left');
    const btnRight = document.getElementById('btn-dpad-right');
    const btnSprint = document.getElementById('btn-dpad-action');

    const bindTouch = (elem, keyName) => {
      if (!elem) return;
      const start = (e) => { e.preventDefault(); keys[keyName] = true; initAudio(); };
      const end = (e) => { e.preventDefault(); keys[keyName] = false; };
      elem.addEventListener('touchstart', start, { passive: false });
      elem.addEventListener('touchend', end, { passive: false });
      elem.addEventListener('mousedown', start);
      elem.addEventListener('mouseup', end);
      elem.addEventListener('mouseleave', end);
    };

    bindTouch(btnUp, 'up');
    bindTouch(btnDown, 'down');
    bindTouch(btnLeft, 'left');
    bindTouch(btnRight, 'right');
    bindTouch(btnSprint, 'sprint');
  }

  window.toggleBountyAudio = function() {
    audioMuted = !audioMuted;
    const btn = document.getElementById('btn-bounty-audio');
    if (btn) btn.textContent = audioMuted ? '🔇 Audio: OFF' : '🔊 Audio: ON';
  };

  window.resetBountyGame = function() {
    game.timeLeft = TOTAL_TIME_SECONDS;
    game.isGameOver = false;
    game.isRunning = true;
    game.difficultyMultiplier = 1.0;
    game.gigSpawnTimer = 0;
    activeGigs.length = 0;

    player.x = CANVAS_WIDTH / 2;
    player.y = CANVAS_HEIGHT / 2 + 10;
    player.score = 0;
    player.gigsCount = 0;

    // Sparse out rivals to different corners
    rivals[0].x = 70; rivals[0].y = 90; // Northwest
    rivals[1].x = CANVAS_WIDTH - 70; rivals[1].y = 95; // Northeast
    rivals[2].x = CANVAS_WIDTH - 90; rivals[2].y = CANVAS_HEIGHT - 65; // Southeast

    rivals.forEach(r => {
      r.score = 0;
      r.gigsCount = 0;
      r.targetGig = null;
    });

    const overlay = document.getElementById('bounty-game-over-modal');
    if (overlay) overlay.style.display = 'none';

    spawnGig();
    spawnGig();
    spawnGig();
    spawnGig();

    updateLeaderboardUI();
    playSound('spawn_alert');
  };

  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('bounty-canvas');
    if (canvas) {
      ctx = canvas.getContext('2d');
      setupInputs();
      window.resetBountyGame();
      requestAnimationFrame(loop);
    }
  });

})();
