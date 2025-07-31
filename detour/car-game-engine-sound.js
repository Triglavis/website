(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      pixelSize: 4,
      gridSize: 8,
      colors: {
        bg: '#000000',
        fg: '#ffffff'
      }
    },
    car: {
      size: 3,
      maxSpeed: 0.4,
      acceleration: 0.03,
      friction: 0.92,
      turnSpeed: 0.15,
      // Transmission
      gears: [3.0, 2.2, 1.6, 1.2, 0.9],
      maxRpm: 800,
      idleRpm: 100,
      baseFreq: 40 // Very deep starting tone (40Hz)
    },
    effects: {
      particleSymbols: ['!', '#', '*', '×', '@', '%', '&', '~', '^', '¤', '§', '†'],
      scanlineOpacity: 0.05,
      distortionAmount: 0
    }
  };

  // Game state
  let canvas, ctx, audioCtx;
  let gameState = 'exploring';
  let gridWidth, gridHeight;
  let engineOscillator = null;
  let engineGainNode = null;
  let car = {
    x: 10,
    y: 20,
    vx: 0,
    vy: 0,
    angle: 0,
    targetAngle: 0,
    facing: 'right',
    collisions: 0,
    trail: [],
    isDrifting: false,
    // Transmission
    speed: 0,
    gear: 0,
    rpm: 100,
    targetRpm: 100,
    isAccelerating: false
  };
  let goal = {
    x: 60,
    y: 20,
    symbol: '◊',
    reached: false
  };
  let obstacles = [];
  let particles = [];
  let keys = {};
  let sounds = {};
  let isMuted = false;
  let frame = 0;

  // Initialize audio
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create engine sound
    engineOscillator = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    
    engineOscillator.type = 'sawtooth';
    engineOscillator.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    
    engineOscillator.frequency.setValueAtTime(CONFIG.car.baseFreq, audioCtx.currentTime);
    engineGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOscillator.start();
    
    sounds = {
      collision: () => playTone(100, 0.1, 'sawtooth', 0.2),
      collect: () => {
        playTone(400, 0.05, 'square', 0.2);
        setTimeout(() => playTone(600, 0.05, 'square', 0.2), 50);
        setTimeout(() => playTone(800, 0.1, 'square', 0.2), 100);
      },
      powerup: () => {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => playTone(300 + i * 100, 0.05, 'square', 0.15), i * 30);
        }
      },
      gearShift: () => playTone(150, 0.03, 'sine', 0.15)
    };
  }

  function playTone(frequency, duration, type = 'square', volume = 0.1) {
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

  // Transmission system
  function updateTransmission() {
    const speedRatio = car.speed / CONFIG.car.maxSpeed;
    
    // Calculate target gear
    let targetGear = 0;
    if (speedRatio > 0.15) targetGear = 1;
    if (speedRatio > 0.35) targetGear = 2;
    if (speedRatio > 0.55) targetGear = 3;
    if (speedRatio > 0.75) targetGear = 4;
    
    // Gear change
    if (targetGear !== car.gear && car.isAccelerating) {
      car.gear = targetGear;
      car.rpm = CONFIG.car.idleRpm; // Drop RPM on shift
      sounds.gearShift && sounds.gearShift();
    }
    
    // Calculate RPM within current gear
    const gearRange = 1.0 / CONFIG.car.gears.length;
    const speedInGear = (speedRatio % gearRange) / gearRange;
    car.targetRpm = CONFIG.car.idleRpm + (speedInGear * (CONFIG.car.maxRpm - CONFIG.car.idleRpm));
    
    // Smooth RPM changes
    car.rpm += (car.targetRpm - car.rpm) * 0.3;
  }
  
  function updateEngineSound() {
    if (!engineOscillator || !engineGainNode || isMuted) return;
    
    // Base frequency increases with each gear (octave jumps)
    const gearMultiplier = Math.pow(2, car.gear); // 2^gear = octave multiplier
    const baseFreq = CONFIG.car.baseFreq * gearMultiplier;
    
    // Frequency climbs with RPM within the gear
    const rpmRatio = car.rpm / CONFIG.car.maxRpm;
    const targetFreq = baseFreq + (baseFreq * rpmRatio); // Doubles frequency at max RPM
    
    // Apply frequency
    engineOscillator.frequency.setTargetAtTime(
      targetFreq,
      audioCtx.currentTime,
      0.05
    );
    
    // Volume based on acceleration
    const targetVolume = car.isAccelerating ? 0.15 : 0.05;
    engineGainNode.gain.setTargetAtTime(
      targetVolume * (0.5 + car.speed / CONFIG.car.maxSpeed * 0.5),
      audioCtx.currentTime,
      0.1
    );
  }

  // Initialize canvas
  function init() {
    canvas = document.getElementById('carGameCanvas');
    ctx = canvas.getContext('2d');
    
    ctx.imageSmoothingEnabled = false;
    canvas.style.imageRendering = 'pixelated';
    
    document.body.classList.add('game-active');
    
    resizeCanvas();
    
    canvas.addEventListener('click', () => {
      if (!audioCtx) initAudio();
    });
    
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (!audioCtx) initAudio();
      
      if (e.key === 'Escape') {
        skipGame();
      }
      
      // Prevent arrow key scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    
    window.addEventListener('resize', resizeCanvas);
    
    setupGameControls();
    spawnObstacles();
    
    gameLoop();
  }

  function resizeCanvas() {
    const scale = CONFIG.canvas.pixelSize;
    const size = CONFIG.canvas.gridSize;
    
    gridWidth = Math.floor(window.innerWidth / (scale * size));
    gridHeight = Math.floor(window.innerHeight / (scale * size));
    
    canvas.width = gridWidth * size;
    canvas.height = gridHeight * size;
    
    canvas.style.width = (canvas.width * scale) + 'px';
    canvas.style.height = (canvas.height * scale) + 'px';
    
    // Update goal position
    goal.x = Math.min(goal.x, gridWidth - 2);
    goal.y = Math.min(goal.y, gridHeight - 2);
  }

  // Update game logic
  function update() {
    const oldX = Math.floor(car.x);
    const oldY = Math.floor(car.y);
    
    // Handle input - relative to car
    let throttle = 0;
    let steering = 0;
    
    if (keys['arrowup'] || keys['w']) {
      throttle = 1;
    }
    if (keys['arrowdown'] || keys['s']) {
      throttle = -0.5;
    }
    if (keys['arrowleft'] || keys['a']) {
      steering = -1;
    }
    if (keys['arrowright'] || keys['d']) {
      steering = 1;
    }
    
    // Update car physics
    if (throttle !== 0) {
      const accel = throttle * CONFIG.car.acceleration;
      car.vx += Math.cos(car.angle) * accel;
      car.vy += Math.sin(car.angle) * accel;
      car.isAccelerating = throttle > 0;
    } else {
      car.isAccelerating = false;
    }
    
    // Steering affects angle based on speed
    const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    if (speed > 0.1) {
      car.targetAngle += steering * CONFIG.car.turnSpeed * (speed / CONFIG.car.maxSpeed);
    }
    
    // Smooth angle rotation
    let diff = car.targetAngle - car.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    car.angle += diff * 0.2;
    
    // Update facing direction
    const angleDegs = (car.angle * 180 / Math.PI + 360) % 360;
    if (angleDegs >= 315 || angleDegs < 45) car.facing = 'right';
    else if (angleDegs >= 45 && angleDegs < 135) car.facing = 'down';
    else if (angleDegs >= 135 && angleDegs < 225) car.facing = 'left';
    else car.facing = 'up';
    
    // Apply friction
    car.vx *= CONFIG.car.friction;
    car.vy *= CONFIG.car.friction;
    
    // Calculate speed
    car.speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    if (car.speed > CONFIG.car.maxSpeed) {
      car.vx = (car.vx / car.speed) * CONFIG.car.maxSpeed;
      car.vy = (car.vy / car.speed) * CONFIG.car.maxSpeed;
      car.speed = CONFIG.car.maxSpeed;
    }
    
    // Update transmission
    updateTransmission();
    updateEngineSound();
    
    // Update position
    car.x += car.vx;
    car.y += car.vy;
    
    // Keep in bounds
    car.x = Math.max(1, Math.min(gridWidth - 2, car.x));
    car.y = Math.max(1, Math.min(gridHeight - 2, car.y));
    
    // Check if moved to new grid cell
    const newX = Math.floor(car.x);
    const newY = Math.floor(car.y);
    
    if (newX !== oldX || newY !== oldY) {
      // Add to trail
      car.trail.push({ x: oldX, y: oldY, life: car.isDrifting ? 30 : 15 });
      if (car.trail.length > 40) car.trail.shift();
    }
    
    // Update trail
    car.trail = car.trail.filter(t => {
      t.life--;
      return t.life > 0;
    });
    
    // Check if drifting
    const lateralVelocity = Math.abs(Math.sin(car.angle) * car.vx - Math.cos(car.angle) * car.vy);
    car.isDrifting = lateralVelocity > 0.15;
    
    // Check collisions
    checkCollisions();
    
    // Check goal
    const goalDist = Math.abs(Math.floor(car.x) - goal.x) + Math.abs(Math.floor(car.y) - goal.y);
    if (goalDist < 2 && !goal.reached) {
      goal.reached = true;
      gameState = 'won';
      sounds.collect && sounds.collect();
      showWinMessage();
    }
    
    // Update particles
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02; // gravity
      p.vx *= 0.98; // air resistance
      p.life--;
      return p.life > 0;
    });
    
    // Update obstacles
    obstacles.forEach(o => {
      o.phase = (o.phase + 0.05) % (Math.PI * 2);
      // Pulse effect
      o.scale = 1 + Math.sin(o.phase) * 0.2;
    });
    
    frame++;
  }

  function checkCollisions() {
    const carX = Math.floor(car.x);
    const carY = Math.floor(car.y);
    
    obstacles.forEach(obs => {
      if (carX === obs.x && carY === obs.y) {
        car.collisions++;
        car.vx *= -2;
        car.vy *= -2;
        sounds.collision && sounds.collision();
        
        // Create particles
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          particles.push({
            x: car.x,
            y: car.y,
            vx: Math.cos(angle) * 0.5,
            vy: Math.sin(angle) * 0.5,
            life: 30,
            symbol: CONFIG.effects.particleSymbols[Math.floor(Math.random() * CONFIG.effects.particleSymbols.length)]
          });
        }
        
        // Screen shake
        CONFIG.effects.distortionAmount = 0.1;
        
        // Remove obstacle
        obs.x = -100;
        
        // Check state transitions
        if (car.collisions >= 3 && gameState === 'exploring') {
          gameState = 'struggling';
          spawnMoreObstacles();
        }
        
        if (car.collisions >= 5 && gameState === 'struggling') {
          gameState = 'detour-available';
          showDetourPowerup();
        }
      }
    });
  }

  function spawnObstacles() {
    const symbols = ['♣', '♥', '♠', '♦'];
    
    for (let i = 0; i < 12; i++) {
      obstacles.push({
        x: Math.floor(Math.random() * (gridWidth - 20)) + 10,
        y: Math.floor(Math.random() * (gridHeight - 10)) + 5,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        phase: Math.random() * Math.PI * 2,
        scale: 1
      });
    }
  }
  
  function spawnMoreObstacles() {
    const symbols = ['YT', 'TW', 'RD', 'TK', 'IG'];
    
    for (let i = 0; i < 5; i++) {
      obstacles.push({
        x: Math.floor(Math.random() * (gridWidth - 10)) + 5,
        y: Math.floor(Math.random() * (gridHeight - 4)) + 2,
        symbol: symbols[i % symbols.length],
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function showDetourPowerup() {
    const powerup = document.getElementById('detourPowerup');
    powerup.style.display = 'block';
    powerup.style.background = '#000';
    powerup.style.border = '2px solid #fff';
    powerup.style.color = '#fff';
    
    const btn = document.getElementById('activateDetour');
    btn.style.background = '#fff';
    btn.style.color = '#000';
    btn.onclick = () => {
      sounds.powerup && sounds.powerup();
      gameState = 'powered';
      powerup.style.display = 'none';
      
      // Clear obstacles
      obstacles = [];
    };
  }

  function showWinMessage() {
    setTimeout(() => {
      const msg = document.getElementById('gameMessage');
      msg.textContent = 'CONTENT REACHED!';
      msg.style.display = 'block';
      msg.style.background = '#000';
      msg.style.color = '#fff';
      msg.style.border = '2px solid #fff';
      msg.style.fontFamily = 'monospace';
      msg.style.opacity = '1';
      
      setTimeout(() => {
        skipGame();
      }, 3000);
    }, 500);
  }

  // Main game loop
  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  function draw() {
    // Clear with black
    ctx.fillStyle = CONFIG.canvas.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Screen distortion on collision
    if (CONFIG.effects.distortionAmount > 0) {
      ctx.save();
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.rotate(Math.sin(frame * 0.5) * CONFIG.effects.distortionAmount);
      ctx.translate(-canvas.width/2, -canvas.height/2);
      CONFIG.effects.distortionAmount *= 0.9;
    }
    
    // CRT scanline effect
    ctx.strokeStyle = CONFIG.canvas.colors.fg;
    ctx.globalAlpha = CONFIG.effects.scanlineOpacity;
    ctx.lineWidth = 1;
    
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    // Draw trail
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${CONFIG.canvas.gridSize * 0.5}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const size = CONFIG.canvas.gridSize;
    
    car.trail.forEach((t, i) => {
      ctx.globalAlpha = (t.life / 30) * 0.5;
      const symbol = car.isDrifting && i % 2 === 0 ? '¨' : '·';
      ctx.fillText(symbol, t.x * size + size/2, t.y * size + size/2);
    });
    ctx.globalAlpha = 1;
    
    // Draw obstacles
    obstacles.forEach(obs => {
      if (obs.x < 0) return;
      
      const wobble = Math.sin(obs.phase) * 2;
      ctx.save();
      ctx.translate(obs.x * size + size/2, obs.y * size + size/2);
      ctx.scale(obs.scale || 1, obs.scale || 1);
      ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
      ctx.fillText(obs.symbol, 0, wobble);
      ctx.restore();
    });
    
    // Draw particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 20;
      ctx.font = `${CONFIG.canvas.gridSize * 0.6}px monospace`;
      ctx.fillText(
        p.symbol,
        p.x * size + size/2,
        p.y * size + size/2
      );
    });
    ctx.globalAlpha = 1;
    
    // Draw goal
    if (!goal.reached) {
      const pulse = Math.sin(frame * 0.1) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      ctx.font = `${CONFIG.canvas.gridSize}px monospace`;
      ctx.fillText(
        goal.symbol,
        goal.x * size + size/2,
        goal.y * size + size/2
      );
      ctx.globalAlpha = 1;
      
      // Goal label
      ctx.font = `${CONFIG.canvas.gridSize * 0.4}px monospace`;
      ctx.fillText('CONTENT', goal.x * size + size/2, (goal.y + 1.5) * size);
    }
    
    // Draw car as ASCII art
    drawCar(ctx, car.x * size, car.y * size, car.angle, car.isDrifting);
    
    // Draw UI
    drawUI();
    
    // Restore context if distorted
    if (CONFIG.effects.distortionAmount > 0.01) {
      ctx.restore();
    }
  }
  
  // Draw ASCII car
  function drawCar(ctx, x, y, angle, isDrifting) {
    ctx.save();
    ctx.translate(x + CONFIG.canvas.gridSize * 1.5, y + CONFIG.canvas.gridSize);
    ctx.rotate(angle);
    
    ctx.font = `${CONFIG.canvas.gridSize * 0.6}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Car body based on angle
    const carArt = [
      ['  o═o  ', '╔═╣ ╠═╗', '╚═o═o═╝'],  // Right
      ['╔═o═╗', '║ ╬ ║', '╚═o═╝'],       // Down
      ['╔═o═o═╗', '╚═╣ ╠═╝', '  o═o  '],  // Left  
      ['╔═o═╗', '║ ╬ ║', '╚═o═╝']        // Up
    ];
    
    const sprites = {
      'right': 0,
      'down': 1,
      'left': 2,
      'up': 3
    };
    
    const sprite = carArt[sprites[car.facing] || 0];
    
    // Draw car
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    sprite.forEach((line, i) => {
      ctx.fillText(line, 0, (i - 1) * CONFIG.canvas.gridSize * 0.5);
    });
    
    // Drift smoke
    if (isDrifting) {
      ctx.globalAlpha = 0.5;
      ctx.fillText('~', -CONFIG.canvas.gridSize, CONFIG.canvas.gridSize * 0.5);
      ctx.fillText('~', -CONFIG.canvas.gridSize * 0.5, CONFIG.canvas.gridSize * 0.7);
    }
    
    ctx.restore();
  }

  function drawUI() {
    const size = CONFIG.canvas.gridSize;
    
    // Top bar
    ctx.fillStyle = CONFIG.canvas.colors.bg;
    ctx.fillRect(0, 0, canvas.width, size * 2);
    
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${size * 0.8}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Stats
    ctx.fillText(`HITS: ${car.collisions}`, size, size * 0.5);
    ctx.fillText(`GEAR: ${car.gear + 1}`, size * 8, size * 0.5);
    ctx.fillText(`RPM: ${Math.round(car.rpm)}`, size * 15, size * 0.5);
    ctx.fillText(`STATE: ${gameState.toUpperCase()}`, size * 25, size * 0.5);
    
    // Instructions
    ctx.font = `${size * 0.5}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD/ARROWS • ESC=SKIP', canvas.width - size, size * 0.5);
    
    // Border
    ctx.strokeStyle = CONFIG.canvas.colors.fg;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  function setupGameControls() {
    const skipBtn = document.getElementById('skipButton');
    if (skipBtn) {
      skipBtn.style.background = '#000';
      skipBtn.style.color = '#fff';
      skipBtn.style.border = '1px solid #fff';
      skipBtn.style.fontFamily = 'monospace';
    }
    
    const muteBtn = document.getElementById('muteButton');
    if (muteBtn) {
      muteBtn.style.background = '#000';
      muteBtn.style.color = '#fff';
      muteBtn.style.border = '1px solid #fff';
      muteBtn.style.fontFamily = 'monospace';
      muteBtn.onclick = () => {
        isMuted = !isMuted;
        muteBtn.textContent = isMuted ? '[M]' : '[S]';
        
        if (engineGainNode) {
          engineGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        }
      };
    }
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

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();