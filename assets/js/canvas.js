// assets/js/canvas.js

;(function() {
  // 1. 获取 canvas 并设置全屏
  const canvas = document.getElementById('sakura');
  let gl;

  function resizeCanvas() {
    const { body, documentElement: d } = document;
    const width = Math.max(body.clientWidth, body.scrollWidth, d.scrollWidth, d.clientWidth);
    const height = Math.max(body.clientHeight, body.scrollHeight, d.scrollHeight, d.clientHeight);
    canvas.width = width;
    canvas.height = height;
  }

  // 2. 隐藏 loading 元素并启动场景
  window.addEventListener('load', () => {
    const ld = document.getElementById('loading');
    if (ld) ld.style.display = 'none';
    resizeCanvas();
    initWebGL();
    initScene();
    animate();
  });

  window.addEventListener('resize', resizeCanvas);

  // 3. WebGL 上下文初始化
  function initWebGL() {
    try {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } catch (e) {
      console.error('WebGL 初始化失败', e);
      alert('您的浏览器不支持 WebGL');
      return;
    }
  }

  // 4. Shader 编译与程序创建
  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vshSrc, fshSrc, uniformList, attributeList) {
    const vShader = compileShader(gl.VERTEX_SHADER, vshSrc);
    const fShader = compileShader(gl.FRAGMENT_SHADER, fshSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    program.uniforms = {};
    uniformList.forEach(name => {
      program.uniforms[name] = gl.getUniformLocation(program, name);
    });
    program.attributes = {};
    attributeList.forEach(name => {
      program.attributes[name] = gl.getAttribLocation(program, name);
    });
    return program;
  }

  // 5. 获取 shader 源码
  const vshCode = document.getElementById('sakura_point_vsh').textContent;
  const fshCode = document.getElementById('sakura_point_fsh').textContent;

  // 6. 樱花粒子场景相关变量
  let pointFlower = {};

  function createPointFlowers() {
    pointFlower.program = createProgram(
      vshCode,
      fshCode,
      ['uProjection', 'uModelview', 'uResolution', 'uOffset', 'uDOF', 'uFade'],
      ['aPosition', 'aEuler', 'aMisc']
    );
    // 初始化缓冲区和粒子数组
    pointFlower.num = 1600;
    pointFlower.particles = new Array(pointFlower.num);
    pointFlower.data = new Float32Array(pointFlower.num * 8);
    pointFlower.buffer = gl.createBuffer();
  }

  function initPointFlowers() {
    // 设置粒子位置、速度和旋转
    for (let i = 0; i < pointFlower.num; i++) {
      // 这里可以填充随机位置/速度
      pointFlower.particles[i] = { pos: [0,0,0], euler: [0,0,0], size: 1 + Math.random()*0.2 };
    }
  }

  function renderPointFlowers(projection, modelview) {
    // 更新 data 数组
    let offset = 0;
    pointFlower.particles.forEach(p => {
      pointFlower.data.set(p.pos, offset);
      pointFlower.data.set(p.euler, offset + 3);
      pointFlower.data[offset + 6] = p.size;
      pointFlower.data[offset + 7] = 1.0;
      offset += 8;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, pointFlower.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, pointFlower.data, gl.DYNAMIC_DRAW);
    gl.useProgram(pointFlower.program);
    gl.uniformMatrix4fv(pointFlower.program.uniforms.uProjection, false, projection);
    gl.uniformMatrix4fv(pointFlower.program.uniforms.uModelview, false, modelview);
    gl.uniform3fv(pointFlower.program.uniforms.uResolution, [canvas.width, canvas.height, canvas.width/canvas.height]);
    // 绑定顶点属性
    gl.enableVertexAttribArray(pointFlower.program.attributes.aPosition);
    gl.vertexAttribPointer(pointFlower.program.attributes.aPosition, 3, gl.FLOAT, false, 8*4, 0);
    gl.enableVertexAttribArray(pointFlower.program.attributes.aEuler);
    gl.vertexAttribPointer(pointFlower.program.attributes.aEuler, 3, gl.FLOAT, false, 8*4, 3*4);
    gl.enableVertexAttribArray(pointFlower.program.attributes.aMisc);
    gl.vertexAttribPointer(pointFlower.program.attributes.aMisc, 2, gl.FLOAT, false, 8*4, 6*4);
    gl.drawArrays(gl.POINTS, 0, pointFlower.num);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // 7. 背景 & 后期处理占位
  function renderBackground() {
    // TODO: 实现背景渲染
  }

  function renderPostProcess() {
    // TODO: 实现后期处理
  }

  // 8. 场景控制
  let projectionMatrix, modelviewMatrix;
  function createScene() {
    createPointFlowers();
    // TODO: 创建其他资源
  }

  function initScene() {
    initPointFlowers();
    // TODO: 初始化摄像机、projectionMatrix 和 modelviewMatrix
  }

  function renderScene() {
    renderBackground();
    renderPointFlowers(projectionMatrix, modelviewMatrix);
    renderPostProcess();
  }

  // 动画
  let lastTime = 0;
  function animate(time = 0) {
    const delta = (time - lastTime) / 1000;
    lastTime = time;
    renderScene();
    requestAnimationFrame(animate);
  }

})();
