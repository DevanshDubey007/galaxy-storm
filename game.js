// ============================================================
// GALAXY STORM - Retro-Futuristic Space Shooter
// ============================================================

(() => {
    'use strict';

    // ── Canvas Setup ──
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── Constants ──
    const COLORS = {
        cyan: '#00FFFF',
        purple: '#BF00FF',
        magenta: '#FF0090',
        gold: '#FFD700',
        chrome: '#C0C0C0',
        deepSpace: '#0A0A1A',
        red: '#FF3333',
        green: '#00FF66',
        blue: '#0066FF',
        white: '#FFFFFF',
        darkBlue: '#0a0a2e',
        nebulaPurple: '#1a0a3e',
    };

    // ── Game State ──
    const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, WAVE_ANNOUNCE: 4, BOSS_WARNING: 5 };
    let gameState = STATE.MENU;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('galaxyStormHighScore')) || 0;
    let wave = 1;
    let waveTimer = 0;
    let bossWarningTimer = 0;
    let enemiesRemaining = 0;
    let waveSpawned = false;
    let screenShakeAmount = 0;
    let screenShakeDecay = 0.92;
    let globalTime = 0;
    let deltaTime = 0;
    let lastFrameTime = 0;
    let frameCount = 0;

    // ── Input ──
    const keys = {};
    let autoFire = false;
    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'Enter') {
            if (gameState === STATE.MENU || gameState === STATE.GAMEOVER) startGame();
        }
        if (e.code === 'KeyP' && gameState === STATE.PLAYING) gameState = STATE.PAUSED;
        else if (e.code === 'KeyP' && gameState === STATE.PAUSED) gameState = STATE.PLAYING;
        if (e.code === 'KeyF') autoFire = !autoFire;
        if (e.code === 'KeyX' && gameState === STATE.PLAYING) useBomb();
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // ── Audio System ──
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
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
                break;
            case 'explosion':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'playerHit':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.setValueAtTime(400, now + 0.1);
                osc.frequency.setValueAtTime(200, now + 0.2);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'powerup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                osc.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
                break;
            case 'bossWarning':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(60, now);
                osc.frequency.setValueAtTime(50, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;
            case 'bomb':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(80, now);
                osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                osc.start(now);
                osc.stop(now + 0.8);
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

    // ── Star Layers (Parallax) ──
    const starLayers = [];
    function initStars() {
        starLayers.length = 0;
        for (let layer = 0; layer < 4; layer++) {
            const stars = [];
            const count = [200, 100, 50, 20][layer];
            const speed = [0.2, 0.5, 1.0, 1.8][layer];
            const size = [1, 1.5, 2, 3][layer];
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    speed,
                    size,
                    brightness: 0.3 + Math.random() * 0.7,
                    twinkleSpeed: 0.5 + Math.random() * 2,
                    twinkleOffset: Math.random() * Math.PI * 2,
                });
            }
            starLayers.push(stars);
        }
    }
    initStars();
    window.addEventListener('resize', initStars);

    // ── Nebula Clouds ──
    const nebulaClouds = [];
    function initNebulae() {
        nebulaClouds.length = 0;
        for (let i = 0; i < 5; i++) {
            nebulaClouds.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * 0.6,
                radius: 100 + Math.random() * 250,
                color: [
                    'rgba(191, 0, 255, 0.04)',
                    'rgba(0, 255, 255, 0.03)',
                    'rgba(255, 0, 144, 0.03)',
                    'rgba(0, 102, 255, 0.04)',
                ][i % 4],
                speed: 0.05 + Math.random() * 0.1,
                pulseSpeed: 0.3 + Math.random() * 0.5,
            });
        }
    }
    initNebulae();

    // ── Distant Planet ──
    let distantPlanet = {
        x: -200,
        y: canvas.height * 0.25,
        radius: 60,
        ringAngle: 0.3,
        speed: 0.08,
        visible: false,
        timer: 600, // frames until next appearance
    };

    // ── Player ──
    const player = {
        x: 0, y: 0,
        width: 40, height: 48,
        vx: 0, vy: 0,
        speed: 5,
        lives: 3,
        maxLives: 5,
        invincible: false,
        invincibleTimer: 0,
        shootCooldown: 0,
        shootRate: 8,
        powerLevel: 0, // 0=single, 1=dual, 2=spread3, 3=spread5
        weaponType: 'bullet', // 'bullet' or 'beam'
        beamActive: false,
        shield: 0,
        bombs: 2,
        speedBoost: 0,
        engineFlame: 0,
    };

    function resetPlayer() {
        player.x = canvas.width / 2;
        player.y = canvas.height - 80;
        player.vx = 0;
        player.vy = 0;
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
        score = 0;
        wave = 1;
        waveSpawned = false;
        bullets.length = 0;
        enemyBullets.length = 0;
        enemies.length = 0;
        particles.length = 0;
        powerups.length = 0;
        explosions.length = 0;
        textPopups.length = 0;
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
        screenShakeAmount = 20;
        // Screen flash explosion
        explosions.push({
            x: canvas.width / 2, y: canvas.height / 2,
            radius: 0, maxRadius: Math.max(canvas.width, canvas.height),
            alpha: 1, type: 'bomb',
        });
        // Kill all enemies and bullets on screen
        for (const enemy of enemies) {
            score += enemy.scoreValue || 100;
            spawnExplosion(enemy.x, enemy.y, enemy.color, 20);
        }
        enemies.length = 0;
        enemyBullets.length = 0;
        // Spawn tons of particles
        for (let i = 0; i < 200; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            particles.push({
                x: canvas.width / 2, y: canvas.height / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 60 + Math.random() * 60,
                maxLife: 120,
                color: [COLORS.cyan, COLORS.magenta, COLORS.gold, COLORS.purple][Math.floor(Math.random() * 4)],
                size: 2 + Math.random() * 4,
            });
        }
    }

    // ── Spawn Explosion ──
    function spawnExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 5;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30 + Math.random() * 30,
                maxLife: 60,
                color,
                size: 1 + Math.random() * 3,
            });
        }
        // Expanding ring
        explosions.push({
            x, y, radius: 0, maxRadius: 40 + Math.random() * 30,
            alpha: 1, type: 'ring', color,
        });
    }

    // ── Text Popup ──
    function spawnTextPopup(x, y, text, color) {
        textPopups.push({ x, y, text, color, life: 60, maxLife: 60 });
    }

    // ── Spawn Power-up ──
    function spawnPowerup(x, y) {
        if (Math.random() > 0.25) return; // 25% chance
        const types = ['spread', 'beam', 'shield', 'bomb', 'speed'];
        const weights = [30, 15, 20, 10, 25];
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        let type = types[0];
        for (let i = 0; i < types.length; i++) {
            r -= weights[i];
            if (r <= 0) { type = types[i]; break; }
        }
        const colors = {
            spread: COLORS.cyan,
            beam: COLORS.purple,
            shield: COLORS.gold,
            bomb: COLORS.magenta,
            speed: COLORS.green,
        };
        powerups.push({
            x, y, type,
            color: colors[type],
            vy: 1.5,
            radius: 12,
            rotation: 0,
            life: 600,
        });
    }

    // ── Enemy Spawning ──
    function spawnWave(waveNum) {
        waveSpawned = true;
        const loopMultiplier = 1 + Math.floor((waveNum - 1) / 10) * 0.5;
        const effectiveWave = ((waveNum - 1) % 10) + 1;

        switch (effectiveWave) {
            case 1:
                spawnBeetleFormation(5, 2, loopMultiplier);
                break;
            case 2:
                spawnBeetleFormation(7, 3, loopMultiplier);
                break;
            case 3:
                spawnBeetleFormation(6, 2, loopMultiplier);
                spawnDragonflies(3, loopMultiplier);
                break;
            case 4:
                spawnBeetleFormation(8, 3, loopMultiplier);
                spawnDragonflies(5, loopMultiplier);
                break;
            case 5:
                spawnMantisElite(loopMultiplier);
                spawnBeetleFormation(4, 2, loopMultiplier);
                break;
            case 6:
                spawnBeetleFormation(8, 3, loopMultiplier);
                spawnDragonflies(4, loopMultiplier);
                spawnMoths(2, loopMultiplier);
                break;
            case 7:
                spawnBeetleFormation(10, 4, loopMultiplier);
                spawnDragonflies(6, loopMultiplier);
                spawnMoths(3, loopMultiplier);
                break;
            case 8:
                spawnMoths(5, loopMultiplier);
                spawnDragonflies(3, loopMultiplier);
                break;
            case 9:
                spawnMoths(6, loopMultiplier);
                spawnBeetleFormation(6, 3, loopMultiplier);
                spawnMantisElite(loopMultiplier);
                break;
            case 10:
                // Boss wave
                gameState = STATE.BOSS_WARNING;
                bossWarningTimer = 180;
                playSound('bossWarning');
                setTimeout(() => {
                    spawnQueenBoss(loopMultiplier);
                }, 3000);
                break;
        }
        enemiesRemaining = enemies.length;
    }

    function spawnBeetleFormation(cols, rows, mult) {
        const spacing = 55;
        const startX = (canvas.width - (cols - 1) * spacing) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                enemies.push(createBeetle(startX + c * spacing, -50 - r * 50, mult));
            }
        }
    }

    function createBeetle(x, targetY, mult) {
        return {
            type: 'beetle',
            x, y: -50,
            targetY: 60 + Math.random() * 120,
            width: 32, height: 32,
            hp: Math.ceil(2 * mult),
            maxHp: Math.ceil(2 * mult),
            color: COLORS.blue,
            scoreValue: 100,
            shootTimer: 60 + Math.random() * 120,
            shootRate: Math.max(40, 100 - wave * 5),
            movePattern: 'zigzag',
            moveTimer: 0,
            moveDir: Math.random() > 0.5 ? 1 : -1,
            entered: false,
            speed: 1 + mult * 0.3,
        };
    }

    function spawnDragonflies(count, mult) {
        for (let i = 0; i < count; i++) {
            enemies.push(createDragonfly(
                100 + Math.random() * (canvas.width - 200),
                -80 - i * 60,
                mult
            ));
        }
    }

    function createDragonfly(x, y, mult) {
        return {
            type: 'dragonfly',
            x, y,
            targetY: 50 + Math.random() * 100,
            width: 28, height: 36,
            hp: Math.ceil(1 * mult),
            maxHp: Math.ceil(1 * mult),
            color: COLORS.green,
            scoreValue: 150,
            shootTimer: 80 + Math.random() * 60,
            shootRate: Math.max(50, 90 - wave * 3),
            movePattern: 'swoop',
            moveTimer: Math.random() * 300,
            swoopPhase: 0,
            entered: false,
            speed: 2 + mult * 0.4,
            wingPhase: Math.random() * Math.PI * 2,
        };
    }

    function spawnMoths(count, mult) {
        for (let i = 0; i < count; i++) {
            enemies.push(createMoth(
                80 + Math.random() * (canvas.width - 160),
                -100 - i * 70,
                mult
            ));
        }
    }

    function createMoth(x, y, mult) {
        return {
            type: 'moth',
            x, y,
            targetY: 40 + Math.random() * 80,
            width: 38, height: 38,
            hp: Math.ceil(4 * mult),
            maxHp: Math.ceil(4 * mult),
            color: COLORS.magenta,
            scoreValue: 200,
            shootTimer: 100 + Math.random() * 80,
            shootRate: Math.max(60, 120 - wave * 4),
            movePattern: 'drift',
            moveTimer: 0,
            entered: false,
            speed: 0.8 + mult * 0.2,
        };
    }

    function spawnMantisElite(mult) {
        enemies.push({
            type: 'mantis',
            x: canvas.width / 2,
            y: -60,
            targetY: 80,
            width: 44, height: 50,
            hp: Math.ceil(15 * mult),
            maxHp: Math.ceil(15 * mult),
            color: COLORS.chrome,
            scoreValue: 1000,
            shootTimer: 40,
            shootRate: 30,
            movePattern: 'patrol',
            moveTimer: 0,
            moveDir: 1,
            entered: false,
            speed: 1.5,
            phase: 0,
        });
    }

    function spawnQueenBoss(mult) {
        enemies.push({
            type: 'queen',
            x: canvas.width / 2,
            y: -100,
            targetY: 100,
            width: 80, height: 90,
            hp: Math.ceil(80 * mult),
            maxHp: Math.ceil(80 * mult),
            color: COLORS.gold,
            scoreValue: 5000,
            shootTimer: 30,
            shootRate: 20,
            movePattern: 'boss',
            moveTimer: 0,
            moveDir: 1,
            entered: false,
            speed: 1,
            phase: 0,
            attackPattern: 0,
            patternTimer: 0,
        });
        if (gameState === STATE.BOSS_WARNING) gameState = STATE.PLAYING;
    }

    // ── Player Shooting ──
    function playerShoot() {
        if (player.shootCooldown > 0) return;
        player.shootCooldown = player.shootRate;
        playSound('shoot');

        const bx = player.x;
        const by = player.y - player.height / 2;
        const bulletSpeed = -10;

        if (player.weaponType === 'beam') {
            player.beamActive = true;
            return;
        }

        switch (player.powerLevel) {
            case 0: // Single shot
                bullets.push({ x: bx, y: by, vx: 0, vy: bulletSpeed, color: COLORS.cyan, size: 3, damage: 1 });
                break;
            case 1: // Dual shot
                bullets.push({ x: bx - 8, y: by, vx: 0, vy: bulletSpeed, color: COLORS.cyan, size: 3, damage: 1 });
                bullets.push({ x: bx + 8, y: by, vx: 0, vy: bulletSpeed, color: COLORS.purple, size: 3, damage: 1 });
                break;
            case 2: // Spread 3
                bullets.push({ x: bx, y: by, vx: 0, vy: bulletSpeed, color: COLORS.cyan, size: 3, damage: 1 });
                bullets.push({ x: bx - 6, y: by, vx: -1.5, vy: bulletSpeed, color: COLORS.purple, size: 3, damage: 1 });
                bullets.push({ x: bx + 6, y: by, vx: 1.5, vy: bulletSpeed, color: COLORS.purple, size: 3, damage: 1 });
                break;
            case 3: // Spread 5
                bullets.push({ x: bx, y: by, vx: 0, vy: bulletSpeed, color: COLORS.cyan, size: 4, damage: 1 });
                bullets.push({ x: bx - 6, y: by, vx: -1.2, vy: bulletSpeed, color: COLORS.purple, size: 3, damage: 1 });
                bullets.push({ x: bx + 6, y: by, vx: 1.2, vy: bulletSpeed, color: COLORS.purple, size: 3, damage: 1 });
                bullets.push({ x: bx - 12, y: by, vx: -2.5, vy: bulletSpeed * 0.9, color: COLORS.magenta, size: 2, damage: 1 });
                bullets.push({ x: bx + 12, y: by, vx: 2.5, vy: bulletSpeed * 0.9, color: COLORS.magenta, size: 2, damage: 1 });
                break;
        }
    }

    // ── Enemy Shooting ──
    function enemyShoot(enemy) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 3 + wave * 0.15;

        switch (enemy.type) {
            case 'beetle':
                enemyBullets.push({
                    x: enemy.x, y: enemy.y + enemy.height / 2,
                    vx: (dx / dist) * speed * 0.7,
                    vy: (dy / dist) * speed * 0.7,
                    color: COLORS.blue, size: 3,
                });
                break;
            case 'dragonfly':
                enemyBullets.push({
                    x: enemy.x, y: enemy.y + enemy.height / 2,
                    vx: (dx / dist) * speed,
                    vy: (dy / dist) * speed,
                    color: COLORS.green, size: 2,
                });
                break;
            case 'moth':
                // Cluster bombs
                for (let i = -1; i <= 1; i++) {
                    enemyBullets.push({
                        x: enemy.x + i * 10, y: enemy.y + enemy.height / 2,
                        vx: i * 1.5,
                        vy: speed * 0.8,
                        color: COLORS.magenta, size: 4,
                    });
                }
                break;
            case 'mantis':
                // Spread shot
                for (let i = -2; i <= 2; i++) {
                    const angle = Math.atan2(dy, dx) + i * 0.2;
                    enemyBullets.push({
                        x: enemy.x, y: enemy.y + enemy.height / 2,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: COLORS.chrome, size: 3,
                    });
                }
                break;
            case 'queen':
                queenAttack(enemy);
                break;
        }
    }

    function queenAttack(queen) {
        const speed = 3.5;
        const pattern = queen.attackPattern % 3;
        switch (pattern) {
            case 0: // Radial burst
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2 + globalTime * 0.01;
                    enemyBullets.push({
                        x: queen.x, y: queen.y + queen.height / 2,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: COLORS.gold, size: 4,
                    });
                }
                break;
            case 1: // Aimed streams
                const dx = player.x - queen.x;
                const dy = player.y - queen.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                for (let i = -1; i <= 1; i++) {
                    const angle = Math.atan2(dy, dx) + i * 0.15;
                    enemyBullets.push({
                        x: queen.x, y: queen.y + queen.height / 2,
                        vx: Math.cos(angle) * speed * 1.2,
                        vy: Math.sin(angle) * speed * 1.2,
                        color: COLORS.magenta, size: 3,
                    });
                }
                break;
            case 2: // Spiral
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + queen.phase;
                    enemyBullets.push({
                        x: queen.x, y: queen.y + queen.height / 2,
                        vx: Math.cos(angle) * speed * 0.9,
                        vy: Math.sin(angle) * speed * 0.9,
                        color: COLORS.purple, size: 3,
                    });
                }
                queen.phase += 0.3;
                break;
        }
    }

    // ── Update Functions ──
    function updatePlayer() {
        const spd = player.speed + (player.speedBoost > 0 ? 2 : 0);
        const accel = 0.6;
        const friction = 0.88;

        if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= accel;
        if (keys['ArrowRight'] || keys['KeyD']) player.vx += accel;
        if (keys['ArrowUp'] || keys['KeyW']) player.vy -= accel;
        if (keys['ArrowDown'] || keys['KeyS']) player.vy += accel;

        player.vx *= friction;
        player.vy *= friction;

        player.vx = Math.max(-spd, Math.min(spd, player.vx));
        player.vy = Math.max(-spd, Math.min(spd, player.vy));

        player.x += player.vx;
        player.y += player.vy;

        // Boundaries
        player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
        player.y = Math.max(canvas.height * 0.3, Math.min(canvas.height - player.height / 2 - 10, player.y));

        // Shooting
        if (player.shootCooldown > 0) player.shootCooldown--;
        if (keys['Space'] || autoFire) playerShoot();
        if (!keys['Space'] && !autoFire) player.beamActive = false;

        // Timers
        if (player.invincible) {
            player.invincibleTimer--;
            if (player.invincibleTimer <= 0) player.invincible = false;
        }
        if (player.speedBoost > 0) player.speedBoost--;

        // Engine particles
        player.engineFlame += 0.2;
        if (frameCount % 2 === 0) {
            particles.push({
                x: player.x - 6 + Math.random() * 12,
                y: player.y + player.height / 2 - 5,
                vx: (Math.random() - 0.5) * 1.5,
                vy: 2 + Math.random() * 2,
                life: 15 + Math.random() * 10,
                maxLife: 25,
                color: Math.random() > 0.5 ? COLORS.red : COLORS.gold,
                size: 2 + Math.random() * 2,
            });
        }
    }

    function updateBullets() {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            // Trail particles
            if (frameCount % 3 === 0) {
                particles.push({
                    x: b.x, y: b.y,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: 1,
                    life: 8, maxLife: 8,
                    color: b.color, size: 1.5,
                });
            }
            if (b.y < -10 || b.y > canvas.height + 10 || b.x < -10 || b.x > canvas.width + 10) {
                bullets.splice(i, 1);
            }
        }
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y < -10 || b.y > canvas.height + 10 || b.x < -10 || b.x > canvas.width + 10) {
                enemyBullets.splice(i, 1);
            }
        }
    }

    function updateEnemies() {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            // Enter screen
            if (!e.entered) {
                e.y += 2;
                if (e.y >= e.targetY) {
                    e.y = e.targetY;
                    e.entered = true;
                }
                continue;
            }

            // Movement patterns
            e.moveTimer++;
            switch (e.movePattern) {
                case 'zigzag':
                    e.x += Math.sin(e.moveTimer * 0.03) * e.speed;
                    // Slowly drift down
                    e.y += 0.1;
                    break;
                case 'swoop':
                    e.swoopPhase += 0.02;
                    e.x += Math.sin(e.moveTimer * 0.02) * e.speed * 1.5;
                    // Occasional dive
                    if (Math.sin(e.swoopPhase) > 0.9) {
                        e.y += e.speed * 2;
                    } else {
                        e.y += Math.sin(e.moveTimer * 0.01) * 0.5;
                    }
                    break;
                case 'drift':
                    e.x += Math.sin(e.moveTimer * 0.015) * e.speed;
                    e.y += Math.cos(e.moveTimer * 0.01) * 0.3;
                    break;
                case 'patrol':
                    e.x += e.moveDir * e.speed * 1.5;
                    if (e.x < 60 || e.x > canvas.width - 60) e.moveDir *= -1;
                    break;
                case 'boss':
                    e.x += e.moveDir * e.speed;
                    if (e.x < 100 || e.x > canvas.width - 100) e.moveDir *= -1;
                    e.y += Math.sin(e.moveTimer * 0.01) * 0.5;
                    e.patternTimer++;
                    if (e.patternTimer > 200) {
                        e.attackPattern++;
                        e.patternTimer = 0;
                    }
                    break;
            }

            // Stay on screen
            e.x = Math.max(e.width / 2, Math.min(canvas.width - e.width / 2, e.x));

            // Shooting
            e.shootTimer--;
            if (e.shootTimer <= 0 && e.entered) {
                e.shootTimer = e.shootRate;
                enemyShoot(e);
            }

            // Off screen removal (only if went below)
            if (e.y > canvas.height + 100) {
                enemies.splice(i, 1);
            }
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateExplosions() {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            if (e.type === 'ring') {
                e.radius += 3;
                e.alpha -= 0.03;
            } else if (e.type === 'bomb') {
                e.radius += 30;
                e.alpha -= 0.02;
            }
            if (e.alpha <= 0 || e.radius >= e.maxRadius) explosions.splice(i, 1);
        }
    }

    function updatePowerups() {
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += p.vy;
            p.rotation += 0.03;
            p.life--;
            if (p.y > canvas.height + 20 || p.life <= 0) {
                powerups.splice(i, 1);
                continue;
            }
            // Collision with player
            const dx = p.x - player.x;
            const dy = p.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < p.radius + 18) {
                collectPowerup(p);
                powerups.splice(i, 1);
            }
        }
    }

    function collectPowerup(p) {
        playSound('powerup');
        switch (p.type) {
            case 'spread':
                player.weaponType = 'bullet';
                player.powerLevel = Math.min(player.powerLevel + 1, 3);
                spawnTextPopup(p.x, p.y, 'SPREAD UP!', COLORS.cyan);
                break;
            case 'beam':
                player.weaponType = 'beam';
                spawnTextPopup(p.x, p.y, 'PLASMA BEAM!', COLORS.purple);
                break;
            case 'shield':
                player.shield = 3;
                spawnTextPopup(p.x, p.y, 'SHIELD!', COLORS.gold);
                break;
            case 'bomb':
                player.bombs = Math.min(player.bombs + 1, 5);
                spawnTextPopup(p.x, p.y, '+BOMB!', COLORS.magenta);
                break;
            case 'speed':
                player.speedBoost = 300;
                spawnTextPopup(p.x, p.y, 'SPEED!', COLORS.green);
                break;
        }
        // Sparkle effect
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2;
            particles.push({
                x: p.x, y: p.y,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                life: 20, maxLife: 20,
                color: p.color, size: 2,
            });
        }
    }

    function updateTextPopups() {
        for (let i = textPopups.length - 1; i >= 0; i--) {
            const t = textPopups[i];
            t.y -= 1;
            t.life--;
            if (t.life <= 0) textPopups.splice(i, 1);
        }
    }

    // ── Collision Detection ──
    function checkCollisions() {
        // Player bullets vs enemies
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                const e = enemies[ei];
                if (Math.abs(b.x - e.x) < e.width / 2 + b.size &&
                    Math.abs(b.y - e.y) < e.height / 2 + b.size) {
                    e.hp -= b.damage;
                    bullets.splice(bi, 1);
                    // Hit flash particles
                    for (let p = 0; p < 3; p++) {
                        particles.push({
                            x: b.x, y: b.y,
                            vx: (Math.random() - 0.5) * 3,
                            vy: (Math.random() - 0.5) * 3,
                            life: 10, maxLife: 10,
                            color: COLORS.white, size: 2,
                        });
                    }
                    if (e.hp <= 0) {
                        score += e.scoreValue;
                        spawnExplosion(e.x, e.y, e.color, e.type === 'queen' ? 60 : 20);
                        if (e.type === 'queen') {
                            screenShakeAmount = 25;
                            // Boss death mega explosion
                            for (let j = 0; j < 5; j++) {
                                setTimeout(() => {
                                    spawnExplosion(
                                        e.x + (Math.random() - 0.5) * 80,
                                        e.y + (Math.random() - 0.5) * 80,
                                        [COLORS.gold, COLORS.magenta, COLORS.cyan][j % 3],
                                        25
                                    );
                                    screenShakeAmount = 15;
                                    playSound('explosion');
                                }, j * 200);
                            }
                        } else {
                            screenShakeAmount = 5;
                        }
                        playSound('explosion');
                        spawnTextPopup(e.x, e.y, `+${e.scoreValue}`, COLORS.gold);
                        spawnPowerup(e.x, e.y);
                        enemies.splice(ei, 1);
                    }
                    break;
                }
            }
        }

        // Beam vs enemies
        if (player.beamActive && player.weaponType === 'beam') {
            const beamWidth = 20;
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                const e = enemies[ei];
                if (Math.abs(e.x - player.x) < e.width / 2 + beamWidth / 2 && e.y < player.y) {
                    e.hp -= 0.3; // Continuous damage
                    if (frameCount % 5 === 0) {
                        particles.push({
                            x: e.x + (Math.random() - 0.5) * 10,
                            y: e.y,
                            vx: (Math.random() - 0.5) * 4,
                            vy: (Math.random() - 0.5) * 4,
                            life: 10, maxLife: 10,
                            color: COLORS.purple, size: 2,
                        });
                    }
                    if (e.hp <= 0) {
                        score += e.scoreValue;
                        spawnExplosion(e.x, e.y, e.color, e.type === 'queen' ? 60 : 20);
                        if (e.type === 'queen') screenShakeAmount = 25;
                        else screenShakeAmount = 5;
                        playSound('explosion');
                        spawnTextPopup(e.x, e.y, `+${e.scoreValue}`, COLORS.gold);
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
                if (Math.abs(b.x - player.x) < 14 && Math.abs(b.y - player.y) < 18) {
                    enemyBullets.splice(bi, 1);
                    hitPlayer();
                    break;
                }
            }
        }

        // Enemies vs player
        if (!player.invincible) {
            for (const e of enemies) {
                if (Math.abs(e.x - player.x) < (e.width + player.width) / 2 - 5 &&
                    Math.abs(e.y - player.y) < (e.height + player.height) / 2 - 5) {
                    hitPlayer();
                    break;
                }
            }
        }
    }

    function hitPlayer() {
        if (player.shield > 0) {
            player.shield--;
            playSound('playerHit');
            screenShakeAmount = 5;
            spawnExplosion(player.x, player.y, COLORS.gold, 8);
            player.invincible = true;
            player.invincibleTimer = 30;
            return;
        }
        player.lives--;
        playSound('playerHit');
        screenShakeAmount = 15;
        spawnExplosion(player.x, player.y, COLORS.red, 25);
        player.invincible = true;
        player.invincibleTimer = 120;
        player.powerLevel = Math.max(0, player.powerLevel - 1);
        if (player.lives <= 0) {
            gameState = STATE.GAMEOVER;
            canvas.classList.remove('playing');
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('galaxyStormHighScore', highScore.toString());
            }
        }
    }

    // ── Background Rendering ──
    function drawBackground() {
        // Deep space gradient
        const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bg.addColorStop(0, '#050520');
        bg.addColorStop(0.4, '#0a0a2e');
        bg.addColorStop(0.7, '#0f0a30');
        bg.addColorStop(1, '#0a0520');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Nebula clouds
        for (const n of nebulaClouds) {
            n.y += n.speed;
            if (n.y > canvas.height + n.radius) {
                n.y = -n.radius;
                n.x = Math.random() * canvas.width;
            }
            const pulse = 1 + Math.sin(globalTime * n.pulseSpeed * 0.016) * 0.15;
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * pulse);
            grad.addColorStop(0, n.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(n.x - n.radius * pulse, n.y - n.radius * pulse, n.radius * 2 * pulse, n.radius * 2 * pulse);
        }

        // Stars
        for (let layer = 0; layer < starLayers.length; layer++) {
            for (const star of starLayers[layer]) {
                star.y += star.speed;
                if (star.y > canvas.height + 5) {
                    star.y = -5;
                    star.x = Math.random() * canvas.width;
                }
                const twinkle = 0.5 + Math.sin(globalTime * star.twinkleSpeed * 0.016 + star.twinkleOffset) * 0.5;
                const alpha = star.brightness * twinkle;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = layer === 3 ? COLORS.cyan : '#FFFFFF';
                ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
                if (layer >= 2) {
                    ctx.globalAlpha = alpha * 0.3;
                    ctx.fillRect(Math.floor(star.x) - 1, Math.floor(star.y), star.size + 2, star.size);
                    ctx.fillRect(Math.floor(star.x), Math.floor(star.y) - 1, star.size, star.size + 2);
                }
            }
        }
        ctx.globalAlpha = 1;

        // Distant planet
        distantPlanet.timer--;
        if (distantPlanet.timer <= 0 && !distantPlanet.visible) {
            distantPlanet.visible = true;
            distantPlanet.x = -100;
            distantPlanet.y = 50 + Math.random() * canvas.height * 0.3;
        }
        if (distantPlanet.visible) {
            distantPlanet.x += distantPlanet.speed;
            drawPlanet(distantPlanet);
            if (distantPlanet.x > canvas.width + 200) {
                distantPlanet.visible = false;
                distantPlanet.timer = 1800 + Math.random() * 1200;
            }
        }
    }

    function drawPlanet(planet) {
        ctx.save();
        ctx.globalAlpha = 0.3;

        // Planet body
        const grad = ctx.createRadialGradient(
            planet.x - planet.radius * 0.3, planet.y - planet.radius * 0.3, 0,
            planet.x, planet.y, planet.radius
        );
        grad.addColorStop(0, '#4a3080');
        grad.addColorStop(0.7, '#2a1050');
        grad.addColorStop(1, '#0a0020');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.strokeStyle = 'rgba(200, 180, 255, 0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, planet.radius * 1.8, planet.radius * 0.3, planet.ringAngle, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150, 130, 220, 0.2)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, planet.radius * 2, planet.radius * 0.35, planet.ringAngle, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    // ── Entity Rendering ──
    function drawPlayer() {
        if (player.invincible && Math.floor(globalTime * 0.3) % 2 === 0) return;

        ctx.save();
        ctx.translate(player.x, player.y);

        // Shield visual
        if (player.shield > 0) {
            ctx.globalAlpha = 0.3 + Math.sin(globalTime * 0.1) * 0.1;
            ctx.strokeStyle = COLORS.gold;
            ctx.shadowColor = COLORS.gold;
            ctx.shadowBlur = 15;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        // Speed boost visual
        if (player.speedBoost > 0) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = COLORS.green;
            ctx.beginPath();
            ctx.arc(0, 0, 25 + Math.sin(globalTime * 0.2) * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Main body - mech fighter ship
        // Chrome hull
        const bodyGrad = ctx.createLinearGradient(-18, -24, 18, 24);
        bodyGrad.addColorStop(0, '#E0E0E0');
        bodyGrad.addColorStop(0.3, '#A0A0A0');
        bodyGrad.addColorStop(0.5, '#D0D0D0');
        bodyGrad.addColorStop(0.7, '#808080');
        bodyGrad.addColorStop(1, '#606060');

        // Main fuselage
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(-8, -16);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-14, 10);
        ctx.lineTo(-18, 20);
        ctx.lineTo(-6, 22);
        ctx.lineTo(0, 16);
        ctx.lineTo(6, 22);
        ctx.lineTo(18, 20);
        ctx.lineTo(14, 10);
        ctx.lineTo(10, 0);
        ctx.lineTo(8, -16);
        ctx.closePath();
        ctx.fill();

        // Cel-shading outline
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Gold trim
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(-7, -18, 14, 3);
        ctx.fillRect(-5, -10, 10, 2);

        // Neon red accents
        ctx.fillStyle = COLORS.red;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 8;
        ctx.fillRect(-12, 2, 4, 8);
        ctx.fillRect(8, 2, 4, 8);

        // Cockpit glow
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 10;
        ctx.fillStyle = COLORS.cyan;
        ctx.beginPath();
        ctx.ellipse(0, -12, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Wing cannons
        ctx.fillStyle = '#707070';
        ctx.fillRect(-20, 6, 6, 14);
        ctx.fillRect(14, 6, 6, 14);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(-20, 6, 6, 14);
        ctx.strokeRect(14, 6, 6, 14);

        // Cannon tips glow
        ctx.fillStyle = player.weaponType === 'beam' ? COLORS.purple : COLORS.cyan;
        ctx.shadowColor = player.weaponType === 'beam' ? COLORS.purple : COLORS.cyan;
        ctx.shadowBlur = 6;
        ctx.fillRect(-19, 5, 4, 3);
        ctx.fillRect(15, 5, 4, 3);
        ctx.shadowBlur = 0;

        // Engine exhaust
        const flameH = 8 + Math.sin(player.engineFlame * 3) * 4;
        const flameGrad = ctx.createLinearGradient(0, 22, 0, 22 + flameH);
        flameGrad.addColorStop(0, COLORS.red);
        flameGrad.addColorStop(0.5, COLORS.gold);
        flameGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(-8, 22);
        ctx.lineTo(0, 22 + flameH);
        ctx.lineTo(8, 22);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    function drawEnemy(e) {
        ctx.save();
        ctx.translate(e.x, e.y);

        // Hit flash
        const hitFlash = e.hp < e.maxHp && frameCount % 4 < 2 && e.hp / e.maxHp < 0.3;

        switch (e.type) {
            case 'beetle':
                drawBeetle(e, hitFlash);
                break;
            case 'dragonfly':
                drawDragonfly(e, hitFlash);
                break;
            case 'moth':
                drawMothEnemy(e, hitFlash);
                break;
            case 'mantis':
                drawMantis(e, hitFlash);
                break;
            case 'queen':
                drawQueen(e, hitFlash);
                break;
        }

        ctx.restore();
    }

    function drawBeetle(e, flash) {
        // Body
        const bodyColor = flash ? COLORS.white : e.color;
        ctx.fillStyle = bodyColor;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 8;

        // Carapace
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Metallic sheen
        const sheen = ctx.createLinearGradient(-14, -16, 14, 16);
        sheen.addColorStop(0, 'rgba(255,255,255,0.3)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wing split line
        ctx.strokeStyle = '#003366';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(0, 16);
        ctx.stroke();

        // Eyes
        ctx.fillStyle = COLORS.red;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(-6, -8, 3, 0, Math.PI * 2);
        ctx.arc(6, -8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mandibles
        ctx.strokeStyle = COLORS.chrome;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-5, 14);
        ctx.lineTo(-8, 18);
        ctx.moveTo(5, 14);
        ctx.lineTo(8, 18);
        ctx.stroke();

        // Outline
        ctx.strokeStyle = '#001133';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawDragonfly(e, flash) {
        e.wingPhase += 0.3;
        const wingFlap = Math.sin(e.wingPhase);

        // Wings (holographic shimmer)
        ctx.globalAlpha = 0.4 + Math.sin(globalTime * 0.05 + e.wingPhase) * 0.2;
        const wingColor = `hsl(${(globalTime * 2 + e.wingPhase * 30) % 360}, 100%, 60%)`;
        ctx.fillStyle = wingColor;
        ctx.shadowColor = COLORS.green;
        ctx.shadowBlur = 10;

        // Left wings
        ctx.beginPath();
        ctx.ellipse(-12, -4, 12 * Math.abs(wingFlap), 5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-10, 6, 10 * Math.abs(wingFlap), 4, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // Right wings
        ctx.beginPath();
        ctx.ellipse(12, -4, 12 * Math.abs(wingFlap), 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(10, 6, 10 * Math.abs(wingFlap), 4, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Body
        ctx.fillStyle = flash ? COLORS.white : '#004422';
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Segments
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 4;
        ctx.fillRect(-4, -6, 8, 3);
        ctx.fillRect(-3, 0, 6, 3);
        ctx.fillRect(-3, 6, 6, 3);
        ctx.shadowBlur = 0;

        // Eyes
        ctx.fillStyle = COLORS.magenta;
        ctx.shadowColor = COLORS.magenta;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(-4, -12, 3, 0, Math.PI * 2);
        ctx.arc(4, -12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Outline
        ctx.strokeStyle = '#001a11';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 14, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawMothEnemy(e, flash) {
        const wingPhase = Math.sin(globalTime * 0.08) * 0.3;

        // Large wings
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = flash ? COLORS.white : e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 12;

        // Left wing
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(-25 - wingPhase * 5, -15, -20, 10);
        ctx.quadraticCurveTo(-10, 18, 0, 10);
        ctx.closePath();
        ctx.fill();

        // Right wing
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(25 + wingPhase * 5, -15, 20, 10);
        ctx.quadraticCurveTo(10, 18, 0, 10);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Wing patterns
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(-12, 0, 5, 0, Math.PI * 2);
        ctx.arc(12, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = '#330022';
        ctx.beginPath();
        ctx.ellipse(0, 2, 5, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(-4, -8, 3, 0, Math.PI * 2);
        ctx.arc(4, -8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    function drawMantis(e, flash) {
        // Body - chrome and purple
        ctx.fillStyle = flash ? COLORS.white : COLORS.chrome;
        ctx.shadowColor = COLORS.purple;
        ctx.shadowBlur = 10;

        // Torso
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-15, 5);
        ctx.lineTo(-10, 20);
        ctx.lineTo(10, 20);
        ctx.lineTo(15, 5);
        ctx.lineTo(12, -10);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Purple accents
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(-10, -8, 20, 4);
        ctx.fillRect(-8, 4, 16, 4);
        ctx.fillRect(-6, 14, 12, 3);

        // Arms - scythe blades
        ctx.strokeStyle = COLORS.chrome;
        ctx.lineWidth = 3;
        const armSwing = Math.sin(globalTime * 0.05) * 0.3;
        ctx.save();
        ctx.rotate(-0.5 + armSwing);
        ctx.beginPath();
        ctx.moveTo(-12, -5);
        ctx.lineTo(-25, -15);
        ctx.lineTo(-28, -5);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.rotate(0.5 - armSwing);
        ctx.beginPath();
        ctx.moveTo(12, -5);
        ctx.lineTo(25, -15);
        ctx.lineTo(28, -5);
        ctx.stroke();
        ctx.restore();

        // Head
        ctx.fillStyle = COLORS.chrome;
        ctx.beginPath();
        ctx.arc(0, -18, 8, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(-4, -20, 3, 0, Math.PI * 2);
        ctx.arc(4, -20, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Outline
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-15, 5);
        ctx.lineTo(-10, 20);
        ctx.lineTo(10, 20);
        ctx.lineTo(15, 5);
        ctx.lineTo(12, -10);
        ctx.closePath();
        ctx.stroke();
    }

    function drawQueen(e, flash) {
        const pulse = Math.sin(globalTime * 0.05);

        // Aura
        ctx.globalAlpha = 0.15 + pulse * 0.05;
        const auraGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 60);
        auraGrad.addColorStop(0, COLORS.gold);
        auraGrad.addColorStop(0.5, COLORS.magenta);
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 60 + pulse * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Wings (massive, holographic)
        ctx.globalAlpha = 0.5;
        const wingHue = (globalTime * 3) % 360;
        ctx.fillStyle = `hsla(${wingHue}, 100%, 50%, 0.3)`;
        ctx.shadowColor = `hsl(${wingHue}, 100%, 50%)`;
        ctx.shadowBlur = 15;

        const wingSpread = 0.9 + pulse * 0.1;
        // Left wing
        ctx.beginPath();
        ctx.moveTo(-5, -15);
        ctx.quadraticCurveTo(-45 * wingSpread, -35, -35 * wingSpread, 15);
        ctx.quadraticCurveTo(-20, 30, -5, 15);
        ctx.closePath();
        ctx.fill();

        // Right wing
        ctx.beginPath();
        ctx.moveTo(5, -15);
        ctx.quadraticCurveTo(45 * wingSpread, -35, 35 * wingSpread, 15);
        ctx.quadraticCurveTo(20, 30, 5, 15);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Main body
        ctx.fillStyle = flash ? COLORS.white : '#2a1a00';
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -40);
        ctx.lineTo(-18, -20);
        ctx.lineTo(-22, 0);
        ctx.lineTo(-18, 20);
        ctx.lineTo(-12, 35);
        ctx.lineTo(12, 35);
        ctx.lineTo(18, 20);
        ctx.lineTo(22, 0);
        ctx.lineTo(18, -20);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Gold armor plates
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(-16, -18, 32, 5);
        ctx.fillRect(-14, -5, 28, 4);
        ctx.fillRect(-12, 8, 24, 4);
        ctx.fillRect(-10, 20, 20, 4);

        // Magenta energy core
        ctx.fillStyle = COLORS.magenta;
        ctx.shadowColor = COLORS.magenta;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, 8 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Crown/head
        ctx.fillStyle = COLORS.gold;
        ctx.beginPath();
        ctx.moveTo(-12, -38);
        ctx.lineTo(-8, -48);
        ctx.lineTo(-4, -42);
        ctx.lineTo(0, -50);
        ctx.lineTo(4, -42);
        ctx.lineTo(8, -48);
        ctx.lineTo(12, -38);
        ctx.closePath();
        ctx.fill();

        // Eyes (3 eyes)
        ctx.fillStyle = COLORS.red;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-8, -30, 4, 0, Math.PI * 2);
        ctx.arc(8, -30, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.beginPath();
        ctx.arc(0, -35, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // HP bar
        const hpPercent = e.hp / e.maxHp;
        const barW = 70;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-barW / 2, -60, barW, 6);
        const hpColor = hpPercent > 0.5 ? COLORS.green : hpPercent > 0.25 ? COLORS.gold : COLORS.red;
        ctx.fillStyle = hpColor;
        ctx.shadowColor = hpColor;
        ctx.shadowBlur = 4;
        ctx.fillRect(-barW / 2, -60, barW * hpPercent, 6);
        ctx.shadowBlur = 0;

        // Outline
        ctx.strokeStyle = '#1a0a00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -40);
        ctx.lineTo(-18, -20);
        ctx.lineTo(-22, 0);
        ctx.lineTo(-18, 20);
        ctx.lineTo(-12, 35);
        ctx.lineTo(12, 35);
        ctx.lineTo(18, 20);
        ctx.lineTo(22, 0);
        ctx.lineTo(18, -20);
        ctx.closePath();
        ctx.stroke();
    }

    // ── Draw Bullets ──
    function drawBullets() {
        // Player bullets
        ctx.globalCompositeOperation = 'lighter';
        for (const b of bullets) {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(b.x - b.size / 2, b.y - b.size, b.size, b.size * 2);
            // Glow core
            ctx.globalAlpha = 0.5;
            ctx.fillRect(b.x - b.size, b.y - b.size * 1.5, b.size * 2, b.size * 3);
            ctx.globalAlpha = 1;
        }

        // Beam weapon
        if (player.beamActive && player.weaponType === 'beam') {
            const beamW = 16 + Math.sin(globalTime * 0.5) * 4;
            const grad = ctx.createLinearGradient(player.x - beamW, 0, player.x + beamW, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.3, COLORS.purple);
            grad.addColorStop(0.5, COLORS.white);
            grad.addColorStop(0.7, COLORS.purple);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.shadowColor = COLORS.purple;
            ctx.shadowBlur = 20;
            ctx.fillRect(player.x - beamW / 2, 0, beamW, player.y - player.height / 2);
            ctx.shadowBlur = 0;
        }

        // Enemy bullets
        for (const b of enemyBullets) {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
    }

    // ── Draw Particles ──
    function drawParticles() {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Draw Explosions ──
    function drawExplosions() {
        ctx.globalCompositeOperation = 'lighter';
        for (const e of explosions) {
            if (e.type === 'ring') {
                ctx.globalAlpha = e.alpha;
                ctx.strokeStyle = e.color || COLORS.gold;
                ctx.lineWidth = 3;
                ctx.shadowColor = e.color || COLORS.gold;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (e.type === 'bomb') {
                ctx.globalAlpha = e.alpha * 0.3;
                ctx.fillStyle = COLORS.white;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
    }

    // ── Draw Power-ups ──
    function drawPowerups() {
        for (const p of powerups) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            // Outer glow
            ctx.globalAlpha = 0.3 + Math.sin(globalTime * 0.1) * 0.15;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
            ctx.fill();

            // Inner icon
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 8;
            ctx.fillStyle = p.color;

            switch (p.type) {
                case 'spread':
                    // Arrow shape
                    ctx.beginPath();
                    ctx.moveTo(0, -8);
                    ctx.lineTo(-8, 4);
                    ctx.lineTo(-3, 2);
                    ctx.lineTo(-3, 8);
                    ctx.lineTo(3, 8);
                    ctx.lineTo(3, 2);
                    ctx.lineTo(8, 4);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'beam':
                    // Lightning
                    ctx.beginPath();
                    ctx.moveTo(2, -8);
                    ctx.lineTo(-4, 0);
                    ctx.lineTo(0, 0);
                    ctx.lineTo(-2, 8);
                    ctx.lineTo(4, 0);
                    ctx.lineTo(0, 0);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'shield':
                    // Shield shape
                    ctx.beginPath();
                    ctx.moveTo(0, -8);
                    ctx.lineTo(-7, -4);
                    ctx.lineTo(-7, 2);
                    ctx.lineTo(0, 8);
                    ctx.lineTo(7, 2);
                    ctx.lineTo(7, -4);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'bomb':
                    // Circle with cross
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-4, -4);
                    ctx.lineTo(4, 4);
                    ctx.moveTo(4, -4);
                    ctx.lineTo(-4, 4);
                    ctx.stroke();
                    break;
                case 'speed':
                    // Double arrow
                    ctx.beginPath();
                    ctx.moveTo(0, -8);
                    ctx.lineTo(-6, 0);
                    ctx.lineTo(-2, 0);
                    ctx.lineTo(-2, -2);
                    ctx.lineTo(2, -2);
                    ctx.lineTo(2, 0);
                    ctx.lineTo(6, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-6, 8);
                    ctx.lineTo(6, 8);
                    ctx.closePath();
                    ctx.fill();
                    break;
            }

            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    // ── Draw Text Popups ──
    function drawTextPopups() {
        for (const t of textPopups) {
            const alpha = t.life / t.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = t.color;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 6;
            ctx.font = 'bold 14px "Orbitron"';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x, t.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    // ── HUD ──
    function drawHUD() {
        ctx.save();

        // Score
        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 4;
        ctx.font = '18px "Orbitron"';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE`, 20, 35);
        ctx.font = 'bold 24px "Share Tech Mono"';
        ctx.fillText(score.toString().padStart(8, '0'), 20, 60);

        // Wave
        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = COLORS.gold;
        ctx.font = '14px "Orbitron"';
        ctx.textAlign = 'center';
        ctx.fillText(`WAVE ${wave}`, canvas.width / 2, 30);

        // Lives
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.red;
        ctx.shadowColor = COLORS.red;
        ctx.font = '16px "Orbitron"';
        ctx.fillText('LIVES', canvas.width - 20, 35);
        for (let i = 0; i < player.lives; i++) {
            drawMiniShip(canvas.width - 30 - i * 25, 50);
        }

        // Bombs
        ctx.fillStyle = COLORS.magenta;
        ctx.shadowColor = COLORS.magenta;
        ctx.font = '12px "Orbitron"';
        ctx.textAlign = 'left';
        ctx.fillText(`BOMBS: ${player.bombs}`, 20, canvas.height - 50);
        ctx.fillText(`[X] USE`, 20, canvas.height - 35);

        // Power level
        ctx.fillStyle = COLORS.purple;
        ctx.shadowColor = COLORS.purple;
        ctx.fillText(`POWER: ${'█'.repeat(player.powerLevel + 1)}${'░'.repeat(3 - player.powerLevel)}`, 20, canvas.height - 70);

        // Weapon type
        ctx.fillStyle = player.weaponType === 'beam' ? COLORS.purple : COLORS.cyan;
        ctx.fillText(`WEAPON: ${player.weaponType.toUpperCase()}`, 20, canvas.height - 88);

        // Shield
        if (player.shield > 0) {
            ctx.fillStyle = COLORS.gold;
            ctx.shadowColor = COLORS.gold;
            ctx.fillText(`SHIELD: ${'◆'.repeat(player.shield)}`, 20, canvas.height - 106);
        }

        // Auto-fire indicator
        if (autoFire) {
            ctx.fillStyle = COLORS.green;
            ctx.shadowColor = COLORS.green;
            ctx.font = '10px "Orbitron"';
            ctx.fillText('AUTO-FIRE ON [F]', 20, canvas.height - 20);
        } else {
            ctx.fillStyle = '#666';
            ctx.font = '10px "Orbitron"';
            ctx.fillText('AUTO-FIRE OFF [F]', 20, canvas.height - 20);
        }

        // Controls hint
        ctx.fillStyle = '#444';
        ctx.font = '10px "Share Tech Mono"';
        ctx.textAlign = 'right';
        ctx.fillText('ARROWS/WASD: MOVE | SPACE: FIRE | P: PAUSE', canvas.width - 20, canvas.height - 20);

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawMiniShip(x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = COLORS.chrome;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(-2, 0, 4, 3);
        ctx.restore();
    }

    // ── Menu Screen ──
    function drawMenuScreen() {
        drawBackground();

        // Title
        const titleY = canvas.height * 0.3;
        const pulse = Math.sin(globalTime * 0.04);

        // Title glow backdrop
        ctx.globalAlpha = 0.1 + pulse * 0.05;
        ctx.fillStyle = COLORS.cyan;
        ctx.fillRect(0, titleY - 60, canvas.width, 120);
        ctx.globalAlpha = 1;

        // GALAXY text
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 20 + pulse * 5;
        ctx.font = 'bold 56px "Orbitron"';
        ctx.fillText('GALAXY', canvas.width / 2, titleY - 10);

        // STORM text
        ctx.fillStyle = COLORS.magenta;
        ctx.shadowColor = COLORS.magenta;
        ctx.shadowBlur = 20 + pulse * 5;
        ctx.font = 'bold 64px "Orbitron"';
        ctx.fillText('STORM', canvas.width / 2, titleY + 50);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.fillStyle = COLORS.gold;
        ctx.font = '14px "Orbitron"';
        ctx.fillText('RETRO-FUTURISTIC SPACE SHOOTER', canvas.width / 2, titleY + 85);

        // Start prompt
        if (Math.floor(globalTime * 0.04) % 2 === 0) {
            ctx.fillStyle = COLORS.white;
            ctx.shadowColor = COLORS.white;
            ctx.shadowBlur = 8;
            ctx.font = '20px "Orbitron"';
            ctx.fillText('PRESS ENTER TO START', canvas.width / 2, canvas.height * 0.6);
            ctx.shadowBlur = 0;
        }

        // High score
        ctx.fillStyle = COLORS.gold;
        ctx.font = '14px "Share Tech Mono"';
        ctx.fillText(`HIGH SCORE: ${highScore.toString().padStart(8, '0')}`, canvas.width / 2, canvas.height * 0.7);

        // Controls
        ctx.fillStyle = '#555';
        ctx.font = '12px "Share Tech Mono"';
        ctx.fillText('ARROWS / WASD - MOVE', canvas.width / 2, canvas.height * 0.8);
        ctx.fillText('SPACE - FIRE  |  F - AUTO-FIRE', canvas.width / 2, canvas.height * 0.8 + 20);
        ctx.fillText('X - BOMB  |  P - PAUSE', canvas.width / 2, canvas.height * 0.8 + 40);

        // Animated decorative ships
        const shipY = canvas.height * 0.5;
        ctx.save();
        ctx.translate(canvas.width * 0.3 + Math.sin(globalTime * 0.02) * 20, shipY);
        ctx.scale(1.5, 1.5);
        drawMenuBeetle();
        ctx.restore();

        ctx.save();
        ctx.translate(canvas.width * 0.7 + Math.cos(globalTime * 0.02) * 20, shipY);
        ctx.scale(1.5, 1.5);
        drawMenuDragonfly();
        ctx.restore();
    }

    function drawMenuBeetle() {
        ctx.fillStyle = COLORS.blue;
        ctx.shadowColor = COLORS.blue;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.red;
        ctx.shadowColor = COLORS.red;
        ctx.beginPath();
        ctx.arc(-6, -8, 3, 0, Math.PI * 2);
        ctx.arc(6, -8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawMenuDragonfly() {
        ctx.fillStyle = COLORS.green;
        ctx.shadowColor = COLORS.green;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.magenta;
        ctx.shadowColor = COLORS.magenta;
        ctx.beginPath();
        ctx.arc(-4, -12, 3, 0, Math.PI * 2);
        ctx.arc(4, -12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // ── Game Over Screen ──
    function drawGameOverScreen() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';

        // GAME OVER with glitch effect
        const glitchOffset = Math.random() > 0.9 ? (Math.random() - 0.5) * 10 : 0;
        const glitchOffset2 = Math.random() > 0.9 ? (Math.random() - 0.5) * 10 : 0;

        // Red shadow
        ctx.fillStyle = COLORS.red;
        ctx.globalAlpha = 0.5;
        ctx.font = 'bold 52px "Orbitron"';
        ctx.fillText('GAME OVER', canvas.width / 2 + glitchOffset, canvas.height * 0.35 + glitchOffset2);
        ctx.globalAlpha = 1;

        // Cyan offset
        ctx.fillStyle = COLORS.cyan;
        ctx.globalAlpha = 0.3;
        ctx.fillText('GAME OVER', canvas.width / 2 - glitchOffset * 0.5, canvas.height * 0.35 - glitchOffset2 * 0.5);
        ctx.globalAlpha = 1;

        // Main text
        ctx.fillStyle = COLORS.white;
        ctx.shadowColor = COLORS.white;
        ctx.shadowBlur = 10;
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.35);
        ctx.shadowBlur = 0;

        // Score
        ctx.fillStyle = COLORS.gold;
        ctx.font = '20px "Orbitron"';
        ctx.fillText(`FINAL SCORE: ${score.toString().padStart(8, '0')}`, canvas.width / 2, canvas.height * 0.45);

        // Wave reached
        ctx.fillStyle = COLORS.cyan;
        ctx.font = '16px "Orbitron"';
        ctx.fillText(`WAVE REACHED: ${wave}`, canvas.width / 2, canvas.height * 0.52);

        // High score
        if (score >= highScore) {
            ctx.fillStyle = COLORS.magenta;
            ctx.shadowColor = COLORS.magenta;
            ctx.shadowBlur = 10;
            ctx.font = '18px "Orbitron"';
            ctx.fillText('★ NEW HIGH SCORE ★', canvas.width / 2, canvas.height * 0.59);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#888';
            ctx.font = '14px "Share Tech Mono"';
            ctx.fillText(`HIGH SCORE: ${highScore.toString().padStart(8, '0')}`, canvas.width / 2, canvas.height * 0.59);
        }

        // Restart prompt
        if (Math.floor(globalTime * 0.04) % 2 === 0) {
            ctx.fillStyle = COLORS.white;
            ctx.shadowColor = COLORS.white;
            ctx.shadowBlur = 6;
            ctx.font = '18px "Orbitron"';
            ctx.fillText('PRESS ENTER TO RESTART', canvas.width / 2, canvas.height * 0.7);
            ctx.shadowBlur = 0;
        }
    }

    // ── Wave Announcement ──
    function drawWaveAnnounce() {
        const progress = 1 - waveTimer / 120;
        const scale = progress < 0.3 ? progress / 0.3 : 1;
        const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';

        // Background flash
        ctx.fillStyle = `rgba(0, 255, 255, ${0.05 * alpha})`;
        ctx.fillRect(0, canvas.height * 0.35, canvas.width, 80);

        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 15;
        ctx.font = `bold ${36 * scale}px "Orbitron"`;
        ctx.fillText(`WAVE ${wave}`, canvas.width / 2, canvas.height * 0.4 + 20);

        // Sub-text
        const effectiveWave = ((wave - 1) % 10) + 1;
        let subtitle = '';
        if (effectiveWave === 5) subtitle = '— MINI BOSS —';
        else if (effectiveWave === 10) subtitle = '— QUEEN HIVEMIND —';
        else if (effectiveWave >= 8) subtitle = '— BOMBING RUN —';

        if (subtitle) {
            ctx.fillStyle = COLORS.magenta;
            ctx.shadowColor = COLORS.magenta;
            ctx.font = `${16 * scale}px "Orbitron"`;
            ctx.fillText(subtitle, canvas.width / 2, canvas.height * 0.4 + 50);
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Boss Warning ──
    function drawBossWarning() {
        const flash = Math.floor(globalTime * 0.15) % 2 === 0;
        ctx.save();
        ctx.textAlign = 'center';

        // Flashing red overlay
        if (flash) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.fillStyle = flash ? COLORS.red : COLORS.gold;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 20;
        ctx.font = 'bold 42px "Orbitron"';
        ctx.fillText('⚠ WARNING ⚠', canvas.width / 2, canvas.height * 0.35);

        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 10;
        ctx.font = '22px "Orbitron"';
        ctx.fillText('QUEEN HIVEMIND APPROACHING', canvas.width / 2, canvas.height * 0.43);

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Pause Overlay ──
    function drawPauseOverlay() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.cyan;
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 15;
        ctx.font = 'bold 42px "Orbitron"';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.shadowBlur = 0;
        ctx.font = '16px "Share Tech Mono"';
        ctx.fillText('PRESS P TO RESUME', canvas.width / 2, canvas.height / 2 + 30);
    }

    // ── Screen Shake ──
    function applyScreenShake() {
        if (screenShakeAmount > 0.5) {
            const shakeX = (Math.random() - 0.5) * screenShakeAmount;
            const shakeY = (Math.random() - 0.5) * screenShakeAmount;
            ctx.translate(shakeX, shakeY);
            screenShakeAmount *= screenShakeDecay;
        } else {
            screenShakeAmount = 0;
        }
    }

    // ── Main Game Loop ──
    function gameLoop(timestamp) {
        deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;
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

                // Update
                updatePlayer();
                updateBullets();
                updateEnemies();
                updateParticles();
                updateExplosions();
                updatePowerups();
                updateTextPopups();
                checkCollisions();

                // Check wave completion
                if (waveSpawned && enemies.length === 0 && gameState === STATE.PLAYING) {
                    wave++;
                    waveSpawned = false;
                    gameState = STATE.WAVE_ANNOUNCE;
                    waveTimer = 120;
                }

                // Wave announce timer
                if (gameState === STATE.WAVE_ANNOUNCE) {
                    waveTimer--;
                    if (waveTimer <= 0) {
                        gameState = STATE.PLAYING;
                        spawnWave(wave);
                    }
                }

                // Boss warning timer
                if (gameState === STATE.BOSS_WARNING) {
                    bossWarningTimer--;
                    if (bossWarningTimer <= 0 && bossWarningTimer > -10) {
                        gameState = STATE.PLAYING;
                    }
                }

                // Draw
                drawPowerups();
                for (const e of enemies) drawEnemy(e);
                drawPlayer();
                drawBullets();
                drawParticles();
                drawExplosions();
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
                drawParticles();
                drawExplosions();
                drawGameOverScreen();
                break;
        }

        ctx.restore();

        requestAnimationFrame(gameLoop);
    }

    // ── Start ──
    requestAnimationFrame(gameLoop);

})();
