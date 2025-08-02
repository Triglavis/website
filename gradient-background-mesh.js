(() => {
  let canvas, gl;
  let bgProgram, logoProgram;
  let bgPositionBuffer, logoVertexBuffer, logoNormalBuffer, logoIndexBuffer;
  let bgUniforms = {}, logoUniforms = {};
  let startTime = Date.now();
  let animationId = null;
  let mouseX = 0.5, mouseY = 0.5;
  let targetMouseX = 0.5, targetMouseY = 0.5;
  let isDarkMode = true;
  let touchPoints = [];
  let logoMesh = null;
  const MAX_TOUCH_POINTS = 5;

  // Matrix utilities
  function createMatrix4() {
    return new Float32Array(16);
  }

  function identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
    return out;
  }

  function lookAt(out, eye, center, up) {
    const f = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
    const fLen = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    f[0] /= fLen; f[1] /= fLen; f[2] /= fLen;
    
    const s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const sLen = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
    s[0] /= sLen; s[1] /= sLen; s[2] /= sLen;
    
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    
    out[0] = s[0]; out[1] = u[0]; out[2] = -f[0]; out[3] = 0;
    out[4] = s[1]; out[5] = u[1]; out[6] = -f[1]; out[7] = 0;
    out[8] = s[2]; out[9] = u[2]; out[10] = -f[2]; out[11] = 0;
    out[12] = -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]);
    out[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
    out[14] = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2];
    out[15] = 1;
    return out;
  }

  function translate(out, a, v) {
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
    out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
    out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
    out[12] = a[0] * v[0] + a[4] * v[1] + a[8] * v[2] + a[12];
    out[13] = a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13];
    out[14] = a[2] * v[0] + a[6] * v[1] + a[10] * v[2] + a[14];
    out[15] = a[3] * v[0] + a[7] * v[1] + a[11] * v[2] + a[15];
    return out;
  }

  function scale(out, a, v) {
    out[0] = a[0] * v[0]; out[1] = a[1] * v[0]; out[2] = a[2] * v[0]; out[3] = a[3] * v[0];
    out[4] = a[4] * v[1]; out[5] = a[5] * v[1]; out[6] = a[6] * v[1]; out[7] = a[7] * v[1];
    out[8] = a[8] * v[2]; out[9] = a[9] * v[2]; out[10] = a[10] * v[2]; out[11] = a[11] * v[2];
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  }

  // Background gradient shader (same as before but simplified)
  const bgVertexShaderSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const bgFragmentShaderSource = `
    precision mediump float;
    
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
    uniform vec3 logoPosition;
    uniform vec3 logoScale;

    #define BLEND_MODE 2
    #define SPEED 2.0
    #define INTENSITY 0.075
    #define MEAN 0.0
    #define VARIANCE 0.5

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

    // Enhanced interaction with visual feedback
    vec2 calculateRepulsion(vec2 p) {
      vec2 totalForce = vec2(0.0);
      
      // Mouse repulsion with enhanced effect
      vec2 mousePos = vec2(iMouse.x - 0.5, iMouse.y - 0.5) * 2.0;
      mousePos.x *= iResolution.x / iResolution.y;
      
      float mouseDist = length(p - mousePos);
      // Stronger, more visible repulsion
      float mouseForce = exp(-mouseDist * 2.0) * 0.8;
      // Add pulsing effect for visibility
      mouseForce *= (1.0 + sin(iTime * 8.0) * 0.3);
      vec2 mouseDir = normalize(p - mousePos + vec2(0.001));
      totalForce += mouseDir * mouseForce;
      
      // Touch point repulsion with enhanced effects
      for (int i = 0; i < ${MAX_TOUCH_POINTS}; i++) {
        if (i >= touchCount) break;
        vec2 touchPos = vec2(touchPoints[i].x - 0.5, touchPoints[i].y - 0.5) * 2.0;
        touchPos.x *= iResolution.x / iResolution.y;
        
        float touchDist = length(p - touchPos);
        // Stronger touch repulsion
        float touchForce = exp(-touchDist * 1.8) * 0.9;
        // Add ripple effect from touch points
        touchForce *= (1.0 + sin(touchDist * 10.0 - iTime * 6.0) * 0.4);
        vec2 touchDir = normalize(p - touchPos + vec2(0.001));
        totalForce += touchDir * touchForce;
      }
      
      return totalForce;
    }
    
    // Enhanced liquid smoke simulation
    float liquidSmoke(vec2 p, float time) {
      // Multi-layered smoke with different scales
      vec2 flow1 = vec2(
        snoise(vec3(p * 1.5, time * 0.3)),
        snoise(vec3(p * 1.5 + 100.0, time * 0.3))
      );
      
      vec2 flow2 = vec2(
        snoise(vec3(p * 3.0, time * 0.5)),
        snoise(vec3(p * 3.0 + 200.0, time * 0.5))
      );
      
      vec2 flow3 = vec2(
        snoise(vec3(p * 6.0, time * 0.7)),
        snoise(vec3(p * 6.0 + 300.0, time * 0.7))
      );
      
      // Combine flows for complex motion
      vec2 combinedFlow = flow1 * 0.5 + flow2 * 0.3 + flow3 * 0.2;
      p += combinedFlow * 0.15;
      
      float smoke = 0.0;
      float amplitude = 0.6;
      float frequency = 1.5;
      
      // Multiple octaves for detailed smoke
      for (int i = 0; i < 6; i++) {
        smoke += snoise(vec3(p * frequency, time * 0.4)) * amplitude;
        frequency *= 2.2;
        amplitude *= 0.35;
      }
      
      return smoke;
    }

    // Check if point is inside logo bounds
    float getLogoDistance(vec2 p) {
      // Convert to logo space
      vec2 logoSpaceP = p / logoScale.xy;
      
      // Simple rectangular bounds for logo (will be refined)
      vec2 logoSize = vec2(0.8, 1.0);
      vec2 d = abs(logoSpaceP) - logoSize;
      float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      
      return dist;
    }
    
    // Calculate logo repulsion for fluid dynamics
    vec2 calculateLogoRepulsion(vec2 p) {
      float logoDist = getLogoDistance(p);
      float logoForce = exp(-logoDist * 8.0) * 1.2;
      
      // Calculate gradient for repulsion direction
      vec2 e = vec2(0.001, 0.0);
      vec2 grad = vec2(
        getLogoDistance(p + e.xy) - getLogoDistance(p - e.xy),
        getLogoDistance(p + e.yx) - getLogoDistance(p - e.yx)
      );
      vec2 logoDir = normalize(grad + vec2(0.001));
      
      return logoDir * logoForce;
    }
    
    vec2 warp(vec2 p) {
      vec2 repulsion = calculateRepulsion(p);
      vec2 logoRepulsion = calculateLogoRepulsion(p);
      
      // Combine repulsions
      p += repulsion * 0.15 + logoRepulsion * 0.3;
      
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
      
      float g0 = 0.092, g1 = 0.153, g2 = 0.239, g3 = 0.459, g4 = 0.678, g5 = 0.733, g6 = 0.945;
      
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
      
      // Calculate interaction zones for visual feedback
      vec2 mousePos = vec2(iMouse.x - 0.5, iMouse.y - 0.5) * 2.0;
      mousePos.x *= iResolution.x / iResolution.y;
      float mouseDist = length(centeredUv - mousePos);
      
      // Enhanced smoke simulation with interaction
      float smoke = liquidSmoke(centeredUv, iTime);
      
      // Apply warping with enhanced repulsion
      vec2 warpedUv = warp(centeredUv);
      
      // Modify smoke flow based on logo collision
      float logoDist = getLogoDistance(centeredUv);
      float logoInfluence = exp(-logoDist * 5.0);
      
      // Create swirling effect around logo
      float swirlAngle = atan(centeredUv.y, centeredUv.x) + logoDist * 2.0 + iTime * 0.5;
      vec2 swirlFlow = vec2(cos(swirlAngle), sin(swirlAngle)) * logoInfluence * 0.1;
      
      // Add smoke influence to warping with logo flow
      warpedUv += smoke * 0.08 * (1.0 - logoInfluence * 0.5) + swirlFlow;
      
      float simplexNoise = snoise(vec3(warpedUv * noiseScale, iTime * noiseSpeed)) * noiseIntensity;
      warpedUv += simplexNoise;
      
      // Enhanced wave generation with interaction feedback
      float phase1 = iTime * 0.6;
      float phase2 = iTime * 0.4;
      
      float distanceFromCenter = length(warpedUv);
      float archFactor = 1.0 - distanceFromCenter * 0.5;

      // Add interaction ripples to waves
      float interactionRipple = exp(-mouseDist * 4.0) * sin(mouseDist * 15.0 - iTime * 8.0) * 0.1;
      
      float wave1 = sin(warpedUv.x * 3.0 + phase1) * 0.5 * archFactor;
      float wave2 = sin(warpedUv.x * 5.0 - phase2) * 0.3 * archFactor;
      float wave3 = sin(warpedUv.y * 4.0 + phase1 * 0.7) * 0.15;
      float parabolicArch = -pow(warpedUv.x, 2.0) * 0.2;

      float breathing = sin(iTime * 0.5) * 0.1 + 0.9;
      float combinedWave = (wave1 + wave2 + wave3 + parabolicArch + interactionRipple) * breathing * 0.3;
      
      // Add touch ripples for multiple touch points
      for (int i = 0; i < ${MAX_TOUCH_POINTS}; i++) {
        if (i >= touchCount) break;
        vec2 touchPos = vec2(touchPoints[i].x - 0.5, touchPoints[i].y - 0.5) * 2.0;
        touchPos.x *= iResolution.x / iResolution.y;
        float touchDist = length(centeredUv - touchPos);
        float touchRipple = exp(-touchDist * 3.0) * sin(touchDist * 12.0 - iTime * 10.0) * 0.08;
        combinedWave += touchRipple;
      }
      
      float gradientPos = (uv.y + combinedWave * 0.3);
      float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
      vec3 color = multiColorGradient(smoothGradientPos);
      
      // Add visual feedback for interaction zones
      float interactionGlow = exp(-mouseDist * 6.0) * 0.15 * (1.0 + sin(iTime * 12.0) * 0.5);
      color += interactionGlow * vec3(1.0, 0.95, 0.9);
      
      // Add touch point glows
      for (int i = 0; i < ${MAX_TOUCH_POINTS}; i++) {
        if (i >= touchCount) break;
        vec2 touchPos = vec2(touchPoints[i].x - 0.5, touchPoints[i].y - 0.5) * 2.0;
        touchPos.x *= iResolution.x / iResolution.y;
        float touchDist = length(centeredUv - touchPos);
        float touchGlow = exp(-touchDist * 5.0) * 0.2 * (1.0 + sin(iTime * 15.0) * 0.6);
        color += touchGlow * vec3(0.9, 1.0, 0.95);
      }
      
      gl_FragColor = vec4(applyGrain(color, uv), 1.0);
    }
  `;

  // 3D Logo shaders
  const logoVertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_normalMatrix;
    
    varying vec3 v_position;
    varying vec3 v_normal;
    varying vec3 v_worldPosition;
    
    void main() {
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      v_worldPosition = worldPosition.xyz;
      v_position = a_position;
      v_normal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);
      
      gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;
    }
  `;

  const logoFragmentShaderSource = `
    #extension GL_OES_standard_derivatives : enable
    precision highp float;
    
    uniform vec3 u_lightPosition;
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightColor;
    uniform vec3 u_materialColor;
    uniform float u_metallic;
    uniform float u_roughness;
    uniform vec3 u_resolution;
    
    varying vec3 v_position;
    varying vec3 v_normal;
    varying vec3 v_worldPosition;
    
    #define FXAA_REDUCE_MIN (1.0/128.0)
    #define FXAA_REDUCE_MUL (1.0/8.0)
    #define FXAA_SPAN_MAX 8.0
    
    // Anti-aliasing function for smooth edges
    float aastep(float threshold, float value) {
      #ifdef GL_OES_standard_derivatives
        float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
        return smoothstep(threshold - afwidth, threshold + afwidth, value);
      #else
        return step(threshold, value);
      #endif
    }
    
    // Enhanced normal calculation with smoothing
    vec3 calculateSmoothNormal(vec3 pos, vec3 normal) {
      #ifdef GL_OES_standard_derivatives
        vec3 fdx = dFdx(pos);
        vec3 fdy = dFdy(pos);
        vec3 smoothNormal = normalize(cross(fdx, fdy));
        
        // Blend between mesh normal and calculated normal for smoothing
        float blendFactor = 0.3;
        return normalize(mix(normal, smoothNormal, blendFactor));
      #else
        return normalize(normal);
      #endif
    }
    
    // Enhanced PBR lighting with anti-aliasing
    vec3 calculateLighting(vec3 normal, vec3 viewDir, vec3 lightDir) {
      vec3 halfDir = normalize(lightDir + viewDir);
      
      // Smooth diffuse with anti-aliasing
      float NdotL = dot(normal, lightDir);
      float diffuseSmooth = aastep(0.0, NdotL);
      vec3 diffuse = u_materialColor * u_lightColor * diffuseSmooth * max(NdotL, 0.0);
      
      // Enhanced specular with multiple lobes for smoothness
      float NdotH = max(dot(normal, halfDir), 0.0);
      float NdotV = max(dot(normal, viewDir), 0.0);
      float VdotH = max(dot(viewDir, halfDir), 0.0);
      
      // Multiple specular lobes for smoother appearance
      float specular1 = pow(NdotH, 64.0) * (1.0 - u_roughness);
      float specular2 = pow(NdotH, 128.0) * (1.0 - u_roughness) * 0.5;
      float specular3 = pow(NdotH, 256.0) * (1.0 - u_roughness) * 0.25;
      float specular = (specular1 + specular2 + specular3) * u_metallic;
      
      // Enhanced Fresnel with smoothing
      float fresnel = pow(1.0 - NdotV, 2.0);
      fresnel = mix(fresnel, 1.0, u_metallic * 0.5);
      
      // Rim lighting for edge enhancement
      float rim = 1.0 - NdotV;
      rim = aastep(0.5, rim) * pow(rim, 3.0);
      
      // Subsurface scattering approximation for smoothness
      float subsurface = pow(max(0.0, dot(-lightDir, viewDir)), 4.0) * 0.2;
      
      return diffuse + vec3(specular) * u_lightColor + 
             fresnel * u_metallic * 0.3 + 
             rim * 0.2 * vec3(1.0, 0.98, 0.95) +
             subsurface * u_materialColor;
    }
    
    void main() {
      // Enhanced normal with smoothing
      vec3 normal = calculateSmoothNormal(v_worldPosition, v_normal);
      vec3 lightDir = normalize(u_lightPosition - v_worldPosition);
      vec3 viewDir = normalize(u_viewPosition - v_worldPosition);
      
      // Calculate screen-space derivatives for edge detection
      #ifdef GL_OES_standard_derivatives
        vec3 fdx = dFdx(v_worldPosition);
        vec3 fdy = dFdy(v_worldPosition);
        float edgeDetect = length(fdx) + length(fdy);
        
        // Use edge detection for alpha blending
        float edgeAlpha = 1.0 - smoothstep(0.0, 0.01, edgeDetect);
        edgeAlpha = mix(0.95, 1.0, edgeAlpha); // Subtle edge transparency
      #else
        float edgeAlpha = 1.0;
      #endif
      
      // Simple bright white base
      vec3 baseColor = vec3(1.0, 1.0, 1.0);
      
      // Very subtle shading to maintain form
      float NdotL = max(dot(normal, lightDir), 0.0);
      float shading = mix(0.98, 1.0, NdotL); // Even more subtle
      
      // Soft edge glow based on viewing angle
      float NdotV = max(dot(normal, viewDir), 0.0);
      float edgeFactor = 1.0 - NdotV;
      float edgeGlow = pow(edgeFactor, 4.0) * 0.03; // Very soft edge glow
      
      // Bright white with minimal variation
      vec3 finalColor = baseColor * shading + edgeGlow;
      
      // Ensure we stay bright white
      finalColor = clamp(finalColor, vec3(0.98), vec3(1.0));
      
      // Apply edge alpha for anti-aliasing
      gl_FragColor = vec4(finalColor, edgeAlpha);
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

  async function loadGLTF() {
    try {
      const response = await fetch('./3dtriglav.glb');
      const buffer = await response.arrayBuffer();
      const view = new DataView(buffer);
      let offset = 0;

      // Read GLB header
      const magic = view.getUint32(offset, true);
      offset += 4;
      if (magic !== 0x46546C67) { // 'glTF'
        throw new Error('Invalid GLB file');
      }

      const version = view.getUint32(offset, true);
      offset += 4;
      const length = view.getUint32(offset, true);
      offset += 4;

      // Read JSON chunk
      const jsonChunkLength = view.getUint32(offset, true);
      offset += 4;
      const jsonChunkType = view.getUint32(offset, true);
      offset += 4;

      const jsonBytes = new Uint8Array(buffer, offset, jsonChunkLength);
      const jsonText = new TextDecoder().decode(jsonBytes);
      const gltf = JSON.parse(jsonText);
      offset += jsonChunkLength;

      // Read binary chunk
      const binChunkLength = view.getUint32(offset, true);
      offset += 4;
      const binChunkType = view.getUint32(offset, true);
      offset += 4;

      const binData = new ArrayBuffer(binChunkLength);
      new Uint8Array(binData).set(new Uint8Array(buffer, offset, binChunkLength));

      // Extract mesh data
      const vertices = [];
      const normals = [];
      const indices = [];

      // Get the first mesh
      const mesh = gltf.meshes[0];
      const primitive = mesh.primitives[0];

      // Extract position data
      const posAccessor = gltf.accessors[primitive.attributes.POSITION];
      const posBufferView = gltf.bufferViews[posAccessor.bufferView];
      const posData = new Float32Array(
        binData,
        posBufferView.byteOffset || 0,
        posAccessor.count * 3
      );

      // Extract normal data (GLTF files should have smooth normals)
      let normData;
      if (primitive.attributes.NORMAL !== undefined) {
        const normAccessor = gltf.accessors[primitive.attributes.NORMAL];
        const normBufferView = gltf.bufferViews[normAccessor.bufferView];
        normData = new Float32Array(
          binData,
          normBufferView.byteOffset || 0,
          normAccessor.count * 3
        );
      }

      // Extract indices
      let indexData;
      if (primitive.indices !== undefined) {
        const indexAccessor = gltf.accessors[primitive.indices];
        const indexBufferView = gltf.bufferViews[indexAccessor.bufferView];
        
        if (indexAccessor.componentType === 5123) { // UNSIGNED_SHORT
          indexData = new Uint16Array(
            binData,
            indexBufferView.byteOffset || 0,
            indexAccessor.count
          );
        } else if (indexAccessor.componentType === 5125) { // UNSIGNED_INT
          const uint32Data = new Uint32Array(
            binData,
            indexBufferView.byteOffset || 0,
            indexAccessor.count
          );
          // Convert to Uint16 for WebGL compatibility
          indexData = new Uint16Array(indexAccessor.count);
          for (let i = 0; i < indexAccessor.count; i++) {
            indexData[i] = uint32Data[i];
          }
        }
      }

      // If no indices, create them
      if (!indexData) {
        indexData = new Uint16Array(posData.length / 3);
        for (let i = 0; i < indexData.length; i++) {
          indexData[i] = i;
        }
      }

      // Calculate bounds for auto-scaling
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (let i = 0; i < posData.length; i += 3) {
        minX = Math.min(minX, posData[i]);
        maxX = Math.max(maxX, posData[i]);
        minY = Math.min(minY, posData[i + 1]);
        maxY = Math.max(maxY, posData[i + 1]);
        minZ = Math.min(minZ, posData[i + 2]);
        maxZ = Math.max(maxZ, posData[i + 2]);
      }

      const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
      const scale = 2.0 / size; // Normalize to fit in view

      console.log('Loaded GLTF with', posData.length / 3, 'vertices');

      return {
        vertices: posData,
        normals: normData || posData, // Fallback if no normals
        indices: indexData,
        scale: scale,
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
      };
    } catch (error) {
      console.error('Failed to load GLTF:', error);
      return null;
    }
  }

  async function init() {
    console.log('3D Mesh gradient background initializing...');
    canvas = document.getElementById('gradientCanvas');
    if (!canvas) {
      console.error('Gradient canvas element not found');
      return;
    }
    
    gl = canvas.getContext('webgl', { 
      alpha: true,
      antialias: true,
      depth: true,
      stencil: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      canvas.style.background = 'linear-gradient(to bottom, #e6e6e6, #333333)';
      return;
    }

    // Enable depth testing and anti-aliasing features
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    
    // Set better depth function for smoother edges
    gl.depthFunc(gl.LEQUAL);
    
    // Enable sample coverage for MSAA
    if (gl.getParameter(gl.SAMPLES) > 1) {
      gl.enable(gl.SAMPLE_COVERAGE);
      gl.sampleCoverage(1.0, false);
    }
    
    // Load GLTF
    logoMesh = await loadGLTF();
    if (!logoMesh) {
      console.error('Failed to load logo mesh');
      return;
    }
    
    // Create background program
    const bgVertexShader = createShader(gl, gl.VERTEX_SHADER, bgVertexShaderSource);
    const bgFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, bgFragmentShaderSource);
    bgProgram = createProgram(gl, bgVertexShader, bgFragmentShader);
    
    // Create logo program
    const logoVertexShader = createShader(gl, gl.VERTEX_SHADER, logoVertexShaderSource);
    const logoFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, logoFragmentShaderSource);
    logoProgram = createProgram(gl, logoVertexShader, logoFragmentShader);
    
    if (!bgProgram || !logoProgram) {
      console.error('Failed to create shader programs');
      return;
    }
    
    // Setup background uniforms
    bgUniforms = {
      iResolution: gl.getUniformLocation(bgProgram, 'iResolution'),
      iTime: gl.getUniformLocation(bgProgram, 'iTime'),
      iMouse: gl.getUniformLocation(bgProgram, 'iMouse'),
      noiseIntensity: gl.getUniformLocation(bgProgram, 'noiseIntensity'),
      noiseScale: gl.getUniformLocation(bgProgram, 'noiseScale'),
      noiseSpeed: gl.getUniformLocation(bgProgram, 'noiseSpeed'),
      waveNoiseIntensity: gl.getUniformLocation(bgProgram, 'waveNoiseIntensity'),
      waveNoiseScale1: gl.getUniformLocation(bgProgram, 'waveNoiseScale1'),
      waveNoiseScale2: gl.getUniformLocation(bgProgram, 'waveNoiseScale2'),
      waveNoiseScale3: gl.getUniformLocation(bgProgram, 'waveNoiseScale3'),
      waveNoiseSpeed1: gl.getUniformLocation(bgProgram, 'waveNoiseSpeed1'),
      waveNoiseSpeed2: gl.getUniformLocation(bgProgram, 'waveNoiseSpeed2'),
      waveNoiseSpeed3: gl.getUniformLocation(bgProgram, 'waveNoiseSpeed3'),
      isDarkMode: gl.getUniformLocation(bgProgram, 'isDarkMode'),
      touchPoints: gl.getUniformLocation(bgProgram, 'touchPoints'),
      touchCount: gl.getUniformLocation(bgProgram, 'touchCount'),
      logoPosition: gl.getUniformLocation(bgProgram, 'logoPosition'),
      logoScale: gl.getUniformLocation(bgProgram, 'logoScale')
    };
    
    // Setup logo uniforms
    logoUniforms = {
      projectionMatrix: gl.getUniformLocation(logoProgram, 'u_projectionMatrix'),
      viewMatrix: gl.getUniformLocation(logoProgram, 'u_viewMatrix'),
      modelMatrix: gl.getUniformLocation(logoProgram, 'u_modelMatrix'),
      normalMatrix: gl.getUniformLocation(logoProgram, 'u_normalMatrix'),
      lightPosition: gl.getUniformLocation(logoProgram, 'u_lightPosition'),
      viewPosition: gl.getUniformLocation(logoProgram, 'u_viewPosition'),
      lightColor: gl.getUniformLocation(logoProgram, 'u_lightColor'),
      materialColor: gl.getUniformLocation(logoProgram, 'u_materialColor'),
      metallic: gl.getUniformLocation(logoProgram, 'u_metallic'),
      roughness: gl.getUniformLocation(logoProgram, 'u_roughness'),
      resolution: gl.getUniformLocation(logoProgram, 'u_resolution')
    };
    
    // Create background quad
    bgPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgPositionBuffer);
    const bgPositions = [-1, -1, 1, -1, -1, 1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bgPositions), gl.STATIC_DRAW);
    
    // Create logo buffers
    logoVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, logoVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, logoMesh.vertices, gl.STATIC_DRAW);
    
    logoNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, logoNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, logoMesh.normals, gl.STATIC_DRAW);
    
    logoIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, logoIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, logoMesh.indices, gl.STATIC_DRAW);
    
    // Event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('resize', handleResize);
    
    isDarkMode = true;
    
    setTimeout(() => {
      handleResize();
      console.log('3D Mesh gradient background initialized successfully');
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
    
    // Use higher DPR for better anti-aliasing on high-DPI displays
    const dpr = window.devicePixelRatio || 1; // Use full device pixel ratio
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
      setTimeout(handleResize, 100);
      return;
    }
    
    // Use aggressive supersampling for smoother edges
    const supersample = 2.0; // Doubled from 1.5
    canvas.width = rect.width * dpr * supersample;
    canvas.height = rect.height * dpr * supersample;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function animate() {
    if (!gl || !bgProgram || !logoProgram || !logoMesh) return;
    
    const currentTime = (Date.now() - startTime) * 0.001;
    
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;
    
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Render background
    gl.useProgram(bgProgram);
    gl.disable(gl.DEPTH_TEST);
    
    const bgPositionLocation = gl.getAttribLocation(bgProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, bgPositionBuffer);
    gl.enableVertexAttribArray(bgPositionLocation);
    gl.vertexAttribPointer(bgPositionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform3f(bgUniforms.iResolution, canvas.width, canvas.height, 1);
    gl.uniform1f(bgUniforms.iTime, currentTime);
    gl.uniform2f(bgUniforms.iMouse, mouseX, mouseY);
    gl.uniform1i(bgUniforms.isDarkMode, 1);
    gl.uniform1f(bgUniforms.noiseIntensity, 1.55);
    gl.uniform1f(bgUniforms.noiseScale, 2.0);
    gl.uniform1f(bgUniforms.noiseSpeed, 0.05);
    gl.uniform1f(bgUniforms.waveNoiseIntensity, 1.2);
    gl.uniform1f(bgUniforms.waveNoiseScale1, 0.5);
    gl.uniform1f(bgUniforms.waveNoiseScale2, 0.8);
    gl.uniform1f(bgUniforms.waveNoiseScale3, 1.2);
    gl.uniform1f(bgUniforms.waveNoiseSpeed1, 0.08);
    gl.uniform1f(bgUniforms.waveNoiseSpeed2, 0.06);
    gl.uniform1f(bgUniforms.waveNoiseSpeed3, 0.1);
    
    const touchArray = new Float32Array(MAX_TOUCH_POINTS * 2);
    for (let i = 0; i < touchPoints.length; i++) {
      touchArray[i * 2] = touchPoints[i].x;
      touchArray[i * 2 + 1] = touchPoints[i].y;
    }
    gl.uniform2fv(bgUniforms.touchPoints, touchArray);
    gl.uniform1i(bgUniforms.touchCount, touchPoints.length);
    
    // Pass logo information for collision detection
    gl.uniform3f(bgUniforms.logoPosition, 0.0, 0.0, 0.0);
    gl.uniform3f(bgUniforms.logoScale, 0.15, 0.15, 0.15);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Render 3D logo
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(logoProgram);
    
    // Setup matrices
    const projectionMatrix = createMatrix4();
    const viewMatrix = createMatrix4();
    const modelMatrix = createMatrix4();
    const normalMatrix = createMatrix4();
    
    const aspect = canvas.width / canvas.height;
    perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 100.0);
    lookAt(viewMatrix, [0, 0, 3], [0, 0, 0], [0, 1, 0]);
    
    identity(modelMatrix);
    // Use auto-calculated scale and center the mesh
    const meshScale = logoMesh.scale * 0.5; // Adjust size as needed
    scale(modelMatrix, modelMatrix, [meshScale, meshScale, meshScale]);
    // Center the mesh
    translate(modelMatrix, modelMatrix, [
      -logoMesh.center[0] * meshScale,
      -logoMesh.center[1] * meshScale,
      -logoMesh.center[2] * meshScale
    ]);
    
    identity(normalMatrix); // Simplified - should be inverse transpose of model matrix
    
    // Set uniforms
    gl.uniformMatrix4fv(logoUniforms.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(logoUniforms.viewMatrix, false, viewMatrix);
    gl.uniformMatrix4fv(logoUniforms.modelMatrix, false, modelMatrix);
    gl.uniformMatrix4fv(logoUniforms.normalMatrix, false, normalMatrix);
    
    gl.uniform3f(logoUniforms.lightPosition, 3.0, 3.0, 5.0);
    gl.uniform3f(logoUniforms.viewPosition, 0.0, 0.0, 3.0);
    gl.uniform3f(logoUniforms.lightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(logoUniforms.materialColor, 1.0, 1.0, 1.0); // Bright white
    gl.uniform1f(logoUniforms.metallic, 0.0); // Non-metallic for pure white
    gl.uniform1f(logoUniforms.roughness, 0.0); // Smooth surface
    gl.uniform3f(logoUniforms.resolution, canvas.width, canvas.height, 1.0);
    
    // Bind logo attributes
    const logoPositionLocation = gl.getAttribLocation(logoProgram, 'a_position');
    const logoNormalLocation = gl.getAttribLocation(logoProgram, 'a_normal');
    
    gl.bindBuffer(gl.ARRAY_BUFFER, logoVertexBuffer);
    gl.enableVertexAttribArray(logoPositionLocation);
    gl.vertexAttribPointer(logoPositionLocation, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, logoNormalBuffer);
    gl.enableVertexAttribArray(logoNormalLocation);
    gl.vertexAttribPointer(logoNormalLocation, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, logoIndexBuffer);
    
    // Draw the logo
    gl.drawElements(gl.TRIANGLES, logoMesh.indices.length, gl.UNSIGNED_SHORT, 0);
    
    animationId = requestAnimationFrame(animate);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();