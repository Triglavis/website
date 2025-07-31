(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      backgroundColor: {
        light: '#ffffff',
        dark: '#333333'
      }
    },
    car: {
      width: 30,
      height: 20,
      speed: 0,
      maxSpeed: 8,
      acceleration: 0.4,
      brakeForce: 0.6,
      friction: 0.95,
      turnSpeed: 0.12,
      color: '#4A5568',
      starModeColor: '#FFD700',
      // Physics
      mass: 1,
      suspensionStiffness: 0.3,
      suspensionDamping: 0.8,
      maxLean: 0.3,
      // Gears
      gears: [3.5, 2.2, 1.5, 1.0, 0.8],
      gearShiftSpeed: 0.3,
      // Jump physics
      jumpVelocity: 0,
      gravity: 0.5,
      maxJumpHeight: 50
    },
    effects: {
      skidMarkOpacity: 0.3,
      skidMarkFadeSpeed: 0.98,
      particleLife: 30,
      maxParticles: 50
    },
    track: {
      width: 200,
      edgeWidth: 20,
      centerLineWidth: 4,
      barrierHeight: 30,
      jumpLength: 150,
      jumpHeight: 40,
      turnRadius: 300,
      decorationSpacing: 200
    }
  };

  // Game state
  let canvas, ctx, audioCtx;
  let gameState = 'exploring'; // intro, exploring, browser-country, struggle, detour-available, star-mode, won
  let car = {
    x: 100,
    y: window.innerHeight / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    targetAngle: 0,
    isDrifting: false,
    collisionCount: 0,
    isAccelerating: false,
    isBraking: false,
    isStarMode: false,
    // Physics
    speed: 0,
    lean: 0,
    leanVelocity: 0,
    suspensionOffset: 0,
    gear: 0,
    rpm: 0,
    brakeLocked: false,
    // Jump state
    z: 0,
    vz: 0,
    isAirborne: false,
    // Track position
    trackProgress: 0,
    lapCount: 0
  };
  let goal = { x: window.innerWidth - 100, y: window.innerHeight / 2, reached: false };
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
  let isDarkMode = false;
  let trackBounds = { x: window.innerWidth * 0.3, width: window.innerWidth * 0.4 };
  let trackSegments = [];
  let trackDecorations = [];
  let distractionSigns = [];

  // Story text sequences
  const storyTexts = [
    "You saved an interesting article yesterday...",
    "Now you want to read it. It's saved in your browser.",
    "But to get there, you must travel through Browser Country...",
    "Drive to your saved content →"
  ];

  const browserCountryTexts = [
    "Oh no! You've entered Browser Country!",
    "The distractions are affecting your car's controls...",
    "Everything feels... wobbly..."
  ];

  // Initialize audio context and sounds
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create engine sound oscillator
    engineOscillator = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    engineOscillator.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    engineOscillator.type = 'sawtooth';
    engineOscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
    engineGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOscillator.start();

    // Define sound effects using Web Audio API
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
      },
      wobble: () => playTone(100 + Math.random() * 50, 0.05, 'sine', 0.1)
    };
  }

  // Play a tone
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

  // Play noise (for skid sound)
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

  // Update transmission
  function updateTransmission() {
    const speedRatio = car.speed / CONFIG.car.maxSpeed;
    
    // Auto gear selection based on speed
    const targetGear = Math.min(CONFIG.car.gears.length - 1, Math.floor(speedRatio * CONFIG.car.gears.length));
    
    // Smooth gear changes
    if (targetGear !== car.gear) {
      car.gear += (targetGear - car.gear) * CONFIG.car.gearShiftSpeed;
      car.gear = Math.round(car.gear);
    }
    
    // Calculate RPM
    const gearRatio = CONFIG.car.gears[Math.max(0, car.gear)];
    car.rpm = (car.speed / CONFIG.car.maxSpeed) * 7000 / gearRatio;
  }
  
  // Update engine sound based on RPM
  function updateEngineSound() {
    if (!engineOscillator || !engineGainNode || isMuted) return;
    
    // Engine frequency based on RPM
    const baseFreq = 100 + (car.rpm / 7000) * 400;
    
    // Add jump effect
    const jumpEffect = car.isAirborne ? 100 : 0;
    
    engineOscillator.frequency.setTargetAtTime(
      baseFreq + jumpEffect,
      audioCtx.currentTime,
      0.1
    );
    
    // Volume based on throttle and RPM
    const volume = (car.isAccelerating ? 0.2 : 0.1) * (0.5 + car.rpm / 14000) * (car.isAirborne ? 1.3 : 1);
    engineGainNode.gain.setTargetAtTime(
      volume,
      audioCtx.currentTime,
      0.1
    );
  }

  // Initialize canvas
  function init() {
    canvas = document.getElementById('carGameCanvas');
    ctx = canvas.getContext('2d');
    
    // Detect mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                ('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0);
    
    // Detect dark mode
    isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Lock scrolling during game
    document.body.classList.add('game-active');
    
    // Set canvas size
    resizeCanvas();
    
    // Initialize audio on first user interaction
    canvas.addEventListener('click', () => {
      if (!audioCtx) initAudio();
    });
    
    // Prevent default key behaviors
    const preventDefaultKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '];
    
    // Event listeners
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (preventDefaultKeys.includes(key)) {
        e.preventDefault();
      }
      
      keys[key] = true;
      if (!audioCtx) initAudio();
      
      // Handle special keys
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
    
    // Mobile controls
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Mouse controls for testing
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    window.addEventListener('resize', resizeCanvas);
    
    // Watch for color scheme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        isDarkMode = e.matches;
      });
    }
    
    // Setup mobile controls
    setupMobileControls();
    
    // Setup game controls
    setupGameControls();
    
    // Skip story sequence - hero is visible as background
    // startStorySequence();
    
    // Start game loop
    gameLoop();
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Update positions
    goal.x = canvas.width - 100;
    goal.y = canvas.height / 2;
    trackBounds = { x: canvas.width * 0.3, width: canvas.width * 0.4 };
  }

  // Story sequence
  function startStorySequence() {
    updateStoryText();
    
    // Progress story
    const storyInterval = setInterval(() => {
      storySequence++;
      if (storySequence < storyTexts.length) {
        updateStoryText();
      } else {
        clearInterval(storyInterval);
        // Fade out story overlay
        setTimeout(() => {
          const overlay = document.getElementById('storyOverlay');
          overlay.style.opacity = '0';
          setTimeout(() => {
            overlay.style.display = 'none';
            gameState = 'exploring';
          }, 500);
        }, 2000);
      }
    }, 3000);
  }

  function updateStoryText(text) {
    const storyEl = document.getElementById('storyText');
    if (text) {
      storyEl.textContent = text;
    } else if (storySequence < storyTexts.length) {
      storyEl.textContent = storyTexts[storySequence];
    }
  }

  // Touch/Mouse handlers
  function handleTouchStart(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
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
    // Check if on race track
    const onTrack = car.x > trackBounds.x && 
                    car.x < trackBounds.x + trackBounds.width;
    
    // Handle input - relative to car direction
    let throttle = 0;
    let steering = 0;
    
    // Keyboard controls - relative to car
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
    
    // Mobile pedal controls
    if (isMobile) {
      if (car.isAccelerating) throttle = 1;
      if (car.isBraking) throttle = -1;
      
      // Steering wheel rotation
      if (steeringRotation !== 0) {
        steering = Math.sin(steeringRotation) * 1.5;
      }
    }
    
    // Touch controls override
    if (touch.active) {
      const dx = touch.x - car.x;
      const dy = touch.y - car.y;
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
    
    // Update gear and RPM
    updateTransmission();
    
    // Apply throttle with gear ratio
    if (throttle > 0) {
      const gearRatio = CONFIG.car.gears[car.gear];
      const torque = throttle * CONFIG.car.acceleration * gearRatio;
      car.speed += torque * (1 - car.rpm / 8000 * 0.5); // Power curve
    } else if (throttle < 0) {
      // Braking
      if (car.speed > 6 && !car.brakeLocked) {
        // ABS kicks in at high speed
        car.brakeLocked = true;
        setTimeout(() => car.brakeLocked = false, 200);
      }
      
      if (!car.brakeLocked) {
        car.speed -= CONFIG.car.brakeForce;
      } else {
        // Locked brakes - less effective
        car.speed -= CONFIG.car.brakeForce * 0.3;
        car.isDrifting = true;
      }
    }
    
    // Track physics
    if (onTrack && !car.isStarMode) {
      // Check current track segment for jumps
      const segment = getCurrentTrackSegment();
      if (segment && segment.type === 'jump' && !car.isAirborne && car.z <= 0) {
        // Launch off jump
        car.vz = -Math.min(car.speed * 0.7, 15);
        car.isAirborne = true;
        sounds.powerUp && sounds.powerUp();
      }
    }
    
    // Apply gravity and jump physics
    if (car.isAirborne || car.z > 0) {
      car.vz += CONFIG.car.gravity;
      car.z += car.vz;
      
      if (car.z <= 0) {
        car.z = 0;
        car.isAirborne = false;
        car.vz = 0;
        // Landing impact
        if (Math.abs(car.vz) > 5) {
          createCollisionParticles(car.x, car.y);
          car.speed *= 0.8; // Speed loss on hard landing
        }
      }
    }
    
    // Apply friction
    car.speed *= CONFIG.car.friction;
    
    // Limit speed
    const maxSpeed = car.isStarMode ? CONFIG.car.maxSpeed * 1.5 : CONFIG.car.maxSpeed;
    car.speed = Math.max(0, Math.min(maxSpeed, car.speed));
    
    // Steering affects angle based on speed
    if (Math.abs(car.speed) > 0.1) {
      const steerAngle = steering * CONFIG.car.turnSpeed * (car.speed / CONFIG.car.maxSpeed);
      car.angle += steerAngle;
      
      // Update lean based on steering
      const targetLean = -steering * car.speed / CONFIG.car.maxSpeed * CONFIG.car.maxLean;
      car.leanVelocity += (targetLean - car.lean) * CONFIG.car.suspensionStiffness;
      car.leanVelocity *= CONFIG.car.suspensionDamping;
      car.lean += car.leanVelocity;
    }
    
    // Convert speed and angle to velocity
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    
    // Update suspension (bounce on track)
    car.suspensionOffset = Math.sin(Date.now() / 100) * 2 + (car.isAirborne ? 0 : Math.sin(car.trackProgress * 0.1) * 3);
    
    // Update position
    const newX = car.x + car.vx;
    const newY = car.y + car.vy;
    
    // Check boundaries
    if (newX > 20 && newX < canvas.width - 20) car.x = newX;
    else {
      car.speed *= -0.5;
      car.vx *= -0.5;
    }
    
    if (newY > 20 && newY < canvas.height - 20) car.y = newY;
    else {
      car.speed *= -0.5;
      car.vy *= -0.5;
    }
    
    // Check if drifting
    const lateralVelocity = Math.abs(Math.sin(car.angle) * car.vx - Math.cos(car.angle) * car.vy);
    car.isDrifting = lateralVelocity > 1 || car.brakeLocked;
    
    // Add skid marks when drifting
    if (car.isDrifting && car.speed > 1) {
      skidMarks.push({
        x: car.x - Math.cos(car.angle) * 10,
        y: car.y - Math.sin(car.angle) * 10,
        opacity: CONFIG.effects.skidMarkOpacity * (car.speed / CONFIG.car.maxSpeed)
      });
      
      // Play skid sound occasionally
      if (Math.random() < 0.1) sounds.skid();
    }
    
    // Update engine sound
    updateEngineSound();
    
    // Check game state transitions
    checkGameStateTransitions();
    
    // Check collisions
    if (!car.isStarMode) {
      checkCollisions();
    }
    
    // Check goal
    checkGoal();
  }

  function checkGameStateTransitions() {
    const onTrack = car.x > trackBounds.x && 
                    car.x < trackBounds.x + trackBounds.width;
    
    if (gameState === 'exploring' && onTrack) {
      gameState = 'browser-country';
      generateRaceTrack();
      // Track message
      const messageEl = document.getElementById('gameMessage');
      messageEl.textContent = 'Welcome to the endless loop! Where\'s the exit?';
      messageEl.style.display = 'block';
      messageEl.style.opacity = '1';
      setTimeout(() => {
        messageEl.style.opacity = '0';
        setTimeout(() => messageEl.style.display = 'none', 500);
      }, 3000);
    }
    
    if (gameState === 'browser-country') {
      // Update track progress
      car.trackProgress += car.speed * 0.1;
      
      // Check lap completion
      if (car.trackProgress > 1000) {
        car.trackProgress = 0;
        car.lapCount++;
        
        if (car.lapCount >= 3 && gameState !== 'detour-available') {
          gameState = 'detour-available';
          showDetourPowerup();
        }
      }
    }
  }

  function checkCollisions() {
    if (gameState === 'browser-country' || gameState === 'struggle') {
      for (let obstacle of obstacles) {
        const dx = car.x - obstacle.x;
        const dy = car.y - obstacle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 40) {
          // Bounce car back
          car.vx *= -1.5;
          car.vy *= -1.5;
          car.collisionCount++;
          
          // Create particles
          createCollisionParticles(car.x, car.y);
          
          // Play collision sound
          sounds.collision();
        }
      }
    }
  }

  function checkGoal() {
    const dx = car.x - goal.x;
    const dy = car.y - goal.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 30 && gameState !== 'won') {
      // Win!
      gameState = 'won';
      goal.reached = true;
      sounds.success();
      showWinMessage();
    }
  }

  function generateRaceTrack() {
    // Clear existing track data
    trackSegments = [];
    trackDecorations = [];
    distractionSigns = [];
    obstacles = [];
    
    // Generate track segments
    const segmentTypes = ['straight', 'turn-left', 'turn-right', 'jump', 'chicane'];
    let currentY = canvas.height / 2;
    
    for (let i = 0; i < 20; i++) {
      const type = segmentTypes[Math.floor(Math.random() * segmentTypes.length)];
      const x = trackBounds.x + (i * 50) % trackBounds.width;
      
      trackSegments.push({
        x: x,
        y: currentY,
        type: type,
        width: CONFIG.track.width
      });
      
      // Adjust path for turns
      if (type === 'turn-left') currentY -= 100;
      if (type === 'turn-right') currentY += 100;
      currentY = Math.max(150, Math.min(canvas.height - 150, currentY));
    }
    
    // Add distraction signs
    const sites = [
      { name: 'YouTube ↗', color: '#FF0000' },
      { name: 'Twitter ↗', color: '#1DA1F2' },
      { name: 'Reddit ↗', color: '#FF4500' },
      { name: 'TikTok ↗', color: '#000000' },
      { name: 'Instagram ↗', color: '#E4405F' }
    ];
    
    for (let i = 0; i < 8; i++) {
      distractionSigns.push({
        x: trackBounds.x + Math.random() * trackBounds.width,
        y: Math.random() * canvas.height,
        site: sites[Math.floor(Math.random() * sites.length)],
        angle: Math.random() * 0.2 - 0.1
      });
    }
    
    // Add track decorations (barriers, signs, etc)
    for (let i = 0; i < 30; i++) {
      trackDecorations.push({
        x: trackBounds.x + Math.random() * trackBounds.width,
        y: Math.random() * canvas.height,
        type: Math.random() > 0.5 ? 'barrier' : 'cone',
        scale: 0.8 + Math.random() * 0.4
      });
    }
  }
  
  function getCurrentTrackSegment() {
    // Find the nearest track segment to the car
    let nearest = null;
    let minDist = Infinity;
    
    trackSegments.forEach(segment => {
      const dist = Math.abs(car.x - segment.x);
      if (dist < minDist) {
        minDist = dist;
        nearest = segment;
      }
    });
    
    return minDist < 50 ? nearest : null;
  }

  function createCollisionParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: CONFIG.effects.particleLife,
        color: car.isStarMode ? '#FFD700' : '#FF4444'
      });
    }
  }

  function showDetourPowerup() {
    const powerup = document.getElementById('detourPowerup');
    powerup.style.display = 'block';
    
    // Setup activate button
    const activateBtn = document.getElementById('activateDetour');
    activateBtn.addEventListener('click', activateDetour);
  }

  function activateDetour() {
    sounds.powerUp && sounds.powerUp();
    gameState = 'star-mode';
    car.isStarMode = true;
    
    // Hide powerup
    const powerup = document.getElementById('detourPowerup');
    powerup.style.display = 'none';
    
    // Add star mode effect
    document.getElementById('carGameContainer').classList.add('star-mode');
    
    // Create star particles
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: car.x,
        y: car.y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 60,
        color: '#FFD700'
      });
    }
  }

  function showWinMessage() {
    setTimeout(() => {
      const messageEl = document.getElementById('gameMessage');
      messageEl.textContent = 'With Detour, reaching your content is this easy!';
      messageEl.style.display = 'block';
      messageEl.style.opacity = '1';
      
      // Transition to regular landing page
      setTimeout(() => {
        const gameContainer = document.getElementById('carGameContainer');
        
        gameContainer.style.opacity = '0';
        setTimeout(() => {
          gameContainer.style.display = 'none';
          // Enable scrolling
          document.body.classList.remove('game-active');
          // Hero is already visible in background, just scroll to top
          window.scrollTo(0, 0);
        }, 1000);
      }, 3000);
    }, 500);
  }

  // Update particles and effects
  function updateEffects() {
    // Update particles
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vz = (p.vz || 0) + 0.3; // gravity
      p.z = (p.z || 0) + (p.vz || 0);
      if (p.z > 0) p.z = 0;
      p.life--;
      
      return p.life > 0;
    });
    
    // Create trail particles in star mode
    if (car.isStarMode && Math.sqrt(car.vx * car.vx + car.vy * car.vy) > 1) {
      particles.push({
        x: car.x - Math.cos(car.angle) * 15,
        y: car.y - Math.sin(car.angle) * 15,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 1,
        life: 30,
        color: '#FFD700'
      });
    }
    
    // Fade skid marks
    skidMarks = skidMarks.filter(mark => {
      mark.opacity *= CONFIG.effects.skidMarkFadeSpeed;
      return mark.opacity > 0.01;
    });
    
    // Animate obstacles
    obstacles.forEach(o => {
      if (o.scale < o.targetScale) {
        o.scale += 0.05;
      }
      // Wobble obstacles
      o.wobbleOffset += 0.05;
    });
  }

  // Main game loop
  function gameLoop() {
    // Clear canvas (transparent)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw race track
    drawRaceTrack();
    
    // Update game
    updateCar();
    updateEffects();
    
    // Draw everything
    drawSkidMarks();
    drawGoal();
    drawObstacles();
    drawCar();
    drawParticles();
    drawUI();
    
    requestAnimationFrame(gameLoop);
  }

  function drawRaceTrack() {
    if (gameState === 'won') return;
    
    // Track background
    ctx.fillStyle = isDarkMode ? 'rgba(40, 40, 40, 0.9)' : 'rgba(200, 200, 200, 0.9)';
    ctx.fillRect(trackBounds.x, 0, trackBounds.width, canvas.height);
    
    // Draw track surface with segments
    trackSegments.forEach((segment, i) => {
      ctx.save();
      
      // Track surface
      const trackColor = isDarkMode ? '#2a2a2a' : '#888888';
      ctx.fillStyle = trackColor;
      
      if (segment.type === 'jump') {
        // Draw jump ramp
        ctx.fillStyle = isDarkMode ? '#444444' : '#999999';
        ctx.beginPath();
        ctx.moveTo(segment.x - 75, segment.y);
        ctx.lineTo(segment.x - 25, segment.y - CONFIG.track.jumpHeight);
        ctx.lineTo(segment.x + 25, segment.y - CONFIG.track.jumpHeight);
        ctx.lineTo(segment.x + 75, segment.y);
        ctx.closePath();
        ctx.fill();
        
        // Jump markers
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Track edges
      ctx.strokeStyle = isDarkMode ? '#ffffff' : '#000000';
      ctx.lineWidth = CONFIG.track.edgeWidth;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(segment.x - CONFIG.track.width/2, segment.y - 50);
      ctx.lineTo(segment.x - CONFIG.track.width/2, segment.y + 50);
      ctx.moveTo(segment.x + CONFIG.track.width/2, segment.y - 50);
      ctx.lineTo(segment.x + CONFIG.track.width/2, segment.y + 50);
      ctx.stroke();
      ctx.globalAlpha = 1;
      
      // Center line
      ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = CONFIG.track.centerLineWidth;
      ctx.setLineDash([20, 15]);
      ctx.beginPath();
      ctx.moveTo(segment.x, segment.y - 50);
      ctx.lineTo(segment.x, segment.y + 50);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.restore();
    });
    
    // Draw barriers to show no exit
    ctx.fillStyle = isDarkMode ? '#ff4444' : '#cc0000';
    ctx.fillRect(trackBounds.x + trackBounds.width - 20, 100, 20, canvas.height - 200);
    
    // "No Exit" sign
    ctx.save();
    ctx.translate(trackBounds.x + trackBounds.width - 40, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isDarkMode ? '#ffffff' : '#000000';
    ctx.font = 'bold 18px Space Mono';
    ctx.textAlign = 'center';
    ctx.fillText('NO EXIT', 0, 0);
    ctx.restore();
    
    // Draw decorations
    trackDecorations.forEach(deco => {
      ctx.save();
      ctx.translate(deco.x, deco.y);
      ctx.scale(deco.scale, deco.scale);
      
      if (deco.type === 'barrier') {
        // Simple barrier
        ctx.fillStyle = isDarkMode ? '#ff6666' : '#ff0000';
        ctx.fillRect(-5, -15, 10, 30);
        ctx.fillStyle = isDarkMode ? '#ffffff' : '#ffff00';
        ctx.fillRect(-5, -15, 10, 5);
      } else {
        // Traffic cone
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.restore();
    });
    
    // Draw distraction signs
    distractionSigns.forEach(sign => {
      ctx.save();
      ctx.translate(sign.x, sign.y);
      ctx.rotate(sign.angle);
      
      // Sign post
      ctx.fillStyle = isDarkMode ? '#666666' : '#333333';
      ctx.fillRect(-2, 0, 4, 40);
      
      // Sign board
      ctx.fillStyle = sign.site.color;
      ctx.fillRect(-40, -30, 80, 30);
      
      // Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Space Mono';
      ctx.textAlign = 'center';
      ctx.fillText(sign.site.name, 0, -12);
      
      ctx.restore();
    });
    
    // Track title
    if (gameState === 'exploring') {
      ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
      ctx.font = 'bold 24px Space Mono';
      ctx.textAlign = 'center';
      ctx.fillText('INFINITE LOOP RACEWAY', trackBounds.x + trackBounds.width / 2, 50);
      ctx.font = '14px Space Mono';
      ctx.fillText('(Browser Country)', trackBounds.x + trackBounds.width / 2, 75);
    }
  }

  function drawSkidMarks() {
    skidMarks.forEach(mark => {
      ctx.fillStyle = `rgba(0, 0, 0, ${mark.opacity})`;
      ctx.fillRect(mark.x - 2, mark.y - 2, 4, 4);
    });
  }

  function drawCar() {
    ctx.save();
    
    // Apply jump height
    const drawY = car.y - car.z + car.suspensionOffset;
    
    // Shadow (gets smaller when airborne)
    const shadowScale = car.isAirborne ? Math.max(0.5, 1 - car.z / 100) : 1;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 * shadowScale})`;
    ctx.save();
    ctx.translate(car.x, car.y + 5);
    ctx.scale(shadowScale, shadowScale * 0.5);
    ctx.fillRect(-CONFIG.car.width/2, -CONFIG.car.height/2, CONFIG.car.width, CONFIG.car.height);
    ctx.restore();
    
    // Car transform
    ctx.translate(car.x, drawY);
    ctx.rotate(car.angle);
    
    // Apply lean transformation
    ctx.transform(1, 0, car.lean * 0.3, 1, 0, 0);
    
    // Star mode glow
    if (car.isStarMode) {
      const glow = 20 + Math.sin(Date.now() / 100) * 10;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glow);
      gradient.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(-glow, -glow, glow * 2, glow * 2);
    }
    
    // Car body
    ctx.fillStyle = car.isStarMode ? CONFIG.car.starModeColor : CONFIG.car.color;
    ctx.fillRect(-CONFIG.car.width/2, -CONFIG.car.height/2, CONFIG.car.width, CONFIG.car.height);
    
    // Racing stripes
    ctx.fillStyle = car.isStarMode ? '#FFFFFF' : '#FF0000';
    ctx.fillRect(-CONFIG.car.width/2 + 5, -CONFIG.car.height/2, 3, CONFIG.car.height);
    ctx.fillRect(CONFIG.car.width/2 - 8, -CONFIG.car.height/2, 3, CONFIG.car.height);
    
    // Windshield
    ctx.fillStyle = car.isStarMode ? '#FFFFFF' : '#E2E8F0';
    ctx.fillRect(-CONFIG.car.width/4, -CONFIG.car.height/4, CONFIG.car.width/2, CONFIG.car.height/2);
    
    // Brake lights (red when braking, flashing if locked)
    if (car.isBraking) {
      ctx.fillStyle = car.brakeLocked && Math.sin(Date.now() / 50) > 0 ? '#FF8888' : '#FF4444';
      ctx.fillRect(-CONFIG.car.width/2 - 2, -CONFIG.car.height/3, 2, CONFIG.car.height/3);
      ctx.fillRect(-CONFIG.car.width/2 - 2, 0, 2, CONFIG.car.height/3);
    }
    
    // Headlights (when moving forward)
    if (car.speed > 0.5) {
      ctx.fillStyle = 'rgba(255, 255, 200, 0.3)';
      ctx.beginPath();
      ctx.moveTo(CONFIG.car.width/2, -CONFIG.car.height/3);
      ctx.lineTo(CONFIG.car.width/2 + 30, -CONFIG.car.height/2);
      ctx.lineTo(CONFIG.car.width/2 + 30, 0);
      ctx.lineTo(CONFIG.car.width/2, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(CONFIG.car.width/2, CONFIG.car.height/3);
      ctx.lineTo(CONFIG.car.width/2 + 30, CONFIG.car.height/2);
      ctx.lineTo(CONFIG.car.width/2 + 30, 0);
      ctx.lineTo(CONFIG.car.width/2, 0);
      ctx.fill();
    }
    
    ctx.restore();
  }

  function drawGoal() {
    const pulseScale = 1 + Math.sin(Date.now() / 500) * 0.1;
    
    ctx.save();
    ctx.translate(goal.x, goal.y);
    ctx.scale(pulseScale, pulseScale);
    
    // Goal circle
    ctx.fillStyle = goal.reached ? '#48BB78' : '#4299E1';
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Space Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CONTENT', 0, 0);
    
    ctx.restore();
  }

  function drawObstacles() {
    obstacles.forEach(obstacle => {
      const wobble = Math.sin(obstacle.wobbleOffset) * 5;
      
      ctx.save();
      ctx.translate(obstacle.x + wobble, obstacle.y);
      ctx.scale(obstacle.scale, obstacle.scale);
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(-30, -20, 60, 40);
      
      // Obstacle box
      ctx.fillStyle = obstacle.site.color;
      ctx.fillRect(-35, -25, 70, 50);
      
      // Text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Space Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obstacle.site.name, 0, 0);
      
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / CONFIG.effects.particleLife;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
  }

  function drawUI() {
    // Instructions
    if (gameState === 'exploring' || gameState === 'browser-country') {
      ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
      ctx.font = '14px Space Mono';
      ctx.textAlign = 'left';
      ctx.fillText(isMobile ? 'Touch controls to drive' : 'WASD/Arrows (relative to car) • H to honk • ESC to skip', 20, canvas.height - 20);
    }
    
    // Speed/gear indicator
    ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    ctx.font = 'bold 16px Space Mono';
    ctx.textAlign = 'left';
    const speedKmh = Math.round(car.speed * 20);
    ctx.fillText(`${speedKmh} km/h`, 20, 30);
    ctx.font = '12px Space Mono';
    ctx.fillText(`Gear ${Math.ceil(car.gear + 1)}`, 20, 50);
    
    // Lap counter on track
    if (gameState === 'browser-country' || gameState === 'struggle' || gameState === 'detour-available') {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
      ctx.fillText(`Lap ${car.lapCount + 1}`, 20, 70);
      if (car.lapCount > 0) {
        ctx.font = '10px Space Mono';
        ctx.fillText('(Still no exit...)', 20, 85);
      }
    }
  }

  // Setup mobile controls
  function setupMobileControls() {
    if (!isMobile) return;
    
    // Steering wheel
    const wheel = document.getElementById('steeringWheel');
    const horn = wheel.querySelector('.steering-center');
    let wheelActive = false;
    let startAngle = 0;
    
    // Steering wheel touch controls
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
      
      // Limit rotation to ±90 degrees
      rotation = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotation));
      steeringRotation = rotation;
      wheel.style.transform = `rotate(${rotation}rad)`;
    });
    
    wheel.addEventListener('touchend', () => {
      wheelActive = false;
      wheel.classList.remove('active');
      // Spring back to center
      steeringRotation = 0;
      wheel.style.transform = 'rotate(0)';
    });
    
    // Horn button
    horn.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.honk && sounds.honk();
    });
    
    // Pedals
    const gasPedal = document.getElementById('gasPedal');
    const brakePedal = document.getElementById('brakePedal');
    
    // Gas pedal
    gasPedal.addEventListener('touchstart', (e) => {
      e.preventDefault();
      car.isAccelerating = true;
    });
    
    gasPedal.addEventListener('touchend', (e) => {
      e.preventDefault();
      car.isAccelerating = false;
    });
    
    // Brake pedal
    brakePedal.addEventListener('touchstart', (e) => {
      e.preventDefault();
      car.isBraking = true;
    });
    
    brakePedal.addEventListener('touchend', (e) => {
      e.preventDefault();
      car.isBraking = false;
    });
  }
  
  // Setup game control buttons
  function setupGameControls() {
    // Mute button
    const muteBtn = document.getElementById('muteButton');
    muteBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      muteBtn.textContent = isMuted ? '🔇' : '🔊';
      if (engineGainNode) {
        engineGainNode.gain.setValueAtTime(isMuted ? 0 : 0.15, audioCtx.currentTime);
      }
    });
    
    // Skip button
    const skipBtn = document.getElementById('skipButton');
    skipBtn.addEventListener('click', skipGame);
  }
  
  // Skip the game
  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      // Enable scrolling
      document.body.classList.remove('game-active');
      // Hero is already visible in background, just scroll to top
      window.scrollTo(0, 0);
    }, 500);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();