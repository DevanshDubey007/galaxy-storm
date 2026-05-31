// ============================================================
// GALAXY STORM - Retro-Futuristic Space Shooter
// Visual style matched to concept art: rich neon, volumetric
// nebula, massive plasma beams, iridescent insect armada
// ============================================================

(() => {
    'use strict';

    // ── Canvas Setup (Layered: bgCanvas for background, gameCanvas for sprites) ──
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const bgCanvas = document.getElementById('bgCanvas');
    const bgCtx = bgCanvas.getContext('2d');

    // ── Performance: Spatial Grid for Collision ──
    const GRID_SIZE = 80;
    let collisionGrid = {};
    function gridKey(x, y) { return `${(x / GRID_SIZE) | 0},${(y / GRID_SIZE) | 0}`; }
    function gridClear() { collisionGrid = {}; }
    function gridInsert(entity) {
        const key = gridKey(entity.x, entity.y);
        if (!collisionGrid[key]) collisionGrid[key] = [];
        collisionGrid[key].push(entity);
    }
    function gridQuery(x, y, radius) {
        const results = [];
        const minGX = ((x - radius) / GRID_SIZE) | 0;
        const maxGX = ((x + radius) / GRID_SIZE) | 0;
        const minGY = ((y - radius) / GRID_SIZE) | 0;
        const maxGY = ((y + radius) / GRID_SIZE) | 0;
        for (let gx = minGX; gx <= maxGX; gx++) {
            for (let gy = minGY; gy <= maxGY; gy++) {
                const cell = collisionGrid[`${gx},${gy}`];
                if (cell) for (let i = 0; i < cell.length; i++) results.push(cell[i]);
            }
        }
        return results;
    }

    // ── Performance: Frame timing ──
    let bgFrameCounter = 0; // Only update background every N frames

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        renderStaticBackground();
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── Colors - matched to concept art ──
    const C = {
        cyan: '#00FFFF',
        cyanBright: '#80FFFF',
        purple: '#BF00FF',
        purpleBright: '#DF80FF',
        magenta: '#FF0090',
        magentaBright: '#FF66BB',
        gold: '#FFD700',
        goldBright: '#FFE880',
        chrome: '#C0C0C0',
        deepSpace: '#0A0A1A',
        red: '#FF3333',
        redBright: '#FF8866',
        green: '#00FF66',
        greenBright: '#80FFB3',
        blue: '#0066FF',
        blueBright: '#66AAFF',
        white: '#FFFFFF',
        orange: '#FF8800',
        orangeBright: '#FFBB44',
        pink: '#FF44AA',
        pinkBright: '#FF88CC',
        hotPink: '#FF1493',
    };

    // ── Game State ──
    const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, WAVE_ANNOUNCE: 4, BOSS_WARNING: 5 };
    let gameState = STATE.MENU;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('galaxyStormHighScore')) || 0;
    let wave = 1;
    let waveTimer = 0;
    let bossWarningTimer = 0;
    let waveSpawned = false;
    let screenShakeAmount = 0;
    let screenShakeDecay = 0.9;
    let globalTime = 0;
    let deltaTime = 0;
    let lastFrameTime = 0;
    let frameCount = 0;
    let dt = 1; // normalized delta time (1.0 = 60fps)
    let musicStarted = false;

    // ── Input ──
    const keys = {};
    let autoFire = true; // auto-fire ON by default like concept art
    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'Enter') {
            if (gameState === STATE.MENU || gameState === STATE.GAMEOVER) startGame();
        }
        if (e.code === 'KeyP' && gameState === STATE.PLAYING) { gameState = STATE.PAUSED; pauseMusic(); }
        else if (e.code === 'KeyP' && gameState === STATE.PAUSED) { gameState = STATE.PLAYING; resumeMusic(); }
        if (e.code === 'KeyF') autoFire = !autoFire;
        if (e.code === 'KeyX' && gameState === STATE.PLAYING) useBomb();
        if (e.code === 'KeyM') toggleMusic();
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // ── Background Music ──
    const bgMusic = document.getElementById('bgMusic');
    let musicEnabled = true;

    function startMusic() {
        if (!bgMusic || musicStarted) return;
        bgMusic.volume = 0.4;
        bgMusic.play().then(() => { musicStarted = true; }).catch(() => {});
    }
    function pauseMusic() { if (bgMusic) bgMusic.pause(); }
    function resumeMusic() { if (bgMusic && musicStarted) bgMusic.play().catch(() => {}); }
    function toggleMusic() {
        musicEnabled = !musicEnabled;
        if (bgMusic) {
            if (musicEnabled) { bgMusic.play().catch(() => {}); }
            else { bgMusic.pause(); }
        }
    }

    // ── Audio System (SFX) ──
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playSound(type) {
        ensureAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        switch (type) {
            case 'shoot':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.start(now); osc.stop(now + 0.06);
                break;
            case 'explosion': {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(25, now + 0.4);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.start(now); osc.stop(now + 0.4);
                // Add noise layer
                const noiseOsc = audioCtx.createOscillator();
                const noiseGain = audioCtx.createGain();
                noiseOsc.connect(noiseGain);
                noiseGain.connect(audioCtx.destination);
                noiseOsc.type = 'sawtooth';
                noiseOsc.frequency.setValueAtTime(100, now);
                noiseOsc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
                noiseGain.gain.setValueAtTime(0.08, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                noiseOsc.start(now); noiseOsc.stop(now + 0.5);
                break;
            }
            case 'playerHit':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.setValueAtTime(500, now + 0.08);
                osc.frequency.setValueAtTime(200, now + 0.16);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now); osc.stop(now + 0.3);
                break;
            case 'powerup':
                osc.type = 'sine';
                [440, 554, 659, 880].forEach((freq, i) => {
                    osc.frequency.setValueAtTime(freq, now + i * 0.06);
                });
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now); osc.stop(now + 0.3);
                break;
            case 'bossWarning':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(80, now);
                osc.frequency.setValueAtTime(60, now + 0.3);
                osc.frequency.setValueAtTime(80, now + 0.6);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.9);
                osc.start(now); osc.stop(now + 0.9);
                break;
            case 'bomb':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(15, now + 1.0);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
                osc.start(now); osc.stop(now + 1.0);
                break;
        }
    }

    // ── Object Pools ──
    const bullets = [];
    const enemyBullets = [];
    const enemies = [];
    const particles = [];
    const powerups = [];
    const explosions = [];
    const textPopups = [];
    const lensFlares = [];

    // ── Star Layers (dense parallax like concept art) ──
    const starLayers = [];
    function initStars() {
        starLayers.length = 0;
        const configs = [
            { count: 300, speed: 0.15, size: 1, colorPool: ['#FFFFFF', '#8888FF', '#AAAAFF'] },
            { count: 150, speed: 0.4, size: 1.5, colorPool: ['#FFFFFF', '#88CCFF', '#FFDDAA'] },
            { count: 60, speed: 0.9, size: 2.5, colorPool: ['#FFFFFF', C.cyanBright, '#FFE8AA'] },
            { count: 25, speed: 1.6, size: 3.5, colorPool: [C.cyan, C.cyanBright, C.gold] },
        ];
        for (const cfg of configs) {
            const stars = [];
            for (let i = 0; i < cfg.count; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    speed: cfg.speed,
                    size: cfg.size * (0.6 + Math.random() * 0.8),
                    color: cfg.colorPool[Math.floor(Math.random() * cfg.colorPool.length)],
                    brightness: 0.3 + Math.random() * 0.7,
                    twinkleSpeed: 0.3 + Math.random() * 2.5,
                    twinkleOffset: Math.random() * Math.PI * 2,
                });
            }
            starLayers.push(stars);
        }
    }
    initStars();
    window.addEventListener('resize', initStars);

    // ── Nebula System (volumetric clouds like concept art) ──
    const nebulaBlobs = [];
    function initNebulae() {
        nebulaBlobs.length = 0;
        const colors = [
            { inner: 'rgba(255, 100, 20, 0.06)', outer: 'rgba(180, 60, 10, 0.02)' },
            { inner: 'rgba(160, 30, 200, 0.05)', outer: 'rgba(100, 10, 150, 0.02)' },
            { inner: 'rgba(0, 180, 255, 0.04)', outer: 'rgba(0, 100, 180, 0.01)' },
            { inner: 'rgba(255, 50, 100, 0.04)', outer: 'rgba(200, 30, 80, 0.02)' },
            { inner: 'rgba(255, 140, 30, 0.06)', outer: 'rgba(200, 100, 20, 0.02)' },
            { inner: 'rgba(100, 0, 200, 0.05)', outer: 'rgba(60, 0, 140, 0.02)' },
            { inner: 'rgba(0, 255, 180, 0.03)', outer: 'rgba(0, 160, 120, 0.01)' },
            { inner: 'rgba(255, 200, 50, 0.04)', outer: 'rgba(200, 150, 30, 0.02)' },
        ];
        for (let i = 0; i < 8; i++) {
            nebulaBlobs.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: 120 + Math.random() * 300,
                colors: colors[i % colors.length],
                speed: 0.03 + Math.random() * 0.08,
                pulseSpeed: 0.2 + Math.random() * 0.4,
                pulseOffset: Math.random() * Math.PI * 2,
            });
        }
    }
    initNebulae();

    // ── Distant Planets (always visible, like concept art) ──
    const planets = [
        { x: 0, y: 0, radius: 70, ringAngle: 0.3, speed: 0.04, visible: false, timer: 200,
          bodyColor1: '#4a3080', bodyColor2: '#1a0830', ringColor: 'rgba(200, 180, 255, 0.35)' },
        { x: 0, y: 0, radius: 45, ringAngle: -0.2, speed: 0.06, visible: false, timer: 800,
          bodyColor1: '#804030', bodyColor2: '#301010', ringColor: 'rgba(255, 200, 150, 0.3)' },
    ];

    // ── Render static background elements ──
    function renderStaticBackground() {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        // Deep space gradient with rich colors like concept art
        const bg = bgCtx.createLinearGradient(0, 0, bgCanvas.width * 0.3, bgCanvas.height);
        bg.addColorStop(0, '#05051a');
        bg.addColorStop(0.2, '#0a0828');
        bg.addColorStop(0.4, '#10083a');
        bg.addColorStop(0.6, '#0d0530');
        bg.addColorStop(0.8, '#0a0322');
        bg.addColorStop(1, '#06020f');
        bgCtx.fillStyle = bg;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        // Additional diagonal gradient for depth
        const bg2 = bgCtx.createLinearGradient(bgCanvas.width, 0, 0, bgCanvas.height);
        bg2.addColorStop(0, 'rgba(20, 5, 40, 0.5)');
        bg2.addColorStop(0.5, 'rgba(5, 5, 30, 0.3)');
        bg2.addColorStop(1, 'rgba(30, 10, 10, 0.4)');
        bgCtx.fillStyle = bg2;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    }

    // ── Player ──
    const player = {
        x: 0, y: 0,
        width: 60, height: 68, // Bigger ship like concept art
        vx: 0, vy: 0,
        speed: 5.5,
        lives: 3,
        maxLives: 5,
        invincible: false,
        invincibleTimer: 0,
        shootCooldown: 0,
        shootRate: 6,
        powerLevel: 0,
        weaponType: 'bullet',
        beamActive: false,
        shield: 0,
        bombs: 2,
        speedBoost: 0,
        engineFlame: 0,
    };

    function resetPlayer() {
        player.x = canvas.width / 2;
        player.y = canvas.height - 100;
        player.vx = 0; player.vy = 0;
        player.lives = 3;
        player.invincible = false;
        player.invincibleTimer = 0;
        player.shootCooldown = 0;
        player.powerLevel = 0;
        player.weaponType = 'bullet';
        player.beamActive = false;
        player.shield = 0;
        player.bombs = 2;
        player.speedBoost = 0;
    }

    // ── Start Game ──
    function startGame() {
        ensureAudio();
        startMusic();
        score = 0; wave = 1;
        waveSpawned = false;
        bullets.length = 0; enemyBullets.length = 0; enemies.length = 0;
        particles.length = 0; powerups.length = 0; explosions.length = 0;
        textPopups.length = 0; lensFlares.length = 0;
        resetPlayer();
        gameState = STATE.WAVE_ANNOUNCE;
        waveTimer = 120;
        canvas.classList.add('playing');
    }

    // ── Bomb ──
    function useBomb() {
        if (player.bombs <= 0) return;
        player.bombs--;
        playSound('bomb');
        screenShakeAmount = 25;
        explosions.push({ x: canvas.width / 2, y: canvas.height / 2, radius: 0, maxRadius: Math.max(canvas.width, canvas.height), alpha: 1, type: 'bomb' });
        lensFlares.push({ x: canvas.width / 2, y: canvas.height / 2, life: 40, maxLife: 40, size: 300, color: C.white });
        for (const enemy of enemies) {
            score += enemy.scoreValue || 100;
            spawnExplosion(enemy.x, enemy.y, enemy.color, 30);
            spawnFireExplosion(enemy.x, enemy.y);
        }
        enemies.length = 0;
        enemyBullets.length = 0;
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 10;
            particles.push({ x: canvas.width / 2, y: canvas.height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 50 + Math.random() * 60, maxLife: 110, color: [C.cyan, C.magenta, C.gold, C.orange, C.white][Math.floor(Math.random() * 5)], size: 2 + Math.random() * 5 });
        }
    }

    // ── Spawn Explosion (neon sparks) ──
    function spawnExplosion(x, y, color, count = 18) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 6;
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 25 + Math.random() * 35, maxLife: 60, color, size: 1.5 + Math.random() * 3 });
        }
        explosions.push({ x, y, radius: 0, maxRadius: 35 + Math.random() * 30, alpha: 1, type: 'ring', color });
    }

    // ── Spawn Fire Explosion (orange fireballs like concept art) ──
    function spawnFireExplosion(x, y) {
        // Core flash
        explosions.push({ x, y, radius: 0, maxRadius: 50, alpha: 1, type: 'fireball', color: C.orange });
        // Debris particles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 4;
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 30 + Math.random() * 40, maxLife: 70, color: Math.random() > 0.4 ? C.orange : (Math.random() > 0.5 ? C.gold : C.red), size: 2 + Math.random() * 4 });
        }
        // Dark debris chunks
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + 1, life: 40 + Math.random() * 30, maxLife: 70, color: '#333333', size: 3 + Math.random() * 5 });
        }
        // Lens flare
        lensFlares.push({ x, y, life: 15, maxLife: 15, size: 80 + Math.random() * 40, color: C.orange });
    }

    // ── Text Popup ──
    function spawnTextPopup(x, y, text, color) {
        textPopups.push({ x, y, text, color, life: 60, maxLife: 60 });
    }

    // ── Spawn Power-up ──
    function spawnPowerup(x, y) {
        if (Math.random() > 0.28) return;
        const types = ['spread', 'beam', 'shield', 'bomb', 'speed'];
        const weights = [30, 15, 20, 10, 25];
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        let type = types[0];
        for (let i = 0; i < types.length; i++) { r -= weights[i]; if (r <= 0) { type = types[i]; break; } }
        const colors = { spread: C.cyan, beam: C.purple, shield: C.gold, bomb: C.magenta, speed: C.green };
        powerups.push({ x, y, type, color: colors[type], vy: 1.5, radius: 14, rotation: 0, life: 600 });
    }

    // ── Enemy Spawning ──
    function spawnWave(waveNum) {
        waveSpawned = true;
        const loopMultiplier = 1 + Math.floor((waveNum - 1) / 10) * 0.5;
        const effectiveWave = ((waveNum - 1) % 10) + 1;
        switch (effectiveWave) {
            case 1: spawnBeetleFormation(5, 2, loopMultiplier); break;
            case 2: spawnBeetleFormation(7, 3, loopMultiplier); break;
            case 3: spawnBeetleFormation(6, 2, loopMultiplier); spawnDragonflies(4, loopMultiplier); break;
            case 4: spawnBeetleFormation(8, 3, loopMultiplier); spawnDragonflies(6, loopMultiplier); break;
            case 5: spawnMantisElite(loopMultiplier); spawnBeetleFormation(4, 2, loopMultiplier); break;
            case 6: spawnBeetleFormation(8, 3, loopMultiplier); spawnDragonflies(4, loopMultiplier); spawnMoths(3, loopMultiplier); break;
            case 7: spawnBeetleFormation(10, 4, loopMultiplier); spawnDragonflies(6, loopMultiplier); spawnMoths(3, loopMultiplier); break;
            case 8: spawnMoths(6, loopMultiplier); spawnDragonflies(4, loopMultiplier); break;
            case 9: spawnMoths(6, loopMultiplier); spawnBeetleFormation(6, 3, loopMultiplier); spawnMantisElite(loopMultiplier); break;
            case 10:
                gameState = STATE.BOSS_WARNING;
                bossWarningTimer = 180;
                playSound('bossWarning');
                setTimeout(() => { spawnQueenBoss(loopMultiplier); }, 3000);
                break;
        }
    }

    function spawnBeetleFormation(cols, rows, mult) {
        const spacing = 60;
        const startX = (canvas.width - (cols - 1) * spacing) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                enemies.push(createBeetle(startX + c * spacing, -50 - r * 55, mult));
            }
        }
    }

    function createBeetle(x, y, mult) {
        return { type: 'beetle', x, y, targetY: 60 + Math.random() * 120, width: 36, height: 36, hp: Math.ceil(2 * mult), maxHp: Math.ceil(2 * mult), color: C.blue, color2: C.cyan, scoreValue: 100, shootTimer: 60 + Math.random() * 120, shootRate: Math.max(40, 100 - wave * 5), movePattern: 'zigzag', moveTimer: 0, moveDir: Math.random() > 0.5 ? 1 : -1, entered: false, speed: 1 + mult * 0.3, animPhase: Math.random() * Math.PI * 2 };
    }

    function spawnDragonflies(count, mult) {
        for (let i = 0; i < count; i++) {
            enemies.push(createDragonfly(100 + Math.random() * (canvas.width - 200), -80 - i * 65, mult));
        }
    }

    function createDragonfly(x, y, mult) {
        return { type: 'dragonfly', x, y, targetY: 50 + Math.random() * 100, width: 40, height: 44, hp: Math.ceil(1.5 * mult), maxHp: Math.ceil(1.5 * mult), color: C.green, color2: C.cyan, scoreValue: 150, shootTimer: 80 + Math.random() * 60, shootRate: Math.max(50, 90 - wave * 3), movePattern: 'swoop', moveTimer: Math.random() * 300, swoopPhase: 0, entered: false, speed: 2 + mult * 0.4, wingPhase: Math.random() * Math.PI * 2, hueOffset: Math.random() * 120 };
    }

    function spawnMoths(count, mult) {
        for (let i = 0; i < count; i++) {
            enemies.push(createMoth(80 + Math.random() * (canvas.width - 160), -100 - i * 70, mult));
        }
    }

    function createMoth(x, y, mult) {
        return { type: 'moth', x, y, targetY: 40 + Math.random() * 80, width: 44, height: 44, hp: Math.ceil(4 * mult), maxHp: Math.ceil(4 * mult), color: C.magenta, color2: C.pink, scoreValue: 200, shootTimer: 100 + Math.random() * 80, shootRate: Math.max(60, 120 - wave * 4), movePattern: 'drift', moveTimer: 0, entered: false, speed: 0.8 + mult * 0.2, wingPhase: Math.random() * Math.PI * 2 };
    }

    function spawnMantisElite(mult) {
        enemies.push({ type: 'mantis', x: canvas.width / 2, y: -60, targetY: 80, width: 50, height: 56, hp: Math.ceil(18 * mult), maxHp: Math.ceil(18 * mult), color: C.chrome, color2: C.purple, scoreValue: 1000, shootTimer: 40, shootRate: 28, movePattern: 'patrol', moveTimer: 0, moveDir: 1, entered: false, speed: 1.5, phase: 0, animPhase: 0 });
    }

    function spawnQueenBoss(mult) {
        enemies.push({ type: 'queen', x: canvas.width / 2, y: -120, targetY: 110, width: 90, height: 100, hp: Math.ceil(90 * mult), maxHp: Math.ceil(90 * mult), color: C.gold, color2: C.magenta, scoreValue: 5000, shootTimer: 30, shootRate: 18, movePattern: 'boss', moveTimer: 0, moveDir: 1, entered: false, speed: 1, phase: 0, attackPattern: 0, patternTimer: 0, animPhase: 0 });
        if (gameState === STATE.BOSS_WARNING) gameState = STATE.PLAYING;
    }

    // ── Player Shooting ──
    function playerShoot() {
        if (player.shootCooldown > 0) return;
        player.shootCooldown = player.shootRate;
        if (frameCount % 3 === 0) playSound('shoot');

        const bx = player.x;
        const by = player.y - player.height / 2;
        const spd = -12;

        if (player.weaponType === 'beam') { player.beamActive = true; return; }

        switch (player.powerLevel) {
            case 0:
                bullets.push({ x: bx - 6, y: by, vx: 0, vy: spd, color: C.cyan, size: 3, damage: 1 });
                bullets.push({ x: bx + 6, y: by, vx: 0, vy: spd, color: C.cyan, size: 3, damage: 1 });
                break;
            case 1:
                bullets.push({ x: bx - 10, y: by, vx: 0, vy: spd, color: C.cyan, size: 3.5, damage: 1 });
                bullets.push({ x: bx + 10, y: by, vx: 0, vy: spd, color: C.purple, size: 3.5, damage: 1 });
                bullets.push({ x: bx, y: by - 5, vx: 0, vy: spd * 1.1, color: C.cyanBright, size: 2.5, damage: 1 });
                break;
            case 2:
                bullets.push({ x: bx, y: by - 5, vx: 0, vy: spd * 1.1, color: C.cyanBright, size: 4, damage: 1 });
                bullets.push({ x: bx - 12, y: by, vx: -1.2, vy: spd, color: C.cyan, size: 3, damage: 1 });
                bullets.push({ x: bx + 12, y: by, vx: 1.2, vy: spd, color: C.purple, size: 3, damage: 1 });
                bullets.push({ x: bx - 20, y: by + 5, vx: -2.2, vy: spd * 0.85, color: C.magenta, size: 2.5, damage: 1 });
                bullets.push({ x: bx + 20, y: by + 5, vx: 2.2, vy: spd * 0.85, color: C.magenta, size: 2.5, damage: 1 });
                break;
            case 3:
                // Massive spread like concept art
                bullets.push({ x: bx, y: by - 8, vx: 0, vy: spd * 1.15, color: C.white, size: 5, damage: 2 });
                bullets.push({ x: bx - 8, y: by, vx: -0.5, vy: spd, color: C.cyanBright, size: 4, damage: 1 });
                bullets.push({ x: bx + 8, y: by, vx: 0.5, vy: spd, color: C.cyanBright, size: 4, damage: 1 });
                bullets.push({ x: bx - 16, y: by + 3, vx: -1.8, vy: spd * 0.92, color: C.cyan, size: 3, damage: 1 });
                bullets.push({ x: bx + 16, y: by + 3, vx: 1.8, vy: spd * 0.92, color: C.purple, size: 3, damage: 1 });
                bullets.push({ x: bx - 24, y: by + 6, vx: -3, vy: spd * 0.8, color: C.magenta, size: 2.5, damage: 1 });
                bullets.push({ x: bx + 24, y: by + 6, vx: 3, vy: spd * 0.8, color: C.magenta, size: 2.5, damage: 1 });
                break;
        }
    }

    // ── Enemy Shooting ──
    function enemyShoot(enemy) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = 3.2 + wave * 0.12;

        switch (enemy.type) {
            case 'beetle':
                enemyBullets.push({ x: enemy.x, y: enemy.y + enemy.height / 2, vx: (dx / dist) * speed * 0.7, vy: (dy / dist) * speed * 0.7, color: C.red, glowColor: C.orange, size: 4 });
                break;
            case 'dragonfly':
                for (let i = -1; i <= 1; i += 2) {
                    enemyBullets.push({ x: enemy.x + i * 8, y: enemy.y + enemy.height / 2, vx: (dx / dist) * speed + i * 0.5, vy: (dy / dist) * speed, color: C.green, glowColor: C.greenBright, size: 3 });
                }
                break;
            case 'moth':
                for (let i = -2; i <= 2; i++) {
                    enemyBullets.push({ x: enemy.x + i * 8, y: enemy.y + enemy.height / 2, vx: i * 1.2, vy: speed * 0.9, color: C.magenta, glowColor: C.pink, size: 4.5 });
                }
                break;
            case 'mantis':
                for (let i = -3; i <= 3; i++) {
                    const angle = Math.atan2(dy, dx) + i * 0.18;
                    enemyBullets.push({ x: enemy.x, y: enemy.y + enemy.height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: C.purple, glowColor: C.purpleBright, size: 3.5 });
                }
                break;
            case 'queen':
                queenAttack(enemy);
                break;
        }
    }

    function queenAttack(queen) {
        const speed = 3.5;
        const pattern = queen.attackPattern % 4;
        switch (pattern) {
            case 0: // Radial burst
                for (let i = 0; i < 16; i++) {
                    const angle = (i / 16) * Math.PI * 2 + globalTime * 0.008;
                    enemyBullets.push({ x: queen.x, y: queen.y + queen.height / 3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: C.gold, glowColor: C.goldBright, size: 5 });
                }
                break;
            case 1: { // Aimed triple
                const dx = player.x - queen.x;
                const dy = player.y - queen.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                for (let i = -2; i <= 2; i++) {
                    const angle = Math.atan2(dy, dx) + i * 0.12;
                    enemyBullets.push({ x: queen.x, y: queen.y + queen.height / 3, vx: Math.cos(angle) * speed * 1.3, vy: Math.sin(angle) * speed * 1.3, color: C.magenta, glowColor: C.magentaBright, size: 4 });
                }
                break;
            }
            case 2: // Spiral
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2 + queen.phase;
                    enemyBullets.push({ x: queen.x, y: queen.y + queen.height / 3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: C.purple, glowColor: C.purpleBright, size: 4 });
                }
                queen.phase += 0.25;
                break;
            case 3: // Wall
                for (let i = 0; i < 12; i++) {
                    enemyBullets.push({ x: queen.x - 60 + i * 11, y: queen.y + queen.height / 2, vx: (Math.random() - 0.5) * 0.8, vy: speed * 0.8, color: C.red, glowColor: C.redBright, size: 4 });
                }
                break;
        }
    }

    // ── Update Functions ──
    function updatePlayer() {
        const spd = player.speed + (player.speedBoost > 0 ? 2.5 : 0);
        const accel = 0.65;
        const friction = 0.87;

        if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= accel;
        if (keys['ArrowRight'] || keys['KeyD']) player.vx += accel;
        if (keys['ArrowUp'] || keys['KeyW']) player.vy -= accel;
        if (keys['ArrowDown'] || keys['KeyS']) player.vy += accel;

        player.vx *= friction;
        player.vy *= friction;
        player.vx = Math.max(-spd, Math.min(spd, player.vx));
        player.vy = Math.max(-spd, Math.min(spd, player.vy));

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
        player.y = Math.max(canvas.height * 0.25, Math.min(canvas.height - player.height / 2 - 10, player.y));

        if (player.shootCooldown > 0) player.shootCooldown--;
        if (keys['Space'] || autoFire) playerShoot();
        if (!keys['Space'] && !autoFire) player.beamActive = false;

        if (player.invincible) { player.invincibleTimer--; if (player.invincibleTimer <= 0) player.invincible = false; }
        if (player.speedBoost > 0) player.speedBoost--;

        player.engineFlame += 0.25;
        // Engine particles - pink/magenta/purple to match thruster flames
        if (frameCount % 2 === 0) {
            for (let side = -1; side <= 1; side += 2) {
                particles.push({ x: player.x + side * 15, y: player.y + player.height / 2 - 4, vx: (Math.random() - 0.5) * 1.5 + side * 0.2, vy: 3 + Math.random() * 4, life: 12 + Math.random() * 10, maxLife: 22, color: [C.magenta, C.hotPink, C.pinkBright, C.purpleBright, C.white][Math.floor(Math.random() * 5)], size: 2 + Math.random() * 2.5 });
            }
            // Center flame particle
            particles.push({ x: player.x, y: player.y + player.height / 2 - 2, vx: (Math.random() - 0.5) * 0.5, vy: 4 + Math.random() * 3, life: 10 + Math.random() * 8, maxLife: 18, color: Math.random() > 0.5 ? C.white : C.pinkBright, size: 2 + Math.random() * 2 });
        }
    }

    function updateBullets() {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (frameCount % 2 === 0) {
                particles.push({ x: b.x + (Math.random() - 0.5) * 3, y: b.y + 4, vx: (Math.random() - 0.5) * 0.5, vy: 2, life: 6, maxLife: 6, color: b.color, size: 1.5 });
            }
            if (b.y < -10 || b.y > canvas.height + 10 || b.x < -10 || b.x > canvas.width + 10) bullets.splice(i, 1);
        }
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (frameCount % 3 === 0) {
                particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, life: 5, maxLife: 5, color: b.color, size: 1 });
            }
            if (b.y < -10 || b.y > canvas.height + 10 || b.x < -10 || b.x > canvas.width + 10) enemyBullets.splice(i, 1);
        }
    }

    function updateEnemies() {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.entered) { e.y += 2.5; if (e.y >= e.targetY) { e.y = e.targetY; e.entered = true; } continue; }
            e.moveTimer++;
            if (e.animPhase !== undefined) e.animPhase += 0.05;
            switch (e.movePattern) {
                case 'zigzag': e.x += Math.sin(e.moveTimer * 0.03) * e.speed * 1.2 * dt; e.y += 0.12 * dt; break;
                case 'swoop':
                    e.swoopPhase += 0.02 * dt;
                    e.x += Math.sin(e.moveTimer * 0.025) * e.speed * 1.8 * dt;
                    if (Math.sin(e.swoopPhase) > 0.88) e.y += e.speed * 2.5 * dt;
                    else e.y += Math.sin(e.moveTimer * 0.01) * 0.5 * dt;
                    break;
                case 'drift': e.x += Math.sin(e.moveTimer * 0.018) * e.speed * dt; e.y += Math.cos(e.moveTimer * 0.01) * 0.3 * dt; break;
                case 'patrol': e.x += e.moveDir * e.speed * 1.8 * dt; if (e.x < 60 || e.x > canvas.width - 60) e.moveDir *= -1; break;
                case 'boss':
                    e.x += e.moveDir * e.speed * 1.2 * dt; if (e.x < 110 || e.x > canvas.width - 110) e.moveDir *= -1;
                    e.y += Math.sin(e.moveTimer * 0.01) * 0.6 * dt;
                    e.patternTimer++; if (e.patternTimer > 180) { e.attackPattern++; e.patternTimer = 0; }
                    break;
            }
            e.x = Math.max(e.width / 2, Math.min(canvas.width - e.width / 2, e.x));
            e.shootTimer--;
            if (e.shootTimer <= 0 && e.entered) { e.shootTimer = e.shootRate; enemyShoot(e); }
            if (e.y > canvas.height + 100) enemies.splice(i, 1);
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
        // Cap particles for performance
        if (particles.length > 200) particles.splice(0, particles.length - 200);
    }

    function updateExplosions() {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            if (e.type === 'ring') { e.radius += 3.5; e.alpha -= 0.025; }
            else if (e.type === 'bomb') { e.radius += 35; e.alpha -= 0.018; }
            else if (e.type === 'fireball') { e.radius += 4; e.alpha -= 0.03; }
            if (e.alpha <= 0 || e.radius >= e.maxRadius) explosions.splice(i, 1);
        }
    }

    function updateLensFlares() {
        for (let i = lensFlares.length - 1; i >= 0; i--) {
            lensFlares[i].life--;
            if (lensFlares[i].life <= 0) lensFlares.splice(i, 1);
        }
    }

    function updatePowerups() {
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += p.vy; p.rotation += 0.03; p.life--;
            if (p.y > canvas.height + 20 || p.life <= 0) { powerups.splice(i, 1); continue; }
            const dx = p.x - player.x, dy = p.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < p.radius + 22) { collectPowerup(p); powerups.splice(i, 1); }
        }
    }

    function collectPowerup(p) {
        playSound('powerup');
        switch (p.type) {
            case 'spread': player.weaponType = 'bullet'; player.powerLevel = Math.min(player.powerLevel + 1, 3); spawnTextPopup(p.x, p.y, 'SPREAD UP!', C.cyan); break;
            case 'beam': player.weaponType = 'beam'; spawnTextPopup(p.x, p.y, 'PLASMA BEAM!', C.purple); break;
            case 'shield': player.shield = 3; spawnTextPopup(p.x, p.y, 'SHIELD +3!', C.gold); break;
            case 'bomb': player.bombs = Math.min(player.bombs + 1, 5); spawnTextPopup(p.x, p.y, '+BOMB!', C.magenta); break;
            case 'speed': player.speedBoost = 300; spawnTextPopup(p.x, p.y, 'SPEED!', C.green); break;
        }
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            particles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4, life: 20, maxLife: 20, color: p.color, size: 2.5 });
        }
    }

    function updateTextPopups() {
        for (let i = textPopups.length - 1; i >= 0; i--) { textPopups[i].y -= 1.2; textPopups[i].life--; if (textPopups[i].life <= 0) textPopups.splice(i, 1); }
    }

    // ── Collision Detection (Spatial Grid Accelerated) ──
    function checkCollisions() {
        // Bullets vs enemies (use spatial grid)
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            const nearby = gridQuery(b.x, b.y, GRID_SIZE);
            let hit = false;
            for (let ni = 0; ni < nearby.length; ni++) {
                const e = nearby[ni];
                if (e.hp <= 0) continue;
                if (Math.abs(b.x - e.x) < e.width / 2 + b.size && Math.abs(b.y - e.y) < e.height / 2 + b.size) {
                    e.hp -= b.damage;
                    bullets.splice(bi, 1);
                    for (let p = 0; p < 4; p++) particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 8, maxLife: 8, color: C.white, size: 2.5 });
                    if (e.hp <= 0) {
                        score += e.scoreValue;
                        spawnExplosion(e.x, e.y, e.color, e.type === 'queen' ? 70 : 25);
                        spawnFireExplosion(e.x, e.y);
                        if (e.type === 'queen') {
                            screenShakeAmount = 30;
                            for (let j = 0; j < 8; j++) setTimeout(() => { if (enemies.length >= 0) { spawnExplosion(e.x + (Math.random() - 0.5) * 100, e.y + (Math.random() - 0.5) * 100, [C.gold, C.magenta, C.cyan, C.orange][j % 4], 30); spawnFireExplosion(e.x + (Math.random() - 0.5) * 80, e.y + (Math.random() - 0.5) * 80); screenShakeAmount = 18; playSound('explosion'); } }, j * 180);
                        } else { screenShakeAmount = 7; }
                        playSound('explosion');
                        spawnTextPopup(e.x, e.y, `+${e.scoreValue}`, C.gold);
                        spawnPowerup(e.x, e.y);
                        const idx = enemies.indexOf(e);
                        if (idx !== -1) enemies.splice(idx, 1);
                    }
                    hit = true;
                    break;
                }
            }
        }

        // Remove dead enemies that were killed by grid checks
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].hp <= 0) enemies.splice(i, 1);
        }

        // Beam vs enemies
        if (player.beamActive && player.weaponType === 'beam') {
            const beamW = 24;
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                const e = enemies[ei];
                if (Math.abs(e.x - player.x) < e.width / 2 + beamW / 2 && e.y < player.y) {
                    e.hp -= 0.35 * dt;
                    if (frameCount % 4 === 0) particles.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 10, maxLife: 10, color: C.purple, size: 2.5 });
                    if (e.hp <= 0) {
                        score += e.scoreValue;
                        spawnExplosion(e.x, e.y, e.color, e.type === 'queen' ? 70 : 25);
                        spawnFireExplosion(e.x, e.y);
                        if (e.type === 'queen') screenShakeAmount = 30;
                        else screenShakeAmount = 7;
                        playSound('explosion');
                        spawnTextPopup(e.x, e.y, `+${e.scoreValue}`, C.gold);
                        spawnPowerup(e.x, e.y);
                        enemies.splice(ei, 1);
                    }
                }
            }
        }

        // Enemy bullets vs player
        if (!player.invincible) {
            for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
                const b = enemyBullets[bi];
                if (Math.abs(b.x - player.x) < 16 && Math.abs(b.y - player.y) < 20) { enemyBullets.splice(bi, 1); hitPlayer(); break; }
            }
        }
        if (!player.invincible) {
            for (const e of enemies) {
                if (Math.abs(e.x - player.x) < (e.width + player.width) / 2 - 8 && Math.abs(e.y - player.y) < (e.height + player.height) / 2 - 8) { hitPlayer(); break; }
            }
        }
    }

    function hitPlayer() {
        if (player.shield > 0) { player.shield--; playSound('playerHit'); screenShakeAmount = 6; spawnExplosion(player.x, player.y, C.gold, 10); player.invincible = true; player.invincibleTimer = 30; return; }
        player.lives--;
        playSound('playerHit');
        screenShakeAmount = 18;
        spawnExplosion(player.x, player.y, C.red, 30);
        spawnFireExplosion(player.x, player.y);
        player.invincible = true;
        player.invincibleTimer = 120;
        player.powerLevel = Math.max(0, player.powerLevel - 1);
        if (player.lives <= 0) {
            gameState = STATE.GAMEOVER;
            canvas.classList.remove('playing');
            if (score > highScore) { highScore = score; localStorage.setItem('galaxyStormHighScore', highScore.toString()); }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RENDERING - Concept Art Matched Visuals
    // ═══════════════════════════════════════════════════════════

    function drawBackground() {
        // bgCanvas is now a visible DOM layer behind gameCanvas - no need to copy it

        // Animated nebula clouds (volumetric, warm+cool tones)
        for (const n of nebulaBlobs) {
            n.y += n.speed;
            if (n.y > canvas.height + n.radius) { n.y = -n.radius; n.x = Math.random() * canvas.width; }
            const pulse = 1 + Math.sin(globalTime * 0.016 * n.pulseSpeed + n.pulseOffset) * 0.2;
            const r = n.radius * pulse;
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
            grad.addColorStop(0, n.colors.inner);
            grad.addColorStop(0.6, n.colors.outer);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Stars with color & twinkle
        for (let layer = 0; layer < starLayers.length; layer++) {
            for (const star of starLayers[layer]) {
                star.y += star.speed;
                if (star.y > canvas.height + 5) { star.y = -5; star.x = Math.random() * canvas.width; }
                const twinkle = 0.5 + Math.sin(globalTime * star.twinkleSpeed * 0.016 + star.twinkleOffset) * 0.5;
                const alpha = star.brightness * twinkle;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = star.color;
                const s = star.size;
                const sx = Math.floor(star.x), sy = Math.floor(star.y);
                ctx.fillRect(sx, sy, s, s);
                // Cross-hair glow on bright stars
                if (layer >= 2 && alpha > 0.5) {
                    ctx.globalAlpha = alpha * 0.3;
                    ctx.fillRect(sx - s, sy, s * 3, s);
                    ctx.fillRect(sx, sy - s, s, s * 3);
                }
            }
        }
        ctx.globalAlpha = 1;

        // Distant planets
        for (const planet of planets) {
            planet.timer--;
            if (planet.timer <= 0 && !planet.visible) {
                planet.visible = true;
                planet.x = -planet.radius * 2;
                planet.y = 40 + Math.random() * canvas.height * 0.35;
            }
            if (planet.visible) {
                planet.x += planet.speed;
                drawPlanet(planet);
                if (planet.x > canvas.width + planet.radius * 3) {
                    planet.visible = false;
                    planet.timer = 1500 + Math.random() * 1500;
                }
            }
        }
    }

    function drawPlanet(planet) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        // Atmosphere glow
        const atmoGrad = ctx.createRadialGradient(planet.x, planet.y, planet.radius * 0.8, planet.x, planet.y, planet.radius * 1.4);
        atmoGrad.addColorStop(0, 'transparent');
        atmoGrad.addColorStop(0.7, 'rgba(100, 80, 200, 0.1)');
        atmoGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = atmoGrad;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Planet body
        const grad = ctx.createRadialGradient(planet.x - planet.radius * 0.3, planet.y - planet.radius * 0.3, 0, planet.x, planet.y, planet.radius);
        grad.addColorStop(0, planet.bodyColor1);
        grad.addColorStop(0.7, planet.bodyColor2);
        grad.addColorStop(1, '#000005');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fill();

        // Ring system
        ctx.strokeStyle = planet.ringColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, planet.radius * 1.9, planet.radius * 0.3, planet.ringAngle, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, planet.radius * 2.1, planet.radius * 0.35, planet.ringAngle, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // PLAYER SHIP - Mech-Dragon 32-bit Pixel Art Style
    // Layered armor, gold trim, energy cells, thruster flames
    // ═══════════════════════════════════════════════════════════
    function drawPlayer() {
        if (player.invincible && Math.floor(globalTime * 0.3) % 2 === 0) return;
        ctx.save();
        ctx.translate(player.x, player.y);

        const t = globalTime;
        const pulse = Math.sin(t * 0.08);
        const fastPulse = Math.sin(t * 0.2);
        const flicker = Math.sin(player.engineFlame * 4);

        // ── Shield Visual ──
        if (player.shield > 0) {
            ctx.globalAlpha = 0.2 + Math.sin(t * 0.12) * 0.1;
            const shGr = ctx.createRadialGradient(0, 0, 22, 0, 0, 44);
            shGr.addColorStop(0, 'transparent');
            shGr.addColorStop(0.6, 'rgba(255, 215, 0, 0.1)');
            shGr.addColorStop(1, 'rgba(255, 215, 0, 0.25)');
            ctx.fillStyle = shGr;
            ctx.beginPath();
            ctx.arc(0, 0, 44, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = C.gold;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // ── Speed Boost Aura ──
        if (player.speedBoost > 0) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = C.green;
            ctx.beginPath();
            ctx.arc(0, 0, 35 + fastPulse * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ════════════════════════════════════════
        // THRUSTER FLAMES (pink → purple → white)
        // ════════════════════════════════════════
        for (let side = -1; side <= 1; side += 2) {
            const thrX = side * 15;
            const thrY = 30;
            const flameLen = 30 + flicker * 10 + Math.random() * 4;

            // Outer flame (pink/magenta)
            const outerGr = ctx.createLinearGradient(thrX, thrY, thrX, thrY + flameLen);
            outerGr.addColorStop(0, C.magenta);
            outerGr.addColorStop(0.35, C.hotPink);
            outerGr.addColorStop(0.7, 'rgba(191, 0, 255, 0.5)');
            outerGr.addColorStop(1, 'rgba(100, 0, 200, 0)');
            ctx.fillStyle = outerGr;
            ctx.beginPath();
            ctx.moveTo(thrX - 7, thrY);
            ctx.quadraticCurveTo(thrX - 4, thrY + flameLen * 0.6, thrX, thrY + flameLen);
            ctx.quadraticCurveTo(thrX + 4, thrY + flameLen * 0.6, thrX + 7, thrY);
            ctx.closePath();
            ctx.fill();

            // Inner flame (white core)
            const innerGr = ctx.createLinearGradient(thrX, thrY, thrX, thrY + flameLen * 0.7);
            innerGr.addColorStop(0, C.white);
            innerGr.addColorStop(0.3, C.pinkBright);
            innerGr.addColorStop(0.6, C.purpleBright);
            innerGr.addColorStop(1, 'transparent');
            ctx.fillStyle = innerGr;
                        ctx.beginPath();
            ctx.moveTo(thrX - 3, thrY);
            ctx.quadraticCurveTo(thrX - 1.5, thrY + flameLen * 0.4, thrX, thrY + flameLen * 0.7);
            ctx.quadraticCurveTo(thrX + 1.5, thrY + flameLen * 0.4, thrX + 3, thrY);
            ctx.closePath();
            ctx.fill();
        }

        // Center thruster (smaller)
        const cLen = 18 + flicker * 5;
        const cGr = ctx.createLinearGradient(0, 28, 0, 28 + cLen);
        cGr.addColorStop(0, C.white);
        cGr.addColorStop(0.3, C.magenta);
        cGr.addColorStop(0.7, C.purple);
        cGr.addColorStop(1, 'transparent');
        ctx.fillStyle = cGr;
        ctx.beginPath();
        ctx.moveTo(-3, 28);
        ctx.lineTo(0, 28 + cLen);
        ctx.lineTo(3, 28);
        ctx.closePath();
        ctx.fill();
        // ════════════════════════════════════════
        // ENGINE BLOCKS (magenta + cyan cores)
        // ════════════════════════════════════════
        for (let side = -1; side <= 1; side += 2) {
            const ex = side * 15;
            // Engine housing (dark chrome)
            const engGr = ctx.createLinearGradient(ex - 7, 14, ex + 7, 30);
            engGr.addColorStop(0, '#888');
            engGr.addColorStop(0.3, '#555');
            engGr.addColorStop(0.6, '#777');
            engGr.addColorStop(1, '#444');
            ctx.fillStyle = engGr;
            ctx.fillRect(ex - 7, 14, 14, 18);
            // Gold trim top
            ctx.fillStyle = C.gold;
            ctx.fillRect(ex - 8, 13, 16, 2);
            // Gold trim bottom
            ctx.fillRect(ex - 8, 31, 16, 2);
            // Gold trim sides
            ctx.fillRect(ex - 8, 13, 2, 20);
            ctx.fillRect(ex + 6, 13, 2, 20);

            // Magenta engine core (upper)
            ctx.fillStyle = C.magenta;
            ctx.fillRect(ex - 4, 16, 8, 5);
            // Core highlight
            ctx.fillStyle = C.magentaBright;
            ctx.fillRect(ex - 2, 17, 4, 2);

            // Cyan engine core (lower)
            ctx.fillStyle = C.cyan;
            ctx.fillRect(ex - 4, 24, 8, 5);
            // Core highlight
            ctx.fillStyle = C.cyanBright;
            ctx.fillRect(ex - 2, 25, 4, 2);
            // Vent lines
            ctx.fillStyle = '#333';
            ctx.fillRect(ex - 5, 22, 10, 1);
            ctx.fillRect(ex - 5, 30, 10, 1);

            // Outline
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.strokeRect(ex - 7, 14, 14, 18);
        }

        // ════════════════════════════════════════
        // SWEPT BLADE WINGS (dragon-style)
        // ════════════════════════════════════════
        for (let side = -1; side <= 1; side += 2) {
            // ─── Inner wing armor plate ───
            const wingGr = ctx.createLinearGradient(side * 12, -10, side * 40, 20);
            wingGr.addColorStop(0, '#999');
            wingGr.addColorStop(0.3, '#B8B8B8');
            wingGr.addColorStop(0.5, '#888');
            wingGr.addColorStop(0.7, '#A0A0A0');
            wingGr.addColorStop(1, '#666');
            ctx.fillStyle = wingGr;
            ctx.beginPath();
            ctx.moveTo(side * 10, -8);         // inner wing root top
            ctx.lineTo(side * 28, -16);        // wing mid sweep
            ctx.lineTo(side * 42, -10);        // wing tip top
            ctx.lineTo(side * 44, 0);          // wing tip point
            ctx.lineTo(side * 38, 8);          // wing trailing edge
            ctx.lineTo(side * 28, 14);         // wing mid trailing
            ctx.lineTo(side * 18, 18);         // inner trailing
            ctx.lineTo(side * 10, 16);         // wing root bottom
            ctx.closePath();
            ctx.fill();

            // Rim lighting (bright edge highlight)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(side * 10, -8);
            ctx.lineTo(side * 28, -16);
            ctx.lineTo(side * 42, -10);
            ctx.lineTo(side * 44, 0);
            ctx.stroke();

            // Wing underside shadow (pixel shading)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.moveTo(side * 18, 18);
            ctx.lineTo(side * 28, 14);
            ctx.lineTo(side * 38, 8);
            ctx.lineTo(side * 44, 0);
            ctx.lineTo(side * 38, 10);
            ctx.lineTo(side * 28, 16);
            ctx.lineTo(side * 18, 20);
            ctx.closePath();
            ctx.fill();

            // Gold trim on wing leading edge
            ctx.strokeStyle = C.gold;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(side * 10, -8);
            ctx.lineTo(side * 28, -16);
            ctx.lineTo(side * 42, -10);
            ctx.lineTo(side * 44, 0);
            ctx.stroke();

            // Gold trim on trailing edge
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(side * 10, 16);
            ctx.lineTo(side * 18, 18);
            ctx.lineTo(side * 28, 14);
            ctx.lineTo(side * 38, 8);
            ctx.stroke();
            // Wing outline (cel-shading)
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(side * 10, -8);
            ctx.lineTo(side * 28, -16);
            ctx.lineTo(side * 42, -10);
            ctx.lineTo(side * 44, 0);
            ctx.lineTo(side * 38, 8);
            ctx.lineTo(side * 28, 14);
            ctx.lineTo(side * 18, 18);
            ctx.lineTo(side * 10, 16);
            ctx.closePath();
            ctx.stroke();

            // ─── Wing Cannons (with neon blue energy cells) ───
            const canX = side * 30;
            const canY = -4;

            // Cannon barrel housing
            ctx.fillStyle = '#606060';
            ctx.fillRect(canX - 4, canY - 6, 8, 18);
            // Chrome sheen on cannon
            const canGr = ctx.createLinearGradient(canX - 4, canY, canX + 4, canY);
            canGr.addColorStop(0, 'rgba(255,255,255,0.3)');
            canGr.addColorStop(0.5, 'rgba(255,255,255,0.05)');
            canGr.addColorStop(1, 'rgba(255,255,255,0.2)');
            ctx.fillStyle = canGr;
            ctx.fillRect(canX - 4, canY - 6, 8, 18);

            // Gold trim on cannon
            ctx.fillStyle = C.gold;
            ctx.fillRect(canX - 5, canY - 7, 10, 1.5);
            ctx.fillRect(canX - 5, canY + 11, 10, 1.5);

            // ENERGY CELLS (pulsing neon blue rectangles)
            const cellPulse = 0.6 + Math.sin(t * 0.15 + side * 1.5) * 0.4;
            ctx.fillStyle = `rgba(0, 100, 255, ${cellPulse})`;
            // Top cell
            ctx.fillRect(canX - 3, canY - 4, 6, 5);
            // Bottom cell
            ctx.fillRect(canX - 3, canY + 4, 6, 5);

            // Cell bright core
            ctx.fillStyle = `rgba(100, 180, 255, ${cellPulse})`;
            ctx.fillRect(canX - 1.5, canY - 3, 3, 3);
            ctx.fillRect(canX - 1.5, canY + 5, 3, 3);
            // Cannon tip (weapon glow)
            const tipColor = player.weaponType === 'beam' ? C.purple : C.cyan;
            ctx.fillStyle = tipColor;
            ctx.fillRect(canX - 3, canY - 10, 6, 4);
            // Bright core in tip
            ctx.fillStyle = C.white;
            ctx.globalAlpha = 0.6 + fastPulse * 0.2;
            ctx.fillRect(canX - 1.5, canY - 9, 3, 2);
            ctx.globalAlpha = 1;
            // Cannon outline
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1;
            ctx.strokeRect(canX - 4, canY - 6, 8, 18);

            // ─── Small cyan accent panels on wings ───
            ctx.fillStyle = C.cyan;
            ctx.fillRect(side * 18, -4, side * 6, 3);
            ctx.fillRect(side * 20, 6, side * 5, 2.5);
            // ─── Purple accent strip under wing ───
            ctx.fillStyle = C.purple;
            ctx.fillRect(side * 14, 10, side * 12, 2);
        }

        // ════════════════════════════════════════
        // MAIN FUSELAGE (mech-dragon body)
        // ════════════════════════════════════════

        // ─── Layered armor plates - rear section ───
        const rearGr = ctx.createLinearGradient(-12, 8, 12, 28);
        rearGr.addColorStop(0, '#808080');
        rearGr.addColorStop(0.3, '#999');
        rearGr.addColorStop(0.5, '#707070');
        rearGr.addColorStop(1, '#555');
        ctx.fillStyle = rearGr;
        ctx.beginPath();
        ctx.moveTo(-12, 8);
        ctx.lineTo(-14, 16);
        ctx.lineTo(-12, 26);
        ctx.lineTo(-6, 30);
        ctx.lineTo(6, 30);
        ctx.lineTo(12, 26);
        ctx.lineTo(14, 16);
        ctx.lineTo(12, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Rear gold trim
        ctx.fillStyle = C.gold;
        ctx.fillRect(-11, 8, 22, 2);
        ctx.fillRect(-10, 18, 20, 1.5);

        // ─── Layered armor plates - mid section ───
        const midGr = ctx.createLinearGradient(-14, -10, 14, 10);
        midGr.addColorStop(0, '#B0B0B0');
        midGr.addColorStop(0.2, '#8A8A8A');
        midGr.addColorStop(0.5, '#CACACA');
        midGr.addColorStop(0.7, '#808080');
        midGr.addColorStop(1, '#6A6A6A');
        ctx.fillStyle = midGr;
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(-14, -2);
        ctx.lineTo(-14, 6);
        ctx.lineTo(-12, 10);
        ctx.lineTo(12, 10);
        ctx.lineTo(14, 6);
        ctx.lineTo(14, -2);
        ctx.lineTo(10, -10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Hard light reflection
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(-8, -10);
        ctx.lineTo(-12, -2);
        ctx.lineTo(-5, -2);
        ctx.lineTo(-3, -10);
        ctx.closePath();
        ctx.fill();
        // Mid gold trim
        ctx.fillStyle = C.gold;
        ctx.fillRect(-13, -10, 26, 2);
        ctx.fillRect(-13, 0, 26, 1.5);
        ctx.fillRect(-11, 9, 22, 2);
        // ─── Layered armor plates - upper section (dragon neck) ───
        const upGr = ctx.createLinearGradient(-8, -28, 8, -8);
        upGr.addColorStop(0, '#CDCDCD');
        upGr.addColorStop(0.25, '#A0A0A0');
        upGr.addColorStop(0.5, '#D8D8D8');
        upGr.addColorStop(0.75, '#909090');
        upGr.addColorStop(1, '#808080');
        ctx.fillStyle = upGr;
        ctx.beginPath();
        ctx.moveTo(0, -34);    // Dragon head point
        ctx.lineTo(-5, -28);
        ctx.lineTo(-8, -20);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, -8);
        ctx.lineTo(10, -8);
        ctx.lineTo(10, -12);
        ctx.lineTo(8, -20);
        ctx.lineTo(5, -28);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Rim lighting on dragon head
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-5, -28);
        ctx.lineTo(0, -34);
        ctx.lineTo(5, -28);
        ctx.stroke();
        // Gold trim on upper
        ctx.fillStyle = C.gold;
        ctx.fillRect(-9, -20, 18, 2);
        ctx.fillRect(-7, -26, 14, 1.5);
        // ─── Dragon head crest (small V-horns) ───
        for (let side = -1; side <= 1; side += 2) {
            ctx.fillStyle = C.gold;
            ctx.beginPath();
            ctx.moveTo(side * 3, -30);
            ctx.lineTo(side * 7, -38);
            ctx.lineTo(side * 5, -32);
            ctx.closePath();
            ctx.fill();
        }
        // ─── Nose tip antenna/sensor ───
        ctx.strokeStyle = C.chrome;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -34);
        ctx.lineTo(0, -40);
        ctx.stroke();
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.arc(0, -40, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // ════════════════════════════════════════
        // COCKPIT (bright orange-red glowing gem)
        // ════════════════════════════════════════
        // Gold frame (outer)
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -4, 8, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Cockpit gem - orange-red glow
        const cockGr = ctx.createRadialGradient(-1, -6, 0, 0, -4, 10);
        cockGr.addColorStop(0, '#FFEE44');        // bright yellow center
        cockGr.addColorStop(0.25, '#FF8800');      // orange
        cockGr.addColorStop(0.5, '#FF4400');        // red-orange
        cockGr.addColorStop(0.8, '#CC2200');        // deep red
        cockGr.addColorStop(1, 'rgba(100, 10, 0, 0.8)');
        ctx.fillStyle = cockGr;
        ctx.beginPath();
        ctx.ellipse(0, -4, 6.5, 9.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cockpit highlight (hard light reflection)
        ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
        ctx.beginPath();
        ctx.ellipse(-2, -8, 2.5, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Second highlight
        ctx.fillStyle = 'rgba(255, 200, 100, 0.3)';
        ctx.beginPath();
        ctx.ellipse(1.5, -1, 2, 2.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // ════════════════════════════════════════
        // DETAIL OVERLAYS (cyan accent panels)
        // ════════════════════════════════════════
        ctx.fillStyle = C.cyan;
        // Small cyan vents on mid section
        ctx.fillRect(-8, -6, 4, 2);
        ctx.fillRect(4, -6, 4, 2);
        // Cyan panel near rear
        ctx.fillRect(-6, 14, 4, 2.5);
        ctx.fillRect(2, 14, 4, 2.5);
        // Neck vents
        ctx.fillRect(-6, -16, 3, 2);
        ctx.fillRect(3, -16, 3, 2);
        // ─── Purple accent strips (body sides) ───
        ctx.fillStyle = C.purple;
        ctx.fillRect(-13, 2, 3, 6);
        ctx.fillRect(10, 2, 3, 6);
        ctx.fillRect(-11, 20, 3, 5);
        ctx.fillRect(8, 20, 3, 5);
        // ─── Final rim light pass (top edges glow) ───
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.8;
        // Upper body rim
        ctx.beginPath();
        ctx.moveTo(-10, -8);
        ctx.lineTo(-8, -20);
        ctx.lineTo(-5, -28);
        ctx.lineTo(0, -34);
        ctx.lineTo(5, -28);
        ctx.lineTo(8, -20);
        ctx.lineTo(10, -8);
        ctx.stroke();

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // ENEMY DRAWING - Biomechanical Insect Armada
    // ═══════════════════════════════════════════════════════════

    function drawEnemy(e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const hitFlash = e.hp < e.maxHp && frameCount % 4 < 2 && e.hp / e.maxHp < 0.3;
        switch (e.type) {
            case 'beetle': drawBeetle(e, hitFlash); break;
            case 'dragonfly': drawDragonfly(e, hitFlash); break;
            case 'moth': drawMothEnemy(e, hitFlash); break;
            case 'mantis': drawMantis(e, hitFlash); break;
            case 'queen': drawQueen(e, hitFlash); break;
        }
        ctx.restore();
    }

    function drawBeetle(e, flash) {
        const bodyColor = flash ? C.white : e.color;

        // Legs
        ctx.strokeStyle = '#003355';
        ctx.lineWidth = 1.5;
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 3; i++) {
                const ly = -8 + i * 8;
                ctx.beginPath();
                ctx.moveTo(side * 10, ly);
                ctx.lineTo(side * 18, ly + 4);
                ctx.stroke();
            }
        }

        // Elytra (wing covers)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 2, 16, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        // Metallic sheen (iridescent)
        const sheenHue = (globalTime * 1.5 + e.animPhase * 60) % 360;
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = `hsl(${sheenHue}, 100%, 60%)`;
        ctx.beginPath();
        ctx.ellipse(0, 2, 16, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Chrome highlight
        const sheen = ctx.createLinearGradient(-16, -18, 16, 18);
        sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
        sheen.addColorStop(0.4, 'rgba(255,255,255,0.05)');
        sheen.addColorStop(0.6, 'rgba(255,255,255,0.15)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.ellipse(0, 2, 16, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wing split
        ctx.strokeStyle = '#002244';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -16); ctx.lineTo(0, 20);
        ctx.stroke();

        // Head
        ctx.fillStyle = '#003366';
        ctx.beginPath();
        ctx.arc(0, -14, 6, 0, Math.PI * 2);
        ctx.fill();

        // Glowing eyes
        ctx.fillStyle = C.red;
        ctx.beginPath();
        ctx.arc(-4, -14, 3, 0, Math.PI * 2);
        ctx.arc(4, -14, 3, 0, Math.PI * 2);
        ctx.fill();
        // Eye inner glow
        ctx.fillStyle = C.redBright;
        ctx.beginPath();
        ctx.arc(-4, -15, 1.2, 0, Math.PI * 2);
        ctx.arc(4, -15, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Mandibles
        ctx.strokeStyle = C.chrome;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, 18); ctx.lineTo(-7, 23);
        ctx.moveTo(4, 18); ctx.lineTo(7, 23);
        ctx.stroke();

        // Outline
        ctx.strokeStyle = '#001133';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 2, 16, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawDragonfly(e, flash) {
        e.wingPhase += 0.35;
        const wingFlap = Math.sin(e.wingPhase);
        const hue = (globalTime * 2.5 + e.hueOffset) % 360;

        // ─── WINGS (large, iridescent, holographic like concept art) ───
        for (let side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin(globalTime * 0.06 + e.wingPhase) * 0.15;

            // Upper wing
            const wingColor = `hsla(${hue + side * 30}, 100%, 65%, 0.6)`;
            const wingGlow = `hsl(${hue + side * 30}, 100%, 55%)`;
            ctx.fillStyle = wingColor;
            ctx.beginPath();
            ctx.ellipse(side * 16, -6, 16 * Math.abs(wingFlap * 0.7 + 0.3), 7, side * -0.3, 0, Math.PI * 2);
            ctx.fill();

            // Wing vein pattern
            ctx.strokeStyle = `hsla(${hue + 60}, 100%, 80%, 0.4)`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(side * 5, -6);
            ctx.lineTo(side * 25 * (wingFlap * 0.5 + 0.5), -6);
            ctx.stroke();

            // Lower wing
            ctx.fillStyle = `hsla(${hue + 120 + side * 20}, 100%, 60%, 0.5)`;
            ctx.beginPath();
            ctx.ellipse(side * 13, 6, 13 * Math.abs(wingFlap * 0.6 + 0.4), 5, side * -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.globalAlpha = 1;

        // ─── BODY (segmented, metallic) ───
        // Thorax
        ctx.fillStyle = flash ? C.white : '#003322';
        ctx.beginPath();
        ctx.ellipse(0, -2, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Abdomen segments with neon glow
        ctx.fillStyle = e.color;
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(-4, -6 + i * 5, 8, 3);
        }
        // Metallic sheen on body
        const bodySheen = ctx.createLinearGradient(-6, -12, 6, 12);
        bodySheen.addColorStop(0, 'rgba(255,255,255,0.25)');
        bodySheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        bodySheen.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = bodySheen;
        ctx.beginPath();
        ctx.ellipse(0, -2, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#004422';
        ctx.beginPath();
        ctx.arc(0, -14, 5, 0, Math.PI * 2);
        ctx.fill();

        // Compound eyes (large, glowing magenta/pink like concept art)
        for (let side = -1; side <= 1; side += 2) {
            ctx.fillStyle = C.magenta;
            ctx.beginPath();
            ctx.arc(side * 5, -15, 4, 0, Math.PI * 2);
            ctx.fill();
            // Eye highlight
            ctx.fillStyle = C.magentaBright;
            ctx.beginPath();
            ctx.arc(side * 4.5, -16, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Antennae
        ctx.strokeStyle = C.green;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, -18); ctx.quadraticCurveTo(-8, -25, -6, -28);
        ctx.moveTo(3, -18); ctx.quadraticCurveTo(8, -25, 6, -28);
        ctx.stroke();
    }

    function drawMothEnemy(e, flash) {
        e.wingPhase += 0.06;
        const wingBeat = Math.sin(e.wingPhase);

        // ─── LARGE WINGS (like concept art moths) ───
        for (let side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = flash ? C.white : e.color;
            // Upper wing lobe
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.quadraticCurveTo(side * (28 + wingBeat * 4), -20, side * 22, 5);
            ctx.quadraticCurveTo(side * 15, 16, 0, 8);
            ctx.closePath();
            ctx.fill();

            // Wing pattern circles
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(side * 14, -4, 6, 0, Math.PI * 2);
            ctx.fill();

            // Wing edge glow
            ctx.fillStyle = `hsla(${(globalTime * 2 + side * 90) % 360}, 100%, 70%, 0.15)`;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.quadraticCurveTo(side * (28 + wingBeat * 4), -20, side * 22, 5);
            ctx.quadraticCurveTo(side * 15, 16, 0, 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Body
        ctx.fillStyle = flash ? C.white : '#330025';
        ctx.beginPath();
        ctx.ellipse(0, 2, 6, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body neon segments
        ctx.fillStyle = C.magenta;
        ctx.fillRect(-4, -6, 8, 2.5);
        ctx.fillRect(-3, 0, 6, 2.5);
        ctx.fillRect(-3, 6, 6, 2.5);
        // Eyes
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(-5, -10, 4, 0, Math.PI * 2);
        ctx.arc(5, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.goldBright;
        ctx.beginPath();
        ctx.arc(-5, -11, 1.5, 0, Math.PI * 2);
        ctx.arc(5, -11, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = C.magenta;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, -14); ctx.quadraticCurveTo(-10, -25, -7, -28);
        ctx.moveTo(3, -14); ctx.quadraticCurveTo(10, -25, 7, -28);
        ctx.stroke();
        // Antenna tips
        ctx.fillStyle = C.magenta;
        ctx.beginPath();
        ctx.arc(-7, -28, 2, 0, Math.PI * 2);
        ctx.arc(7, -28, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawMantis(e, flash) {
        const armSwing = Math.sin(globalTime * 0.06) * 0.4;

        // Scythe arms
        for (let side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.rotate(side * (0.4 + armSwing * side));
            ctx.strokeStyle = C.chrome;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(side * 14, -8);
            ctx.lineTo(side * 28, -22);
            ctx.lineTo(side * 32, -10);
            ctx.stroke();
            // Blade edge glow
            ctx.strokeStyle = C.purple;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(side * 28, -22);
            ctx.lineTo(side * 32, -10);
            ctx.stroke();
            ctx.restore();
        }

        // Body
        ctx.fillStyle = flash ? C.white : C.chrome;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-17, 6);
        ctx.lineTo(-12, 22);
        ctx.lineTo(12, 22);
        ctx.lineTo(17, 6);
        ctx.lineTo(14, -12);
        ctx.closePath();
        ctx.fill();
        // Chrome highlight
        const mantisSheen = ctx.createLinearGradient(-17, -26, 17, 22);
        mantisSheen.addColorStop(0, 'rgba(255,255,255,0.4)');
        mantisSheen.addColorStop(0.3, 'rgba(255,255,255,0.1)');
        mantisSheen.addColorStop(0.7, 'rgba(255,255,255,0.2)');
        mantisSheen.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = mantisSheen;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-17, 6);
        ctx.lineTo(-12, 22);
        ctx.lineTo(12, 22);
        ctx.lineTo(17, 6);
        ctx.lineTo(14, -12);
        ctx.closePath();
        ctx.fill();

        // Purple armor plates
        ctx.fillStyle = C.purple;
        ctx.fillRect(-12, -10, 24, 4);
        ctx.fillRect(-10, 2, 20, 4);
        ctx.fillRect(-8, 14, 16, 3);
        // Head
        ctx.fillStyle = C.chrome;
        ctx.beginPath();
        ctx.arc(0, -22, 9, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.arc(-5, -24, 4, 0, Math.PI * 2);
        ctx.arc(5, -24, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.cyanBright;
        ctx.beginPath();
        ctx.arc(-5, -25, 1.5, 0, Math.PI * 2);
        ctx.arc(5, -25, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-17, 6);
        ctx.lineTo(-12, 22);
        ctx.lineTo(12, 22);
        ctx.lineTo(17, 6);
        ctx.lineTo(14, -12);
        ctx.closePath();
        ctx.stroke();
    }

    function drawQueen(e, flash) {
        const pulse = Math.sin(globalTime * 0.05);
        e.animPhase = (e.animPhase || 0) + 0.03;

        // Massive aura
        ctx.globalAlpha = 0.1 + pulse * 0.04;
        const auraGrad = ctx.createRadialGradient(0, 0, 25, 0, 0, 75);
        auraGrad.addColorStop(0, C.gold);
        auraGrad.addColorStop(0.4, C.magenta);
        auraGrad.addColorStop(0.7, C.purple);
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 75 + pulse * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Massive wings
        const wingHue = (globalTime * 3) % 360;
        for (let side = -1; side <= 1; side += 2) {
            const wingSpread = 0.85 + pulse * 0.15;
            ctx.save();
            ctx.globalAlpha = 0.5;

            // Primary wing
            ctx.fillStyle = `hsla(${wingHue + side * 40}, 100%, 55%, 0.4)`;
            ctx.beginPath();
            ctx.moveTo(-5 * side, -18);
            ctx.quadraticCurveTo(side * 52 * wingSpread, -40, side * 40 * wingSpread, 12);
            ctx.quadraticCurveTo(side * 25, 35, side * 5, 18);
            ctx.closePath();
            ctx.fill();

            // Wing iridescent overlay
            ctx.fillStyle = `hsla(${wingHue + 120 + side * 60}, 100%, 65%, 0.2)`;
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Main body
        ctx.fillStyle = flash ? C.white : '#2a1a00';
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.lineTo(-20, -22);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-20, 22);
        ctx.lineTo(-14, 38);
        ctx.lineTo(14, 38);
        ctx.lineTo(20, 22);
        ctx.lineTo(24, 0);
        ctx.lineTo(20, -22);
        ctx.closePath();
        ctx.fill();
        // Gold armor plates
        ctx.fillStyle = C.gold;
        ctx.fillRect(-18, -20, 36, 5);
        ctx.fillRect(-16, -6, 32, 4);
        ctx.fillRect(-14, 8, 28, 4);
        ctx.fillRect(-12, 22, 24, 4);
        // Chrome sheen
        const queenSheen = ctx.createLinearGradient(-24, -44, 24, 38);
        queenSheen.addColorStop(0, 'rgba(255,255,255,0.3)');
        queenSheen.addColorStop(0.4, 'rgba(255,255,255,0.05)');
        queenSheen.addColorStop(0.6, 'rgba(255,255,255,0.15)');
        queenSheen.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = queenSheen;
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.lineTo(-20, -22);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-20, 22);
        ctx.lineTo(-14, 38);
        ctx.lineTo(14, 38);
        ctx.lineTo(20, 22);
        ctx.lineTo(24, 0);
        ctx.lineTo(20, -22);
        ctx.closePath();
        ctx.fill();

        // Energy core
        ctx.fillStyle = C.magenta;
        ctx.beginPath();
        ctx.arc(0, 2, 10 + pulse * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.white;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, 5 + pulse * 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Crown
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.moveTo(-14, -42);
        ctx.lineTo(-10, -54);
        ctx.lineTo(-5, -46);
        ctx.lineTo(0, -58);
        ctx.lineTo(5, -46);
        ctx.lineTo(10, -54);
        ctx.lineTo(14, -42);
        ctx.closePath();
        ctx.fill();
        // Crown jewels
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.arc(0, -52, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.magenta;
                ctx.beginPath();
        ctx.arc(-7, -48, 2, 0, Math.PI * 2);
        ctx.arc(7, -48, 2, 0, Math.PI * 2);
        ctx.fill();
        // Three eyes
        ctx.fillStyle = C.red;
        ctx.beginPath();
        ctx.arc(-9, -34, 4.5, 0, Math.PI * 2);
        ctx.arc(9, -34, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.cyan;
                ctx.beginPath();
        ctx.arc(0, -38, 5.5, 0, Math.PI * 2);
        ctx.fill();
        // Eye highlights
        ctx.fillStyle = C.white;
        ctx.beginPath();
        ctx.arc(-9, -35, 1.8, 0, Math.PI * 2);
        ctx.arc(9, -35, 1.8, 0, Math.PI * 2);
        ctx.arc(0, -39, 2, 0, Math.PI * 2);
        ctx.fill();

        // Mandibles
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-8, 36); ctx.quadraticCurveTo(-14, 48, -10, 50);
        ctx.moveTo(8, 36); ctx.quadraticCurveTo(14, 48, 10, 50);
        ctx.stroke();

        // HP bar
        const hpPercent = e.hp / e.maxHp;
        const barW = 80;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(-barW / 2, -68, barW, 7);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(-barW / 2, -68, barW, 7);
        const hpColor = hpPercent > 0.5 ? C.green : hpPercent > 0.25 ? C.gold : C.red;
        ctx.fillStyle = hpColor;
        ctx.fillRect(-barW / 2 + 1, -67, (barW - 2) * hpPercent, 5);
        // Outline
        ctx.strokeStyle = '#0a0500';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.lineTo(-20, -22);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-20, 22);
        ctx.lineTo(-14, 38);
        ctx.lineTo(14, 38);
        ctx.lineTo(20, 22);
        ctx.lineTo(24, 0);
        ctx.lineTo(20, -22);
        ctx.closePath();
        ctx.stroke();
    }

    // ═══════════════════════════════════════════════════════════
    // BULLET & EFFECT RENDERING
    // ═══════════════════════════════════════════════════════════

    function drawBullets() {
        ctx.globalCompositeOperation = 'lighter';

        // ─── Player bullets (bright plasma drops like concept art) ───
        for (const b of bullets) {
            // Outer glow
            ctx.fillStyle = b.color;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.size * 1.8, b.size * 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Core
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.white;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.size * 0.7, b.size * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Mid
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.size, b.size * 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── Beam weapon (massive like concept art) ───
        if (player.beamActive && player.weaponType === 'beam') {
            const beamW = 22 + Math.sin(globalTime * 0.4) * 6;
            // Outer glow
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = C.purple;
            ctx.fillRect(player.x - beamW * 1.5, 0, beamW * 3, player.y - player.height / 2);
            // Inner beam
            ctx.globalAlpha = 0.6;
            const beamGrad = ctx.createLinearGradient(player.x - beamW, 0, player.x + beamW, 0);
            beamGrad.addColorStop(0, 'transparent');
            beamGrad.addColorStop(0.2, C.purple);
            beamGrad.addColorStop(0.4, C.purpleBright);
            beamGrad.addColorStop(0.5, C.white);
            beamGrad.addColorStop(0.6, C.purpleBright);
            beamGrad.addColorStop(0.8, C.purple);
            beamGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = beamGrad;
            ctx.fillRect(player.x - beamW, 0, beamW * 2, player.y - player.height / 2);
            ctx.globalAlpha = 1;
        }

        // ─── Enemy bullets (glowing orbs like concept art) ───
        for (const b of enemyBullets) {
            // Outer glow
            ctx.fillStyle = b.glowColor || b.color;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size * 2, 0, Math.PI * 2);
            ctx.fill();
            // Core
            ctx.globalAlpha = 1;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
            // Bright center
            ctx.fillStyle = C.white;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawParticles() {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            const s = p.size * (0.5 + alpha * 0.5);
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawExplosions() {
        ctx.globalCompositeOperation = 'lighter';
        for (const e of explosions) {
            if (e.type === 'ring') {
                ctx.globalAlpha = e.alpha;
                ctx.strokeStyle = e.color || C.gold;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (e.type === 'fireball') {
                // Orange fireball like concept art
                const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
                grad.addColorStop(0, `rgba(255, 255, 200, ${e.alpha})`);
                grad.addColorStop(0.3, `rgba(255, 180, 50, ${e.alpha * 0.8})`);
                grad.addColorStop(0.6, `rgba(255, 100, 20, ${e.alpha * 0.5})`);
                grad.addColorStop(1, `rgba(200, 50, 0, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (e.type === 'bomb') {
                ctx.globalAlpha = e.alpha * 0.4;
                ctx.fillStyle = C.white;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawLensFlares() {
        ctx.globalCompositeOperation = 'lighter';
        for (const f of lensFlares) {
            const alpha = f.life / f.maxLife;
            const size = f.size * (1 - alpha * 0.3);
            ctx.globalAlpha = alpha * 0.5;
            const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, size);
            grad.addColorStop(0, f.color);
            grad.addColorStop(0.3, `rgba(255, 200, 100, ${alpha * 0.3})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(f.x, f.y, size, 0, Math.PI * 2);
            ctx.fill();
            // Horizontal streak
            ctx.globalAlpha = alpha * 0.25;
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x - size * 1.5, f.y - 2, size * 3, 4);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawPowerups() {
        for (const p of powerups) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            ctx.globalAlpha = 0.3 + Math.sin(globalTime * 0.12) * 0.15;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.fillStyle = p.color;
            switch (p.type) {
                case 'spread': ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-9, 5); ctx.lineTo(-3, 3); ctx.lineTo(-3, 9); ctx.lineTo(3, 9); ctx.lineTo(3, 3); ctx.lineTo(9, 5); ctx.closePath(); ctx.fill(); break;
                case 'beam': ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(-5, 0); ctx.lineTo(0, 0); ctx.lineTo(-3, 9); ctx.lineTo(5, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); break;
                case 'shield': ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-8, -4); ctx.lineTo(-8, 3); ctx.lineTo(0, 9); ctx.lineTo(8, 3); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill(); break;
                case 'bomb': ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke(); break;
                case 'speed': ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-7, 0); ctx.lineTo(-2, 0); ctx.lineTo(-4, 9); ctx.lineTo(7, 0); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill(); break;
            }
            ctx.restore();
        }
    }

    function drawTextPopups() {
        for (const t of textPopups) {
            const alpha = t.life / t.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 16px "Orbitron"';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════════════
    // HUD (styled like concept art)
    // ═══════════════════════════════════════════════════════════

    function drawHUD() {
        ctx.save();
        // Score
        ctx.fillStyle = C.cyan;
        ctx.font = 'bold 18px "Orbitron"';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE:', 20, 32);
        ctx.font = 'bold 22px "Share Tech Mono"';
        ctx.fillText(score.toLocaleString(), 20, 58);

        // High Score
        ctx.fillStyle = '#888';
        ctx.font = '13px "Share Tech Mono"';
        ctx.fillText(`HI-SCORE: ${highScore.toLocaleString()}`, 20, 78);

        // Wave
        ctx.fillStyle = C.gold;
        ctx.font = '15px "Orbitron"';
        ctx.textAlign = 'center';
        ctx.fillText(`WAVE ${wave}`, canvas.width / 2, 30);
        // Lives (ship icons like concept art)
        ctx.textAlign = 'right';
        ctx.fillStyle = C.red;
        ctx.font = 'bold 16px "Orbitron"';
        ctx.fillText('LIVES:', canvas.width - 25 - player.lives * 28, 32);
        for (let i = 0; i < player.lives; i++) drawMiniShip(canvas.width - 20 - i * 28, 28);

        // Shield bar
        if (player.shield > 0) {
            ctx.fillStyle = C.gold;
            ctx.font = '14px "Orbitron"';
            ctx.textAlign = 'right';
            ctx.fillText(`SHIELD: [${'█'.repeat(player.shield)}${'░'.repeat(3 - player.shield)}]`, canvas.width - 20, 58);
        }

        // Bottom HUD
        ctx.textAlign = 'left';
        ctx.fillStyle = C.magenta;
        ctx.font = '12px "Orbitron"';
        ctx.fillText(`BOMBS: ${player.bombs} [X]`, 20, canvas.height - 50);

        ctx.fillStyle = C.purple;
        ctx.fillText(`POWER: ${'█'.repeat(player.powerLevel + 1)}${'░'.repeat(3 - player.powerLevel)}`, 20, canvas.height - 68);

        ctx.fillStyle = player.weaponType === 'beam' ? C.purple : C.cyan;
        ctx.fillText(`WEAPON: ${player.weaponType.toUpperCase()}`, 20, canvas.height - 86);

        ctx.fillStyle = autoFire ? C.green : '#555';
        ctx.font = '10px "Orbitron"';
        ctx.fillText(`AUTO-FIRE ${autoFire ? 'ON' : 'OFF'} [F]`, 20, canvas.height - 20);

        ctx.fillStyle = musicEnabled ? '#555' : '#333';
        ctx.fillText(`MUSIC ${musicEnabled ? 'ON' : 'OFF'} [M]`, 20, canvas.height - 34);

        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';
        ctx.font = '10px "Share Tech Mono"';
        ctx.fillText('ARROWS/WASD: MOVE | SPACE: FIRE | P: PAUSE', canvas.width - 20, canvas.height - 20);

        ctx.restore();
    }

    function drawMiniShip(x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = C.chrome;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(-6, 7); ctx.lineTo(0, 4); ctx.lineTo(6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.arc(0, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.red;
        ctx.fillRect(-2, 1, 4, 3);
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // SCREENS
    // ═══════════════════════════════════════════════════════════

    function drawMenuScreen() {
        drawBackground();

        const titleY = canvas.height * 0.28;
        const pulse = Math.sin(globalTime * 0.04);

        // Glow band
        ctx.globalAlpha = 0.08 + pulse * 0.03;
        ctx.fillStyle = C.cyan;
        ctx.fillRect(0, titleY - 55, canvas.width, 130);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        // GALAXY
        ctx.fillStyle = C.cyan;
        ctx.font = 'bold 60px "Orbitron"';
        ctx.fillText('GALAXY', canvas.width / 2, titleY);

        // STORM
        ctx.fillStyle = C.magenta;
        ctx.font = 'bold 72px "Orbitron"';
        ctx.fillText('STORM', canvas.width / 2, titleY + 65);
        // Subtitle
        ctx.fillStyle = C.gold;
        ctx.font = '13px "Orbitron"';
        ctx.fillText('◆ RETRO-FUTURISTIC SPACE SHOOTER ◆', canvas.width / 2, titleY + 95);

        // Demo enemies floating
        const demoY = canvas.height * 0.5;
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.translate(canvas.width * 0.15 + i * canvas.width * 0.175 + Math.sin(globalTime * 0.02 + i) * 15, demoY + Math.cos(globalTime * 0.015 + i * 1.5) * 12);
            ctx.scale(1.2, 1.2);
            const dummyEnemy = { color: [C.blue, C.green, C.magenta, C.chrome, C.gold][i], wingPhase: globalTime * 0.1 + i, hueOffset: i * 60, animPhase: globalTime * 0.05 + i };
            if (i === 0) drawBeetle(dummyEnemy, false);
            else if (i === 1 || i === 4) drawDragonfly(dummyEnemy, false);
            else drawMothEnemy(dummyEnemy, false);
            ctx.restore();
        }

        // Start prompt
        if (Math.floor(globalTime * 0.04) % 2 === 0) {
            ctx.fillStyle = C.white;
            ctx.font = 'bold 22px "Orbitron"';
            ctx.textAlign = 'center';
            ctx.fillText('▶  PRESS ENTER TO START  ◀', canvas.width / 2, canvas.height * 0.62);
        }

        // High score
        ctx.fillStyle = C.gold;
        ctx.font = '15px "Share Tech Mono"';
        ctx.fillText(`HIGH SCORE: ${highScore.toLocaleString()}`, canvas.width / 2, canvas.height * 0.7);

        // Controls
        ctx.fillStyle = '#555';
        ctx.font = '12px "Share Tech Mono"';
        ctx.fillText('ARROWS / WASD — MOVE', canvas.width / 2, canvas.height * 0.8);
        ctx.fillText('SPACE — FIRE  |  F — AUTO-FIRE  |  X — BOMB', canvas.width / 2, canvas.height * 0.8 + 22);
        ctx.fillText('P — PAUSE  |  M — TOGGLE MUSIC', canvas.width / 2, canvas.height * 0.8 + 44);
    }

    function drawGameOverScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';

        const glitch = Math.random() > 0.88 ? (Math.random() - 0.5) * 12 : 0;
        const glitch2 = Math.random() > 0.88 ? (Math.random() - 0.5) * 12 : 0;

        // Glitch layers
        ctx.fillStyle = C.red;
        ctx.globalAlpha = 0.4;
        ctx.font = 'bold 56px "Orbitron"';
        ctx.fillText('GAME OVER', canvas.width / 2 + glitch, canvas.height * 0.32 + glitch2);
        ctx.fillStyle = C.cyan;
        ctx.globalAlpha = 0.25;
        ctx.fillText('GAME OVER', canvas.width / 2 - glitch * 0.6, canvas.height * 0.32 - glitch2 * 0.6);
        ctx.globalAlpha = 1;

        ctx.fillStyle = C.white;
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.32);
        ctx.fillStyle = C.gold;
        ctx.font = 'bold 22px "Orbitron"';
        ctx.fillText(`FINAL SCORE: ${score.toLocaleString()}`, canvas.width / 2, canvas.height * 0.43);

        ctx.fillStyle = C.cyan;
        ctx.font = '17px "Orbitron"';
        ctx.fillText(`WAVE REACHED: ${wave}`, canvas.width / 2, canvas.height * 0.50);

        if (score >= highScore && score > 0) {
            ctx.fillStyle = C.magenta;
            ctx.font = 'bold 20px "Orbitron"';
            ctx.fillText('★ NEW HIGH SCORE ★', canvas.width / 2, canvas.height * 0.57);
        } else {
            ctx.fillStyle = '#777';
            ctx.font = '14px "Share Tech Mono"';
            ctx.fillText(`HIGH SCORE: ${highScore.toLocaleString()}`, canvas.width / 2, canvas.height * 0.57);
        }

        if (Math.floor(globalTime * 0.04) % 2 === 0) {
            ctx.fillStyle = C.white;
            ctx.font = 'bold 20px "Orbitron"';
            ctx.fillText('PRESS ENTER TO RESTART', canvas.width / 2, canvas.height * 0.68);
        }
    }

    function drawWaveAnnounce() {
        const progress = 1 - waveTimer / 120;
        const scale = progress < 0.3 ? progress / 0.3 : 1;
        const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';

        ctx.fillStyle = `rgba(0, 255, 255, ${0.06 * alpha})`;
        ctx.fillRect(0, canvas.height * 0.35, canvas.width, 90);

        ctx.fillStyle = C.cyan;
        ctx.font = `bold ${40 * scale}px "Orbitron"`;
        ctx.fillText(`WAVE ${wave}`, canvas.width / 2, canvas.height * 0.4 + 22);

        const effectiveWave = ((wave - 1) % 10) + 1;
        let subtitle = '';
        if (effectiveWave === 5) subtitle = '— MINI BOSS —';
        else if (effectiveWave === 10) subtitle = '— QUEEN HIVEMIND —';
        else if (effectiveWave >= 8) subtitle = '— BOMBING RUN —';
        if (subtitle) {
            ctx.fillStyle = C.magenta;
                        ctx.font = `${18 * scale}px "Orbitron"`;
            ctx.fillText(subtitle, canvas.width / 2, canvas.height * 0.4 + 55);
        }
        ctx.restore();
    }

    function drawBossWarning() {
        const flash = Math.floor(globalTime * 0.15) % 2 === 0;
        ctx.save();
        ctx.textAlign = 'center';
        if (flash) { ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.fillStyle = flash ? C.red : C.gold;
        ctx.font = 'bold 46px "Orbitron"';
        ctx.fillText('⚠ WARNING ⚠', canvas.width / 2, canvas.height * 0.34);
        ctx.fillStyle = C.gold;
        ctx.font = 'bold 24px "Orbitron"';
        ctx.fillText('QUEEN HIVEMIND APPROACHING', canvas.width / 2, canvas.height * 0.43);
        ctx.restore();
    }

    function drawPauseOverlay() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = C.cyan;
        ctx.font = 'bold 48px "Orbitron"';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '16px "Share Tech Mono"';
        ctx.fillText('PRESS P TO RESUME', canvas.width / 2, canvas.height / 2 + 30);
    }

    // ── Screen Shake ──
    function applyScreenShake() {
        if (screenShakeAmount > 0.5) {
            ctx.translate((Math.random() - 0.5) * screenShakeAmount, (Math.random() - 0.5) * screenShakeAmount);
            screenShakeAmount *= screenShakeDecay;
        } else { screenShakeAmount = 0; }
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN GAME LOOP
    // ═══════════════════════════════════════════════════════════

    const TARGET_FPS = 60;
    const FRAME_TIME = 1000 / TARGET_FPS;
    let accumulator = 0;

    function gameLoop(timestamp) {
        if (!lastFrameTime) lastFrameTime = timestamp;
        deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        // Frame rate limiter - skip if too fast
        accumulator += deltaTime;
        if (accumulator < FRAME_TIME * 0.9) {
            requestAnimationFrame(gameLoop);
            return;
        }
        // Normalize delta time: 1.0 = perfect 60fps frame
        dt = Math.min(accumulator / FRAME_TIME, 3); // cap at 3x to avoid spiral
        accumulator = 0;

        globalTime++;
        frameCount++;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        switch (gameState) {
            case STATE.MENU:
                drawMenuScreen();
                break;

            case STATE.PLAYING:
            case STATE.WAVE_ANNOUNCE:
            case STATE.BOSS_WARNING:
                applyScreenShake();
                drawBackground();
                updatePlayer();
                updateBullets();
                updateEnemies();
                updateParticles();
                updateExplosions();
                updateLensFlares();
                updatePowerups();
                updateTextPopups();

                // Build spatial grid for collision
                gridClear();
                for (let i = 0; i < enemies.length; i++) gridInsert(enemies[i]);
                checkCollisions();

                if (waveSpawned && enemies.length === 0 && gameState === STATE.PLAYING) {
                    wave++; waveSpawned = false;
                    gameState = STATE.WAVE_ANNOUNCE; waveTimer = 120;
                }
                if (gameState === STATE.WAVE_ANNOUNCE) { waveTimer--; if (waveTimer <= 0) { gameState = STATE.PLAYING; spawnWave(wave); } }
                if (gameState === STATE.BOSS_WARNING) { bossWarningTimer--; if (bossWarningTimer <= 0 && bossWarningTimer > -10) gameState = STATE.PLAYING; }

                drawPowerups();
                for (const e of enemies) drawEnemy(e);
                drawPlayer();
                drawBullets();
                drawParticles();
                drawExplosions();
                drawLensFlares();
                drawTextPopups();
                drawHUD();
                if (gameState === STATE.WAVE_ANNOUNCE) drawWaveAnnounce();
                if (gameState === STATE.BOSS_WARNING) drawBossWarning();
                break;

            case STATE.PAUSED:
                drawBackground();
                drawPowerups();
                for (const e of enemies) drawEnemy(e);
                drawPlayer();
                drawBullets();
                drawParticles();
                drawHUD();
                drawPauseOverlay();
                break;

            case STATE.GAMEOVER:
                applyScreenShake();
                drawBackground();
                updateParticles();
                updateExplosions();
                updateLensFlares();
                drawParticles();
                drawExplosions();
                drawLensFlares();
                drawGameOverScreen();
                break;
        }

        ctx.restore();
        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
})();
