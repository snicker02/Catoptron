/* fluid.js — Navier–Stokes-lite: velocity + dye simulated in ping-pong buffers.
   WebGL1 / RGBA8 only (no float textures): velocity, pressure and divergence are
   bit-packed to 16 bits per component, so those buffers MUST use NEAREST filtering
   and be sampled with the manual bilinear helpers below (hardware LINEAR would
   interpolate the packed bytes and produce garbage). Dye is plain RGB -> LINEAR. */

const VR = 4.0;    // velocity range  (uv units / second)
const SR = 8.0;    // scalar range    (pressure / divergence)

const PACK = `
precision highp float;
varying vec2 vUv;
uniform vec2 uTexel;
vec2 enc16(float e){
  e = clamp(e, 0.0, 1.0);
  float v = e * 65535.0;
  float hi = floor(v / 256.0);
  float lo = floor(v - hi * 256.0);
  return vec2(hi / 255.0, lo / 255.0);
}
float dec16(vec2 c){
  return (floor(c.x * 255.0 + 0.5) * 256.0 + floor(c.y * 255.0 + 0.5)) / 65535.0;
}
vec4 encV(vec2 v){ vec2 e = clamp(v / ${VR.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0); return vec4(enc16(e.x), enc16(e.y)); }
vec2 decV(vec4 t){ return (vec2(dec16(t.rg), dec16(t.ba)) * 2.0 - 1.0) * ${VR.toFixed(1)}; }
vec4 encS(float s){ return vec4(enc16(clamp(s / ${SR.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0)), 0.0, 1.0); }
float decS(vec4 t){ return (dec16(t.rg) * 2.0 - 1.0) * ${SR.toFixed(1)}; }
vec2 clampUv(vec2 uv){ return clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5); }
vec2 velAt(sampler2D t, vec2 uv){ return decV(texture2D(t, clampUv(uv))); }
float scAt(sampler2D t, vec2 uv){ return decS(texture2D(t, clampUv(uv))); }
// manual bilinear for packed velocity (NEAREST textures)
vec2 velLin(sampler2D t, vec2 uv){
  vec2 st = uv / uTexel - 0.5;
  vec2 i = floor(st), f = fract(st);
  vec2 a = velAt(t, (i + vec2(0.5, 0.5)) * uTexel);
  vec2 b = velAt(t, (i + vec2(1.5, 0.5)) * uTexel);
  vec2 c = velAt(t, (i + vec2(0.5, 1.5)) * uTexel);
  vec2 d = velAt(t, (i + vec2(1.5, 1.5)) * uTexel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float curlAt(sampler2D t, vec2 uv){
  float r = velAt(t, uv + vec2(uTexel.x, 0.0)).y;
  float l = velAt(t, uv - vec2(uTexel.x, 0.0)).y;
  float u = velAt(t, uv + vec2(0.0, uTexel.y)).x;
  float d = velAt(t, uv - vec2(0.0, uTexel.y)).x;
  return 0.5 * ((r - l) - (u - d));
}
float hashF(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hashF(i), b = hashF(i + vec2(1.0, 0.0)), c = hashF(i + vec2(0.0, 1.0)), d = hashF(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const FS_ADVECT_VEL = PACK + `
uniform sampler2D uVel; uniform float uDt, uDamp;
void main(){
  vec2 v = velAt(uVel, vUv);
  vec2 src = vUv - v * uDt;
  gl_FragColor = encV(velLin(uVel, clampUv(src)) * uDamp);
}`;

const FS_FORCES = PACK + `
uniform sampler2D uVel;
uniform float uDt, uStir, uStirScale, uTime, uVort, uPtrF, uAudF, uAud;
uniform vec2 uPtr, uPtrV;
uniform vec2 uWind;
void main(){
  vec2 v = velAt(uVel, vUv);
  // curl-noise stir (divergence-free by construction)
  if(uStir > 0.0){
    vec2 p = vUv * uStirScale + uTime * 0.15;
    float e = 0.01;
    float n1 = vnoise(p + vec2(0.0, e)), n2 = vnoise(p - vec2(0.0, e));
    float n3 = vnoise(p + vec2(e, 0.0)), n4 = vnoise(p - vec2(e, 0.0));
    v += vec2(n1 - n2, -(n3 - n4)) / (2.0 * e) * uStir * uDt * 0.02;
  }
  // vorticity confinement — re-inject swirl the solver damps out
  if(uVort > 0.0){
    float c  = curlAt(uVel, vUv);
    float cl = abs(curlAt(uVel, vUv - vec2(uTexel.x, 0.0)));
    float cr = abs(curlAt(uVel, vUv + vec2(uTexel.x, 0.0)));
    float cb = abs(curlAt(uVel, vUv - vec2(0.0, uTexel.y)));
    float ct = abs(curlAt(uVel, vUv + vec2(0.0, uTexel.y)));
    vec2 g = vec2(cr - cl, ct - cb) * 0.5;
    float len = length(g) + 1e-5;
    v += vec2(g.y, -g.x) / len * c * uVort * uDt * 6.0;
  }
  // uniform directional force (wind slider / device tilt)
  v += uWind * uDt * 2.0;
  // pointer drag
  if(uPtrF > 0.0){
    float d = distance(vUv, uPtr);
    v += uPtrV * exp(-d * d / 0.004) * uPtrF * uDt * 30.0;
  }
  // audio impulse — radial push from centre on transients
  if(uAudF > 0.0 && uAud > 0.0){
    vec2 d = vUv - vec2(0.5);
    float r = length(d) + 1e-4;
    v += (d / r) * exp(-r * r / 0.08) * uAud * uAudF * uDt * 8.0;
  }
  gl_FragColor = encV(v);
}`;

const FS_DIVERGENCE = PACK + `
uniform sampler2D uVel;
void main(){
  float l = velAt(uVel, vUv - vec2(uTexel.x, 0.0)).x;
  float r = velAt(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float b = velAt(uVel, vUv - vec2(0.0, uTexel.y)).y;
  float t = velAt(uVel, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = encS(0.5 * ((r - l) + (t - b)));
}`;

const FS_JACOBI = PACK + `
uniform sampler2D uPrs, uDiv;
void main(){
  float l = scAt(uPrs, vUv - vec2(uTexel.x, 0.0));
  float r = scAt(uPrs, vUv + vec2(uTexel.x, 0.0));
  float b = scAt(uPrs, vUv - vec2(0.0, uTexel.y));
  float t = scAt(uPrs, vUv + vec2(0.0, uTexel.y));
  float d = scAt(uDiv, vUv);
  gl_FragColor = encS((l + r + b + t - d) * 0.25);
}`;

const FS_GRADSUB = PACK + `
uniform sampler2D uVel, uPrs;
void main(){
  float l = scAt(uPrs, vUv - vec2(uTexel.x, 0.0));
  float r = scAt(uPrs, vUv + vec2(uTexel.x, 0.0));
  float b = scAt(uPrs, vUv - vec2(0.0, uTexel.y));
  float t = scAt(uPrs, vUv + vec2(0.0, uTexel.y));
  vec2 v = velAt(uVel, vUv) - 0.5 * vec2(r - l, t - b);
  gl_FragColor = encV(v);
}`;

const FS_DYE = PACK + `
uniform sampler2D uVel, uDye, uSrc;
uniform float uDt, uFade, uInject;
void main(){
  vec2 v = velAt(uVel, vUv);
  vec3 dye = texture2D(uDye, clampUv(vUv - v * uDt)).rgb * uFade;
  if(uInject > 0.0){
    vec3 s = texture2D(uSrc, vUv).rgb;
    dye = clamp(dye + s * uInject * uDt * 1.5, 0.0, 1.0);
  }
  gl_FragColor = vec4(dye, 1.0);
}`;

export function createFluid(gl, VS, compile, bindQuad){
  function prog(fs){
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('fluid link: ' + gl.getProgramInfoLog(p));
    const locs = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for(let i = 0; i < n; i++){ const u = gl.getActiveUniform(p, i); locs[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, locs, aPos: gl.getAttribLocation(p, 'aPos') };
  }
  const P = {
    adv:  prog(FS_ADVECT_VEL),
    frc:  prog(FS_FORCES),
    div:  prog(FS_DIVERGENCE),
    jac:  prog(FS_JACOBI),
    grad: prog(FS_GRADSUB),
    dye:  prog(FS_DYE),
  };

  let res = 0, vel = [], prs = [], dye = [], divT = null, fbo = new Map(), vi = 0, pi = 0, di = 0;

  function mkTex(r, linear){
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, r, r, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f2 = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    // neutral clear: packed zero for signed fields = 0.5 -> hi byte 128
    gl.clearColor(128 / 255, 0, 128 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fbo.set(t, f2);
    return t;
  }
  function destroy(){
    [...vel, ...prs, ...dye, divT].forEach(t => { if(t){ gl.deleteFramebuffer(fbo.get(t)); gl.deleteTexture(t); } });
    vel = []; prs = []; dye = []; divT = null; fbo = new Map();
  }
  function resize(r){
    if(r === res) return;
    destroy();
    vel = [mkTex(r, false), mkTex(r, false)];
    prs = [mkTex(r, false), mkTex(r, false)];
    dye = [mkTex(r, true), mkTex(r, true)];
    divT = mkTex(r, false);
    // dye starts black
    [dye[0], dye[1]].forEach(t => { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.get(t)); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    res = r; vi = 0; pi = 0; di = 0;
  }
  function pass(pr, target, uniforms, textures){
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.get(target));
    gl.viewport(0, 0, res, res);
    gl.useProgram(pr.p); bindQuad(pr.aPos);
    if(pr.locs.uTexel) gl.uniform2f(pr.locs.uTexel, 1 / res, 1 / res);
    for(const k in uniforms){ const l = pr.locs[k]; if(l) gl.uniform1f(l, uniforms[k]); }
    let unit = 0;
    for(const k in textures){
      const l = pr.locs[k]; if(!l) continue;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[k]);
      gl.uniform1i(l, unit); unit++;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    resize,
    velTex: ()=> vel[vi],
    prsTex: ()=> prs[pi],
    divTex: ()=> divT,
    dyeTex: ()=> dye[di],
    resolution: ()=> res,
    reset(){ const r = res; res = 0; resize(r); },
    step(o){
      if(!res) return;
      const dt = Math.min(0.05, o.dt || 0.016);
      // 1. advect velocity
      pass(P.adv, vel[1 - vi], { uDt: dt, uDamp: o.damp }, { uVel: vel[vi] });
      vi = 1 - vi;
      // 2. forces: stir + vorticity + pointer + audio
      const fp = P.frc;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.get(vel[1 - vi]));
      gl.viewport(0, 0, res, res);
      gl.useProgram(fp.p); bindQuad(fp.aPos);
      if(fp.locs.uTexel) gl.uniform2f(fp.locs.uTexel, 1 / res, 1 / res);
      const fu = { uDt: dt, uStir: o.stir, uStirScale: o.stirScale, uTime: o.time,
                   uVort: o.vort, uPtrF: o.ptrForce, uAudF: o.audForce, uAud: o.aud };
      for(const k in fu){ if(fp.locs[k]) gl.uniform1f(fp.locs[k], fu[k]); }
      if(fp.locs.uPtr)  gl.uniform2f(fp.locs.uPtr, o.ptr[0], o.ptr[1]);
      if(fp.locs.uPtrV) gl.uniform2f(fp.locs.uPtrV, o.ptrV[0], o.ptrV[1]);
      if(fp.locs.uWind) gl.uniform2f(fp.locs.uWind, o.wind ? o.wind[0] : 0, o.wind ? o.wind[1] : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vel[vi]);
      gl.uniform1i(fp.locs.uVel, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      vi = 1 - vi;
      // 3. divergence
      pass(P.div, divT, {}, { uVel: vel[vi] });
      // 4. pressure (Jacobi) — clear then iterate
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.get(prs[pi]));
      gl.clearColor(128 / 255, 0, 128 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const iters = Math.max(1, o.iters | 0);
      for(let i = 0; i < iters; i++){
        pass(P.jac, prs[1 - pi], {}, { uPrs: prs[pi], uDiv: divT });
        pi = 1 - pi;
      }
      // 5. subtract pressure gradient -> divergence-free velocity
      pass(P.grad, vel[1 - vi], {}, { uVel: vel[vi], uPrs: prs[pi] });
      vi = 1 - vi;
      // 6. advect dye + inject the source image
      pass(P.dye, dye[1 - di], { uDt: dt, uFade: o.fade, uInject: o.inject },
           { uVel: vel[vi], uDye: dye[di], uSrc: o.srcTex });
      di = 1 - di;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  };
}
