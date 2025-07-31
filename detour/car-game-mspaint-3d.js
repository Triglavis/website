(() => {
  // MS Paint style 3D car game
  const CONFIG = {
    // Render at low resolution for chunky pixels
    renderWidth: 320,
    renderHeight: 240,
    
    // MS Paint colors
    colors: {
      black: 0x000000,
      white: 0xFFFFFF,
      gray: 0xC0C0C0,
      darkGray: 0x808080,
      red: 0xFF0000,
      blue: 0x0000FF,
      yellow: 0xFFFF00,
      green: 0x00FF00,
      road: 0x808080,
      grass: 0x00AA00,
      sky: 0x87CEEB
    },
    
    car: {
      maxSpeed: 10,
      acceleration: 15,
      turnSpeed: 3,
      friction: 0.95
    }
  };

  let scene, camera, renderer, renderTarget;
  let car, carModel;
  let canvas, ctx;
  let displayCanvas, displayCtx;
  
  // Game state
  let gameState = {
    speed: 0,
    angle: 0,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0
  };
  
  let keys = {};
  let frame = 0;

  // Create super simple car geometry
  function createCarModel() {
    const car = new THREE.Group();
    
    // Car body - VW Karmann-Ghia inspired shape
    const shape = new THREE.Shape();
    
    // Draw car profile (side view)
    shape.moveTo(-2, 0);
    shape.lineTo(-1.8, 0.3);  // Front curve
    shape.lineTo(-0.5, 0.5);  // Hood
    shape.lineTo(0.5, 0.6);   // Windshield
    shape.lineTo(1, 0.5);     // Roof
    shape.lineTo(1.8, 0.3);   // Rear window
    shape.lineTo(2, 0);       // Trunk
    shape.lineTo(-2, 0);      // Bottom
    
    const extrudeSettings = {
      depth: 2,
      bevelEnabled: false
    };
    
    const bodyGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const bodyMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.white,
      side: THREE.DoubleSide
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.3;
    body.position.z = -1;
    car.add(body);
    
    // Roof - smaller box
    const roofGeometry = new THREE.BoxGeometry(1.6, 0.6, 2);
    const roofMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.white
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 1.2;
    car.add(roof);
    
    // Windows - blue boxes
    const windowMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.blue
    });
    
    // Front window
    const frontWindow = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.4, 0.1),
      windowMaterial
    );
    frontWindow.position.set(0, 1.2, 0.95);
    car.add(frontWindow);
    
    // Side windows
    const sideWindow1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.4, 1.8),
      windowMaterial
    );
    sideWindow1.position.set(0.75, 1.2, 0);
    car.add(sideWindow1);
    
    const sideWindow2 = sideWindow1.clone();
    sideWindow2.position.x = -0.75;
    car.add(sideWindow2);
    
    // Wheels - black cylinders
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const wheelMaterial = new THREE.MeshBasicMaterial({ 
      color: CONFIG.colors.black
    });
    
    // Create 4 wheels
    const wheelPositions = [
      { x: 0.8, z: 1.2 },   // Front right
      { x: -0.8, z: 1.2 },  // Front left
      { x: 0.8, z: -1.2 },  // Rear right
      { x: -0.8, z: -1.2 }  // Rear left
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, 0.3, pos.z);
      car.add(wheel);
    });
    
    // Add black edges (MS Paint stroke effect)
    const edges = new THREE.EdgesGeometry(bodyGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: CONFIG.colors.black,
      linewidth: 2
    });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.y = 0.6;
    car.add(wireframe);
    
    return car;
  }

  // Create simple ground plane
  function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200, 20, 20);
    
    // Create checkerboard pattern
    const colors = [];
    const color = new THREE.Color();
    
    for (let i = 0; i < groundGeometry.attributes.position.count; i++) {
      const x = Math.floor(i % 21);
      const z = Math.floor(i / 21);
      
      // Road in the middle
      if (Math.abs(x - 10) < 3) {
        color.setHex(CONFIG.colors.road);
      } else {
        // Grass with checkerboard
        const checker = (x + z) % 2;
        color.setHex(checker ? CONFIG.colors.grass : CONFIG.colors.green);
      }
      
      colors.push(color.r, color.g, color.b);
    }
    
    groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const groundMaterial = new THREE.MeshBasicMaterial({ 
      vertexColors: true,
      side: THREE.DoubleSide
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    
    return ground;
  }

  function init() {
    // Get canvas
    displayCanvas = document.getElementById('carGameCanvas');
    displayCtx = displayCanvas.getContext('2d');
    
    // Create offscreen canvas for Three.js
    canvas = document.createElement('canvas');
    canvas.width = CONFIG.renderWidth;
    canvas.height = CONFIG.renderHeight;
    
    // Three.js setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.sky);
    
    // Orthographic camera for isometric view
    const aspect = CONFIG.renderWidth / CONFIG.renderHeight;
    const d = 20;
    camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect,
      d, -d,
      1, 1000
    );
    
    // Position camera for nice angle
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    
    // Renderer with no antialiasing for pixelated look
    renderer = new THREE.WebGLRenderer({ 
      canvas: canvas,
      antialias: false
    });
    renderer.setSize(CONFIG.renderWidth, CONFIG.renderHeight);
    renderer.setPixelRatio(1); // Force pixel ratio
    
    // Create render target for post-processing
    renderTarget = new THREE.WebGLRenderTarget(
      CONFIG.renderWidth, 
      CONFIG.renderHeight,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBFormat
      }
    );
    
    // Create scene objects
    carModel = createCarModel();
    scene.add(carModel);
    
    const ground = createGround();
    scene.add(ground);
    
    // Add some obstacles (simple boxes)
    for (let i = 0; i < 10; i++) {
      const obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial({ 
          color: Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.yellow 
        })
      );
      obstacle.position.set(
        Math.random() * 40 - 20,
        1,
        Math.random() * 40 - 20
      );
      scene.add(obstacle);
    }
    
    // Simple lighting (ambient only for flat look)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    
    // Setup controls
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') skipGame();
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    
    // Set display canvas size
    displayCanvas.width = window.innerWidth;
    displayCanvas.height = window.innerHeight;
    displayCtx.imageSmoothingEnabled = false;
    
    document.body.classList.add('game-active');
    
    // Start
    animate();
  }

  function update(deltaTime) {
    // Input
    let throttle = 0;
    let steering = 0;
    
    if (keys['w'] || keys['arrowup']) throttle = 1;
    if (keys['s'] || keys['arrowdown']) throttle = -0.5;
    if (keys['a'] || keys['arrowleft']) steering = -1;
    if (keys['d'] || keys['arrowright']) steering = 1;
    
    // Update speed
    gameState.speed += throttle * CONFIG.car.acceleration * deltaTime;
    gameState.speed *= CONFIG.car.friction;
    gameState.speed = Math.max(-5, Math.min(CONFIG.car.maxSpeed, gameState.speed));
    
    // Update angle
    if (Math.abs(gameState.speed) > 0.1) {
      gameState.angle += steering * CONFIG.car.turnSpeed * deltaTime * 
                         (gameState.speed / CONFIG.car.maxSpeed);
    }
    
    // Update position
    gameState.vx = Math.sin(gameState.angle) * gameState.speed;
    gameState.vz = Math.cos(gameState.angle) * gameState.speed;
    
    gameState.x += gameState.vx * deltaTime;
    gameState.z += gameState.vz * deltaTime;
    
    // Update car model
    carModel.position.x = gameState.x;
    carModel.position.z = gameState.z;
    carModel.rotation.y = -gameState.angle;
    
    // Camera follows car
    camera.position.x = gameState.x + 20;
    camera.position.z = gameState.z + 20;
    camera.lookAt(gameState.x, 0, gameState.z);
    
    frame++;
  }

  function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = 1/60;
    update(deltaTime);
    
    // Render to small canvas
    renderer.render(scene, camera);
    
    // Get pixel data and apply MS Paint effects
    const pixels = new Uint8Array(CONFIG.renderWidth * CONFIG.renderHeight * 4);
    renderer.readRenderTargetPixels(
      renderTarget, 
      0, 0, 
      CONFIG.renderWidth, CONFIG.renderHeight, 
      pixels
    );
    
    // Clear display canvas
    displayCtx.fillStyle = '#87CEEB';
    displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    
    // Scale up with nearest neighbor
    const scale = Math.min(
      displayCanvas.width / CONFIG.renderWidth,
      displayCanvas.height / CONFIG.renderHeight
    ) | 0; // Floor to integer for crisp pixels
    
    const offsetX = (displayCanvas.width - CONFIG.renderWidth * scale) / 2;
    const offsetY = (displayCanvas.height - CONFIG.renderHeight * scale) / 2;
    
    displayCtx.drawImage(
      canvas,
      0, 0, CONFIG.renderWidth, CONFIG.renderHeight,
      offsetX, offsetY, 
      CONFIG.renderWidth * scale, CONFIG.renderHeight * scale
    );
    
    // Draw UI with MS Paint font
    drawUI();
  }

  function drawUI() {
    displayCtx.fillStyle = 'black';
    displayCtx.fillRect(0, 0, displayCanvas.width, 60);
    
    displayCtx.fillStyle = 'white';
    displayCtx.font = '16px "MS Sans Serif", Arial, sans-serif';
    displayCtx.fillText(`Speed: ${Math.round(gameState.speed * 10)}`, 10, 20);
    displayCtx.fillText(`X: ${Math.round(gameState.x)} Z: ${Math.round(gameState.z)}`, 10, 40);
    displayCtx.fillText(`[W/S] Accel/Brake  [A/D] Steer  [ESC] Exit`, 200, 20);
  }

  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      document.body.classList.remove('game-active');
    }, 500);
  }

  // Start when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();