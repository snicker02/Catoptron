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
    if(uRD > 0.5){
      vec2 rc = vUv;
      vec2 tx = 1.0 / uCanvas;
      vec4 sp = texture2D(uPrev, rc);
      float U = sp.r, V = sp.g;
      float img = dot(photo(rc), vec3(0.299,0.587,0.114));
      vec2 cell = floor(rc * uCanvas);
      if(U + V < 0.02){ U = 1.0; V = step(1.0 - 0.4*img - 0.06, hash1(cell)) * 0.6; }
      float lU = texture2D(uPrev, rc+vec2(tx.x,0.0)).r + texture2D(uPrev, rc-vec2(tx.x,0.0)).r
               + texture2D(uPrev, rc+vec2(0.0,tx.y)).r + texture2D(uPrev, rc-vec2(0.0,tx.y)).r - 4.0*U;
      float lV = texture2D(uPrev, rc+vec2(tx.x,0.0)).g + texture2D(uPrev, rc-vec2(tx.x,0.0)).g
               + texture2D(uPrev, rc+vec2(0.0,tx.y)).g + texture2D(uPrev, rc-vec2(0.0,tx.y)).g - 4.0*V;
      float drive = (img - 0.5) * uFbAmt;
      float feed = clamp(mix(0.030, 0.058, clamp((uStep-0.42)/0.52, 0.0, 1.0)) + drive*0.030, 0.020, 0.064);
      float kill = clamp(mix(0.058, 0.065, clamp((uTwist+1.5708)/3.1416, 0.0, 1.0)) - drive*0.008, 0.055, 0.068);
      float uvv = U*V*V;
      U += 0.16*lU - uvv + feed*(1.0-U);
      V += 0.08*lV + uvv - (feed+kill)*V;
      float thr = mix(0.9985, mix(0.9996, 0.988, img), uFbAmt);
      if(hash1(cell + floor(uPhase*3.0)) > thr) V = 0.6;
      col = vec3(clamp(U,0.0,1.0), clamp(V,0.0,1.0), clamp(V,0.0,1.0));
    } else {
    vec2 p = uv;
    float t = (uStep - 0.42) / 0.52;
    float fz = mix(0.90, 1.02, t);
    vec2 f = (p - c) * vec2(ca, 1.0);
    f = rot(uTwist * 0.02) * f;
    f *= fz;
    vec2 pf = f / vec2(ca, 1.0) + c + uShift * 0.05;
    if(uFlip > 0.5) pf.x = 2.0*c.x - pf.x;
    pf = rippled(pf, 1.5);
    if(uMosh > 0.001){
      vec2 mcell = floor(pf * mix(4.0, 28.0, uMosh));
      float mstep = floor(uPhase * 3.0);
      float mh = fract(sin(dot(mcell, vec2(127.1,311.7)) + uSeed + mstep)*43758.5453);
      float mh2 = fract(sin(dot(mcell, vec2(269.5,183.3)) + uSeed + mstep)*43758.5453);
      if(mh < uMosh*0.6) pf += (vec2(mh2, fract(mh*7.0)) - 0.5) * 0.12 * uMosh;
    }
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
    col = mix(src, fb, uFbAmt);
    }`,
  6: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    float tile = mix(0.15, 1.2, (uStep - 0.42) / 0.52);
    vec2 g = d / tile + uShift;
    vec2 cell = floor(g);
    vec2 fp = g - cell;
    if(uFlip > 0.5){
      if(mod(mod(cell.x,2.0)+2.0,2.0) >= 1.0) fp.x = 1.0 - fp.x;
      if(mod(mod(cell.y,2.0)+2.0,2.0) >= 1.0) fp.y = 1.0 - fp.y;
    }
    fp = rot(uTwist * (cell.x - cell.y) * 0.25) * (fp - 0.5) + 0.5;
    float e = min(min(fp.x, 1.0-fp.x), min(fp.y, 1.0-fp.y));
    float dk = clamp((abs(cell.x)+abs(cell.y)) * 0.5, 0.0, 48.0);
    col = shade(fp, dk, e);`,
  7: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    float r = length(d);
    float a = atan(d.y, d.x) + uTwist * 0.5;
    float N = clamp(floor(uDepth), 3.0, 40.0);
    float wedge = TAU / N;
    a = mod(a, wedge);
    a = abs(a - wedge * 0.5);
    vec2 dir = vec2(cos(a), sin(a));
    float rr = r / mix(0.4, 1.6, (uStep - 0.42) / 0.52);
    rr = 1.0 - abs(mod(rr + ph, 2.0) - 1.0);
    vec2 p = dir * rr + 0.5 + uShift;
    float e = min(rr, 1.0 - rr);
    float dk = clamp(r * 2.0, 0.0, 48.0);
    col = shade(p, dk, e);`,
  8: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    float rad = mix(0.5, 1.35, (uStep - 0.42) / 0.52);
    vec2 s2 = d / rad;
    float rr = dot(s2, s2);
    if(rr <= 1.0){
      float z = sqrt(max(0.0, 1.0 - rr));
      vec2 sxy = rot(uTwist * 0.5) * s2;
      float lon = atan(sxy.x, z) / TAU + 0.5 + ph * 0.05;
      float lat = asin(clamp(sxy.y, -1.0, 1.0)) / 3.14159265 + 0.5;
      vec2 p = vec2(lon, lat) + uShift;
      if(uFlip > 0.5) p.x = 1.0 - p.x;
      float e = clamp((1.0 - rr) * 6.0, 0.0, 999.0);
      col = shade(p, 0.0, e);
      col *= 0.5 + 0.5 * z;
    } else {
      col = shade(uv, 24.0, 999.0) * 0.10;
    }`,
  9: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    d = rot(uTwist * 0.1) * d;
    float dens = mix(1.5, 8.0, (uStep - 0.42) / 0.52);
    float march = ph * 0.6 + d.x * dens;
    vec2 p = vec2(d.x, d.y + march) + c + uShift;
    if(uFlip > 0.5) p.x = 2.0*c.x - p.x;
    float e = clamp(0.6 - abs(fract(d.y + march) - 0.5), 0.0, 999.0);
    col = shade(p, 0.0, e);`,
  10: `
    vec2 d = (uv - c) * vec2(ca, 1.0);
    d = rot(uTwist * 0.5) * d;
    float R = length(d);
    float ang = atan(d.y, d.x);
    float dens = mix(1.0, 6.0, (uStep - 0.42) / 0.52);
    float hr = 0.5 * log((1.0 + R) / (1.0 - min(R, 0.999)));
    vec2 p = vec2(ang * 0.15915 + 0.5, hr * dens - ph * 0.25) + uShift;
    if(uFlip > 0.5) p.x = 1.0 - p.x;
    float dk = clamp((R - 0.85) / 0.15, 0.0, 1.0) * 6.0;
    float e = clamp(1.0 - max(R - 1.0, 0.0) * 40.0, 0.0, 999.0);
    col = shade(p, dk, e);`,
  11: `
    vec2 z = (uv - c) * vec2(ca, 1.0);
    z = rot(uTwist * 0.5) * z;
    float P = floor(mix(3.0, 8.0, (uStep - 0.42) / 0.52) + 0.5);
    float ang0 = 3.14159265 / P;
    float dcen = 1.0 / sin(ang0);
    float rcir = sqrt(dcen*dcen - 1.0);
    for(int i = 0; i < 16; i++){
      float aa = atan(z.y, z.x);
      float seg = TAU / P;
      aa = abs(mod(aa, seg) - seg*0.5);
      float rr = length(z);
      z = rr * vec2(cos(aa), sin(aa));
      vec2 dz = z - vec2(dcen, 0.0);
      float d2 = dot(dz, dz);
      if(d2 < rcir*rcir){ z = vec2(dcen, 0.0) + (rcir*rcir)*dz/d2; }
      else { break; }
    }
    vec2 p = z * 0.5 + c + uShift + vec2(ph*0.05, 0.0);
    col = shade(p, 0.0, 999.0);`,
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
  return `  q -= uO${i};\n  q = rot(-uR${i}) * q;\n  q = ${op.fn}(${args});\n  q = rot(uR${i}) * q;\n  q += uO${i};`;
}

function assemble(stack, rend = 0){
  const helperSrc = resolveHelpers(stack);
  const opSrc = [...new Set(stack)].map(t => OPS[t].glsl).join('\n');
  const folds = stack.map((t, i) => foldCall(t, i)).join('\n');
  const decls = stack.map((t, i) => {
    const banks = Math.max(1, Math.ceil(OPS[t].params.length / 4));
    let d = '';
    for(let b = 0; b < banks; b++) d += `uniform vec4 uP${i}_${b};\n`;
    return d + `uniform vec2 uO${i};\nuniform float uR${i};`;
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
  // global wobble: broad undulation feeding every fold; amplitude tied to Wobble so 0 == static
  q += uWobble * 0.025 * vec2(sin(q.y*4.0 + uWavePh), sin(q.x*4.0 - uWavePh*1.27));
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
    col *= uExposure;
    col = (col - 0.5) * uContrast + 0.5;
    float _lm = dot(col, vec3(0.299,0.587,0.114));
    col = mix(vec3(_lm), col, uSat);
    col.r *= 1.0 + uWarm*0.35; col.b *= 1.0 - uWarm*0.35;
    if(abs(uHueRot) > 0.0001) col = hueShift(col, uHueRot);
    if(uPosterize >= 1.5) col = floor(col * uPosterize + 0.5) / uPosterize;
    if(uScan > 0.001){ float _sl = 0.5 + 0.5*cos(gl_FragCoord.y * 3.14159265); col *= 1.0 - uScan*0.6*_sl; }
    col = clamp(col, 0.0, 1.0);
    if(uChanSwap > 0.001){
      float hcs = fract(sin(dot(floor(gl_FragCoord.xy/14.0), vec2(127.1,311.7))+uSeed)*43758.5453);
      if(hcs < uChanSwap) col = (hcs < uChanSwap*0.5) ? col.gbr : col.brg;
    }
    if(uDropout > 0.001){
      float hdo = fract(sin(dot(floor(gl_FragCoord.xy/11.0), vec2(269.5,183.3))+uSeed*1.7)*43758.5453);
      if(hdo < uDropout){ float kk=fract(hdo*13.0); col = (kk<0.4)?vec3(0.0):((kk<0.7)?vec3(1.0):(vec3(1.0)-col)); }
    }
    if(uDither >= 1.5){
      float bay = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233)))*43758.5453);
      col = floor(col*uDither + bay)/uDither;
    }
    if(uNoiseG > 0.001){
      float hno = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)) + uSeed + fract(uWavePh)*31.0)*43758.5453);
      col += (hno-0.5)*uNoiseG;
    }
    col = clamp(col, 0.0, 1.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
}

function signature(stack, rend){ return rend + '|' + stack.join(','); }

export { assemble, signature, MAX_OPS, RENDERERS };
