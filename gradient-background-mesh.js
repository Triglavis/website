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
    uniform bool isDarkMode;
    uniform vec2 touchPoints[${MAX_TOUCH_POINTS}];
    uniform int touchCount;

    // Simplified noise functions (keeping core ones)
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

    void main() {
      vec2 uv = gl_FragCoord.xy / iResolution.xy;
      vec2 centeredUv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
      
      // Simple wave animation
      float wave = sin(centeredUv.x * 3.0 + iTime * 0.6) * 0.1 + sin(centeredUv.y * 2.0 + iTime * 0.4) * 0.05;
      float gradientPos = uv.y + wave;
      float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
      
      vec3 color = multiColorGradient(smoothGradientPos);
      gl_FragColor = vec4(color, 1.0);
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
    precision mediump float;
    
    uniform vec3 u_lightPosition;
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightColor;
    uniform vec3 u_materialColor;
    uniform float u_metallic;
    uniform float u_roughness;
    
    varying vec3 v_position;
    varying vec3 v_normal;
    varying vec3 v_worldPosition;
    
    void main() {
      vec3 normal = normalize(v_normal);
      vec3 lightDir = normalize(u_lightPosition - v_worldPosition);
      vec3 viewDir = normalize(u_viewPosition - v_worldPosition);
      vec3 halfDir = normalize(lightDir + viewDir);
      
      // Diffuse
      float NdotL = max(dot(normal, lightDir), 0.0);
      vec3 diffuse = u_materialColor * u_lightColor * NdotL;
      
      // Specular
      float NdotH = max(dot(normal, halfDir), 0.0);
      float specular = pow(NdotH, 64.0) * (1.0 - u_roughness) * u_metallic;
      
      // Fresnel
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
      
      // Ambient
      vec3 ambient = u_materialColor * 0.1;
      
      vec3 color = ambient + diffuse + vec3(specular) * u_lightColor + fresnel * u_metallic * 0.3;
      
      gl_FragColor = vec4(color, 1.0);
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

  async function loadSTL() {
    try {
      const response = await fetch('./triglavis_dark.stl');
      const buffer = await response.arrayBuffer();
      
      const view = new DataView(buffer);
      let offset = 80; // Skip header
      const numTriangles = view.getUint32(offset, true);
      offset += 4;
      
      const vertices = [];
      const normals = [];
      const indices = [];
      
      for (let i = 0; i < numTriangles; i++) {
        // Read normal
        const nx = view.getFloat32(offset, true);
        const ny = view.getFloat32(offset + 4, true);
        const nz = view.getFloat32(offset + 8, true);
        offset += 12;
        
        // Read vertices
        for (let j = 0; j < 3; j++) {
          const x = view.getFloat32(offset, true);
          const y = view.getFloat32(offset + 4, true);
          const z = view.getFloat32(offset + 8, true);
          offset += 12;
          
          vertices.push(x, y, z);
          normals.push(nx, ny, nz);
          indices.push(vertices.length / 3 - 1);
        }
        
        offset += 2; // Skip attribute count
      }
      
      return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
        numTriangles
      };
    } catch (error) {
      console.error('Failed to load STL:', error);
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
      powerPreference: 'high-performance'
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      canvas.style.background = 'linear-gradient(to bottom, #e6e6e6, #333333)';
      return;
    }

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // Load STL
    logoMesh = await loadSTL();
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
      isDarkMode: gl.getUniformLocation(bgProgram, 'isDarkMode'),
      touchPoints: gl.getUniformLocation(bgProgram, 'touchPoints'),
      touchCount: gl.getUniformLocation(bgProgram, 'touchCount')
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
      roughness: gl.getUniformLocation(logoProgram, 'u_roughness')
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
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
      setTimeout(handleResize, 100);
      return;
    }
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
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
    gl.uniform1f(bgUniforms.noiseIntensity, 1.2);
    gl.uniform1f(bgUniforms.noiseScale, 2.0);
    gl.uniform1f(bgUniforms.noiseSpeed, 0.05);
    
    const touchArray = new Float32Array(MAX_TOUCH_POINTS * 2);
    for (let i = 0; i < touchPoints.length; i++) {
      touchArray[i * 2] = touchPoints[i].x;
      touchArray[i * 2 + 1] = touchPoints[i].y;
    }
    gl.uniform2fv(bgUniforms.touchPoints, touchArray);
    gl.uniform1i(bgUniforms.touchCount, touchPoints.length);
    
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
    lookAt(viewMatrix, [0, 0, 5], [0, 0, 0], [0, 1, 0]);
    
    identity(modelMatrix);
    // Center and scale the logo appropriately
    scale(modelMatrix, modelMatrix, [0.01, 0.01, 0.01]); // Scale down STL
    translate(modelMatrix, modelMatrix, [0, 0, 0]);
    
    identity(normalMatrix); // Simplified - should be inverse transpose of model matrix
    
    // Set uniforms
    gl.uniformMatrix4fv(logoUniforms.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(logoUniforms.viewMatrix, false, viewMatrix);
    gl.uniformMatrix4fv(logoUniforms.modelMatrix, false, modelMatrix);
    gl.uniformMatrix4fv(logoUniforms.normalMatrix, false, normalMatrix);
    
    gl.uniform3f(logoUniforms.lightPosition, 3.0, 3.0, 5.0);
    gl.uniform3f(logoUniforms.viewPosition, 0.0, 0.0, 5.0);
    gl.uniform3f(logoUniforms.lightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(logoUniforms.materialColor, 0.9, 0.9, 0.9);
    gl.uniform1f(logoUniforms.metallic, 0.8);
    gl.uniform1f(logoUniforms.roughness, 0.2);
    
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