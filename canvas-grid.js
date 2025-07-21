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
    
    updateCanvasSize();
    detectColorScheme();
    cacheSymbols();
    
    // Event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    document.getElementById('logoWrapper').addEventListener('click', createWave);
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
            const intensity = Math.pow(Math.cos((1 - wavePos) * Math.PI / 2), 2);
            const index = row * cols + col;
            intensityMap[index] = Math.max(intensityMap[index], intensity);
          }
        }
      }
      
      return true;
    });
    
    // Calculate hover intensities if no waves
    if (waves.length === 0 && mouseX > -1 && mouseY > -1) {
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

  function createWave(e) {
    e.preventDefault();
    
    // Create wave from center of viewport
    const canvasRect = canvas.getBoundingClientRect();
    const x = canvasRect.width / 2;
    const y = canvasRect.height / 2;
    const maxRadius = Math.hypot(x, y);
    
    waves.push({
      x,
      y,
      startTime: performance.now(),
      duration: 1200,
      maxRadius,
      thickness: Math.min(80, maxRadius * 0.15)
    });
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