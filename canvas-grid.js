(() => {
  const SYMBOL = '∴';
  const CELL_SIZE = 30;
  const HOVER_RADIUS = 60;
  
  let canvas, ctx;
  let width, height;
  let cols, rows;
  let mouseX = -1000;
  let mouseY = -1000;
  let waves = [];
  let animationId = null;
  let isDarkMode = false;
  
  // Pressure interaction state
  let isPressing = false;
  let pressStartTime = 0;
  let pressPower = 0;
  let depressionRadius = 0;
  let logoSpring = { position: 0, velocity: 0 };
  
  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let logoPosition = { x: 0, y: 0 };
  let logoVelocity = { x: 0, y: 0 };
  let lastDragTime = 0;
  let hasMoved = false;
  
  // Mobile tap fade state
  let isMobile = false;
  let tapFadeIntensity = 0;
  let tapFadeX = -1000;
  let tapFadeY = -1000;
  
  // Pre-rendered symbol cache
  let symbolCache = {};
  
  // Colors
  const colors = {
    light: {
      off: 'rgba(245, 245, 245, 0.3)',
      partial: 'rgba(204, 204, 204, 0.7)',
      on: 'rgba(153, 153, 153, 1)'
    },
    dark: {
      off: 'rgba(17, 17, 17, 0.3)',
      partial: 'rgba(51, 51, 51, 0.7)',
      on: 'rgba(102, 102, 102, 1)'
    }
  };

  function init() {
    canvas = document.getElementById('pixelCanvas');
    ctx = canvas.getContext('2d', { alpha: true });
    
    // Set up high DPI canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Detect mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                ('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0);
    
    updateCanvasSize();
    detectColorScheme();
    cacheSymbols();
    
    // Event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    // Mobile touch events for canvas
    if (isMobile) {
      canvas.addEventListener('touchstart', handleCanvasTap);
    }
    
    const logoWrapper = document.getElementById('logoWrapper');
    logoWrapper.addEventListener('mousedown', handlePressStart);
    logoWrapper.addEventListener('mouseup', handlePressEnd);
    logoWrapper.addEventListener('mouseleave', handleDragEnd);
    logoWrapper.addEventListener('touchstart', handlePressStart);
    logoWrapper.addEventListener('touchend', handlePressEnd);
    
    // Drag events
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('touchmove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    
    window.addEventListener('resize', debounce(updateCanvasSize, 250));
    
    // Watch for color scheme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        isDarkMode = e.matches;
        cacheSymbols();
      });
    }
    
    // Start animation loop
    animate();
  }

  function updateCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    ctx.scale(dpr, dpr);
    
    cols = Math.ceil(width / CELL_SIZE);
    rows = Math.ceil(height / CELL_SIZE);
  }

  function detectColorScheme() {
    isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function cacheSymbols() {
    const sizes = [1, 1.1, 1.2, 1.5];
    const colorSet = isDarkMode ? colors.dark : colors.light;
    
    symbolCache = {};
    
    sizes.forEach(scale => {
      ['off', 'partial', 'on'].forEach(state => {
        const key = `${scale}-${state}`;
        const offscreenCanvas = document.createElement('canvas');
        const size = CELL_SIZE * scale;
        offscreenCanvas.width = size;
        offscreenCanvas.height = size;
        const offCtx = offscreenCanvas.getContext('2d');
        
        offCtx.font = `${16 * scale}px system-ui, -apple-system, sans-serif`;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.fillStyle = colorSet[state];
        offCtx.fillText(SYMBOL, size / 2, size / 2);
        
        symbolCache[key] = offscreenCanvas;
      });
    });
  }

  function animate() {
    // Clear with transparent background
    ctx.clearRect(0, 0, width, height);
    
    // Update spring physics for logo position (elastic bands from corners)
    if (!isDragging && (Math.abs(logoPosition.x) > 0.1 || Math.abs(logoPosition.y) > 0.1)) {
      // Four corner springs pulling back to center
      const springK = 0.15;
      const damping = 0.88;
      
      // Calculate spring forces from each corner
      const cornerForces = [
        { x: -width/2 - logoPosition.x, y: -height/2 - logoPosition.y }, // Top-left
        { x: width/2 - logoPosition.x, y: -height/2 - logoPosition.y },  // Top-right
        { x: -width/2 - logoPosition.x, y: height/2 - logoPosition.y },  // Bottom-left
        { x: width/2 - logoPosition.x, y: height/2 - logoPosition.y }    // Bottom-right
      ];
      
      // Average the forces (simulates equal-strength elastic bands)
      let totalForceX = 0, totalForceY = 0;
      cornerForces.forEach(force => {
        const distance = Math.hypot(force.x, force.y);
        const normalizedX = force.x / distance;
        const normalizedY = force.y / distance;
        totalForceX += normalizedX * distance * springK / 4;
        totalForceY += normalizedY * distance * springK / 4;
      });
      
      logoVelocity.x += totalForceX;
      logoVelocity.y += totalForceY;
      logoVelocity.x *= damping;
      logoVelocity.y *= damping;
      
      logoPosition.x += logoVelocity.x;
      logoPosition.y += logoVelocity.y;
      
      // Create trail waves as it springs back
      if (Math.hypot(logoVelocity.x, logoVelocity.y) > 2) {
        const now = performance.now();
        if (now - lastDragTime > 50) { // Limit wave frequency
          const canvasRect = canvas.getBoundingClientRect();
          const waveX = canvasRect.width / 2 + logoPosition.x;
          const waveY = canvasRect.height / 2 + logoPosition.y;
          
          waves.push({
            x: waveX,
            y: waveY,
            startTime: now,
            duration: 800,
            maxRadius: Math.hypot(width, height),
            thickness: 40,
            power: 0.3
          });
          lastDragTime = now;
        }
      }
    }
    
    // Update spring physics for logo scale (press effect)
    if (!isPressing && Math.abs(logoSpring.position) > 0.001) {
      const springK = 0.3;
      const damping = 0.85;
      logoSpring.velocity += -logoSpring.position * springK;
      logoSpring.velocity *= damping;
      logoSpring.position += logoSpring.velocity;
    }
    
    // Apply transform to logo
    const logo = document.querySelector('.logo-wrapper');
    if (logo) {
      const scale = 1 + logoSpring.position * 0.2;
      logo.style.transform = `translate(${logoPosition.x}px, ${logoPosition.y}px) scale(${scale})`;
    }
    
    // Update depression effect during press (even while dragging)
    if (isPressing) {
      const elapsed = performance.now() - pressStartTime;
      const rawPower = Math.min(elapsed / 2000, 1);
      pressPower = Math.sqrt(rawPower);
      depressionRadius = pressPower * 300;
      
      // Push logo "into" the page
      logoSpring.position = -pressPower * 0.5;
    }
    
    // Create intensity map for all cells
    const intensityMap = new Float32Array(cols * rows);
    
    // Calculate wave intensities
    const now = performance.now();
    waves = waves.filter(wave => {
      const elapsed = now - wave.startTime;
      const progress = Math.min(elapsed / wave.duration, 1);
      
      if (progress >= 1) return false;
      
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRadius = eased * wave.maxRadius;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cellX = col * CELL_SIZE + CELL_SIZE / 2;
          const cellY = row * CELL_SIZE + CELL_SIZE / 2;
          const distance = Math.hypot(cellX - wave.x, cellY - wave.y);
          
          if (Math.abs(distance - currentRadius) <= wave.thickness) {
            const wavePos = 1 - Math.abs(distance - currentRadius) / wave.thickness;
            const intensity = Math.pow(Math.cos((1 - wavePos) * Math.PI / 2), 2) * (wave.power || 1);
            const index = row * cols + col;
            intensityMap[index] = Math.max(intensityMap[index], intensity);
          }
        }
      }
      
      return true;
    });
    
    // Calculate depression effect during press (including while dragging)
    if (isPressing && depressionRadius > 0) {
      // Depression effect follows the logo position
      const centerX = width / 2 + logoPosition.x;
      const centerY = height / 2 + logoPosition.y;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cellX = col * CELL_SIZE + CELL_SIZE / 2;
          const cellY = row * CELL_SIZE + CELL_SIZE / 2;
          const distance = Math.hypot(cellX - centerX, cellY - centerY);
          
          if (distance < depressionRadius) {
            const normalized = distance / depressionRadius;
            const index = row * cols + col;
            const depressionIntensity = (1 - normalized) * pressPower;
            intensityMap[index] = Math.max(intensityMap[index], depressionIntensity);
          }
        }
      }
    } else if (isDragging && !isPressing) {
      // Lighter effect for dragging
      const centerX = width / 2 + logoPosition.x;
      const centerY = height / 2 + logoPosition.y;
      const effectRadius = 120;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cellX = col * CELL_SIZE + CELL_SIZE / 2;
          const cellY = row * CELL_SIZE + CELL_SIZE / 2;
          const distance = Math.hypot(cellX - centerX, cellY - centerY);
          
          if (distance < effectRadius) {
            const normalized = distance / effectRadius;
            const index = row * cols + col;
            const intensity = (1 - normalized) * 0.5;
            intensityMap[index] = Math.max(intensityMap[index], intensity);
          }
        }
      }
    }
    
    // Calculate hover intensities if no waves and not pressing
    if (waves.length === 0 && !isPressing) {
      // Mobile tap fade effect
      if (isMobile && tapFadeIntensity > 0) {
        tapFadeIntensity *= 0.95; // Fade out
        
        if (tapFadeIntensity > 0.01) {
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cellX = col * CELL_SIZE + CELL_SIZE / 2;
              const cellY = row * CELL_SIZE + CELL_SIZE / 2;
              const distance = Math.hypot(cellX - tapFadeX, cellY - tapFadeY);
              
              if (distance < HOVER_RADIUS) {
                const normalized = distance / HOVER_RADIUS;
                const index = row * cols + col;
                let intensity;
                if (normalized < 0.5) {
                  intensity = 1;
                } else {
                  intensity = 1 - (normalized - 0.5) * 2;
                }
                intensityMap[index] = Math.max(intensityMap[index], intensity * tapFadeIntensity);
              }
            }
          }
        }
      }
      
      // Regular hover for desktop
      if (!isMobile && mouseX > -1 && mouseY > -1) {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cellX = col * CELL_SIZE + CELL_SIZE / 2;
            const cellY = row * CELL_SIZE + CELL_SIZE / 2;
            const distance = Math.hypot(cellX - mouseX, cellY - mouseY);
            
            if (distance < HOVER_RADIUS) {
              const normalized = distance / HOVER_RADIUS;
              const index = row * cols + col;
              if (normalized < 0.5) {
                intensityMap[index] = 1;
              } else {
                intensityMap[index] = 1 - (normalized - 0.5) * 2;
              }
            }
          }
        }
      }
    }
    
    // Draw all cells in one pass
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const intensity = intensityMap[index];
        
        if (intensity > 0.01) {
          const x = col * CELL_SIZE;
          const y = row * CELL_SIZE;
          
          let scale, state;
          if (intensity > 0.66) {
            scale = 1 + (intensity - 0.66) * 0.6;
            state = 'on';
          } else if (intensity > 0.33) {
            scale = 1.1;
            state = 'partial';
          } else {
            scale = 1;
            state = 'off';
          }
          
          const key = `${scale.toFixed(1)}-${state}`;
          if (symbolCache[key]) {
            const symbol = symbolCache[key];
            const offset = (CELL_SIZE - symbol.width) / 2;
            ctx.globalAlpha = 0.3 + intensity * 0.7;
            ctx.drawImage(symbol, x + offset, y + offset);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    
    animationId = requestAnimationFrame(animate);
  }

  function handlePressStart(e) {
    e.preventDefault();
    
    // Start press behavior (not dragging yet)
    isPressing = true;
    pressStartTime = performance.now();
    pressPower = 0;
    depressionRadius = 0;
    hasMoved = false;
    
    // Store initial mouse/touch position
    if (e.type === 'mousedown') {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    } else if (e.type === 'touchstart') {
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
    }
    
    // Set grabbing cursor
    const logo = document.querySelector('.logo-wrapper');
    if (logo) logo.style.cursor = 'grabbing';
  }
  
  function handlePressEnd(e) {
    e.preventDefault();
    
    if (isDragging || isPressing) {
      isDragging = false;
      
      // Give velocity based on position for spring back
      logoVelocity.x = logoPosition.x * 0.1;
      logoVelocity.y = logoPosition.y * 0.1;
      
      // Create wave from current position with press power if available
      const canvasRect = canvas.getBoundingClientRect();
      const x = canvasRect.width / 2 + logoPosition.x;
      const y = canvasRect.height / 2 + logoPosition.y;
      const maxRadius = Math.hypot(canvasRect.width, canvasRect.height) * 1.5;
      
      // Use press power if we have it, otherwise default
      const wavePower = pressPower > 0 ? Math.max(0.5, pressPower * 1.5) : 0.3;
      const duration = pressPower > 0 ? 3000 : 800;
      const thickness = pressPower > 0 ? 
        Math.min(300, maxRadius * 0.3 * (1 + wavePower * 2)) : 
        40;
      
      waves.push({
        x,
        y,
        startTime: performance.now(),
        duration,
        maxRadius,
        thickness,
        power: wavePower
      });
      
      // Spring the logo back if we have press power
      if (pressPower > 0) {
        logoSpring.velocity = pressPower * 2;
      }
    } else if (false) { // Remove duplicate condition
      // Create wave from press-and-hold
      const canvasRect = canvas.getBoundingClientRect();
      const x = canvasRect.width / 2 + logoPosition.x;
      const y = canvasRect.height / 2 + logoPosition.y;
      const maxRadius = Math.hypot(canvasRect.width, canvasRect.height) * 1.5;
      
      // Wave properties scale with press power
      const wavePower = Math.max(0.5, pressPower * 1.5); // Increased power scaling
      const duration = 3000; // Even slower for better perception
      const thickness = Math.min(300, maxRadius * 0.3 * (1 + wavePower * 2)); // Much thicker waves
      
      waves.push({
        x,
        y,
        startTime: performance.now(),
        duration,
        maxRadius,
        thickness,
        power: wavePower
      });
      
      // Spring the logo back
      logoSpring.velocity = pressPower * 2;
    }
    
    // Reset states
    isPressing = false;
    pressPower = 0;
    depressionRadius = 0;
    hasMoved = false;
    
    // Reset cursor
    const logo = document.querySelector('.logo-wrapper');
    if (logo) logo.style.cursor = 'grab';
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function handleMouseLeave() {
    mouseX = -1000;
    mouseY = -1000;
  }
  
  function handleCanvasTap(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    tapFadeX = touch.clientX - rect.left;
    tapFadeY = touch.clientY - rect.top;
    tapFadeIntensity = 1;
  }
  
  function handleDragMove(e) {
    if (!isPressing && !isDragging) return;
    e.preventDefault();
    
    // Get current mouse/touch position
    let currentX, currentY;
    if (e.type === 'mousemove') {
      currentX = e.clientX;
      currentY = e.clientY;
    } else if (e.type === 'touchmove') {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    }
    
    // Check if we should start dragging
    if (!isDragging && isPressing) {
      const moveDistance = Math.hypot(currentX - dragStartX, currentY - dragStartY);
      if (moveDistance > 5) { // 5px threshold
        isDragging = true;
        // Don't reset isPressing - keep press power for wave
        hasMoved = true;
      }
    }
    
    if (isDragging) {
      // Calculate position relative to center of viewport
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const targetX = (currentX - centerX) * 0.8;
      const targetY = (currentY - centerY) * 0.8;
      
      // Constrain to maximum drag radius
      const maxDrag = 300;
      const distance = Math.hypot(targetX, targetY);
      
      if (distance <= maxDrag) {
        logoPosition.x = targetX;
        logoPosition.y = targetY;
      } else {
        // Constrain to circle edge
        const angle = Math.atan2(targetY, targetX);
        logoPosition.x = Math.cos(angle) * maxDrag;
        logoPosition.y = Math.sin(angle) * maxDrag;
      }
      
      // Create trail waves occasionally
      const now = performance.now();
      if (now - lastDragTime > 100) {
        const canvasRect = canvas.getBoundingClientRect();
        waves.push({
          x: canvasRect.width / 2 + logoPosition.x,
          y: canvasRect.height / 2 + logoPosition.y,
          startTime: now,
          duration: 600,
          maxRadius: 100,
          thickness: 30,
          power: 0.2
        });
        lastDragTime = now;
      }
    }
  }
  
  function handleDragEnd(e) {
    if (isDragging) {
      handlePressEnd(e);
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();