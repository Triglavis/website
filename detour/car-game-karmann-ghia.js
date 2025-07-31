(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      pixelSize: 1,
      gridSize: 16,
      colors: {
        bg: 'transparent',
        fg: '#ffffff',
        car: '#ffffff', // Classic VW color
        shadow: 'rgba(0, 0, 0, 0.3)'
      }
    },
    car: {
      // VW Karmann-Ghia specs (1970 model)
      mass: 850, // kg (lightweight!)
      wheelbase: 2.4, // meters
      trackWidth: 1.3, // meters
      wheelRadius: 0.27, // meters (165SR15 tires)
      
      // Suspension
      springRate: 15000, // N/m (soft suspension)
      damperRate: 1200, // Ns/m
      maxSuspensionTravel: 0.15, // meters
      rollStiffness: 5000, // Nm/rad
      
      // Aerodynamics
      dragCoefficient: 0.42, // Not very aerodynamic!
      frontalArea: 1.7, // m²
      downforceCoefficient: -0.1, // Slight lift at speed
      
      // Physics
      rollingResistance: 0.018,
      maxSteerAngle: 0.65, // radians
      steerSpeed: 2.5, // rad/s
      centerOfGravityHeight: 0.5, // meters
      wheelInertia: 0.8,
      
      // Engine specs (1600cc air-cooled)
      idleRpm: 900,
      redlineRpm: 4800, // Low redline!
      maxTorqueRpm: 2800,
      maxTorque: 105, // Nm (not much!)
      maxPower: 50, // HP @ 4000rpm
      engineInertia: 0.15,
      engineBraking: 0.3,
      
      // Transmission (4-speed manual)
      gearRatios: [0, 3.8, 2.06, 1.26, 0.88], // 0 = neutral
      finalDriveRatio: 4.125, // Beetle transaxle
      clutchEngageTime: 0.15,
      shiftTime: 0.2,
      
      // Brakes (drums all around)
      maxBrakeForce: 5000, // N (not great!)
      brakeBias: 0.65, // Front bias
      
      // Tires (bias-ply characteristics)
      tireGrip: 0.75, // Lower than modern radials
      slipAnglePerG: 8, // degrees - lots of body roll!
      
      // Sound characteristics
      exhaustNote: 0.8, // Distinctive VW sound
      engineRoughness: 3 // Air-cooled roughness
    },
    physics: {
      gravity: 9.81,
      airDensity: 1.2,
      dt: 1/60
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
    // Position & orientation
    x: 10,
    y: 20,
    angle: 0,
    
    // Velocity
    speed: 0,
    vx: 0,
    vy: 0,
    angularVelocity: 0,
    
    // Acceleration
    ax: 0,
    ay: 0,
    
    // Suspension state (4 corners)
    suspension: {
      fl: { compression: 0, velocity: 0 }, // Front left
      fr: { compression: 0, velocity: 0 }, // Front right
      rl: { compression: 0, velocity: 0 }, // Rear left
      rr: { compression: 0, velocity: 0 }  // Rear right
    },
    
    // Body dynamics
    pitch: 0, // Front/back tilt
    roll: 0,  // Left/right lean
    pitchVelocity: 0,
    rollVelocity: 0,
    
    // Weight transfer
    weightTransferX: 0, // Left/right
    weightTransferZ: 0, // Front/back
    
    // Engine state
    engineRpm: 900,
    throttle: 0,
    brake: 0,
    gear: 1,
    clutch: 1.0,
    isShifting: false,
    shiftProgress: 0,
    nextGear: 1,
    
    // Steering
    steerAngle: 0,
    
    // Forces
    engineTorque: 0,
    wheelTorque: 0,
    tractionForce: { x: 0, y: 0 },
    
    // Tire state
    wheelSpin: [0, 0, 0, 0], // FL, FR, RL, RR
    slipAngle: 0,
    lateralSlip: 0,
    
    // Visual state
    facing: 'right',
    trail: [],
    collisions: 0,
    
    // Effects
    isSkidding: false,
    isBraking: false
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

  // Initialize audio with VW sound characteristics
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Engine sound (distinctive VW boxer)
    engineOscillator = audioCtx.createOscillator();
    engineGainNode = audioCtx.createGain();
    
    // Add some filters for that air-cooled sound
    const engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'bandpass';
    engineFilter.frequency.value = 200;
    engineFilter.Q.value = 2;
    
    engineOscillator.type = 'sawtooth';
    engineOscillator.connect(engineFilter);
    engineFilter.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    engineOscillator.start();
    
    // Exhaust sound (raspy VW note)
    exhaustOscillator = audioCtx.createOscillator();
    exhaustGainNode = audioCtx.createGain();
    exhaustOscillator.type = 'square';
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
      tireSqueal: () => playTone(800, 0.1, 'sawtooth', 0.05)
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

  // Calculate engine torque (VW characteristics)
  function calculateEngineTorque(rpm, throttle) {
    if (rpm < CONFIG.car.idleRpm || throttle <= 0) return 0;
    
    // VW torque curve - fairly flat
    const normalizedRpm = rpm / CONFIG.car.maxTorqueRpm;
    let torqueFactor;
    
    if (normalizedRpm <= 0.5) {
      torqueFactor = 0.6 + 0.4 * (normalizedRpm * 2);
    } else if (normalizedRpm <= 1.0) {
      torqueFactor = 1.0; // Peak torque
    } else if (normalizedRpm <= 1.4) {
      torqueFactor = 1.0 - 0.2 * ((normalizedRpm - 1) / 0.4);
    } else {
      torqueFactor = 0.8 - 0.5 * ((normalizedRpm - 1.4) / 0.6);
    }
    
    torqueFactor = Math.max(0.1, Math.min(1.0, torqueFactor));
    
    return CONFIG.car.maxTorque * torqueFactor * throttle;
  }

  // Update suspension physics
  function updateSuspension(dt) {
    const k = CONFIG.car.springRate;
    const c = CONFIG.car.damperRate;
    
    // Calculate load on each wheel based on weight transfer
    const staticLoad = CONFIG.car.mass * CONFIG.physics.gravity / 4;
    
    // Weight transfer from acceleration/braking
    const accelG = car.ax / CONFIG.physics.gravity;
    const brakeG = -car.ax / CONFIG.physics.gravity;
    car.weightTransferZ = (accelG - brakeG) * CONFIG.car.mass * CONFIG.car.centerOfGravityHeight / CONFIG.car.wheelbase;
    
    // Weight transfer from cornering
    const lateralG = car.ay / CONFIG.physics.gravity;
    car.weightTransferX = lateralG * CONFIG.car.mass * CONFIG.car.centerOfGravityHeight / CONFIG.car.trackWidth;
    
    // Update each corner
    const corners = ['fl', 'fr', 'rl', 'rr'];
    const isRear = { fl: false, fr: false, rl: true, rr: true };
    const isRight = { fl: false, fr: true, rl: false, rr: true };
    
    corners.forEach(corner => {
      const suspension = car.suspension[corner];
      
      // Calculate load
      let load = staticLoad;
      load += isRear[corner] ? car.weightTransferZ : -car.weightTransferZ;
      load += isRight[corner] ? car.weightTransferX : -car.weightTransferX;
      
      // Spring force
      const springForce = -k * suspension.compression;
      
      // Damper force
      const damperForce = -c * suspension.velocity;
      
      // Total force
      const totalForce = springForce + damperForce + load;
      
      // Update suspension
      const accel = totalForce / (CONFIG.car.mass / 4);
      suspension.velocity += accel * dt;
      suspension.compression += suspension.velocity * dt;
      
      // Limit travel
      suspension.compression = Math.max(-CONFIG.car.maxSuspensionTravel, 
                                       Math.min(CONFIG.car.maxSuspensionTravel, suspension.compression));
    });
    
    // Update body pitch and roll
    const frontCompression = (car.suspension.fl.compression + car.suspension.fr.compression) / 2;
    const rearCompression = (car.suspension.rl.compression + car.suspension.rr.compression) / 2;
    const leftCompression = (car.suspension.fl.compression + car.suspension.rl.compression) / 2;
    const rightCompression = (car.suspension.fr.compression + car.suspension.rr.compression) / 2;
    
    car.pitch = Math.atan2(rearCompression - frontCompression, CONFIG.car.wheelbase);
    car.roll = Math.atan2(rightCompression - leftCompression, CONFIG.car.trackWidth);
  }

  // Update transmission with VW characteristics
  function updateTransmission(dt) {
    // Handle shifting
    if (car.isShifting) {
      car.shiftProgress += dt / CONFIG.car.shiftTime;
      
      if (car.shiftProgress >= 1.0) {
        // Shift complete
        car.gear = car.nextGear;
        car.isShifting = false;
        car.shiftProgress = 0;
        car.clutch = 1.0;
        sounds.gearShift && sounds.gearShift();
        
        // VW gearbox lurch
        const lurchForce = 0.25;
        car.vx *= (1 - lurchForce);
        car.vy *= (1 - lurchForce);
        
        // Suspension reaction
        car.suspension.rl.velocity -= 0.5;
        car.suspension.rr.velocity -= 0.5;
      } else {
        // Clutch disengaged during shift
        car.clutch = 0;
      }
    }
    
    // Calculate wheel speed from vehicle speed
    if (car.clutch > 0 && car.gear > 0 && car.speed > 0.1) {
      const gearRatio = CONFIG.car.gearRatios[car.gear];
      const totalRatio = gearRatio * CONFIG.car.finalDriveRatio;
      
      // Wheel RPM from vehicle speed
      const wheelCircumference = 2 * Math.PI * CONFIG.car.wheelRadius;
      const wheelRpm = (car.speed * 60) / wheelCircumference;
      
      // Engine RPM connected through gears
      const targetRpm = wheelRpm * totalRatio;
      
      // Only sync RPM if target is above idle
      if (targetRpm > CONFIG.car.idleRpm) {
        const rpmDiff = targetRpm - car.engineRpm;
        car.engineRpm += rpmDiff * car.clutch * dt * 5;
      }
    }
    
    // Engine RPM physics
    if (car.clutch < 1.0 || car.gear === 0 || car.speed < 0.5) {
      // Free revving or slow speed - engine responds to throttle
      const engineDrag = 0.05;
      const idleTorque = car.throttle === 0 ? 5 : 0; // Small torque to maintain idle
      const throttleTorque = calculateEngineTorque(car.engineRpm, car.throttle);
      const dragTorque = car.engineRpm * engineDrag;
      
      const netTorque = throttleTorque + idleTorque - dragTorque;
      const rpmAccel = (netTorque / CONFIG.car.engineInertia) * 60 / (2 * Math.PI);
      
      car.engineRpm += rpmAccel * dt;
    }
    
    // VW won't rev past 4800!
    if (car.engineRpm >= CONFIG.car.redlineRpm) {
      car.engineRpm = CONFIG.car.redlineRpm;
      car.throttle = 0; // Fuel cut
    }
    
    // Prevent stalling
    if (car.engineRpm < CONFIG.car.idleRpm && car.throttle < 0.1) {
      car.engineRpm = CONFIG.car.idleRpm;
    }
    
    // Automatic shifting (simple logic for VW)
    if (!car.isShifting && car.gear > 0) {
      // Upshift at 3500 RPM (economical)
      if (car.engineRpm > 3500 && car.gear < 4) {
        initiateShift(car.gear + 1);
      }
      // Downshift at 1500 RPM
      else if (car.engineRpm < 1500 && car.gear > 1 && car.throttle > 0.5) {
        initiateShift(car.gear - 1);
      }
    }
  }

  function initiateShift(newGear) {
    if (newGear < 0 || newGear > 4 || car.isShifting) return;
    
    car.isShifting = true;
    car.shiftProgress = 0;
    car.nextGear = newGear;
    car.clutch = 0;
  }

  // Update engine sound with VW characteristics
  function updateEngineSound() {
    if (!engineOscillator || !engineGainNode || isMuted) return;
    
    // VW boxer sound - lower frequency with roughness
    const baseFreq = (car.engineRpm / 60) * CONFIG.car.exhaustNote;
    
    // Add air-cooled roughness
    const roughness = Math.sin(frame * 0.3) * CONFIG.car.engineRoughness;
    
    // Set frequencies
    engineOscillator.frequency.setTargetAtTime(
      baseFreq + roughness,
      audioCtx.currentTime,
      0.01
    );
    
    // Exhaust is half frequency (VW sound)
    exhaustOscillator.frequency.setTargetAtTime(
      (baseFreq + roughness) * 0.5,
      audioCtx.currentTime,
      0.01
    );
    
    // Volume based on load and RPM
    const rpmFactor = car.engineRpm / CONFIG.car.redlineRpm;
    const loadFactor = car.throttle;
    
    let engineVolume = 0.05 + (loadFactor * 0.1) + (rpmFactor * 0.05);
    let exhaustVolume = 0.08 + (loadFactor * 0.08) + (rpmFactor * 0.04);
    
    // Reduce volume during shifts
    if (car.isShifting) {
      engineVolume *= 0.3;
      exhaustVolume *= 0.3;
    }
    
    engineGainNode.gain.setTargetAtTime(engineVolume, audioCtx.currentTime, 0.01);
    exhaustGainNode.gain.setTargetAtTime(exhaustVolume, audioCtx.currentTime, 0.01);
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

  // Main physics update
  function update() {
    const dt = CONFIG.physics.dt;
    const oldX = Math.floor(car.x);
    const oldY = Math.floor(car.y);
    
    // Handle input
    car.throttle = 0;
    car.brake = 0;
    let steerInput = 0;
    
    if (keys['arrowup'] || keys['w']) {
      car.throttle = 1;
    }
    if (keys['arrowdown'] || keys['s']) {
      car.brake = 1;
    }
    if (keys['arrowleft'] || keys['a']) {
      steerInput = -1;
    }
    if (keys['arrowright'] || keys['d']) {
      steerInput = 1;
    }
    
    // Update steering (speed sensitive)
    const steerSensitivity = 1.0 - Math.min(0.7, car.speed / 20);
    const targetSteer = steerInput * CONFIG.car.maxSteerAngle * steerSensitivity;
    car.steerAngle += (targetSteer - car.steerAngle) * dt * CONFIG.car.steerSpeed;
    
    // Update suspension
    updateSuspension(dt);
    
    // Update transmission and engine
    updateTransmission(dt);
    
    // Calculate forces
    if (car.gear > 0 && car.clutch > 0) {
      // Engine force through drivetrain
      car.engineTorque = calculateEngineTorque(car.engineRpm, car.throttle);
      const gearRatio = CONFIG.car.gearRatios[car.gear];
      const totalRatio = gearRatio * CONFIG.car.finalDriveRatio;
      
      car.wheelTorque = car.engineTorque * totalRatio * car.clutch;
      
      // Traction force (rear wheel drive)
      const driveForce = car.wheelTorque / CONFIG.car.wheelRadius;
      
      // Check for wheelspin (rear wheels only)
      const rearLoad = (CONFIG.car.mass * CONFIG.physics.gravity / 2) + car.weightTransferZ;
      const maxTraction = rearLoad * CONFIG.car.tireGrip;
      
      if (Math.abs(driveForce) > maxTraction) {
        // Wheelspin!
        car.wheelSpin[2] = car.wheelSpin[3] = 1.0;
        car.tractionForce.x = Math.cos(car.angle) * Math.sign(driveForce) * maxTraction;
        car.tractionForce.y = Math.sin(car.angle) * Math.sign(driveForce) * maxTraction;
        car.engineRpm = Math.min(car.engineRpm + 1000 * dt, CONFIG.car.redlineRpm);
        
        if (frame % 5 === 0) sounds.tireSqueal && sounds.tireSqueal();
      } else {
        car.wheelSpin[2] = car.wheelSpin[3] = Math.abs(driveForce) / maxTraction;
        car.tractionForce.x = Math.cos(car.angle) * driveForce;
        car.tractionForce.y = Math.sin(car.angle) * driveForce;
      }
    } else {
      car.tractionForce.x = car.tractionForce.y = 0;
    }
    
    // Braking forces (drums aren't great!)
    if (car.brake > 0) {
      const brakeForce = CONFIG.car.maxBrakeForce * car.brake;
      const brakeForceFront = brakeForce * CONFIG.car.brakeBias;
      const brakeForceRear = brakeForce * (1 - CONFIG.car.brakeBias);
      
      // Apply brake force opposite to velocity
      if (car.speed > 0.1) {
        const brakeX = -(car.vx / car.speed) * (brakeForceFront + brakeForceRear) / CONFIG.car.mass;
        const brakeY = -(car.vy / car.speed) * (brakeForceFront + brakeForceRear) / CONFIG.car.mass;
        
        car.ax += brakeX;
        car.ay += brakeY;
        
        // Weight transfer under braking
        car.suspension.fl.velocity += 0.3 * car.brake;
        car.suspension.fr.velocity += 0.3 * car.brake;
        car.suspension.rl.velocity -= 0.2 * car.brake;
        car.suspension.rr.velocity -= 0.2 * car.brake;
      }
      
      car.isBraking = true;
    } else {
      car.isBraking = false;
    }
    
    // Cornering physics (Ackermann steering)
    if (Math.abs(car.steerAngle) > 0.01 && car.speed > 0.1) {
      const turnRadius = CONFIG.car.wheelbase / Math.tan(car.steerAngle);
      const lateralAccel = car.speed * car.speed / turnRadius;
      
      // Check for understeer/oversteer
      const maxLateralG = CONFIG.car.tireGrip * CONFIG.physics.gravity;
      
      if (Math.abs(lateralAccel) > maxLateralG) {
        // Sliding!
        car.isSkidding = true;
        car.slipAngle = CONFIG.car.slipAnglePerG * (lateralAccel / CONFIG.physics.gravity);
        
        // Reduce cornering force
        const slipFactor = maxLateralG / Math.abs(lateralAccel);
        car.angularVelocity = (car.speed / turnRadius) * slipFactor;
        
        if (frame % 3 === 0) sounds.tireSqueal && sounds.tireSqueal();
      } else {
        car.isSkidding = false;
        car.angularVelocity = car.speed / turnRadius;
      }
      
      // Update angle
      car.angle += car.angularVelocity * dt;
      
      // Update velocity direction
      const newVx = Math.cos(car.angle) * car.speed;
      const newVy = Math.sin(car.angle) * car.speed;
      
      // Blend based on grip
      const gripFactor = car.isSkidding ? 0.7 : 0.95;
      car.vx = car.vx * (1 - gripFactor) + newVx * gripFactor;
      car.vy = car.vy * (1 - gripFactor) + newVy * gripFactor;
    }
    
    // Apply traction force
    car.ax = car.tractionForce.x / CONFIG.car.mass;
    car.ay = car.tractionForce.y / CONFIG.car.mass;
    
    // Engine braking
    if (car.throttle === 0 && car.gear > 0 && car.clutch > 0) {
      const engineBrakeForce = car.engineRpm * CONFIG.car.engineBraking;
      car.ax -= Math.cos(car.angle) * engineBrakeForce / CONFIG.car.mass;
      car.ay -= Math.sin(car.angle) * engineBrakeForce / CONFIG.car.mass;
    }
    
    // Aerodynamic drag (significant for VW!)
    const dragForce = 0.5 * CONFIG.physics.airDensity * CONFIG.car.dragCoefficient * 
                      CONFIG.car.frontalArea * car.speed * car.speed;
    if (car.speed > 0) {
      car.ax -= (car.vx / car.speed) * dragForce / CONFIG.car.mass;
      car.ay -= (car.vy / car.speed) * dragForce / CONFIG.car.mass;
    }
    
    // Rolling resistance
    const rollingForce = CONFIG.car.rollingResistance * CONFIG.car.mass * CONFIG.physics.gravity;
    if (car.speed > 0) {
      car.ax -= (car.vx / car.speed) * rollingForce / CONFIG.car.mass;
      car.ay -= (car.vy / car.speed) * rollingForce / CONFIG.car.mass;
    }
    
    // Update velocity
    car.vx += car.ax * dt;
    car.vy += car.ay * dt;
    
    // Update position
    car.x += car.vx * dt * 2; // Scale for grid
    car.y += car.vy * dt * 2;
    
    // Update speed
    car.speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    
    // Update facing direction
    const angleDegs = (car.angle * 180 / Math.PI + 360) % 360;
    if (angleDegs >= 315 || angleDegs < 45) car.facing = 'right';
    else if (angleDegs >= 45 && angleDegs < 135) car.facing = 'down';
    else if (angleDegs >= 135 && angleDegs < 225) car.facing = 'left';
    else car.facing = 'up';
    
    // Wall collision detection and physics
    const margin = 1.5; // Grid units from edge
    let hitWall = false;
    let wallNormal = { x: 0, y: 0 };
    
    // Check each wall
    if (car.x < margin) {
      hitWall = true;
      wallNormal.x = 1; // Left wall pushes right
      car.x = margin;
    } else if (car.x > gridWidth - margin) {
      hitWall = true;
      wallNormal.x = -1; // Right wall pushes left
      car.x = gridWidth - margin;
    }
    
    if (car.y < margin) {
      hitWall = true;
      wallNormal.y = 1; // Top wall pushes down
      car.y = margin;
    } else if (car.y > gridHeight - margin) {
      hitWall = true;
      wallNormal.y = -1; // Bottom wall pushes up
      car.y = gridHeight - margin;
    }
    
    // Apply wall collision physics
    if (hitWall) {
      // Calculate impact force
      const impactSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
      const restitution = 0.3; // How bouncy the collision is (0 = dead stop, 1 = perfect bounce)
      
      // Normalize wall normal
      const normalMag = Math.sqrt(wallNormal.x * wallNormal.x + wallNormal.y * wallNormal.y);
      if (normalMag > 0) {
        wallNormal.x /= normalMag;
        wallNormal.y /= normalMag;
      }
      
      // Calculate velocity component into wall
      const dotProduct = car.vx * wallNormal.x + car.vy * wallNormal.y;
      
      if (dotProduct < 0) { // Moving into wall
        // Reflect velocity
        car.vx -= (1 + restitution) * dotProduct * wallNormal.x;
        car.vy -= (1 + restitution) * dotProduct * wallNormal.y;
        
        // Damage effects
        car.collisions++;
        
        // Engine stall on hard impact
        if (impactSpeed > 5) {
          car.engineRpm *= 0.5;
          if (car.gear > 1) {
            initiateShift(1);
          }
        }
        
        // Suspension jolt
        const suspensionImpact = impactSpeed * 0.3;
        car.suspension.fl.velocity += (Math.random() - 0.5) * suspensionImpact;
        car.suspension.fr.velocity += (Math.random() - 0.5) * suspensionImpact;
        car.suspension.rl.velocity += (Math.random() - 0.5) * suspensionImpact;
        car.suspension.rr.velocity += (Math.random() - 0.5) * suspensionImpact;
        
        // Add some spin from off-center impacts
        car.angularVelocity += (Math.random() - 0.5) * impactSpeed * 0.2;
        
        // Sound effect
        if (impactSpeed > 2) {
          sounds.collision && sounds.collision();
        }
        
        // Create impact particles
        for (let i = 0; i < Math.min(8, Math.floor(impactSpeed)); i++) {
          particles.push({
            x: car.x - wallNormal.x * 0.5,
            y: car.y - wallNormal.y * 0.5,
            vx: (Math.random() - 0.5) * 2 + wallNormal.x * 2,
            vy: (Math.random() - 0.5) * 2 + wallNormal.y * 2,
            life: 30,
            symbol: ['#', '*', '×', '!'][Math.floor(Math.random() * 4)]
          });
        }
      }
    }
    
    // Check if moved to new grid cell
    const newX = Math.floor(car.x);
    const newY = Math.floor(car.y);
    
    if (newX !== oldX || newY !== oldY) {
      // Add to trail
      car.trail.push({ 
        x: oldX, 
        y: oldY, 
        life: car.isSkidding ? 40 : 20,
        skid: car.isSkidding 
      });
      if (car.trail.length > 50) car.trail.shift();
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
        car.vx *= -1.5;
        car.vy *= -1.5;
        sounds.collision && sounds.collision();
        
        // Drop to first gear
        if (car.gear > 1) {
          initiateShift(1);
        }
        
        // Suspension reaction
        car.suspension.fl.velocity += Math.random() * 2 - 1;
        car.suspension.fr.velocity += Math.random() * 2 - 1;
        car.suspension.rl.velocity += Math.random() * 2 - 1;
        car.suspension.rr.velocity += Math.random() * 2 - 1;
        
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
      
      // Fix the car!
      car.engineRpm = 3000;
      car.throttle = 1;
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
    // Clear with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const size = CONFIG.canvas.gridSize;
    
    // Draw walls/boundaries
    ctx.strokeStyle = CONFIG.canvas.colors.fg;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.3;
    ctx.strokeRect(size, size, canvas.width - size * 2, canvas.height - size * 2);
    
    // Draw warning stripes near edges
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.globalAlpha = 0.15;
    const stripeWidth = size * 0.5;
    
    // Top and bottom stripes
    for (let x = 0; x < canvas.width; x += stripeWidth * 2) {
      ctx.fillRect(x, 0, stripeWidth, size);
      ctx.fillRect(x, canvas.height - size, stripeWidth, size);
    }
    
    // Left and right stripes
    for (let y = 0; y < canvas.height; y += stripeWidth * 2) {
      ctx.fillRect(0, y, size, stripeWidth);
      ctx.fillRect(canvas.width - size, y, size, stripeWidth);
    }
    
    ctx.globalAlpha = 1;
    
    // Draw trail with tire marks
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    car.trail.forEach((t, i) => {
      ctx.globalAlpha = (t.life / 40) * 0.5;
      const symbol = t.skid ? '=' : '·';
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
    
    // Draw car as VW Karmann-Ghia ASCII art
    drawKarmannGhia(ctx, car.x * size, car.y * size, car.angle);
    
    // Draw UI
    drawUI();
  }
  
  // Draw ASCII VW Karmann-Ghia
  function drawKarmannGhia(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x + CONFIG.canvas.gridSize * 1.5, y + CONFIG.canvas.gridSize);
    ctx.rotate(angle);
    
    // Apply suspension effects
    const avgCompression = (car.suspension.fl.compression + car.suspension.fr.compression + 
                            car.suspension.rl.compression + car.suspension.rr.compression) / 4;
    ctx.translate(0, avgCompression * 20);
    
    // Apply pitch and roll
    ctx.rotate(car.pitch * 0.5);
    ctx.scale(1 + car.roll * 0.1, 1 - car.roll * 0.1);
    
    ctx.font = `${CONFIG.canvas.gridSize * 0.7}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Karmann-Ghia ASCII art (sleek profile)
    const ghiaArt = [
      [`   ╱─╲   `, `╱═◐ ◐═╲`, `╰─═══─╯`],  // Right (classic profile)
      [`╭─◐─╮`, `║ ╬ ║`, `╰─◐─╯`],         // Down
      [`╭─═══─╮`, `╱═◑ ◑═╲`, `   ╲─╱   `],  // Left
      [`╭─◑─╮`, `║ ╬ ║`, `╰─◑─╯`]          // Up
    ];
    
    const sprites = {
      'right': 0,
      'down': 1,
      'left': 2,
      'up': 3
    };
    
    const sprite = ghiaArt[sprites[car.facing] || 0];
    
    // Draw car with gear indicator in center
    ctx.fillStyle = CONFIG.canvas.colors.car;
    
    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = CONFIG.canvas.colors.shadow;
    sprite.forEach((line, i) => {
      const gearLine = line.replace('╬', car.gear || 'N');
      ctx.fillText(gearLine, 2, (i - 1) * CONFIG.canvas.gridSize * 0.5 + 2);
    });
    
    // Car body
    ctx.globalAlpha = 1;
    ctx.fillStyle = CONFIG.canvas.colors.car;
    sprite.forEach((line, i) => {
      const gearLine = line.replace('╬', car.gear || 'N');
      ctx.fillText(gearLine, 0, (i - 1) * CONFIG.canvas.gridSize * 0.5);
    });
    
    // Tire smoke when slipping
    if (car.isSkidding || car.wheelSpin[2] > 0.5) {
      ctx.globalAlpha = 0.5;
      ctx.fillText('≈≈', -CONFIG.canvas.gridSize, CONFIG.canvas.gridSize * 0.5);
      ctx.fillText('≈≈', -CONFIG.canvas.gridSize * 0.5, CONFIG.canvas.gridSize * 0.7);
    }
    
    // Brake lights
    if (car.isBraking) {
      ctx.fillStyle = '#ff0000';
      ctx.globalAlpha = 0.8;
      ctx.fillText('◉◉', -CONFIG.canvas.gridSize * 0.8, 0);
    }
    
    ctx.restore();
  }

  function drawUI() {
    const size = CONFIG.canvas.gridSize;
    
    // Semi-transparent top bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, size * 3);
    
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${size}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Stats
    ctx.fillText(`DAMAGE: ${car.collisions}`, size, size * 0.5);
    ctx.fillText(`GEAR: ${car.gear === 0 ? 'N' : car.gear}/4`, size * 8, size * 0.5);
    ctx.fillText(`RPM: ${Math.round(car.engineRpm)}`, size * 15, size * 0.5);
    ctx.fillText(`MPH: ${Math.round(car.speed * 2.237)}`, size * 25, size * 0.5);
    
    // Show damage state
    if (car.collisions > 10) {
      ctx.fillStyle = '#ff0000';
      ctx.fillText('SEVERE DAMAGE!', size * 35, size * 0.5);
      ctx.fillStyle = CONFIG.canvas.colors.fg;
    }
    
    // VW RPM gauge (lower redline)
    const rpmPercent = (car.engineRpm - CONFIG.car.idleRpm) / (CONFIG.car.redlineRpm - CONFIG.car.idleRpm);
    const gaugeWidth = 20;
    const gaugeFilled = Math.floor(rpmPercent * gaugeWidth);
    
    ctx.font = `${size * 0.8}px monospace`;
    let rpmGauge = '[';
    for (let i = 0; i < gaugeWidth; i++) {
      if (i < gaugeFilled) {
        rpmGauge += i >= gaugeWidth - 5 ? '!' : '|';
      } else {
        rpmGauge += '-';
      }
    }
    rpmGauge += ']';
    
    ctx.fillStyle = car.engineRpm > 4000 ? '#ff0000' : CONFIG.canvas.colors.fg;
    ctx.fillText(rpmGauge, size, size * 1.5);
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    
    // VW quirks
    ctx.fillText(`TEMP: ${car.engineRpm > 3500 ? 'HOT' : 'OK'}`, size * 25, size * 1.5);
    
    // Instructions
    ctx.font = `${size * 0.7}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD/ARROWS • ESC=SKIP • VW KARMANN-GHIA', canvas.width - size, size * 0.5);
    
    // Shifting indicator
    if (car.isShifting) {
      ctx.textAlign = 'center';
      ctx.font = `${size * 1.2}px monospace`;
      ctx.fillText('SHIFTING...', canvas.width / 2, size * 2);
    }
    
    // State
    ctx.textAlign = 'center';
    ctx.font = `${size * 0.8}px monospace`;
    ctx.fillText(`[${gameState.toUpperCase()}]`, canvas.width / 2, size * 2.5);
    
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