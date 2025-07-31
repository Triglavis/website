(() => {
  // SNES-style game configuration
  const CONFIG = {
    // SNES native resolution
    resolution: {
      width: 256,
      height: 224
    },
    
    // Scaling for modern displays
    scale: 3,
    
    // SNES color palette (15-bit RGB555)
    palette: {
      black: '#000000',
      white: '#FFFFFF',
      road: '#4A4A4A',
      grass: '#2D5016',
      sky: '#5B9BD5',
      car: {
        body: '#E8E8E8',
        trim: '#1A1A1A',
        glass: '#4A90E2',
        shadow: 'rgba(0,0,0,0.5)'
      }
    },
    
    // Sprite configuration
    sprites: {
      carSize: 24,
      angles: 16,
      shadowOffset: 4
    },
    
    // Mode 7 parameters
    mode7: {
      horizon: 0.45, // 45% down the screen
      fov: 200,
      cameraHeight: 24,
      drawDistance: 100
    },
    
    // Physics (keep our good physics!)
    physics: {
      gravity: 9.81,
      dt: 1/60
    }
  };

  // Game state
  let canvas, ctx, bufferCanvas, bufferCtx;
  let gameState = 'exploring';
  let audioCtx = null;
  
  // Sprite system
  const sprites = {
    car: null,
    tiles: null,
    particles: null
  };
  
  // Car state (from our VW physics)
  let car = {
    // Position
    x: 128,
    y: 160,
    z: 0, // Height for jumps
    
    // Velocity
    vx: 0,
    vy: 0,
    vz: 0,
    
    // Rotation
    angle: 0,
    angleVelocity: 0,
    
    // Sprite animation
    spriteAngle: 0,
    animFrame: 0,
    
    // Physics
    speed: 0,
    acceleration: 0,
    steerAngle: 0,
    
    // State
    isAirborne: false,
    isDrifting: false,
    gear: 1,
    rpm: 900,
    
    // Effects
    trail: [],
    collisions: 0
  };
  
  // World state
  let camera = {
    x: 128,
    y: 160,
    angle: 0,
    zoom: 1
  };
  
  let world = {
    tiles: [],
    obstacles: [],
    particles: []
  };
  
  let keys = {};
  let frame = 0;

  // Generate car sprites programmatically (until we have real sprites)
  function generateCarSprites() {
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = CONFIG.sprites.carSize * CONFIG.sprites.angles;
    spriteCanvas.height = CONFIG.sprites.carSize;
    const spriteCtx = spriteCanvas.getContext('2d');
    
    // Draw car at each angle
    for (let i = 0; i < CONFIG.sprites.angles; i++) {
      const angle = (i / CONFIG.sprites.angles) * Math.PI * 2;
      const x = i * CONFIG.sprites.carSize + CONFIG.sprites.carSize / 2;
      const y = CONFIG.sprites.carSize / 2;
      
      spriteCtx.save();
      spriteCtx.translate(x, y);
      spriteCtx.rotate(angle);
      
      // Draw simple car shape (top-down view)
      // Body
      spriteCtx.fillStyle = CONFIG.palette.car.body;
      spriteCtx.fillRect(-8, -4, 16, 8);
      
      // Hood/Trunk curves (Karmann-Ghia style)
      spriteCtx.beginPath();
      spriteCtx.ellipse(6, 0, 4, 4, 0, -Math.PI/2, Math.PI/2);
      spriteCtx.fill();
      spriteCtx.beginPath();
      spriteCtx.ellipse(-6, 0, 4, 4, 0, Math.PI/2, -Math.PI/2);
      spriteCtx.fill();
      
      // Windows
      spriteCtx.fillStyle = CONFIG.palette.car.glass;
      spriteCtx.fillRect(-3, -2, 6, 4);
      
      // Wheels
      spriteCtx.fillStyle = CONFIG.palette.car.trim;
      spriteCtx.fillRect(-7, -5, 3, 2);
      spriteCtx.fillRect(-7, 3, 3, 2);
      spriteCtx.fillRect(4, -5, 3, 2);
      spriteCtx.fillRect(4, 3, 3, 2);
      
      // Details
      spriteCtx.strokeStyle = CONFIG.palette.car.trim;
      spriteCtx.lineWidth = 0.5;
      spriteCtx.strokeRect(-8, -4, 16, 8);
      
      spriteCtx.restore();
    }
    
    return spriteCanvas;
  }
  
  // Mode 7 ground rendering
  function drawMode7Ground(ctx) {
    const { horizon, fov, cameraHeight, drawDistance } = CONFIG.mode7;
    const horizonY = Math.floor(ctx.canvas.height * horizon);
    
    // Clear ground area
    ctx.fillStyle = CONFIG.palette.grass;
    ctx.fillRect(0, horizonY, ctx.canvas.width, ctx.canvas.height - horizonY);
    
    // For each scanline from horizon to bottom
    for (let y = horizonY; y < ctx.canvas.height; y++) {
      const relY = y - horizonY;
      const distance = (cameraHeight * fov) / relY;
      
      if (distance > drawDistance) continue;
      
      // Calculate world position for this scanline
      const worldX = camera.x - Math.sin(camera.angle) * distance;
      const worldY = camera.y - Math.cos(camera.angle) * distance;
      
      // Draw road
      const roadWidth = 32;
      const roadLeft = ctx.canvas.width / 2 - (roadWidth * fov / distance) / 2;
      const roadRight = ctx.canvas.width / 2 + (roadWidth * fov / distance) / 2;
      
      // Road surface
      ctx.fillStyle = CONFIG.palette.road;
      ctx.fillRect(roadLeft, y, roadRight - roadLeft, 1);
      
      // Road markings (dashed center line)
      if (Math.floor(worldY / 8) % 2 === 0) {
        ctx.fillStyle = CONFIG.palette.white;
        const centerX = ctx.canvas.width / 2;
        ctx.fillRect(centerX - 1, y, 2, 1);
      }
      
      // Checkerboard pattern on sides
      const checker = (Math.floor(worldX / 16) + Math.floor(worldY / 16)) % 2;
      if (checker) {
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(roadLeft - 8, y, 8, 1);
        ctx.fillRect(roadRight, y, 8, 1);
      }
    }
  }
  
  // Sprite sorting and rendering
  function drawSprites(ctx) {
    // Collect all sprites
    const allSprites = [];
    
    // Add car
    allSprites.push({
      x: car.x,
      y: car.y,
      z: car.z,
      sprite: 'car',
      angle: car.spriteAngle
    });
    
    // Add obstacles
    world.obstacles.forEach(obs => {
      allSprites.push({
        x: obs.x,
        y: obs.y,
        z: 0,
        sprite: 'obstacle',
        type: obs.type
      });
    });
    
    // Sort by Y position (and Z for airborne objects)
    allSprites.sort((a, b) => {
      const aDepth = a.y + a.z * 100;
      const bDepth = b.y + b.z * 100;
      return aDepth - bDepth;
    });
    
    // Draw each sprite
    allSprites.forEach(sprite => {
      drawSprite(ctx, sprite);
    });
  }
  
  function drawSprite(ctx, sprite) {
    // Convert world to screen coordinates
    const relX = sprite.x - camera.x;
    const relY = sprite.y - camera.y;
    
    // Simple orthographic projection for now
    const screenX = ctx.canvas.width / 2 + relX;
    const screenY = ctx.canvas.height / 2 - relY + sprite.z;
    
    if (sprite.sprite === 'car') {
      // Draw shadow first
      if (sprite.z > 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = CONFIG.palette.car.shadow;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + CONFIG.sprites.shadowOffset + sprite.z, 
                    12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      
      // Calculate sprite frame based on angle
      const angleIndex = Math.floor(((sprite.angle + Math.PI * 2) % (Math.PI * 2)) / 
                                   (Math.PI * 2) * CONFIG.sprites.angles);
      
      // Draw car sprite
      if (sprites.car) {
        ctx.drawImage(
          sprites.car,
          angleIndex * CONFIG.sprites.carSize, 0,
          CONFIG.sprites.carSize, CONFIG.sprites.carSize,
          screenX - CONFIG.sprites.carSize / 2,
          screenY - CONFIG.sprites.carSize / 2 - sprite.z,
          CONFIG.sprites.carSize, CONFIG.sprites.carSize
        );
      }
    }
    
    // Draw other sprite types...
  }
  
  // Initialize SNES-style renderer
  function init() {
    // Create main canvas
    canvas = document.getElementById('carGameCanvas');
    ctx = canvas.getContext('2d');
    
    // Create buffer canvas at SNES resolution
    bufferCanvas = document.createElement('canvas');
    bufferCanvas.width = CONFIG.resolution.width;
    bufferCanvas.height = CONFIG.resolution.height;
    bufferCtx = bufferCanvas.getContext('2d');
    
    // Pixel perfect rendering
    ctx.imageSmoothingEnabled = false;
    bufferCtx.imageSmoothingEnabled = false;
    
    // Set canvas size
    canvas.width = CONFIG.resolution.width * CONFIG.scale;
    canvas.height = CONFIG.resolution.height * CONFIG.scale;
    
    // Generate sprites
    sprites.car = generateCarSprites();
    
    // Setup controls
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') skipGame();
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    
    document.body.classList.add('game-active');
    
    // Start game loop
    gameLoop();
  }
  
  // Update physics (simplified for now)
  function update() {
    const dt = CONFIG.physics.dt;
    
    // Input handling
    let throttle = 0;
    let steering = 0;
    
    if (keys['w'] || keys['arrowup']) throttle = 1;
    if (keys['s'] || keys['arrowdown']) throttle = -0.5;
    if (keys['a'] || keys['arrowleft']) steering = -1;
    if (keys['d'] || keys['arrowright']) steering = 1;
    
    // Simple car physics
    car.acceleration = throttle * 100;
    car.speed += car.acceleration * dt;
    car.speed *= 0.95; // Friction
    
    // Steering
    if (Math.abs(car.speed) > 1) {
      car.angleVelocity = steering * 2 * (car.speed / 100);
      car.angle += car.angleVelocity * dt;
    }
    
    // Update position
    car.vx = Math.sin(car.angle) * car.speed;
    car.vy = Math.cos(car.angle) * car.speed;
    
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    
    // Update sprite angle (quantized to 16 directions)
    car.spriteAngle = car.angle;
    
    // Camera follows car
    camera.x = car.x;
    camera.y = car.y;
    
    frame++;
  }
  
  // Main game loop
  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  function draw() {
    // Clear buffer
    bufferCtx.fillStyle = CONFIG.palette.sky;
    bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    
    // Draw Mode 7 ground
    drawMode7Ground(bufferCtx);
    
    // Draw sprites
    drawSprites(bufferCtx);
    
    // Draw UI
    drawUI(bufferCtx);
    
    // Scale buffer to display
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bufferCanvas, 0, 0, canvas.width, canvas.height);
  }
  
  function drawUI(ctx) {
    ctx.fillStyle = CONFIG.palette.white;
    ctx.font = '8px monospace';
    ctx.fillText(`GEAR: ${car.gear}`, 4, 10);
    ctx.fillText(`SPEED: ${Math.round(car.speed)}`, 4, 20);
  }
  
  function skipGame() {
    const gameContainer = document.getElementById('carGameContainer');
    gameContainer.style.opacity = '0';
    setTimeout(() => {
      gameContainer.style.display = 'none';
      document.body.classList.remove('game-active');
    }, 500);
  }
  
  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();