(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      pixelSize: 1,
      gridSize: 16,
      colors: {
        bg: '#000000',
        fg: '#ffffff'
      }
    },
    car: {
      mass: 1200, // kg
      wheelRadius: 0.3, // meters
      dragCoefficient: 0.3,
      rollingResistance: 0.015,
      maxSteerAngle: 0.6, // radians
      
      // Engine specs
      idleRpm: 800,
      redlineRpm: 6500,
      maxTorqueRpm: 3500,
      maxTorque: 300, // Nm
      engineInertia: 0.2,
      
      // Transmission
      gearRatios: [0, 3.5, 2.5, 1.8, 1.3, 1.0], // 0 = neutral
      finalDriveRatio: 3.5,
      clutchEngageTime: 0.2,
      shiftTime: 0.1,
      
      // Sound
      baseFreqMultiplier: 0.5 // RPM to Hz conversion factor for deeper sound
    },
    physics: {
      gravity: 9.81,
      airDensity: 1.2,
      dt: 1/60 // 60 FPS physics
    }
  };

  // Game state
  let canvas, ctx, audioCtx;
  let gameState = 'exploring';
  let gridWidth, gridHeight;
  let engineOscillator = null;
  let engineGainNode = null;
  let exhaustOscillator = null;
  let exhaustGainNode = null;
  
  let car = {
    // Position
    x: 10,
    y: 20,
    angle: 0,
    
    // Velocity
    speed: 0, // m/s
    vx: 0,
    vy: 0,
    
    // Engine state
    engineRpm: 800,
    targetThrottle: 0,
    actualThrottle: 0,
    gear: 1,
    clutchEngagement: 1.0, // 1 = fully engaged, 0 = fully disengaged
    isShifting: false,
    shiftProgress: 0,
    nextGear: 1,
    
    // Physics state
    wheelRpm: 0,
    engineTorque: 0,
    wheelTorque: 0,
    engineBraking: false,
    wheelSlip: 0,
    
    // Visual state
    facing: 'right',
    trail: [],
    collisions: 0,
    
    // Rev limiter
    revLimiterActive: false,
    revLimiterCutoff: false
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
  let automaticTransmission = true;

  // Initialize audio
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Engine sound (main tone)
    engineOscillator = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    engineOscillator.type = 'sawtooth';
    engineOscillator.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    engineOscillator.start();
    
    // Exhaust sound (lower harmonic)
    exhaustOscillator = audioCtx.createOscillator();
    exhaustGainNode = audioCtx.createGain();
    exhaustOscillator.type = 'triangle';
    exhaustOscillator.connect(exhaustGainNode);
    exhaustGainNode.connect(audioCtx.destination);
    exhaustOscillator.start();
    
    // Set initial values
    engineGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    exhaustGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    
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
      gearShift: () => playTone(150, 0.03, 'sine', 0.15),
      redline: () => playTone(50, 0.05, 'square', 0.3)
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

  // Calculate engine torque based on RPM
  function calculateEngineTorque(rpm, throttle) {
    if (rpm < CONFIG.car.idleRpm) return 0;
    
    // Simple torque curve - peaks at maxTorqueRpm
    const normalizedRpm = rpm / CONFIG.car.maxTorqueRpm;
    let torqueFactor;
    
    if (normalizedRpm <= 1) {
      // Building torque
      torqueFactor = 0.4 + 0.6 * normalizedRpm;
    } else {
      // Falling torque after peak
      torqueFactor = 1.0 - 0.3 * (normalizedRpm - 1);
    }
    
    // Clamp torque factor
    torqueFactor = Math.max(0.1, Math.min(1.0, torqueFactor));
    
    return CONFIG.car.maxTorque * torqueFactor * throttle;
  }

  // Update transmission
  function updateTransmission(dt) {
    // Handle shifting
    if (car.isShifting) {
      car.shiftProgress += dt / CONFIG.car.shiftTime;
      
      if (car.shiftProgress >= 1.0) {
        // Shift complete
        car.gear = car.nextGear;
        car.isShifting = false;
        car.shiftProgress = 0;
        car.clutchEngagement = 1.0;
        sounds.gearShift && sounds.gearShift();
      } else {
        // Clutch disengaged during shift
        car.clutchEngagement = 0;
      }
    }
    
    // Calculate wheel RPM from speed (if clutch engaged)
    if (car.clutchEngagement > 0 && car.gear > 0) {
      const gearRatio = CONFIG.car.gearRatios[car.gear];
      const totalRatio = gearRatio * CONFIG.car.finalDriveRatio;
      
      // Wheel RPM from vehicle speed
      const wheelCircumference = 2 * Math.PI * CONFIG.car.wheelRadius;
      car.wheelRpm = (car.speed * 60) / wheelCircumference;
      
      // Engine RPM connected through gears
      const connectedRpm = car.wheelRpm * totalRatio;
      
      // Smooth RPM changes with clutch engagement
      const rpmDiff = connectedRpm - car.engineRpm;
      car.engineRpm += rpmDiff * car.clutchEngagement * dt * 10;
    }
    
    // Rev limiter
    if (car.engineRpm >= CONFIG.car.redlineRpm) {
      car.revLimiterActive = true;
      car.revLimiterCutoff = (frame % 10) < 5; // Cut fuel 50% of frames
      if (car.revLimiterCutoff) {
        car.actualThrottle = 0;
        sounds.redline && frame % 10 === 0 && sounds.redline();
      }
    } else {
      car.revLimiterActive = false;
      car.revLimiterCutoff = false;
    }
    
    // Engine RPM physics when clutch disengaged or in neutral
    if (car.clutchEngagement < 1.0 || car.gear === 0) {
      // Free-revving engine
      const engineInertia = CONFIG.car.engineInertia;
      const engineDrag = 0.05; // Engine internal friction
      
      const torque = calculateEngineTorque(car.engineRpm, car.actualThrottle);
      const dragTorque = car.engineRpm * engineDrag;
      
      const netTorque = torque - dragTorque;
      const rpmAcceleration = (netTorque / engineInertia) * 60 / (2 * Math.PI);
      
      car.engineRpm += rpmAcceleration * dt;
    }
    
    // Prevent stalling
    if (car.engineRpm < CONFIG.car.idleRpm && car.actualThrottle < 0.1) {
      car.engineRpm = CONFIG.car.idleRpm;
    }
    
    // Clamp RPM
    car.engineRpm = Math.max(0, Math.min(CONFIG.car.redlineRpm + 200, car.engineRpm));
    
    // Automatic transmission logic
    if (automaticTransmission && !car.isShifting && car.gear > 0) {
      const currentGearRatio = CONFIG.car.gearRatios[car.gear];
      
      // Upshift points
      if (car.engineRpm > 5500 && car.gear < 5) {
        initiateShift(car.gear + 1);
      }
      // Downshift points
      else if (car.engineRpm < 2000 && car.gear > 1 && car.actualThrottle > 0.5) {
        initiateShift(car.gear - 1);
      }
    }
  }

  function initiateShift(newGear) {
    if (newGear < 0 || newGear > 5 || car.isShifting) return;
    
    car.isShifting = true;
    car.shiftProgress = 0;
    car.nextGear = newGear;
    car.clutchEngagement = 0;
  }

  function updateEngineSound() {
    if (!engineOscillator || !engineGainNode || isMuted) return;
    
    // Base frequency from actual engine RPM
    const baseFreq = (car.engineRpm / 60) * CONFIG.car.baseFreqMultiplier;
    
    // Add some roughness at idle
    let freqModulation = 0;
    if (car.engineRpm < 1200) {
      freqModulation = Math.sin(frame * 0.1) * 2;
    }
    
    // Set oscillator frequencies
    engineOscillator.frequency.setTargetAtTime(
      baseFreq + freqModulation,
      audioCtx.currentTime,
      0.01
    );
    
    // Exhaust is lower harmonic
    exhaustOscillator.frequency.setTargetAtTime(
      (baseFreq + freqModulation) * 0.5,
      audioCtx.currentTime,
      0.01
    );
    
    // Volume based on throttle and RPM
    const rpmFactor = car.engineRpm / CONFIG.car.redlineRpm;
    const loadFactor = car.actualThrottle;
    
    let engineVolume = 0.05 + (loadFactor * 0.1) + (rpmFactor * 0.05);
    let exhaustVolume = 0.03 + (loadFactor * 0.05) + (rpmFactor * 0.02);
    
    // Reduce volume during shifts
    if (car.isShifting) {
      engineVolume *= 0.3;
      exhaustVolume *= 0.3;
    }
    
    // Rev limiter creates harsh cutting sound
    if (car.revLimiterCutoff) {
      engineVolume *= 0.1;
      exhaustVolume *= 0.1;
    }
    
    engineGainNode.gain.setTargetAtTime(
      engineVolume,
      audioCtx.currentTime,
      0.01
    );
    
    exhaustGainNode.gain.setTargetAtTime(
      exhaustVolume,
      audioCtx.currentTime,
      0.01
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
      
      // Manual shifting
      if (e.key === ' ') {
        e.preventDefault();
        if (car.gear < 5) initiateShift(car.gear + 1);
      }
      if (e.key === 'Shift') {
        e.preventDefault();
        if (car.gear > 1) initiateShift(car.gear - 1);
      }
      
      // Toggle automatic transmission
      if (e.key === 't' || e.key === 'T') {
        automaticTransmission = !automaticTransmission;
      }
      
      // Prevent arrow key scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
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
    const dt = CONFIG.physics.dt;
    const oldX = Math.floor(car.x);
    const oldY = Math.floor(car.y);
    
    // Handle input
    car.targetThrottle = 0;
    let brake = 0;
    let steering = 0;
    
    if (keys['arrowup'] || keys['w']) {
      car.targetThrottle = 1;
    }
    if (keys['arrowdown'] || keys['s']) {
      brake = 1;
    }
    if (keys['arrowleft'] || keys['a']) {
      steering = -1;
    }
    if (keys['arrowright'] || keys['d']) {
      steering = 1;
    }
    
    // Smooth throttle response
    if (!car.revLimiterCutoff) {
      car.actualThrottle += (car.targetThrottle - car.actualThrottle) * dt * 5;
    }
    
    // Update transmission and engine
    updateTransmission(dt);
    
    // Calculate forces
    if (car.gear > 0 && car.clutchEngagement > 0) {
      // Engine torque through transmission
      car.engineTorque = calculateEngineTorque(car.engineRpm, car.actualThrottle);
      const gearRatio = CONFIG.car.gearRatios[car.gear];
      const totalRatio = gearRatio * CONFIG.car.finalDriveRatio;
      
      car.wheelTorque = car.engineTorque * totalRatio * car.clutchEngagement;
      
      // Traction force
      const maxTraction = CONFIG.car.mass * CONFIG.physics.gravity * 0.8; // Friction coefficient
      let tractionForce = car.wheelTorque / CONFIG.car.wheelRadius;
      
      // Check for wheel slip
      if (Math.abs(tractionForce) > maxTraction) {
        car.wheelSlip = 1.0;
        tractionForce = Math.sign(tractionForce) * maxTraction;
        // Wheel spin increases RPM
        car.engineRpm += 500 * dt;
      } else {
        car.wheelSlip = Math.abs(tractionForce) / maxTraction;
      }
      
      // Apply force in car's direction
      const forceX = Math.cos(car.angle) * tractionForce / CONFIG.car.mass * dt;
      const forceY = Math.sin(car.angle) * tractionForce / CONFIG.car.mass * dt;
      
      car.vx += forceX;
      car.vy += forceY;
    }
    
    // Engine braking
    if (car.targetThrottle === 0 && car.gear > 0 && car.clutchEngagement > 0) {
      const engineBrakingForce = car.engineRpm * 0.001;
      car.vx *= (1 - engineBrakingForce * dt);
      car.vy *= (1 - engineBrakingForce * dt);
      car.engineBraking = true;
    } else {
      car.engineBraking = false;
    }
    
    // Braking
    if (brake > 0) {
      const brakingForce = 0.05 * brake;
      car.vx *= (1 - brakingForce);
      car.vy *= (1 - brakingForce);
    }
    
    // Update speed
    car.speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    
    // Steering (speed sensitive)
    const steeringSensitivity = 1.0 - Math.min(0.7, car.speed / 10);
    const steerAngle = steering * CONFIG.car.maxSteerAngle * steeringSensitivity;
    
    if (car.speed > 0.1) {
      car.angle += steerAngle * (car.speed / 5) * dt * 60;
    }
    
    // Drag forces
    const dragForce = 0.5 * CONFIG.physics.airDensity * CONFIG.car.dragCoefficient * car.speed * car.speed;
    const dragDeceleration = dragForce / CONFIG.car.mass;
    
    if (car.speed > 0) {
      const dragX = (car.vx / car.speed) * dragDeceleration * dt;
      const dragY = (car.vy / car.speed) * dragDeceleration * dt;
      car.vx -= dragX;
      car.vy -= dragY;
    }
    
    // Rolling resistance
    const rollingResistance = CONFIG.car.rollingResistance * CONFIG.physics.gravity;
    if (car.speed > 0) {
      car.vx *= (1 - rollingResistance * dt);
      car.vy *= (1 - rollingResistance * dt);
    }
    
    // Update position
    car.x += car.vx;
    car.y += car.vy;
    
    // Update facing direction
    const angleDegs = (car.angle * 180 / Math.PI + 360) % 360;
    if (angleDegs >= 315 || angleDegs < 45) car.facing = 'right';
    else if (angleDegs >= 45 && angleDegs < 135) car.facing = 'down';
    else if (angleDegs >= 135 && angleDegs < 225) car.facing = 'left';
    else car.facing = 'up';
    
    // Keep in bounds
    car.x = Math.max(1, Math.min(gridWidth - 2, car.x));
    car.y = Math.max(1, Math.min(gridHeight - 2, car.y));
    
    // Check if moved to new grid cell
    const newX = Math.floor(car.x);
    const newY = Math.floor(car.y);
    
    if (newX !== oldX || newY !== oldY) {
      // Add to trail
      car.trail.push({ 
        x: oldX, 
        y: oldY, 
        life: car.wheelSlip > 0.5 ? 30 : 15,
        slip: car.wheelSlip 
      });
      if (car.trail.length > 40) car.trail.shift();
    }
    
    // Update trail
    car.trail = car.trail.filter(t => {
      t.life--;
      return t.life > 0;
    });
    
    // Update engine sound
    updateEngineSound();
    
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
        
        // Drop to first gear on collision
        if (car.gear > 1) {
          initiateShift(1);
        }
        
        // Create particles
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          particles.push({
            x: car.x,
            y: car.y,
            vx: Math.cos(angle) * 0.5,
            vy: Math.sin(angle) * 0.5,
            life: 30,
            symbol: ['!', '#', '*', '×', '@', '%', '&', '~'][i]
          });
        }
        
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
      
      // Boost to top gear
      initiateShift(5);
      car.targetThrottle = 1;
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
    
    // CRT scanline effect
    ctx.strokeStyle = CONFIG.canvas.colors.fg;
    ctx.globalAlpha = 0.05;
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
    ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const size = CONFIG.canvas.gridSize;
    
    car.trail.forEach((t, i) => {
      ctx.globalAlpha = (t.life / 30) * 0.5;
      const symbol = t.slip > 0.5 ? '≈' : '·';
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
      ctx.font = `${CONFIG.canvas.gridSize * 1.2}px monospace`;
      ctx.fillText(obs.symbol, 0, wobble);
      ctx.restore();
    });
    
    // Draw particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 20;
      ctx.font = `${CONFIG.canvas.gridSize}px monospace`;
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
      ctx.font = `${CONFIG.canvas.gridSize * 1.5}px monospace`;
      ctx.fillText(
        goal.symbol,
        goal.x * size + size/2,
        goal.y * size + size/2
      );
      ctx.globalAlpha = 1;
      
      // Goal label
      ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
      ctx.fillText('CONTENT', goal.x * size + size/2, (goal.y + 1.5) * size);
    }
    
    // Draw car as ASCII art
    drawCar(ctx, car.x * size, car.y * size, car.angle, car.wheelSlip > 0.5);
    
    // Draw UI
    drawUI();
  }
  
  // Draw ASCII car
  function drawCar(ctx, x, y, angle, isSlipping) {
    ctx.save();
    ctx.translate(x + CONFIG.canvas.gridSize * 1.5, y + CONFIG.canvas.gridSize);
    ctx.rotate(angle);
    
    ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Car body with gear indicator
    const gearSymbol = car.gear === 0 ? 'N' : car.gear;
    const carArt = [
      [`  o═o  `, `╔═╣${gearSymbol}╠═╗`, `╚═o═o═╝`],  // Right
      [`╔═o═╗`, `║ ${gearSymbol} ║`, `╚═o═╝`],       // Down
      [`╔═o═o═╗`, `╚═╣${gearSymbol}╠═╝`, `  o═o  `],  // Left  
      [`╔═o═╗`, `║ ${gearSymbol} ║`, `╚═o═╝`]        // Up
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
    
    // Tire smoke when slipping
    if (isSlipping) {
      ctx.globalAlpha = 0.5;
      ctx.fillText('≈≈', -CONFIG.canvas.gridSize, CONFIG.canvas.gridSize * 0.5);
      ctx.fillText('≈≈', -CONFIG.canvas.gridSize * 0.5, CONFIG.canvas.gridSize * 0.7);
    }
    
    ctx.restore();
  }

  function drawUI() {
    const size = CONFIG.canvas.gridSize;
    
    // Top bar background
    ctx.fillStyle = CONFIG.canvas.colors.bg;
    ctx.fillRect(0, 0, canvas.width, size * 3);
    
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${size}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Stats
    ctx.fillText(`HITS: ${car.collisions}`, size, size * 0.5);
    ctx.fillText(`GEAR: ${car.gear === 0 ? 'N' : car.gear}`, size * 8, size * 0.5);
    ctx.fillText(`RPM: ${Math.round(car.engineRpm)}`, size * 15, size * 0.5);
    ctx.fillText(`SPD: ${Math.round(car.speed * 10)}`, size * 25, size * 0.5);
    
    // RPM gauge
    const rpmPercent = (car.engineRpm - CONFIG.car.idleRpm) / (CONFIG.car.redlineRpm - CONFIG.car.idleRpm);
    const gaugeWidth = 20;
    const gaugeFilled = Math.floor(rpmPercent * gaugeWidth);
    
    ctx.font = `${size * 0.8}px monospace`;
    let rpmGauge = '[';
    for (let i = 0; i < gaugeWidth; i++) {
      if (i < gaugeFilled) {
        rpmGauge += i >= gaugeWidth - 4 ? '!' : '|';
      } else {
        rpmGauge += '-';
      }
    }
    rpmGauge += ']';
    
    ctx.fillStyle = car.revLimiterActive ? '#ff0000' : CONFIG.canvas.colors.fg;
    ctx.fillText(rpmGauge, size, size * 1.5);
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    
    // Transmission mode
    ctx.fillText(`MODE: ${automaticTransmission ? 'AUTO' : 'MANUAL'}`, size * 25, size * 1.5);
    
    // Instructions
    ctx.font = `${size * 0.7}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD/ARROWS • SPACE=UP • SHIFT=DOWN • T=MODE • ESC=SKIP', canvas.width - size, size * 0.5);
    
    // State indicator
    if (car.isShifting) {
      ctx.textAlign = 'center';
      ctx.font = `${size * 1.2}px monospace`;
      ctx.fillText('SHIFTING...', canvas.width / 2, size * 2);
    }
    
    if (car.engineBraking) {
      ctx.textAlign = 'center';
      ctx.font = `${size * 0.8}px monospace`;
      ctx.fillText('ENGINE BRAKING', canvas.width / 2, size * 2.5);
    }
    
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
        if (exhaustGainNode) {
          exhaustGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
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