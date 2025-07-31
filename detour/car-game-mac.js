(() => {
  // Macintosh-style monochrome car game
  const CONFIG = {
    // Smaller canvas for overlay effect
    canvasWidth: 600,
    canvasHeight: 400,
    
    // Monochrome palette
    colors: {
      black: '#000000',
      white: '#FFFFFF',
      gray1: '#555555',  // 33% gray
      gray2: '#AAAAAA',  // 66% gray
      pattern: null      // Will be created for dithering
    },
    
    // Smaller car size (25% reduction)
    car: {
      width: 30,
      height: 15,
      speed: 0,
      maxSpeed: 200,
      acceleration: 300,
      friction: 0.92,
      turnSpeed: 3,
      x: 300,
      y: 300,
      angle: 0,
      vx: 0,
      vy: 0
    },
    
    // Game settings
    game: {
      roadWidth: 120,
      roadMarkingWidth: 4,
      obstacleSize: 20,
      dotSize: 2  // Mac pixel size
    }
  };

  let canvas, ctx;
  let keys = {};
  let obstacles = [];
  let particles = [];
  let trail = [];
  let frame = 0;
  let gameActive = true;

  // Create dither pattern
  function createDitherPattern() {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 2;
    patternCanvas.height = 2;
    const patternCtx = patternCanvas.getContext('2d');
    
    // Classic Mac dither pattern
    patternCtx.fillStyle = CONFIG.colors.white;
    patternCtx.fillRect(0, 0, 2, 2);
    patternCtx.fillStyle = CONFIG.colors.black;
    patternCtx.fillRect(0, 0, 1, 1);
    patternCtx.fillRect(1, 1, 1, 1);
    
    return ctx.createPattern(patternCanvas, 'repeat');
  }

  // Draw car with Mac-style graphics
  function drawCar() {
    ctx.save();
    ctx.translate(CONFIG.car.x, CONFIG.car.y);
    ctx.rotate(CONFIG.car.angle);
    
    // Car shadow (dithered)
    ctx.fillStyle = CONFIG.colors.pattern;
    ctx.fillRect(-CONFIG.car.width/2 + 2, -CONFIG.car.height/2 + 2, CONFIG.car.width, CONFIG.car.height);
    
    // Car body (white with black outline)
    ctx.fillStyle = CONFIG.colors.white;
    ctx.fillRect(-CONFIG.car.width/2, -CONFIG.car.height/2, CONFIG.car.width, CONFIG.car.height);
    ctx.strokeStyle = CONFIG.colors.black;
    ctx.lineWidth = 2;
    ctx.strokeRect(-CONFIG.car.width/2, -CONFIG.car.height/2, CONFIG.car.width, CONFIG.car.height);
    
    // Windows (simple black rectangles)
    ctx.fillStyle = CONFIG.colors.black;
    ctx.fillRect(-CONFIG.car.width/4, -CONFIG.car.height/3, CONFIG.car.width/2, CONFIG.car.height/3);
    
    // Wheels (black dots)
    const wheelOffset = CONFIG.car.width/3;
    ctx.fillRect(-wheelOffset, -CONFIG.car.height/2 - 2, 4, 4);
    ctx.fillRect(wheelOffset - 4, -CONFIG.car.height/2 - 2, 4, 4);
    ctx.fillRect(-wheelOffset, CONFIG.car.height/2 - 2, 4, 4);
    ctx.fillRect(wheelOffset - 4, CONFIG.car.height/2 - 2, 4, 4);
    
    ctx.restore();
  }

  // Draw Mac-style road
  function drawRoad() {
    // Road surface (dithered gray)
    ctx.fillStyle = CONFIG.colors.pattern;
    ctx.fillRect(CONFIG.canvasWidth/2 - CONFIG.game.roadWidth/2, 0, CONFIG.game.roadWidth, CONFIG.canvasHeight);
    
    // Road edges (solid black)
    ctx.fillStyle = CONFIG.colors.black;
    ctx.fillRect(CONFIG.canvasWidth/2 - CONFIG.game.roadWidth/2 - 4, 0, 4, CONFIG.canvasHeight);
    ctx.fillRect(CONFIG.canvasWidth/2 + CONFIG.game.roadWidth/2, 0, 4, CONFIG.canvasHeight);
    
    // Center line (dashed)
    ctx.strokeStyle = CONFIG.colors.white;
    ctx.lineWidth = CONFIG.game.roadMarkingWidth;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(CONFIG.canvasWidth/2, 0);
    ctx.lineTo(CONFIG.canvasWidth/2, CONFIG.canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw obstacles Mac-style
  function drawObstacles() {
    obstacles.forEach(obstacle => {
      // Shadow
      ctx.fillStyle = CONFIG.colors.pattern;
      ctx.fillRect(obstacle.x + 2, obstacle.y + 2, CONFIG.game.obstacleSize, CONFIG.game.obstacleSize);
      
      // Obstacle (white with black outline)
      ctx.fillStyle = CONFIG.colors.white;
      ctx.fillRect(obstacle.x, obstacle.y, CONFIG.game.obstacleSize, CONFIG.game.obstacleSize);
      ctx.strokeStyle = CONFIG.colors.black;
      ctx.lineWidth = 2;
      ctx.strokeRect(obstacle.x, obstacle.y, CONFIG.game.obstacleSize, CONFIG.game.obstacleSize);
      
      // Pattern inside
      ctx.fillStyle = CONFIG.colors.black;
      ctx.fillRect(obstacle.x + 4, obstacle.y + 4, 4, 4);
      ctx.fillRect(obstacle.x + 12, obstacle.y + 4, 4, 4);
      ctx.fillRect(obstacle.x + 4, obstacle.y + 12, 4, 4);
      ctx.fillRect(obstacle.x + 12, obstacle.y + 12, 4, 4);
    });
  }

  // Draw particles Mac-style
  function drawParticles() {
    particles.forEach(particle => {
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, CONFIG.game.dotSize, CONFIG.game.dotSize);
    });
  }

  // Draw trail
  function drawTrail() {
    trail.forEach((point, i) => {
      const opacity = i / trail.length;
      ctx.fillStyle = opacity > 0.5 ? CONFIG.colors.black : CONFIG.colors.pattern;
      ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
    });
  }

  // Initialize game
  function init() {
    // Create canvas
    canvas = document.getElementById('carGameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = CONFIG.canvasWidth;
    canvas.height = CONFIG.canvasHeight;
    
    // Disable antialiasing for crisp pixels
    ctx.imageSmoothingEnabled = false;
    
    // Create dither pattern
    CONFIG.colors.pattern = createDitherPattern();
    
    // Create initial obstacles
    for (let i = 0; i < 5; i++) {
      obstacles.push({
        x: Math.random() * (CONFIG.canvasWidth - CONFIG.game.obstacleSize),
        y: Math.random() * CONFIG.canvasHeight - CONFIG.canvasHeight,
        speed: 50 + Math.random() * 100
      });
    }
    
    // Setup controls
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') skipGame();
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    
    // Start game loop
    document.body.classList.add('game-active');
    gameLoop();
  }

  // Update game state
  function update(deltaTime) {
    if (!gameActive) return;
    
    // Input
    let throttle = 0;
    let steering = 0;
    
    if (keys['w'] || keys['arrowup']) throttle = 1;
    if (keys['s'] || keys['arrowdown']) throttle = -0.5;
    if (keys['a'] || keys['arrowleft']) steering = -1;
    if (keys['d'] || keys['arrowright']) steering = 1;
    
    // Update car physics
    CONFIG.car.speed += throttle * CONFIG.car.acceleration * deltaTime;
    CONFIG.car.speed *= CONFIG.car.friction;
    CONFIG.car.speed = Math.max(-CONFIG.car.maxSpeed/2, Math.min(CONFIG.car.maxSpeed, CONFIG.car.speed));
    
    // Steering
    if (Math.abs(CONFIG.car.speed) > 10) {
      CONFIG.car.angle += steering * CONFIG.car.turnSpeed * deltaTime * (CONFIG.car.speed / CONFIG.car.maxSpeed);
    }
    
    // Update position
    CONFIG.car.vx = Math.sin(CONFIG.car.angle) * CONFIG.car.speed;
    CONFIG.car.vy = Math.cos(CONFIG.car.angle) * CONFIG.car.speed;
    
    CONFIG.car.x += CONFIG.car.vx * deltaTime;
    CONFIG.car.y -= CONFIG.car.vy * deltaTime;
    
    // Keep car on screen
    CONFIG.car.x = Math.max(CONFIG.car.width/2, Math.min(CONFIG.canvasWidth - CONFIG.car.width/2, CONFIG.car.x));
    CONFIG.car.y = Math.max(CONFIG.car.height/2, Math.min(CONFIG.canvasHeight - CONFIG.car.height/2, CONFIG.car.y));
    
    // Update trail
    if (CONFIG.car.speed > 20 && frame % 2 === 0) {
      trail.push({ x: CONFIG.car.x, y: CONFIG.car.y });
      if (trail.length > 20) trail.shift();
    }
    
    // Update obstacles
    obstacles.forEach(obstacle => {
      obstacle.y += obstacle.speed * deltaTime;
      
      // Reset obstacle when it goes off screen
      if (obstacle.y > CONFIG.canvasHeight) {
        obstacle.y = -CONFIG.game.obstacleSize;
        obstacle.x = Math.random() * (CONFIG.canvasWidth - CONFIG.game.obstacleSize);
        obstacle.speed = 50 + Math.random() * 100;
      }
      
      // Check collision
      if (Math.abs(CONFIG.car.x - (obstacle.x + CONFIG.game.obstacleSize/2)) < (CONFIG.car.width + CONFIG.game.obstacleSize)/2 &&
          Math.abs(CONFIG.car.y - (obstacle.y + CONFIG.game.obstacleSize/2)) < (CONFIG.car.height + CONFIG.game.obstacleSize)/2) {
        // Collision!
        CONFIG.car.speed *= -0.5;
        
        // Create particles
        for (let i = 0; i < 5; i++) {
          particles.push({
            x: CONFIG.car.x,
            y: CONFIG.car.y,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100,
            life: 1,
            color: i % 2 === 0 ? CONFIG.colors.black : CONFIG.colors.white
          });
        }
      }
    });
    
    // Update particles
    particles = particles.filter(particle => {
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.life -= deltaTime * 2;
      return particle.life > 0;
    });
    
    frame++;
  }

  // Main game loop
  let lastTime = 0;
  function gameLoop(currentTime = 0) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Clear with white
    ctx.fillStyle = CONFIG.colors.white;
    ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    
    // Draw game elements
    drawRoad();
    drawTrail();
    drawObstacles();
    drawCar();
    drawParticles();
    
    // Draw UI
    drawUI();
    
    // Update
    if (deltaTime < 0.1) { // Prevent huge deltas
      update(deltaTime || 1/60);
    }
    
    requestAnimationFrame(gameLoop);
  }

  // Draw Mac-style UI
  function drawUI() {
    // UI bar at top
    ctx.fillStyle = CONFIG.colors.black;
    ctx.fillRect(0, 0, CONFIG.canvasWidth, 20);
    
    // White text
    ctx.fillStyle = CONFIG.colors.white;
    ctx.font = '12px Chicago, Courier, monospace';
    ctx.fillText(`Speed: ${Math.round(CONFIG.car.speed)}`, 10, 14);
    ctx.fillText(`Score: ${Math.round(frame / 10)}`, CONFIG.canvasWidth - 100, 14);
    
    // Instructions
    if (frame < 180) { // Show for 3 seconds
      ctx.fillStyle = CONFIG.colors.black;
      ctx.fillRect(CONFIG.canvasWidth/2 - 100, CONFIG.canvasHeight/2 - 20, 200, 40);
      ctx.fillStyle = CONFIG.colors.white;
      ctx.fillRect(CONFIG.canvasWidth/2 - 98, CONFIG.canvasHeight/2 - 18, 196, 36);
      ctx.fillStyle = CONFIG.colors.black;
      ctx.font = '12px Chicago, Courier, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Use WASD or Arrow Keys', CONFIG.canvasWidth/2, CONFIG.canvasHeight/2 - 4);
      ctx.fillText('ESC to skip', CONFIG.canvasWidth/2, CONFIG.canvasHeight/2 + 10);
      ctx.textAlign = 'left';
    }
  }

  function skipGame() {
    gameActive = false;
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