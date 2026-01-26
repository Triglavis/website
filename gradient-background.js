(() => {
  let canvas, gl;
  let program, positionBuffer;
  let uniforms = {};
  let startTime = Date.now();
  let animationId = null;
  let resizeRafId = null;
  let isDarkMode = true; // Always use dark mode

  const POINTER_INTERACTION = {
    radius: 0.42,
    maxVelocity: 2.6,
    holdMs: 140,
    decayMs: 760
  };

  const RIPPLE_CONFIG = {
    count: 4,
    duration: 2.4,
    maxTapDistance: 18,
    maxTapMs: 240
  };

  const pointer = {
    x: 0.5,
    y: 0.5,
    vx: 0,
    vy: 0,
    speed: 0,
    smoothX: 0.5,
    smoothY: 0.5,
    smoothVx: 0,
    smoothVy: 0,
    lastX: 0.5,
    lastY: 0.5,
    lastTime: null,
    lastMoveTime: null,
    lastFrameTime: null,
    isDown: false,
    pointerId: null,
    pointerType: 'mouse',
    downX: 0,
    downY: 0,
    downTime: 0
  };

  const ripples = Array.from({ length: RIPPLE_CONFIG.count }, () => ({
    x: 0.5,
    y: 0.5,
    startTime: -1000,
    strength: 0
  }));
  let rippleIndex = 0;
  const rippleData = new Float32Array(RIPPLE_CONFIG.count * 4);

  const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    
    uniform vec3 iResolution;
    uniform float iTime;
    uniform vec2 iMouse;
    uniform vec2 iVelocity;
    uniform float iPointerStrength;
    uniform float iPointerRadius;
    uniform vec4 iRipples[4];
    uniform float noiseIntensity;
    uniform float noiseScale;
    uniform float noiseSpeed;
    uniform float waveNoiseIntensity;
    uniform float waveNoiseScale1;
    uniform float waveNoiseScale2;
    uniform float waveNoiseScale3;
    uniform float waveNoiseSpeed1;
    uniform float waveNoiseSpeed2;
    uniform float waveNoiseSpeed3;
    uniform bool isDarkMode;

    #define BLEND_MODE 2
    #define SPEED 2.0
    #define INTENSITY 0.075
    #define MEAN 0.0
    #define VARIANCE 0.5
    #define RIPPLE_COUNT 4

    const float RIPPLE_DURATION = 2.4;
    const float RIPPLE_SPEED = 1.55;
    const float RIPPLE_FREQUENCY = 12.5;
    const float RIPPLE_DECAY = 1.35;
    const float RIPPLE_WARP = 0.055;
    const float RIPPLE_SHADE = 0.12;

    vec2 hash(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      
      return mix(
        mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    vec3 mod289(vec3 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec4 mod289(vec4 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec4 permute(vec4 x) {
      return mod289(((x*34.0)+1.0)*x);
    }

    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }

    float snoise(vec3 v) { 
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;

      i = mod289(i); 
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0)) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    vec2 warp(vec2 p) {
      float n1 = noise(p * waveNoiseScale1 + vec2(iTime * waveNoiseSpeed1, 0.0));
      float n2 = noise(p * waveNoiseScale1 + vec2(0.0, iTime * waveNoiseSpeed2));
      
      float n3 = noise(p * waveNoiseScale2 + vec2(iTime * -waveNoiseSpeed3, iTime * waveNoiseSpeed3)) * 0.5;
      float n4 = noise(p * waveNoiseScale3 + vec2(iTime * waveNoiseSpeed3, -iTime * waveNoiseSpeed3)) * 0.3;
      
      return p + vec2(n1 + n3, n2 + n4) * waveNoiseIntensity;
    }

    float gaussian(float z, float u, float o) {
      return (1.0 / (o * sqrt(2.0 * 3.1415))) * exp(-(((z - u) * (z - u)) / (2.0 * (o * o))));
    }

    vec3 overlay(vec3 a, vec3 b, float w) {
      vec3 result;
      
      // Red channel
      if (a.r < 0.5) {
        result.r = 2.0 * a.r * b.r;
      } else {
        result.r = 1.0 - 2.0 * (1.0 - a.r) * (1.0 - b.r);
      }
      
      // Green channel
      if (a.g < 0.5) {
        result.g = 2.0 * a.g * b.g;
      } else {
        result.g = 1.0 - 2.0 * (1.0 - a.g) * (1.0 - b.g);
      }
      
      // Blue channel
      if (a.b < 0.5) {
        result.b = 2.0 * a.b * b.b;
      } else {
        result.b = 1.0 - 2.0 * (1.0 - a.b) * (1.0 - b.b);
      }
      
      return mix(a, result, w);
    }

    vec3 multiColorGradient(float t) {
      t = clamp(t, 0.0, 1.0);
      
      // Define gradient stops for light and dark modes
      float g0, g1, g2, g3, g4, g5, g6;
      
      if (isDarkMode) {
        // Dark mode - inverted/shifted down colors
        g0 = 0.092; // Inverted light grey -> very dark grey
        g1 = 0.153; // Inverted medium light grey -> dark grey
        g2 = 0.239; // Inverted medium grey -> darker grey
        g3 = 0.459; // Inverted darker grey -> medium grey
        g4 = 0.678; // Inverted medium dark grey -> lighter grey
        g5 = 0.733; // Inverted dark grey -> light grey
        g6 = 0.945; // Inverted very dark grey -> very light grey
      } else {
        // Light mode - original colors
        g0 = 0.908; // FAD4FB -> light grey
        g1 = 0.847; // FAC8E1 -> medium light grey  
        g2 = 0.761; // FAB615 -> medium grey
        g3 = 0.541; // FC681E -> darker grey
        g4 = 0.322; // 0D5DF4 -> medium dark grey
        g5 = 0.267; // 0B4ABB -> dark grey
        g6 = 0.055; // 170E07 -> very dark grey
      }
      
      float scaledT = t * 6.0;
      float grey;
      
      if (scaledT < 1.0) {
        grey = mix(g0, g1, smoothstep(0.0, 1.0, scaledT));
      } else if (scaledT < 2.0) {
        grey = mix(g1, g2, smoothstep(0.0, 1.0, scaledT - 1.0));
      } else if (scaledT < 3.0) {
        grey = mix(g2, g3, smoothstep(0.0, 1.0, scaledT - 2.0));
      } else if (scaledT < 4.0) {
        grey = mix(g3, g4, smoothstep(0.0, 1.0, scaledT - 3.0));
      } else if (scaledT < 5.0) {
        grey = mix(g4, g5, smoothstep(0.0, 1.0, scaledT - 4.0));
      } else {
        grey = mix(g5, g6, smoothstep(0.0, 1.0, scaledT - 5.0));
      }
      
      return vec3(grey, grey, grey);
    }

    vec3 applyGrain(vec3 color, vec2 uv) {
      float t = iTime * SPEED;
      float seed = dot(uv, vec2(12.9898, 78.233));
      float grainNoise = fract(sin(seed) * 43758.5453 + t);
      grainNoise = gaussian(grainNoise, MEAN, VARIANCE * VARIANCE);
      
      vec3 grain = vec3(grainNoise) * (1.0 - color);
      float w = INTENSITY;
      
      return overlay(color, grain, w);
    }

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      vec2 uv = fragCoord / iResolution.xy;
      vec2 centeredUv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

      vec2 pointerCenter = (iMouse * iResolution.xy - 0.5 * iResolution.xy) / iResolution.y;
      vec2 toPointer = centeredUv - pointerCenter;
      float pointerDist = length(toPointer);
      float pointerFalloff = smoothstep(iPointerRadius, 0.0, pointerDist);
      float pointerStrength = iPointerStrength * pointerFalloff;

      vec2 flowDir = normalize(iVelocity + vec2(0.0001));
      vec2 flowSwirl = vec2(-flowDir.y, flowDir.x);
      vec2 pointerOffset = (flowDir * 0.08 + flowSwirl * 0.055) * pointerStrength;

      vec2 warpedUv = warp(centeredUv);
      vec2 mouseUv = (iMouse - 0.5) * 2.0;
      float mouseDistance = length(centeredUv - mouseUv);
      float mouseEffect = exp(-mouseDistance * 8.0) * 0.16 * pointerStrength;
      warpedUv += mouseEffect * sin(mouseDistance * 15.0 - iTime * 1.5) * 0.03;
      warpedUv += pointerOffset;

      vec2 rippleOffset = vec2(0.0);
      float rippleShade = 0.0;
      for (int i = 0; i < RIPPLE_COUNT; i++) {
        vec4 ripple = iRipples[i];
        float age = iTime - ripple.z;
        if (ripple.w > 0.0 && age >= 0.0 && age <= RIPPLE_DURATION) {
          vec2 center = (ripple.xy * iResolution.xy - 0.5 * iResolution.xy) / iResolution.y;
          vec2 diff = centeredUv - center;
          float dist = length(diff);
          float wave = sin((dist - age * RIPPLE_SPEED) * RIPPLE_FREQUENCY);
          float envelope = exp(-age * RIPPLE_DECAY) * smoothstep(RIPPLE_DURATION, RIPPLE_DURATION - 0.35, age);
          float ring = wave * envelope / (1.0 + dist * 8.0);
          vec2 dir = normalize(diff + vec2(0.0001));
          rippleOffset += dir * ring * ripple.w * RIPPLE_WARP;
          rippleShade += ring * ripple.w * RIPPLE_SHADE;
        }
      }
      warpedUv += rippleOffset;

      float simplexNoise = snoise(vec3(warpedUv * noiseScale, iTime * noiseSpeed)) * noiseIntensity;
      warpedUv += simplexNoise;
      
      float phase1 = iTime * 0.6;
      float phase2 = iTime * 0.4;
      
      float distanceFromCenter = length(warpedUv);
      float archFactor = 1.0 - distanceFromCenter * 0.5;

      float wave1 = sin(warpedUv.x * 3.0 + phase1) * 0.5 * archFactor;
      float wave2 = sin(warpedUv.x * 5.0 - phase2) * 0.3 * archFactor;
      float wave3 = sin(warpedUv.y * 4.0 + phase1 * 0.7) * 0.15;
      float parabolicArch = -pow(warpedUv.x, 2.0) * 0.2;

      float breathing = sin(iTime * 0.5) * 0.1 + 0.9;
      float combinedWave = (wave1 + wave2 + wave3 + parabolicArch) * breathing * 0.3 + rippleShade;
      
      float gradientPos = (uv.y + combinedWave * 0.3);
      float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
      vec3 color = multiColorGradient(smoothGradientPos);
      
      gl_FragColor = vec4(applyGrain(color, uv), 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    
    return program;
  }

  function init() {
    console.log('Gradient background initializing...');
    canvas = document.getElementById('gradientCanvas');
    if (!canvas) {
      console.error('Gradient canvas element not found');
      return;
    }
    
    gl = canvas.getContext('webgl', { 
      alpha: true,
      antialias: false,
      powerPreference: 'low-power'
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      // Fallback to a simple gradient
      canvas.style.background = 'linear-gradient(to bottom, #e6e6e6, #333333)';
      return;
    }
    
    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      console.error('Failed to create shaders');
      // Fallback to CSS gradient
      canvas.style.background = 'linear-gradient(to bottom, #e6e6e6, #333333)';
      return;
    }
    
    // Create program
    program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return;
    
    // Get attribute and uniform locations
    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    
    uniforms = {
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      iTime: gl.getUniformLocation(program, 'iTime'),
      iMouse: gl.getUniformLocation(program, 'iMouse'),
      iVelocity: gl.getUniformLocation(program, 'iVelocity'),
      iPointerStrength: gl.getUniformLocation(program, 'iPointerStrength'),
      iPointerRadius: gl.getUniformLocation(program, 'iPointerRadius'),
      iRipples: gl.getUniformLocation(program, 'iRipples[0]'),
      noiseIntensity: gl.getUniformLocation(program, 'noiseIntensity'),
      noiseScale: gl.getUniformLocation(program, 'noiseScale'),
      noiseSpeed: gl.getUniformLocation(program, 'noiseSpeed'),
      waveNoiseIntensity: gl.getUniformLocation(program, 'waveNoiseIntensity'),
      waveNoiseScale1: gl.getUniformLocation(program, 'waveNoiseScale1'),
      waveNoiseScale2: gl.getUniformLocation(program, 'waveNoiseScale2'),
      waveNoiseScale3: gl.getUniformLocation(program, 'waveNoiseScale3'),
      waveNoiseSpeed1: gl.getUniformLocation(program, 'waveNoiseSpeed1'),
      waveNoiseSpeed2: gl.getUniformLocation(program, 'waveNoiseSpeed2'),
      waveNoiseSpeed3: gl.getUniformLocation(program, 'waveNoiseSpeed3'),
      isDarkMode: gl.getUniformLocation(program, 'isDarkMode')
    };
    
    // Create position buffer
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    // Full screen quad
    const positions = [
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    // Setup attribute
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    if (window.PointerEvent) {
      window.addEventListener('pointerdown', handlePointerDown, { passive: true });
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerup', handlePointerUp, { passive: true });
      window.addEventListener('pointercancel', handlePointerUp, { passive: true });
      window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    } else {
      window.addEventListener('mousemove', handlePointerMove, { passive: true });
      window.addEventListener('mousedown', handlePointerDown, { passive: true });
      window.addEventListener('mouseup', handlePointerUp, { passive: true });
      window.addEventListener('touchstart', (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        handlePointerDown({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' });
      }, { passive: true });
      window.addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        handlePointerMove({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' });
      }, { passive: true });
      window.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        handlePointerUp({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' });
      }, { passive: true });
    }

    window.addEventListener('resize', requestResize);
    window.addEventListener('blur', handlePointerLeave);
    
    // Always use dark mode
    isDarkMode = true;
    
    // Initial resize after DOM settles
    setTimeout(() => {
      handleResize();
      console.log('Gradient background initialized successfully');
      animate();
    }, 100);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function nowSeconds() {
    return (Date.now() - startTime) * 0.001;
  }

  function getContentBounds() {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      return {
        left: 0,
        top: 0,
        width: window.innerWidth || 1,
        height: window.innerHeight || 1
      };
    }
    const rect = contentArea.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width || window.innerWidth || 1,
      height: rect.height || window.innerHeight || 1
    };
  }

  function normalizePointer(clientX, clientY) {
    const bounds = getContentBounds();
    const width = bounds.width || 1;
    const height = bounds.height || 1;
    return {
      x: clamp((clientX - bounds.left) / width, 0, 1),
      y: clamp(1 - (clientY - bounds.top) / height, 0, 1)
    };
  }

  function updatePointer(x, y, nowMs, isMove) {
    if (!isMove || pointer.lastTime == null) {
      pointer.vx = 0;
      pointer.vy = 0;
      pointer.speed = 0;
    } else {
      const dt = Math.max((nowMs - pointer.lastTime) / 1000, 0.001);
      const vx = clamp((x - pointer.lastX) / dt, -POINTER_INTERACTION.maxVelocity, POINTER_INTERACTION.maxVelocity);
      const vy = clamp((y - pointer.lastY) / dt, -POINTER_INTERACTION.maxVelocity, POINTER_INTERACTION.maxVelocity);
      pointer.vx = vx;
      pointer.vy = vy;
    }

    pointer.x = x;
    pointer.y = y;
    pointer.lastX = x;
    pointer.lastY = y;
    pointer.lastTime = nowMs;
    if (isMove) {
      pointer.lastMoveTime = nowMs;
    }
  }

  function addRipple(x, y, pressure, pressDurationMs) {
    const durationBoost = clamp(pressDurationMs / 300, 0, 0.6);
    const force = clamp(0.45 + durationBoost, 0.45, 1);
    const pressureBoost = clamp(0.7 + (pressure || 0.5) * 0.6, 0.7, 1.2);
    const ripple = ripples[rippleIndex];
    ripple.x = x;
    ripple.y = y;
    ripple.startTime = nowSeconds();
    ripple.strength = clamp(force * pressureBoost, 0.35, 1);
    rippleIndex = (rippleIndex + 1) % RIPPLE_CONFIG.count;
  }

  function handlePointerDown(event) {
    if (pointer.isDown && pointer.pointerId != null && pointer.pointerId !== event.pointerId) return;
    pointer.isDown = true;
    pointer.pointerId = event.pointerId;
    pointer.pointerType = event.pointerType || 'mouse';

    const nowMs = performance.now();
    const coords = normalizePointer(event.clientX, event.clientY);
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    pointer.downTime = nowMs;
    updatePointer(coords.x, coords.y, nowMs, false);
    pointer.lastMoveTime = nowMs;
  }

  function handlePointerMove(event) {
    if (event.pointerType && event.pointerType !== 'mouse') {
      if (!pointer.isDown || (pointer.pointerId != null && event.pointerId !== pointer.pointerId)) return;
    }
    const nowMs = performance.now();
    const coords = normalizePointer(event.clientX, event.clientY);
    updatePointer(coords.x, coords.y, nowMs, true);
  }

  function handlePointerUp(event) {
    if (pointer.pointerId != null && event.pointerId !== pointer.pointerId) return;
    const nowMs = performance.now();
    const dist = Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY);
    const elapsed = nowMs - pointer.downTime;

    if ((event.pointerType === 'touch' || event.pointerType === 'pen') &&
      dist <= RIPPLE_CONFIG.maxTapDistance &&
      elapsed <= RIPPLE_CONFIG.maxTapMs) {
      const coords = normalizePointer(event.clientX, event.clientY);
      addRipple(coords.x, coords.y, event.pressure, elapsed);
    }

    pointer.isDown = false;
    pointer.pointerId = null;
  }

  function handlePointerLeave() {
    pointer.lastMoveTime = performance.now() - (POINTER_INTERACTION.holdMs + POINTER_INTERACTION.decayMs + 1);
    pointer.vx = 0;
    pointer.vy = 0;
    pointer.smoothVx = 0;
    pointer.smoothVy = 0;
    pointer.speed = 0;
  }

  function requestResize() {
    if (resizeRafId != null) {
      return;
    }
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null;
      handleResize();
    });
  }

  function handleResize() {
    if (!canvas || !gl) return;
    
    const dpr = window.devicePixelRatio || 1;

    const app = document.querySelector('.app-container');
    const appRect = app ? app.getBoundingClientRect() : null;
    const appStyles = app ? window.getComputedStyle(app) : null;
    const paddingX = appStyles
      ? (parseFloat(appStyles.paddingLeft) || 0) + (parseFloat(appStyles.paddingRight) || 0)
      : 0;
    const paddingY = appStyles
      ? (parseFloat(appStyles.paddingTop) || 0) + (parseFloat(appStyles.paddingBottom) || 0)
      : 0;
    const width = appRect ? appRect.width - paddingX : window.innerWidth;
    const height = appRect ? appRect.height - paddingY : window.innerHeight;
    
    // Check if we got valid dimensions
    if (width <= 0 || height <= 0) {
      console.warn('Window has zero dimensions, retrying...');
      setTimeout(handleResize, 100);
      return;
    }
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    console.log('Canvas resized:', width, 'x', height);
  }

  function animate() {
    if (!gl || !program || !canvas) {
      console.error('WebGL context lost or not initialized');
      return;
    }
    
    const currentTime = (Date.now() - startTime) * 0.001;
    const nowMs = performance.now();
    const frameDt = pointer.lastFrameTime == null ? 0.016 : Math.max((nowMs - pointer.lastFrameTime) / 1000, 0.001);
    pointer.lastFrameTime = nowMs;

    const positionLerp = 1 - Math.exp(-frameDt * 10);
    const velocityLerp = 1 - Math.exp(-frameDt * 12);
    pointer.smoothX += (pointer.x - pointer.smoothX) * positionLerp;
    pointer.smoothY += (pointer.y - pointer.smoothY) * positionLerp;
    pointer.smoothVx += (pointer.vx - pointer.smoothVx) * velocityLerp;
    pointer.smoothVy += (pointer.vy - pointer.smoothVy) * velocityLerp;
    pointer.speed = Math.hypot(pointer.smoothVx, pointer.smoothVy);

    let pointerStrength = 0;
    let pointerRadius = POINTER_INTERACTION.radius;
    if (pointer.lastMoveTime != null) {
      const msSinceMove = nowMs - pointer.lastMoveTime;
      let influence = 0;
      if (msSinceMove <= POINTER_INTERACTION.holdMs) {
        influence = 1;
      } else {
        influence = clamp(
          1 - (msSinceMove - POINTER_INTERACTION.holdMs) / POINTER_INTERACTION.decayMs,
          0,
          1
        );
      }

      const speedStrength = clamp(pointer.speed / POINTER_INTERACTION.maxVelocity, 0, 1);
      pointerStrength = influence * Math.pow(speedStrength, 0.85);
      pointerRadius = POINTER_INTERACTION.radius * (0.9 + speedStrength * 0.25);
    }

    const aspect = canvas ? canvas.width / Math.max(canvas.height, 1) : (window.innerWidth || 1) / Math.max(window.innerHeight || 1, 1);
    const velocityScale = pointerStrength > 0 ? 1 : 0;
    const velX = pointer.smoothVx * aspect * velocityScale;
    const velY = pointer.smoothVy * velocityScale;

    for (let i = 0; i < ripples.length; i += 1) {
      const ripple = ripples[i];
      if (ripple.strength > 0) {
        const age = currentTime - ripple.startTime;
        if (age > RIPPLE_CONFIG.duration) {
          ripple.strength = 0;
          ripple.startTime = -1000;
        }
      }
      const offset = i * 4;
      rippleData[offset] = ripple.x;
      rippleData[offset + 1] = ripple.y;
      rippleData[offset + 2] = ripple.startTime;
      rippleData[offset + 3] = ripple.strength;
    }
    
    // Clear with transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(program);
    
    // Set uniforms
    gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1);
    gl.uniform1f(uniforms.iTime, currentTime);
    gl.uniform2f(uniforms.iMouse, pointer.smoothX, pointer.smoothY);
    gl.uniform2f(uniforms.iVelocity, velX, velY);
    gl.uniform1f(uniforms.iPointerStrength, pointerStrength);
    gl.uniform1f(uniforms.iPointerRadius, pointerRadius);
    gl.uniform4fv(uniforms.iRipples, rippleData);
    gl.uniform1i(uniforms.isDarkMode, isDarkMode ? 1 : 0);
    
    // Noise parameters (slowed down)
    gl.uniform1f(uniforms.noiseIntensity, 1.55);
    gl.uniform1f(uniforms.noiseScale, 2.0);
    gl.uniform1f(uniforms.noiseSpeed, 0.05);
    gl.uniform1f(uniforms.waveNoiseIntensity, 1.2);
    gl.uniform1f(uniforms.waveNoiseScale1, 0.5);
    gl.uniform1f(uniforms.waveNoiseScale2, 0.8);
    gl.uniform1f(uniforms.waveNoiseScale3, 1.2);
    gl.uniform1f(uniforms.waveNoiseSpeed1, 0.08);
    gl.uniform1f(uniforms.waveNoiseSpeed2, 0.06);
    gl.uniform1f(uniforms.waveNoiseSpeed3, 0.1);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    animationId = requestAnimationFrame(animate);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
