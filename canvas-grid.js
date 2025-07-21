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
  let dragTrailWaves = [];
  
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
    
    // Apply combined transform to logo
    const logo = document.querySelector('.logo-wrapper');
    if (logo) {
      const scale = 1 + logoSpring.position * 0.2;
      const translateX = logoPosition.x;
      const translateY = logoPosition.y;
      logo.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    // Update depression effect
    if (isPressing) {
      const elapsed = performance.now() - pressStartTime;
      // Use square root for faster initial growth, then linear
      const rawPower = Math.min(elapsed / 2000, 1);
      pressPower = Math.sqrt(rawPower); // Faster initial response
      depressionRadius = pressPower * 300;
      
      // Push logo "into" the page
      logoSpring.position = -pressPower * 0.5;
      const logo = document.querySelector('.logo-wrapper');
      const scale = 1 + logoSpring.position * 0.2;
      logo.style.transform = `scale(${scale})`;
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
    
    // Calculate depression effect during press (follows logo position)
    if (isPressing && depressionRadius > 0) {
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
            // Create a depression that gets darker toward the center
            const depressionIntensity = (1 - normalized) * pressPower;
            intensityMap[index] = Math.max(intensityMap[index], depressionIntensity);
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
    isPressing = true;
    pressStartTime = performance.now();
    pressPower = 0;
    depressionRadius = 0;
    
    // Set grabbing cursor immediately
    const logo = document.querySelector('.logo-wrapper');
    if (logo) logo.style.cursor = 'grabbing';
    
    // Store initial position for drag detection
    if (e.type === 'mousedown') {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    } else if (e.type === 'touchstart') {
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
    }
  }
  
  function handlePressEnd(e) {
    if (!isPressing && !isDragging) return;
    e.preventDefault();
    
    // Reset cursor to grab
    const logo = document.querySelector('.logo-wrapper');
    if (logo) logo.style.cursor = 'grab';
    
    if (isPressing) {
      isPressing = false;
      
      // Create wave based on press power from current logo position
      const canvasRect = canvas.getBoundingClientRect();
      const x = canvasRect.width / 2 + logoPosition.x;
      const y = canvasRect.height / 2 + logoPosition.y;
      const maxRadius = Math.hypot(canvasRect.width / 2, canvasRect.height / 2) * 1.5;
      
      // Wave properties scale with press power
      const wavePower = Math.max(0.3, pressPower); // Higher minimum for visibility
      const duration = 1200 / (0.5 + wavePower * 0.5); // Faster waves for stronger presses
      const thickness = Math.min(150, maxRadius * 0.2 * (1 + wavePower * 1.5)); // Thicker waves
      
      waves.push({
        x,
        y,
        startTime: performance.now(),
        duration,
        maxRadius,
        thickness,
        power: wavePower
      });
      
      // Spring the logo back with velocity proportional to press power
      logoSpring.velocity = pressPower * 2;
      
      // Reset press state
      pressPower = 0;
      depressionRadius = 0;
    }
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
    if (!isPressing) return;
    
    let currentX, currentY;
    if (e.type === 'mousemove') {
      currentX = e.clientX;
      currentY = e.clientY;
    } else if (e.type === 'touchmove') {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    }
    
    const dragDistance = Math.hypot(currentX - dragStartX, currentY - dragStartY);
    
    // Start dragging if moved more than 5 pixels
    if (dragDistance > 5 && !isDragging) {
      isDragging = true;
      isPressing = false; // Cancel press behavior
    }
    
    if (isDragging) {
      // Update logo position with some resistance
      const resistance = 0.7; // Less resistance for further dragging
      logoPosition.x = (currentX - dragStartX) * resistance;
      logoPosition.y = (currentY - dragStartY) * resistance;
      
      // Auto-release if dragged beyond maximum distance
      const maxDrag = 2400; // 3x larger drag area
      const currentDrag = Math.hypot(logoPosition.x, logoPosition.y);
      if (currentDrag > maxDrag) {
        // Trigger auto-release with strong velocity
        isDragging = false;
        isPressing = false;
        
        // Calculate release velocity based on overshoot
        const overshoot = currentDrag - maxDrag;
        const releaseBoost = 1 + (overshoot / 100); // Extra velocity for dramatic release
        logoVelocity.x = (logoPosition.x / currentDrag) * 15 * releaseBoost;
        logoVelocity.y = (logoPosition.y / currentDrag) * 15 * releaseBoost;
        
        // Create a burst wave at release point
        const canvasRect = canvas.getBoundingClientRect();
        waves.push({
          x: canvasRect.width / 2 + logoPosition.x,
          y: canvasRect.height / 2 + logoPosition.y,
          startTime: performance.now(),
          duration: 1000,
          maxRadius: Math.hypot(width, height),
          thickness: 80,
          power: 0.8
        });
        
        // Update cursor
        document.querySelector('.logo-wrapper').style.cursor = 'grab';
      }
    }
  }
  
  function handleDragEnd(e) {
    if (isDragging) {
      isDragging = false;
      // Give initial velocity based on position
      logoVelocity.x = logoPosition.x * 0.1;
      logoVelocity.y = logoPosition.y * 0.1;
      
      // Reset cursor
      const logo = document.querySelector('.logo-wrapper');
      if (logo) logo.style.cursor = 'grab';
    }
    
    // Also handle as press end if still pressing
    if (isPressing) {
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