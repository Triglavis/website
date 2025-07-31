(() => {
  // MS Paint style 3D car game with simple aesthetics
  const CONFIG = {
    // Render at low resolution for chunky pixels
    renderWidth: 400,
    renderHeight: 300,
    
    // Classic MS Paint palette
    colors: {
      black: 0x000000,
      white: 0xFFFFFF,
      gray: 0xC0C0C0,
      darkGray: 0x808080,
      red: 0xFF0000,
      darkRed: 0x800000,
      blue: 0x0000FF,
      darkBlue: 0x000080,
      yellow: 0xFFFF00,
      green: 0x00FF00,
      darkGreen: 0x008000,
      cyan: 0x00FFFF,
      magenta: 0xFF00FF,
      road: 0x808080,
      grass: 0x00AA00,
      sky: 0x87CEEB
    },
    
    car: {
      maxSpeed: 10,
      acceleration: 15,
      turnSpeed: 3,
      friction: 0.92,
      size: { width: 1.8, height: 1, length: 3.5 }
    }
  };

  let scene, camera, renderer;
  let car, carGroup;
  let displayCanvas, displayCtx;
  let frameCanvas, frameCtx;
  
  // Game state
  let gameState = {
    speed: 0,
    angle: 0,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    collisions: 0,
    trail: []
  };
  
  // Browser Country zones
  let zones = {
    safe: { x: 0, z: 0, radius: 30 },
    browser: { x: 50, z: 0, radius: 40 }
  };
  
  let obstacles = [];
  let keys = {};
  let frame = 0;

  // Create car with MS Paint aesthetic
  function createCarModel() {
    const car = new THREE.Group();
    
    // Main body - white box
    const bodyGeometry = new THREE.BoxGeometry(
      CONFIG.car.size.width, 
      CONFIG.car.size.height, 
      CONFIG.car.size.length
    );
    const bodyMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.white
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    car.add(body);
    
    // Black outline (MS Paint stroke)
    const outlineGeometry = new THREE.BoxGeometry(
      CONFIG.car.size.width + 0.1, 
      CONFIG.car.size.height + 0.1, 
      CONFIG.car.size.length + 0.1
    );
    const outlineMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.black,
      side: THREE.BackSide
    });
    const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
    outline.position.y = 0.5;
    car.add(outline);
    
    // Windows - cyan rectangles
    const windowMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.cyan
    });
    
    // Front windshield
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.car.size.width * 0.8, CONFIG.car.size.height * 0.6),
      windowMaterial
    );
    windshield.position.set(0, 0.7, CONFIG.car.size.length/2 + 0.01);
    car.add(windshield);
    
    // Side windows
    const sideWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.car.size.length * 0.4, CONFIG.car.size.height * 0.6),
      windowMaterial
    );
    sideWindow.position.set(CONFIG.car.size.width/2 + 0.01, 0.7, 0);
    sideWindow.rotation.y = Math.PI/2;
    car.add(sideWindow);
    
    const sideWindow2 = sideWindow.clone();
    sideWindow2.position.x = -CONFIG.car.size.width/2 - 0.01;
    car.add(sideWindow2);
    
    // Wheels - black circles
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    wheelGeometry.rotateZ(Math.PI/2);
    const wheelMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.black
    });
    
    const wheelPositions = [
      { x: 0.9, z: 1.2 },
      { x: -0.9, z: 1.2 },
      { x: 0.9, z: -1.2 },
      { x: -0.9, z: -1.2 }
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, 0.2, pos.z);
      car.add(wheel);
    });
    
    // Headlights - yellow circles
    const headlightGeometry = new THREE.CircleGeometry(0.15, 8);
    const headlightMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.yellow
    });
    
    const headlight1 = new THREE.Mesh(headlightGeometry, headlightMaterial);
    headlight1.position.set(0.5, 0.5, CONFIG.car.size.length/2 + 0.02);
    car.add(headlight1);
    
    const headlight2 = headlight1.clone();
    headlight2.position.x = -0.5;
    car.add(headlight2);
    
    return car;
  }

  // Create MS Paint style ground
  function createGround() {
    const ground = new THREE.Group();
    
    // Don't create a full ground plane - just road and immediate surroundings
    // This allows the hero content to show through
    
    // Road - gray rectangle
    const roadGeometry = new THREE.PlaneGeometry(20, 300);
    const roadMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.road
    });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI/2;
    road.position.y = 0.01;
    ground.add(road);
    
    // Road lines - white dashes
    for (let z = -150; z < 150; z += 10) {
      const lineGeometry = new THREE.PlaneGeometry(1, 5);
      const lineMaterial = new THREE.MeshBasicMaterial({ 
        color: CONFIG.colors.white
      });
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.rotation.x = -Math.PI/2;
      line.position.set(0, 0.02, z);
      ground.add(line);
    }
    
    // Browser Country zone - darker area
    const browserZone = new THREE.Mesh(
      new THREE.RingGeometry(zones.browser.radius - 5, zones.browser.radius, 32),
      new THREE.MeshBasicMaterial({ 
        color: CONFIG.colors.darkRed,
        opacity: 0.3,
        transparent: true
      })
    );
    browserZone.rotation.x = -Math.PI/2;
    browserZone.position.set(zones.browser.x, 0.03, zones.browser.z);
    ground.add(browserZone);
    
    return ground;
  }

  // Create MS Paint style obstacles
  function createObstacles() {
    const obstacleTypes = [
      { color: CONFIG.colors.red, symbol: '♥' },
      { color: CONFIG.colors.blue, symbol: '♦' },
      { color: CONFIG.colors.yellow, symbol: '♣' },
      { color: CONFIG.colors.green, symbol: '♠' }
    ];
    
    for (let i = 0; i < 20; i++) {
      const type = obstacleTypes[i % obstacleTypes.length];
      
      // Simple box obstacle
      const obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial({ color: type.color })
      );
      
      // Add black outline
      const outline = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 2.1, 2.1),
        new THREE.MeshBasicMaterial({ 
          color: CONFIG.colors.black,
          side: THREE.BackSide
        })
      );
      obstacle.add(outline);
      
      // Position randomly
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 35;
      obstacle.position.set(
        Math.cos(angle) * distance,
        1,
        Math.sin(angle) * distance
      );
      
      obstacle.userData = { type: type.symbol };
      obstacles.push(obstacle);
      scene.add(obstacle);
    }
    
    // Add Browser Country obstacles
    for (let i = 0; i < 10; i++) {
      const obstacle = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3, 4),
        new THREE.MeshBasicMaterial({ color: CONFIG.colors.darkRed })
      );
      
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * zones.browser.radius;
      obstacle.position.set(
        zones.browser.x + Math.cos(angle) * distance,
        1.5,
        zones.browser.z + Math.sin(angle) * distance
      );
      
      obstacle.userData = { type: 'browser', sticky: true };
      obstacles.push(obstacle);
      scene.add(obstacle);
    }
  }

  function init() {
    console.log('Initializing MS Paint 3D game...');
    
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
    
    displayCtx = displayCanvas.getContext('2d');
    displayCtx.imageSmoothingEnabled = false;
    
    // Three.js setup
    scene = new THREE.Scene();
    scene.background = null; // Transparent background
    
    // Orthographic camera
    const aspect = CONFIG.renderWidth / CONFIG.renderHeight;
    const d = 15;
    camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect,
      d, -d,
      0.1, 1000
    );
    
    // Classic isometric angle
    camera.position.set(10, 15, 10);
    camera.lookAt(0, 0, 0);
    
    // Renderer with transparent background
    renderer = new THREE.WebGLRenderer({ 
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(CONFIG.renderWidth, CONFIG.renderHeight);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0); // Transparent
    
    // Create game objects
    carGroup = createCarModel();
    scene.add(carGroup);
    
    // Create ground elements (road only, no full plane)
    const ground = createGround();
    scene.add(ground);
    
    createObstacles();
    
    // Lighting - bright and flat
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    
    // Controls
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') skipGame();
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    
    window.addEventListener('resize', resize);
    resize();
    
    document.body.classList.add('game-active');
    
    // Start
    animate();
  }

  function resize() {
    if (displayCanvas) {
      displayCanvas.width = window.innerWidth;
      displayCanvas.height = window.innerHeight;
    }
  }

  function update(deltaTime) {
    // Input
    let throttle = 0;
    let steering = 0;
    
    if (keys['w'] || keys['arrowup']) throttle = 1;
    if (keys['s'] || keys['arrowdown']) throttle = -0.5;
    if (keys['a'] || keys['arrowleft']) steering = -1;
    if (keys['d'] || keys['arrowright']) steering = 1;
    
    // Check if in Browser Country
    const distToBrowser = Math.sqrt(
      Math.pow(gameState.x - zones.browser.x, 2) + 
      Math.pow(gameState.z - zones.browser.z, 2)
    );
    const inBrowserCountry = distToBrowser < zones.browser.radius;
    
    // Modify controls in Browser Country
    if (inBrowserCountry) {
      throttle *= 0.5; // Slower
      steering *= -1;  // Reversed
      steering += Math.sin(frame * 0.1) * 0.3; // Wobbly
    }
    
    // Physics
    gameState.speed += throttle * CONFIG.car.acceleration * deltaTime;
    gameState.speed *= CONFIG.car.friction;
    gameState.speed = Math.max(-5, Math.min(CONFIG.car.maxSpeed, gameState.speed));
    
    if (Math.abs(gameState.speed) > 0.1) {
      gameState.angle += steering * CONFIG.car.turnSpeed * deltaTime * 
                         (gameState.speed / CONFIG.car.maxSpeed);
    }
    
    gameState.vx = Math.sin(gameState.angle) * gameState.speed;
    gameState.vz = Math.cos(gameState.angle) * gameState.speed;
    
    gameState.x += gameState.vx * deltaTime;
    gameState.z += gameState.vz * deltaTime;
    
    // Update car
    carGroup.position.x = gameState.x;
    carGroup.position.z = gameState.z;
    carGroup.rotation.y = -gameState.angle;
    
    // Trail
    if (frame % 5 === 0 && gameState.speed > 1) {
      gameState.trail.push({
        x: gameState.x,
        z: gameState.z,
        life: 30
      });
      if (gameState.trail.length > 20) gameState.trail.shift();
    }
    
    // Update trail
    gameState.trail = gameState.trail.filter(t => --t.life > 0);
    
    // Check collisions
    obstacles.forEach(obstacle => {
      const dist = Math.sqrt(
        Math.pow(gameState.x - obstacle.position.x, 2) + 
        Math.pow(gameState.z - obstacle.position.z, 2)
      );
      
      if (dist < 2) {
        gameState.collisions++;
        gameState.speed *= -0.5;
        
        // Bounce
        const angle = Math.atan2(
          gameState.x - obstacle.position.x,
          gameState.z - obstacle.position.z
        );
        gameState.x += Math.sin(angle) * 2;
        gameState.z += Math.cos(angle) * 2;
        
        // Flash obstacle
        obstacle.material.color.setHex(CONFIG.colors.white);
        setTimeout(() => {
          obstacle.material.color.setHex(
            obstacle.userData.type === 'browser' ? 
            CONFIG.colors.darkRed : CONFIG.colors.red
          );
        }, 100);
      }
    });
    
    // Camera follow
    camera.position.x = gameState.x + 10;
    camera.position.z = gameState.z + 10;
    camera.lookAt(gameState.x, 0, gameState.z);
    
    frame++;
  }

  function animate() {
    requestAnimationFrame(animate);
    
    update(1/60);
    
    // Render scene
    renderer.render(scene, camera);
    
    // Scale to display with nearest neighbor
    const scale = Math.min(
      displayCanvas.width / CONFIG.renderWidth,
      displayCanvas.height / CONFIG.renderHeight
    ) | 0;
    
    const offsetX = (displayCanvas.width - CONFIG.renderWidth * scale) / 2;
    const offsetY = (displayCanvas.height - CONFIG.renderHeight * scale) / 2;
    
    // Clear with transparent background
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    
    // Draw scaled game from WebGL canvas
    displayCtx.drawImage(
      renderer.domElement,
      0, 0, CONFIG.renderWidth, CONFIG.renderHeight,
      offsetX, offsetY,
      CONFIG.renderWidth * scale, CONFIG.renderHeight * scale
    );
    
    // MS Paint style UI
    drawUI(offsetX, offsetY, scale);
  }

  function drawUI(offsetX, offsetY, scale) {
    // Semi-transparent UI bar at top
    displayCtx.fillStyle = 'rgba(192, 192, 192, 0.9)';
    displayCtx.fillRect(offsetX, offsetY, CONFIG.renderWidth * scale, 30 * scale);
    
    displayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    displayCtx.fillRect(offsetX, offsetY + 2 * scale, CONFIG.renderWidth * scale, 26 * scale);
    
    // Text with MS Sans Serif style
    displayCtx.fillStyle = 'white';
    displayCtx.font = `${12 * scale}px "MS Sans Serif", Arial, sans-serif`;
    displayCtx.fillText(
      `Speed: ${Math.round(gameState.speed * 10)} | Collisions: ${gameState.collisions}`, 
      offsetX + 10 * scale, 
      offsetY + 20 * scale
    );
    
    // State indicator
    const distToBrowser = Math.sqrt(
      Math.pow(gameState.x - zones.browser.x, 2) + 
      Math.pow(gameState.z - zones.browser.z, 2)
    );
    
    let state = 'EXPLORING';
    if (distToBrowser < zones.browser.radius) {
      state = 'BROWSER COUNTRY';
      displayCtx.fillStyle = 'red';
    }
    
    displayCtx.fillText(
      state,
      offsetX + (CONFIG.renderWidth - 100) * scale,
      offsetY + 20 * scale
    );
  }

  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      document.body.classList.remove('game-active');
    }, 500);
  }

  // Start with error handling
  function startGame() {
    console.log('Starting game...');
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
    // Add a small delay to ensure Three.js is loaded
    setTimeout(startGame, 500);
  }
})();