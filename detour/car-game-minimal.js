(() => {
  // Game configuration
  const CONFIG = {
    canvas: {
      pixelSize: 8,
      gridSize: 16,
      colors: {
        bg: '#000000',
        fg: '#ffffff'
      }
    },
    car: {
      size: 1, // Grid units
      speed: 0,
      maxSpeed: 0.3,
      acceleration: 0.02,
      friction: 0.9
    }
  };

  // Game state
  let canvas, ctx, audioCtx;
  let gameState = 'exploring';
  let gridWidth, gridHeight;
  let car = {
    x: 5,
    y: 10,
    vx: 0,
    vy: 0,
    facing: 'right', // up, down, left, right
    symbol: '♠',
    collisions: 0,
    trail: []
  };
  let goal = {
    x: 25,
    y: 10,
    symbol: '♦',
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
    
    sounds = {
      move: () => playTone(200, 0.05, 'square', 0.1),
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
      }
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
    
    // Start with some obstacles
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
    
    // Handle input
    let dx = 0, dy = 0;
    
    if (keys['arrowup'] || keys['w']) {
      dy = -1;
      car.facing = 'up';
    }
    if (keys['arrowdown'] || keys['s']) {
      dy = 1;
      car.facing = 'down';
    }
    if (keys['arrowleft'] || keys['a']) {
      dx = -1;
      car.facing = 'left';
    }
    if (keys['arrowright'] || keys['d']) {
      dx = 1;
      car.facing = 'right';
    }
    
    // Apply movement
    if (dx !== 0 || dy !== 0) {
      car.vx += dx * CONFIG.car.acceleration;
      car.vy += dy * CONFIG.car.acceleration;
    }
    
    // Apply friction
    car.vx *= CONFIG.car.friction;
    car.vy *= CONFIG.car.friction;
    
    // Limit speed
    const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    if (speed > CONFIG.car.maxSpeed) {
      car.vx = (car.vx / speed) * CONFIG.car.maxSpeed;
      car.vy = (car.vy / speed) * CONFIG.car.maxSpeed;
    }
    
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
      sounds.move && sounds.move();
      
      // Add to trail
      car.trail.push({ x: oldX, y: oldY, life: 10 });
      if (car.trail.length > 20) car.trail.shift();
    }
    
    // Update trail
    car.trail = car.trail.filter(t => {
      t.life--;
      return t.life > 0;
    });
    
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
      p.life--;
      return p.life > 0;
    });
    
    // Update obstacles
    obstacles.forEach(o => {
      o.phase = (o.phase + 0.05) % (Math.PI * 2);
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
        for (let i = 0; i < 4; i++) {
          particles.push({
            x: car.x,
            y: car.y,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 20,
            symbol: ['!', '#', '*', '×'][Math.floor(Math.random() * 4)]
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
    
    for (let i = 0; i < 8; i++) {
      obstacles.push({
        x: Math.floor(Math.random() * (gridWidth - 10)) + 5,
        y: Math.floor(Math.random() * (gridHeight - 4)) + 2,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        phase: Math.random() * Math.PI * 2
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
      car.symbol = '★';
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
    
    // Draw grid
    ctx.strokeStyle = CONFIG.canvas.colors.fg;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;
    
    const size = CONFIG.canvas.gridSize;
    for (let x = 0; x <= gridWidth; x++) {
      ctx.beginPath();
      ctx.moveTo(x * size, 0);
      ctx.lineTo(x * size, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= gridHeight; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * size);
      ctx.lineTo(canvas.width, y * size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    // Draw trail
    ctx.fillStyle = CONFIG.canvas.colors.fg;
    ctx.font = `${CONFIG.canvas.gridSize * 0.5}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    car.trail.forEach(t => {
      ctx.globalAlpha = t.life / 10 * 0.3;
      ctx.fillText('·', t.x * size + size/2, t.y * size + size/2);
    });
    ctx.globalAlpha = 1;
    
    // Draw obstacles
    obstacles.forEach(obs => {
      if (obs.x < 0) return;
      
      const wobble = Math.sin(obs.phase) * 2;
      ctx.font = `${CONFIG.canvas.gridSize * 0.8}px monospace`;
      ctx.fillText(
        obs.symbol,
        obs.x * size + size/2,
        obs.y * size + size/2 + wobble
      );
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
    
    // Draw car
    ctx.font = `${CONFIG.canvas.gridSize}px monospace`;
    const carSymbol = {
      up: '▲',
      down: '▼',
      left: '◄',
      right: '►'
    }[car.facing] || car.symbol;
    
    ctx.fillText(
      car.symbol === '★' ? '★' : carSymbol,
      car.x * size + size/2,
      car.y * size + size/2
    );
    
    // Draw UI
    drawUI();
    
    // Restore context if distorted
    if (CONFIG.effects.distortionAmount > 0.01) {
      ctx.restore();
    }
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
    ctx.fillText(`STATE: ${gameState.toUpperCase()}`, size * 10, size * 0.5);
    
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