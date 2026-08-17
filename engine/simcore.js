/* simcore.js — shared plumbing for GPU field simulations.

   WebGL1 with no float textures, so every field is bit-packed into RGBA8 at 16 bits
   per component. That means these targets MUST use NEAREST filtering: hardware LINEAR
   would interpolate the packed bytes and produce garbage. Sample them with the manual
   bilinear helper in PACK when you need smooth lookups.

   Used by rd.js (Gray-Scott reaction-diffusion) and intended for lenia.js later — the
   only thing a new sim has to supply is its own fragment shaders. */

export const PACK = `
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
/* two 0..1 fields per RGBA8 texel: A in rg, B in ba */
vec4 encAB(vec2 ab){ return vec4(enc16(ab.x), enc16(ab.y)); }
vec2 decAB(vec4 t){ return vec2(dec16(t.rg), dec16(t.ba)); }

vec2 clampUv(vec2 uv){ return clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5); }
vec2 fieldAt(sampler2D t, vec2 uv){ return decAB(texture2D(t, clampUv(uv))); }

/* manual bilinear for packed fields (the textures are NEAREST) */
vec2 fieldLin(sampler2D t, vec2 uv){
  vec2 st = uv / uTexel - 0.5;
  vec2 i = floor(st), f = fract(st);
  vec2 a = fieldAt(t, (i + vec2(0.5, 0.5)) * uTexel);
  vec2 b = fieldAt(t, (i + vec2(1.5, 0.5)) * uTexel);
  vec2 c = fieldAt(t, (i + vec2(0.5, 1.5)) * uTexel);
  vec2 d = fieldAt(t, (i + vec2(1.5, 1.5)) * uTexel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float hashS(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export function createSimCore(gl, VS, compile, bindQuad){
  const fbos = new Map();

  function prog(fs){
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('sim link: ' + gl.getProgramInfoLog(p));
    const locs = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for(let i = 0; i < n; i++){ const u = gl.getActiveUniform(p, i); locs[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, locs, aPos: gl.getAttribLocation(p, 'aPos') };
  }

  function makeTex(res, linear, clear){
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, res, res, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f2 = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const c = clear || [0, 0, 0, 1];
    gl.clearColor(c[0], c[1], c[2], c[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fbos.set(t, f2);
    return t;
  }

  function makePair(res, linear, clear){
    let a = makeTex(res, linear, clear), b = makeTex(res, linear, clear), i = 0;
    return {
      read:  ()=> i ? b : a,
      write: ()=> i ? a : b,
      swap:  ()=> { i = 1 - i; },
      destroy(){ [a, b].forEach(t => { gl.deleteFramebuffer(fbos.get(t)); gl.deleteTexture(t); fbos.delete(t); }); },
    };
  }

  function run(pr, target, res, uniforms, textures, vecs){
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? fbos.get(target) : null);
    gl.viewport(0, 0, res, res);
    gl.useProgram(pr.p); bindQuad(pr.aPos);
    if(pr.locs.uTexel) gl.uniform2f(pr.locs.uTexel, 1 / res, 1 / res);
    if(uniforms) for(const k in uniforms){ const l = pr.locs[k]; if(l) gl.uniform1f(l, uniforms[k]); }
    if(vecs) for(const k in vecs){ const l = pr.locs[k]; if(l) gl.uniform2f(l, vecs[k][0], vecs[k][1]); }
    let unit = 0;
    if(textures) for(const k in textures){
      const l = pr.locs[k]; if(!l || !textures[k]) continue;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[k]);
      gl.uniform1i(l, unit); unit++;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return { prog, makeTex, makePair, run, fboOf: t => fbos.get(t) };
}
