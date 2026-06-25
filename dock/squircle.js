// Atelier squircle cushion — INLINED, no external dependency. One shared WebGL context renders
// every app icon's animated gradient mesh into an atlas; each <canvas> a tile hands over gets its
// own cell blitted in (2D canvases have no context limit, so this scales to a full marketplace).
// The silhouette is a vector CSS clip-path (cushionPath). Falls back to a static CSS gradient when
// WebGL / motion isn't available. Self-contained: vanilla JS, no imports.

// ---- silhouette: golden cushion (superformula m=4, n1=φ², n2=n3=3) ----
const PHI = (1 + Math.sqrt(5)) / 2;
const SF = { m: 4, n1: PHI * PHI, n2: 3, n3: 3 };
export function cushionPath(size, margin = 0.5) {
  const R = size * margin, c = size / 2, N = 240, pts = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const a = Math.pow(Math.abs(Math.cos((SF.m * t) / 4)), SF.n2);
    const b = Math.pow(Math.abs(Math.sin((SF.m * t) / 4)), SF.n3);
    let r = Math.pow(a + b, -1 / SF.n1); if (!isFinite(r)) r = 0;
    pts.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  let mx = 0; for (const p of pts) mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1]));
  const s = mx > 0 ? R / mx : 1;
  return 'M' + pts.map(([x, y], i) => (i ? 'L' : '') + (c + x * s).toFixed(2) + ' ' + (c - y * s).toFixed(2)).join(' ') + 'Z';
}

// ---- the shipped gradient shader (vivid diagonal gradient + drift + sweeping sheen) ----
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uGrid;
uniform sampler2D uColors; uniform float uCount;
const float SPEED=0.40, SAT_BOOST=0.10, LIGHT_SPAN=0.30, DRIFT=0.06, SHEEN=0.08;
vec3 rgb2hsl(vec3 c){ float mx=max(max(c.r,c.g),c.b),mn=min(min(c.r,c.g),c.b);
  float h=0.0,s=0.0,l=(mx+mn)*0.5,d=mx-mn;
  if(d>0.0001){ s=l>0.5?d/(2.0-mx-mn):d/(mx+mn);
    if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0); else if(mx==c.g) h=(c.b-c.r)/d+2.0; else h=(c.r-c.g)/d+4.0; h/=6.0; }
  return vec3(h,s,l); }
float hk(float p,float q,float t){ if(t<0.0)t+=1.0; if(t>1.0)t-=1.0;
  if(t<1.0/6.0) return p+(q-p)*6.0*t; if(t<0.5) return q; if(t<2.0/3.0) return p+(q-p)*(2.0/3.0-t)*6.0; return p; }
vec3 hsl2rgb(vec3 c){ if(c.y<0.0001) return vec3(c.z);
  float q=c.z<0.5?c.z*(1.0+c.y):c.z+c.y-c.z*c.y; float p=2.0*c.z-q;
  return vec3(hk(p,q,c.x+1.0/3.0),hk(p,q,c.x),hk(p,q,c.x-1.0/3.0)); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cell = floor(uv*uGrid);
  float idx = cell.y*uGrid.x + cell.x;
  if(idx > uCount-0.5){ gl_FragColor = vec4(0.0); return; }
  vec2 cuv = fract(uv*uGrid);
  vec3 hsl = rgb2hsl(texture2D(uColors, vec2((idx+0.5)/uCount, 0.5)).rgb);
  float t = uTime*SPEED, ph = idx*0.7;
  float d = clamp(cuv.x*0.42 + (1.0-cuv.y)*0.82 - 0.12 + DRIFT*sin(t*0.6 + ph + cuv.y*1.6), 0.0, 1.0);
  float sat = clamp(hsl.y + SAT_BOOST, 0.0, 1.0);
  float lit = hsl.z + (0.46 - d)*LIGHT_SPAN;
  lit += exp(-pow((d - (0.5 + 0.5*sin(t*0.9 + ph)))*2.6, 2.0)) * SHEEN;
  lit = clamp(lit, 0.05, 0.99);
  float hue = fract(hsl.x + 0.012*sin(t*0.5 + ph));
  gl_FragColor = vec4(hsl2rgb(vec3(hue, sat, lit)), 1.0);
}`;

// ---- helpers ----
function hexRGB(hex) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function canAnimate() {
  try {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

// ---- shared-atlas engine ----
const GRID = 10, CAP = GRID * GRID;   // up to 100 animated tiles share one WebGL context

class SquircleEngine {
  constructor() {
    this.animate = canAnimate();
    this.cellRes = 128;
    this.icons = new Map();
    this.free = Array.from({ length: CAP }, (_, i) => CAP - 1 - i);
    this.nextId = 1; this.gl = null; this.raf = 0; this.t0 = 0; this.last = 0; this.needColors = false; this.io = null; this.hidden = false;
  }
  register({ color, target }) {
    if (!this.animate || !this.free.length || !target) return null;
    this._ensureGL();
    if (!this.gl) { this.animate = false; return null; }
    const id = this.nextId++, cell = this.free.pop();
    this.icons.set(id, { color, target, ctx: target.getContext('2d'), visible: true, cell });
    this.io && this.io.observe(target);
    this.needColors = true; this._start();
    return id;
  }
  update(id, color) { const r = this.icons.get(id); if (r && r.color !== color) { r.color = color; this.needColors = true; } }
  unregister(id) {
    const r = this.icons.get(id); if (!r) return;
    this.io && this.io.unobserve(r.target);
    this.free.push(r.cell); this.icons.delete(id); this.needColors = true;
    if (!this.icons.size) this._stop();
  }
  _ensureGL() {
    if (this.gl || !this.animate) return;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = GRID * this.cellRes;
      const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true });
      if (!gl) return;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      this.u = {}; ['uRes', 'uTime', 'uGrid', 'uColors', 'uCount'].forEach((n) => (this.u[n] = gl.getUniformLocation(p, n)));
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.viewport(0, 0, cv.width, cv.height);
      this.canvas = cv; this.gl = gl;
      if (typeof IntersectionObserver !== 'undefined')
        this.io = new IntersectionObserver((es) => es.forEach((e) => { for (const r of this.icons.values()) if (r.target === e.target) r.visible = e.isIntersecting; }), { threshold: 0 });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { this.hidden = document.hidden; });
    } catch (e) { this.gl = null; }
  }
  _uploadColors() {
    const gl = this.gl, data = new Uint8Array(CAP * 3);
    for (const r of this.icons.values()) { const [cr, cg, cb] = hexRGB(r.color); data[r.cell * 3] = cr; data[r.cell * 3 + 1] = cg; data[r.cell * 3 + 2] = cb; }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, CAP, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    this.needColors = false;
  }
  _start() {
    if (this.raf || !this.gl) return; const minDt = 1000 / 60;
    const loop = (now) => { this.raf = requestAnimationFrame(loop); if (this.hidden) return;
      if (now - this.last < minDt - 1) return; this.last = now; if (!this.t0) this.t0 = now; this._frame((now - this.t0) / 1000); };
    this.raf = requestAnimationFrame(loop);
  }
  _stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  _frame(t) {
    let any = false; for (const r of this.icons.values()) if (r.visible) { any = true; break; }
    if (!any) return;
    if (this.needColors) this._uploadColors();
    const gl = this.gl, u = this.u, R = this.canvas.width;
    gl.uniform2f(u.uRes, R, R); gl.uniform1f(u.uTime, t); gl.uniform2f(u.uGrid, GRID, GRID); gl.uniform1f(u.uCount, CAP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(u.uColors, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const cr = this.cellRes;
    for (const r of this.icons.values()) {
      if (!r.visible) continue;
      const col = r.cell % GRID, row = (r.cell / GRID) | 0, srcY = (GRID - 1 - row) * cr;
      const tw = r.target.width, th = r.target.height;
      r.ctx.clearRect(0, 0, tw, th); r.ctx.drawImage(this.canvas, col * cr, srcY, cr, cr, 0, 0, tw, th);
    }
  }
}

let _engine = null;
export function getSquircleEngine() { if (!_engine) _engine = new SquircleEngine(); return _engine; }
