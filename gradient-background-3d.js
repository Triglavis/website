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

    // Helper function for rounded rectangle SDF
    float sdRoundedRect(vec2 p, vec2 size, float radius) {
      vec2 d = abs(p) - size + radius;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
    }
    
    // 3D rounded box SDF
    float sdRoundBox(vec3 p, vec3 size, float radius) {
      vec3 d = abs(p) - size + radius;
      return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - radius;
    }

    // Simple approach: use the same logo that's already working in the HTML
    // Just create a 2D mask that matches the visible logo position and extrude it
    float sdTriglavisLogo2D(vec2 p) {
      // The HTML logo is centered and has a specific size
      // Let's create a simple approximation that matches what we see
      
      // Scale to match the visible logo size (roughly)
      p *= 3.0;
      
      // Recreate the basic shape we can see in the screenshot:
      // Top horizontal bar
      vec2 topBar = p - vec2(0.0, 0.4);
      float top = sdRoundedRect(topBar, vec2(0.6, 0.08), 0.04);
      
      // Left pillar  
      vec2 leftPillar = p - vec2(-0.45, -0.1);
      float left = sdRoundedRect(leftPillar, vec2(0.08, 0.4), 0.04);
      
      // Right pillar
      vec2 rightPillar = p - vec2(0.45, -0.1);
      float right = sdRoundedRect(rightPillar, vec2(0.08, 0.4), 0.04);
      
      // Center vertical stem
      vec2 centerStem = p - vec2(0.0, 0.0);
      float center = sdRoundedRect(centerStem, vec2(0.06, 0.3), 0.03);
      
      // Bottom triangle/diamond
      vec2 diamond = p - vec2(0.0, -0.45);
      float bottomShape = abs(diamond.x) + abs(diamond.y) * 1.2 - 0.08;
      
      // T-bar connections (the curved parts)
      vec2 leftConn = p - vec2(-0.25, 0.25);
      float leftConnection = sdRoundedRect(leftConn, vec2(0.04, 0.08), 0.02);
      
      vec2 rightConn = p - vec2(0.25, 0.25);
      float rightConnection = sdRoundedRect(rightConn, vec2(0.04, 0.08), 0.02);
      
      // Combine all parts
      float pillars = min(left, right);
      float connections = min(leftConnection, rightConnection);
      float centerParts = min(center, bottomShape);
      
      return min(top, min(pillars, min(connections, centerParts)));
    }
    
    // 3D SDF for extruded Triglavis logo
    float sdTriglavisLogo3D(vec3 p) {
      // Extrude the 2D shape along Z axis
      float depth = 0.15; // Extrusion depth
      
      // Get 2D distance
      float d2d = sdTriglavisLogo2D(p.xy);
      
      // Extrude along Z with rounded edges
      float dz = abs(p.z) - depth;
      
      // Combine 2D and Z distances for extrusion
      return max(d2d, dz);
    }
    
    // Calculate normal for 3D SDF
    vec3 calcNormal(vec3 p) {
      vec2 e = vec2(0.001, 0.0);
      return normalize(vec3(
        sdTriglavisLogo3D(p + e.xyy) - sdTriglavisLogo3D(p - e.xyy),
        sdTriglavisLogo3D(p + e.yxy) - sdTriglavisLogo3D(p - e.yxy),
        sdTriglavisLogo3D(p + e.yyx) - sdTriglavisLogo3D(p - e.yyx)
      ));
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
      // Convert mouse coordinates to centered UV space matching the shader coordinates
      vec2 mousePos = vec2(iMouse.x - 0.5, iMouse.y - 0.5) * 2.0;
      // Adjust for aspect ratio
      mousePos.x *= iResolution.x / iResolution.y;
      
      float mouseDist = length(p - mousePos);
      float mouseForce = exp(-mouseDist * 3.0) * 0.3;
      vec2 mouseDir = normalize(p - mousePos + vec2(0.001)); // avoid division by zero
      totalForce += mouseDir * mouseForce;
      
      // Add touch point repulsions
      for (int i = 0; i < ${MAX_TOUCH_POINTS}; i++) {
        if (i >= touchCount) break;
        vec2 touchPos = vec2(touchPoints[i].x - 0.5, touchPoints[i].y - 0.5) * 2.0;
        touchPos.x *= iResolution.x / iResolution.y;
        
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

    // Ray marching function
    float rayMarch(vec3 ro, vec3 rd) {
      float t = 0.0;
      for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        float d = sdTriglavisLogo3D(p);
        if (d < 0.001 || t > 5.0) break;
        t += d * 0.8;
      }
      return t;
    }
    
    // Soft shadow calculation
    float softShadow(vec3 ro, vec3 rd, float mint, float maxt) {
      float res = 1.0;
      float t = mint;
      for (int i = 0; i < 16; i++) {
        float h = sdTriglavisLogo3D(ro + rd * t);
        res = min(res, 8.0 * h / t);
        t += clamp(h, 0.02, 0.1);
        if (h < 0.001 || t > maxt) break;
      }
      return clamp(res, 0.0, 1.0);
    }
    
    // Ambient occlusion
    float ambientOcclusion(vec3 p, vec3 n) {
      float occ = 0.0;
      float sca = 1.0;
      for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.11 * float(i) / 4.0;
        float d = sdTriglavisLogo3D(p + h * n);
        occ += (h - d) * sca;
        sca *= 0.95;
      }
      return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
    }

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      vec2 uv = fragCoord / iResolution.xy;
      vec2 centeredUv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
      
      // Apply warping with repulsion
      vec2 warpedUv = warp(centeredUv);
      
      // Setup camera for 3D ray marching
      vec3 ro = vec3(0.0, 0.0, 2.0); // Camera position
      vec3 rd = normalize(vec3(centeredUv, -1.0)); // Ray direction
      
      // Ray march to find logo intersection
      float t = rayMarch(ro, rd);
      vec3 pos = ro + rd * t;
      
      // Calculate gradient background
      float smoke = liquidSmoke(warpedUv, iTime);
      float simplexNoise = snoise(vec3(warpedUv * noiseScale, iTime * noiseSpeed)) * noiseIntensity;
      warpedUv += simplexNoise + smoke * 0.05;
      
      // Wave generation
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
      
      float gradientPos = (uv.y + combinedWave * 0.3);
      float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
      vec3 bgColor = multiColorGradient(smoothGradientPos);
      
      // Check if we hit the logo
      if (t < 5.0) {
        // Calculate normal and lighting
        vec3 normal = calcNormal(pos);
        
        // Lighting setup
        vec3 lightPos = vec3(2.0, 3.0, 4.0);
        vec3 lightDir = normalize(lightPos - pos);
        vec3 viewDir = normalize(ro - pos);
        vec3 halfDir = normalize(lightDir + viewDir);
        
        // Material properties
        vec3 albedo = vec3(0.95, 0.93, 0.91); // Slightly off-white
        float metallic = 0.7;
        float roughness = 0.3;
        
        // Diffuse lighting
        float NdotL = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = albedo * NdotL;
        
        // Specular lighting (Blinn-Phong approximation)
        float NdotH = max(dot(normal, halfDir), 0.0);
        float specular = pow(NdotH, 32.0) * (1.0 - roughness);
        
        // Fresnel effect
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
        
        // Ambient occlusion
        float ao = ambientOcclusion(pos, normal);
        
        // Shadows
        vec3 shadowOrigin = pos + normal * 0.002;
        float shadow = softShadow(shadowOrigin, lightDir, 0.02, 3.0);
        
        // Environment reflection (fake)
        vec3 reflectDir = reflect(-viewDir, normal);
        vec3 envColor = bgColor * 0.5;
        
        // Combine lighting
        vec3 color = vec3(0.0);
        color += diffuse * shadow * 0.7;
        color += specular * shadow * metallic;
        color += envColor * fresnel * metallic;
        color += albedo * 0.1 * ao; // Ambient
        
        // Blend with background based on depth
        float fogFactor = exp(-t * 0.3);
        color = mix(bgColor, color, fogFactor);
        
        // Add rim lighting
        float rim = 1.0 - max(dot(normal, viewDir), 0.0);
        rim = pow(rim, 3.0);
        color += rim * 0.3 * vec3(1.0, 0.98, 0.95);
        
        gl_FragColor = vec4(applyGrain(color, uv), 1.0);
      } else {
        // No intersection, show background
        gl_FragColor = vec4(applyGrain(bgColor, uv), 1.0);
      }
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