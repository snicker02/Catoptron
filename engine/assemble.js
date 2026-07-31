// Shader assembler. Emits a fragment shader containing ONLY the operators in the current
// stack (straight-line, no dispatch) plus the selected renderer body. The renderer is baked
// into the program, so switching renderers is a (cached) recompile, not a runtime branch.
import { PRELUDE } from './prelude.js';
import { HELPERS } from './helpers.js';
import { OPS } from './ops.js';

const MAX_OPS = 8;

// Renderer bodies: given uv, c, ca, ph, period they set `col`. Verbatim from the current tool.
const RENDERERS = {
  0: `
    bool first = true;
    for(int i = 0; i < 64; i++){
      if(float(i) >= uDepth + period) break;
      float k = float(i) - ph;
      float sc = pow(uStep, k);
      vec2 p = (uv - c) * vec2(ca, 1.0);
      p = rot(-uTwist * k) * p;
      p /= sc;
      p = p / vec2(ca, 1.0) + 0.5;
      p += uShift * k;
      if(uFlip > 0.5 && mod(float(i), 2.0) > 0.5) p.x = 1.0 - p.x;
      float inside = step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
      if(first) inside = 1.0;
      if(inside > 0.5){
        float dk = max(k, 0.0);
        float e = first ? 999.0 : min(min(p.x, 1.0-p.x), min(p.y, 1.0-p.y));
        col = shade(p, dk, e);
        first = false;
      }
    }`,
  1: `
    vec2 p2 = (uv - c) * vec2(ca, 1.0);
    float r = max(length(p2), 1e-6);
    float a = atan(p2.y, p2.x);
    float P = -log(uStep);
    float k = -log(r)/P + ph;
    k += (a/TAU) * (uTwist / P) * 4.0;
    float ik = floor(k);
    float fk = k - ik;
    float ax = a/TAU + 0.5;
    vec2 p = vec2(ax, fk);
    if(uFlip > 0.5 && mod(mod(ik, 2.0) + 2.0, 2.0) >= 1.0) p.x = 1.0 - p.x;
    float dk = clamp(-log(r)/P, 0.0, 48.0);
    float e = min(min(fk, 1.0-fk), min(ax, 1.0-ax));
    col = shade(p, dk, e);`,
  2: `
    vec2 dir = (uv - c) * vec2(ca, 1.0) * 1.4;
    float ax = abs(dir.x), ay = abs(dir.y);
    float z, v;
    if(ax > ay){ z = 1.0 / max(ax, 1e-4); v = dir.y * z; }
    else       { z = 1.0 / max(ay, 1e-4); v = dir.x * z; }
    float paneLen = mix(0.22, 1.5, (uStep - 0.42) / 0.52);
    float zk = (z - 1.0) / paneLen;
    float k = zk + ph;
    float ik = floor(k);
    float fk = k - ik;
    if(uFlip > 0.5 && mod(mod(ik, 2.0) + 2.0, 2.0) >= 1.0) fk = 1.0 - fk;
    float vv = v*0.5 + 0.5 + uTwist * zk * 0.35;
    vec2 p = vec2(fk, vv) + uShift * zk;
    float vm = 1.0 - abs(mod(vv, 2.0) - 1.0);
    float e = min(min(fk, 1.0-fk), min(vm, 1.0-vm));
    float dk = clamp(zk, 0.0, 48.0);
    col = shade(p, dk, e);`,
  3: `
    vec2 d = (uv - c) * vec2(ca, 1.0) * 1.4;
    float r = max(length(d), 1e-4);
    float ang = atan(d.y, d.x);
    float z = 1.0 / r;
    float paneLen = mix(0.22, 1.5, (uStep - 0.42) / 0.52);
    float zk = (z - 1.0) / paneLen;
    float k = zk + ph;
    float ik = floor(k);
    float fk = k - ik;
    if(uFlip > 0.5 && mod(mod(ik, 2.0) + 2.0, 2.0) >= 1.0) fk = 1.0 - fk;
    float vv = ang/TAU + 0.5 + uTwist * zk * 0.35;
    vec2 p = vec2(fk, vv) + uShift * zk;
    float vm = 1.0 - abs(mod(vv, 2.0) - 1.0);
    float e = min(min(fk, 1.0-fk), min(vm, 1.0-vm));
    float dk = clamp(max(zk, 0.0), 0.0, 48.0);
    col = shade(p, dk, e);`,
  4: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    float band = mix(0.15, 1.2, (uStep - 0.42) / 0.52);
    float s = d.x / band;
    float k = s + ph;
    float ik = floor(k);
    float fk = k - ik;
    if(uFlip > 0.5 && mod(mod(ik, 2.0) + 2.0, 2.0) >= 1.0) fk = 1.0 - fk;
    float vv = d.y*0.5 + 0.5 + uTwist * s * 0.35;
    vec2 p = vec2(fk, vv) + uShift * s;
    float vm = 1.0 - abs(mod(vv, 2.0) - 1.0);
    float e = min(min(fk, 1.0-fk), min(vm, 1.0-vm));
    float dk = clamp(abs(s), 0.0, 48.0);
    col = shade(p, dk, e);`,
  5: `
    vec2 p = uv;
    float t = (uStep - 0.42) / 0.52;
    float fz = mix(0.90, 1.02, t);
    vec2 f = (p - c) * vec2(ca, 1.0);
    f = rot(uTwist * 0.02) * f;
    f *= fz;
    vec2 pf = f / vec2(ca, 1.0) + c + uShift * 0.05;
    if(uFlip > 0.5) pf.x = 2.0*c.x - pf.x;
    pf = rippled(pf, 1.5);
    vec3 fb;
    if(uChroma > 0.001){
      vec2 d2 = (pf - 0.5) * uChroma * 0.002;
      fb = vec3(texture2D(uPrev, mir(pf + d2)).r,
                texture2D(uPrev, mir(pf)).g,
                texture2D(uPrev, mir(pf - d2)).b);
    } else {
      fb = texture2D(uPrev, mir(pf)).rgb;
    }
    vec3 glass = mix(vec3(1.0), uTint, uTintA);
    fb *= pow(glass, vec3(0.35));
    if(abs(uHueK) > 0.0001) fb = hueShift(fb, uHueK * 0.35);
    vec3 src = shade(p, 0.0, 999.0);
    col = mix(src, fb, uFbAmt);`,
};

// transitive closure of helper deps, emitted in dependency order
function resolveHelpers(types){
  const need = new Set();
  const visit = h => { if(need.has(h)) return; (HELPERS[h].deps||[]).forEach(visit); need.add(h); };
  types.forEach(t => (OPS[t].deps||[]).forEach(visit));
  return [...need].map(h => HELPERS[h].src).join('\n');
}

function foldCall(t, i){
  const op = OPS[t];
  const banks = Math.max(1, Math.ceil(op.params.length / 4));
  const bankArgs = [];
  for(let b = 0; b < banks; b++) bankArgs.push(`uP${i}_${b}`);
  let args = 'q, ' + bankArgs.join(', ');
  if(op.ccop)       args += ', par, ccOp';
  else if(op.par)   args += ', par';
  else if(op.crack) args += ', crack';
  return `  q -= uO${i};\n  q = ${op.fn}(${args});\n  q += uO${i};`;
}

function assemble(stack, rend = 0){
  const helperSrc = resolveHelpers(stack);
  const opSrc = [...new Set(stack)].map(t => OPS[t].glsl).join('\n');
  const folds = stack.map((t, i) => foldCall(t, i)).join('\n');
  const decls = stack.map((t, i) => {
    const banks = Math.max(1, Math.ceil(OPS[t].params.length / 4));
    let d = '';
    for(let b = 0; b < banks; b++) d += `uniform vec4 uP${i}_${b};\n`;
    return d + `uniform vec2 uO${i};`;
  }).join('\n');
  return `${PRELUDE}
${decls}
${helperSrc}
${opSrc}
void main(){
  float ca = uCanvas.x / uCanvas.y;
  vec2 c = uCenter;
  vec2 uv = vUv;
  uv = (uv - c) / uZoom + c;
  vec2 q = (uv - c) * vec2(ca, 1.0);
  q = rot(uSpinA) * q;
  float crack = 1.0;
  float par = 0.0;
  float ccOp = 0.0;
${folds}
  uv = q / vec2(ca, 1.0) + c;
  vec3 col = vec3(0.0);
  float period = (uFlip > 0.5) ? 2.0 : 1.0;
  float ph = mod(uPhase, period);
${RENDERERS[rend]}
  float effCc = uCcMode > 0.5 ? uCcMode : ccOp;
  if(par > 0.5 && effCc > 0.5){
    if(effCc < 1.5)       col = vec3(1.0) - col;
    else if(effCc < 2.5)  col = hueShift(col, 3.14159265);
    else if(effCc < 3.5)  col = vec3(dot(col, vec3(0.299,0.587,0.114)));
    else                  col = col * uCcTint;
  }
  col *= crack;
  if(uPost > 0.5){
    vec2 vq = vUv - 0.5;
    col *= 1.0 - uVign * smoothstep(0.35, 0.95, dot(vq, vq)*2.2);
    if(uGrain > 0.001){
      col += (hash1(gl_FragCoord.xy * 0.71 + fract(uWavePh)*7.0) - 0.5) * uGrain * 0.14;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
}

function signature(stack, rend){ return rend + '|' + stack.join(','); }

export { assemble, signature, MAX_OPS, RENDERERS };
