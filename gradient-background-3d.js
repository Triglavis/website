(() => {
  let canvas, gl;
  let program, positionBuffer;
  let uniforms = {};
  let startTime = Date.now();
  let animationId = null;
  let mouseX = 0.5, mouseY = 0.5;
  let targetMouseX = 0.5, targetMouseY = 0.5;
  let isDarkMode = true;
  let touchPoints = [];
  const MAX_TOUCH_POINTS = 5;

  const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision highp float;
    
    uniform vec3 iResolution;
    uniform float iTime;
    uniform vec2 iMouse;
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
    uniform vec2 touchPoints[${MAX_TOUCH_POINTS}];
    uniform int touchCount;

    #define BLEND_MODE 2
    #define SPEED 2.0
    #define INTENSITY 0.075
    #define MEAN 0.0
    #define VARIANCE 0.5
    #define PI 3.14159265359

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

    // SDF for Triglavis logo shape
    float sdTriglavisLogo(vec2 p) {
      // Scale and center the logo
      p *= 3.0;
      
      // Main rounded rectangle body
      float body = length(max(abs(p) - vec2(0.6, 0.8), 0.0)) - 0.2;
      
      // Three rounded rectangles for the "fingers"
      float finger1 = length(max(abs(p - vec2(-0.4, -0.9)) - vec2(0.15, 0.3), 0.0)) - 0.1;
      float finger2 = length(max(abs(p - vec2(0.0, -0.9)) - vec2(0.15, 0.3), 0.0)) - 0.1;
      float finger3 = length(max(abs(p - vec2(0.4, -0.9)) - vec2(0.15, 0.3), 0.0)) - 0.1;
      
      // Combine shapes
      float logo = min(body, min(finger1, min(finger2, finger3)));
      
      return logo;
    }

    // 3D rotation matrix
    mat3 rotateY(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
    }

    mat3 rotateX(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
    }

    // Calculate repulsion effect from all touch points
    vec2 calculateRepulsion(vec2 p) {
      vec2 totalForce = vec2(0.0);
      
      // Add mouse repulsion
      vec2 mousePos = (iMouse - 0.5) * 2.0;
      float mouseDist = length(p - mousePos);
      float mouseForce = exp(-mouseDist * 3.0) * 0.3;
      vec2 mouseDir = normalize(p - mousePos + vec2(0.001)); // avoid division by zero
      totalForce += mouseDir * mouseForce;
      
      // Add touch point repulsions
      for (int i = 0; i < ${MAX_TOUCH_POINTS}; i++) {
        if (i >= touchCount) break;
        vec2 touchPos = (touchPoints[i] - 0.5) * 2.0;
        float touchDist = length(p - touchPos);
        float touchForce = exp(-touchDist * 3.0) * 0.3;
        vec2 touchDir = normalize(p - touchPos + vec2(0.001));
        totalForce += touchDir * touchForce;
      }
      
      return totalForce;
    }

    vec2 warp(vec2 p) {
      // Apply repulsion effect
      vec2 repulsion = calculateRepulsion(p);
      p += repulsion * 0.15;
      
      float n1 = noise(p * waveNoiseScale1 + vec2(iTime * waveNoiseSpeed1, 0.0));
      float n2 = noise(p * waveNoiseScale1 + vec2(0.0, iTime * waveNoiseSpeed2));
      
      float n3 = noise(p * waveNoiseScale2 + vec2(iTime * -waveNoiseSpeed3, iTime * waveNoiseSpeed3)) * 0.5;
      float n4 = noise(p * waveNoiseScale3 + vec2(iTime * waveNoiseSpeed3, -iTime * waveNoiseSpeed3)) * 0.3;
      
      return p + vec2(n1 + n3, n2 + n4) * waveNoiseIntensity;
    }

    // Liquid smoke simulation
    float liquidSmoke(vec2 p, float time) {
      vec2 flow = vec2(
        snoise(vec3(p * 2.0, time * 0.3)),
        snoise(vec3(p * 2.0 + 100.0, time * 0.3))
      );
      
      p += flow * 0.1;
      
      float smoke = 0.0;
      float amplitude = 0.5;
      float frequency = 2.0;
      
      for (int i = 0; i < 4; i++) {
        smoke += snoise(vec3(p * frequency, time * 0.5)) * amplitude;
        frequency *= 2.1;
        amplitude *= 0.4;
      }
      
      return smoke;
    }

    float gaussian(float z, float u, float o) {
      return (1.0 / (o * sqrt(2.0 * 3.1415))) * exp(-(((z - u) * (z - u)) / (2.0 * (o * o))));
    }

    vec3 overlay(vec3 a, vec3 b, float w) {
      vec3 result;
      
      if (a.r < 0.5) {
        result.r = 2.0 * a.r * b.r;
      } else {
        result.r = 1.0 - 2.0 * (1.0 - a.r) * (1.0 - b.r);
      }
      
      if (a.g < 0.5) {
        result.g = 2.0 * a.g * b.g;
      } else {
        result.g = 1.0 - 2.0 * (1.0 - a.g) * (1.0 - b.g);
      }
      
      if (a.b < 0.5) {
        result.b = 2.0 * a.b * b.b;
      } else {
        result.b = 1.0 - 2.0 * (1.0 - a.b) * (1.0 - b.b);
      }
      
      return mix(a, result, w);
    }

    vec3 multiColorGradient(float t) {
      t = clamp(t, 0.0, 1.0);
      
      float g0, g1, g2, g3, g4, g5, g6;
      
      if (isDarkMode) {
        g0 = 0.092;
        g1 = 0.153;
        g2 = 0.239;
        g3 = 0.459;
        g4 = 0.678;
        g5 = 0.733;
        g6 = 0.945;
      } else {
        g0 = 0.908;
        g1 = 0.847;
        g2 = 0.761;
        g3 = 0.541;
        g4 = 0.322;
        g5 = 0.267;
        g6 = 0.055;
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
      
      // Apply warping with repulsion
      vec2 warpedUv = warp(centeredUv);
      
      // 3D rotation for logo
      float rotY = iTime * 0.2;
      float rotX = sin(iTime * 0.15) * 0.3;
      
      // Transform UV for 3D effect
      vec3 p3d = vec3(centeredUv, 0.0);
      p3d = rotateY(rotY) * p3d;
      p3d = rotateX(rotX) * p3d;
      
      // Project back to 2D with perspective
      vec2 logoUv = p3d.xy / (1.0 + p3d.z * 0.3);
      
      // Calculate logo SDF
      float logoSdf = sdTriglavisLogo(logoUv);
      float logoMask = 1.0 - smoothstep(0.0, 0.02, logoSdf);
      
      // Liquid smoke interaction with logo
      float smoke = liquidSmoke(warpedUv, iTime);
      float logoInfluence = exp(-abs(logoSdf) * 5.0);
      smoke += logoInfluence * sin(iTime * 2.0) * 0.3;
      
      // Apply smoke to warping
      warpedUv += smoke * 0.05 * (1.0 - logoMask * 0.5);
      
      float simplexNoise = snoise(vec3(warpedUv * noiseScale, iTime * noiseSpeed)) * noiseIntensity;
      warpedUv += simplexNoise;
      
      // Wave generation with logo influence
      float phase1 = iTime * 0.6;
      float phase2 = iTime * 0.4;
      
      float distanceFromCenter = length(warpedUv);
      float archFactor = 1.0 - distanceFromCenter * 0.5;

      float wave1 = sin(warpedUv.x * 3.0 + phase1) * 0.5 * archFactor;
      float wave2 = sin(warpedUv.x * 5.0 - phase2) * 0.3 * archFactor;
      float wave3 = sin(warpedUv.y * 4.0 + phase1 * 0.7) * 0.15;
      float parabolicArch = -pow(warpedUv.x, 2.0) * 0.2;

      float breathing = sin(iTime * 0.5) * 0.1 + 0.9;
      float combinedWave = (wave1 + wave2 + wave3 + parabolicArch) * breathing * 0.3;
      
      // Modify waves based on logo presence
      combinedWave *= (1.0 - logoMask * 0.3);
      combinedWave += logoInfluence * smoke * 0.1;
      
      float gradientPos = (uv.y + combinedWave * 0.3);
      float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
      vec3 color = multiColorGradient(smoothGradientPos);
      
      // Blend logo into the scene
      color = mix(color, vec3(0.9), logoMask * 0.1);
      
      // Add subtle glow around logo
      float logoGlow = exp(-abs(logoSdf) * 3.0) * 0.2;
      color += logoGlow * vec3(1.0, 0.98, 0.95);
      
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
    console.log('3D Gradient background initializing...');
    canvas = document.getElementById('gradientCanvas');
    if (!canvas) {
      console.error('Gradient canvas element not found');
      return;
    }
    
    gl = canvas.getContext('webgl', { 
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      canvas.style.background = 'linear-gradient(to bottom, #e6e6e6, #333333)';
      return;
    }
    
    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      console.error('Failed to create shaders');
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
      isDarkMode: gl.getUniformLocation(program, 'isDarkMode'),
      touchPoints: gl.getUniformLocation(program, 'touchPoints'),
      touchCount: gl.getUniformLocation(program, 'touchCount')
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
    
    // Event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('resize', handleResize);
    
    // Always use dark mode
    isDarkMode = true;
    
    // Initial resize after DOM settles
    setTimeout(() => {
      handleResize();
      console.log('3D Gradient background initialized successfully');
      animate();
    }, 100);
  }

  function handleMouseMove(e) {
    targetMouseX = e.clientX / window.innerWidth;
    targetMouseY = 1.0 - (e.clientY / window.innerHeight);
  }

  function handleTouchStart(e) {
    e.preventDefault();
    updateTouchPoints(e.touches);
  }

  function handleTouchMove(e) {
    e.preventDefault();
    updateTouchPoints(e.touches);
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    updateTouchPoints(e.touches);
  }

  function updateTouchPoints(touches) {
    touchPoints = [];
    for (let i = 0; i < Math.min(touches.length, MAX_TOUCH_POINTS); i++) {
      touchPoints.push({
        x: touches[i].clientX / window.innerWidth,
        y: 1.0 - (touches[i].clientY / window.innerHeight)
      });
    }
  }

  function handleResize() {
    if (!canvas || !gl) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
      console.warn('Canvas has zero dimensions, retrying...');
      setTimeout(handleResize, 100);
      return;
    }
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    console.log('Canvas resized:', rect.width, 'x', rect.height);
  }

  function animate() {
    if (!gl || !program || !canvas) {
      console.error('WebGL context lost or not initialized');
      return;
    }
    
    const currentTime = (Date.now() - startTime) * 0.001;
    
    // Smooth mouse movement
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;
    
    // Clear with transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(program);
    
    // Set uniforms
    gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1);
    gl.uniform1f(uniforms.iTime, currentTime);
    gl.uniform2f(uniforms.iMouse, mouseX, mouseY);
    gl.uniform1i(uniforms.isDarkMode, isDarkMode ? 1 : 0);
    
    // Set touch points
    const touchArray = new Float32Array(MAX_TOUCH_POINTS * 2);
    for (let i = 0; i < touchPoints.length; i++) {
      touchArray[i * 2] = touchPoints[i].x;
      touchArray[i * 2 + 1] = touchPoints[i].y;
    }
    gl.uniform2fv(uniforms.touchPoints, touchArray);
    gl.uniform1i(uniforms.touchCount, touchPoints.length);
    
    // Noise parameters
    gl.uniform1f(uniforms.noiseIntensity, 1.2);
    gl.uniform1f(uniforms.noiseScale, 1.8);
    gl.uniform1f(uniforms.noiseSpeed, 0.04);
    gl.uniform1f(uniforms.waveNoiseIntensity, 1.0);
    gl.uniform1f(uniforms.waveNoiseScale1, 0.4);
    gl.uniform1f(uniforms.waveNoiseScale2, 0.7);
    gl.uniform1f(uniforms.waveNoiseScale3, 1.0);
    gl.uniform1f(uniforms.waveNoiseSpeed1, 0.07);
    gl.uniform1f(uniforms.waveNoiseSpeed2, 0.05);
    gl.uniform1f(uniforms.waveNoiseSpeed3, 0.08);
    
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