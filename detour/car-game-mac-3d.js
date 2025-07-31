(() => {
  // Macintosh-style monochrome 3D car game
  // Pixelation settings
  let pixelationEnabled = false;
  let pixelScale = 4; // How much to downscale (1 = no pixelation, 4 = 1/4 resolution)
  let pixelRenderWidth = 640;
  let pixelRenderHeight = 480;
  
  const CONFIG = {
    // Lower resolution for pixelated look
    renderWidth: 640,
    renderHeight: 480,
    
    // Monochrome only
    colors: {
      black: 0x000000,
      white: 0xFFFFFF,
      gray50: 0x808080,  // 50% gray for dithering
    },
    
    car: {
      maxSpeed: 25,  // Increased from 10 to feel faster
      acceleration: 30,  // Increased from 15 for quicker acceleration
      turnSpeed: 3,
      friction: 0.99,  // High value means low friction (1 - 0.01 = 0.99)
      size: { width: 1.2, height: 0.9, length: 2 }  // Taller car (was 0.6)
    }
  };

  let scene, camera, renderer;
  let car, carGroup;
  let displayCanvas, displayCtx;
  let directionalLight; // Store light reference for dynamic updates
  let leftPlatform, rightPlatform; // Platform references for dev labels
  let pixelCanvas, pixelCtx; // For pixelated rendering
  
  // Surface type definitions for different terrain
  const SURFACE_TYPES = {
    asphalt: {
      friction: 0.6,  // Moderate friction
      rollingResistance: 0.01,
      color: 0x333333,
      skidmarkOpacity: 0.8,
      sound: 'asphalt'
    },
    wet_asphalt: {
      friction: 0.5,
      rollingResistance: 0.015,
      color: 0x222222,
      skidmarkOpacity: 0.4,
      sound: 'wet'
    },
    ice: {
      friction: 0.2,
      rollingResistance: 0.005,
      color: 0xCCDDEE,
      skidmarkOpacity: 0.1,
      sound: 'ice'
    },
    sand: {
      friction: 0.4,
      rollingResistance: 0.1,
      color: 0xC2B280,
      skidmarkOpacity: 0.3,
      sound: 'sand',
      speedPenalty: 0.7
    },
    mud: {
      friction: 0.35,
      rollingResistance: 0.15,
      color: 0x6B4423,
      skidmarkOpacity: 0.9,
      sound: 'mud',
      speedPenalty: 0.5,
      sinkDepth: 0.05
    },
    oil: {
      friction: 0.1,
      rollingResistance: 0.005,
      color: 0x1A1A1A,
      skidmarkOpacity: 0.6,
      sound: 'oil',
      slipMultiplier: 2.0
    }
  };
  
  /*
   * PHYSICS SYSTEMS DOCUMENTATION
   * =============================
   * 
   * 1. TIRE PHYSICS (Pacejka Magic Formula)
   * ---------------------------------------
   * - Each tire has individual slip angle and slip ratio calculations
   * - Lateral forces: Fy = D * sin(C * atan(B * slipAngle))
   *   - B: Stiffness factor (10.0)
   *   - C: Shape factor (1.4)
   *   - D: Peak value = load * friction * 2.0
   * - Longitudinal forces: Similar formula for acceleration/braking
   * - Combined forces limited by friction circle: sqrt(Fx² + Fy²) ≤ μ*Fz
   * - Slip angle = atan2(lateral velocity, longitudinal velocity)
   * - Slip ratio = (wheel speed - ground speed) / max(speeds)
   * 
   * 2. SURFACE TYPES & FRICTION
   * ---------------------------
   * - Asphalt: μ = 0.8 (default)
   * - Ice: μ = 0.2 (very slippery)
   * - Sand: μ = 0.4 (loose, reduces grip)
   * - Oil: μ = 0.15 (extremely slippery)
   * - Mud: μ = 0.3 (sticky but low grip)
   * - Each tire detects its current surface via raycasting
   * - Surface friction multiplies with tire grip for final traction
   * 
   * 3. SUSPENSION SYSTEM
   * --------------------
   * - Spring-damper model: F = -kx - cv
   *   - Spring stiffness k = 40000 N/m
   *   - Damping coefficient c = 3000 Ns/m
   * - Weight transfer during acceleration/braking/cornering
   * - Individual tire compression based on ground height
   * - Suspension travel limits: 0.1m compression, 0.05m extension
   * - Rest compression calculated from static load distribution
   * 
   * 4. TERRAIN & RAYCASTING
   * -----------------------
   * - Each tire performs vertical raycast to detect ground
   * - Detects ramps, surface patches, and elevation changes
   * - Ground height stored per tire for suspension calculations
   * - Platform boundaries checked first, then terrain elements
   * - Ramps have angle property for physics calculations
   * 
   * 5. WEIGHT DISTRIBUTION
   * ----------------------
   * - Static: 48% front, 52% rear (rear-biased for RWD)
   * - Dynamic weight transfer based on:
   *   - Longitudinal acceleration (pitch)
   *   - Lateral acceleration (roll)
   *   - Suspension compression
   * - Center of gravity: 0.18m high (low for stability)
   * 
   * 6. SKID MARKS
   * -------------
   * - Generated when tire slip exceeds thresholds
   * - Lateral slip threshold: 0.15 radians (8.6°)
   * - Longitudinal slip threshold: 0.25 (25%)
   * - Combined slip check using friction circle
   * - Intensity based on slip magnitude
   * - Only created when tires contact ground
   * 
   * 7. ENGINE & TRANSMISSION
   * ------------------------
   * - Power-limited acceleration: P = F * v
   * - Gear ratios affect torque multiplication
   * - Reverse gear with engagement delay (0.2s)
   * - Engine braking in forward gears
   * - Max power: 40kW, Max torque: 250Nm
   * 
   * 8. AERODYNAMICS
   * ---------------
   * - Drag force: F = 0.5 * ρ * Cd * A * v²
   * - Drag coefficient Cd = 0.3
   * - Frontal area A = 1.8 m²
   * - Creates speed-dependent resistance
   * - Affects top speed and deceleration
   */
  
  // Game state
  let gameState = {
    // Cinematic control
    cinematicActive: false,
    cinematicSequence: null,
    
    // Position
    x: 0,      // Start at center
    z: 10,     // Start before first road sign
    y: 0.5,    // Ground level
    angle: Math.PI,  // Facing west (negative X) - rotated 90 degrees counterclockwise from north
    pitch: 0,  // Vertical rotation (nose up/down)
    roll: 0,   // Side-to-side rotation
    
    // Velocity
    vx: 0,     // Horizontal velocity X
    vz: 0,     // Horizontal velocity Z
    vy: 0,     // Vertical velocity
    angularVelocity: 0,  // Rotation speed around Y axis
    pitchVelocity: 0,    // Pitch rotation speed
    rollVelocity: 0,     // Roll rotation speed
    
    // Wheel physics
    wheelAngle: 0,  // Front wheel steering angle (-45 to 45 degrees)
    wheelSpeed: 0,  // Wheel rotation speed (rad/s)
    frontWheelSpeed: 0,  // Front wheel angular velocity
    
    // Physics constants
    mass: 1000,  // kg - Lighter for better performance
    wheelbase: 1.2,  // Distance between front and rear axles (default 1.2m)
    gravity: 9.81,  // m/s² - gravitational acceleration (Earth gravity)
    momentOfInertia: 1200,  // kg⋅m² - Adjusted for lighter car
    enginePower: 120000,  // 120 kW (160 hp) - Much more power
    maxTorque: 900,  // Nm - High torque for good acceleration
    dragCoefficient: 0.28,  // Slightly reduced for better performance
    frontalArea: 2.2,  // m² - frontal area
    rollingResistance: 0.05,  // Much higher for aggressive coast-to-stop
    wheelDiameter: 0.4,  // m - tire diameter (matches visual geometry)
    maxEngineRPM: 5500,  // Engine can rev but struggles with weight
    gearRatios: [3.5, 2.2, 1.5, 1.0, -3.5],  // Better gear spacing
    finalDriveRatio: 3.2,  // Slightly lower for better top speed
    
    // Tire traction and suspension data
    tires: {
      frontLeft: { 
        x: 0, z: 0, y: 0, grip: 1.0, skidding: false,
        springCompression: 0, springVelocity: 0, 
        weightLoad: 0, normalForce: 0, onGround: true,
        groundHeight: 0,
        // New physics properties
        slipAngle: 0,      // Angle between tire heading and velocity
        slipRatio: 0,      // Longitudinal slip
        lateralForce: 0,   // Lateral force from slip
        longitudinalForce: 0,
        surfaceFriction: 0.8, // Consistent friction for all tires
        groundNormal: { x: 0, y: 1, z: 0 }, // Normal vector of ground
        angularVelocity: 0 // Individual wheel rotation speed
      },
      frontRight: { 
        x: 0, z: 0, y: 0, grip: 1.0, skidding: false,
        springCompression: 0, springVelocity: 0, 
        weightLoad: 0, normalForce: 0, onGround: true,
        groundHeight: 0,
        slipAngle: 0,
        slipRatio: 0,
        lateralForce: 0,
        longitudinalForce: 0,
        surfaceFriction: 0.8,
        groundNormal: { x: 0, y: 1, z: 0 },
        angularVelocity: 0
      },
      rearLeft: { 
        x: 0, z: 0, y: 0, grip: 1.0, skidding: false,
        springCompression: 0, springVelocity: 0, 
        weightLoad: 0, normalForce: 0, onGround: true,
        groundHeight: 0,
        slipAngle: 0,
        slipRatio: 0,
        lateralForce: 0,
        longitudinalForce: 0,
        surfaceFriction: 0.9,  // Better rear grip
        groundNormal: { x: 0, y: 1, z: 0 },
        angularVelocity: 0
      },
      rearRight: { 
        x: 0, z: 0, y: 0, grip: 1.0, skidding: false,
        springCompression: 0, springVelocity: 0, 
        weightLoad: 0, normalForce: 0, onGround: true,
        groundHeight: 0,
        slipAngle: 0,
        slipRatio: 0,
        lateralForce: 0,
        longitudinalForce: 0,
        surfaceFriction: 0.9,  // Better rear grip
        groundNormal: { x: 0, y: 1, z: 0 },
        angularVelocity: 0
      }
    },
    
    // Suspension physics constants
    suspension: {
      springStiffness: 40000,   // N/m - Updated default
      damperCoefficient: 3000,  // Ns/m - Increased for better stability
      restLength: 0.2,  // m - uncompressed spring length (wheel radius)
      maxCompression: 0.15,  // m - More compression for van-like wallowing
      maxExtension: 1.0  // m - maximum extension in freefall (5x wheel height!)
    },
    
    // Ride height - distance from wheel center to car bottom
    rideHeightOffset: -0.29,  // m - Default ride height
    
    // Transmission state
    stoppedTime: 0,  // Time spent at zero speed
    reverseEngageDelay: 0.2,  // 1/5 second delay for reverse
    canEngageReverse: false,
    currentGearIndex: 0,  // Start in 1st gear (0-3 = forward gears, 4 = reverse)
    lastGear: null,  // Track gear changes for sound effects (null to ensure first gear triggers sound)
    lastGearChangeTime: 0,  // Prevent rapid gear change sounds
    
    // Other
    collisions: 0,
    trail: [],
    falling: false,
    fallY: 0,
    
    // Browser Country state
    browserCountryEntered: false,
    browserCountryExpanded: false,
    
  };
  
  // Browser Country zones
  let zones = {
    safe: { x: 0, z: 0, radius: 30 },
    browser: { x: 50, z: 0, radius: 40 }
  };
  
  let obstacles = [];
  let keys = {};
  let frame = 0;
  let skidMarks = [];  // Array to store skid mark objects
  const MAX_SKID_MARKS = 500;  // Limit for performance
  
  // Tire inking system
  let tireInked = {
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0
  };
  const TIRE_INK_DECAY = 0.02; // How fast ink fades per frame
  const MAX_INK_MARKS = 200; // Limit ink marks for performance
  
  // Intro animation state
  let introState = {
    isPlaying: true,
    phase: 'driving', // 'driving', 'stopping', 'painting', 'done'
    startTime: null,
    driveStartX: 30, // Start off-screen to the right
    driveTargetX: 0, // Center of screen
    driveSpeed: 10, // Units per second
    paintProgress: 0,
    paintStartTime: null,
    youPaintMesh: null
  };
  
  // Audio context for sound effects
  let audioCtx = null;
  let engineOscillator = null;
  let engineGain = null;
  let idleOscillator = null;  // 4-stroke idle sound
  let idleGain = null;
  let revOscillator = null;  // Rev sound that responds to throttle
  let revGain = null;
  let isMuted = false;
  let tireScreechSound = null;
  let tireScreechGain = null;
  let windNoiseSound = null;
  let windNoiseGain = null;
  
  // Cinematic system
  const cinematicTriggers = [];
  
  // Add a cinematic trigger region
  window.addCinematicTrigger = function(x, z, width, length, sequence) {
    cinematicTriggers.push({
      bounds: {
        minX: x - width/2,
        maxX: x + width/2,
        minZ: z - length/2,
        maxZ: z + length/2
      },
      sequence: sequence,
      triggered: false
    });
  }
  
  // Check if car entered any trigger regions
  function checkCinematicTriggers() {
    if (gameState.cinematicActive) return; // Already in a sequence
    
    for (const trigger of cinematicTriggers) {
      if (trigger.triggered) continue; // One-time triggers
      
      const inBounds = gameState.x >= trigger.bounds.minX && 
                      gameState.x <= trigger.bounds.maxX &&
                      gameState.z >= trigger.bounds.minZ && 
                      gameState.z <= trigger.bounds.maxZ;
      
      if (inBounds) {
        trigger.triggered = true;
        startCinematicSequence(trigger.sequence);
        break;
      }
    }
  }
  
  // Start a cinematic sequence
  function startCinematicSequence(sequence) {
    gameState.cinematicActive = true;
    gameState.cinematicSequence = {
      ...sequence,
      startTime: performance.now() / 1000,
      currentStep: 0
    };
    console.log('Starting cinematic:', sequence.name);
  }
  
  // End cinematic and return control to player
  function endCinematicSequence() {
    gameState.cinematicActive = false;
    gameState.cinematicSequence = null;
    console.log('Cinematic ended, control returned to player');
  }
  let suspensionSound = null;
  
  // Sound volume controls
  let soundVolumes = {
    master: 1.0,      // Master volume
    engine: 0.03,     // Engine sound (halved from 0.06)
    idle: 0.08,       // Idle sound (reduced for less annoyance)
    horn: 1.0,        // Horn (reasonable volume)
    collision: 0.8,   // Collision impacts
    gearChange: 0.5,  // Gear changes (reduced by 50%)
    tires: 0.15,      // Tire screech (increased for audibility)
    wind: 0.0,        // Wind noise (disabled)
    suspension: 1.0   // Suspension creaks (raised)
  };

  // Dithering shader for Mac look
  const ditherVertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const ditherFragmentShader = `
    uniform vec3 color;
    uniform float threshold;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    float dither2x2(vec2 position, float brightness) {
      int x = int(mod(position.x, 2.0));
      int y = int(mod(position.y, 2.0));
      int index = x + y * 2;
      float limit = 0.0;
      if (index == 0) limit = 0.25;
      if (index == 1) limit = 0.75;
      if (index == 2) limit = 0.75;
      if (index == 3) limit = 0.25;
      return brightness < limit ? 0.0 : 1.0;
    }
    
    void main() {
      vec2 screenPos = gl_FragCoord.xy;
      float brightness = dot(color, vec3(0.299, 0.587, 0.114));
      float dithered = dither2x2(screenPos, brightness);
      vec3 finalColor = dithered > 0.5 ? vec3(1.0) : vec3(0.0);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  // Create dithered material
  function createDitheredMaterial(color, threshold = 0.5) {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        threshold: { value: threshold }
      },
      vertexShader: ditherVertexShader,
      fragmentShader: ditherFragmentShader
    });
  }

  // Create car with Mac aesthetics
  function createCarModel() {
    const car = new THREE.Group();
    
    // Main body - black
    const bodyGeometry = new THREE.BoxGeometry(
      CONFIG.car.size.width, 
      CONFIG.car.size.height, 
      CONFIG.car.size.length
    );
    
    // Black body
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
      color: CONFIG.colors.black
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    // Position body so its bottom is at y=0 (will be lifted by ride height)
    body.position.y = CONFIG.car.size.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    car.add(body);
    
    // White windows for contrast
    const windowMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.white
    });
    
    // Front windshield
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.car.size.width * 0.7, CONFIG.car.size.height * 0.5),
      windowMaterial
    );
    windshield.position.set(0, CONFIG.car.size.height * 0.75, CONFIG.car.size.length/2 + 0.01);
    car.add(windshield);
    
    // Circular headlights below windshield
    const headlightGeometry = new THREE.CircleGeometry(0.08, 16);
    const headlightMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.white
    });
    
    // Left headlight - lower and wider
    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(-0.4, CONFIG.car.size.height * 0.25, CONFIG.car.size.length/2 + 0.01);
    car.add(leftHeadlight);
    
    // Right headlight - lower and wider
    const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlight.position.set(0.4, CONFIG.car.size.height * 0.25, CONFIG.car.size.length/2 + 0.01);
    car.add(rightHeadlight);
    
    // Brake lights on rear of car - circular matching headlights
    const brakeLightGeometry = new THREE.CircleGeometry(0.08, 16); // Same size as headlights
    const brakeLightMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x333333 // Very dark grey when off
    });
    
    // Left brake light
    const leftBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
    leftBrakeLight.position.set(-0.4, CONFIG.car.size.height * 0.25, -CONFIG.car.size.length/2 - 0.01);
    leftBrakeLight.rotation.y = Math.PI; // Face backward
    car.add(leftBrakeLight);
    
    // Right brake light
    const rightBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
    rightBrakeLight.position.set(0.4, CONFIG.car.size.height * 0.25, -CONFIG.car.size.length/2 - 0.01);
    rightBrakeLight.rotation.y = Math.PI; // Face backward
    car.add(rightBrakeLight);
    
    // Reverse lights - 25% smaller and inset
    const reverseLightGeometry = new THREE.CircleGeometry(0.06, 16); // 25% smaller
    const reverseLightMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x333333 // Very dark grey when off
    });
    
    // Left reverse light - inset towards center
    const leftReverseLight = new THREE.Mesh(reverseLightGeometry, reverseLightMaterial.clone());
    leftReverseLight.position.set(-0.25, CONFIG.car.size.height * 0.25, -CONFIG.car.size.length/2 - 0.01);
    leftReverseLight.rotation.y = Math.PI;
    car.add(leftReverseLight);
    
    // Right reverse light - inset towards center
    const rightReverseLight = new THREE.Mesh(reverseLightGeometry, reverseLightMaterial.clone());
    rightReverseLight.position.set(0.25, CONFIG.car.size.height * 0.25, -CONFIG.car.size.length/2 - 0.01);
    rightReverseLight.rotation.y = Math.PI;
    car.add(rightReverseLight);
    
    // Store lights for later access
    car.brakeLights = {
      left: leftBrakeLight,
      right: rightBrakeLight
    };
    car.reverseLights = {
      left: leftReverseLight,
      right: rightReverseLight
    };
    
    // Create wheel groups for rotation
    car.wheels = {
      frontLeft: new THREE.Group(),
      frontRight: new THREE.Group(),
      rearLeft: new THREE.Group(),
      rearRight: new THREE.Group()
    };
    
    // Wheels - black circles with white centers
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8);
    wheelGeometry.rotateZ(Math.PI/2);
    const wheelMaterial = new THREE.MeshLambertMaterial({ 
      color: CONFIG.colors.black
    });
    
    const halfWheelbase = gameState.wheelbase / 2;
    const wheelData = [
      { group: car.wheels.frontRight, x: 0.5, z: halfWheelbase },   // Front right (under windshield)
      { group: car.wheels.frontLeft, x: -0.5, z: halfWheelbase },   // Front left (under windshield)
      { group: car.wheels.rearRight, x: 0.5, z: -halfWheelbase },   // Rear right (back of car)
      { group: car.wheels.rearLeft, x: -0.5, z: -halfWheelbase }    // Rear left (back of car)
    ];
    
    wheelData.forEach(data => {
      // Initial wheel positioning
      // We'll set the proper Y position in the update loop
      // For now, just set X and Z
      data.group.position.set(data.x, 0, data.z);
      
      // Create wheel mesh
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      data.group.add(wheel);
      
      // White hubcap with spokes for rotation visibility
      const hubcap = new THREE.Group();
      
      // Center circle
      const center = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 8),
        new THREE.MeshBasicMaterial({ color: CONFIG.colors.white })
      );
      // Face outward from wheel: right wheels face right, left wheels face left
      center.rotation.y = data.x > 0 ? Math.PI/2 : -Math.PI/2;
      hubcap.add(center);
      
      // Spokes to show rotation
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(
          new THREE.PlaneGeometry(0.02, 0.1),
          new THREE.MeshBasicMaterial({ color: CONFIG.colors.white })
        );
        spoke.position.set(0, Math.sin(i * Math.PI/2) * 0.05, Math.cos(i * Math.PI/2) * 0.05);
        // Face outward from wheel: right wheels face right, left wheels face left
        spoke.rotation.y = data.x > 0 ? Math.PI/2 : -Math.PI/2;
        hubcap.add(spoke);
      }
      
      hubcap.position.x = data.x > 0 ? 0.12 : -0.12; // Positive X moves right, negative X moves left from wheel center
      data.group.add(hubcap);
      
      // Add wheel group to car
      car.add(data.group);
    });
    
    return car;
  }

  // Create ground as single grey rectangle
  function createGround() {
    const ground = new THREE.Group();
    
    // Ground dimensions
    const groundWidth = 300;   // Width (X axis)
    const groundLength = 600;  // Length (Z axis) - longer in spawn direction
    const groundHeight = 10;   // Thickness
    const wallHeight = 2;      // Height of perimeter walls
    
    // Ground material - grey
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: CONFIG.colors.gray50,
      emissive: CONFIG.colors.gray50,
      emissiveIntensity: 0.2 // Slight self-illumination but still receives shadows
    });
    
    // Main ground platform
    const mainGround = new THREE.Mesh(
      new THREE.BoxGeometry(groundWidth, groundHeight, groundLength),
      groundMaterial
    );
    // Position so top surface is exactly at y=0
    mainGround.position.set(0, -groundHeight/2, 0);
    mainGround.castShadow = true;
    mainGround.receiveShadow = true;
    ground.add(mainGround);
    
    // Store ground bounds for collision detection
    ground.bounds = {
      minX: -groundWidth/2,
      maxX: groundWidth/2,
      minZ: -groundLength/2,
      maxZ: groundLength/2
    };
    
    // Add black perimeter walls
    const wallThickness = 1;
    const wallMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    
    // North wall (positive Z)
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(groundWidth, wallHeight, wallThickness),
      wallMaterial
    );
    northWall.position.set(0, wallHeight/2, groundLength/2);
    ground.add(northWall);
    
    // South wall (negative Z)
    const southWall = new THREE.Mesh(
      new THREE.BoxGeometry(groundWidth, wallHeight, wallThickness),
      wallMaterial
    );
    southWall.position.set(0, wallHeight/2, -groundLength/2);
    ground.add(southWall);
    
    // East wall (positive X)
    const eastWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, groundLength),
      wallMaterial
    );
    eastWall.position.set(groundWidth/2, wallHeight/2, 0);
    ground.add(eastWall);
    
    // West wall (negative X)
    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, groundLength),
      wallMaterial
    );
    westWall.position.set(-groundWidth/2, wallHeight/2, 0);
    ground.add(westWall);
    
    // Store walls for collision detection
    ground.walls = [northWall, southWall, eastWall, westWall];
    
    // Enable shadows for all walls
    ground.walls.forEach(wall => {
      wall.castShadow = true;
      wall.receiveShadow = true;
    });
    
    return ground;
  }

  // Create treasure chest
  function createTreasureChest() {
    const chestGroup = new THREE.Group();
    
    // Base box (lower part) - 50% smaller
    const baseWidth = 1;
    const baseHeight = 0.6;
    const baseDepth = 0.75;
    
    const baseGeometry = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
    const blackMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    const baseMesh = new THREE.Mesh(baseGeometry, blackMaterial);
    baseMesh.position.y = baseHeight / 2;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    
    // White top face for the base (opening)
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.white });
    const topFaceGeometry = new THREE.PlaneGeometry(baseWidth, baseDepth);
    const topFace = new THREE.Mesh(topFaceGeometry, whiteMaterial);
    topFace.rotation.x = -Math.PI / 2;
    topFace.position.y = baseHeight + 0.01; // Slightly above base
    topFace.receiveShadow = true;
    
    // Lid (smaller black rectangle)
    const lidHeight = 0.15;
    const lidDepth = baseDepth * 0.8; // Slightly smaller than base
    const lidGeometry = new THREE.BoxGeometry(baseWidth, lidHeight, lidDepth);
    const lidMesh = new THREE.Mesh(lidGeometry, blackMaterial);
    
    // Position lid at hinge point (back edge aligned with base)
    lidMesh.position.z = -(baseDepth - lidDepth) / 2;
    lidMesh.position.y = baseHeight + lidHeight / 2;
    
    // Open the lid slightly (rotate around back edge)
    const lidPivot = new THREE.Group();
    lidPivot.position.y = baseHeight;
    lidPivot.position.z = -baseDepth / 2; // Back edge of base
    lidPivot.add(lidMesh);
    lidMesh.position.z = lidDepth / 2; // Move lid forward from pivot
    lidMesh.position.y = lidHeight / 2;
    
    // Rotate lid open by 30 degrees
    lidPivot.rotation.x = -Math.PI / 6;
    
    lidMesh.castShadow = true;
    lidMesh.receiveShadow = true;
    
    // Add all parts to chest group
    chestGroup.add(baseMesh);
    chestGroup.add(topFace);
    chestGroup.add(lidPivot);
    
    // Position chest in the back 1/6 of the fenced area
    // Fence is at (0, 0, -100) and is 40x40 units
    // Back edge is at -100 - 20 = -120
    // Back 1/6 would be from -120 to about -113.3
    chestGroup.position.set(0, 0, -117); // Near the back of fenced area
    chestGroup.rotation.y = Math.PI / 8; // Slight angle for interest
    
    chestGroup.name = 'treasureChest';
    
    return chestGroup;
  }
  
  
  // Treadmill state
  let treadmillState = {
    active: false,
    speed: 0,
    targetSpeed: 0,
    textureOffset: 0,
    speedBumps: [],
    lastBumpSpawn: 0,
    bumpSpacing: 5, // 5 units between bumps
  };
  
  // Create treadmill platform
  function createTreadmill() {
    const treadmillGroup = new THREE.Group();
    
    // Treadmill dimensions
    const width = 20;  // Half the width of the 40x40 fence
    const length = 10;  // Reasonable length for treadmill
    const height = 0.1;
    
    // Create treadmill surface with repeating texture
    const geometry = new THREE.BoxGeometry(width, height, length);
    
    // Create a simple striped pattern using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Draw alternating stripes
    const stripeHeight = 32;
    for (let i = 0; i < canvas.height / stripeHeight; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#666666' : '#444444';
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
    }
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, length / 2); // Repeat along length
    
    const material = new THREE.MeshPhongMaterial({ 
      map: texture,
      color: 0x808080 
    });
    
    const treadmill = new THREE.Mesh(geometry, material);
    treadmill.position.y = height / 2;
    treadmill.receiveShadow = true;
    treadmill.castShadow = true;
    treadmill.name = 'treadmillSurface';
    
    // Store texture reference for animation
    treadmill.userData.texture = texture;
    
    treadmillGroup.add(treadmill);
    
    // Add side rails
    const railGeometry = new THREE.BoxGeometry(1, 0.5, length);
    const railMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    
    const leftRail = new THREE.Mesh(railGeometry, railMaterial);
    leftRail.position.set(-width/2 - 0.5, 0.25, 0);
    leftRail.castShadow = true;
    treadmillGroup.add(leftRail);
    
    const rightRail = new THREE.Mesh(railGeometry, railMaterial);
    rightRail.position.set(width/2 + 0.5, 0.25, 0);
    rightRail.castShadow = true;
    treadmillGroup.add(rightRail);
    
    // Position at back of fenced area
    treadmillGroup.position.set(0, 0, -15); // Back portion of the 40x40 fence
    
    return treadmillGroup;
  }
  
  // Create speed bump
  function createSpeedBump(zPosition) {
    const geometry = new THREE.BoxGeometry(18, 0.3, 1);  // Slightly less than treadmill width
    const material = new THREE.MeshPhongMaterial({ 
      color: 0xFFFF00,
      emissive: 0x444400 
    });
    
    const bump = new THREE.Mesh(geometry, material);
    bump.position.set(0, 0.15, zPosition);
    bump.castShadow = true;
    bump.receiveShadow = true;
    
    return bump;
  }
  
  // Update treadmill animation and physics
  function updateTreadmill(deltaTime) {
    if (!treadmillState.active) return;
    
    const fence = scene.getObjectByName('fence');
    if (!fence) return;
    
    // Check if car is on treadmill
    const treadmillWorldZ = fence.position.z - 15; // Treadmill is at -15 relative to fence
    const treadmillFront = treadmillWorldZ + 5;  // Front edge of 10-unit long treadmill
    const treadmillBack = treadmillWorldZ - 5;   // Back edge
    
    const carOnTreadmill = Math.abs(gameState.x - fence.position.x) < 10 && // Within treadmill width
                          gameState.z >= treadmillBack && 
                          gameState.z <= treadmillFront;
    
    if (carOnTreadmill) {
      // Calculate car position relative to treadmill length
      const treadmillLength = 10;
      const carRelativeZ = gameState.z - treadmillBack;
      const carProgress = carRelativeZ / treadmillLength;
      
      // When car reaches 75% of the way up, match its speed
      if (carProgress > 0.75) {
        // Get car's forward speed (considering angle)
        const carForwardSpeed = -gameState.vz; // Negative because moving toward negative Z
        treadmillState.targetSpeed = Math.max(0, carForwardSpeed);
      } else {
        treadmillState.targetSpeed = 0;
      }
    } else {
      treadmillState.targetSpeed = 0;
    }
    
    // Smoothly adjust treadmill speed
    const speedDiff = treadmillState.targetSpeed - treadmillState.speed;
    treadmillState.speed += speedDiff * deltaTime * 2; // Smooth transition
    
    // Update texture offset for belt movement
    const treadmillSurface = fence.getObjectByName('treadmillSurface');
    if (treadmillSurface && treadmillSurface.userData.texture) {
      treadmillState.textureOffset += treadmillState.speed * deltaTime * 0.1;
      treadmillSurface.userData.texture.offset.y = treadmillState.textureOffset;
    }
    
    // Apply treadmill force to car if on it
    if (carOnTreadmill && treadmillState.speed > 0) {
      gameState.z += treadmillState.speed * deltaTime;
    }
    
    // Spawn speed bumps
    const currentTime = performance.now() / 1000;
    if (treadmillState.speed > 0 && 
        currentTime - treadmillState.lastBumpSpawn > treadmillState.bumpSpacing / treadmillState.speed) {
      
      // Create new bump at the back of treadmill (relative to treadmill position)
      const bump = createSpeedBump(-20); // Back of treadmill relative to fence
      bump.userData.startZ = -20;
      fence.add(bump);
      treadmillState.speedBumps.push(bump);
      treadmillState.lastBumpSpawn = currentTime;
    }
    
    // Update speed bump positions
    for (let i = treadmillState.speedBumps.length - 1; i >= 0; i--) {
      const bump = treadmillState.speedBumps[i];
      bump.position.z += treadmillState.speed * deltaTime;
      
      // Check collision with car
      if (carOnTreadmill && 
          Math.abs(bump.position.z + fence.position.z - gameState.z) < 1 &&
          Math.abs(bump.position.x + fence.position.x - gameState.x) < 9) {
        // Bump the car up
        gameState.vy = 3;
        playCollisionSound(gameState.x, gameState.z);
      }
      
      // Remove bumps that have passed the front
      if (bump.position.z > -10) { // Front of treadmill relative to fence
        fence.remove(bump);
        treadmillState.speedBumps.splice(i, 1);
      }
    }
  }
  
  // Create minimalist fence enclosure (matching gate style)
  function createChainlinkFence() {
    const fenceGroup = new THREE.Group();
    const fenceHeight = 3;
    const fenceSize = 40; // 40x40 units square
    const gateWidth = 10; // Gate opening width
    const fenceThickness = 1; // Collision box thickness
    
    // Material for fence collision boxes - invisible
    const collisionMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.black,
      transparent: true,
      opacity: 0 // Invisible collision boxes
    });
    
    // Visual material for fence bars
    const barMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    
    // Create fence segment with aligned visual and collision
    function createFenceSegment(width, height, depth = 0.1) {
      const segmentGroup = new THREE.Group();
      const barWidth = 0.1;
      const verticalBarSpacing = 2;
      const verticalBarCount = Math.floor(width / verticalBarSpacing) + 1;
      
      // Create visual fence
      // Vertical bars
      for (let i = 0; i < verticalBarCount; i++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(barWidth, height, barWidth),
          barMaterial
        );
        const x = (i / (verticalBarCount - 1)) * width - width/2;
        bar.position.x = x;
        bar.position.y = height / 2;
        bar.castShadow = true;
        bar.receiveShadow = true;
        segmentGroup.add(bar);
      }
      
      // Horizontal bars
      const horizontalBars = [
        { y: height - barWidth/2 }, // Top
        { y: height / 2 },          // Middle
        { y: barWidth/2 }           // Bottom
      ];
      
      horizontalBars.forEach(({ y }) => {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(width, barWidth, barWidth),
          barMaterial
        );
        bar.position.y = y;
        bar.castShadow = true;
        segmentGroup.add(bar);
      });
      
      // Create collision wall that matches the visual fence
      const collisionWall = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, fenceThickness),
        collisionMaterial
      );
      collisionWall.position.y = height / 2;
      segmentGroup.add(collisionWall);
      
      // Store reference to collision wall
      segmentGroup.collisionWall = collisionWall;
      
      return segmentGroup;
    }
    
    // Create collision walls array
    fenceGroup.walls = [];
    
    // North fence (back - solid wall)
    const northSegment = createFenceSegment(fenceSize, fenceHeight);
    northSegment.position.set(0, 0, -fenceSize/2);
    fenceGroup.add(northSegment);
    fenceGroup.walls.push(northSegment.collisionWall);
    
    // South fence (front - with gate opening)
    // Left side of gate
    const southLeftWidth = (fenceSize - gateWidth) / 2;
    const southLeftSegment = createFenceSegment(southLeftWidth, fenceHeight);
    southLeftSegment.position.set(-fenceSize/2 + southLeftWidth/2, 0, fenceSize/2);
    fenceGroup.add(southLeftSegment);
    fenceGroup.walls.push(southLeftSegment.collisionWall);
    
    // Right side of gate
    const southRightSegment = createFenceSegment(southLeftWidth, fenceHeight);
    southRightSegment.position.set(fenceSize/2 - southLeftWidth/2, 0, fenceSize/2);
    fenceGroup.add(southRightSegment);
    fenceGroup.walls.push(southRightSegment.collisionWall);
    
    // West fence (left side)
    const westSegment = createFenceSegment(fenceSize, fenceHeight);
    westSegment.rotation.y = Math.PI/2;
    westSegment.position.set(-fenceSize/2, 0, 0);
    fenceGroup.add(westSegment);
    fenceGroup.walls.push(westSegment.collisionWall);
    
    // East fence (right side)
    const eastSegment = createFenceSegment(fenceSize, fenceHeight);
    eastSegment.rotation.y = Math.PI/2;
    eastSegment.position.set(fenceSize/2, 0, 0);
    fenceGroup.add(eastSegment);
    fenceGroup.walls.push(eastSegment.collisionWall);
    
    // Position the entire fence enclosure
    fenceGroup.position.set(0, 0, -100); // Half the original distance
    
    // Debug: Make collision walls visible
    if (false) { // Set to true to see collision boxes
      fenceGroup.walls.forEach(wall => {
        wall.material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          transparent: true,
          opacity: 0.3
        });
      });
    }
    
    return fenceGroup;
  }
  
  // Create highway sign above fenced area
  function createHighwaySign() {
    const signGroup = new THREE.Group();
    
    // Sign dimensions
    const signWidth = 20;
    const signHeight = 5;
    const poleHeight = 8;
    const archHeight = 10; // Total height of arch above ground
    const archSpan = 30; // Width between poles
    
    // Materials
    const poleMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    const signMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    
    // Create two vertical poles
    const poleRadius = 0.3;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight);
    
    // Left pole
    const leftPole = new THREE.Mesh(poleGeometry, poleMaterial);
    leftPole.position.set(-archSpan/2, poleHeight/2, 0);
    leftPole.castShadow = true;
    signGroup.add(leftPole);
    
    // Right pole
    const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
    rightPole.position.set(archSpan/2, poleHeight/2, 0);
    rightPole.castShadow = true;
    signGroup.add(rightPole);
    
    // Create horizontal beam connecting poles
    const beamGeometry = new THREE.BoxGeometry(archSpan, poleRadius * 2, poleRadius * 2);
    const beam = new THREE.Mesh(beamGeometry, poleMaterial);
    beam.position.set(0, poleHeight, 0);
    beam.castShadow = true;
    signGroup.add(beam);
    
    // Create sign board
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(signWidth, signHeight, 0.2),
      signMaterial
    );
    signBoard.position.set(0, poleHeight + signHeight/2 + 0.5, 0);
    signBoard.castShadow = true;
    signGroup.add(signBoard);
    
    // Create text for sign
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;
    
    // Black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // White text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 120px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BROWSER COUNTRY', canvas.width/2, canvas.height/2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create sign face with text
    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(signWidth - 0.4, signHeight - 0.4),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    signFace.position.set(0, poleHeight + signHeight/2 + 0.5, 0.11);
    signGroup.add(signFace);
    
    // Position the sign at the entrance to the fenced area
    signGroup.position.set(0, 0, -60); // Just before the fenced area
    
    return signGroup;
  }
  
  // Create physics-based hinged gates
  let leftGate, rightGate;
  let gatePhysics = {
    left: { angle: 0, angularVelocity: 0 },
    right: { angle: 0, angularVelocity: 0 }
  };
  
  function createGates() {
    const gatesGroup = new THREE.Group();
    const gateWidth = 5;
    const gateHeight = 3;
    
    // Gate material - black bars
    const gateMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.black });
    
    // Create gate mesh (vertical bars)
    function createGateMesh() {
      const gateGroup = new THREE.Group();
      const barWidth = 0.1;
      const barCount = 5;
      
      for (let i = 0; i < barCount; i++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(barWidth, gateHeight, 0.1),
          gateMaterial
        );
        bar.position.x = (i / (barCount - 1)) * (gateWidth - barWidth) - (gateWidth - barWidth) / 2;
        bar.position.y = gateHeight / 2;
        bar.castShadow = true;
        bar.receiveShadow = true;
        gateGroup.add(bar);
      }
      
      // Add horizontal bars
      const horizontalBar1 = new THREE.Mesh(
        new THREE.BoxGeometry(gateWidth, barWidth, 0.1),
        gateMaterial
      );
      horizontalBar1.position.y = gateHeight * 0.3;
      horizontalBar1.castShadow = true;
      gateGroup.add(horizontalBar1);
      
      const horizontalBar2 = new THREE.Mesh(
        new THREE.BoxGeometry(gateWidth, barWidth, 0.1),
        gateMaterial
      );
      horizontalBar2.position.y = gateHeight * 0.7;
      horizontalBar2.castShadow = true;
      gateGroup.add(horizontalBar2);
      
      return gateGroup;
    }
    
    // Left gate (hinged on left side)
    leftGate = createGateMesh();
    leftGate.position.set(-gateWidth/2, 0, 0); // Offset for hinge point
    const leftGatePivot = new THREE.Group();
    leftGatePivot.add(leftGate);
    leftGatePivot.position.set(-gateWidth/2, 0, -80); // Position at fence opening (adjusted for new fence position)
    gatesGroup.add(leftGatePivot);
    leftGate.userData = { pivot: leftGatePivot, side: 'left' };
    
    // Right gate (hinged on right side)
    rightGate = createGateMesh();
    rightGate.position.set(gateWidth/2, 0, 0); // Offset for hinge point
    const rightGatePivot = new THREE.Group();
    rightGatePivot.add(rightGate);
    rightGatePivot.position.set(gateWidth/2, 0, -80); // Position at fence opening (adjusted for new fence position)
    gatesGroup.add(rightGatePivot);
    rightGate.userData = { pivot: rightGatePivot, side: 'right' };
    
    return gatesGroup;
  }
  
  // Update gate physics
  function updateGatePhysics(deltaTime) {
    // Spring constant and damping
    const springK = 2.0; // Spring force to return gates to closed
    const damping = 0.8; // Damping to prevent oscillation
    
    // Update left gate
    const leftTorque = -springK * gatePhysics.left.angle - damping * gatePhysics.left.angularVelocity;
    gatePhysics.left.angularVelocity += leftTorque * deltaTime;
    gatePhysics.left.angle += gatePhysics.left.angularVelocity * deltaTime;
    
    // Limit gate opening angle (0 to -90 degrees for left gate)
    if (gatePhysics.left.angle < -Math.PI/2) {
      gatePhysics.left.angle = -Math.PI/2;
      gatePhysics.left.angularVelocity = 0;
    }
    if (gatePhysics.left.angle > 0) {
      gatePhysics.left.angle = 0;
      gatePhysics.left.angularVelocity = 0;
    }
    
    // Update right gate
    const rightTorque = -springK * gatePhysics.right.angle - damping * gatePhysics.right.angularVelocity;
    gatePhysics.right.angularVelocity += rightTorque * deltaTime;
    gatePhysics.right.angle += gatePhysics.right.angularVelocity * deltaTime;
    
    // Limit gate opening angle (0 to 90 degrees for right gate)
    if (gatePhysics.right.angle > Math.PI/2) {
      gatePhysics.right.angle = Math.PI/2;
      gatePhysics.right.angularVelocity = 0;
    }
    if (gatePhysics.right.angle < 0) {
      gatePhysics.right.angle = 0;
      gatePhysics.right.angularVelocity = 0;
    }
    
    // Apply rotations to gate pivots
    if (leftGate && leftGate.userData.pivot) {
      leftGate.userData.pivot.rotation.y = gatePhysics.left.angle;
    }
    if (rightGate && rightGate.userData.pivot) {
      rightGate.userData.pivot.rotation.y = gatePhysics.right.angle;
    }
  }
  
  // Check gate collisions with car
  function checkGateCollisions() {
    if (!car || !leftGate || !rightGate) return;
    
    // Car dimensions with padding
    const carWidth = CONFIG.car.size.width + 0.2;
    const carLength = CONFIG.car.size.length + 0.2;
    
    // Helper function to handle gate collision physics
    function handleGateCollision(gate, gatePhysicsData, angularDirection) {
      // Get gate world position
      const gateWorldPos = new THREE.Vector3();
      gate.getWorldPosition(gateWorldPos);
      
      // Calculate gate bounds (approximation based on gate being 5 units wide, 3 units tall)
      const gateWidth = 5;
      const gateDepth = 0.2;
      
      // Transform gate bounds based on current rotation
      const angle = gatePhysicsData.angle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      // Gate center in world space (accounting for pivot offset)
      const gateCenterX = gateWorldPos.x;
      const gateCenterZ = gateWorldPos.z;
      
      // Check if car intersects with rotated gate
      const dx = gameState.x - gateCenterX;
      const dz = gameState.z - gateCenterZ;
      
      // Rotate to gate local space
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      
      // Check bounds in local space
      if (Math.abs(localX) < (gateWidth/2 + carWidth/2) && 
          Math.abs(localZ) < (gateDepth/2 + carLength/2)) {
        
        // Collision detected!
        // Calculate push direction based on which side of gate we hit
        const pushAngle = angle + (localZ > 0 ? 0 : Math.PI);
        const pushX = Math.sin(pushAngle);
        const pushZ = Math.cos(pushAngle);
        
        // Push car away from gate
        const pushForce = 2.0;
        gameState.x += pushX * pushForce;
        gameState.z += pushZ * pushForce;
        
        // Bounce velocity
        const dotProduct = gameState.vx * pushX + gameState.vz * pushZ;
        gameState.vx -= 1.5 * dotProduct * pushX;
        gameState.vz -= 1.5 * dotProduct * pushZ;
        gameState.vx *= 0.7;
        gameState.vz *= 0.7;
        
        // Apply force to open gate based on car velocity
        const force = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz) * 0.5;
        gatePhysicsData.angularVelocity += force * 0.15 * angularDirection;
        
        // Play collision sound at gate position
        playCollisionSound(gateCenterX, gateCenterZ);
        
        // Flash screen for visual feedback
        flashScreen();
        
        // Increment collision counter
        gameState.collisions++;
        
        return true;
      }
      return false;
    }
    
    // Check left gate collision
    handleGateCollision(leftGate, gatePhysics.left, -1);
    
    // Check right gate collision
    handleGateCollision(rightGate, gatePhysics.right, 1);
  }
  
  // Check fence collisions with car (using same logic as wall collisions)
  function checkFenceCollisions() {
    const fence = scene.getObjectByName('fence');
    if (!fence || !fence.walls) return;
    
    // Skip collision checks during Browser Country expansion animation
    if (gameState.browserCountryExpanded && fence.scale.z < 10) {
      return; // Fence is still animating
    }
    
    fence.walls.forEach(wall => {
      // Update the wall's world matrix to ensure transforms are applied
      wall.updateWorldMatrix(true, false);
      const wallBox = new THREE.Box3().setFromObject(wall);
      const carBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(gameState.x, 0.5, gameState.z),
        new THREE.Vector3(CONFIG.car.size.width, CONFIG.car.size.height, CONFIG.car.size.length)
      );
      
      if (wallBox.intersectsBox(carBox)) {
        // Get the actual world position of the wall accounting for all transforms
        const wallWorldPos = new THREE.Vector3();
        wall.getWorldPosition(wallWorldPos);
        
        // Calculate push direction - from wall center to car center
        const carCenter = new THREE.Vector3(gameState.x, 0, gameState.z);
        const wallCenter = new THREE.Vector3(wallWorldPos.x, 0, wallWorldPos.z);
        
        // Determine if it's a North/South or East/West wall
        const isNorthSouth = wall.geometry.parameters.width > wall.geometry.parameters.depth;
        
        if (isNorthSouth) {
          // North/South wall - push in Z direction
          const pushDirection = Math.sign(gameState.z - wallCenter.z);
          const wallHalfThickness = 0.5; // Half thickness of fence collision box
          const carHalfLength = CONFIG.car.size.length / 2;
          const distanceToWall = Math.abs(gameState.z - wallCenter.z);
          const minSeparation = carHalfLength + wallHalfThickness;
          
          // Only push if we're actually overlapping
          if (distanceToWall < minSeparation) {
            const overlap = minSeparation - distanceToWall;
            // Push out with extra margin to prevent getting stuck
            gameState.z += pushDirection * (overlap + 0.5);
          }
          
          // Only dampen velocity if moving towards the wall
          if ((pushDirection > 0 && gameState.vz < 0) || (pushDirection < 0 && gameState.vz > 0)) {
            gameState.vz *= 0.1; // Strong damping but don't reverse
          }
        } else {
          // East/West wall - push in X direction
          const pushDirection = Math.sign(gameState.x - wallCenter.x);
          const wallHalfThickness = 0.5; // Half thickness of fence collision box
          const carHalfWidth = CONFIG.car.size.width / 2;
          const distanceToWall = Math.abs(gameState.x - wallCenter.x);
          const minSeparation = carHalfWidth + wallHalfThickness;
          
          // Only push if we're actually overlapping
          if (distanceToWall < minSeparation) {
            const overlap = minSeparation - distanceToWall;
            // Push out with extra margin to prevent getting stuck
            gameState.x += pushDirection * (overlap + 0.5);
          }
          
          // Only dampen velocity if moving towards the wall
          if ((pushDirection > 0 && gameState.vx < 0) || (pushDirection < 0 && gameState.vx > 0)) {
            gameState.vx *= 0.1; // Strong damping but don't reverse
          }
        }
        
        // Reduce wheel speed slightly
        gameState.wheelSpeed *= 0.8;
        gameState.frontWheelSpeed *= 0.8;
        
        // Only reduce angular velocity if it would cause more collision
        if (Math.abs(gameState.angularVelocity) > 0.5) {
          gameState.angularVelocity *= 0.7;
        }
        
        // Play impact sound at collision point
        const impactX = isNorthSouth ? gameState.x : wallCenter.x;
        const impactZ = isNorthSouth ? wallCenter.z : gameState.z;
        playCollisionSound(impactX, impactZ);
        
        // No flash for fence collisions - just sound
        gameState.collisions++;
      }
    });
  }
  
  // Create road sign messages painted on ground
  function createRoadSigns() {
    const signsGroup = new THREE.Group();
    signsGroup.name = 'roadSigns';
    signsGroup.signs = []; // Store individual sign data for animation
    
    // Messages to display (evenly distributed to half distance)
    const messages = [
      { text: "W/↑ TO DRIVE", z: -25 },
      { text: "A/D TO STEER", z: -50 },
      { text: "FIND THE TREASURE", z: -75 }
    ];
    
    messages.forEach((msg, index) => {
      // Create main canvas for final text
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 512;
      canvas.height = 128;
      
      // Create mask canvas for spray paint reveal
      const maskCanvas = document.createElement('canvas');
      const maskCtx = maskCanvas.getContext('2d');
      maskCanvas.width = 512;
      maskCanvas.height = 128;
      
      // Clear canvases
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      
      // Set up graffiti text style
      ctx.font = 'bold 52px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Add weathering effect - draw text multiple times with slight offsets and opacity
      const centerX = canvas.width/2;
      const centerY = canvas.height/2;
      
      // Draw graffiti-style text with stroke and fill
      // Multiple passes for graffiti effect
      
      // Outer glow/overspray (reduced)
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'white';
      ctx.strokeStyle = 'white';
      ctx.strokeText(msg.text, centerX, centerY);
      
      // Main stroke
      ctx.shadowBlur = 3;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'white';
      ctx.strokeText(msg.text, centerX, centerY);
      
      // Fill
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'white';
      ctx.fillText(msg.text, centerX, centerY);
      
      // Add drips
      const textMetrics = ctx.measureText(msg.text);
      const textWidth = textMetrics.width;
      const numDrips = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < numDrips; i++) {
        const dripX = centerX - textWidth/2 + Math.random() * textWidth;
        const dripStartY = centerY + 20;
        const dripLength = 10 + Math.random() * 20;
        const dripWidth = 2 + Math.random() * 3;
        
        // Draw drip
        ctx.beginPath();
        ctx.moveTo(dripX, dripStartY);
        ctx.lineTo(dripX - dripWidth/4, dripStartY + dripLength);
        ctx.lineTo(dripX + dripWidth/4, dripStartY + dripLength);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
      }
      
      // Create texture
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      // Create plane geometry for road sign
      const signGeometry = new THREE.PlaneGeometry(20, 5);
      const signMaterial = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0, // Start invisible for animation
        blending: THREE.NormalBlending,
        depthWrite: false
      });
      
      const sign = new THREE.Mesh(signGeometry, signMaterial);
      sign.rotation.x = -Math.PI/2; // Lay flat on ground
      sign.position.set(0, 0.01, msg.z); // Slightly above ground to prevent z-fighting
      
      // Store animation data for this sign
      const signData = {
        mesh: sign,
        material: signMaterial,
        maskCanvas: maskCanvas,
        maskCtx: maskCtx,
        startTime: null,
        isAnimating: false,
        hasStarted: false,
        paintBounds: {
          minX: sign.position.x - 10,
          maxX: sign.position.x + 10,
          minZ: sign.position.z - 2.5,
          maxZ: sign.position.z + 2.5
        },
        index: index
      };
      
      sign.userData = {
        isRoadSign: true,
        animationProgress: 0,
        animationDelay: index * 0.5, // Stagger animations
        animationStarted: false,
        texture: texture,
        canvas: canvas,
        maskCanvas: maskCanvas,
        maskCtx: maskCtx,
        paintBounds: signData.paintBounds
      };
      
      signsGroup.add(sign);
      signsGroup.signs.push(signData);
    });
    
    return signsGroup;
  }
  
  // No obstacles - platforms are clear
  function createObstacles() {
    // Obstacles removed per user request
  }
  
  // Terrain creation functions
  const terrainElements = [];
  
  function createTerrain() {
    // Terrain elements removed - clean game world
  }
  
  function createRamp(x, y, z, width, length, height, angle) {
    const rampGeometry = new THREE.BoxGeometry(width, height, length);
    const rampMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x666666,
      transparent: true,
      opacity: 0.8
    });
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
    
    // Position ramp with front edge on ground
    ramp.position.set(x, y + height/2, z);
    ramp.rotation.x = -angle; // Negative for upward slope
    
    // Store ramp properties for physics
    ramp.userData = {
      type: 'ramp',
      width: width,
      length: length,
      height: height,
      angle: angle
    };
    
    scene.add(ramp);
    terrainElements.push(ramp);
  }
  
  function createSurfacePatch(x, y, z, width, length, surfaceType) {
    const patchGeometry = new THREE.PlaneGeometry(width, length);
    let patchMaterial;
    
    switch(surfaceType) {
      case 'ice':
        patchMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xADD8E6, // Light blue
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6
        });
        break;
      case 'sand':
        patchMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xC2B280, // Sand color
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7
        });
        break;
      case 'oil':
        patchMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x1C1C1C, // Dark grey/black
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        });
        break;
      case 'mud':
        patchMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x654321, // Brown
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7
        });
        break;
      default:
        patchMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x808080,
          side: THREE.DoubleSide
        });
    }
    
    const patch = new THREE.Mesh(patchGeometry, patchMaterial);
    patch.position.set(x, y + 0.01, z); // Slightly above ground to avoid z-fighting
    patch.rotation.x = -Math.PI / 2; // Lay flat
    
    // Store surface type for physics
    patch.userData = {
      type: 'surface',
      surfaceType: surfaceType,
      bounds: {
        minX: x - width/2,
        maxX: x + width/2,
        minZ: z - length/2,
        maxZ: z + length/2
      }
    };
    
    scene.add(patch);
    terrainElements.push(patch);
  }
  
  // Dev mode visuals
  let devMode = false;
  let devHelpers = null;
  let devGrid = null;
  let coordinateMarkers = [];
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();
  let carAxisHelper = null;
  
  function createDevHelpers() {
    if (devHelpers) return;
    
    devHelpers = new THREE.Group();
    
    // Cardinal direction indicators (rotated so car faces north)
    const dirMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    
    // North (negative X - where car faces) - Red
    const northGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(-20, 0.1, 0)
    ]);
    const northLine = new THREE.Line(northGeometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    devHelpers.add(northLine);
    
    // South (positive X) - Dark Red
    const southGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(20, 0.1, 0)
    ]);
    const southLine = new THREE.Line(southGeometry, new THREE.LineBasicMaterial({ color: 0x800000 }));
    devHelpers.add(southLine);
    
    // East (positive Z) - Green
    const eastGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, 0.1, 20)
    ]);
    const eastLine = new THREE.Line(eastGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    devHelpers.add(eastLine);
    
    // West (negative Z) - Dark Green
    const westGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, 0.1, -20)
    ]);
    const westLine = new THREE.Line(westGeometry, new THREE.LineBasicMaterial({ color: 0x008000 }));
    devHelpers.add(westLine);
    
    // Add text labels using sprites
    const createTextSprite = (text, position, color = 0x000000) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(2, 0.5, 1);
      sprite.position.copy(position);
      return sprite;
    };
    
    // Direction labels (rotated so car faces north)
    devHelpers.add(createTextSprite('NORTH (-X)', new THREE.Vector3(-10, 2, 0)));
    devHelpers.add(createTextSprite('SOUTH (+X)', new THREE.Vector3(10, 2, 0)));
    devHelpers.add(createTextSprite('EAST (+Z)', new THREE.Vector3(0, 2, 10)));
    devHelpers.add(createTextSprite('WEST (-Z)', new THREE.Vector3(0, 2, -10)));
    
    scene.add(devHelpers);
  }
  
  function createDevGrid() {
    if (devGrid) return;
    
    devGrid = new THREE.Group();
    
    // Create a 1-meter grid
    const gridSize = 100; // 100x100 meter grid
    const divisions = 100; // 1 meter squares
    
    // Main grid
    const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x444444, 0xcccccc);
    gridHelper.position.y = 0.01; // Slightly above ground
    devGrid.add(gridHelper);
    
    // Highlight 5-meter lines
    const grid5m = new THREE.GridHelper(gridSize, 20, 0x222222, 0x222222);
    grid5m.position.y = 0.02;
    devGrid.add(grid5m);
    
    // Highlight 10-meter lines  
    const grid10m = new THREE.GridHelper(gridSize, 10, 0x000000, 0x000000);
    grid10m.position.y = 0.03;
    devGrid.add(grid10m);
    
    // Add origin marker
    const originGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const originMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const originMarker = new THREE.Mesh(originGeometry, originMaterial);
    originMarker.position.set(0, 0.2, 0);
    devGrid.add(originMarker);
    
    // Add origin label
    const originLabel = createTextSprite('ORIGIN (0,0)', new THREE.Vector3(0, 1, 0));
    originLabel.scale.set(1.5, 0.5, 1);
    devGrid.add(originLabel);
    
    scene.add(devGrid);
  }
  
  function toggleDevMode() {
    devMode = !devMode;
    if (devMode) {
      createDevHelpers();
      createDevGrid();
      if (devHelpers) devHelpers.visible = true;
      if (devGrid) devGrid.visible = true;
      addObjectLabels();
      // Enable coordinate tagging
      window.addEventListener('click', onDevClick);
    } else {
      if (devHelpers) devHelpers.visible = false;
      if (devGrid) devGrid.visible = false;
      removeObjectLabels();
      clearCoordinateMarkers();
      // Disable coordinate tagging
      window.removeEventListener('click', onDevClick);
    }
  }
  
  // Handle dev mode clicks for coordinate tagging
  function onDevClick(event) {
    // Calculate mouse position in normalized device coordinates
    const rect = displayCanvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Create a plane at y=0 for intersection
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2; // Horizontal plane
    plane.position.y = 0;
    
    // Check for intersection with the ground plane
    const intersects = raycaster.intersectObject(plane);
    
    if (intersects.length > 0) {
      const point = intersects[0].point;
      addCoordinateMarker(point.x, point.z);
    }
    
    // Clean up
    planeGeometry.dispose();
    planeMaterial.dispose();
  }
  
  // Add a coordinate marker at the specified position
  function addCoordinateMarker(x, z) {
    // Create marker
    const markerGeometry = new THREE.ConeGeometry(0.3, 1, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(x, 0.5, z);
    marker.rotation.x = Math.PI; // Point down
    
    // Create label
    const labelText = `(${x.toFixed(1)}, ${z.toFixed(1)})`;
    const label = createTextSprite(labelText, new THREE.Vector3(x, 1.5, z));
    label.scale.set(1.5, 0.5, 1);
    
    // Store for cleanup
    coordinateMarkers.push({ marker, label, geometry: markerGeometry, material: markerMaterial });
    
    scene.add(marker);
    scene.add(label);
    
    // Log to console for easy copying
    console.log(`Coordinate tagged: ${labelText}`);
  }
  
  // Clear all coordinate markers
  function clearCoordinateMarkers() {
    coordinateMarkers.forEach(({ marker, label, geometry, material }) => {
      scene.remove(marker);
      scene.remove(label);
      geometry.dispose();
      material.dispose();
      if (label.material.map) label.material.map.dispose();
      label.material.dispose();
    });
    coordinateMarkers = [];
  }
  
  // Object labels
  let objectLabels = [];
  
  function addObjectLabels() {
    // Add labels to important objects
    const labelData = [
      { obj: carGroup, name: 'CAR', offset: new THREE.Vector3(0, 2, 0) },
      { obj: leftPlatform, name: 'LEFT PLATFORM', offset: new THREE.Vector3(0, 1, 0) },
      { obj: rightPlatform, name: 'RIGHT PLATFORM', offset: new THREE.Vector3(0, 1, 0) },
      { obj: scene.getObjectByName('treasureChest'), name: 'TREASURE CHEST', offset: new THREE.Vector3(0, 2, 0) }
    ];
    
    labelData.forEach(data => {
      if (!data.obj) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.name, 128, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(3, 0.75, 1);
      
      data.obj.add(sprite);
      sprite.position.copy(data.offset);
      objectLabels.push(sprite);
    });
  }
  
  function removeObjectLabels() {
    objectLabels.forEach(label => {
      if (label.parent) label.parent.remove(label);
      label.material.map.dispose();
      label.material.dispose();
    });
    objectLabels = [];
  }

  // Horn indicator
  let hornIndicator = null;
  let hornIndicatorTimeout = null;
  let tachometer = null;
  let tachometerCanvas = null;
  let tachometerCtx = null;
  let indicatorContainer = null;
  let youTooltipContent = { horn: false, tachometer: false, rpm: 0 };
  
  function createHornIndicator() {
    // Clear any existing timeout
    if (hornIndicatorTimeout) {
      clearTimeout(hornIndicatorTimeout);
      hornIndicatorTimeout = null;
    }
    
    if (hornIndicator) return; // Don't create multiple
    
    // Create chat bubble style horn tooltip
    const canvas = document.createElement('canvas');
    canvas.width = 512;  // Same as YOU tooltip
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Function to draw the horn chat bubble
    function drawHornBubble() {
      // Clear canvas
      ctx.clearRect(0, 0, 512, 256);
      
      // Scale up for higher resolution (same as YOU tooltip)
      ctx.save();
      ctx.scale(2, 2);
      
      // Chat bubble dimensions for music note
      const padding = 25;
      const bubbleWidth = 100; // Fixed width for icon
      const bubbleHeight = 80;
      
      // Position bubble to point from windshield
      const bubbleX = (256 - bubbleWidth) / 2;
      const bubbleY = 20;
      const cornerRadius = 10;
      
      // Draw map pin style background (same as YOU/TREASURE) with tail pointing down
      ctx.fillStyle = '#000000';  // Black background
      ctx.beginPath();
      
      // Top left corner
      ctx.moveTo(bubbleX + cornerRadius, bubbleY);
      // Top edge
      ctx.lineTo(bubbleX + bubbleWidth - cornerRadius, bubbleY);
      // Top right corner
      ctx.arc(bubbleX + bubbleWidth - cornerRadius, bubbleY + cornerRadius, 
               cornerRadius, -Math.PI/2, 0, false);
      // Right edge
      ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - cornerRadius);
      // Bottom right corner
      ctx.arc(bubbleX + bubbleWidth - cornerRadius, bubbleY + bubbleHeight - cornerRadius, 
               cornerRadius, 0, Math.PI/2, false);
      
      // Draw the pin point (tail pointing down)
      ctx.lineTo(bubbleX + bubbleWidth/2 + 15, bubbleY + bubbleHeight);
      ctx.lineTo(bubbleX + bubbleWidth/2, bubbleY + bubbleHeight + 20);
      ctx.lineTo(bubbleX + bubbleWidth/2 - 15, bubbleY + bubbleHeight);
      
      // Continue bottom edge
      ctx.lineTo(bubbleX + cornerRadius, bubbleY + bubbleHeight);
      // Bottom left corner
      ctx.arc(bubbleX + cornerRadius, bubbleY + bubbleHeight - cornerRadius, 
               cornerRadius, Math.PI/2, Math.PI, false);
      // Left edge
      ctx.lineTo(bubbleX, bubbleY + cornerRadius);
      // Top left corner
      ctx.arc(bubbleX + cornerRadius, bubbleY + cornerRadius, 
               cornerRadius, Math.PI, Math.PI * 3/2, false);
      
      ctx.closePath();
      ctx.fill();
      
      // Draw music note icon in white
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', 128, bubbleY + bubbleHeight / 2);
      
      ctx.restore();
    }
    
    // Draw initial chat bubble
    drawHornBubble();
    
    // Create texture and sprite with sharp filtering
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;  // Smooth downscaling
    texture.magFilter = THREE.LinearFilter; // Smooth upscaling for better quality
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    
    hornIndicator = new THREE.Sprite(spriteMaterial);
    hornIndicator.scale.set(3, 1, 1);  // Match YOU tooltip scale
    
    // Add to car group so it follows the car
    carGroup.add(hornIndicator);
    updateIndicatorPositions();
  }
  
  function removeHornIndicator() {
    if (hornIndicatorTimeout) {
      clearTimeout(hornIndicatorTimeout);
      hornIndicatorTimeout = null;
    }
    
    // Update YOU tooltip if it's being used for horn
    if (youTooltip && youTooltip.drawTooltip && youTooltipContent.horn) {
      youTooltipContent.horn = false;
      youTooltip.drawTooltip();
      youTooltip.texture.needsUpdate = true;
      return;
    }
    
    if (hornIndicator) {
      carGroup.remove(hornIndicator);
      hornIndicator.material.map.dispose();
      hornIndicator.material.dispose();
      hornIndicator = null;
      updateIndicatorPositions();
    }
  }
  
  // Create tachometer display
  function createTachometer() {
    // Try to use YOU tooltip first, create it if needed for horn/tach
    if (!youTooltip || !youTooltip.drawTooltip) {
      // Reset content and create tooltip for indicators only
      youTooltipContent = { horn: false, tachometer: false, rpm: 0 };
      createYouTooltip();
    }
    
    if (youTooltip && youTooltip.drawTooltip) {
      youTooltipContent.tachometer = true;
      youTooltip.drawTooltip();
      youTooltip.texture.needsUpdate = true;
      return;
    }
    
    if (tachometer) return;
    
    // Create canvas for tachometer - 2x higher resolution
    tachometerCanvas = document.createElement('canvas');
    tachometerCanvas.width = 4096;
    tachometerCanvas.height = 4096;
    tachometerCtx = tachometerCanvas.getContext('2d');
    
    // Enable image smoothing for better quality
    tachometerCtx.imageSmoothingEnabled = true;
    tachometerCtx.imageSmoothingQuality = 'high';
    
    // Scale for high resolution
    tachometerCtx.scale(16, 16);
    
    // Create texture and sprite
    const texture = new THREE.CanvasTexture(tachometerCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    
    tachometer = new THREE.Sprite(spriteMaterial);
    tachometer.scale.set(1, 1, 1);  // Half size
    
    // Add to car group
    carGroup.add(tachometer);
    
    // Initial draw
    updateTachometer(0);
    updateIndicatorPositions();
  }
  
  function updateTachometer(rpm) {
    // Update YOU tooltip if it's being used for tachometer
    if (youTooltip && youTooltip.drawTooltip && youTooltipContent.tachometer) {
      youTooltipContent.rpm = rpm;
      youTooltip.drawTooltip();
      youTooltip.texture.needsUpdate = true;
      return;
    }
    
    if (!tachometerCtx || !tachometer) return;
    
    // Clear canvas
    tachometerCtx.clearRect(0, 0, 256, 256);
    
    // Draw circular background
    tachometerCtx.fillStyle = '#000000';
    tachometerCtx.beginPath();
    tachometerCtx.arc(128, 128, 100, 0, Math.PI * 2);
    tachometerCtx.fill();
    
    // Draw tachometer face
    tachometerCtx.strokeStyle = '#FFFFFF';
    tachometerCtx.lineWidth = 3;
    tachometerCtx.beginPath();
    tachometerCtx.arc(128, 128, 90, 0, Math.PI * 2);
    tachometerCtx.stroke();
    
    // Draw needle
    const needleAngle = (rpm / gameState.maxEngineRPM) * Math.PI * 1.5 - Math.PI * 1.25;
    const needleCos = Math.cos(needleAngle);
    const needleSin = Math.sin(needleAngle);
    
    tachometerCtx.strokeStyle = '#FFFFFF';  // White needle instead of red
    tachometerCtx.lineWidth = 4;
    tachometerCtx.beginPath();
    tachometerCtx.moveTo(128, 128);
    tachometerCtx.lineTo(128 + needleCos * 75, 128 + needleSin * 75);
    tachometerCtx.stroke();
    
    // Draw center dot
    tachometerCtx.fillStyle = '#FFFFFF';
    tachometerCtx.beginPath();
    tachometerCtx.arc(128, 128, 5, 0, Math.PI * 2);
    tachometerCtx.fill();
    
    // Draw RPM text
    tachometerCtx.font = '16px monospace';
    tachometerCtx.fillText(Math.floor(rpm) + ' RPM', 128, 128 - 30);
    
    // Update texture
    tachometer.material.map.needsUpdate = true;
  }
  
  function removeTachometer() {
    // Update YOU tooltip if it's being used for tachometer
    if (youTooltip && youTooltip.drawTooltip && youTooltipContent.tachometer) {
      youTooltipContent.tachometer = false;
      youTooltipContent.rpm = 0;
      youTooltip.drawTooltip();
      youTooltip.texture.needsUpdate = true;
      
      // Remove tooltip if nothing else is showing
      if (!youTooltipContent.horn) {
        removeYouTooltipIfEmpty();
      }
      return;
    }
    
    if (tachometer) {
      carGroup.remove(tachometer);
      tachometer.material.map.dispose();
      tachometer.material.dispose();
      tachometer = null;
      tachometerCanvas = null;
      tachometerCtx = null;
      updateIndicatorPositions();
    }
  }
  
  // Update positions of all indicators
  function updateIndicatorPositions() {
    // Horn indicator positions above car like other tooltips
    if (hornIndicator && hornIndicator.visible) {
      // Position above car
      hornIndicator.position.set(0, 2, 0); // Closer above car
    }
    
    // Tachometer positions above car (if not in YOU tooltip)
    if (tachometer && tachometer.visible) {
      tachometer.position.set(0, 2, 0); // Closer above car
    }
  }

  // Create "YOU" tooltip above car
  let youTooltip = null;
  let treasureTooltip = null;
  let hasStartedDriving = false;
  let drivingTime = 0;
  let tooltipAutoExpireDisabled = false; // Debug setting
  let tachometerHidden = false; // Devtools setting to hide tachometer
  let accelerationStartTime = 0; // Track when acceleration started
  let isAccelerating = false; // Track acceleration state
  
  function createYouTooltip() {
    // Create sprite for "YOU" label - high res (copying TREASURE approach)
    const canvas = document.createElement('canvas');
    canvas.width = 512;  // Same aspect as TREASURE but smaller for "YOU"
    canvas.height = 256;  // Double resolution
    const ctx = canvas.getContext('2d');
    
    // Function to draw the tooltip
    function drawTooltip(borderColor = null) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Scale up for higher resolution (same as TREASURE)
      ctx.save();
      ctx.scale(2, 2);
      
      // Check if we're only showing tachometer (no YOU label, no horn)
      const tachometerOnly = youTooltipContent.tachometer && !youTooltipContent.horn && 
                           (!hasStartedDriving || (hasStartedDriving && drivingTime > 5));
      
      if (tachometerOnly) {
        // Draw round background for tachometer only
        const centerX = 128;
        const centerY = 64;
        const radius = 50;
        
        ctx.fillStyle = '#000000';  // Black background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw tachometer in center
        const gaugeRadius = 35;
        
        // Draw arc (3/4 circle from 225° to 135°)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, gaugeRadius, Math.PI * 5/4, Math.PI * -1/4, false);
        ctx.stroke();
        
        // Draw tick marks
        ctx.lineWidth = 4;
        // Start tick
        ctx.beginPath();
        ctx.moveTo(centerX + Math.cos(Math.PI * 5/4) * (gaugeRadius - 5), 
                   centerY + Math.sin(Math.PI * 5/4) * (gaugeRadius - 5));
        ctx.lineTo(centerX + Math.cos(Math.PI * 5/4) * (gaugeRadius + 5), 
                   centerY + Math.sin(Math.PI * 5/4) * (gaugeRadius + 5));
        ctx.stroke();
        
        // End tick
        ctx.beginPath();
        ctx.moveTo(centerX + Math.cos(Math.PI * -1/4) * (gaugeRadius - 5), 
                   centerY + Math.sin(Math.PI * -1/4) * (gaugeRadius - 5));
        ctx.lineTo(centerX + Math.cos(Math.PI * -1/4) * (gaugeRadius + 5), 
                   centerY + Math.sin(Math.PI * -1/4) * (gaugeRadius + 5));
        ctx.stroke();
        
        // Draw needle
        const minRPM = 600;
        const maxRPM = 6000;
        const clampedRPM = Math.max(minRPM, Math.min(maxRPM, youTooltipContent.rpm));
        const rpmPercent = (clampedRPM - minRPM) / (maxRPM - minRPM);
        const needleAngle = Math.PI * 5/4 + (rpmPercent * Math.PI * 3/2);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(needleAngle) * gaugeRadius * 0.8,
          centerY + Math.sin(needleAngle) * gaugeRadius * 0.8
        );
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Regular tooltip layout
        // Calculate height based on content
        let contentCount = 1; // Always show YOU
        if (youTooltipContent.horn) contentCount++;
        if (youTooltipContent.tachometer) contentCount++;
        const h = 80 + (contentCount - 1) * 50;  // Match TREASURE height (80) as base
        
        // Draw map pin style background
        ctx.fillStyle = '#000000';  // Black background
        ctx.strokeStyle = borderColor || '#000000';  // Border color (black by default)
        ctx.lineWidth = borderColor ? 4 : 0;  // Thick border when flashing (same as TREASURE)
        
        // Calculate width based on content
        ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial';
        let maxWidth = ctx.measureText('YOU').width;
        if (youTooltipContent.horn) {
          maxWidth = Math.max(maxWidth, ctx.measureText('HORN').width + 40);
        }
        if (youTooltipContent.tachometer) {
          maxWidth = Math.max(maxWidth, 180);
        }
        
        // Pin dimensions
        const w = Math.max(maxWidth + 40, 160);  // Fit content
        const r = 20;  // Corner radius (same as TREASURE)
        const x = (256 - w) / 2;  // Center horizontally (256 is scaled canvas width)
        const y = 20;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      
      // Draw the pin point
      ctx.lineTo(x + w/2 + 15, y + h);
      ctx.lineTo(x + w/2, y + h + 20);
      ctx.lineTo(x + w/2 - 15, y + h);
      
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      
      ctx.fill();
      if (borderColor) {
        ctx.stroke();
      }
      
      // Draw content
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial';  // Same as TREASURE
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let yOffset = y + h/2;
      
      // Show YOU or current content
      if (!youTooltipContent.horn && !youTooltipContent.tachometer) {
        ctx.fillText('YOU', x + w/2, yOffset);
      } else {
        // Adjust for multiple items
        yOffset = y + 35;
        
        if (youTooltipContent.horn) {
          ctx.fillText('HORN', x + w/2, yOffset);
          if (youTooltipContent.tachometer) yOffset += 55; // More space for larger tachometer
        }
        
        if (youTooltipContent.tachometer) {
          // Minimalist tachometer gauge - larger size
          const gaugeX = x + w/2;
          const gaugeY = yOffset + 35; // Center the gauge vertically
          const radius = 35; // Increased radius
          
          // Draw arc (3/4 circle from 225° to 135°)
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 6; // Thicker arc for better visibility
          ctx.beginPath();
          ctx.arc(gaugeX, gaugeY, radius, Math.PI * 5/4, Math.PI * -1/4, false);
          ctx.stroke();
          
          // Draw tick marks for better visibility
          ctx.lineWidth = 4;
          // Start tick (idle)
          ctx.beginPath();
          ctx.moveTo(gaugeX + Math.cos(Math.PI * 5/4) * (radius - 5), 
                     gaugeY + Math.sin(Math.PI * 5/4) * (radius - 5));
          ctx.lineTo(gaugeX + Math.cos(Math.PI * 5/4) * (radius + 5), 
                     gaugeY + Math.sin(Math.PI * 5/4) * (radius + 5));
          ctx.stroke();
          
          // End tick (redline)
          ctx.beginPath();
          ctx.moveTo(gaugeX + Math.cos(Math.PI * -1/4) * (radius - 5), 
                     gaugeY + Math.sin(Math.PI * -1/4) * (radius - 5));
          ctx.lineTo(gaugeX + Math.cos(Math.PI * -1/4) * (radius + 5), 
                     gaugeY + Math.sin(Math.PI * -1/4) * (radius + 5));
          ctx.stroke();
          
          // Draw needle
          // Map RPM (600-6000) to angle - start at 225° (-45° from bottom), rotate clockwise
          const minRPM = 600;
          const maxRPM = 6000;
          const clampedRPM = Math.max(minRPM, Math.min(maxRPM, youTooltipContent.rpm));
          const rpmPercent = (clampedRPM - minRPM) / (maxRPM - minRPM);
          // Start at 225° (5π/4) and rotate clockwise to 135° (-π/4)
          const needleAngle = Math.PI * 5/4 + (rpmPercent * Math.PI * 3/2);
          
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 4; // Thicker needle
          ctx.beginPath();
          ctx.moveTo(gaugeX, gaugeY);
          ctx.lineTo(
            gaugeX + Math.cos(needleAngle) * radius * 0.8,
            gaugeY + Math.sin(needleAngle) * radius * 0.8
          );
          ctx.stroke();
          
          // Draw center dot
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(gaugeX, gaugeY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      } // End of else block for regular tooltip
      
      ctx.restore();
      
      // Adjust sprite scale for round tachometer
      if (youTooltip && tachometerOnly) {
        youTooltip.scale.set(1.5, 1.5, 1); // Square aspect for round tachometer
      } else if (youTooltip && youTooltip.defaultScale) {
        youTooltip.scale.set(youTooltip.defaultScale.x, youTooltip.defaultScale.y, youTooltip.defaultScale.z);
      }
    }
    
    // Draw initial tooltip without border
    drawTooltip();
    
    // Create texture and sprite with sharp filtering
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;  // Smooth when small
    texture.magFilter = THREE.LinearFilter;  // Smooth when large
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    
    youTooltip = new THREE.Sprite(spriteMaterial);
    // Use same scale as TREASURE (adjusted for smaller canvas)
    youTooltip.scale.set(2, 1, 1);  // 2/3 of TREASURE's width since canvas is 2/3 size
    youTooltip.defaultScale = { x: 2, y: 1, z: 1 }; // Store default scale
    youTooltip.position.set(gameState.x, gameState.y + 2, gameState.z);  // Closer above car
    scene.add(youTooltip);
    
    // Store canvas, context and texture for updates
    youTooltip.canvas = canvas;
    youTooltip.ctx = ctx;
    youTooltip.texture = texture;
    youTooltip.drawTooltip = drawTooltip;
    
    // Store reference to update function for later removal
    youTooltip.fadeFunction = () => {
      // Flash white border
      drawTooltip('#FFFFFF');  // Draw with white border
      texture.needsUpdate = true;  // Tell Three.js to update the texture
      
      // Remove after brief flash
      setTimeout(() => {
        scene.remove(youTooltip);
        youTooltip.material.dispose();
        texture.dispose();
        youTooltip = null;
      }, 300);  // Flash for 300ms
    };
  }
  
  // Remove YOU tooltip if it has no content
  function removeYouTooltipIfEmpty() {
    if (youTooltip && !youTooltipContent.horn && !youTooltipContent.tachometer) {
      scene.remove(youTooltip);
      if (youTooltip.material) youTooltip.material.dispose();
      if (youTooltip.texture) youTooltip.texture.dispose();
      youTooltip = null;
    }
  }
  
  // Create "TREASURE" tooltip above chest
  function createTreasureTooltip() {
    // Create sprite for "TREASURE" label - high res
    const canvas = document.createElement('canvas');
    canvas.width = 768;  // Wider for longer text
    canvas.height = 256;  // Double resolution
    const ctx = canvas.getContext('2d');
    
    // Function to draw the tooltip
    function drawTooltip(borderColor = null) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Scale up for higher resolution
      ctx.save();
      ctx.scale(2, 2);
      
      // Draw map pin style background
      ctx.fillStyle = '#000000';  // Black background
      ctx.strokeStyle = borderColor || '#000000';  // Border color (black by default)
      ctx.lineWidth = borderColor ? 4 : 0;  // Thick border when flashing
      
      // Pin dimensions (scaled down by 2 since we're scaling up the context)
      const w = 320;  // Wider for "TREASURE"
      const h = 80;
      const r = 20;  // Corner radius
      const x = (384 - w) / 2;  // Center horizontally
      const y = 10;
      
      // Draw rounded rectangle with pin
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      
      // Draw the pin point
      ctx.lineTo(x + w/2 + 15, y + h);
      ctx.lineTo(x + w/2, y + h + 20);
      ctx.lineTo(x + w/2 - 15, y + h);
      
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      
      ctx.fill();
      if (borderColor) {
        ctx.stroke();
      }
      
      // Draw "TREASURE" text in white with higher quality
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial';  // Slightly smaller for longer text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TREASURE', 192, 50);
      
      ctx.restore();
    }
    
    // Draw initial tooltip without border
    drawTooltip();
    
    // Create texture and sprite with sharp filtering
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;  // Smooth when small
    texture.magFilter = THREE.LinearFilter;  // Smooth when large
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    
    treasureTooltip = new THREE.Sprite(spriteMaterial);
    // Make it appropriately sized for the treasure chest
    treasureTooltip.scale.set(3, 1, 1);  // Smaller for smaller chest
    treasureTooltip.position.set(0, 1.5, -117);  // Above treasure chest at back of fence
    scene.add(treasureTooltip);
    
    // Store reference to update function for later removal
    treasureTooltip.fadeFunction = () => {
      // Flash white border
      drawTooltip('#FFFFFF');  // Draw with white border
      texture.needsUpdate = true;  // Tell Three.js to update the texture
      
      // Remove after brief flash
      setTimeout(() => {
        scene.remove(treasureTooltip);
        treasureTooltip.material.dispose();
        texture.dispose();
        treasureTooltip = null;
      }, 300);  // Flash for 300ms
    };
  }

  // Initialize sound system
  function initSound() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create engine sound
      engineOscillator = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();
      
      engineOscillator.type = 'triangle'; // Triangle wave for thinner, cutesy 2-stroke sound
      engineOscillator.frequency.setValueAtTime(20, audioCtx.currentTime); // Much lower starting frequency
      engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
      
      engineOscillator.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOscillator.start();
      
      // Create rev sound that responds to throttle
      revOscillator = audioCtx.createOscillator();
      revGain = audioCtx.createGain();
      
      revOscillator.type = 'sawtooth'; // More aggressive sound for revving
      revOscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
      revGain.gain.setValueAtTime(0, audioCtx.currentTime);
      
      revOscillator.connect(revGain);
      revGain.connect(audioCtx.destination);
      revOscillator.start();
      
      // Create 4-stroke idle sound layer
      idleOscillator = audioCtx.createOscillator();
      idleGain = audioCtx.createGain();
      
      // 4-stroke sound: sawtooth wave for rougher, deeper sound
      idleOscillator.type = 'sawtooth';
      idleOscillator.frequency.setValueAtTime(20, audioCtx.currentTime); // Lower idle frequency
      
      // Add subtle frequency modulation for realistic idle roughness
      const idleLFO = audioCtx.createOscillator();
      const idleLFOGain = audioCtx.createGain();
      idleLFO.frequency.setValueAtTime(3, audioCtx.currentTime); // 3 Hz wobble
      idleLFOGain.gain.setValueAtTime(1.5, audioCtx.currentTime); // ±1.5 Hz variation
      idleLFO.connect(idleLFOGain);
      idleLFOGain.connect(idleOscillator.frequency);
      idleLFO.start();
      
      // Add some lowpass filtering for more realistic engine sound
      const idleFilter = audioCtx.createBiquadFilter();
      idleFilter.type = 'lowpass';
      idleFilter.frequency.setValueAtTime(300, audioCtx.currentTime); // Cut high frequencies
      idleFilter.Q.setValueAtTime(2, audioCtx.currentTime); // Some resonance
      
      // Constant low volume for idle
      idleGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.idle * soundVolumes.master, audioCtx.currentTime);
      
      idleOscillator.connect(idleFilter);
      idleFilter.connect(idleGain);
      idleGain.connect(audioCtx.destination);
      idleOscillator.start();
    }
  }
  
  // Wind noise
  let windNoiseOscillator = null;
  let windNoiseFilter = null;
  
  function updateWindNoise(linearSpeed) {
    if (!audioCtx || isMuted || soundVolumes.wind === 0) return;
    
    const speed = Math.abs(linearSpeed);
    
    if (speed > 5 && !windNoiseOscillator) {
      // Create wind noise
      windNoiseOscillator = audioCtx.createOscillator();
      windNoiseGain = audioCtx.createGain();
      windNoiseFilter = audioCtx.createBiquadFilter();
      
      // Pink noise approximation
      windNoiseOscillator.type = 'triangle';
      windNoiseOscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
      
      // Low pass filter for wind sound
      windNoiseFilter.type = 'lowpass';
      windNoiseFilter.frequency.setValueAtTime(500, audioCtx.currentTime);
      windNoiseFilter.Q.setValueAtTime(1, audioCtx.currentTime);
      
      windNoiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
      
      windNoiseOscillator.connect(windNoiseFilter);
      windNoiseFilter.connect(windNoiseGain);
      windNoiseGain.connect(audioCtx.destination);
      windNoiseOscillator.start();
    }
    
    if (windNoiseGain) {
      // Volume increases with speed
      const speedFactor = Math.min(speed / 30, 1.0); // Max at 30 m/s
      const targetVolume = speedFactor * soundVolumes.wind * soundVolumes.master;
      windNoiseGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.2);
      
      // Filter frequency increases with speed
      if (windNoiseFilter) {
        const freq = 300 + speedFactor * 700; // 300-1000 Hz range
        windNoiseFilter.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
      }
    }
    
    // Stop wind when slow
    if (speed < 3 && windNoiseOscillator) {
      windNoiseOscillator.stop();
      windNoiseOscillator = null;
      windNoiseGain = null;
      windNoiseFilter = null;
    }
  }

  // Update rev sound based on throttle input
  function updateRevSound(throttle, engineRPM) {
    if (revOscillator && revGain && !isMuted) {
      // Rev sound responds to throttle input AND current RPM
      // This creates the "struggling engine" effect
      const idleRPM = 750;
      const targetRPM = throttle > 0 ? 
        Math.min(gameState.maxEngineRPM, Math.max(idleRPM, engineRPM) + throttle * 2000) : 
        Math.max(idleRPM, engineRPM);
      
      // Convert RPM to frequency - lowered by 2 octaves
      const frequency = (targetRPM / 60) * 4 / 4; // 4-stroke engine, divided by 4 for 2 octaves lower
      
      revOscillator.frequency.setTargetAtTime(frequency, audioCtx.currentTime, 0.1);
      
      // Volume based on throttle
      const volume = throttle * soundVolumes.engine * 1.5;
      revGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
    }
  }
  
  // Update engine sound based on wheel speed
  function updateEngineSound() {
    if (engineOscillator && engineGain) {
      // Calculate actual engine RPM from physics
      const actualSpeed = Math.abs(gameState.wheelSpeed * gameState.wheelDiameter / 2);
      const wheelRPM = Math.abs(gameState.wheelSpeed) * 60 / (2 * Math.PI);
      
      // Use the actual gear ratios to calculate engine RPM
      const currentGearRatio = gameState.gearRatios[gameState.currentGearIndex || 0];
      const totalGearRatio = Math.abs(currentGearRatio) * gameState.finalDriveRatio;
      let engineRPM = Math.max(wheelRPM * totalGearRatio, 750); // 750 RPM idle
      
      // Engine sound frequency should be linear with RPM
      // 2-stroke engines fire twice per revolution (vs 4-stroke once per revolution)
      let frequency = engineRPM / 60; // Hz - one cycle per revolution
      
      // 2-stroke fires twice per revolution, but lower pitch for less annoying sound
      frequency = frequency * 1.5; // Lower pitch than before (was 2x)
      
      // Add subtle frequency modulation for 2-stroke irregularity
      const modulationDepth = frequency * 0.05; // 5% frequency variation
      const modulationRate = 15; // Hz - rapid flutter
      const modulation = Math.sin(audioCtx.currentTime * modulationRate * 2 * Math.PI) * modulationDepth;
      
      engineOscillator.frequency.setTargetAtTime(frequency + modulation, audioCtx.currentTime, 0.05);
      
      // Volume for cutesy small 2-stroke engine
      // Base idle volume + speed-based volume
      const idleVolume = soundVolumes.engine;
      const speedVolume = Math.min(Math.abs(gameState.wheelSpeed) / 50, soundVolumes.engine * 1.5); // Reduced max volume multiplier
      const volume = isMuted ? 0 : (idleVolume + speedVolume) * soundVolumes.master;
      engineGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.1);
      
      // Store current gear for UI display
      gameState.currentGear = gameState.currentGearIndex === 4 ? 'R' : (gameState.currentGearIndex + 1);
    }
  }
  
  // Play collision sound with spatial positioning
  function playCollisionSound(impactX = gameState.x, impactZ = gameState.z) {
    if (!audioCtx || isMuted) return;
    
    // Create spatial audio nodes
    const panner = audioCtx.createPanner();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Set up 3D spatial positioning
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.positionX.setValueAtTime(impactX, audioCtx.currentTime);
    panner.positionY.setValueAtTime(0, audioCtx.currentTime);
    panner.positionZ.setValueAtTime(impactZ, audioCtx.currentTime);
    
    // Update listener position (camera/player position)
    audioCtx.listener.positionX.setValueAtTime(gameState.x, audioCtx.currentTime);
    audioCtx.listener.positionY.setValueAtTime(5, audioCtx.currentTime); // Camera height
    audioCtx.listener.positionZ.setValueAtTime(gameState.z + 10, audioCtx.currentTime); // Behind car
    
    // Create dull thud sound - low frequency triangle wave
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60, audioCtx.currentTime); // Much lower for dull thud
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.3); // Longer decay
    
    // Volume for impact sound
    gain.gain.setValueAtTime(soundVolumes.collision * soundVolumes.master, audioCtx.currentTime); // Much louder for better audibility
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
  
  // Flash screen effect for collisions
  function flashScreen() {
    // Create or reuse flash overlay
    let flashOverlay = document.getElementById('collision-flash');
    if (!flashOverlay) {
      flashOverlay = document.createElement('div');
      flashOverlay.id = 'collision-flash';
      flashOverlay.style.position = 'fixed';
      flashOverlay.style.top = '0';
      flashOverlay.style.left = '0';
      flashOverlay.style.width = '100%';
      flashOverlay.style.height = '100%';
      flashOverlay.style.backgroundColor = 'white';
      flashOverlay.style.opacity = '0';
      flashOverlay.style.pointerEvents = 'none';
      flashOverlay.style.zIndex = '9999';
      flashOverlay.style.mixBlendMode = 'difference';
      document.body.appendChild(flashOverlay);
    }
    
    // Trigger flash animation
    flashOverlay.style.transition = 'none';
    flashOverlay.style.opacity = '0.8';
    
    // Fade out
    setTimeout(() => {
      flashOverlay.style.transition = 'opacity 0.2s';
      flashOverlay.style.opacity = '0';
    }, 50);
  }
  
  // Tire screech sound
  let tireScreechOscillator = null;
  let tireScreechFilter = null;
  
  function updateTireScreech(hasGroundContact, linearSpeed) {
    if (!audioCtx || isMuted) return;
    
    // Use the actual slip ratios from physics that create skid marks
    let maxSlipRatio = 0;
    let shouldPlaySound = false;
    
    if (hasGroundContact) {
      Object.values(gameState.tires).forEach(tire => {
        if (tire.onGround && tire.slipRatio) {
          const absSlip = Math.abs(tire.slipRatio);
          // Play sound when slip matches skid mark threshold
          if (absSlip > 0.15) {  // Same as skid mark creation threshold
            maxSlipRatio = Math.max(maxSlipRatio, absSlip);
            shouldPlaySound = true;
          }
        }
      });
    }
    
    // Create oscillator once and reuse it
    if (!tireScreechOscillator && audioCtx) {
      tireScreechOscillator = audioCtx.createOscillator();
      tireScreechGain = audioCtx.createGain();
      tireScreechFilter = audioCtx.createBiquadFilter();
      
      // Very deep tire rumble sound
      tireScreechOscillator.type = 'triangle';  // Smoother waveform
      tireScreechOscillator.frequency.setValueAtTime(80, audioCtx.currentTime);
      
      // Low-pass filter for deep rumbling
      tireScreechFilter.type = 'lowpass';
      tireScreechFilter.frequency.setValueAtTime(200, audioCtx.currentTime);
      tireScreechFilter.Q.setValueAtTime(8, audioCtx.currentTime);
      
      tireScreechGain.gain.setValueAtTime(0, audioCtx.currentTime);
      
      tireScreechOscillator.connect(tireScreechFilter);
      tireScreechFilter.connect(tireScreechGain);
      tireScreechGain.connect(audioCtx.destination);
      tireScreechOscillator.start();
    }
    
    if (tireScreechGain) {
      if (shouldPlaySound) {
        // Update volume based on slip amount
        const targetVolume = Math.min(maxSlipRatio * 2, 1.0) * soundVolumes.tires * soundVolumes.master;
        tireScreechGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.05);
        
        // Modulate frequency based on speed
        if (tireScreechOscillator) {
          const freq = 60 + Math.abs(linearSpeed) * 2;
          tireScreechOscillator.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
        }
      } else {
        // Fade out instead of stopping
        tireScreechGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      }
    }
  }

  // Brake sound
  let brakeOscillator = null;
  let brakeGain = null;
  let brakeFilter = null;
  
  function updateBrakeSound(braking, handbrake, linearSpeed) {
    if (!audioCtx || isMuted) return;
    
    const speed = Math.abs(linearSpeed);
    const shouldPlayBrakeSound = (braking || handbrake) && speed > 2; // Only when moving
    
    // Create oscillator once and reuse it
    if (!brakeOscillator && audioCtx) {
      brakeOscillator = audioCtx.createOscillator();
      brakeGain = audioCtx.createGain();
      brakeFilter = audioCtx.createBiquadFilter();
      
      // Brake pad friction sound - lower frequency rumble
      brakeOscillator.type = 'triangle';  // Softer than sawtooth
      brakeOscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      
      // Low-pass filter for muffled brake sound
      brakeFilter.type = 'lowpass';
      brakeFilter.frequency.setValueAtTime(400, audioCtx.currentTime);
      brakeFilter.Q.setValueAtTime(2, audioCtx.currentTime);
      
      brakeGain.gain.setValueAtTime(0, audioCtx.currentTime);
      
      brakeOscillator.connect(brakeFilter);
      brakeFilter.connect(brakeGain);
      brakeGain.connect(audioCtx.destination);
      brakeOscillator.start();
    }
    
    if (brakeGain) {
      if (shouldPlayBrakeSound) {
        // Volume based on speed and brake pressure
        const speedFactor = Math.min(speed / 20, 1.0); // Max at 20 m/s
        const brakeVolume = speedFactor * soundVolumes.tires * soundVolumes.master * 0.3;  // Quieter
        brakeGain.gain.setTargetAtTime(brakeVolume, audioCtx.currentTime, 0.05);
        
        // Modulate frequency based on speed - lower range for rumble
        if (brakeOscillator) {
          const freq = 100 + speedFactor * 150 + Math.sin(audioCtx.currentTime * 20) * 10;
          brakeOscillator.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.02);
          
          // Also modulate filter for dynamic texture
          if (brakeFilter) {
            const filterFreq = 300 + speedFactor * 300;
            brakeFilter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.05);
          }
        }
      } else {
        // Fade out instead of stopping
        brakeGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      }
    }
  }

  // Play horn sound with 3D spatial positioning from front of car
  let hornOscillator = null;
  let hornOscillator2 = null;  // Second oscillator for dual-tone
  let hornPanner = null;
  let hornGain = null;
  
  function playHorn(start) {
    if (!audioCtx || isMuted) return;
    
    if (start && !hornOscillator) {
      // Show horn indicator
      createHornIndicator();
      // Calculate horn position at front of car
      const hornX = gameState.x + Math.cos(gameState.angle) * 1.2; // 1.2m in front
      const hornZ = gameState.z - Math.sin(gameState.angle) * 1.2;
      
      // Create spatial audio nodes
      hornPanner = audioCtx.createPanner();
      hornOscillator = audioCtx.createOscillator();
      hornGain = audioCtx.createGain();
      
      // Set up 3D spatial positioning
      hornPanner.panningModel = 'HRTF';
      hornPanner.distanceModel = 'inverse';
      hornPanner.refDistance = 0.5; // Closer reference for more intimate sound
      hornPanner.maxDistance = 20;
      hornPanner.positionX.setValueAtTime(hornX, audioCtx.currentTime);
      hornPanner.positionY.setValueAtTime(0.5, audioCtx.currentTime); // Horn height
      hornPanner.positionZ.setValueAtTime(hornZ, audioCtx.currentTime);
      
      // Update listener position
      audioCtx.listener.positionX.setValueAtTime(gameState.x, audioCtx.currentTime);
      audioCtx.listener.positionY.setValueAtTime(5, audioCtx.currentTime);
      audioCtx.listener.positionZ.setValueAtTime(gameState.z + 10, audioCtx.currentTime);
      
      // Create dual-tone horn sound (typical car horn uses two frequencies)
      hornOscillator.type = 'sine';
      hornOscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
      
      // Second oscillator for dual-tone effect
      hornOscillator2 = audioCtx.createOscillator();
      hornOscillator2.type = 'sine';
      hornOscillator2.frequency.setValueAtTime(554, audioCtx.currentTime); // C#5 note (major third above)
      
      hornGain.gain.setValueAtTime(soundVolumes.horn * soundVolumes.master, audioCtx.currentTime);
      
      hornOscillator.connect(hornGain);
      hornOscillator2.connect(hornGain);
      hornGain.connect(hornPanner);
      hornPanner.connect(audioCtx.destination);
      hornOscillator.start();
      hornOscillator2.start();
    } else if (!start && hornOscillator) {
      // Stop horn
      hornOscillator.stop();
      if (hornOscillator2) {
        hornOscillator2.stop();
        hornOscillator2 = null;
      }
      hornOscillator = null;
      hornPanner = null;
      hornGain = null;
      
      // Remove horn indicator when horn stops
      removeHornIndicator();
    }
  }

  // Suspension sound function
  function updateSuspensionSound() {
    if (!audioCtx || isMuted || soundVolumes.suspension === 0) return;
    
    // Calculate suspension velocity (rate of change) for each wheel
    let maxCompressionVelocity = 0;
    const tires = Object.values(gameState.tires);
    
    tires.forEach((tire) => {
      // Use the actual spring velocity which is already calculated in physics
      const compressionVelocity = Math.abs(tire.springVelocity);
      maxCompressionVelocity = Math.max(maxCompressionVelocity, compressionVelocity);
    });

    // Trigger sound on rapid compression/expansion (high velocity)
    // Threshold is higher to only trigger on significant impacts
    if (maxCompressionVelocity > 50 && !suspensionSound) {
      suspensionSound = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const filterNode = audioCtx.createBiquadFilter();
      const noiseNode = audioCtx.createOscillator();
      const noiseGain = audioCtx.createGain();

      // Base creaky sound
      suspensionSound.type = 'triangle';
      suspensionSound.frequency.setValueAtTime(30 + Math.random() * 15, audioCtx.currentTime);
      
      // Add some noise for texture
      noiseNode.type = 'sawtooth';
      noiseNode.frequency.setValueAtTime(100 + Math.random() * 50, audioCtx.currentTime);
      noiseGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      
      // Low-pass filter for muffled mechanical sound
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(150, audioCtx.currentTime);
      filterNode.Q.setValueAtTime(5, audioCtx.currentTime);

      // Volume based on impact strength
      const impactStrength = Math.min(maxCompressionVelocity / 100, 1.0);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(soundVolumes.suspension * soundVolumes.master * impactStrength, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

      // Connect audio graph
      suspensionSound.connect(filterNode);
      noiseNode.connect(noiseGain);
      noiseGain.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      suspensionSound.start();
      noiseNode.start();
      suspensionSound.stop(audioCtx.currentTime + 0.15);
      noiseNode.stop(audioCtx.currentTime + 0.15);

      suspensionSound.onended = () => {
        suspensionSound = null;
      };
    }
  }

  // Log sound volumes for debugging
  window.logSoundVolumes = function() {
    console.log('Sound Volumes:', {
      master: soundVolumes.master,
      engine: soundVolumes.engine,
      idle: soundVolumes.idle,
      horn: soundVolumes.horn,
      collision: soundVolumes.collision,
      gearChange: soundVolumes.gearChange,
      tires: soundVolumes.tires,
      wind: soundVolumes.wind,
      suspension: soundVolumes.suspension
    });
  }
  
  // Mute toggle function for button
  window.muteToggle = function() {
    isMuted = !isMuted;
    // Update all active sound volumes using the volume system
    if (engineGain) engineGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.engine * soundVolumes.master, audioCtx.currentTime);
    if (idleGain) idleGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.idle * soundVolumes.master, audioCtx.currentTime);
    if (revGain) revGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.engine * soundVolumes.master, audioCtx.currentTime);
    if (tireScreechGain) tireScreechGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.tires * soundVolumes.master, audioCtx.currentTime);
    if (brakeGain) brakeGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.tires * soundVolumes.master * 0.5, audioCtx.currentTime);
    if (windNoiseGain) windNoiseGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.wind * soundVolumes.master, audioCtx.currentTime);
    if (hornGain) hornGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.horn * soundVolumes.master, audioCtx.currentTime);
    // Update button text
    const muteBtn = document.querySelector('button[onclick="muteToggle()"]');
    if (muteBtn) muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    console.log('Sound', isMuted ? 'muted' : 'unmuted');
  }

  // Play gear change sound
  function playGearChangeSound(isReverseTransition = false) {
    if (!audioCtx || isMuted) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Low frequency "clunk" sound
    osc.type = 'triangle';
    
    if (isReverseTransition) {
      // More noticeable sound for R↔1 transitions - deeper
      osc.frequency.setValueAtTime(80, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(soundVolumes.gearChange * soundVolumes.master * 1.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    } else {
      // Regular gear change sound - deeper clunk
      osc.frequency.setValueAtTime(60, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(soundVolumes.gearChange * soundVolumes.master * 0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    }
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (isReverseTransition ? 0.25 : 0.15));
  }

  // Add subtle road texture (not aggressive bumps)
  function addRoadTexture(tire, magnitude = 1.0) {
    if (Math.random() < 0.02) { // 2% chance per frame - much less frequent
      // Add very small vertical impulse
      const textureForce = (Math.random() - 0.5) * magnitude * 2; // Very subtle
      tire.springVelocity += textureForce;
    }
  }

  // Create skid mark at tire position
  function createSkidMark(x, z, slipRatio) {
    // slipRatio: 0 = no slip, 1 = maximum slip
    // Use exponential scaling for more realistic appearance
    // Light marks appear only with significant slip
    const opacity = Math.pow(slipRatio, 2.0) * 0.6; // More exponential scaling, lower max opacity
    
    // Don't create mark if too light - only show marks for significant slip
    if (slipRatio < 0.4) return; // Much higher threshold - only heavy slip creates marks
    
    const skidGeometry = new THREE.PlaneGeometry(0.15, 0.3);
    const skidMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.colors.black,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    });
    
    const skidMark = new THREE.Mesh(skidGeometry, skidMaterial);
    skidMark.rotation.x = -Math.PI / 2;
    skidMark.position.set(x, 0.01, z);
    skidMark.rotation.z = gameState.angle;  // Align with car direction
    
    scene.add(skidMark);
    skidMarks.push(skidMark);
    
    // Remove old skid marks for performance
    if (skidMarks.length > MAX_SKID_MARKS) {
      const oldMark = skidMarks.shift();
      scene.remove(oldMark);
      oldMark.geometry.dispose();
      oldMark.material.dispose();
    }
  }
  
  // Create white ink mark at tire position
  function createInkMark(x, z, inkLevel) {
    // inkLevel: 0 = no ink, 1 = full ink
    const opacity = inkLevel * 0.8; // Max 80% opacity for visibility
    
    // Don't create mark if too faint
    if (inkLevel < 0.1) return;
    
    const inkGeometry = new THREE.PlaneGeometry(0.2, 0.4); // Slightly larger than skid marks
    const inkMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.colors.white,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    });
    
    const inkMark = new THREE.Mesh(inkGeometry, inkMaterial);
    inkMark.rotation.x = -Math.PI / 2;
    inkMark.position.set(x, 0.011, z); // Slightly above skid marks
    inkMark.rotation.z = gameState.angle;  // Align with car direction
    
    scene.add(inkMark);
    skidMarks.push(inkMark); // Reuse skidMarks array for all tire marks
    
    // Remove old marks for performance
    if (skidMarks.length > MAX_SKID_MARKS + MAX_INK_MARKS) {
      const oldMark = skidMarks.shift();
      scene.remove(oldMark);
      oldMark.geometry.dispose();
      oldMark.material.dispose();
    }
  }

  // Calculate weight distribution and suspension forces for each tire
  function updateSuspension(acceleration, deltaTime) {
    const g = gameState.gravity;  // gravity
    const totalWeight = gameState.mass * g;
    
    // Get current velocity and steering for lateral forces
    const velocity = gameState.wheelSpeed * (gameState.wheelDiameter / 2);
    const steeringAngle = gameState.wheelAngle;
    
    // LONGITUDINAL WEIGHT TRANSFER (braking/acceleration)
    const longitudinalForce = gameState.mass * acceleration;
    // Center of gravity positioned low (bottom 1/5 of body = 0.9/5 = 0.18m from bottom)
    const heightCenterOfGravity = 0.12;  // m - VERY low CoG for extreme stability
    const wheelbaseLength = gameState.wheelbase;  // 2m
    const trackWidth = 1.8;  // m - wider track for better stability
    
    // CoG longitudinal position: between front wheels (about 35% from front)
    // This gives us the 48/52 weight distribution
    
    // Weight transfer calculations (Newton's laws)
    // F = ma causes moment about contact patch: M = F * h
    const pitchMoment = longitudinalForce * heightCenterOfGravity;
    const frontWeightTransfer = pitchMoment / wheelbaseLength;
    
    // Aerodynamic lift effect during acceleration (wheelie tendency)
    // At high speeds with hard acceleration, front lifts due to:
    // 1. Torque reaction from rear wheels
    // 2. Aerodynamic forces on the body
    const speed = Math.abs(velocity);
    const accelerationFactor = Math.max(0, acceleration / 30); // Normalize by max acceleration
    const speedFactor = Math.min(speed / 20, 1); // Effect increases with speed up to 20 m/s
    const aerodynamicLift = accelerationFactor * speedFactor * totalWeight * 0.15; // Up to 15% front lift
    
    // LATERAL WEIGHT TRANSFER (cornering)
    // Calculate lateral acceleration from turning
    let lateralAcceleration = 0;
    if (Math.abs(steeringAngle) > 0.01 && Math.abs(velocity) > 0.1) {
      // a = v²/r where r is turning radius
      const turningRadius = wheelbaseLength / Math.tan(Math.abs(steeringAngle));
      lateralAcceleration = (velocity * velocity) / turningRadius * Math.sign(steeringAngle);
    }
    
    const lateralForce = gameState.mass * lateralAcceleration;
    const rollMoment = lateralForce * heightCenterOfGravity;
    const lateralWeightTransfer = rollMoment / trackWidth;
    
    // Base weight distribution - slightly rear biased for sports car feel
    // CoG is between front wheels, so more weight on rear for balance
    const baseFrontWeight = totalWeight * 0.48;  // 48% front
    const baseRearWeight = totalWeight * 0.52;   // 52% rear
    
    // Apply longitudinal weight transfer
    // During acceleration (positive force), weight shifts to rear (front gets lighter)
    // During braking (negative force), weight shifts to front (rear gets lighter)
    const frontWeight = baseFrontWeight - frontWeightTransfer - aerodynamicLift;  // Acceleration reduces front weight + lift
    const rearWeight = baseRearWeight + frontWeightTransfer + aerodynamicLift;     // Acceleration increases rear weight
    
    // Apply lateral weight transfer
    // Positive lateral acceleration = turning right = weight shifts left
    const leftWeightTransfer = -lateralWeightTransfer;
    const rightWeightTransfer = lateralWeightTransfer;
    
    // Distribute to all four corners with LIMITED transfers to prevent tipping
    // Clamp weight transfer to prevent any wheel from losing all load
    const maxTransfer = totalWeight * 0.35;  // No wheel can lose more than 35% of total weight
    const clampedLeftTransfer = Math.max(-maxTransfer, Math.min(maxTransfer, leftWeightTransfer));
    const clampedRightTransfer = Math.max(-maxTransfer, Math.min(maxTransfer, rightWeightTransfer));
    
    gameState.tires.frontLeft.weightLoad = (frontWeight / 2) + clampedLeftTransfer * 0.6;
    gameState.tires.frontRight.weightLoad = (frontWeight / 2) + clampedRightTransfer * 0.6;
    gameState.tires.rearLeft.weightLoad = (rearWeight / 2) + clampedLeftTransfer * 0.4;
    gameState.tires.rearRight.weightLoad = (rearWeight / 2) + clampedRightTransfer * 0.4;
    
    // Update suspension for each tire
    Object.entries(gameState.tires).forEach(([tireName, tire]) => {
      // INERTIA EFFECTS: Objects want to continue in their current motion
      // When braking, the car body wants to continue forward, compressing front springs
      // When accelerating, the car body wants to stay still, compressing rear springs
      // When turning, the car body wants to continue straight, compressing outside springs
      
      // Calculate rest compression under static load
      const staticLoad = (gameState.mass * gameState.gravity) / 4;  // Each tire supports 1/4 weight
      const restCompression = gameState.suspension.springStiffness > 0 ? staticLoad / gameState.suspension.springStiffness : 0;
      
      // Calculate target compression based on car body position and ground height
      // The tire needs to reach from the car body attachment point to the ground
      const tireAttachmentY = gameState.y - gameState.rideHeightOffset - CONFIG.car.size.height / 2;
      const targetTireBottomY = tire.groundHeight;
      const wheelRadius = gameState.wheelDiameter / 2;
      
      // Target compression = how much the spring needs to compress to reach the ground
      const targetCompression = Math.max(0, tireAttachmentY - targetTireBottomY - wheelRadius);
      
      // Update spring compression towards target (this creates the spring force naturally)
      const compressionError = targetCompression - tire.springCompression;
      
      // Spring force: F = -k * (x - x0) where x0 is rest position
      const springForce = -gameState.suspension.springStiffness * (tire.springCompression - restCompression);
      
      // Damper force: F = -c * v (negative because it opposes motion)
      const damperForce = -gameState.suspension.damperCoefficient * tire.springVelocity;
      
      // Total force: Weight pushing down, spring+damper pushing up
      const totalForce = tire.weightLoad + springForce + damperForce;
      
      // Update spring dynamics (F = ma, so a = F/m)
      const effectiveMass = Math.max(gameState.mass / 4, 0.1);  // Mass supported by this spring (min 0.1 to avoid division by zero)
      const springAcceleration = totalForce / effectiveMass;
      
      // Integrate velocity and position
      tire.springVelocity += springAcceleration * deltaTime;
      tire.springCompression += tire.springVelocity * deltaTime;
      
      // Weight transfer is already handled by changing tire.weightLoad above
      // No need for additional velocity impulses - physics handles it naturally
      
      // Limit compression and extension to physical constraints
      if (tire.onGround) {
        // When on ground, limit compression (positive values)
        tire.springCompression = Math.max(0, Math.min(tire.springCompression, gameState.suspension.maxCompression));
        // Stop velocity if we hit the limit
        if (tire.springCompression >= gameState.suspension.maxCompression && tire.springVelocity > 0) {
          tire.springVelocity = 0;
        }
      } else {
        // When in air, allow extension (negative values mean extended)
        tire.springCompression = Math.max(-gameState.suspension.maxExtension, tire.springCompression);
        // Stop velocity if we hit extension limit
        if (tire.springCompression <= -gameState.suspension.maxExtension && tire.springVelocity < 0) {
          tire.springVelocity = 0;
        }
      }
      
      // Calculate normal force (affects tire grip)
      // Normal force is the upward force from the spring and damper
      const suspensionForce = Math.max(0, -springForce - damperForce);  // Negative because forces point up
      tire.normalForce = suspensionForce;
      
      // Update grip based on normal force (more weight = more grip)
      const baseGrip = tire.normalForce / (totalWeight / 4);  // Normalized to 1.0 at nominal load
      tire.grip = Math.min(1.5, Math.max(0.1, baseGrip));  // Grip ranges from 0.1 to 1.5
      
      // Update tire Y position - center is always wheelRadius above ground
      // Suspension compression is handled separately in visual positioning
      tire.y = tire.groundHeight + wheelRadius;
      
      // Add subtle road texture when driving
      if (tire.onGround && Math.abs(gameState.wheelSpeed) > 2) {
        addRoadTexture(tire, Math.abs(gameState.wheelSpeed) / 50);
      }
    });
  }
  
  // Calculate slip angle for each tire
  function calculateTireSlipAngle(tire, tireWorldVelocity, tireHeading) {
    // Get tire velocity in local space
    const tireLocalVel = {
      x: tireWorldVelocity.x * Math.cos(-tireHeading) - tireWorldVelocity.z * Math.sin(-tireHeading),
      z: tireWorldVelocity.x * Math.sin(-tireHeading) + tireWorldVelocity.z * Math.cos(-tireHeading)
    };
    
    // Slip angle is angle between velocity and tire heading
    if (Math.abs(tireLocalVel.z) > 0.1) {
      tire.slipAngle = Math.atan2(tireLocalVel.x, Math.abs(tireLocalVel.z));
    } else {
      tire.slipAngle = 0;
    }
    
    // Update slip ratio for longitudinal forces
    const wheelRadius = gameState.wheelDiameter / 2;
    const isFrontTire = tire === gameState.tires.frontLeft || tire === gameState.tires.frontRight;
    const wheelSpeed = (isFrontTire ? gameState.frontWheelSpeed : gameState.wheelSpeed) * wheelRadius;
    const groundSpeed = tireLocalVel.z;
    
    if (Math.abs(groundSpeed) > 0.5) {
      tire.slipRatio = (wheelSpeed - groundSpeed) / Math.abs(groundSpeed);
    } else if (Math.abs(wheelSpeed) > 0.5) {
      tire.slipRatio = 1.0; // Full slip when spinning/locked
    } else {
      tire.slipRatio = 0;
    }
    
    // Clamp slip ratio
    tire.slipRatio = Math.max(-1, Math.min(1, tire.slipRatio));
  }
  
  // Simplified Pacejka Magic Formula for lateral force
  function pacejkaLateral(slipAngle, load, friction) {
    // Constants tuned for realistic grip behavior
    const B = 10;   // Stiffness factor - higher = more responsive at low angles
    const C = 1.4;   // Shape factor - controls curve shape
    const D = friction * load * 1.5;  // Peak force - realistic lateral grip
    const E = -0.1;  // Curvature factor
    
    // Add speed-sensitive grip reduction to prevent extreme G-forces
    const speed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
    const speedFactor = 1.0 / (1.0 + speed * 0.01); // Reduces grip at high speed
    
    const x = slipAngle * 180 / Math.PI; // Convert to degrees
    const baseForce = D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))));
    
    // Apply speed factor only at high speeds to prevent extreme cornering forces
    if (speed > 20) {
      return baseForce * (0.5 + 0.5 * speedFactor);
    }
    return baseForce;
  }
  
  // Simplified Pacejka Magic Formula for longitudinal force
  function pacejkaLongitudinal(slipRatio, load, friction) {
    const B = 12;    // Higher stiffness for better low-speed grip
    const C = 1.65;  // Shape factor for realistic curve
    const D = friction * load * 1.8;  // Peak force - good acceleration grip
    const E = -0.1;
    
    // Add low-speed grip enhancement
    const speed = Math.abs(gameState.wheelSpeed * gameState.wheelDiameter / 2);
    const lowSpeedBoost = speed < 5 ? 2.0 - speed * 0.2 : 1.0; // Double grip at very low speeds
    
    const baseForce = D * Math.sin(C * Math.atan(B * slipRatio - E * (B * slipRatio - Math.atan(B * slipRatio))));
    
    return baseForce * lowSpeedBoost;
  }
  
  // Combined slip using friction circle
  function combinedTireForces(tire, load) {
    const lateralForce = pacejkaLateral(tire.slipAngle, load, tire.surfaceFriction);
    const longitudinalForce = pacejkaLongitudinal(tire.slipRatio, load, tire.surfaceFriction);
    
    // Friction circle - total force can't exceed max friction
    // Use a more realistic friction limit that accounts for tire characteristics
    const staticFriction = tire.surfaceFriction * 1.1; // Static friction is higher than sliding
    const kineticFriction = tire.surfaceFriction * 0.8; // Kinetic friction is lower
    
    // Transition between static and kinetic based on slip
    const totalSlip = Math.sqrt(tire.slipAngle * tire.slipAngle + tire.slipRatio * tire.slipRatio);
    const frictionCoeff = staticFriction - (staticFriction - kineticFriction) * Math.min(totalSlip * 10, 1);
    
    const maxForce = frictionCoeff * load;
    const totalForce = Math.sqrt(lateralForce * lateralForce + longitudinalForce * longitudinalForce);
    
    if (totalForce > maxForce) {
      // Scale down forces to stay within friction circle
      // But use a softer transition to prevent sudden grip loss
      const excess = (totalForce - maxForce) / maxForce;
      const scale = maxForce / totalForce * (1 - 0.3 * Math.min(excess, 1)); // Gradual reduction
      tire.lateralForce = lateralForce * scale;
      tire.longitudinalForce = longitudinalForce * scale;
    } else {
      tire.lateralForce = lateralForce;
      tire.longitudinalForce = longitudinalForce;
    }
  }
  
  // Calculate physics for all tires
  function calculateTirePhysics(deltaTime, braking = false, handbrake = false) {
    // Get car velocity at each tire position
    const carVel = { x: gameState.vx, z: gameState.vz };
    const angVel = gameState.angularVelocity;
    
    // Define actual tire positions relative to car center
    const halfWheelbase = gameState.wheelbase / 2;
    const tirePositions = {
      frontLeft: { x: -0.5, z: halfWheelbase },
      frontRight: { x: 0.5, z: halfWheelbase },
      rearLeft: { x: -0.5, z: -halfWheelbase },
      rearRight: { x: 0.5, z: -halfWheelbase }
    };
    
    Object.entries(gameState.tires).forEach(([tireName, tire]) => {
      if (!tire.onGround) {
        tire.lateralForce = 0;
        tire.longitudinalForce = 0;
        tire.slipRatio = 0;
        tire.slipAngle = 0;
        return;
      }
      
      // Update surface friction based on current surface type
      updateTireSurfaceFriction(tire);
      
      // Calculate tire velocity including rotation
      const tirePos = tirePositions[tireName];
      const relPos = { x: tirePos.x, z: tirePos.z };
      
      // Velocity at tire position = car velocity + velocity from rotation
      const tireVel = {
        x: carVel.x - angVel * relPos.z,
        z: carVel.z + angVel * relPos.x
      };
      
      // Calculate tire heading (car angle + steer angle for front tires)
      const isFrontTire = tireName.includes('front');
      const tireHeading = gameState.angle + (isFrontTire ? gameState.wheelAngle : 0);
      
      // Calculate slip angle and slip ratio
      calculateTireSlipAngle(tire, tireVel, tireHeading);
      
      // Calculate longitudinal slip ratio (for acceleration/braking)
      const wheelRadius = gameState.wheelDiameter / 2;
      const tireSpeed = Math.sqrt(tireVel.x * tireVel.x + tireVel.z * tireVel.z);
      const wheelLinearSpeed = Math.abs(tire.angularVelocity * wheelRadius);
      
      // Calculate tire direction vector
      const tireDirX = Math.sin(tireHeading);
      const tireDirZ = Math.cos(tireHeading);
      
      // Project tire velocity onto tire direction for longitudinal speed
      const longitudinalSpeed = tireVel.x * tireDirX + tireVel.z * tireDirZ;
      
      // For rear tires, apply engine/brake torque to determine desired slip
      const isRearTire = tireName.includes('rear');
      if (isRearTire && gameState.desiredWheelTorque && gameState.desiredWheelTorque !== 0) {
        // Apply engine torque to rear wheels
        // Positive torque = forward acceleration
        const desiredForce = gameState.desiredWheelTorque / wheelRadius;
        
        // Direct force application - split between two rear tires
        tire.longitudinalForce = desiredForce / 2;
        
        // Set slip ratio for visual effects
        const torqueRatio = Math.abs(gameState.desiredWheelTorque) / (gameState.maxTorque * 10);
        tire.slipRatio = Math.sign(gameState.desiredWheelTorque) * torqueRatio * 0.05; // Small slip for visual effects
      } else if (handbrake && isFrontTire && gameState.desiredBrakeForceFront) {
        // Handbrake on front wheels
        tire.slipRatio = -1; // Lock the wheels
      } else if (braking && gameState.desiredBrakeForce) {
        // Regular braking - negative slip ratio
        const brakeSlip = -gameState.desiredBrakeForce / (tire.normalForce * tire.surfaceFriction * 5);
        tire.slipRatio = Math.max(-1, brakeSlip);
      } else {
        // Free rolling
        if (Math.abs(longitudinalSpeed) > 0.1) {
          tire.slipRatio = (wheelLinearSpeed - Math.abs(longitudinalSpeed)) / Math.abs(longitudinalSpeed);
        } else if (wheelLinearSpeed > 0.1) {
          tire.slipRatio = 1.0; // Wheel spinning with car stopped
        } else {
          tire.slipRatio = 0;
        }
      }
      
      // Clamp slip ratio to realistic range
      tire.slipRatio = Math.max(-1, Math.min(1, tire.slipRatio));
      
      // Only calculate forces using Pacejka if we haven't already set them directly
      if (tire.longitudinalForce === 0) {
        // Calculate forces using Pacejka model with friction circle
        // Use actual normal force from suspension, with small minimum to avoid division by zero
        const effectiveNormalForce = Math.max(tire.normalForce || 10, 10); // Small minimum of 10N
        combinedTireForces(tire, effectiveNormalForce);
      } else {
        // We already have longitudinal force from engine/brakes, just calculate lateral
        const effectiveNormalForce = Math.max(tire.normalForce || 10, 10);
        tire.lateralForce = pacejkaLateral(tire.slipAngle, effectiveNormalForce, tire.surfaceFriction);
      }
      
      // Update individual wheel angular velocity based on forces
      if (isFrontTire) {
        tire.angularVelocity = gameState.frontWheelSpeed;
      } else {
        tire.angularVelocity = gameState.wheelSpeed;
      }
    });
  }
  
  // Update surface friction for a tire
  function updateTireSurfaceFriction(tire) {
    // Default to asphalt if no surface type specified
    const surfaceType = tire.surfaceType || 'asphalt';
    const surface = SURFACE_TYPES[surfaceType];
    
    if (surface) {
      tire.surfaceFriction = surface.friction;
      
      // Apply surface-specific effects
      if (surface.speedPenalty && tire.longitudinalForce > 0) {
        // Reduce acceleration on difficult surfaces
        tire.longitudinalForce *= surface.speedPenalty;
      }
      
      if (surface.slipMultiplier) {
        // Increase slip on slippery surfaces
        tire.slipAngle *= surface.slipMultiplier;
        tire.slipRatio = Math.min(1, Math.abs(tire.slipRatio) * surface.slipMultiplier) * Math.sign(tire.slipRatio);
      }
    }
  }
  
  // Apply tire forces to vehicle
  function applyTireForces(deltaTime) {
    let totalForceX = 0;
    let totalForceZ = 0;
    let totalTorque = 0;
    
    // Define actual tire positions relative to car center
    const halfWheelbase = gameState.wheelbase / 2;
    const tirePositions = {
      frontLeft: { x: -0.5, z: halfWheelbase },
      frontRight: { x: 0.5, z: halfWheelbase },
      rearLeft: { x: -0.5, z: -halfWheelbase },
      rearRight: { x: 0.5, z: -halfWheelbase }
    };
    
    Object.entries(gameState.tires).forEach(([tireName, tire]) => {
      if (!tire.onGround) return;
      
      // Calculate tire heading (car angle + steer angle for front tires)
      const isFrontTire = tireName.includes('front');
      const tireAngle = gameState.angle + (isFrontTire ? gameState.wheelAngle : 0);
      
      // Transform tire forces to world space
      const worldForceX = tire.longitudinalForce * Math.sin(tireAngle) + 
                         tire.lateralForce * Math.cos(tireAngle);
      const worldForceZ = tire.longitudinalForce * Math.cos(tireAngle) - 
                          tire.lateralForce * Math.sin(tireAngle);
      
      totalForceX += worldForceX;
      totalForceZ += worldForceZ;
      
      // Calculate torque around car center using actual tire positions
      const tirePos = tirePositions[tireName];
      const leverArmX = tirePos.x;
      const leverArmZ = tirePos.z;
      const tireTorque = leverArmX * worldForceZ - leverArmZ * worldForceX;
      totalTorque += tireTorque;
      
      // Debug log individual tire contributions
      if (Math.random() < 0.002 && tire.longitudinalForce !== 0) {
        console.log(`Tire ${tireName}:`, {
          tireAngle: tireAngle * 180 / Math.PI,
          longitudinalForce: tire.longitudinalForce,
          worldForceX,
          worldForceZ,
          leverArmX,
          leverArmZ,
          tireTorque
        });
      }
    });
    
    // Apply forces (this will override the simple acceleration model)
    let accelX = totalForceX / gameState.mass;
    let accelZ = totalForceZ / gameState.mass;
    
    // Calculate total acceleration in G-forces
    const totalAccel = Math.sqrt(accelX * accelX + accelZ * accelZ);
    const gForce = totalAccel / gameState.gravity;
    
    // Limit to realistic G-forces (around 1.5G for a street car)
    const maxGForce = 1.5;
    if (gForce > maxGForce) {
      const scale = maxGForce / gForce;
      accelX *= scale;
      accelZ *= scale;
      totalTorque *= scale * 0.7; // Scale rotational forces less aggressively
    }
    
    gameState.vx += accelX * deltaTime;
    gameState.vz += accelZ * deltaTime;
    
    // Debug: Also log the applied forces
    if (Math.random() < 0.002 && (totalForceX !== 0 || totalForceZ !== 0)) {
      console.log('Applied Forces:', {
        totalForceX,
        totalForceZ,
        accelX,
        accelZ,
        resultingVx: gameState.vx,
        resultingVz: gameState.vz
      });
    }
    
    // Apply torque for rotation
    const angularAcceleration = totalTorque / gameState.momentOfInertia;
    gameState.angularVelocity += angularAcceleration * deltaTime;
    
  }

  // Dev mode functions (make them global for onclick)
  window.toggleDevMode = toggleDevMode;
  
  // Alias for compatibility with old panel
  window.moveCarCardinal = window.moveCardinal;

  // Camera control functions
  window.logCameraPosition = function() {
    console.log(`Camera Position: x=${camera.position.x.toFixed(1)}, y=${camera.position.y.toFixed(1)}, z=${camera.position.z.toFixed(1)}`);
  };
  
  window.resetCamera = function() {
    // Reset to default isometric position
    const angle = Math.PI * 30 / 180;
    const originalX = 10;
    const originalZ = 10;
    camera.position.set(
      originalX * Math.cos(angle) + originalZ * Math.sin(angle),
      15,
      -originalX * Math.sin(angle) + originalZ * Math.cos(angle)
    );
    camera.lookAt(0, 0, 0);
    
    // Update sliders
    document.getElementById('ctrl_cameraX').value = camera.position.x;
    document.getElementById('ctrl_cameraY').value = camera.position.y;
    document.getElementById('ctrl_cameraZ').value = camera.position.z;
    document.getElementById('val_cameraX').textContent = camera.position.x.toFixed(1);
    document.getElementById('val_cameraY').textContent = camera.position.y.toFixed(1);
    document.getElementById('val_cameraZ').textContent = camera.position.z.toFixed(1);
  };

  // Create DEV TOOLS panel
  function createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'devToolsPanel';
    
    // Modern styling with CSS variables for theming
    panel.innerHTML = `
      <style>
        #devToolsPanel {
          --bg-primary: rgba(255, 255, 255, 0.95);
          --bg-secondary: #f5f5f5;
          --bg-tertiary: #e8e8e8;
          --text-primary: #1a1a1a;
          --text-secondary: #666;
          --border-color: #ddd;
          --accent: #0066cc;
          --shadow: 0 2px 10px rgba(0,0,0,0.1);
          
          position: fixed;
          top: 10px;
          right: 10px;
          background: var(--bg-primary);
          border-radius: 8px;
          box-shadow: var(--shadow);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          width: 320px;
          max-height: calc(100vh - 20px);
          overflow: hidden;
          z-index: 10000;
          transition: all 0.3s ease;
        }
        
        @media (prefers-color-scheme: dark) {
          #devToolsPanel {
            --bg-primary: rgba(30, 30, 30, 0.95);
            --bg-secondary: #2a2a2a;
            --bg-tertiary: #3a3a3a;
            --text-primary: #e0e0e0;
            --text-secondary: #999;
            --border-color: #444;
            --accent: #4da3ff;
            --shadow: 0 2px 20px rgba(0,0,0,0.5);
          }
        }
        
        #devToolsPanel.minimized {
          width: auto;
          height: auto;
        }
        
        #devToolsPanel.minimized .dev-content {
          display: none;
        }
        
        #devToolsPanel.minimized .dev-header {
          border-radius: 8px;
        }
        
        .dev-header {
          background: var(--bg-secondary);
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          user-select: none;
        }
        
        .dev-title {
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .dev-controls {
          display: flex;
          gap: 8px;
        }
        
        .dev-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }
        
        .dev-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        
        .dev-content {
          max-height: calc(100vh - 80px);
          overflow-y: auto;
          padding: 0;
        }
        
        .dev-section {
          border-bottom: 1px solid var(--border-color);
        }
        
        .dev-section:last-child {
          border-bottom: none;
        }
        
        .dev-section-header {
          background: var(--bg-secondary);
          padding: 10px 16px;
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 500;
          color: var(--text-primary);
          transition: background 0.2s;
        }
        
        .dev-section-header:hover {
          background: var(--bg-tertiary);
        }
        
        .dev-section-content {
          padding: 12px 16px;
          display: none;
        }
        
        .dev-section.active .dev-section-content {
          display: block;
        }
        
        .dev-section.active .section-arrow {
          transform: rotate(90deg);
        }
        
        .section-arrow {
          transition: transform 0.2s;
          color: var(--text-secondary);
        }
        
        .dev-group {
          margin-bottom: 16px;
        }
        
        .dev-group:last-child {
          margin-bottom: 0;
        }
        
        .dev-group-title {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 8px;
          font-weight: 600;
        }
        
        .dev-control {
          margin-bottom: 12px;
        }
        
        .dev-control:last-child {
          margin-bottom: 0;
        }
        
        .dev-label {
          display: block;
          color: var(--text-primary);
          margin-bottom: 4px;
          font-size: 12px;
        }
        
        .dev-input {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 12px;
          font-family: inherit;
        }
        
        .dev-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        
        .dev-slider {
          width: 100%;
          margin: 8px 0;
        }
        
        .dev-value {
          display: inline-block;
          min-width: 60px;
          text-align: right;
          color: var(--accent);
          font-weight: 500;
        }
        
        .dev-button {
          background: var(--accent);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: opacity 0.2s;
        }
        
        .dev-button:hover {
          opacity: 0.8;
        }
        
        .dev-button.secondary {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        
        .dev-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }
        
        .dev-info {
          background: var(--bg-tertiary);
          padding: 8px;
          border-radius: 4px;
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 8px;
        }
        
        .dev-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        
        .dev-status {
          background: var(--bg-tertiary);
          padding: 6px 8px;
          border-radius: 4px;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 11px;
          color: var(--text-primary);
        }
        
        /* Scrollbar styling */
        .dev-content::-webkit-scrollbar {
          width: 8px;
        }
        
        .dev-content::-webkit-scrollbar-track {
          background: var(--bg-secondary);
        }
        
        .dev-content::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 4px;
        }
        
        .dev-content::-webkit-scrollbar-thumb:hover {
          background: var(--text-secondary);
        }
      </style>
    `;
    
    
    // Build the panel content
    const panelHTML = `
      <div class="dev-header">
        <div class="dev-title">
          <span>🛠️</span>
          <span>DEV TOOLS</span>
        </div>
        <div class="dev-controls">
          <button class="dev-btn" onclick="minimizeDevTools()" title="Minimize">_</button>
          <button class="dev-btn" onclick="closeDevTools()" title="Close">✕</button>
        </div>
      </div>
      
      <div class="dev-content">
        <!-- Overlays Section -->
        <div class="dev-section active" id="section-overlays">
          <div class="dev-section-header" onclick="toggleDevSection('overlays')">
            <span>🎯 Overlays</span>
            <span class="section-arrow">▶</span>
          </div>
          <div class="dev-section-content">
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-fps" onchange="toggleFPSCounter()">
                <span>Show FPS Counter</span>
              </label>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-grid" onchange="toggleDevGrid()">
                <span>Show Grid (1m² squares)</span>
              </label>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-coords" onchange="toggleCoordSystem()">
                <span>Enable Coordinate Tagging</span>
              </label>
              <div class="dev-info" id="coord-info" style="display: none;">
                Click anywhere to place coordinate markers
              </div>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-labels" onchange="toggleObjectLabels()">
                <span>Show Object Labels</span>
              </label>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-cardinals" onchange="toggleCardinals()">
                <span>Show Cardinal Directions</span>
              </label>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-hide-tachometer" onchange="toggleHideTachometer()">
                <span>Hide Tachometer</span>
              </label>
            </div>
            <div class="dev-control">
              <label class="dev-checkbox-label">
                <input type="checkbox" id="dev-tooltip-persist" onchange="toggleTooltipPersist()">
                <span>Disable Tooltip Auto-Expire</span>
              </label>
            </div>
            <div class="dev-grid" style="margin-top: 12px;">
              <button class="dev-button secondary" onclick="clearAllMarkers()">Clear Markers</button>
              <button class="dev-button secondary" onclick="toggleAllVisuals()">Toggle All</button>
            </div>
          </div>
        </div>
        
        <!-- Positioning Section -->
        <div class="dev-section" id="section-positioning">
          <div class="dev-section-header" onclick="toggleDevSection('positioning')">
            <span>📍 Positioning</span>
            <span class="section-arrow">▶</span>
          </div>
          <div class="dev-section-content">
            <div class="dev-status" style="margin-bottom: 12px;">
              <div>Position: <span id="dev-pos">X: ${gameState.x.toFixed(1)}, Z: ${gameState.z.toFixed(1)}</span></div>
              <div>Rotation: <span id="dev-rot">${(gameState.angle * 180 / Math.PI).toFixed(0)}°</span></div>
              <div>Speed: <span id="dev-speed">0.0</span> m/s</div>
            </div>
            
            <div class="dev-group">
              <div class="dev-group-title">Teleport</div>
              <div class="dev-grid">
                <div>
                  <label class="dev-label">X</label>
                  <input type="number" class="dev-input" id="dev-teleport-x" value="${gameState.x.toFixed(1)}" step="0.5">
                </div>
                <div>
                  <label class="dev-label">Z</label>
                  <input type="number" class="dev-input" id="dev-teleport-z" value="${gameState.z.toFixed(1)}" step="0.5">
                </div>
              </div>
              <button class="dev-button" onclick="teleportCar()" style="width: 100%; margin-top: 8px;">Teleport</button>
            </div>
            
            <div class="dev-group">
              <div class="dev-group-title">Quick Move</div>
              <select class="dev-input" id="dev-move-dir">
                <option value="north">North (-X)</option>
                <option value="south">South (+X)</option>
                <option value="east">East (+Z)</option>
                <option value="west">West (-Z)</option>
              </select>
              <div class="dev-grid" style="margin-top: 8px;">
                <input type="number" class="dev-input" id="dev-move-dist" value="5" step="1" placeholder="Distance">
                <button class="dev-button" onclick="moveCardinal()">Move</button>
              </div>
            </div>
            
            <button class="dev-button secondary" onclick="resetToSpawn()" style="width: 100%;">Reset to Spawn</button>
          </div>
        </div>
        
        <!-- Rendering Section -->
        <div class="dev-section" id="section-rendering">
          <div class="dev-section-header" onclick="toggleDevSection('rendering')">
            <span>🎨 Rendering</span>
            <span class="section-arrow">▶</span>
          </div>
          <div class="dev-section-content">
            <div class="dev-control">
              <label class="dev-label">Camera Mode</label>
              <select class="dev-select" id="dev-camera-mode" onchange="updateCameraMode()">
                <option value="0">Stable Tracking (Default)</option>
                <option value="1">Fixed Follow</option>
                <option value="2">Stable No Tracking</option>
              </select>
            </div>
            
            <div id="fixed-cam-controls">
              <div class="dev-group">
                <div class="dev-group-title">Camera Position</div>
                <div class="dev-control">
                  <label class="dev-label">
                    X Position
                    <span class="dev-value" id="val-cam-x">0.0</span>
                  </label>
                  <input type="range" class="dev-slider" id="dev-cam-x" 
                    min="-50" max="50" step="0.5" value="0"
                    oninput="updateCameraPos()">
                </div>
                <div class="dev-control">
                  <label class="dev-label">
                    Y Position
                    <span class="dev-value" id="val-cam-y">0.0</span>
                  </label>
                  <input type="range" class="dev-slider" id="dev-cam-y" 
                    min="0" max="50" step="0.5" value="15"
                    oninput="updateCameraPos()">
                </div>
                <div class="dev-control">
                  <label class="dev-label">
                    Z Position
                    <span class="dev-value" id="val-cam-z">0.0</span>
                  </label>
                  <input type="range" class="dev-slider" id="dev-cam-z" 
                    min="-50" max="50" step="0.5" value="0"
                    oninput="updateCameraPos()">
                </div>
              </div>
              
              <div class="dev-group">
                <div class="dev-group-title">Camera Zoom</div>
                <div class="dev-control">
                  <label class="dev-label">
                    Zoom Level
                    <span class="dev-value" id="val-zoom">${cameraZoom.toFixed(1)}x</span>
                  </label>
                  <input type="range" class="dev-slider" id="dev-zoom" 
                    min="0.5" max="3.0" step="0.1" value="${cameraZoom}"
                    oninput="updateCameraZoom(this.value)">
                </div>
              </div>
              
              <div class="dev-group">
                <div class="dev-group-title">Tooltip Scale</div>
                <div class="dev-control">
                  <label class="dev-label">
                    Tooltip Size
                    <span class="dev-value" id="val-tooltip-scale">1.0x</span>
                  </label>
                  <input type="range" class="dev-slider" id="dev-tooltip-scale" 
                    min="0.5" max="2.0" step="0.1" value="1.5"
                    oninput="updateTooltipScale(this.value)">
                </div>
              </div>
              
              <div class="dev-group">
                <div class="dev-group-title">Presets</div>
                <div class="dev-grid">
                  <button class="dev-button secondary" onclick="setCamPreset('top')">Top</button>
                  <button class="dev-button secondary" onclick="setCamPreset('side')">Side</button>
                  <button class="dev-button secondary" onclick="setCamPreset('front')">Front</button>
                  <button class="dev-button secondary" onclick="setCamPreset('iso')">Isometric</button>
                </div>
              </div>
              
              <div class="dev-group">
                <button class="dev-button" onclick="resetCameraDefaults()">Reset Camera to Defaults</button>
              </div>
            </div>
        
        <!-- Simulation Section -->
        <div class="dev-section" id="section-simulation">
          <div class="dev-section-header" onclick="toggleDevSection('simulation')">
            <span>⚙️ Simulation</span>
            <span class="section-arrow">▶</span>
          </div>
          <div class="dev-section-content">
            <!-- Car Physics Group -->
            <div class="dev-group">
              <div class="dev-group-title">Car Physics</div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Mass
                  <span class="dev-value" id="val-mass">${gameState.mass}</span> kg
                </label>
                <input type="range" class="dev-slider" id="dev-mass" 
                  min="200" max="2000" step="50" value="${gameState.mass}"
                  oninput="updatePhysics('mass', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Engine Power
                  <span class="dev-value" id="val-enginePower">${gameState.enginePower}</span> W
                </label>
                <input type="range" class="dev-slider" id="dev-enginePower" 
                  min="20000" max="200000" step="5000" value="${gameState.enginePower}"
                  oninput="updatePhysics('enginePower', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Max Torque
                  <span class="dev-value" id="val-maxTorque">${gameState.maxTorque}</span> Nm
                </label>
                <input type="range" class="dev-slider" id="dev-maxTorque" 
                  min="100" max="1000" step="50" value="${gameState.maxTorque}"
                  oninput="updatePhysics('maxTorque', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Drag Coefficient
                  <span class="dev-value" id="val-dragCoefficient">${gameState.dragCoefficient.toFixed(2)}</span>
                </label>
                <input type="range" class="dev-slider" id="dev-dragCoefficient" 
                  min="0.01" max="0.5" step="0.01" value="${gameState.dragCoefficient}"
                  oninput="updatePhysics('dragCoefficient', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Rolling Resistance
                  <span class="dev-value" id="val-rollingResistance">${gameState.rollingResistance.toFixed(4)}</span>
                </label>
                <input type="range" class="dev-slider" id="dev-rollingResistance" 
                  min="0.0001" max="0.01" step="0.0001" value="${gameState.rollingResistance}"
                  oninput="updatePhysics('rollingResistance', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Wheelbase
                  <span class="dev-value" id="val-wheelbase">${gameState.wheelbase.toFixed(2)}</span> m
                </label>
                <input type="range" class="dev-slider" id="dev-wheelbase" 
                  min="0.5" max="2.0" step="0.05" value="${gameState.wheelbase}"
                  oninput="updatePhysics('wheelbase', this.value)">
              </div>
            </div>
            
            <!-- Suspension Group -->
            <div class="dev-group">
              <div class="dev-group-title">Suspension</div>
              <div class="dev-control">
                <label class="dev-label">
                  Spring Stiffness
                  <span class="dev-value" id="val-springStiffness">${gameState.suspension.springStiffness}</span> N/m
                </label>
                <input type="range" class="dev-slider" id="dev-springStiffness" 
                  min="10000" max="50000" step="1000" value="${gameState.suspension.springStiffness}"
                  oninput="updateSuspension('springStiffness', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Damper
                  <span class="dev-value" id="val-damperCoefficient">${gameState.suspension.damperCoefficient}</span> Ns/m
                </label>
                <input type="range" class="dev-slider" id="dev-damperCoefficient" 
                  min="1000" max="10000" step="100" value="${gameState.suspension.damperCoefficient}"
                  oninput="updateSuspension('damperCoefficient', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Max Compression
                  <span class="dev-value" id="val-maxCompression">${gameState.suspension.maxCompression.toFixed(2)}</span> m
                </label>
                <input type="range" class="dev-slider" id="dev-maxCompression" 
                  min="0.01" max="0.20" step="0.01" value="${gameState.suspension.maxCompression}"
                  oninput="updateSuspension('maxCompression', this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Ride Height
                  <span class="dev-value" id="val-rideHeightOffset">${gameState.rideHeightOffset.toFixed(2)}</span> m
                </label>
                <input type="range" class="dev-slider" id="dev-rideHeightOffset" 
                  min="-0.35" max="-0.20" step="0.005" value="${gameState.rideHeightOffset}"
                  oninput="updatePhysics('rideHeightOffset', this.value)">
              </div>
            </div>
            
            <!-- World Physics Group -->
            <div class="dev-group">
              <div class="dev-group-title">World Physics</div>
              <div class="dev-control">
                <label class="dev-label">
                  Gravity
                  <span class="dev-value" id="val-gravity">${gameState.gravity.toFixed(1)}</span> m/s²
                </label>
                <input type="range" class="dev-slider" id="dev-gravity" 
                  min="4.9" max="29.4" step="0.1" value="${gameState.gravity}"
                  oninput="updatePhysics('gravity', this.value)">
              </div>
            </div>
          </div>
        </div>
            
            <!-- Pixelation Group -->
            <div class="dev-group">
              <div class="dev-group-title">Pixelation</div>
              <div class="dev-control">
                <label class="dev-checkbox-label">
                  <input type="checkbox" id="dev-pixelation" onchange="togglePixelation(this.checked)">
                  <span>Enable Pixelation</span>
                </label>
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Pixel Scale
                  <span class="dev-value" id="val-pixelscale">${pixelScale}x</span>
                </label>
                <input type="range" class="dev-slider" id="dev-pixelscale" 
                  min="1" max="8" step="1" value="${pixelScale}"
                  oninput="updatePixelScale(this.value)">
              </div>
              
              <div class="dev-control">
                <label class="dev-label">
                  Resolution
                  <span class="dev-value" id="val-pixelres">${pixelRenderWidth}x${pixelRenderHeight}</span>
                </label>
                <div class="dev-grid">
                  <div>
                    <label class="dev-label">Width</label>
                    <input type="number" class="dev-input" id="dev-pixelwidth" 
                      value="${pixelRenderWidth}" min="160" max="1920" step="80"
                      oninput="updatePixelResolution(this.value, document.getElementById('dev-pixelheight').value)">
                  </div>
                  <div>
                    <label class="dev-label">Height</label>
                    <input type="number" class="dev-input" id="dev-pixelheight" 
                      value="${pixelRenderHeight}" min="120" max="1080" step="60"
                      oninput="updatePixelResolution(document.getElementById('dev-pixelwidth').value, this.value)">
                  </div>
                </div>
              </div>
              
              <div class="dev-info">
                <div>Press P to toggle pixelation</div>
                <div>Lower resolution = more retro look</div>
              </div>
            </div>
            
            <!-- Debug Options -->
            <div class="dev-grid" style="margin-top: 12px;">
              <button class="dev-button secondary" onclick="logGameState()">Log State</button>
              <button class="dev-button secondary" onclick="logCameraInfo()">Log Camera</button>
              <button class="dev-button secondary" onclick="spawnTestCube()">Spawn Cube</button>
              <button class="dev-button secondary" onclick="clearTestObjects()">Clear Objects</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    panel.innerHTML += panelHTML;
    
    // Add the panel to the page
    document.body.appendChild(panel);
    
    // Make the panel draggable
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    const header = panel.querySelector('.dev-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      dragOffset.x = e.clientX - panel.offsetLeft;
      dragOffset.y = e.clientY - panel.offsetTop;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - dragOffset.x) + 'px';
      panel.style.top = (e.clientY - dragOffset.y) + 'px';
      panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
    
    // End of createControlPanel function
  }
  
  // Update parameter value
  function updateParameter(param, value) {
    switch(param) {
      // Direct gameState parameters
      case 'gravity':
      case 'mass':
      case 'dragCoefficient':
      case 'rollingResistance':
      case 'enginePower':
      case 'maxTorque':
      case 'rideHeightOffset':
        gameState[param] = value;
        break;
        
      // Camera parameters
      case 'cameraX':
        window.cameraMode = CAMERA_MODES.FIXED_FOLLOW;
        window.manualCameraMode = true;
        camera.position.x = value;
        camera.lookAt(gameState.x, 0, gameState.z);
        break;
      case 'cameraY':
        window.cameraMode = CAMERA_MODES.FIXED_FOLLOW;
        window.manualCameraMode = true;
        camera.position.y = value;
        camera.lookAt(gameState.x, 0, gameState.z);
        break;
      case 'cameraZ':
        window.cameraMode = CAMERA_MODES.FIXED_FOLLOW;
        window.manualCameraMode = true;
        camera.position.z = value;
        camera.lookAt(gameState.x, 0, gameState.z);
        break;
      
      // Suspension parameters
      case 'springStiffness':
      case 'damperCoefficient':
      case 'maxCompression':
        gameState.suspension[param] = value;
        break;
      
      // CONFIG.car parameters
      case 'friction':
        // Invert the friction value so higher slider = more friction
        CONFIG.car.friction = 1 - value;
        break;
      case 'maxSpeed':
      case 'acceleration':
      case 'turnSpeed':
        CONFIG.car[param] = value;
        break;
        
      // Sound parameters
      case 'soundMaster':
        soundVolumes.master = value;
        // Update all active sounds
        if (engineGain && !isMuted) engineGain.gain.setValueAtTime(soundVolumes.engine * soundVolumes.master, audioCtx.currentTime);
        if (idleGain && !isMuted) idleGain.gain.setValueAtTime(soundVolumes.idle * soundVolumes.master, audioCtx.currentTime);
        if (hornGain && !isMuted) hornGain.gain.setValueAtTime(soundVolumes.horn * soundVolumes.master, audioCtx.currentTime);
        if (tireScreechGain && !isMuted) tireScreechGain.gain.setValueAtTime(soundVolumes.tires * soundVolumes.master, audioCtx.currentTime);
        if (windNoiseGain && !isMuted) windNoiseGain.gain.setValueAtTime(soundVolumes.wind * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundEngine':
        soundVolumes.engine = value;
        if (engineGain && !isMuted) engineGain.gain.setValueAtTime(value * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundIdle':
        soundVolumes.idle = value;
        if (idleGain && !isMuted) idleGain.gain.setValueAtTime(value * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundHorn':
        soundVolumes.horn = value;
        if (hornGain && !isMuted) hornGain.gain.setValueAtTime(value * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundCollision':
        soundVolumes.collision = value;
        break;
      case 'soundGearChange':
        soundVolumes.gearChange = value;
        break;
      case 'soundTires':
        soundVolumes.tires = value;
        if (tireScreechGain && !isMuted) tireScreechGain.gain.setValueAtTime(value * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundWind':
        soundVolumes.wind = value;
        if (windNoiseGain && !isMuted) windNoiseGain.gain.setValueAtTime(value * soundVolumes.master, audioCtx.currentTime);
        break;
      case 'soundSuspension':
        soundVolumes.suspension = value;
        break;
    }
  }
  
  // Toggle panel visibility
  window.toggleControlPanel = function() {
    const content = document.getElementById('controlPanelContent');
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
  }
  
  // Toggle dev tools section
  window.toggleDevToolsSection = function() {
    const content = document.getElementById('devToolsContent');
    const header = event.target;
    if (content.style.display === 'none') {
      content.style.display = 'block';
      header.innerHTML = '🛠️ DEV TOOLS ▼';
    } else {
      content.style.display = 'none';
      header.innerHTML = '🛠️ DEV TOOLS ▶';
    }
  }
  
  // Update toggleDevMode to also update UI
  const originalToggleDevMode = toggleDevMode;
  toggleDevMode = function() {
    originalToggleDevMode();
    // Update the info display
    const infoDiv = document.getElementById('devModeInfo');
    if (infoDiv) {
      infoDiv.style.display = devMode ? 'block' : 'none';
    }
  }
  
  // Test objects for spawning
  let testObjects = [];
  
  window.spawnTestObject = function() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ 
      color: Math.random() * 0xffffff 
    });
    const cube = new THREE.Mesh(geometry, material);
    
    // Spawn near the car
    cube.position.set(
      gameState.x + (Math.random() - 0.5) * 10,
      0.5,
      gameState.z + (Math.random() - 0.5) * 10
    );
    cube.castShadow = true;
    cube.receiveShadow = true;
    
    scene.add(cube);
    testObjects.push({ mesh: cube, geometry, material });
    
    console.log(`Test object spawned at (${cube.position.x.toFixed(1)}, ${cube.position.z.toFixed(1)})`);
  }
  
  window.clearTestObjects = function() {
    testObjects.forEach(({ mesh, geometry, material }) => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    });
    testObjects = [];
    console.log('Cleared all test objects');
  }
  
  // Make clearCoordinateMarkers global
  window.clearCoordinateMarkers = clearCoordinateMarkers;
  
  // New DEV TOOLS functions
  window.minimizeDevTools = function() {
    const panel = document.getElementById('devToolsPanel');
    const minimizeBtn = panel.querySelector('.dev-btn[title="Minimize"]');
    
    panel.classList.toggle('minimized');
    
    // Update button text based on state
    if (panel.classList.contains('minimized')) {
      minimizeBtn.textContent = '□';
      minimizeBtn.title = 'Restore';
    } else {
      minimizeBtn.textContent = '_';
      minimizeBtn.title = 'Minimize';
    }
  }
  
  window.closeDevTools = function() {
    const panel = document.getElementById('devToolsPanel');
    panel.style.display = 'none';
  }
  
  window.toggleDevSection = function(section) {
    const sectionEl = document.getElementById(`section-${section}`);
    sectionEl.classList.toggle('active');
  }
  
  // Visualization controls
  window.toggleDevGrid = function() {
    const checked = document.getElementById('dev-grid').checked;
    if (checked) {
      createDevGrid();
      if (devGrid) devGrid.visible = true;
    } else {
      if (devGrid) devGrid.visible = false;
    }
  }
  
  window.toggleCoordSystem = function() {
    const checked = document.getElementById('dev-coords').checked;
    const info = document.getElementById('coord-info');
    info.style.display = checked ? 'block' : 'none';
    
    if (checked) {
      window.addEventListener('click', onDevClick);
    } else {
      window.removeEventListener('click', onDevClick);
      clearCoordinateMarkers();
    }
  }
  
  window.toggleObjectLabels = function() {
    const checked = document.getElementById('dev-labels').checked;
    if (checked) {
      addObjectLabels();
    } else {
      removeObjectLabels();
    }
  }
  
  window.toggleCardinals = function() {
    const checked = document.getElementById('dev-cardinals').checked;
    if (checked) {
      createDevHelpers();
      if (devHelpers) devHelpers.visible = true;
      
      // Create car axis helper
      if (!carAxisHelper) {
        carAxisHelper = new THREE.AxesHelper(2);  // 2 unit long axes
        carGroup.add(carAxisHelper);
      }
      carAxisHelper.visible = true;
    } else {
      if (devHelpers) devHelpers.visible = false;
      if (carAxisHelper) carAxisHelper.visible = false;
    }
  }
  
  window.clearAllMarkers = function() {
    clearCoordinateMarkers();
    console.log('All markers cleared');
  }
  
  window.toggleAllVisuals = function() {
    const checkboxes = ['dev-grid', 'dev-coords', 'dev-labels', 'dev-cardinals'];
    const allChecked = checkboxes.every(id => document.getElementById(id).checked);
    
    checkboxes.forEach(id => {
      document.getElementById(id).checked = !allChecked;
      document.getElementById(id).onchange();
    });
  }
  
  // Position & Movement
  window.teleportCar = function() {
    const x = parseFloat(document.getElementById('dev-teleport-x').value);
    const z = parseFloat(document.getElementById('dev-teleport-z').value);
    gameState.x = x;
    gameState.z = z;
    gameState.vx = 0;
    gameState.vz = 0;
    console.log(`Teleported to (${x}, ${z})`);
  }
  
  window.moveCardinal = function() {
    const dir = document.getElementById('dev-move-dir').value;
    const dist = parseFloat(document.getElementById('dev-move-dist').value);
    
    switch(dir) {
      case 'north': gameState.x -= dist; break;
      case 'south': gameState.x += dist; break;
      case 'east': gameState.z += dist; break;
      case 'west': gameState.z -= dist; break;
    }
    
    console.log(`Moved ${dist}m ${dir}`);
  }
  
  window.resetToSpawn = function() {
    gameState.x = -17.5;
    gameState.z = 0;
    gameState.y = 0.5;
    gameState.angle = Math.PI;
    gameState.vx = 0;
    gameState.vz = 0;
    gameState.vy = 0;
    gameState.wheelSpeed = 0;
    console.log('Reset to spawn position');
  }
  
  // Alias for compatibility
  window.resetCarPosition = window.resetToSpawn;
  
  // Camera controls
  window.updateCameraMode = function() {
    const mode = parseInt(document.getElementById('dev-camera-mode').value);
    window.cameraMode = mode;
    
    // Update backward compatibility flag
    window.manualCameraMode = (mode !== CAMERA_MODES.STABLE_TRACKING);
    
    const controls = document.getElementById('fixed-cam-controls');
    // Always show camera position controls
    controls.style.display = 'block';
    
    // Always update the slider values to reflect current camera position
    document.getElementById('dev-cam-x').value = camera.position.x;
    document.getElementById('dev-cam-y').value = camera.position.y;
    document.getElementById('dev-cam-z').value = camera.position.z;
    document.getElementById('val-cam-x').textContent = camera.position.x.toFixed(1);
    document.getElementById('val-cam-y').textContent = camera.position.y.toFixed(1);
    document.getElementById('val-cam-z').textContent = camera.position.z.toFixed(1);
    
    if (mode === CAMERA_MODES.STABLE_NO_TRACKING) {
      // For stable no tracking, store the current position/orientation
      if (!initialCameraPosition) {
        initialCameraPosition = {
          position: camera.position.clone(),
          lookAt: new THREE.Vector3(gameState.x, 0, gameState.z)
        };
      }
    }
    
    console.log(`Camera mode changed to: ${['Stable Tracking', 'Fixed Follow', 'Stable No Tracking'][mode]}`);
  }
  
  window.updateCameraPos = function() {
    // Ensure camera exists
    if (!camera) return;
    
    // If not in fixed follow mode, switch to it
    if (window.cameraMode !== CAMERA_MODES.FIXED_FOLLOW) {
      window.cameraMode = CAMERA_MODES.FIXED_FOLLOW;
      document.getElementById('dev-camera-mode').value = CAMERA_MODES.FIXED_FOLLOW;
    }
    
    const x = parseFloat(document.getElementById('dev-cam-x').value);
    const y = parseFloat(document.getElementById('dev-cam-y').value);
    const z = parseFloat(document.getElementById('dev-cam-z').value);
    
    camera.position.set(x, y, z);
    camera.lookAt(gameState.x, 0, gameState.z);
    
    // Update value displays
    document.getElementById('val-cam-x').textContent = x.toFixed(1);
    document.getElementById('val-cam-y').textContent = y.toFixed(1);
    document.getElementById('val-cam-z').textContent = z.toFixed(1);
  }
  
  // Camera zoom level
  let cameraZoom = 1.5;  // Default zoom level 1.5x
  let tooltipScale = 1.5;
  
  window.updateCameraZoom = function(zoom) {
    cameraZoom = parseFloat(zoom);
    document.getElementById('val-zoom').textContent = cameraZoom.toFixed(1) + 'x';
    
    // Apply zoom for orthographic camera
    if (camera) {
      const baseDistance = 22.5;  // Base camera distance
      const d = baseDistance / cameraZoom;
      const aspect = CONFIG.renderWidth / CONFIG.renderHeight;
      
      camera.left = -d * aspect;
      camera.right = d * aspect;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
    }
    
    // Update tooltip scales
    updateTooltipScales();
  };
  
  window.updateTooltipScale = function(scale) {
    tooltipScale = parseFloat(scale);
    document.getElementById('val-tooltip-scale').textContent = tooltipScale.toFixed(1) + 'x';
    
    // Update tooltip scales
    updateTooltipScales();
  };
  
  // Update all tooltip scales based on camera zoom
  function updateTooltipScales() {
    const effectiveScale = (1 / cameraZoom) * tooltipScale;
    
    // Update YOU tooltip if it exists
    if (youTooltip && youTooltip.scale) {
      youTooltip.scale.set(2 * effectiveScale, 1 * effectiveScale, 1);
    }
    
    // Update treasure tooltip if it exists
    if (treasureTooltip && treasureTooltip.scale) {
      treasureTooltip.scale.set(3 * effectiveScale, 1 * effectiveScale, 1);
    }
    
    // Update standalone horn indicator if it exists
    if (hornIndicator && hornIndicator.scale) {
      hornIndicator.scale.set(effectiveScale, effectiveScale, 1);
    }
    
    // Update standalone tachometer if it exists
    if (tachometer && tachometer.scale) {
      tachometer.scale.set(effectiveScale, effectiveScale, 1);
    }
  }
  
  // Reset camera to default values
  window.resetCameraDefaults = function() {
    // Reset to default stable tracking mode
    window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
    document.getElementById('dev-camera-mode').value = CAMERA_MODES.STABLE_TRACKING;
    
    // Reset zoom
    cameraZoom = 1.0;
    document.getElementById('dev-zoom').value = 1.0;
    document.getElementById('val-zoom').textContent = '1.0x';
    updateCameraZoom(1.0);
    
    // Reset camera to default position for stable tracking
    const cameraAngle = Math.PI * 30 / 180;
    const cameraDistance = 14.14;
    camera.position.x = gameState.x + cameraDistance * Math.sin(cameraAngle);
    camera.position.y = 15;
    camera.position.z = gameState.z + cameraDistance * Math.cos(cameraAngle);
    camera.lookAt(gameState.x, 0, gameState.z);
    
    // Update position displays
    document.getElementById('dev-cam-x').value = camera.position.x;
    document.getElementById('dev-cam-y').value = camera.position.y;
    document.getElementById('dev-cam-z').value = camera.position.z;
    document.getElementById('val-cam-x').textContent = camera.position.x.toFixed(1);
    document.getElementById('val-cam-y').textContent = camera.position.y.toFixed(1);
    document.getElementById('val-cam-z').textContent = camera.position.z.toFixed(1);
    
    console.log('Camera reset to defaults');
  };
  
  window.setCamPreset = function(preset) {
    // Ensure camera exists
    if (!camera) {
      console.warn('Camera not initialized yet');
      return;
    }
    
    // Switch to Fixed Follow mode
    window.cameraMode = CAMERA_MODES.FIXED_FOLLOW;
    document.getElementById('dev-camera-mode').value = CAMERA_MODES.FIXED_FOLLOW;
    
    switch(preset) {
      case 'top':
        camera.position.set(gameState.x, 40, gameState.z);
        break;
      case 'side':
        camera.position.set(gameState.x + 25, 15, gameState.z);
        break;
      case 'front':
        camera.position.set(gameState.x, 8, gameState.z - 20);
        break;
      case 'iso':
        camera.position.set(gameState.x + 20, 25, gameState.z + 20);
        break;
    }
    
    camera.lookAt(gameState.x, 0, gameState.z);
    
    // Update camera position inputs
    if (document.getElementById('dev-cam-x')) {
      document.getElementById('dev-cam-x').value = camera.position.x.toFixed(1);
      document.getElementById('dev-cam-y').value = camera.position.y.toFixed(1);
      document.getElementById('dev-cam-z').value = camera.position.z.toFixed(1);
      document.getElementById('val-cam-x').textContent = camera.position.x.toFixed(1);
      document.getElementById('val-cam-y').textContent = camera.position.y.toFixed(1);
      document.getElementById('val-cam-z').textContent = camera.position.z.toFixed(1);
    }
  }
  
  // Physics
  window.updatePhysics = function(param, value) {
    gameState[param] = parseFloat(value);
    const element = document.getElementById(`val-${param}`);
    if (element) {
      // Format the display value based on the parameter
      if (param === 'gravity') {
        element.textContent = parseFloat(value).toFixed(1);
      } else if (param === 'dragCoefficient' || param === 'rideHeightOffset' || param === 'wheelbase') {
        element.textContent = parseFloat(value).toFixed(2);
      } else if (param === 'rollingResistance') {
        element.textContent = parseFloat(value).toFixed(4);
      } else {
        element.textContent = value;
      }
    }
    
    // Update wheel positions if wheelbase changed
    if (param === 'wheelbase' && carGroup && carGroup.wheels) {
      const halfWheelbase = gameState.wheelbase / 2;
      carGroup.wheels.frontLeft.position.z = halfWheelbase;
      carGroup.wheels.frontRight.position.z = halfWheelbase;
      carGroup.wheels.rearLeft.position.z = -halfWheelbase;
      carGroup.wheels.rearRight.position.z = -halfWheelbase;
    }
  }
  
  // Suspension
  window.updateSuspension = function(param, value) {
    gameState.suspension[param] = parseFloat(value);
    const element = document.getElementById(`val-${param}`);
    if (element) {
      if (param === 'maxCompression') {
        element.textContent = parseFloat(value).toFixed(2);
      } else {
        element.textContent = value;
      }
    }
  }
  
  // Debug
  window.logGameState = function() {
    console.log('Game State:', gameState);
  }
  
  window.logCameraInfo = function() {
    console.log('Camera:', {
      position: camera.position,
      rotation: camera.rotation,
      mode: window.manualCameraMode ? 'Fixed' : 'Tracking'
    });
  }
  
  window.spawnTestCube = function() {
    spawnTestObject();
  }
  
  let showFPS = false;
  window.toggleFPSCounter = function() {
    showFPS = document.getElementById('dev-fps').checked;
  }
  
  window.toggleTooltipPersist = function() {
    const checked = document.getElementById('dev-tooltip-persist').checked;
    tooltipAutoExpireDisabled = checked;
    console.log(`Tooltip auto-expire ${checked ? 'disabled' : 'enabled'}`);
    
    // If tooltips were already faded and we're disabling auto-expire, show them again
    if (checked && hasStartedDriving) {
      if (youTooltip && youTooltip.visible === false) {
        youTooltip.visible = true;
        youTooltip.material.opacity = 1;
      }
      if (treasureTooltip && treasureTooltip.visible === false) {
        treasureTooltip.visible = true;
        treasureTooltip.material.opacity = 1;
      }
    }
  }
  
  window.toggleHideTachometer = function() {
    const checked = document.getElementById('dev-hide-tachometer').checked;
    tachometerHidden = checked;
    console.log(`Tachometer ${checked ? 'hidden' : 'shown'}`);
    
    // Hide tachometer immediately if checked
    if (checked && tachometer) {
      removeTachometer();
    }
  }
  
  // Camera control functions
  window.toggleCameraMode = function() {
    const checkbox = document.getElementById('ctrl_fixedCamera');
    window.manualCameraMode = checkbox.checked;
    
    // Update UI
    const statusDiv = document.getElementById('cameraStatus');
    const controlsDiv = document.getElementById('fixedCameraControls');
    
    if (statusDiv) {
      statusDiv.innerHTML = `Mode: <strong>${window.manualCameraMode ? 'Fixed' : 'Tracking'}</strong>`;
    }
    
    if (controlsDiv) {
      controlsDiv.style.display = window.manualCameraMode ? 'block' : 'none';
    }
    
    // Update camera position inputs if switching to fixed mode
    if (window.manualCameraMode) {
      document.getElementById('ctrl_camX').value = camera.position.x.toFixed(1);
      document.getElementById('ctrl_camY').value = camera.position.y.toFixed(1);
      document.getElementById('ctrl_camZ').value = camera.position.z.toFixed(1);
    }
    
    console.log(`Camera mode: ${window.manualCameraMode ? 'Fixed' : 'Tracking'}`);
  }
  
  window.updateFixedCamera = function() {
    if (!window.manualCameraMode) return;
    
    const x = parseFloat(document.getElementById('ctrl_camX').value);
    const y = parseFloat(document.getElementById('ctrl_camY').value);
    const z = parseFloat(document.getElementById('ctrl_camZ').value);
    
    camera.position.set(x, y, z);
    camera.lookAt(gameState.x, 0, gameState.z);
  }
  
  window.setCameraPreset = function(preset) {
    if (!window.manualCameraMode) {
      // Enable fixed mode first
      document.getElementById('ctrl_fixedCamera').checked = true;
      toggleCameraMode();
    }
    
    switch(preset) {
      case 'topDown':
        camera.position.set(gameState.x, 30, gameState.z);
        break;
      case 'side':
        camera.position.set(gameState.x + 20, 10, gameState.z);
        break;
      case 'front':
        camera.position.set(gameState.x, 5, gameState.z - 20);
        break;
    }
    
    camera.lookAt(gameState.x, 0, gameState.z);
    
    // Update inputs
    document.getElementById('ctrl_camX').value = camera.position.x.toFixed(1);
    document.getElementById('ctrl_camY').value = camera.position.y.toFixed(1);
    document.getElementById('ctrl_camZ').value = camera.position.z.toFixed(1);
  }
  
  // Log current values
  window.logCurrentValues = function() {
    console.log('Current Driving Parameters:');
    console.log('Physics:', {
      gravity: gameState.gravity,
      mass: gameState.mass,
      dragCoefficient: gameState.dragCoefficient,
      rollingResistance: gameState.rollingResistance
    });
    console.log('Suspension:', gameState.suspension);
    console.log('Engine:', {
      enginePower: gameState.enginePower,
      maxTorque: gameState.maxTorque
    });
    console.log('Car Config:', CONFIG.car);
  }
  
  // Log camera position
  window.logCameraPosition = function() {
    const pos = camera.position;
    console.log('=== CAMERA POSITION ===');
    console.log(`Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
    console.log('Copy/paste this into code:');
    console.log(`camera.position.set(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)});`);
    console.log('======================');
  }
  
  // Log sound volumes at startup for debugging
  setTimeout(() => {
    console.log('=== INITIAL SOUND VOLUMES ===');
    logSoundVolumes();
    console.log('Use the dev panel to adjust sound volumes or call logSoundVolumes() to see current values');
    console.log('===========================');
  }, 1000);
  
  // Camera mode constants
  const CAMERA_MODES = {
    STABLE_TRACKING: 0,    // Default - camera follows car smoothly
    FIXED_FOLLOW: 1,       // Camera follows car but from fixed position
    STABLE_NO_TRACKING: 2  // Camera stays at initial position
  };
  
  // Initialize camera mode (replace manualCameraMode)
  window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
  
  // Store initial camera position for STABLE_NO_TRACKING mode
  let initialCameraPosition = null;
  
  // Reset camera to automatic follow mode
  window.resetCamera = function() {
    window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
    window.manualCameraMode = false; // Keep for backward compatibility
    console.log('Camera reset to Stable Tracking mode');
  }
  
  // Log pixelation controls info
  console.log('=== PIXELATION CONTROLS ===');
  console.log('Press P to toggle pixelation');
  console.log('Current settings:');
  console.log(`- Enabled: ${pixelationEnabled}`);
  console.log(`- Scale: ${pixelScale}x`);
  console.log(`- Resolution: ${pixelRenderWidth}x${pixelRenderHeight}`);
  console.log('Use updatePixelScale(n) to change scale (1-8)');
  console.log('Use updatePixelResolution(w,h) for custom resolution');
  console.log('===========================');

  function init() {
    console.log('Initializing Mac 3D game...');
    
    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
      console.error('Three.js not loaded!');
      return;
    }
    
    // Get display canvas
    displayCanvas = document.getElementById('carGameCanvas');
    if (!displayCanvas) {
      console.error('Canvas element not found!');
      return;
    }
    
    // Don't get 2D context on the main canvas - Three.js needs WebGL context
    
    // Create pixel canvas for pixelated rendering
    pixelCanvas = document.createElement('canvas');
    pixelCanvas.width = pixelRenderWidth;
    pixelCanvas.height = pixelRenderHeight;
    pixelCtx = pixelCanvas.getContext('2d');
    pixelCtx.imageSmoothingEnabled = false;
    
    // Three.js setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.gray50); // Grey background to match surface
    
    // Enhanced lighting setup for dramatic shadows
    // Lower ambient light for better shadow contrast
    const ambientLight = new THREE.AmbientLight(CONFIG.colors.white, 0.3);
    scene.add(ambientLight);
    
    // Stronger directional light (sun) for shadows
    directionalLight = new THREE.DirectionalLight(CONFIG.colors.white, 0.7);
    directionalLight.position.set(30, 80, 30);
    directionalLight.castShadow = true;
    
    // Shadow camera setup - adjusted for platform size
    directionalLight.shadow.camera.left = -40;
    directionalLight.shadow.camera.right = 40;
    directionalLight.shadow.camera.top = 40;
    directionalLight.shadow.camera.bottom = -40;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 150;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.001; // Prevent shadow acne
    
    scene.add(directionalLight);
    
    // Add a subtle ground plane to receive shadows
    const shadowPlaneGeometry = new THREE.PlaneGeometry(200, 200);
    const shadowPlaneMaterial = new THREE.MeshLambertMaterial({ 
      color: CONFIG.colors.white,
      emissive: CONFIG.colors.white,
      emissiveIntensity: 0.9 // Mostly white but can receive shadows
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.01; // Just below ground level
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    
    // Orthographic camera - zoomed out 50%
    const aspect = CONFIG.renderWidth / CONFIG.renderHeight;
    const d = 45;  // Zoomed out more to see the full game world
    camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect,
      d, -d,
      0.1, 1000
    );
    
    // Classic isometric angle rotated 30 degrees clockwise (45° - 15° CCW)
    // Rotating 30° clockwise from original (10, 15, 10)
    const angle = Math.PI * 30 / 180;  // 30 degrees in radians
    const originalX = 10;
    const originalZ = 10;
    camera.position.set(
      originalX * Math.cos(angle) + originalZ * Math.sin(angle),  // ≈ 13.66
      15,
      -originalX * Math.sin(angle) + originalZ * Math.cos(angle)  // ≈ 3.66
    );
    camera.lookAt(0, 0, 0);
    
    // Store initial camera state for Stable No Tracking mode
    initialCameraPosition = {
      position: camera.position.clone(),
      lookAt: new THREE.Vector3(0, 0, 0)
    };
    
    // Create control panel after camera is initialized
    createControlPanel();
    
    // Apply default zoom level after camera is fully initialized
    updateCameraZoom(cameraZoom);
    
    // Initialize tooltip scale display
    if (document.getElementById('val-tooltip-scale')) {
      document.getElementById('val-tooltip-scale').textContent = tooltipScale.toFixed(1) + 'x';
    }
    
    // Renderer with shadow support
    renderer = new THREE.WebGLRenderer({ 
      canvas: displayCanvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping; // Preserve monochrome aesthetic
    renderer.toneMappingExposure = 1.0;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    renderer.setClearColor(CONFIG.colors.white, 1); // White background
    
    // Create game objects
    carGroup = createCarModel();
    scene.add(carGroup);
    
    const ground = createGround();
    ground.name = 'ground';
    scene.add(ground);
    
    createObstacles();
    createTerrain();
    
    // Add treasure chest
    const treasureChest = createTreasureChest();
    scene.add(treasureChest);
    
    // Add chainlink fence enclosure
    const fence = createChainlinkFence();
    fence.name = 'fence'; // Name it so we can find it for collision detection
    scene.add(fence);
    
    // Add treadmill to fence
    const treadmill = createTreadmill();
    fence.add(treadmill);
    
    // Add physics gates
    const gates = createGates();
    scene.add(gates);
    
    // Add highway sign
    const highwaySign = createHighwaySign();
    scene.add(highwaySign);
    
    // Add road sign messages
    const roadSigns = createRoadSigns();
    scene.add(roadSigns);
    
    // Add example cinematic trigger (donuts near fence entrance)
    // Commented out - was causing unwanted automatic driving when entering fence area
    /*
    addCinematicTrigger(0, -80, 10, 10, {
      name: "Fence Approach Donuts",
      steps: [
        { time: 0, inputs: { throttle: 1, steer: 0, brake: false } },      // Drive forward
        { time: 1, inputs: { throttle: 0.8, steer: 1, brake: false } },    // Start turning
        { time: 2, inputs: { throttle: 1, steer: 1, handbrake: true } },   // Handbrake turn
        { time: 3, inputs: { throttle: 1, steer: -1, handbrake: false } }, // Counter steer
        { time: 4, inputs: { throttle: 0.5, steer: 0, brake: true } },     // Brake to stop
        { time: 5, inputs: { throttle: 0, steer: 0, brake: false }, duration: 0.5 } // Stop
      ]
    });
    */
    
    // Initialize tire normal forces to approximate static load
    const totalWeight = gameState.mass * gameState.gravity;
    const frontWeight = totalWeight * 0.48; // 48% front weight distribution
    const rearWeight = totalWeight * 0.52;  // 52% rear weight distribution
    gameState.tires.frontLeft.normalForce = frontWeight / 2;
    gameState.tires.frontRight.normalForce = frontWeight / 2;
    gameState.tires.rearLeft.normalForce = rearWeight / 2;
    gameState.tires.rearRight.normalForce = rearWeight / 2;
    
    // Set camera to stable no tracking for intro
    window.cameraMode = CAMERA_MODES.STABLE_NO_TRACKING;
    camera.position.set(0, 10, 15); // Fixed position looking at center
    camera.lookAt(0, 0, 0);
    
    // Initialize intro timing
    introState.startTime = performance.now();
    
    // Initialize sound for intro
    if (!audioCtx) initSound();
    
    // Controls
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      
      // Skip intro on any key press
      if (introState.isPlaying) {
        skipIntro();
        e.preventDefault();
        return;
      }
      
      keys[key] = true;
      
      if (e.key === 'Escape') skipGame();
      
      // Initialize sound on first input
      if (!audioCtx) initSound();
      
      // Horn on H key
      if (key === 'h') playHorn(true);
      
      // Mute toggle on M key
      if (key === 'm') {
        isMuted = !isMuted;
        // Update all active sound volumes using the volume system
        if (engineGain) engineGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.engine * soundVolumes.master, audioCtx.currentTime);
        if (idleGain) idleGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.idle * soundVolumes.master, audioCtx.currentTime);
        if (revGain) revGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.engine * soundVolumes.master, audioCtx.currentTime);
        if (tireScreechGain) tireScreechGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.tires * soundVolumes.master, audioCtx.currentTime);
        if (windNoiseGain) windNoiseGain.gain.setValueAtTime(isMuted ? 0 : soundVolumes.wind * soundVolumes.master, audioCtx.currentTime);
        console.log('Sound', isMuted ? 'muted' : 'unmuted');
      }
      
      // Pixelation toggle on P key
      if (key === 'p') {
        pixelationEnabled = !pixelationEnabled;
        console.log('Pixelation', pixelationEnabled ? 'enabled' : 'disabled');
      }
      
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      keys[key] = false;
      
      // Stop horn when H released
      if (key === 'h') playHorn(false);
    });
    
    // Define resize function
    function resize() {
      if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      if (camera) {
        const aspect = window.innerWidth / window.innerHeight;
        const d = 45;
        camera.left = -d * aspect;
        camera.right = d * aspect;
        camera.top = d;
        camera.bottom = -d;
        camera.updateProjectionMatrix();
      }
      
      // Update pixelation dimensions based on new window size
      if (pixelationEnabled) {
        pixelRenderWidth = Math.floor(window.innerWidth / pixelScale);
        pixelRenderHeight = Math.floor(window.innerHeight / pixelScale);
        
        if (pixelCanvas) {
          pixelCanvas.width = pixelRenderWidth;
          pixelCanvas.height = pixelRenderHeight;
        }
        
        // Update UI if visible
        const resElement = document.getElementById('val-pixelres');
        if (resElement) resElement.textContent = pixelRenderWidth + 'x' + pixelRenderHeight;
        
        const widthInput = document.getElementById('dev-pixelwidth');
        const heightInput = document.getElementById('dev-pixelheight');
        if (widthInput) widthInput.value = pixelRenderWidth;
        if (heightInput) heightInput.value = pixelRenderHeight;
      }
    }
    
    window.addEventListener('resize', resize);
    resize();
    
    document.body.classList.add('game-active');
    
    // Mute button removed - use M key to toggle mute
    
    // Create the tooltips
    createYouTooltip();
    createTreasureTooltip();
    
    // Define update function inside init scope
    function update(deltaTime) {
      // Declare control variables
      let throttle = 0;
      let steerInput = 0;
      let braking = false;
      let handbrake = false;
      let engineRPM = 0;  // Declare engineRPM at top level of function
      
      // Handle intro animation
      if (introState.isPlaying) {
        const currentTime = performance.now();
        const elapsed = (currentTime - introState.startTime) / 1000; // seconds
        
        switch (introState.phase) {
          case 'driving':
            // Self-drive the car from right to center
            throttle = 0.5; // Moderate speed
            gameState.currentGearIndex = 0; // First gear
            
            // Move towards target
            const distToTarget = gameState.x - introState.driveTargetX;
            if (Math.abs(distToTarget) > 0.5) {
              // Keep driving
              gameState.vx = -introState.driveSpeed; // Move left
            } else {
              // Reached target, start stopping
              introState.phase = 'stopping';
            }
            break;
            
          case 'stopping':
            // Apply brakes
            braking = true;
            
            // Check if stopped
            const speed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
            if (speed < 0.1) {
              gameState.vx = 0;
              gameState.vz = 0;
              introState.phase = 'painting';
              introState.paintStartTime = currentTime;
              
              // Create "YOU" spray paint
              createYouSprayPaint();
            }
            break;
            
          case 'painting':
            // Animate the spray paint
            const paintElapsed = (currentTime - introState.paintStartTime) / 1000;
            
            if (paintElapsed < 2.0) {
              // Animate paint opacity
              if (introState.youPaintMesh) {
                const progress = paintElapsed / 2.0;
                introState.youPaintMesh.material.opacity = progress;
              }
            } else {
              // Done with intro
              introState.phase = 'done';
              introState.isPlaying = false;
              
              // Switch to normal camera mode
              window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
            }
            break;
        }
        
        // Skip normal input during intro
      } else {
        // Normal input handling
        if (keys['w'] || keys['arrowup']) {
          throttle = 1;
          // Auto-switch from reverse to 1st gear when pressing W
          if (gameState.currentGearIndex === 4) { // Currently in reverse
            gameState.currentGearIndex = 0; // Switch to 1st gear
            gameState.canEngageReverse = false; // Reset reverse capability
            gameState.stoppedTime = 0; // Reset stopped time
          }
        }
        if (keys['s'] || keys['arrowdown']) braking = true;
        if (keys[' ']) handbrake = true;  // Spacebar for handbrake
        if (keys['a'] || keys['arrowleft']) steerInput = 1;   // A turns left (now positive)
        if (keys['d'] || keys['arrowright']) steerInput = -1;  // D turns right (now negative)
      }
      
      // Rest of update function continues here...
      // Basic physics update to get the game working
      
      // Update car position based on input
      if (throttle > 0) {
        gameState.vx += Math.sin(-gameState.angle) * throttle * 10;
        gameState.vz += Math.cos(-gameState.angle) * throttle * 10;
      }
      if (braking) {
        gameState.vx *= 0.9;
        gameState.vz *= 0.9;
      }
      
      // Apply steering
      if (steerInput !== 0) {
        gameState.angle += steerInput * 0.05;
      }
      
      // Update position
      gameState.x += gameState.vx * deltaTime;
      gameState.z += gameState.vz * deltaTime;
      
      // Implement treadmill boundary system
      const boundaryX = 100; // Maximum distance from center in X direction
      const boundaryZ = 150; // Maximum distance from center in Z direction
      const pushbackStrength = 0.95; // How strongly to push back (0-1)
      
      // Check X boundaries
      if (Math.abs(gameState.x) > boundaryX) {
        // Calculate how far beyond the boundary we are
        const excess = Math.abs(gameState.x) - boundaryX;
        const pushback = excess * pushbackStrength;
        
        // Push back towards center
        if (gameState.x > 0) {
          gameState.x = boundaryX + excess * (1 - pushbackStrength);
          // Also reduce velocity in that direction
          if (gameState.vx > 0) gameState.vx *= 0.5;
        } else {
          gameState.x = -boundaryX - excess * (1 - pushbackStrength);
          if (gameState.vx < 0) gameState.vx *= 0.5;
        }
      }
      
      // Check Z boundaries
      if (Math.abs(gameState.z) > boundaryZ) {
        const excess = Math.abs(gameState.z) - boundaryZ;
        const pushback = excess * pushbackStrength;
        
        if (gameState.z > 0) {
          gameState.z = boundaryZ + excess * (1 - pushbackStrength);
          if (gameState.vz > 0) gameState.vz *= 0.5;
        } else {
          gameState.z = -boundaryZ - excess * (1 - pushbackStrength);
          if (gameState.vz < 0) gameState.vz *= 0.5;
        }
      }
      
      // Apply friction
      gameState.vx *= 0.98;
      gameState.vz *= 0.98;
      
      // Update car model position
      if (carGroup) {
        carGroup.position.x = gameState.x;
        carGroup.position.y = gameState.y;
        carGroup.position.z = gameState.z;
        carGroup.rotation.y = -gameState.angle;
      }
      
      // Update camera
      if (camera) {
        camera.position.set(gameState.x + 10, 10, gameState.z + 10);
        camera.lookAt(gameState.x, 0, gameState.z);
      }
    }
    
    // Start animation loop
    animate();
  }
  
  // Skip intro animation and start normal game
  function skipIntro() {
    introState.isPlaying = false;
    introState.phase = 'done';
    
    // Reset car to normal starting position
    gameState.x = 0;
    gameState.z = 10;
    gameState.vx = 0;
    gameState.vz = 0;
    
    // Switch to normal camera mode
    window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
    
    // Remove YOU paint if it exists
    if (introState.youPaintMesh) {
      scene.remove(introState.youPaintMesh);
      introState.youPaintMesh = null;
    }
  }
  
  // Pixelation control functions
  window.togglePixelation = function(enabled) {
    pixelationEnabled = enabled;
    console.log('Pixelation', enabled ? 'enabled' : 'disabled');
    
    // Clean up pixelation resources if disabling
    if (!enabled) {
      if (window.pixelRenderTarget) {
        window.pixelRenderTarget.dispose();
        window.pixelRenderTarget = null;
      }
      if (window.pixelQuad) {
        window.pixelQuad.geometry.dispose();
        window.pixelQuad.material.dispose();
        window.pixelQuad = null;
      }
      window.pixelScene = null;
      window.pixelCamera = null;
    }
    
    // Update UI if needed
    const checkbox = document.getElementById('dev-pixelation');
    if (checkbox) checkbox.checked = enabled;
  };
  
  window.updatePixelScale = function(scale) {
    pixelScale = parseInt(scale);
    pixelRenderWidth = Math.floor(window.innerWidth / pixelScale);
    pixelRenderHeight = Math.floor(window.innerHeight / pixelScale);
    
    // Update pixel canvas size
    if (pixelCanvas) {
      pixelCanvas.width = pixelRenderWidth;
      pixelCanvas.height = pixelRenderHeight;
    }
    
    // Update UI
    const element = document.getElementById('val-pixelscale');
    if (element) element.textContent = pixelScale + 'x';
    
    const resElement = document.getElementById('val-pixelres');
    if (resElement) resElement.textContent = pixelRenderWidth + 'x' + pixelRenderHeight;
    
    // Update resolution input fields
    const widthInput = document.getElementById('dev-pixelwidth');
    const heightInput = document.getElementById('dev-pixelheight');
    if (widthInput) widthInput.value = pixelRenderWidth;
    if (heightInput) heightInput.value = pixelRenderHeight;
    
    console.log(`Pixel scale: ${pixelScale}x (${pixelRenderWidth}x${pixelRenderHeight})`);
  };
  
  window.updatePixelResolution = function(width, height) {
    pixelRenderWidth = parseInt(width);
    pixelRenderHeight = parseInt(height);
    
    if (pixelCanvas) {
      pixelCanvas.width = pixelRenderWidth;
      pixelCanvas.height = pixelRenderHeight;
    }
    
    // Update UI
    const resElement = document.getElementById('val-pixelres');
    if (resElement) resElement.textContent = pixelRenderWidth + 'x' + pixelRenderHeight;
    
    console.log(`Pixel resolution: ${pixelRenderWidth}x${pixelRenderHeight}`);
  };
  
  // Create the "YOU" spray paint in a semicircle around the car
  function createYouSprayPaint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up graffiti text style
    ctx.font = 'bold 180px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const centerX = canvas.width/2;
    const centerY = canvas.height/2;
    
    // Draw graffiti-style "YOU"
    // Outer glow/overspray (reduced)
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'white';
    ctx.strokeStyle = 'white';
    ctx.strokeText('YOU', centerX, centerY);
    
    // Main stroke
    ctx.shadowBlur = 5;
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'white';
    ctx.strokeText('YOU', centerX, centerY);
    
    // Fill
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    ctx.fillText('YOU', centerX, centerY);
    
    // Add some drips
    const numDrips = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numDrips; i++) {
      const dripX = centerX - 200 + Math.random() * 400;
      const dripStartY = centerY + 60;
      const dripLength = 20 + Math.random() * 40;
      const dripWidth = 3 + Math.random() * 5;
      
      ctx.beginPath();
      ctx.moveTo(dripX, dripStartY);
      ctx.lineTo(dripX - dripWidth/4, dripStartY + dripLength);
      ctx.lineTo(dripX + dripWidth/4, dripStartY + dripLength);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();
    }
    
    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    // Create curved geometry for semicircle
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8, 0.02, 5),
      new THREE.Vector3(0, 0.02, 8),
      new THREE.Vector3(8, 0.02, 5)
    ]);
    
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Create plane for the text
    const signGeometry = new THREE.PlaneGeometry(20, 5);
    const signMaterial = new THREE.MeshBasicMaterial({ 
      map: texture,
      transparent: true,
      opacity: 0, // Start invisible for animation
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.rotation.x = -Math.PI/2; // Lay flat on ground
    sign.position.set(gameState.x, 0.02, gameState.z - 5); // Behind the car
    
    scene.add(sign);
    introState.youPaintMesh = sign;
  }

  // Check ground contact for each tire and update ground height
  function updateGroundContact() {
    const ground = scene.getObjectByName('ground');
    const groundLevel = 0;
    
    // Get ground boundaries from the ground object
    let groundMinX = -150;  // Default values
    let groundMaxX = 150;
    let groundMinZ = -300;
    let groundMaxZ = 300;
    
    if (ground && ground.bounds) {
      groundMinX = ground.bounds.minX;
      groundMaxX = ground.bounds.maxX;
      groundMinZ = ground.bounds.minZ;
      groundMaxZ = ground.bounds.maxZ;
    }
    
    // Raycaster for terrain detection
    const raycaster = new THREE.Raycaster();
    const downVector = new THREE.Vector3(0, -1, 0);
    
    // Check each tire individually
    Object.entries(gameState.tires).forEach(([tireName, tire]) => {
      const tireX = tire.x;
      const tireZ = tire.z;
      
      // Check if tire is on the ground
      const onGround = tireX >= groundMinX && tireX <= groundMaxX && 
                      tireZ >= groundMinZ && tireZ <= groundMaxZ;
      
      if (onGround) {
        // Set up raycast from tire position
        const rayOrigin = new THREE.Vector3(tireX, 10, tireZ); // Start from above
        raycaster.set(rayOrigin, downVector);
        
        // Check for terrain intersections
        const terrainIntersects = raycaster.intersectObjects(terrainElements, false);
        let highestTerrainY = groundLevel;
        let currentSurface = 'asphalt';
        
        if (terrainIntersects.length > 0) {
          // Find the highest terrain element
          terrainIntersects.forEach(intersect => {
            const terrainY = intersect.point.y;
            if (terrainY > highestTerrainY) {
              highestTerrainY = terrainY;
              
              // Check if it's a surface patch
              if (intersect.object.userData.type === 'surface') {
                currentSurface = intersect.object.userData.surfaceType;
              }
            }
          });
        }
        
        // Check for surface patches at ground level
        terrainElements.forEach(element => {
          if (element.userData.type === 'surface') {
            const bounds = element.userData.bounds;
            if (tireX >= bounds.minX && tireX <= bounds.maxX &&
                tireZ >= bounds.minZ && tireZ <= bounds.maxZ) {
              currentSurface = element.userData.surfaceType;
            }
          }
        });
        
        tire.onGround = true;
        tire.groundHeight = highestTerrainY;
        tire.currentSurface = currentSurface;
      } else {
        // Tire is over the chasm - no ground support
        tire.onGround = false;
        tire.currentSurface = 'air';
        tire.groundHeight = -100; // Far below for falling calculation
      }
    });
  }
  
  // Apply gravity and calculate car orientation based on tire ground contact
  function updateGravityAndOrientation(deltaTime) {
    updateGroundContact();
    
    // Count tires on ground
    const tiresOnGround = Object.values(gameState.tires).filter(tire => tire.onGround).length;
    const frontTiresOnGround = gameState.tires.frontLeft.onGround + gameState.tires.frontRight.onGround;
    const rearTiresOnGround = gameState.tires.rearLeft.onGround + gameState.tires.rearRight.onGround;
    
    if (tiresOnGround === 0) {
      // Car is completely airborne - apply full gravity
      gameState.vy -= gameState.gravity * deltaTime;
      gameState.y += gameState.vy * deltaTime;
      
      // Apply angular momentum from driving off edge
      if (Math.abs(gameState.wheelSpeed) > 1) {
        const forwardSpeed = Math.abs(gameState.wheelSpeed);
        gameState.pitchVelocity += (forwardSpeed * 0.5) * deltaTime; // Pitch forward when driving off
      }
      
      gameState.pitch += gameState.pitchVelocity * deltaTime;
      gameState.falling = true;
      
    } else if (tiresOnGround < 4) {
      // Partial ground contact - create realistic tilting
      if (frontTiresOnGround === 0 && rearTiresOnGround > 0) {
        // Front wheels off ground - nose dips down
        gameState.pitchVelocity += 2.0 * deltaTime; // Faster pitch when front is unsupported
        gameState.pitch += gameState.pitchVelocity * deltaTime;
      } else if (rearTiresOnGround === 0 && frontTiresOnGround > 0) {
        // Rear wheels off ground - tail dips down, nose up
        gameState.pitchVelocity -= 2.0 * deltaTime;
        gameState.pitch += gameState.pitchVelocity * deltaTime;
      }
      
      // Apply reduced gravity when partially supported
      gameState.vy -= gameState.gravity * 0.5 * deltaTime;
      gameState.y += gameState.vy * deltaTime;
      
    } else {
      // All tires on ground - stable, maintain proper ride height
      const wheelRadius = gameState.wheelDiameter / 2; // 0.2
      
      // Calculate average ground height and compression
      let avgGroundHeight = 0;
      let avgCompression = 0;
      let tiresOnGround = 0;
      
      Object.values(gameState.tires).forEach(tire => {
        if (tire.onGround) {
          avgGroundHeight += tire.groundHeight;
          avgCompression += tire.springCompression;
          tiresOnGround++;
        }
      });
      
      if (tiresOnGround > 0) {
        avgGroundHeight /= tiresOnGround;
        avgCompression /= tiresOnGround;
      }
      
      // Car positioning logic:
      // 1. Wheels must touch the ground (wheel bottom at groundHeight)
      // 2. Wheel centers are at wheelRadius above ground when uncompressed
      // 3. With compression, wheels sink down but bottom stays at groundHeight
      // 4. Car body sits above the wheels with rideHeightOffset gap
      
      const carBodyHeight = CONFIG.car.size.height / 2;
      
      // When compressed, the wheel center stays at wheelRadius height
      // but the car body moves down by the compression amount
      // This ensures wheel bottoms stay at ground level
      
      // Car body center = ground height + wheel radius + ride height offset + car body height - avg compression
      const carHeight = avgGroundHeight + wheelRadius + gameState.rideHeightOffset + carBodyHeight - avgCompression;
      
      gameState.y = carHeight;
      gameState.vy = 0;
      
      // Calculate pitch based on front/rear height difference
      const frontAvgHeight = (gameState.tires.frontLeft.groundHeight + gameState.tires.frontRight.groundHeight) / 2;
      const rearAvgHeight = (gameState.tires.rearLeft.groundHeight + gameState.tires.rearRight.groundHeight) / 2;
      const heightDiff = frontAvgHeight - rearAvgHeight;
      const targetPitch = Math.atan2(heightDiff, gameState.wheelbase);
      
      // Smoothly adjust pitch
      gameState.pitch = gameState.pitch * 0.8 + targetPitch * 0.2;
      gameState.pitch = Math.max(-0.3, Math.min(0.3, gameState.pitch)); // Limit pitch on ground
      gameState.pitchVelocity *= 0.9; // Damping
      gameState.falling = false;
    }
    
    // Apply pitch limits to prevent over-rotation
    gameState.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, gameState.pitch));
  }

  function update(deltaTime) {
    // Declare control variables
    let throttle = 0;
    let steerInput = 0;
    let braking = false;
    let handbrake = false;
    let engineRPM = 0;  // Declare engineRPM at top level of function
    
    // Handle intro animation
    if (introState.isPlaying) {
      const currentTime = performance.now();
      const elapsed = (currentTime - introState.startTime) / 1000; // seconds
      
      switch (introState.phase) {
        case 'driving':
          // Self-drive the car from right to center
          throttle = 0.5; // Moderate speed
          gameState.currentGearIndex = 0; // First gear
          
          // Move towards target
          const distToTarget = gameState.x - introState.driveTargetX;
          if (Math.abs(distToTarget) > 0.5) {
            // Keep driving
            gameState.vx = -introState.driveSpeed; // Move left
          } else {
            // Reached target, start stopping
            introState.phase = 'stopping';
          }
          break;
          
        case 'stopping':
          // Apply brakes
          braking = true;
          
          // Check if stopped
          const speed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
          if (speed < 0.1) {
            gameState.vx = 0;
            gameState.vz = 0;
            introState.phase = 'painting';
            introState.paintStartTime = currentTime;
            
            // Create "YOU" spray paint
            createYouSprayPaint();
          }
          break;
          
        case 'painting':
          // Animate the spray paint
          const paintElapsed = (currentTime - introState.paintStartTime) / 1000;
          
          if (paintElapsed < 2.0) {
            // Animate paint opacity
            if (introState.youPaintMesh) {
              const progress = paintElapsed / 2.0;
              introState.youPaintMesh.material.opacity = progress;
            }
          } else {
            // Done with intro
            introState.phase = 'done';
            introState.isPlaying = false;
            
            // Switch to normal camera mode
            window.cameraMode = CAMERA_MODES.STABLE_TRACKING;
          }
          break;
      }
      
      // Skip normal input during intro
    } else {
      // Normal input handling (only when not in cinematic)
      if (!gameState.cinematicActive) {
        if (keys['w'] || keys['arrowup']) {
          throttle = 1;
          // Auto-switch from reverse to 1st gear when pressing W
          if (gameState.currentGearIndex === 4) { // Currently in reverse
            gameState.currentGearIndex = 0; // Switch to 1st gear
            gameState.canEngageReverse = false; // Reset reverse capability
            gameState.stoppedTime = 0; // Reset stopped time
          }
        }
        if (keys['s'] || keys['arrowdown']) braking = true;
        if (keys[' ']) handbrake = true;  // Spacebar for handbrake
        if (keys['a'] || keys['arrowleft']) steerInput = 1;   // A turns left (now positive)
        if (keys['d'] || keys['arrowright']) steerInput = -1;  // D turns right (now negative)
      }
    }
    
    // Handle cinematic sequences
    if (gameState.cinematicActive && gameState.cinematicSequence) {
      const sequence = gameState.cinematicSequence;
      const elapsed = performance.now() / 1000 - sequence.startTime;
      
      // Find current step based on time
      let currentInputs = null;
      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        if (elapsed >= step.time) {
          currentInputs = step.inputs;
          sequence.currentStep = i;
        }
      }
      
      // Apply cinematic inputs
      if (currentInputs) {
        throttle = currentInputs.throttle || 0;
        braking = currentInputs.brake || false;
        handbrake = currentInputs.handbrake || false;
        steerInput = currentInputs.steer || 0;
        
        // Handle gear changes
        if (currentInputs.gear !== undefined) {
          gameState.currentGearIndex = currentInputs.gear;
        }
      }
      
      // Check if sequence is complete
      const lastStep = sequence.steps[sequence.steps.length - 1];
      if (elapsed > lastStep.time + (lastStep.duration || 0)) {
        endCinematicSequence();
      }
    }
    
    // Front wheel steering (max 45 degrees)
    const maxSteerAngle = Math.PI / 4; // 45 degrees
    const steerSpeed = 3.5; // Increased from 2 for more responsive steering
    
    // Initialize hasGroundContact early to avoid reference errors
    let hasGroundContact = true; // Will be properly calculated below
    
    // Check ground contact for steering (will be recalculated later after gravity update)
    const tiresOnGroundForSteering = Object.values(gameState.tires).filter(tire => tire.onGround).length;
    const hasGroundContactForSteering = tiresOnGroundForSteering > 0;
    
    // Steering only works when tires are in contact with ground
    if (hasGroundContactForSteering) {
      // Direct steering input - no speed reduction
      const targetAngle = steerInput * maxSteerAngle;
      const angleDiff = targetAngle - gameState.wheelAngle;
      
      // Apply steering change
      gameState.wheelAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), steerSpeed * deltaTime);
      
      // Return wheels to center when not steering
      if (steerInput === 0) {
        const returnSpeed = 4.0; // Fast return to center
        if (Math.abs(gameState.wheelAngle) > 0.01) {
          gameState.wheelAngle -= Math.sign(gameState.wheelAngle) * Math.min(Math.abs(gameState.wheelAngle), returnSpeed * deltaTime);
        } else {
          gameState.wheelAngle = 0;
        }
      }
    }
    // When airborne, wheels maintain their last angle (no new steering input)
    
    // Calculate wheel radius and current velocity
    const wheelRadius = gameState.wheelDiameter / 2;  // 0.3m radius
    
    // Calculate current speed for traction effects
    const currentLinearSpeed = Math.abs(gameState.wheelSpeed * wheelRadius);
    const baseAccelerationTraction = 1 - Math.min(currentLinearSpeed / 200, 0.3); // Only lose up to 30% traction at very high speeds
    
    // Braking traction is INVERSE - best at low speeds, worst at high speeds
    const baseBrakingTraction = 1 - Math.min(currentLinearSpeed / 100, 0.8); // Only 20% braking effectiveness at high speed
    
    // Average tire grip affects overall traction
    const avgTireGrip = (gameState.tires.frontLeft.grip + gameState.tires.frontRight.grip + 
                        gameState.tires.rearLeft.grip + gameState.tires.rearRight.grip) / 4;
    
    const accelerationTraction = baseAccelerationTraction * avgTireGrip * 0.7; // Some traction loss but drivable
    const brakingTraction = baseBrakingTraction * avgTireGrip;
    const wheelRPM = Math.abs(gameState.wheelSpeed) * 60 / (2 * Math.PI);  // Convert rad/s to RPM
    // Use actual vehicle velocity, not wheel speed
    const velocity = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz) * 
                    (gameState.wheelSpeed >= 0 ? 1 : -1);  // m/s
    const speed = Math.abs(velocity);
    
    // REVERSE GEAR LOGIC - completely reimplemented
    // Track stopped time for reverse engagement
    if (Math.abs(speed) < 0.1) {
      gameState.stoppedTime += deltaTime;
      if (gameState.stoppedTime >= gameState.reverseEngageDelay) {
        gameState.canEngageReverse = true;
      }
    } else {
      gameState.stoppedTime = 0;
      if (gameState.wheelSpeed > 0.1) {
        // Moving forward - disable reverse
        gameState.canEngageReverse = false;
      }
    }
    
    // Determine current gear
    let currentGearIndex = gameState.currentGearIndex || 0;  // Use stored gear
    let isInReverse = false;
    
    // Reverse gear: Only when stopped, delay passed, and holding brake
    if (braking && gameState.canEngageReverse && Math.abs(gameState.wheelSpeed) < 0.1) {
      currentGearIndex = 4; // Reverse gear
      isInReverse = true;
    } else if (gameState.wheelSpeed < -0.1) {
      // Already moving backward - stay in reverse if still braking
      if (braking) {
        currentGearIndex = 4;
        isInReverse = true;
      } else {
        // Not braking while moving backward - neutral (coast)
        currentGearIndex = 0; // Neutral/1st gear
      }
    } else {
      // Forward gears based on forward speed - adjusted for heavy vehicle
      const forwardSpeed = Math.max(0, speed);
      if (forwardSpeed < 3) {
        currentGearIndex = 0; // 1st gear: 0-7 mph
      } else if (forwardSpeed < 7) {
        currentGearIndex = 1; // 2nd gear: 7-16 mph
      } else if (forwardSpeed < 12) {
        currentGearIndex = 2; // 3rd gear: 16-27 mph
      } else {
        currentGearIndex = 3; // 4th gear: 27+ mph
      }
    }
    
    // Update gameState gear index
    gameState.currentGearIndex = currentGearIndex;
    
    // Detect gear changes and play sound (with debouncing)
    const currentGear = currentGearIndex === 4 ? 'R' : (currentGearIndex + 1);
    const currentTime = performance.now() / 1000; // Convert to seconds
    
    if (currentGear !== gameState.lastGear && (currentTime - gameState.lastGearChangeTime) > 0.1) {
      // Check if this is a R↔1 transition
      const isReverseTransition = 
        (gameState.lastGear === 'R' && currentGear === 1) || 
        (gameState.lastGear === 1 && currentGear === 'R');
      
      playGearChangeSound(isReverseTransition);
      gameState.lastGear = currentGear;
      gameState.lastGearChangeTime = currentTime;
    }
    
    
    const currentGearRatio = gameState.gearRatios[currentGearIndex];
    const totalGearRatio = currentGearRatio * gameState.finalDriveRatio;
    
    // Calculate engine RPM from wheel RPM
    const actualEngineRPM = wheelRPM * Math.abs(totalGearRatio);  // RPM from actual wheel speed
    
    // For display purposes, show some idle RPM when stopped
    if (throttle > 0 && speed < 0.5 && actualEngineRPM < 800) {
      engineRPM = 800 + throttle * 2000; // Show some revs on tachometer
    } else {
      engineRPM = actualEngineRPM;
    }
    
    // Initial ground contact check (will be recalculated after updating tire positions)
    let tiresOnGround = Object.values(gameState.tires).filter(tire => tire.onGround).length;
    hasGroundContact = tiresOnGround > 0;
    
    // Update tire world positions FIRST before checking ground contact
    // Use dynamic wheelbase for tire positions
    const halfWheelbase = gameState.wheelbase / 2;
    const tireOffsets = {
      frontLeft: { x: -0.5, z: halfWheelbase },
      frontRight: { x: 0.5, z: halfWheelbase },
      rearLeft: { x: -0.5, z: -halfWheelbase },
      rearRight: { x: 0.5, z: -halfWheelbase }
    };
    
    Object.entries(gameState.tires).forEach(([tireName, tire]) => {
      const offset = tireOffsets[tireName];
      // Rotate tire position based on car angle
      tire.x = gameState.x + offset.x * Math.cos(-gameState.angle) - offset.z * Math.sin(-gameState.angle);
      tire.z = gameState.z + offset.x * Math.sin(-gameState.angle) + offset.z * Math.cos(-gameState.angle);
    });
    
    // Update gravity and car orientation based on tire ground contact
    updateGravityAndOrientation(deltaTime);
    
    // Recalculate ground contact after gravity update
    tiresOnGround = Object.values(gameState.tires).filter(tire => tire.onGround).length;
    hasGroundContact = tiresOnGround > 0;
    
    
    // Remove duplicate force calculations - these are now handled in the main physics section below
    
    // === SIMPLE PHYSICS SYSTEM ===
    // Clean physics implementation with individual wheel forces
    
    if (hasGroundContact) {
      // 1. ENGINE FORCE (Rear wheel drive)
      let engineForce = 0;
      
      // Disable engine force completely when handbrake is engaged
      if (handbrake) {
        engineForce = 0; // No power to wheels with handbrake
      } else if (isInReverse && braking) {
        // Reverse gear: S key drives backward
        engineForce = -gameState.maxTorque * 0.5 / wheelRadius; // 50% torque in reverse
      } else if (!isInReverse && throttle > 0) {
        // Forward: W key drives forward
        const torque = gameState.maxTorque * throttle;
        engineForce = torque / wheelRadius;
        
        // Power limit at high speeds
        if (speed > 5) {
          const maxPowerForce = gameState.enginePower / speed;
          engineForce = Math.min(engineForce, maxPowerForce);
        }
      }
      
      // 2. BRAKE FORCE
      let brakeForce = 0;
      if (handbrake) {
        // Handbrake: Strong but realistic - struggles at high speed
        const baseHandbrakeForce = 8000; // Base handbrake force
        
        // Effectiveness decreases with speed (harder to stop at high speed)
        const speedFactor = Math.max(0.3, 1.0 - Math.abs(velocity) / 30); // 30% effective at 30 m/s
        brakeForce = -baseHandbrakeForce * speedFactor * Math.sign(velocity);
        
        // Lock front wheels
        gameState.frontWheelSpeed = 0;
        
        // Only apply extreme force when nearly stopped to prevent oscillation
        if (Math.abs(velocity) < 0.5) {
          brakeForce = -50000 * Math.sign(velocity); // Strong force to fully stop
        }
      } else if (braking && !isInReverse) {
        // Regular brake: All wheels - MUCH stronger for better stopping
        brakeForce = -24000 * Math.sign(velocity);  // Doubled from 12000
      }
      
      // 3. RESISTANCE FORCES
      // Air drag: F = 0.5 * ρ * Cd * A * v²
      const dragForce = -0.5 * 1.225 * gameState.dragCoefficient * gameState.frontalArea * velocity * Math.abs(velocity);
      // Rolling resistance: F = Crr * Weight (always opposes motion)
      const rollingForce = Math.abs(velocity) > 0.01 ? -gameState.rollingResistance * gameState.mass * gameState.gravity * Math.sign(velocity) : 0;
      
      // 4. TOTAL LONGITUDINAL FORCE
      const totalForce = engineForce + brakeForce + dragForce + rollingForce;
      
      // 5. ACCELERATION (F = ma)
      const acceleration = totalForce / gameState.mass;
      
      // 6. UPDATE VELOCITY
      // Store the current velocity magnitude in any direction
      const currentVelocity = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
      
      // Calculate current forward/backward speed relative to car's facing
      // Note: In Three.js, rotation.y = -angle, so we need to account for this
      const forwardX = Math.sin(-gameState.angle);
      const forwardZ = Math.cos(-gameState.angle);
      const currentForwardSpeed = gameState.vx * forwardX + gameState.vz * forwardZ;
      
      // Apply acceleration to forward speed
      let newForwardSpeed = currentForwardSpeed + acceleration * deltaTime;
      
      // Prevent tiny oscillations when handbrake is engaged and nearly stopped
      if (handbrake && Math.abs(newForwardSpeed) < 0.1) {
        newForwardSpeed = 0;
        gameState.vx = 0;
        gameState.vz = 0;
        gameState.wheelSpeed = 0;
        gameState.frontWheelSpeed = 0;
      }
      
      // 7. PROPER CAR STEERING (Bicycle Model with realistic physics)
      if (Math.abs(gameState.wheelAngle) > 0.001 && Math.abs(newForwardSpeed) > 0.01) {
        // Calculate turning radius using Ackermann steering
        const steerAngle = gameState.wheelAngle;
        const wheelbase = gameState.wheelbase;
        
        // Turning radius = wheelbase / tan(steer angle)
        const turningRadius = wheelbase / Math.tan(Math.abs(steerAngle));
        
        // Angular velocity = linear velocity / turning radius
        const targetAngularVelocity = -newForwardSpeed / turningRadius * Math.sign(steerAngle);
        
        // Apply some inertia to make steering feel more natural
        const steerResponse = 3.0; // How quickly steering responds
        gameState.angularVelocity += (targetAngularVelocity - gameState.angularVelocity) * steerResponse * deltaTime;
      } else {
        // No steering input or stopped - gradually stop rotating
        gameState.angularVelocity *= 0.9;
        if (Math.abs(gameState.angularVelocity) < 0.01) {
          gameState.angularVelocity = 0;
        }
      }
      
      // Update car angle FIRST
      gameState.angle += gameState.angularVelocity * deltaTime;
      
      // NOW set velocity to always point in the car's forward direction
      // This ensures thrust is always applied where the car is facing
      const updatedForwardX = Math.sin(-gameState.angle);
      const updatedForwardZ = Math.cos(-gameState.angle);
      
      // Apply the forward speed in the car's current direction
      gameState.vx = updatedForwardX * newForwardSpeed;
      gameState.vz = updatedForwardZ * newForwardSpeed;
      
      // Add lateral slip for more realistic handling
      if (Math.abs(gameState.angularVelocity) > 0.1 && currentVelocity > 1) {
        // Calculate lateral direction (perpendicular to forward)
        const lateralX = updatedForwardZ;
        const lateralZ = -updatedForwardX;
        
        // Add some lateral velocity based on turn rate (simulates sliding)
        const slipFactor = 0.1; // How much the car slides sideways
        const lateralSlip = gameState.angularVelocity * currentVelocity * slipFactor;
        
        gameState.vx += lateralX * lateralSlip * deltaTime;
        gameState.vz += lateralZ * lateralSlip * deltaTime;
      }
      
      // 8. UPDATE WHEEL SPEEDS
      // Rear wheels (driven)
      gameState.wheelSpeed = newForwardSpeed / wheelRadius;
      
      // Front wheels match car speed unless handbrake
      if (!handbrake) {
        gameState.frontWheelSpeed = gameState.wheelSpeed;
      }
      
      // 9. SIMPLE SUSPENSION UPDATE
      updateSuspension(acceleration, deltaTime);
      
      // Store values for other systems
      gameState.desiredWheelTorque = engineForce * wheelRadius;
      gameState.desiredBrakeForce = brakeForce;
    }
    
    // Use the already calculated velocity for consistency
    const linearSpeed = velocity;
    
    // Update position based on velocity (works with both old and new physics)
    gameState.x += gameState.vx * deltaTime;
    gameState.z += gameState.vz * deltaTime;
    // Angle already updated above, don't update twice
    
    // Clamp angular velocity to prevent crazy spinning
    const maxAngularVel = 5.0; // rad/s
    gameState.angularVelocity = Math.max(-maxAngularVel, Math.min(maxAngularVel, gameState.angularVelocity));
    
    // Apply lateral friction when no ground contact (airborne)
    if (!hasGroundContact) {
      // Only gravity affects the car when airborne
      gameState.vx *= 0.999; // Very slight air resistance
      gameState.vz *= 0.999;
      gameState.angularVelocity *= 0.98; // Rotational damping in air
    } else {
      // Ground friction for lateral sliding
      const forwardX = Math.sin(-gameState.angle);
      const forwardZ = Math.cos(-gameState.angle);
      const lateralX = forwardZ;
      const lateralZ = -forwardX;
      
      // Decompose velocity into forward and lateral components
      const forwardSpeed = gameState.vx * forwardX + gameState.vz * forwardZ;
      const lateralSpeed = gameState.vx * lateralX + gameState.vz * lateralZ;
      
      // Apply stronger friction to lateral movement (tire grip)
      const lateralFriction = 0.3; // 70% reduction per frame - much more grip
      const reducedLateralSpeed = lateralSpeed * lateralFriction;
      
      // Reconstruct velocity
      gameState.vx = forwardX * forwardSpeed + lateralX * reducedLateralSpeed;
      gameState.vz = forwardZ * forwardSpeed + lateralZ * reducedLateralSpeed;
      
      // Stop completely when very slow and no input
      const currentSpeed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
      if (currentSpeed < 0.5 && throttle === 0 && !braking && !handbrake) {
        // Apply strong damping when nearly stopped
        gameState.vx *= 0.8;
        gameState.vz *= 0.8;
        
        // Full stop if really slow
        if (currentSpeed < 0.1) {
          gameState.vx = 0;
          gameState.vz = 0;
          gameState.wheelSpeed = 0;
          gameState.frontWheelSpeed = 0;
        }
        
        // Also stop rotation
        if (Math.abs(gameState.angularVelocity) < 0.05) {
          gameState.angularVelocity = 0;
        }
      }
    }
    
    // Apply angular damping for stability
    gameState.angularVelocity *= 0.95;
    
    // Tire world positions are already updated at the beginning of the update function
    
    // Update car model
    carGroup.position.x = gameState.x;
    carGroup.position.y = gameState.y;
    carGroup.position.z = gameState.z;
    carGroup.rotation.y = -gameState.angle;
    carGroup.rotation.x = gameState.pitch; // Pitch rotation for tumbling
    carGroup.rotation.z = gameState.roll;  // Roll rotation for side tilting
    
    // Update individual wheel positions based on suspension compression
    if (carGroup.wheels) {
      // Each wheel moves independently based on its suspension
      const wheelRadius = gameState.wheelDiameter / 2;
      
      // Car body bottom is at -CONFIG.car.size.height/2 relative to car center
      const carBodyBottom = -CONFIG.car.size.height / 2;
      
      // Wheel positioning: wheel centers should be at wheelRadius above ground
      // When compressed, the wheel stays at the same position but the car moves down
      // This is because in real life, the wheel doesn't sink into the ground
      
      // Each wheel center is positioned at wheelRadius above ground (y=0)
      // The position is relative to the car body, so we need to account for car position
      const carY = gameState.y;
      
      // Wheel positioning:
      // Within the car group, the body bottom is at y=0
      // Wheels attach at rideHeightOffset below the body bottom
      // But we need to account for where the car is positioned in world space
      
      // The car is positioned so wheels touch ground with average compression
      // So wheel world Y should be at wheelRadius (0.2)
      // Convert this to car-relative position
      
      const wheelWorldY = wheelRadius; // Where wheel centers should be in world space
      const wheelLocalY = wheelWorldY - gameState.y; // Convert to car-relative
      
      carGroup.wheels.frontLeft.position.y = wheelLocalY;
      carGroup.wheels.frontRight.position.y = wheelLocalY;
      carGroup.wheels.rearLeft.position.y = wheelLocalY;
      carGroup.wheels.rearRight.position.y = wheelLocalY;
      
      // Wheel deformation based on load (simulated by scaling)
      // More load = more deformation = flatter tire
      Object.entries(carGroup.wheels).forEach(([wheelName, wheelGroup]) => {
        const tireName = wheelName.replace('wheel', 'tire');
        const tire = gameState.tires[tireName] || gameState.tires[wheelName];
        if (tire && tire.normalForce) {
          // Calculate deformation based on normal force
          const nominalLoad = (gameState.mass * gameState.gravity) / 4;
          const loadFactor = Math.min(tire.normalForce / nominalLoad, 2.0); // Cap at 2x nominal
          
          // Realistic tire deformation - creates visible contact patch
          // loadFactor: 1.0 = normal load, >1.0 = compressed
          const deformationAmount = Math.max(0, loadFactor - 0.8) * 0.3; // More aggressive deformation
          const wheelMesh = wheelGroup.children[0]; // The actual wheel mesh
          if (wheelMesh) {
            // Flatten tire vertically (more visible squish)
            const squishFactor = 1.0 - deformationAmount;
            wheelMesh.scale.y = Math.max(squishFactor, 0.7); // Can squish down to 70%
            
            // Bulge sides out more noticeably
            const bulgeFactor = 1.0 + deformationAmount * 0.8;
            wheelMesh.scale.x = Math.min(bulgeFactor, 1.15); // Up to 15% wider
            wheelMesh.scale.z = Math.min(bulgeFactor, 1.15); // Up to 15% wider
            
            // DON'T move the mesh position - let it deform from center
            wheelMesh.position.y = 0;
          }
        }
      });
      
      // Calculate body tilt based on suspension differences
      const leftCompression = (gameState.tires.frontLeft.springCompression + gameState.tires.rearLeft.springCompression) / 2;
      const rightCompression = (gameState.tires.frontRight.springCompression + gameState.tires.rearRight.springCompression) / 2;
      const frontCompression = (gameState.tires.frontLeft.springCompression + gameState.tires.frontRight.springCompression) / 2;
      const rearCompression = (gameState.tires.rearLeft.springCompression + gameState.tires.rearRight.springCompression) / 2;
      
      // Apply REDUCED body roll based on suspension
      gameState.roll = (leftCompression - rightCompression) * 1.2; // Reduced from 3.0 for stability
      
      // Add to existing pitch (don't override tumbling pitch)
      // During braking: front compresses more, so we want nose to dip down (negative pitch)
      const suspensionPitch = (frontCompression - rearCompression) * 1.0; // Swapped order for correct physics
      carGroup.rotation.x = gameState.pitch + suspensionPitch;
      
      // Apply the enhanced roll
      carGroup.rotation.z = gameState.roll;
    }
    
    // Update wheel steering angles
    if (carGroup.wheels) {
      // Steering rotates wheels around vertical (Y) axis
      // This makes the wheels pivot left/right
      // We need to set the Y rotation while preserving X rotation
      carGroup.wheels.frontLeft.rotation.order = 'YXZ';
      carGroup.wheels.frontRight.rotation.order = 'YXZ';
      // Negative to match visual direction with steering input
      carGroup.wheels.frontLeft.rotation.y = gameState.wheelAngle;
      carGroup.wheels.frontRight.rotation.y = gameState.wheelAngle;
    }
    
    // Update brake lights
    if (carGroup.brakeLights) {
      const speed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
      
      // Brake lights on if:
      // - Braking in forward gears (not in reverse where S is throttle)
      // - Handbrake engaged
      // - Speed is 0
      const shouldShowBrakeLights = (braking && !isInReverse) || handbrake || speed < 0.1;
      const brakeLightColor = shouldShowBrakeLights ? CONFIG.colors.white : 0x333333; // Dark grey when off
      
      carGroup.brakeLights.left.material.color.setHex(brakeLightColor);
      carGroup.brakeLights.right.material.color.setHex(brakeLightColor);
    }
    
    // Update reverse lights
    if (carGroup.reverseLights) {
      // Reverse lights on when in reverse gear
      const reverseLightColor = isInReverse ? CONFIG.colors.white : 0x333333; // Dark grey when off
      
      carGroup.reverseLights.left.material.color.setHex(reverseLightColor);
      carGroup.reverseLights.right.material.color.setHex(reverseLightColor);
    }
    
    // Calculate individual tire positions
    const cos = Math.cos(gameState.angle);
    const sin = Math.sin(gameState.angle);
    
    // Tire offsets relative to car center
    const frontOffset = 0.7;
    const rearOffset = -0.7;
    const sideOffset = 0.5;
    
    // Update tire positions
    gameState.tires.frontLeft.x = gameState.x + cos * sideOffset - sin * frontOffset;
    gameState.tires.frontLeft.z = gameState.z + sin * sideOffset + cos * frontOffset;
    
    gameState.tires.frontRight.x = gameState.x - cos * sideOffset - sin * frontOffset;
    gameState.tires.frontRight.z = gameState.z - sin * sideOffset + cos * frontOffset;
    
    gameState.tires.rearLeft.x = gameState.x + cos * sideOffset - sin * rearOffset;
    gameState.tires.rearLeft.z = gameState.z + sin * sideOffset + cos * rearOffset;
    
    gameState.tires.rearRight.x = gameState.x - cos * sideOffset - sin * rearOffset;
    gameState.tires.rearRight.z = gameState.z - sin * sideOffset + cos * rearOffset;
    
    // Linear speed is already calculated above from velocity
    
    // Check for various skid conditions (only when tires touch ground)
    if (hasGroundContact) {
      
      if (throttle > 0 && accelerationTraction < 0.2) {
        // Wheel spin only during very aggressive acceleration with poor traction
        gameState.tires.rearLeft.skidding = true;
        gameState.tires.rearRight.skidding = true;
      } else if (braking && Math.abs(linearSpeed) > 20 && brakingTraction < 0.5) {
        // Brake lockup more likely at high speeds due to poor traction (scaled up 10x)
        gameState.tires.frontLeft.skidding = true;
        gameState.tires.frontRight.skidding = true;
        // Rear tires skid less during braking
        gameState.tires.rearLeft.skidding = Math.abs(linearSpeed) > 50;
        gameState.tires.rearRight.skidding = Math.abs(linearSpeed) > 50;
      } else if (handbrake && Math.abs(linearSpeed) > 5) {
        // Handbrake locks front wheels completely - they always skid
        gameState.tires.frontLeft.skidding = true;
        gameState.tires.frontRight.skidding = true;
        // Rear wheels only skid if car is sliding significantly
        const rearSliding = Math.abs(gameState.wheelSpeed * wheelRadius - linearSpeed) > 2;
        gameState.tires.rearLeft.skidding = rearSliding;
        gameState.tires.rearRight.skidding = rearSliding;
      }
      
      // Create skid marks for each tire (only when on ground)
      if (frame % 2 === 0) {  // Every other frame for performance
        Object.entries(gameState.tires).forEach(([tireName, tire]) => {
          if (tire.onGround) {
            // Simple skid mark generation based on driving conditions
            let slipRatio = 0;
            const isFrontTire = tireName.includes('front');
            const isRearTire = !isFrontTire;
            
            // Check for specific skid conditions
            if (handbrake && isFrontTire && Math.abs(linearSpeed) > 5) {
              // Handbrake locks front wheels
              slipRatio = 0.8;
            } else if (braking && Math.abs(linearSpeed) > 15 && brakingTraction < 0.7) {
              // Hard braking at speed
              slipRatio = isFrontTire ? 0.7 : 0.5;
            } else if (throttle > 0.8 && isRearTire && accelerationTraction < 0.7 && Math.abs(linearSpeed) < 10) {
              // Wheelspin during hard acceleration from low speed
              slipRatio = 0.6;
            } else if (Math.abs(gameState.wheelAngle) > 0.3 && Math.abs(linearSpeed) > 20) {
              // High speed cornering
              const turningRadius = gameState.wheelbase / Math.tan(Math.abs(gameState.wheelAngle));
              const lateralAccel = (linearSpeed * linearSpeed) / turningRadius;
              const lateralG = lateralAccel / gameState.gravity;
              
              if (lateralG > 1.5) {
                // Only extreme cornering creates marks
                slipRatio = 0.5;
              }
            }
            
            // No marks for normal driving
            if (slipRatio < 0.5) {
              slipRatio = 0;
            }
            
            // Cap at maximum
            slipRatio = Math.min(slipRatio, 1.0);
            
            // Store the slip ratio for sound effects
            tire.slipRatio = slipRatio;
            
            // Only create skid marks if there's significant slip
            if (Math.abs(slipRatio) > 0.15) {
              createSkidMark(tire.x, tire.z, slipRatio);
            }
          }
        });
      }
    } else {
      // When airborne, no skidding occurs
      gameState.tires.frontLeft.skidding = false;
      gameState.tires.frontRight.skidding = false;
      gameState.tires.rearLeft.skidding = false;
      gameState.tires.rearRight.skidding = false;
      
      // Reset slip ratios
      gameState.tires.frontLeft.slipRatio = 0;
      gameState.tires.frontRight.slipRatio = 0;
      gameState.tires.rearLeft.slipRatio = 0;
      gameState.tires.rearRight.slipRatio = 0;
    }
    
    // Update sounds that depend on linearSpeed
    updateTireScreech(hasGroundContact, linearSpeed);
    updateBrakeSound(braking, handbrake, linearSpeed);
    updateWindNoise(linearSpeed);
    
    // Update wheel rotations
    if (carGroup.wheels) {
      // Steering is already handled above, just do wheel spinning here
      
      // Wheel spinning (forward when moving forward)
      // Since the cylinder is rotated 90 degrees around Z, its axis is now along X
      // So we rotate around X axis for forward/backward motion
      const wheelRotation = gameState.wheelSpeed * deltaTime;  // Positive for forward
      
      // Rear wheels provide power (rotate around X axis after geometry rotation)
      carGroup.wheels.rearLeft.rotation.x += wheelRotation;
      carGroup.wheels.rearRight.rotation.x += wheelRotation;
      
      // Front wheels rotation
      if (handbrake) {
        // Handbrake: Front wheels locked (no rotation)
        // They stay at their current rotation
      } else {
        // Normal or S-key braking: Front wheels rotate based on their speed
        const frontRotation = gameState.frontWheelSpeed * deltaTime;
        // With rotation order YXZ, X rotation will be applied after Y (steering)
        // This makes the wheel roll in the direction it's pointing
        carGroup.wheels.frontLeft.rotation.x += frontRotation;
        carGroup.wheels.frontRight.rotation.x += frontRotation;
      }
    }
    
    // Update engine sound (doesn't need linearSpeed)
    updateEngineSound();
    updateSuspensionSound();
    
    // Update rev sound and tachometer when throttle is applied
    if (throttle > 0 || engineRPM > 800) {
      // Track acceleration timing
      if (!isAccelerating) {
        isAccelerating = true;
        accelerationStartTime = Date.now();
      }
      
      // Only show tachometer after 600ms of acceleration and if not hidden
      const accelerationDuration = Date.now() - accelerationStartTime;
      if (!tachometerHidden && accelerationDuration >= 600) {
        if (!tachometer && !youTooltipContent.tachometer) createTachometer();
        updateTachometer(engineRPM);
        if (tachometer) tachometer.visible = true;
      }
      
      updateRevSound(throttle, engineRPM);
    } else {
      // Reset acceleration tracking
      isAccelerating = false;
      accelerationStartTime = 0;
      
      // Hide tachometer when idle
      if (tachometer || youTooltipContent.tachometer) {
        removeTachometer();
      }
      updateRevSound(0, engineRPM);
    }
    
    // No obstacle collisions - obstacles removed
    
    // Update gate physics and check collisions
    updateGatePhysics(deltaTime);
    checkGateCollisions();
    checkFenceCollisions();
    
    // Update treadmill
    updateTreadmill(deltaTime);
    
    // Check cinematic triggers
    checkCinematicTriggers();
    
    // Check if entering Browser Country
    if (!gameState.browserCountryEntered) {
      // Check if car is inside the fenced area
      const fence = scene.getObjectByName('fence');
      if (fence) {
        const fenceX = fence.position.x;
        const fenceZ = fence.position.z;
        const fenceSize = 40; // Size of the fenced area
        
        // Check if car is within fence bounds
        const inFenceX = Math.abs(gameState.x - fenceX) < fenceSize/2;
        const inFenceZ = Math.abs(gameState.z - fenceZ) < fenceSize/2;
        
        if (inFenceX && inFenceZ) {
          gameState.browserCountryEntered = true;
          expandBrowserCountry();
        }
      }
    }
    
    // Update YOU tooltip position if it exists
    if (youTooltip) {
      youTooltip.position.set(gameState.x, gameState.y + 2, gameState.z);
      // Always face camera (billboarding is automatic for sprites)
    }
    
    // Get ground object for collision checks
    const ground = scene.getObjectByName('ground');
    
    // Check wall collisions
    if (ground && ground.walls) {
      ground.walls.forEach(wall => {
        const wallBox = new THREE.Box3().setFromObject(wall);
        const carBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(gameState.x, 0.5, gameState.z),
          new THREE.Vector3(CONFIG.car.size.width, CONFIG.car.size.height, CONFIG.car.size.length)
        );
        
        if (wallBox.intersectsBox(carBox)) {
          // Calculate impact position at wall surface
          const impactX = wall.geometry.parameters.width > wall.geometry.parameters.depth 
            ? gameState.x // North/South wall - impact at car's X position
            : wall.position.x; // East/West wall - impact at wall's X position
          const impactZ = wall.geometry.parameters.width > wall.geometry.parameters.depth 
            ? wall.position.z // North/South wall - impact at wall's Z position
            : gameState.z; // East/West wall - impact at car's Z position
          
          // Bounce off wall
          if (wall.geometry.parameters.width > wall.geometry.parameters.depth) {
            // North/South wall - reverse Z velocity
            gameState.vz *= -0.5;
            gameState.z += Math.sign(gameState.vz) * 0.5;
          } else {
            // East/West wall - reverse X velocity
            gameState.vx *= -0.5;
            gameState.x += Math.sign(gameState.vx) * 0.5;
          }
          gameState.wheelSpeed *= 0.5;
          playCollisionSound(impactX, impactZ);
        }
      });
    }
    
    // Simple anti-stuck mechanism only
    if (ground) {
      // Anti-stuck mechanism - detect if car is barely moving but should be
      const isStuck = Math.abs(gameState.vx) < 0.5 && Math.abs(gameState.vz) < 0.5 && 
                     Math.abs(gameState.wheelSpeed) > 0.1 && gameState.y < 0.5 && !gameState.falling;
      
      if (isStuck) {
        // Apply small random force to unstick
        gameState.vy = 2.0; // Small upward bump
        gameState.vx += (Math.random() - 0.5) * 2.0;
        gameState.vz += (Math.random() - 0.5) * 2.0;
      }
    }
    
    // Camera update based on mode
    switch(window.cameraMode) {
      case CAMERA_MODES.STABLE_TRACKING:
        // Default - camera follows car smoothly from fixed angle
        const cameraAngle = Math.PI * 30 / 180;  // 30 degrees in radians
        const cameraDistance = 14.14;  // Distance from car
        camera.position.x = gameState.x + cameraDistance * Math.sin(cameraAngle);  // ≈ 7.07
        camera.position.z = gameState.z + cameraDistance * Math.cos(cameraAngle);  // ≈ 12.25
        camera.lookAt(gameState.x, 0, gameState.z);
        break;
        
      case CAMERA_MODES.FIXED_FOLLOW:
        // Camera stays at user-defined position but looks at car
        // Position is set by user controls, just update look target
        camera.lookAt(gameState.x, 0, gameState.z);
        break;
        
      case CAMERA_MODES.STABLE_NO_TRACKING:
        // Camera stays at initial position and orientation
        // Do nothing - camera remains where it was set
        break;
    }
    
    // Update directional light to follow car for consistent shadows
    if (directionalLight) {
      directionalLight.position.set(gameState.x + 30, 80, gameState.z + 30);
      directionalLight.target.position.set(gameState.x, 0, gameState.z);
      directionalLight.target.updateMatrixWorld();
    }
    
    // Old chasm detection replaced by individual tire ground contact detection in updateGravityAndOrientation()
    
    // Handle falling - respawn when fallen far enough
    if (gameState.falling && gameState.y < -20) {
      // Reset car to starting position
      gameState.x = -15;  // Respawn on left platform
      gameState.z = 0;
      gameState.y = 6.0;  // Drop from 6 meters height
      gameState.angle = 0;
      gameState.pitch = 0;
      gameState.roll = 0;
      gameState.vx = 0;
      gameState.vz = 0;
      gameState.vy = 0;
      gameState.pitchVelocity = 0;
      gameState.rollVelocity = 0;
      gameState.wheelSpeed = 0;
      gameState.speed = 0;
      gameState.falling = false;
      
      // Calculate initial spring compression
      const staticLoad = (gameState.mass * gameState.gravity) / 4;
      const initialCompression = gameState.suspension.springStiffness > 0 ? staticLoad / gameState.suspension.springStiffness : 0.05;
      
      // Reset all tires to ground contact with proper spring compression
      Object.values(gameState.tires).forEach(tire => {
        tire.onGround = true;
        tire.groundHeight = 0;
        tire.y = tire.groundHeight + wheelRadius; // Tire center is always wheelRadius above ground
        tire.springCompression = initialCompression;
        tire.springVelocity = 0;
        tire.weightLoad = staticLoad;
      });
    }
    
    // Check if user has started driving (forward or backward for 1+ seconds)
    if (!hasStartedDriving && (throttle !== 0 || braking)) {
      drivingTime += deltaTime;
      if (drivingTime >= 1.0) {
        hasStartedDriving = true;
        console.log('User started driving - starting tooltip timeout');
        
        // Start the timeout for both tooltips (unless disabled in debug settings)
        if (!tooltipAutoExpireDisabled) {
          if (youTooltip && youTooltip.fadeFunction) {
            setTimeout(() => {
              if (!tooltipAutoExpireDisabled && youTooltip && youTooltip.fadeFunction) {
                youTooltip.fadeFunction();
              }
            }, 2500);
          }
          
          if (treasureTooltip && treasureTooltip.fadeFunction) {
            setTimeout(() => {
              if (!tooltipAutoExpireDisabled && treasureTooltip && treasureTooltip.fadeFunction) {
                treasureTooltip.fadeFunction();
              }
            }, 2500);
          }
        }
      }
    } else if (throttle === 0 && !braking) {
      // Reset timer if user stops driving before 1 second
      drivingTime = 0;
    }
    
    // Update YOU tooltip position to follow car
    if (youTooltip) {
      youTooltip.position.set(gameState.x, gameState.y + 2, gameState.z);
    }
    
    // Update spray paint animation for road signs
    const roadSigns = scene.getObjectByName('roadSigns');
    if (roadSigns && roadSigns.signs) {
      const currentTime = performance.now();
      
      roadSigns.signs.forEach((signData, index) => {
        // Check if car is near this sign to trigger animation
        const distToSign = Math.sqrt(
          Math.pow(gameState.x - signData.mesh.position.x, 2) + 
          Math.pow(gameState.z - signData.mesh.position.z, 2)
        );
        
        // Trigger animation when car gets within 30 units
        if (!signData.hasStarted && distToSign < 30) {
          signData.hasStarted = true;
          signData.startTime = currentTime + index * 500; // Stagger by 500ms
          signData.isAnimating = true;
        }
        
        // Animate the sign if it's started
        if (signData.isAnimating && signData.startTime && currentTime >= signData.startTime) {
          const animTime = (currentTime - signData.startTime) / 1000; // Convert to seconds
          const animDuration = 1.5; // 1.5 seconds for full animation
          
          if (animTime < animDuration) {
            // Calculate animation progress (0 to 1)
            const progress = animTime / animDuration;
            
            // Ease-out cubic function for smooth animation
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            // Update material opacity
            signData.material.opacity = easedProgress;
            
            // Could add mask-based reveal here in future
          } else {
            // Animation complete
            signData.material.opacity = 1;
            signData.isAnimating = false;
          }
        }
        
        // Check if individual tires are driving through paint (when sign is visible)
        if (signData.material.opacity > 0.5) {
          // Check each tire individually
          Object.entries(gameState.tires).forEach(([tireName, tire]) => {
            const inPaintX = tire.x >= signData.paintBounds.minX && 
                            tire.x <= signData.paintBounds.maxX;
            const inPaintZ = tire.z >= signData.paintBounds.minZ && 
                            tire.z <= signData.paintBounds.maxZ;
            
            if (inPaintX && inPaintZ && tire.onGround) {
              // Ink only this specific tire
              tireInked[tireName] = 1.0; // Full ink
            }
          });
        }
      });
    }
    
    // Update tire ink levels (decay over time)
    Object.keys(tireInked).forEach(tire => {
      if (tireInked[tire] > 0) {
        tireInked[tire] = Math.max(0, tireInked[tire] - TIRE_INK_DECAY);
      }
    });
    
    // Create white tire tracks from inked tires
    if (hasGroundContact && (tireInked.frontLeft > 0 || tireInked.frontRight > 0 || 
                            tireInked.rearLeft > 0 || tireInked.rearRight > 0)) {
      // Create ink marks similar to skid marks but white
      Object.entries(gameState.tires).forEach(([tireName, tire]) => {
        if (tire.onGround && tireInked[tireName] > 0) {
          createInkMark(tire.x, tire.z, tireInked[tireName]);
        }
      });
    }
    
    // Update dev tools position display
    if (frame % 6 === 0) { // Update every 6 frames (~10Hz)
      const posElement = document.getElementById('dev-pos');
      const rotElement = document.getElementById('dev-rot');
      const speedElement = document.getElementById('dev-speed');
      
      if (posElement) {
        posElement.textContent = `X: ${gameState.x.toFixed(1)}, Z: ${gameState.z.toFixed(1)}`;
      }
      if (rotElement) {
        rotElement.textContent = `${(gameState.angle * 180 / Math.PI).toFixed(0)}°`;
      }
      if (speedElement) {
        const speed = Math.sqrt(gameState.vx * gameState.vx + gameState.vz * gameState.vz);
        speedElement.textContent = speed.toFixed(1);
      }
    }
    
    frame++;
  }

  let lastTime = performance.now();
  let fps = 0;
  
  function animate() {
    requestAnimationFrame(animate);
    
    // Calculate FPS
    const currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    fps = 1000 / deltaTime;
    lastTime = currentTime;
    
    update(1/60);
    
    // Render scene
    if (pixelationEnabled) {
      // Create or update render target
      if (!window.pixelRenderTarget || 
          window.pixelRenderTarget.width !== pixelRenderWidth || 
          window.pixelRenderTarget.height !== pixelRenderHeight) {
        if (window.pixelRenderTarget) window.pixelRenderTarget.dispose();
        window.pixelRenderTarget = new THREE.WebGLRenderTarget(pixelRenderWidth, pixelRenderHeight, {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter
        });
      }
      
      // Render to low-res target
      renderer.setRenderTarget(window.pixelRenderTarget);
      renderer.setSize(pixelRenderWidth, pixelRenderHeight);
      
      // Store current camera settings
      const currentLeft = camera.left;
      const currentRight = camera.right;
      const currentTop = camera.top;
      const currentBottom = camera.bottom;
      
      // Update camera aspect ratio for pixel render to prevent stretching
      const pixelAspect = pixelRenderWidth / pixelRenderHeight;
      
      // Use the current camera zoom level (preserve user's zoom setting)
      const currentOrthoWidth = currentRight - currentLeft;
      const currentOrthoHeight = currentTop - currentBottom;
      const halfHeight = currentOrthoHeight / 2;
      const halfWidth = halfHeight * pixelAspect;
      
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      
      renderer.render(scene, camera);
      
      // Switch back to screen
      renderer.setRenderTarget(null);
      renderer.setSize(window.innerWidth, window.innerHeight);
      
      // Restore original camera settings
      camera.left = currentLeft;
      camera.right = currentRight;
      camera.top = currentTop;
      camera.bottom = currentBottom;
      camera.updateProjectionMatrix();
      
      // Render pixelated result to screen
      if (!window.pixelQuad) {
        const pixelGeometry = new THREE.PlaneGeometry(2, 2);
        const pixelMaterial = new THREE.MeshBasicMaterial({
          map: window.pixelRenderTarget.texture
        });
        window.pixelQuad = new THREE.Mesh(pixelGeometry, pixelMaterial);
        
        window.pixelScene = new THREE.Scene();
        window.pixelCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        window.pixelScene.add(window.pixelQuad);
      }
      
      // Update the texture
      window.pixelQuad.material.map = window.pixelRenderTarget.texture;
      
      // Render the pixelated quad fullscreen
      renderer.render(window.pixelScene, window.pixelCamera);
    } else {
      // Normal rendering
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
    }
    
    // Show FPS counter if enabled
    if (showFPS && frame % 6 === 0) {
      let fpsDisplay = document.getElementById('fps-display');
      if (!fpsDisplay) {
        fpsDisplay = document.createElement('div');
        fpsDisplay.id = 'fps-display';
        fpsDisplay.style.cssText = `
          position: fixed;
          top: 10px;
          left: 10px;
          background: rgba(0,0,0,0.7);
          color: #0f0;
          padding: 5px 10px;
          font-family: monospace;
          font-size: 14px;
          border-radius: 3px;
          z-index: 1000;
        `;
        document.body.appendChild(fpsDisplay);
      }
      fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
      fpsDisplay.style.display = 'block';
    } else if (!showFPS) {
      const fpsDisplay = document.getElementById('fps-display');
      if (fpsDisplay) fpsDisplay.style.display = 'none';
    }
    
    // Scale to display with nearest neighbor
    const scale = Math.min(
      displayCanvas.width / CONFIG.renderWidth,
      displayCanvas.height / CONFIG.renderHeight
    );
    
    const scaledWidth = CONFIG.renderWidth * scale;
    const scaledHeight = CONFIG.renderHeight * scale;
    const offsetX = (displayCanvas.width - scaledWidth) / 2;
    const offsetY = (displayCanvas.height - scaledHeight) / 2;
    
    // Clear canvas with white
    displayCtx.fillStyle = 'white';
    displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    
    // Draw scaled game centered
    displayCtx.drawImage(
      renderer.domElement,
      0, 0, CONFIG.renderWidth, CONFIG.renderHeight,
      offsetX, offsetY, scaledWidth, scaledHeight
    );
    
    // Mac-style UI
    drawUI(offsetX, offsetY, scaledWidth, scaledHeight);
  }

  function drawUI(offsetX, offsetY, width, height) {
    // UI removed - no bottom stats bar or controls overlay
  }

  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      document.body.classList.remove('game-active');
    }, 500);
  }

  // Function to expand Browser Country when entered
  function expandBrowserCountry() {
    if (gameState.browserCountryExpanded) return;
    gameState.browserCountryExpanded = true;
    
    // Activate treadmill
    treadmillState.active = true;
    
    const fence = scene.getObjectByName('fence');
    const ground = scene.getObjectByName('ground');
    if (!fence || !ground) return;
    
    // Animate fence and ground expansion
    const expandDuration = 2000; // 2 seconds
    const startTime = performance.now();
    const startScale = fence.scale.z;
    const targetScale = 10; // Make it 10x longer
    
    // Store original ground geometry
    const originalGroundLength = 600;
    const expandedGroundLength = originalGroundLength * targetScale;
    
    function animateExpansion() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / expandDuration, 1);
      
      // Easing function for smooth animation
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      
      // Scale only in Z direction (depth)
      fence.scale.z = startScale + (targetScale - startScale) * easeProgress;
      
      // Move the fence forward to keep the entrance at the same position
      const expansionOffset = (fence.scale.z - startScale) * 20; // Half of original fence size
      fence.position.z = -100 - expansionOffset;
      
      // Expand the ground platform
      const mainGround = ground.children[0]; // The main ground mesh
      if (mainGround && mainGround.geometry) {
        // Create new geometry with expanded length
        const currentLength = originalGroundLength + (expandedGroundLength - originalGroundLength) * easeProgress;
        mainGround.geometry.dispose();
        mainGround.geometry = new THREE.BoxGeometry(300, 10, currentLength);
        
        // Move ground to stay centered with expansion
        mainGround.position.z = -((currentLength - originalGroundLength) / 2);
        
        // Update ground bounds
        ground.bounds.minZ = -currentLength/2;
        ground.bounds.maxZ = currentLength/2;
        
        // Update walls to match new ground size
        const walls = ground.walls;
        if (walls) {
          // North wall moves with expansion
          walls[0].position.z = currentLength/2;
          walls[0].geometry.dispose();
          walls[0].geometry = new THREE.BoxGeometry(300, 2, 1);
          
          // South wall stays at original position
          walls[1].position.z = -currentLength/2;
          walls[1].geometry.dispose();
          walls[1].geometry = new THREE.BoxGeometry(300, 2, 1);
          
          // East and West walls need to be longer
          walls[2].geometry.dispose();
          walls[2].geometry = new THREE.BoxGeometry(1, 2, currentLength);
          
          walls[3].geometry.dispose();
          walls[3].geometry = new THREE.BoxGeometry(1, 2, currentLength);
        }
      }
      
      // Also scale the gates to match
      const gates = scene.getObjectByName('gates');
      if (gates) {
        gates.position.z = fence.position.z + 20 * fence.scale.z; // Keep at fence entrance
      }
      
      // Move treasure to back 1/6 of expanded area
      const treasure = scene.getObjectByName('treasureChest');
      if (treasure) {
        // Expanded fence is 100x100, so back edge is at -100 - 50 = -150
        // Back 1/6 would be around -142
        treasure.position.z = fence.position.z - 42 * fence.scale.z; // Back 1/6 of expanded area
      }
      
      if (progress < 1) {
        requestAnimationFrame(animateExpansion);
      } else {
        // Update camera to see the expanded area better
        if (camera) {
          camera.far = 10000; // Increase far plane to see the entire expanded area
          camera.updateProjectionMatrix();
        }
      }
    }
    
    animateExpansion();
  }

  // Start with error handling
  function startGame() {
    console.log('Starting Mac 3D game...');
    try {
      init();
      console.log('Game initialized successfully');
    } catch (error) {
      console.error('Error initializing game:', error);
      console.error('Stack trace:', error.stack);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, waiting for Three.js...');
      setTimeout(startGame, 500);
    });
  } else {
    console.log('Document ready, waiting for Three.js...');
    setTimeout(startGame, 500);
  }
  
  // Function declarations that were outside need to be inside init
  // lastTime and fps are already declared above
  
  function animate() {
    requestAnimationFrame(animate);
    
    // Calculate FPS
    const currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    fps = 1000 / deltaTime;
    lastTime = currentTime;
    
    update(1/60);
    
    // Render scene
    if (pixelationEnabled) {
      // Create or update render target
      if (!window.pixelRenderTarget || 
          window.pixelRenderTarget.width !== pixelRenderWidth || 
          window.pixelRenderTarget.height !== pixelRenderHeight) {
        if (window.pixelRenderTarget) window.pixelRenderTarget.dispose();
        window.pixelRenderTarget = new THREE.WebGLRenderTarget(pixelRenderWidth, pixelRenderHeight, {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter
        });
      }
      
      // Render to low-res target
      renderer.setRenderTarget(window.pixelRenderTarget);
      renderer.setSize(pixelRenderWidth, pixelRenderHeight);
      
      // Store current camera settings
      const currentLeft = camera.left;
      const currentRight = camera.right;
      const currentTop = camera.top;
      const currentBottom = camera.bottom;
      
      // Update camera aspect ratio for pixel render to prevent stretching
      const pixelAspect = pixelRenderWidth / pixelRenderHeight;
      
      // Use the current camera zoom level (preserve user's zoom setting)
      const currentOrthoWidth = currentRight - currentLeft;
      const currentOrthoHeight = currentTop - currentBottom;
      const halfHeight = currentOrthoHeight / 2;
      const halfWidth = halfHeight * pixelAspect;
      
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      
      renderer.render(scene, camera);
      
      // Switch back to screen
      renderer.setRenderTarget(null);
      renderer.setSize(window.innerWidth, window.innerHeight);
      
      // Restore original camera settings
      camera.left = currentLeft;
      camera.right = currentRight;
      camera.top = currentTop;
      camera.bottom = currentBottom;
      camera.updateProjectionMatrix();
      
      // Render pixelated result to screen
      if (!window.pixelQuad) {
        const pixelGeometry = new THREE.PlaneGeometry(2, 2);
        const pixelMaterial = new THREE.MeshBasicMaterial({
          map: window.pixelRenderTarget.texture
        });
        window.pixelQuad = new THREE.Mesh(pixelGeometry, pixelMaterial);
        
        window.pixelScene = new THREE.Scene();
        window.pixelCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        window.pixelScene.add(window.pixelQuad);
      }
      
      // Update the texture
      window.pixelQuad.material.map = window.pixelRenderTarget.texture;
      
      // Render the pixelated quad fullscreen
      renderer.render(window.pixelScene, window.pixelCamera);
    } else {
      // Normal rendering
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
    }
    
    // Show FPS counter if enabled
    if (showFPS && frame % 6 === 0) {
      let fpsDisplay = document.getElementById('fps-display');
      if (!fpsDisplay) {
        fpsDisplay = document.createElement('div');
        fpsDisplay.id = 'fps-display';
        fpsDisplay.style.cssText = `
          position: fixed;
          top: 10px;
          left: 10px;
          background: rgba(0,0,0,0.7);
          color: #0f0;
          padding: 5px 10px;
          font-family: monospace;
          font-size: 14px;
          border-radius: 3px;
          z-index: 1000;
        `;
        document.body.appendChild(fpsDisplay);
      }
      fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
      fpsDisplay.style.display = 'block';
    } else if (!showFPS) {
      const fpsDisplay = document.getElementById('fps-display');
      if (fpsDisplay) fpsDisplay.style.display = 'none';
    }
  }
})();