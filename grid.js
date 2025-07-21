(() => {
  const SYMBOL = '∴';
  const HOVER_RADIUS = 3;
  const RIPPLE_SPEED = 50;
  
  let grid = [];
  let gridCols = 40;
  let gridRows = 25;
  let mouseX = -1000;
  let mouseY = -1000;
  let activeWaves = [];

  function calculateGridSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (width <= 480) {
      gridCols = 20;
      gridRows = 35;
    } else if (width <= 768) {
      gridCols = 25;
      gridRows = 40;
    } else {
      gridCols = Math.floor(width / 30);
      gridRows = Math.floor(height / 30);
    }
  }

  function createGrid() {
    const gridElement = document.getElementById('pixelGrid');
    gridElement.innerHTML = '';
    gridElement.style.setProperty('--grid-cols', gridCols);
    gridElement.style.setProperty('--grid-rows', gridRows);
    
    grid = [];
    
    for (let row = 0; row < gridRows; row++) {
      grid[row] = [];
      for (let col = 0; col < gridCols; col++) {
        const cell = document.createElement('div');
        cell.className = 'pixel-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        
        const symbol = document.createElement('span');
        symbol.className = 'pixel-symbol state-off';
        symbol.textContent = SYMBOL;
        
        cell.appendChild(symbol);
        gridElement.appendChild(cell);
        
        grid[row][col] = {
          element: symbol,
          state: 'off'
        };
      }
    }
  }

  function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  function updateCellStates() {
    if (activeWaves.length > 0) return; // Skip hover effects during waves
    
    const gridElement = document.getElementById('pixelGrid');
    const rect = gridElement.getBoundingClientRect();
    const cellWidth = rect.width / gridCols;
    const cellHeight = rect.height / gridRows;
    
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const cellCenterX = rect.left + (col + 0.5) * cellWidth;
        const cellCenterY = rect.top + (row + 0.5) * cellHeight;
        
        const distance = getDistance(mouseX, mouseY, cellCenterX, cellCenterY);
        const normalizedDistance = distance / (cellWidth * HOVER_RADIUS);
        
        const cell = grid[row][col];
        cell.element.classList.remove('state-off', 'state-partial', 'state-on');
        
        if (normalizedDistance < 0.5) {
          cell.element.classList.add('state-on');
          cell.state = 'on';
        } else if (normalizedDistance < 1) {
          cell.element.classList.add('state-partial');
          cell.state = 'partial';
        } else {
          cell.element.classList.add('state-off');
          cell.state = 'off';
        }
      }
    }
  }

  function createRipple() {
    const gridElement = document.getElementById('pixelGrid');
    const rect = gridElement.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // Pre-calculate cell positions for this wave
    const cellPositions = [];
    const cellWidth = rect.width / gridCols;
    const cellHeight = rect.height / gridRows;
    
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const cellX = (col + 0.5) * cellWidth;
        const cellY = (row + 0.5) * cellHeight;
        const distance = getDistance(centerX, centerY, cellX, cellY);
        cellPositions.push({
          row,
          col,
          distance,
          element: grid[row][col].element
        });
      }
    }
    
    // Create new wave object
    const wave = {
      id: Date.now(),
      startTime: null,
      duration: 1500,
      waveWidth: maxRadius * 0.15,
      maxRadius,
      cellPositions,
      complete: false
    };
    
    activeWaves.push(wave);
    
    // If this is the first wave, start the animation loop
    if (activeWaves.length === 1) {
      animateWaves();
    }
  }
  
  function animateWaves() {
    if (activeWaves.length === 0) {
      updateCellStates();
      return;
    }
    
    const now = performance.now();
    const cellIntensities = new Map();
    
    // Calculate combined intensity for each cell from all waves
    activeWaves = activeWaves.filter(wave => {
      if (!wave.startTime) wave.startTime = now;
      const progress = Math.min((now - wave.startTime) / wave.duration, 1);
      
      if (progress >= 1) {
        wave.complete = true;
        return false; // Remove completed waves
      }
      
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentRadius = easedProgress * wave.maxRadius;
      
      wave.cellPositions.forEach(cell => {
        const distanceFromWave = Math.abs(cell.distance - currentRadius);
        
        if (distanceFromWave <= wave.waveWidth) {
          const wavePosition = 1 - (distanceFromWave / wave.waveWidth);
          const intensity = Math.pow(Math.cos((1 - wavePosition) * Math.PI / 2), 2);
          
          const key = `${cell.row}-${cell.col}`;
          const currentIntensity = cellIntensities.get(key) || 0;
          cellIntensities.set(key, Math.max(currentIntensity, intensity));
        }
      });
      
      return true; // Keep active waves
    });
    
    // Apply combined intensities to all cells
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const key = `${row}-${col}`;
        const intensity = cellIntensities.get(key) || 0;
        const cell = grid[row][col];
        
        if (intensity > 0) {
          cell.element.style.setProperty('--wave-intensity', intensity);
          if (!cell.element.classList.contains('state-on')) {
            cell.element.classList.remove('state-off', 'state-partial');
            cell.element.classList.add('state-on');
          }
        } else {
          if (cell.element.classList.contains('state-on')) {
            cell.element.classList.remove('state-on');
            cell.element.classList.add('state-off');
            cell.element.style.setProperty('--wave-intensity', 0);
          }
        }
      }
    }
    
    requestAnimationFrame(animateWaves);
  }

  let animationFrame = null;
  function handleMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    if (!animationFrame) {
      animationFrame = requestAnimationFrame(() => {
        updateCellStates();
        animationFrame = null;
      });
    }
  }

  function handleMouseLeave() {
    mouseX = -1000;
    mouseY = -1000;
    updateCellStates();
  }

  function handleLogoClick(e) {
    e.preventDefault();
    createRipple();
  }

  function init() {
    calculateGridSize();
    createGrid();
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    
    const logoWrapper = document.getElementById('logoWrapper');
    logoWrapper.addEventListener('click', handleLogoClick);
    
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        calculateGridSize();
        createGrid();
      }, 250);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();