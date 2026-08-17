/* ca.js — Life-like cellular automata as a field simulation.

   Discrete state (a cell is alive or dead) with a totalistic B/S rule: a dead cell is
   born if its live-neighbour count is in the Birth set, a live cell survives if its
   count is in the Survive set. Conway's Life is B3/S23; changing those sets gives
   wildly different worlds — mazes, coral growth, crystal annealing, explosive seeds.

   Raw binary CA looks harsh, so alongside the cell state each texel carries a decaying
   TRAIL: max(alive, previousTrail * decay). That leaves soft comet-tails behind moving
   structures, which reads far better as artwork and gives the warp fold something
   continuous to follow.

   Layout per texel: R = alive (0/1), G = trail (0..1). No bit packing needed, so this
   target can be LINEAR-filtered for smooth sampling. */

import { PACK, createSimCore } from './simcore.js';

const HEAD = PACK + `
uniform sampler2D uField;
float aliveAt(vec2 uv){ return texture2D(uField, clampUv(uv)).r; }
`;

const FS_SEED = PACK + `
uniform sampler2D uSrc;
uniform float uFromImage, uDensity, uSeed;
void main(){
  vec2 cell = floor(vUv / uTexel);
  float r = hashS(cell + uSeed);
  float thr = 1.0 - uDensity;
  if(uFromImage > 0.5){
    float img = dot(texture2D(uSrc, vUv).rgb, vec3(0.299, 0.587, 0.114));
    thr = 1.0 - uDensity * img;          // denser where the picture is bright
  }
  float a = step(thr, r);
  gl_FragColor = vec4(a, a, 0.0, 1.0);
}`;

const FS_STEP = HEAD + `
uniform float uBirth, uSurvive, uDecay;
// is bit n set in a 9-bit rule mask?
float bitAt(float mask, float n){ return mod(floor(mask / pow(2.0, n)), 2.0); }
void main(){
  vec2 t = uTexel;
  float c = aliveAt(vUv);
  float cnt =
      aliveAt(vUv + vec2(-t.x, -t.y)) + aliveAt(vUv + vec2(0.0, -t.y)) + aliveAt(vUv + vec2(t.x, -t.y))
    + aliveAt(vUv + vec2(-t.x,  0.0))                                  + aliveAt(vUv + vec2(t.x,  0.0))
    + aliveAt(vUv + vec2(-t.x,  t.y)) + aliveAt(vUv + vec2(0.0,  t.y)) + aliveAt(vUv + vec2(t.x,  t.y));
  cnt = floor(cnt + 0.5);
  float next = (c > 0.5) ? bitAt(uSurvive, cnt) : bitAt(uBirth, cnt);
  float prevTrail = texture2D(uField, clampUv(vUv)).g;
  float trail = max(next, prevTrail * uDecay);
  gl_FragColor = vec4(next, trail, 0.0, 1.0);
}`;

const FS_VIEW = PACK + `
uniform sampler2D uField;
uniform float uMode;
void main(){
  vec4 s = texture2D(uField, vUv);
  float a = s.r, tr = s.g;
  vec3 col;
  if(uMode < 0.5)      col = vec3(a);                                        // hard cells
  else if(uMode < 1.5) col = vec3(tr);                                       // soft trails
  else                 col = vec3(tr * 1.5, tr * 0.75 + a * 0.25, 1.0 - tr); // tinted
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* "B3/S23" -> { birth: bitmask, survive: bitmask } */
export function parseRule(str){
  const m = /B([0-8]*)\/S([0-8]*)/i.exec(str || '');
  const bits = s => (s || '').split('').reduce((a, d) => a | (1 << +d), 0);
  if(!m) return { birth: 8, survive: 12 };
  return { birth: bits(m[1]), survive: bits(m[2]) };
}

export const CA_RULES = {
  'Life':            'B3/S23',
  'HighLife':        'B36/S23',
  'Day & Night':     'B3678/S34678',
  'Maze':            'B3/S12345',
  'Mazectric':       'B3/S1234',
  'Coral':           'B3/S45678',
  'Anneal':          'B4678/S35678',
  'Diamoeba':        'B35678/S5678',
  'Seeds':           'B2/S',
  'Life w/o death':  'B3/S012345678',
  'Replicator':      'B1357/S1357',
  '34 Life':         'B34/S34',
};

export function createCA(gl, VS, compile, bindQuad){
  const core = createSimCore(gl, VS, compile, bindQuad);
  const P = { seed: core.prog(FS_SEED), step: core.prog(FS_STEP), view: core.prog(FS_VIEW) };
  let pair = null, viewTex = null, res = 0, needSeed = true, gens = 0;

  function resize(r){
    if(r === res) return;
    if(pair) pair.destroy();
    if(viewTex){ gl.deleteFramebuffer(core.fboOf(viewTex)); gl.deleteTexture(viewTex); }
    pair = core.makePair(r, false, [0, 0, 0, 1]);   // cells need NEAREST
    viewTex = core.makeTex(r, true, [0, 0, 0, 1]);  // view is smooth-sampled
    res = r; needSeed = true; gens = 0;
  }

  return {
    resize,
    resolution: ()=> res,
    fieldTex: ()=> pair && pair.read(),
    viewTex:  ()=> viewTex,
    generation: ()=> gens,
    reseed(){ needSeed = true; },
    /* advance `steps` generations, then refresh the viewable texture */
    step(o){
      if(!res || !pair) return;
      if(needSeed){
        core.run(P.seed, pair.write(), res,
          { uFromImage: o.fromImage ? 1 : 0, uDensity: o.density, uSeed: o.seed || 7 },
          { uSrc: o.srcTex });
        pair.swap(); needSeed = false; gens = 0;
      }
      const iters = Math.max(0, Math.min(16, o.steps | 0));
      for(let i = 0; i < iters; i++){
        core.run(P.step, pair.write(), res,
          { uBirth: o.birth, uSurvive: o.survive, uDecay: o.decay },
          { uField: pair.read() });
        pair.swap(); gens++;
      }
      core.run(P.view, viewTex, res, { uMode: o.viewMode || 0 }, { uField: pair.read() });
    },
  };
}
