/* rd.js — Gray-Scott reaction–diffusion as a first-class field simulation.

   Two chemicals live in one RGBA8 target, 16 bits each: U in rg, V in ba.
   Per step:
       U' = U + (Du*lapU - U*V^2 + f*(1-U)) * dt
       V' = V + (Dv*lapV + U*V^2 - (f+k)*V) * dt
   The feed rate f and kill rate k are what select the regime — spots, stripes, mazes,
   coral, mitosis. 8-bit state stalls the fine gradients, hence the 16-bit packing.

   Distinct from the RD inside the Feedback renderer: that one is locked to that
   renderer, 8-bit, one step per frame, with f/k derived from other controls. This is a
   standalone field with real parameters that the whole pipeline can consume. */

import { PACK, createSimCore } from './simcore.js';

const FS_SEED = PACK + `
uniform sampler2D uSrc;
uniform float uFromImage, uAmount, uSeed;
void main(){
  float img = 0.0;
  if(uFromImage > 0.5){
    vec3 c = texture2D(uSrc, vUv).rgb;
    img = dot(c, vec3(0.299, 0.587, 0.114));
  }
  vec2 cell = floor(vUv / uTexel);
  float r = hashS(cell + uSeed);
  // V seeds where the image is bright (or randomly when not image-seeded)
  float thr = uFromImage > 0.5 ? (1.0 - img * uAmount) : (1.0 - uAmount * 0.12);
  float V = step(thr, r) * 0.55;
  gl_FragColor = encAB(vec2(1.0, V));
}`;

const FS_STEP = PACK + `
uniform sampler2D uField, uSrc;
uniform float uDu, uDv, uF, uK, uDt, uImgDrive, uUseImg;
void main(){
  vec2 c  = fieldAt(uField, vUv);
  vec2 l  = fieldAt(uField, vUv - vec2(uTexel.x, 0.0));
  vec2 r  = fieldAt(uField, vUv + vec2(uTexel.x, 0.0));
  vec2 b  = fieldAt(uField, vUv - vec2(0.0, uTexel.y));
  vec2 t  = fieldAt(uField, vUv + vec2(0.0, uTexel.y));
  vec2 lb = fieldAt(uField, vUv - uTexel);
  vec2 rt = fieldAt(uField, vUv + uTexel);
  vec2 lt = fieldAt(uField, vUv + vec2(-uTexel.x, uTexel.y));
  vec2 rb = fieldAt(uField, vUv + vec2(uTexel.x, -uTexel.y));
  // 9-point laplacian (0.2 edges / 0.05 corners) — less grid-aligned than the 5-point
  vec2 lap = (l + r + b + t) * 0.2 + (lb + rt + lt + rb) * 0.05 - c;
  float f = uF, k = uK;
  if(uUseImg > 0.5){                       // let the picture modulate the regime
    float img = dot(texture2D(uSrc, vUv).rgb, vec3(0.299, 0.587, 0.114));
    f += (img - 0.5) * uImgDrive * 0.02;
    k += (img - 0.5) * uImgDrive * 0.006;
  }
  float U = c.x, V = c.y, uvv = U * V * V;
  U += (uDu * lap.x - uvv + f * (1.0 - U)) * uDt;
  V += (uDv * lap.y + uvv - (f + k) * V) * uDt;
  gl_FragColor = encAB(clamp(vec2(U, V), 0.0, 1.0));
}`;

// unpack to a viewable RGB image (LINEAR-filterable) so the app can sample it cheaply
const FS_VIEW = PACK + `
uniform sampler2D uField;
uniform float uMode;
void main(){
  vec2 c = fieldAt(uField, vUv);
  float V = c.y, U = c.x;
  vec3 col;
  if(uMode < 0.5)      col = vec3(V);                                  // V as greyscale
  else if(uMode < 1.5) col = vec3(clamp(U, 0.0, 1.0), V, V);           // U/V split
  else                 col = vec3(V * 1.6, V * 0.9 + U * 0.15, 1.0 - V * 1.2);  // tinted
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const RD_PRESETS = {
  'coral':    { f: 0.0545, k: 0.0620 },
  'mitosis':  { f: 0.0367, k: 0.0649 },
  'spots':    { f: 0.0300, k: 0.0620 },
  'maze':     { f: 0.0290, k: 0.0570 },
  'stripes':  { f: 0.0220, k: 0.0510 },
  'holes':    { f: 0.0390, k: 0.0580 },
  'worms':    { f: 0.0580, k: 0.0650 },
  'solitons': { f: 0.0300, k: 0.0630 },
};

export function createRD(gl, VS, compile, bindQuad){
  const core = createSimCore(gl, VS, compile, bindQuad);
  const P = { seed: core.prog(FS_SEED), step: core.prog(FS_STEP), view: core.prog(FS_VIEW) };
  let pair = null, viewTex = null, res = 0, needSeed = true;

  function resize(r){
    if(r === res) return;
    if(pair) pair.destroy();
    if(viewTex){ gl.deleteFramebuffer(core.fboOf(viewTex)); gl.deleteTexture(viewTex); }
    // U=1, V=0 packed -> rg = 0xFFFF, ba = 0
    pair = core.makePair(r, false, [1, 1, 0, 0]);
    viewTex = core.makeTex(r, true, [0, 0, 0, 1]);
    res = r; needSeed = true;
  }

  return {
    resize,
    resolution: ()=> res,
    fieldTex: ()=> pair && pair.read(),
    viewTex:  ()=> viewTex,
    reseed(){ needSeed = true; },
    step(o){
      if(!res || !pair) return;
      if(needSeed){
        core.run(P.seed, pair.write(), res,
          { uFromImage: o.fromImage ? 1 : 0, uAmount: o.seedAmount, uSeed: o.seed || 7 },
          { uSrc: o.srcTex });
        pair.swap();
        needSeed = false;
      }
      const iters = Math.max(1, Math.min(64, o.steps | 0));
      for(let i = 0; i < iters; i++){
        core.run(P.step, pair.write(), res, {
          uDu: o.du, uDv: o.dv, uF: o.f, uK: o.k, uDt: o.dt,
          uImgDrive: o.imgDrive, uUseImg: (o.imgDrive > 0.001 && o.srcTex) ? 1 : 0,
        }, { uField: pair.read(), uSrc: o.srcTex });
        pair.swap();
      }
      core.run(P.view, viewTex, res, { uMode: o.viewMode || 0 }, { uField: pair.read() });
    },
  };
}
