(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      backgroundColor: {
        light: '#ffffff',
        dark: '#000000'
      },
      pixelSize: 4,
      isometric: {
        angle: 30 * Math.PI / 180,
        tileSize: 40
      }
    },
    car: {
      width: 24,
      height: 16,
      depth: 12,
      speed: 0,
      maxSpeed: 4,
      acceleration: 0.2,
      brakeForce: 0.3,
      friction: 0.92,
      turnSpeed: 0.08,
      color: '#000000',
      // Transmission
      gears: [2.8, 2.0, 1.4, 1.0, 0.75],
      gearShiftSpeed: 0.15,
      maxRpm: 6000,
      idleRpm: 800
    },
    effects: {
      skidMarkOpacity: 0.3,
      skidMarkFadeSpeed: 0.98,
      particleLife: 30,
      maxParticles: 50
    }
  };

  // Game state
  let canvas, ctx, audioCtx;
  let gameState = 'exploring';
  let car = {
    x: -200,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    speed: 0,
    isDrifting: false,
    collisionCount: 0,
    isAccelerating: false,
    isBraking: false,
    isStarMode: false,
    // Transmission
    gear: 0,
    rpm: 0,
    targetRpm: 0
  };
  let goal = { x: 300, y: 0, reached: false };
  let obstacles = [];
  let particles = [];
  let skidMarks = [];
  let keys = {};
  let touch = { active: false, x: 0, y: 0 };
  let sounds = {};
  let isMuted = false;
  let engineOscillator = null;
  let engineGainNode = null;
  let steeringRotation = 0;
  let isMobile = false;
  let isDarkMode = true;

  // Convert world coordinates to isometric screen coordinates
  function worldToIsometric(x, y, z = 0) {
    const isoX = (x - y) * Math.cos(CONFIG.canvas.isometric.angle);
    const isoY = (x + y) * Math.sin(CONFIG.canvas.isometric.angle) - z;
    return {
      x: isoX + canvas.width / 2,
      y: isoY + canvas.height / 2 - 100
    };
  }

  // Initialize audio context and sounds
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    engineOscillator = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    engineOscillator.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    engineOscillator.type = 'sawtooth';
    engineOscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
    engineGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOscillator.start();

    sounds = {
      collision: () => playTone(200, 0.1, 'square', 0.3),
      skid: () => playNoise(0.05, 0.2),
      success: () => {
        playTone(523, 0.1, 'sine', 0.3);
        setTimeout(() => playTone(659, 0.1, 'sine', 0.3), 100);
        setTimeout(() => playTone(784, 0.2, 'sine', 0.3), 200);
      },
      obstacleAppear: () => playTone(400, 0.1, 'sine', 0.1),
      buttonClick: () => playTone(600, 0.05, 'sine', 0.2),
      honk: () => {
        playTone(300, 0.15, 'sawtooth', 0.4);
        setTimeout(() => playTone(250, 0.15, 'sawtooth', 0.4), 50);
      },
      powerUp: () => {
        for (let i = 0; i < 8; i++) {
          setTimeout(() => playTone(400 + i * 100, 0.1, 'sine', 0.3), i * 50);
        }
      }
    };
  }

  function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (isMuted || !audioCtx) return;
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
  }

  function playNoise(duration, volume = 0.3) {
    if (isMuted || !audioCtx) return;
    
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    noise.start();
  }

  function updateTransmission() {
    const speedRatio = car.speed / CONFIG.car.maxSpeed;
    
    // Automatic gear selection based on speed
    let targetGear = 0;
    if (speedRatio > 0.15) targetGear = 1;
    if (speedRatio > 0.35) targetGear = 2;
    if (speedRatio > 0.55) targetGear = 3;
    if (speedRatio > 0.75) targetGear = 4;
    
    // Smooth gear changes
    if (targetGear !== Math.floor(car.gear)) {
      const oldGear = Math.floor(car.gear);
      car.gear += (targetGear - car.gear) * CONFIG.car.gearShiftSpeed;
      
      // Gear shift sound effect
      if (Math.floor(car.gear) !== oldGear && car.isAccelerating) {
        // Brief RPM drop during shift
        car.rpm *= 0.7;
        playTone(150, 0.05, 'sine', 0.2); // Shift click sound
      }
    }
    
    // Calculate RPM based on speed and gear ratio
    const currentGear = Math.max(0, Math.min(CONFIG.car.gears.length - 1, Math.floor(car.gear)));
    const gearRatio = CONFIG.car.gears[currentGear];
    
    // Target RPM based on speed within current gear
    const gearSpeedRange = CONFIG.car.maxSpeed / CONFIG.car.gears.length;
    const speedInGear = (car.speed % gearSpeedRange) / gearSpeedRange;
    car.targetRpm = CONFIG.car.idleRpm + (speedInGear * (CONFIG.car.maxRpm - CONFIG.car.idleRpm));
    
    // Apply gear ratio multiplier
    car.targetRpm *= gearRatio;
    
    // Smooth RPM changes
    car.rpm += (car.targetRpm - car.rpm) * 0.3;
    
    // Rev limiter
    if (car.rpm > CONFIG.car.maxRpm) {
      car.rpm = CONFIG.car.maxRpm;
      // Bouncing off rev limiter sound
      if (Math.random() < 0.1) {
        playTone(800, 0.02, 'sawtooth', 0.1);
      }
    }
  }

  function updateEngineSound() {
    if (!engineOscillator || !engineGainNode || isMuted) return;
    
    // Base frequency from RPM (more realistic range)
    const baseFreq = 80 + (car.rpm / CONFIG.car.maxRpm) * 320;
    
    // Add harmonic richness based on load
    const loadFactor = car.isAccelerating ? 1.2 : 0.8;
    
    // Add slight vibrato for realism
    const vibrato = Math.sin(Date.now() / 50) * 5;
    
    engineOscillator.frequency.setTargetAtTime(
      baseFreq * loadFactor + vibrato,
      audioCtx.currentTime,
      0.05
    );
    
    // Volume based on RPM and throttle
    const baseVolume = 0.05 + (car.rpm / CONFIG.car.maxRpm) * 0.1;
    const throttleBoost = car.isAccelerating ? 1.5 : 1.0;
    
    engineGainNode.gain.setTargetAtTime(
      baseVolume * throttleBoost,
      audioCtx.currentTime,
      0.05
    );
  }

  // Initialize canvas
  function init() {
    canvas = document.getElementById('carGameCanvas');
    ctx = canvas.getContext('2d');
    
    // Enable pixelated rendering
    ctx.imageSmoothingEnabled = false;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.imageRendering = 'crisp-edges';
    
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                ('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0);
    
    isDarkMode = true;
    
    document.body.classList.add('game-active');
    
    resizeCanvas();
    
    canvas.addEventListener('click', () => {
      if (!audioCtx) initAudio();
    });
    
    const preventDefaultKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '];
    
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (preventDefaultKeys.includes(key)) {
        e.preventDefault();
      }
      
      keys[key] = true;
      if (!audioCtx) initAudio();
      
      if (key === 'h' || e.key === ' ') {
        e.preventDefault();
        sounds.honk && sounds.honk();
      }
      if (e.key === 'Escape') {
        skipGame();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      keys[key] = false;
    });
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    window.addEventListener('resize', resizeCanvas);
    
    setupMobileControls();
    setupGameControls();
    
    gameLoop();
  }

  function resizeCanvas() {
    const scale = CONFIG.canvas.pixelSize;
    canvas.width = Math.floor(window.innerWidth / scale) * scale;
    canvas.height = Math.floor(window.innerHeight / scale) * scale;
    
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  function handleTouchStart(e) {
    e.preventDefault();
    touch.active = true;
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (!touch.active) return;
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    touch.active = false;
  }

  function handleMouseDown(e) {
    touch.active = true;
    touch.x = e.clientX;
    touch.y = e.clientY;
  }

  function handleMouseMove(e) {
    if (!touch.active) return;
    touch.x = e.clientX;
    touch.y = e.clientY;
  }

  function handleMouseUp(e) {
    touch.active = false;
  }

  // Update car physics
  function updateCar() {
    let throttle = 0;
    let steering = 0;
    
    if (keys['arrowup'] || keys['w']) {
      throttle = 1;
      car.isAccelerating = true;
    } else {
      car.isAccelerating = false;
    }
    
    if (keys['arrowdown'] || keys['s']) {
      throttle = -1;
      car.isBraking = true;
    } else {
      car.isBraking = false;
    }
    
    if (keys['arrowleft'] || keys['a']) steering = -1;
    if (keys['arrowright'] || keys['d']) steering = 1;
    
    if (isMobile) {
      if (car.isAccelerating) throttle = 1;
      if (car.isBraking) throttle = -1;
      
      if (steeringRotation !== 0) {
        steering = Math.sin(steeringRotation) * 1.5;
      }
    }
    
    if (touch.active) {
      const dx = touch.x - canvas.width/2;
      const dy = touch.y - canvas.height/2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 20) {
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - car.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        steering = Math.max(-1, Math.min(1, angleDiff * 2));
        throttle = 1;
      }
    }
    
    if (throttle > 0) {
      car.speed += throttle * CONFIG.car.acceleration;
    } else if (throttle < 0) {
      car.speed -= CONFIG.car.brakeForce;
    }
    
    car.speed *= CONFIG.car.friction;
    car.speed = Math.max(0, Math.min(CONFIG.car.maxSpeed, car.speed));
    
    if (Math.abs(car.speed) > 0.1) {
      const steerAngle = steering * CONFIG.car.turnSpeed * (car.speed / CONFIG.car.maxSpeed);
      car.angle += steerAngle;
    }
    
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    
    car.x += car.vx;
    car.y += car.vy;
    
    const lateralVelocity = Math.abs(Math.sin(car.angle) * car.vx - Math.cos(car.angle) * car.vy);
    car.isDrifting = lateralVelocity > 1;
    
    if (car.isDrifting && car.speed > 1) {
      skidMarks.push({
        x: car.x - Math.cos(car.angle) * 10,
        y: car.y - Math.sin(car.angle) * 10,
        opacity: CONFIG.effects.skidMarkOpacity * (car.speed / CONFIG.car.maxSpeed)
      });
      
      if (Math.random() < 0.1) sounds.skid();
    }
    
    updateTransmission();
    updateEngineSound();
    checkGameStateTransitions();
    
    if (!car.isStarMode) {
      checkCollisions();
    }
    
    checkGoal();
  }

  function checkGameStateTransitions() {
    if (gameState === 'exploring' && car.collisionCount >= 1) {
      gameState = 'browser-country';
      spawnObstacles();
      
      const messageEl = document.getElementById('gameMessage');
      messageEl.textContent = 'The distractions are everywhere!';
      messageEl.style.display = 'block';
      messageEl.style.opacity = '1';
      setTimeout(() => {
        messageEl.style.opacity = '0';
        setTimeout(() => messageEl.style.display = 'none', 500);
      }, 3000);
    }
    
    if (gameState === 'browser-country' && car.collisionCount >= 3) {
      gameState = 'struggle';
    }
    
    if (gameState === 'struggle' && car.collisionCount >= 5) {
      gameState = 'detour-available';
      showDetourPowerup();
    }
  }

  function checkCollisions() {
    for (let obstacle of obstacles) {
      const dx = car.x - obstacle.x;
      const dy = car.y - obstacle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 40) {
        car.vx *= -1.5;
        car.vy *= -1.5;
        car.speed *= -0.5;
        car.collisionCount++;
        
        createCollisionParticles(car.x, car.y);
        sounds.collision();
      }
    }
  }

  function checkGoal() {
    const dx = car.x - goal.x;
    const dy = car.y - goal.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 30 && gameState !== 'won') {
      gameState = 'won';
      goal.reached = true;
      sounds.success();
      showWinMessage();
    }
  }

  function spawnObstacles() {
    const sites = [
      { name: 'YT', color: '#000000' },
      { name: 'TW', color: '#000000' },
      { name: 'RD', color: '#000000' },
      { name: 'TK', color: '#000000' },
      { name: 'IG', color: '#000000' }
    ];
    
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 100 + Math.random() * 150;
      obstacles.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        site: sites[Math.floor(Math.random() * sites.length)],
        scale: 0,
        targetScale: 1,
        wobbleOffset: Math.random() * Math.PI * 2
      });
    }
    
    obstacles.forEach((_, i) => {
      setTimeout(() => sounds.obstacleAppear && sounds.obstacleAppear(), i * 50);
    });
  }

  function createCollisionParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: x,
        y: y,
        z: 0,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        vz: -2,
        life: CONFIG.effects.particleLife,
        color: '#000000'
      });
    }
  }

  function showDetourPowerup() {
    const powerup = document.getElementById('detourPowerup');
    powerup.style.display = 'block';
    
    const activateBtn = document.getElementById('activateDetour');
    activateBtn.addEventListener('click', activateDetour);
  }

  function activateDetour() {
    sounds.powerUp && sounds.powerUp();
    gameState = 'star-mode';
    car.isStarMode = true;
    
    const powerup = document.getElementById('detourPowerup');
    powerup.style.display = 'none';
    
    document.getElementById('carGameContainer').classList.add('star-mode');
    
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: car.x,
        y: car.y,
        z: 10,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        vz: -3,
        life: 60,
        color: '#000000'
      });
    }
  }

  function showWinMessage() {
    setTimeout(() => {
      const messageEl = document.getElementById('gameMessage');
      messageEl.textContent = 'With Detour, reaching your content is this easy!';
      messageEl.style.display = 'block';
      messageEl.style.opacity = '1';
      
      setTimeout(() => {
        const gameContainer = document.getElementById('carGameContainer');
        
        gameContainer.style.opacity = '0';
        setTimeout(() => {
          gameContainer.style.display = 'none';
          document.body.classList.remove('game-active');
          window.scrollTo(0, 0);
        }, 1000);
      }, 3000);
    }, 500);
  }

  function updateEffects() {
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vz = (p.vz || 0) + 0.3;
      p.z = (p.z || 0) + (p.vz || 0);
      if (p.z > 0) p.z = 0;
      p.life--;
      
      return p.life > 0;
    });
    
    if (car.isStarMode && car.speed > 1) {
      particles.push({
        x: car.x - Math.cos(car.angle) * 15,
        y: car.y - Math.sin(car.angle) * 15,
        z: 5,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        vz: -1,
        life: 30,
        color: '#000000'
      });
    }
    
    skidMarks = skidMarks.filter(mark => {
      mark.opacity *= CONFIG.effects.skidMarkFadeSpeed;
      return mark.opacity > 0.01;
    });
    
    obstacles.forEach(o => {
      if (o.scale < o.targetScale) {
        o.scale += 0.05;
      }
      o.wobbleOffset += 0.05;
    });
  }

  // Main game loop
  function gameLoop() {
    ctx.fillStyle = CONFIG.canvas.backgroundColor[isDarkMode ? 'dark' : 'light'];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    const scale = CONFIG.canvas.pixelSize;
    ctx.scale(scale, scale);
    
    drawIsometricGrid();
    drawSkidMarks();
    drawGoal();
    drawObstacles();
    drawCar();
    drawParticles();
    
    ctx.restore();
    
    drawUI();
    
    updateCar();
    updateEffects();
    
    requestAnimationFrame(gameLoop);
  }

  function drawIsometricGrid() {
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5;
    
    const tileSize = CONFIG.canvas.isometric.tileSize;
    const gridWidth = 20;
    const gridHeight = 20;
    
    for (let x = -gridWidth/2; x <= gridWidth/2; x++) {
      for (let y = -gridHeight/2; y <= gridHeight/2; y++) {
        const p1 = worldToIsometric(x * tileSize, y * tileSize);
        const p2 = worldToIsometric((x + 1) * tileSize, y * tileSize);
        const p3 = worldToIsometric((x + 1) * tileSize, (y + 1) * tileSize);
        const p4 = worldToIsometric(x * tileSize, (y + 1) * tileSize);
        
        ctx.beginPath();
        ctx.moveTo(p1.x / CONFIG.canvas.pixelSize, p1.y / CONFIG.canvas.pixelSize);
        ctx.lineTo(p2.x / CONFIG.canvas.pixelSize, p2.y / CONFIG.canvas.pixelSize);
        ctx.lineTo(p3.x / CONFIG.canvas.pixelSize, p3.y / CONFIG.canvas.pixelSize);
        ctx.lineTo(p4.x / CONFIG.canvas.pixelSize, p4.y / CONFIG.canvas.pixelSize);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  function drawSkidMarks() {
    const scale = CONFIG.canvas.pixelSize;
    
    skidMarks.forEach(mark => {
      const markIso = worldToIsometric(mark.x, mark.y, 0);
      ctx.fillStyle = `rgba(0, 0, 0, ${mark.opacity})`;
      ctx.fillRect(
        (markIso.x - 4) / scale,
        (markIso.y - 2) / scale,
        8 / scale,
        4 / scale
      );
    });
  }

  function drawCar() {
    const carIso = worldToIsometric(car.x, car.y, car.z);
    const scale = CONFIG.canvas.pixelSize;
    
    if (!car.isAirborne || car.z < 50) {
      const shadowScale = car.isAirborne ? Math.max(0.5, 1 - car.z / 100) : 1;
      const shadowIso = worldToIsometric(car.x, car.y, 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      const shadowSize = 16 * shadowScale;
      ctx.fillRect(
        (shadowIso.x - shadowSize/2) / scale,
        (shadowIso.y - shadowSize/4) / scale,
        shadowSize / scale,
        shadowSize/2 / scale
      );
    }
    
    const carWidth = CONFIG.car.width;
    const carHeight = CONFIG.car.height;
    const carDepth = CONFIG.car.depth;
    
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    
    const vertices = [
      { x: -carWidth/2 * cos - carHeight/2 * sin, y: -carWidth/2 * sin + carHeight/2 * cos, z: 0 },
      { x: carWidth/2 * cos - carHeight/2 * sin, y: carWidth/2 * sin + carHeight/2 * cos, z: 0 },
      { x: carWidth/2 * cos + carHeight/2 * sin, y: carWidth/2 * sin - carHeight/2 * cos, z: 0 },
      { x: -carWidth/2 * cos + carHeight/2 * sin, y: -carWidth/2 * sin - carHeight/2 * cos, z: 0 }
    ];
    
    ctx.fillStyle = car.isStarMode ? '#ffffff' : '#000000';
    ctx.strokeStyle = car.isStarMode ? '#000000' : '#ffffff';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    vertices.forEach((v, i) => {
      const p = worldToIsometric(car.x + v.x, car.y + v.y, car.z + carDepth);
      if (i === 0) ctx.moveTo(p.x / scale, p.y / scale);
      else ctx.lineTo(p.x / scale, p.y / scale);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    if (car.angle > -Math.PI/2 && car.angle < Math.PI/2) {
      const p1 = worldToIsometric(car.x + vertices[1].x, car.y + vertices[1].y, car.z);
      const p2 = worldToIsometric(car.x + vertices[2].x, car.y + vertices[2].y, car.z);
      const p3 = worldToIsometric(car.x + vertices[2].x, car.y + vertices[2].y, car.z + carDepth);
      const p4 = worldToIsometric(car.x + vertices[1].x, car.y + vertices[1].y, car.z + carDepth);
      
      ctx.fillStyle = '#666666';
      ctx.beginPath();
      ctx.moveTo(p1.x / scale, p1.y / scale);
      ctx.lineTo(p2.x / scale, p2.y / scale);
      ctx.lineTo(p3.x / scale, p3.y / scale);
      ctx.lineTo(p4.x / scale, p4.y / scale);
      ctx.closePath();
      ctx.fill();
    }
    
    const windshieldPos = worldToIsometric(car.x, car.y, car.z + carDepth);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      (windshieldPos.x - 2) / scale,
      (windshieldPos.y - 2) / scale,
      4 / scale,
      4 / scale
    );
  }

  function drawGoal() {
    const goalIso = worldToIsometric(goal.x, goal.y, 20);
    const scale = CONFIG.canvas.pixelSize;
    const pulseScale = 1 + Math.sin(Date.now() / 500) * 0.1;
    
    const size = 40 * pulseScale;
    const height = 20;
    
    const p1 = worldToIsometric(goal.x - size/2, goal.y - size/2, height);
    const p2 = worldToIsometric(goal.x + size/2, goal.y - size/2, height);
    const p3 = worldToIsometric(goal.x + size/2, goal.y + size/2, height);
    const p4 = worldToIsometric(goal.x - size/2, goal.y + size/2, height);
    
    ctx.fillStyle = goal.reached ? '#ffffff' : '#000000';
    ctx.strokeStyle = goal.reached ? '#000000' : '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(p1.x / scale, p1.y / scale);
    ctx.lineTo(p2.x / scale, p2.y / scale);
    ctx.lineTo(p3.x / scale, p3.y / scale);
    ctx.lineTo(p4.x / scale, p4.y / scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    const b1 = worldToIsometric(goal.x - size/2, goal.y - size/2, 0);
    const b2 = worldToIsometric(goal.x + size/2, goal.y - size/2, 0);
    
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.moveTo(p1.x / scale, p1.y / scale);
    ctx.lineTo(p2.x / scale, p2.y / scale);
    ctx.lineTo(b2.x / scale, b2.y / scale);
    ctx.lineTo(b1.x / scale, b1.y / scale);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = goal.reached ? '#000000' : '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTENT', goalIso.x / scale, goalIso.y / scale);
  }

  function drawObstacles() {
    const scale = CONFIG.canvas.pixelSize;
    
    obstacles.forEach(obstacle => {
      const wobble = Math.sin(obstacle.wobbleOffset) * 5;
      const obsIso = worldToIsometric(obstacle.x + wobble, obstacle.y, 0);
      
      const size = 30 * obstacle.scale;
      const height = 40 * obstacle.scale;
      
      const p1 = worldToIsometric(obstacle.x - size/2, obstacle.y - size/2, height);
      const p2 = worldToIsometric(obstacle.x + size/2, obstacle.y - size/2, height);
      const p3 = worldToIsometric(obstacle.x + size/2, obstacle.y + size/2, height);
      const p4 = worldToIsometric(obstacle.x - size/2, obstacle.y + size/2, height);
      
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(p1.x / scale, p1.y / scale);
      ctx.lineTo(p2.x / scale, p2.y / scale);
      ctx.lineTo(p3.x / scale, p3.y / scale);
      ctx.lineTo(p4.x / scale, p4.y / scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      const b1 = worldToIsometric(obstacle.x - size/2, obstacle.y - size/2, 0);
      const b2 = worldToIsometric(obstacle.x + size/2, obstacle.y - size/2, 0);
      
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.moveTo(p1.x / scale, p1.y / scale);
      ctx.lineTo(p2.x / scale, p2.y / scale);
      ctx.lineTo(b2.x / scale, b2.y / scale);
      ctx.lineTo(b1.x / scale, b1.y / scale);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(obstacle.site.name, obsIso.x / scale, obsIso.y / scale - height/2/scale);
    });
  }

  function drawParticles() {
    const scale = CONFIG.canvas.pixelSize;
    
    particles.forEach(p => {
      const pIso = worldToIsometric(p.x, p.y, p.z || 0);
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = p.life / CONFIG.effects.particleLife;
      ctx.fillRect(
        (pIso.x - 2) / scale,
        (pIso.y - 2) / scale,
        4 / scale,
        4 / scale
      );
    });
    ctx.globalAlpha = 1;
  }

  function drawUI() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 200, 120);
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    
    if (gameState === 'exploring' || gameState === 'browser-country') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(isMobile ? 'Touch to drive' : 'WASD/Arrows • H=honk • ESC=skip', 20, canvas.height - 15);
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    const speedKmh = Math.round(car.speed * 20);
    ctx.fillText(`${speedKmh} km/h`, 20, 30);
    
    // Gear and RPM display
    ctx.font = '12px monospace';
    ctx.fillText(`Gear ${Math.floor(car.gear) + 1}`, 20, 50);
    ctx.fillText(`${Math.round(car.rpm)} RPM`, 20, 70);
    
    // RPM bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(20, 80, 160, 8);
    
    // RPM fill (red line at 5500)
    const rpmRatio = car.rpm / CONFIG.car.maxRpm;
    ctx.fillStyle = rpmRatio > 0.9 ? '#ff6666' : '#ffffff';
    ctx.fillRect(20, 80, 160 * rpmRatio, 8);
    
    if (gameState === 'browser-country' || gameState === 'struggle' || gameState === 'detour-available') {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(`Hits: ${car.collisionCount}`, 20, 105);
    }
  }

  function setupMobileControls() {
    if (!isMobile) return;
    
    const wheel = document.getElementById('steeringWheel');
    const horn = wheel.querySelector('.steering-center');
    let wheelActive = false;
    let startAngle = 0;
    
    wheel.addEventListener('touchstart', (e) => {
      e.preventDefault();
      wheelActive = true;
      wheel.classList.add('active');
      const touch = e.touches[0];
      const rect = wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      startAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
    });
    
    wheel.addEventListener('touchmove', (e) => {
      if (!wheelActive) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const currentAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
      let rotation = currentAngle - startAngle;
      
      rotation = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotation));
      steeringRotation = rotation;
      wheel.style.transform = `rotate(${rotation}rad)`;
    });
    
    wheel.addEventListener('touchend', () => {
      wheelActive = false;
      wheel.classList.remove('active');
      steeringRotation = 0;
      wheel.style.transform = 'rotate(0)';
    });
    
    horn.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.honk && sounds.honk();
    });
    
    const gasPedal = document.getElementById('gasPedal');
    const brakePedal = document.getElementById('brakePedal');
    
    gasPedal.addEventListener('touchstart', (e) => {
      e.preventDefault();
      car.isAccelerating = true;
    });
    
    gasPedal.addEventListener('touchend', (e) => {
      e.preventDefault();
      car.isAccelerating = false;
    });
    
    brakePedal.addEventListener('touchstart', (e) => {
      e.preventDefault();
      car.isBraking = true;
    });
    
    brakePedal.addEventListener('touchend', (e) => {
      e.preventDefault();
      car.isBraking = false;
    });
  }
  
  function setupGameControls() {
    const muteBtn = document.getElementById('muteButton');
    muteBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      muteBtn.textContent = isMuted ? '🔇' : '🔊';
      if (engineGainNode) {
        engineGainNode.gain.setValueAtTime(isMuted ? 0 : 0.15, audioCtx.currentTime);
      }
    });
    
    const skipBtn = document.getElementById('skipButton');
    skipBtn.addEventListener('click', skipGame);
  }
  
  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      document.body.classList.remove('game-active');
      window.scrollTo(0, 0);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();