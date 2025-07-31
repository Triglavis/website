(() => {
  // Fixed Car Game with Proper Physics Integration
  
  const CONFIG = {
    renderWidth: 640,
    renderHeight: 480,
    colors: {
      black: 0x000000,
      white: 0xFFFFFF,
      gray50: 0x808080,
    },
  };

  // Game state
  let scene, camera, renderer;
  let carModel, carGroup;
  let displayCanvas, displayCtx;
  let carPhysics; // The new physics engine instance
  let keys = {};
  let isMuted = false;
  let audioCtx = null;
  let engineSound = null;
  let skidMarks = [];
  let obstacles = [];
  let terrainElements = [];
  let lastTime = 0;

  // Initialize physics engine
  function initPhysics() {
    if (!window.CarPhysicsEngine) {
      console.error('Physics engine not loaded!');
      return;
    }
    
    // Create physics instance with initial position
    carPhysics = new window.CarPhysicsEngine.CarPhysics({
      x: -17.5,  // Start on left platform center
      y: 0.5,    // Ground level
      z: 0,      // Center of platform
      angle: Math.PI, // Facing west
    });
  }

  // Ground height function for physics engine
  function getGroundHeight(x, z) {
    const platformWidth = 20;
    const platformLength = 100;
    const chasmWidth = 15;
    const groundLevel = 0;
    
    // Platform boundaries
    const leftPlatformMinX = -(platformWidth + chasmWidth / 2);
    const leftPlatformMaxX = -(chasmWidth / 2);
    const rightPlatformMinX = chasmWidth / 2;
    const rightPlatformMaxX = platformWidth + chasmWidth / 2;
    const platformMinZ = -platformLength / 2;
    const platformMaxZ = platformLength / 2;
    
    // Check if on platforms
    const onLeftPlatform = x >= leftPlatformMinX && x <= leftPlatformMaxX && 
                          z >= platformMinZ && z <= platformMaxZ;
    const onRightPlatform = x >= rightPlatformMinX && x <= rightPlatformMaxX && 
                           z >= platformMinZ && z <= platformMaxZ;
    
    if (onLeftPlatform || onRightPlatform) {
      // Check for terrain elements (ramps, etc)
      // For now, return ground level
      return groundLevel;
    }
    
    // Over the chasm
    return -100; // Deep fall
  }

  // Create 3D scene
  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.white);
    scene.fog = new THREE.Fog(CONFIG.colors.white, 50, 200);
    
    // Camera
    camera = new THREE.OrthographicCamera(
      -20, 20, 15, -15, 0.1, 1000
    );
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
      antialias: false,
      canvas: document.getElementById('carGameCanvas')
    });
    renderer.setPixelRatio(1); // Force pixelated look
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(CONFIG.colors.white, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(CONFIG.colors.white, 0.4);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
  }

  // Create car 3D model
  function createCar() {
    carGroup = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(1.2, 0.9, 2);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: CONFIG.colors.black });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.45;
    body.castShadow = true;
    body.receiveShadow = true;
    carGroup.add(body);
    
    // Windshield
    const windshieldGeometry = new THREE.BoxGeometry(1, 0.4, 0.6);
    const windshieldMaterial = new THREE.MeshPhongMaterial({ color: CONFIG.colors.white });
    const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
    windshield.position.set(0, 0.65, 0.4);
    carGroup.add(windshield);
    
    // Create wheels
    carGroup.wheels = {};
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: CONFIG.colors.black });
    
    const wheelPositions = {
      frontLeft: { x: -0.6, z: 0.7 },
      frontRight: { x: 0.6, z: 0.7 },
      rearLeft: { x: -0.6, z: -0.7 },
      rearRight: { x: 0.6, z: -0.7 }
    };
    
    for (const [name, pos] of Object.entries(wheelPositions)) {
      const wheelGroup = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelGroup.add(wheel);
      
      // Hubcap
      const hubcapGeometry = new THREE.CircleGeometry(0.25, 16);
      const hubcapMaterial = new THREE.MeshPhongMaterial({ color: CONFIG.colors.white });
      const hubcap = new THREE.Mesh(hubcapGeometry, hubcapMaterial);
      hubcap.position.x = name.includes('Left') ? -0.11 : 0.11;
      hubcap.rotation.z = Math.PI / 2;
      wheelGroup.add(hubcap);
      
      wheelGroup.position.set(pos.x, 0, pos.z);
      carGroup.wheels[name] = wheelGroup;
      carGroup.add(wheelGroup);
    }
    
    // Brake lights
    const brakeLightGeometry = new THREE.BoxGeometry(0.2, 0.15, 0.05);
    const brakeLightMaterial = new THREE.MeshPhongMaterial({ 
      color: CONFIG.colors.black,
      emissive: CONFIG.colors.black
    });
    
    const leftBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
    leftBrakeLight.position.set(-0.4, 0.4, -1);
    carGroup.add(leftBrakeLight);
    carGroup.brakeLightLeft = leftBrakeLight;
    
    const rightBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
    rightBrakeLight.position.set(0.4, 0.4, -1);
    carGroup.add(rightBrakeLight);
    carGroup.brakeLightRight = rightBrakeLight;
    
    scene.add(carGroup);
  }

  // Create world
  function createWorld() {
    // Platforms
    const platformGeometry = new THREE.BoxGeometry(20, 0.5, 100);
    const platformMaterial = new THREE.MeshPhongMaterial({ 
      color: CONFIG.colors.gray50 
    });
    
    // Left platform
    const leftPlatform = new THREE.Mesh(platformGeometry, platformMaterial);
    leftPlatform.position.set(-17.5, -0.25, 0);
    leftPlatform.receiveShadow = true;
    scene.add(leftPlatform);
    
    // Right platform  
    const rightPlatform = new THREE.Mesh(platformGeometry, platformMaterial);
    rightPlatform.position.set(17.5, -0.25, 0);
    rightPlatform.receiveShadow = true;
    scene.add(rightPlatform);
    
    // Add some random obstacles
    const obstacleGeometry = new THREE.BoxGeometry(2, 1, 2);
    const obstacleMaterial = new THREE.MeshPhongMaterial({ 
      color: CONFIG.colors.black 
    });
    
    for (let i = 0; i < 5; i++) {
      const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
      const platform = Math.random() > 0.5 ? -17.5 : 17.5;
      obstacle.position.set(
        platform + (Math.random() - 0.5) * 10,
        0.5,
        (Math.random() - 0.5) * 80
      );
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
      obstacles.push(obstacle);
      scene.add(obstacle);
    }
  }

  // Audio system
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create engine sound
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'triangle';
    oscillator.frequency.value = 100;
    gainNode.gain.value = 0;
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    
    engineSound = { oscillator, gainNode };
  }

  function updateEngineSound() {
    if (!engineSound || isMuted) return;
    
    const state = carPhysics.getState();
    const rpm = state.engineRPM;
    const speed = state.speed;
    
    // Map RPM to frequency
    const minFreq = 80;
    const maxFreq = 300;
    const normalizedRPM = rpm / window.CarPhysicsEngine.PHYSICS_CONFIG.engine.maxRPM;
    engineSound.oscillator.frequency.value = minFreq + (maxFreq - minFreq) * normalizedRPM;
    
    // Volume based on throttle and speed
    const targetVolume = Math.min(0.3, 0.1 + speed * 0.01);
    engineSound.gainNode.gain.value = isMuted ? 0 : targetVolume;
  }

  // Update loop
  function update(deltaTime) {
    if (!carPhysics) return;
    
    // Process input
    const controls = {
      throttle: (keys['w'] || keys['arrowup']) ? 1 : 0,
      brake: (keys['s'] || keys['arrowdown']) ? 1 : 0,
      handbrake: keys[' '] ? 1 : 0,
      steer: 0,
    };
    
    if (keys['a'] || keys['arrowleft']) controls.steer -= 1;
    if (keys['d'] || keys['arrowright']) controls.steer += 1;
    
    // Set controls
    carPhysics.setControls(controls);
    
    // Update physics
    carPhysics.update(deltaTime, getGroundHeight);
    
    // Get physics state
    const state = carPhysics.getState();
    
    // Update 3D model
    carGroup.position.set(state.position.x, state.position.y, state.position.z);
    carGroup.rotation.y = -state.rotation.y;
    
    // Update wheels
    const wheelSpeed = state.speed / 0.3; // wheel radius
    for (const [name, wheelGroup] of Object.entries(carGroup.wheels)) {
      const wheel = wheelGroup.children[0];
      
      // Rotate wheels for motion
      wheel.rotation.x += wheelSpeed * deltaTime;
      
      // Steer front wheels
      if (name.includes('front')) {
        wheelGroup.rotation.y = carPhysics.steerAngle;
      }
    }
    
    // Update brake lights
    const braking = controls.brake > 0 || controls.handbrake > 0 || (state.speed < 0.1 && state.engineRPM < 1000);
    const brakeLightColor = braking ? CONFIG.colors.white : CONFIG.colors.black;
    carGroup.brakeLightLeft.material.color.setHex(brakeLightColor);
    carGroup.brakeLightRight.material.color.setHex(brakeLightColor);
    carGroup.brakeLightLeft.material.emissive.setHex(brakeLightColor);
    carGroup.brakeLightRight.material.emissive.setHex(brakeLightColor);
    
    // Create skid marks
    for (const [name, tireData] of Object.entries(state.tires)) {
      if (tireData.skidding && tireData.contactPatch) {
        const tirePos = carPhysics.localToWorld(
          window.CarPhysicsEngine.PHYSICS_CONFIG.car[`tire${name.charAt(0).toUpperCase() + name.slice(1)}Pos`] || 
          { x: name.includes('Left') ? -0.8 : 0.8, y: 0, z: name.includes('front') ? 1.2 : -1.2 }
        );
        createSkidMark(tirePos.x, 0.01, tirePos.z);
      }
    }
    
    // Update camera to follow car
    const cameraOffset = new THREE.Vector3(15, 15, 15);
    camera.position.copy(carGroup.position).add(cameraOffset);
    camera.lookAt(carGroup.position);
    
    // Update audio
    updateEngineSound();
    
    // Check collisions
    checkCollisions();
  }

  function createSkidMark(x, y, z) {
    const geometry = new THREE.PlaneGeometry(0.3, 0.5);
    const material = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.black,
      transparent: true,
      opacity: 0.5
    });
    const skidMark = new THREE.Mesh(geometry, material);
    skidMark.position.set(x, y, z);
    skidMark.rotation.x = -Math.PI / 2;
    scene.add(skidMark);
    skidMarks.push(skidMark);
    
    // Fade out and remove old skid marks
    if (skidMarks.length > 200) {
      const oldMark = skidMarks.shift();
      scene.remove(oldMark);
    }
  }

  function checkCollisions() {
    const carPos = carGroup.position;
    const carRadius = 1.5;
    
    // Check obstacle collisions
    for (const obstacle of obstacles) {
      const dx = carPos.x - obstacle.position.x;
      const dz = carPos.z - obstacle.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < carRadius + 1) {
        // Simple bounce back
        const bounce = new window.CarPhysicsEngine.Vector3(dx, 0, dz).normalize().multiply(5);
        carPhysics.velocity = carPhysics.velocity.add(bounce);
      }
    }
    
    // Check platform boundaries
    const platformWidth = 20;
    const chasmWidth = 15;
    const leftEdge = -(platformWidth + chasmWidth / 2);
    const rightEdge = platformWidth + chasmWidth / 2;
    
    if (Math.abs(carPos.x) > platformWidth + chasmWidth / 2 + 5) {
      // Car fell too far, reset
      carPhysics.position = new window.CarPhysicsEngine.Vector3(-17.5, 0.5, 0);
      carPhysics.velocity = new window.CarPhysicsEngine.Vector3();
      carPhysics.angularVelocity = new window.CarPhysicsEngine.Vector3();
    }
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now() / 1000;
    const deltaTime = Math.min(currentTime - lastTime, 0.1); // Cap delta time
    lastTime = currentTime;
    
    update(deltaTime);
    
    // Render to offscreen canvas first (for retro effect)
    renderer.setSize(CONFIG.renderWidth, CONFIG.renderHeight);
    renderer.render(scene, camera);
    
    // Copy to display canvas with scaling
    if (displayCtx) {
      displayCtx.imageSmoothingEnabled = false;
      displayCtx.fillStyle = 'white';
      displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
      displayCtx.drawImage(
        renderer.domElement,
        0, 0, CONFIG.renderWidth, CONFIG.renderHeight,
        0, 0, displayCanvas.width, displayCanvas.height
      );
    }
  }

  // Input handling
  function setupInput() {
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      
      // Mute toggle
      if (e.key.toLowerCase() === 'm') {
        isMuted = !isMuted;
        if (engineSound) {
          engineSound.gainNode.gain.value = isMuted ? 0 : 0.1;
        }
      }
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
  }

  // Initialize
  function init() {
    // Create display canvas
    displayCanvas = document.createElement('canvas');
    displayCanvas.style.position = 'absolute';
    displayCanvas.style.top = '0';
    displayCanvas.style.left = '0';
    displayCanvas.style.width = '100%';
    displayCanvas.style.height = '100%';
    displayCanvas.style.imageRendering = 'pixelated';
    displayCanvas.style.imageRendering = '-moz-crisp-edges';
    displayCanvas.style.imageRendering = 'crisp-edges';
    document.getElementById('carGameContainer').appendChild(displayCanvas);
    displayCtx = displayCanvas.getContext('2d');
    
    // Initialize systems
    initPhysics();
    initThree();
    createCar();
    createWorld();
    initAudio();
    setupInput();
    
    // Handle resize
    function resize() {
      if (displayCanvas) {
        displayCanvas.width = window.innerWidth;
        displayCanvas.height = window.innerHeight;
      }
    }
    window.addEventListener('resize', resize);
    resize();
    
    // Start
    lastTime = performance.now() / 1000;
    animate();
  }

  // Start when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();