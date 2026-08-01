// Unified operator registry — ordered array, indexed by stack type.
// Each record carries BOTH the UI param spec (params) and the GLSL (glsl/deps/flags),
// so the sliders and the shader can never drift apart. Adding an operator = one entry here.
// flags: par = writes counterchange parity, crack = writes crack mask, p2 = uses 2nd param bank.
// fn name must equal the GLSL function name. All bodies verbatim from the current tool.
const OPS = [
  { name:'Polar fold', fn:'opPolar', par:true, deps:[],
    params:[['Segments',3,24,1,8],['Offset\u00b0',-180,180,1,0]],
    glsl:`vec2 opPolar(vec2 q, vec4 P, inout float par){
  float r = length(q);
  float a = atan(q.y, q.x) + P.y*DEG;
  float seg = TAU / P.x;
  a = mod(a, seg);
  float hf = seg*0.5;
  if(a < hf) par = mod(par + 1.0, 2.0);
  a = abs(a - hf);
  return vec2(cos(a), sin(a)) * r;
}` },
  { name:'Rotate', fn:'opRotate', deps:[],
    params:[['Angle\u00b0',-180,180,0.5,45]],
    glsl:`vec2 opRotate(vec2 q, vec4 P){ return rot(P.x*DEG) * q; }` },
  { name:'Scale', fn:'opScale', deps:[],
    params:[['Factor',0.3,3,0.01,1.5]],
    glsl:`vec2 opScale(vec2 q, vec4 P){ return q / max(P.x, 1e-3); }` },
  { name:'Mosaic', fn:'opMosaic', deps:[],
    params:[['Cells',2,60,1,16]],
    glsl:`vec2 opMosaic(vec2 q, vec4 P){ return (floor(q * P.x) + 0.5) / P.x; }` },
  { name:'Swirl', fn:'opSwirl', deps:[],
    params:[['Amount',-6,6,0.05,2]],
    glsl:`vec2 opSwirl(vec2 q, vec4 P){ return rot(P.x * length(q)) * q; }` },
  { name:'Spiral', fn:'opSpiral', deps:[],
    params:[['Amount',-3,3,0.01,0.8]],
    glsl:`vec2 opSpiral(vec2 q, vec4 P){ float r = max(length(q), 1e-4); return rot(P.x * log(r)) * q; }` },
  { name:'Shatter', fn:'opShatter', crack:true, deps:[],
    params:[['Cells',0.5,8,0.1,3],['Tilt',0,2,0.01,0.8]],
    glsl:`vec2 opShatter(vec2 q, vec4 P, inout float crack){
  vec2 g = q * P.x * 2.0;
  vec2 ig = floor(g);
  float d1 = 8.0, d2 = 8.0;
  vec2 bestSite = g, bestCell = ig;
  for(int y = -1; y <= 1; y++){
    for(int x = -1; x <= 1; x++){
      vec2 cell = ig + vec2(float(x), float(y));
      vec2 site = cell + hash2(cell);
      float d = length(g - site);
      if(d < d1){ d2 = d1; d1 = d; bestSite = site; bestCell = cell; }
      else if(d < d2){ d2 = d; }
    }
  }
  float e = d2 - d1;
  float ck = 0.35 + 0.65 * smoothstep(0.0, uFrameW*3.0 + 0.01, e);
  crack *= mix(1.0, ck, clamp(uFrame*1.4, 0.0, 1.0));
  vec2 r = hash2(bestCell*1.71 + 11.0);
  vec2 local = g - bestSite;
  local = rot((r.x - 0.5) * 2.0 * P.y) * local;
  if(r.y > 0.5) local.x = -local.x;
  return (bestSite + local) / (P.x * 2.0);
}` },
  { name:'Bipolar', fn:'opBipolar', deps:[],
    params:[['Amount',0.1,3,0.01,1],['Shift',-2,2,0.01,0]],
    glsl:`vec2 opBipolar(vec2 q, vec4 P){
  const float PI_2  = 1.57079632679;
  const float M_PI  = 3.14159265359;
  const float M2PI  = 0.63661977237;
  float x2y2 = dot(q, q);
  float t  = x2y2 + 1.0;
  float x2 = 2.0 * q.x;
  float ps = -PI_2 * P.y;
  float y = 0.5 * atan(2.0*q.y, x2y2 - 1.0) + ps;
  if(y > PI_2)       y = -PI_2 + mod(y + PI_2, M_PI);
  else if(y < -PI_2) y =  PI_2 - mod(PI_2 - y, M_PI);
  float f = t + x2;
  float g = t - x2;
  if(g == 0.0 || f/g <= 0.0) return q;
  return vec2(P.x * 0.25 * M2PI * log(f/g),
              P.x * M2PI * y);
}` },
  { name:'Elliptic', fn:'opElliptic', deps:['sqrt1pm1','sqrt_safe'],
    params:[['Amount',0.1,3,0.01,1],['Mode',0,2,1,0,['original','mirror y','precision']]],
    glsl:`vec2 opElliptic(vec2 q, vec4 P){
  float v = P.x * 0.63661977237;
  if(P.y > 1.5){
    float sq = dot(q, q);
    float x2 = 2.0 * q.x;
    float xmaxm1 = 0.5 * (sqrt1pm1(sq + x2) + sqrt1pm1(sq - x2));
    float ssx = (xmaxm1 < 0.0) ? 0.0 : sqrt(xmaxm1);
    float a = q.x / (1.0 + xmaxm1);
    float sgn = (q.y > 0.0) ? 1.0 : -1.0;
    return vec2(v * asin(clamp(a, -1.0, 1.0)),
                sgn * v * log(1.0 + xmaxm1 + ssx));
  }
  float tmp = dot(q, q) + 1.0;
  float x2 = 2.0 * q.x;
  float xmax = 0.5 * (sqrt(tmp + x2) + sqrt(tmp - x2));
  float a = q.x / xmax;
  float b = sqrt_safe(1.0 - a*a);
  float sgn = (q.y > 0.0) ? 1.0 : -1.0;
  if(P.y > 0.5) sgn = (hash1(q * 37.0) < 0.5) ? 1.0 : -1.0;
  return vec2(v * atan(a, b),
              sgn * v * log(xmax + sqrt_safe(xmax - 1.0)));
}` },
  { name:'Counterchange', fn:'opCounterchange', ccop:true, deps:[],
    params:[['Mode',0,3,1,1,['stripes','checker','pinwheel','rings']],['Cell',0.02,2,0.01,0.5],['Angle°',-180,180,1,0],['Recolor',0,4,1,1,['off','negate','hue 180°','desaturate','tint']]],
    glsl:`vec2 opCounterchange(vec2 q, vec4 P, inout float par, inout float ccOp){
  float mode = P.x;
  float cell = max(P.y, 0.02);
  float a = P.z * DEG;
  vec2 u = rot(-a) * q;
  float odd = 0.0;
  if(mode < 0.5){
    odd = mod(floor(u.x / cell), 2.0);
  } else if(mode < 1.5){
    odd = mod(floor(u.x / cell) + floor(u.y / cell), 2.0);
  } else if(mode < 2.5){
    float N = max(floor(P.y + 0.5), 2.0);
    float ang = atan(u.y, u.x) + TAU;
    odd = mod(floor(ang / (TAU / N)), 2.0);
  } else {
    odd = mod(floor(length(u) / cell), 2.0);
  }
  par = mod(par + odd, 2.0);
  ccOp = P.w;
  return q;
}` },
  { name:'Kleinian', fn:'opKleinian', p2:true, deps:['ctanh'],
    params:[['Circles',2,12,1,5],['Radius',0.2,1.8,0.01,1],['Iters',1,24,1,16],['Scale',0.2,2,0.01,0.9],['Bound',0,1,1,1,['off','on']],['Spin\u00b0',-60,60,0.5,0],['Twist\u00b0',-180,180,1,0],['Frame',0,1,1,0,['circle','strip']]],
    glsl:`vec2 opKleinian(vec2 q, vec4 P, vec4 P2){
  float N  = max(floor(P.x + 0.5), 2.0);
  float kf = clamp(P.y, 0.2, 1.8);
  float sc = max(P.w, 0.05);
  float bound = P2.x;
  mat2  sr = rot(P2.y * DEG);
  float tw = P2.z * DEG;
  float s   = sin(TAU / (2.0 * N));
  float rho = 1.0 / (1.0 + s);
  float rc  = kf * s / (1.0 + s);
  float rc2 = rc * rc;
  vec2 z = q * sc;
  if(P2.w > 0.5) z = ctanh(z);
  for(int i = 0; i < 24; i++){
    if(float(i) >= P.z) break;
    bool changed = false;
    if(bound > 0.5){
      float l = dot(z, z);
      if(l > 1.0){ z = z / max(l, 1e-6); changed = true; }
    }
    if(!changed){
      for(int k = 0; k < 12; k++){
        if(float(k) >= N) break;
        float ang = tw + TAU * float(k) / N;
        vec2 cen = rho * vec2(cos(ang), sin(ang));
        vec2 dz = z - cen;
        float l2 = dot(dz, dz);
        if(l2 < rc2){
          dz = sr * (dz * (rc2 / max(l2, 1e-6)));
          z = cen + dz;
          changed = true;
          break;
        }
      }
    }
    if(!changed) break;
  }
  return z / sc;
}` },
  { name:'Mobius abcd', fn:'opMobiusABCD', p2:true, deps:[],
    params:[['Re a',-4,4,0.05,1.5],['Im a',-4,4,0.05,0.5],['Re b',-4,4,0.05,0],['Im b',-4,4,0.05,0],['Re c',-4,4,0.05,2],['Im c',-4,4,0.05,0],['Re d',-4,4,0.05,0.5],['Im d',-4,4,0.05,-0.5]],
    glsl:`vec2 opMobiusABCD(vec2 z, vec4 P, vec4 P2){
  vec2 a = P.xy, b = P.zw, c = P2.xy, d = P2.zw;
  vec2 u = vec2(a.x*z.x - a.y*z.y + b.x, a.x*z.y + a.y*z.x + b.y);
  vec2 v = vec2(c.x*z.x - c.y*z.y + d.x, c.x*z.y + c.y*z.x + d.y);
  float dv = max(dot(v, v), 1e-6);
  return vec2(u.x*v.x + u.y*v.y, u.y*v.x - u.x*v.y) / dv;
}` },
  { name:'Fuchsian', fn:'opFuchsian', p2:true, deps:['cmul','csqrt','cdivz'],
    params:[['Re ta',-4,4,0.001,3],['Im ta',-2,2,0.001,0],['Re tb',-4,4,0.001,3],['Im tb',-2,2,0.001,0],['tab',0,1,1,0,['Markov','free']],['Re tab',-4,4,0.001,3],['Im tab',-2,2,0.001,0],['Iters',1,24,1,16]],
    glsl:`vec2 opFuchsian(vec2 q, vec4 P, vec4 P2){
  vec2 ta = P.xy, tb = P.zw;
  vec2 tab;
  if(P2.x < 0.5){
    vec2 tt = cmul(ta, tb);
    vec2 disc = cmul(tt, tt) - 4.0 * (cmul(ta, ta) + cmul(tb, tb));
    tab = 0.5 * (tt - csqrt(disc));
  } else {
    tab = vec2(P2.y, P2.z);
  }
  vec2 ha = 0.5 * ta, hb = 0.5 * tb;
  vec2 y  = cmul(ha, ha) - vec2(1.0, 0.0);
  vec2 c0 = tab - 0.5 * cmul(ta, tb);
  vec2 k  = cmul(hb, hb) - vec2(1.0, 0.0);
  vec2 u;
  if(dot(y, y) < 1e-9){
    u = cdivz(k, c0);
  } else {
    vec2 disc2 = cmul(c0, c0) - 4.0 * cmul(y, k);
    u = cdivz(c0 - csqrt(disc2), 2.0 * y);
  }
  vec2 v = c0 - cmul(y, u);
  float ry2 = dot(y, y), rv2 = dot(v, v);
  bool hasA = ry2 > 1e-8;
  bool hasB = rv2 > 1e-8;
  vec2 cA  = -cdivz(ha, y),  cAi =  cdivz(ha, y);
  vec2 cB  = -cdivz(hb, v),  cBi =  cdivz(hb, v);
  float rA2 = 1.0 / max(ry2, 1e-9);
  float rB2 = 1.0 / max(rv2, 1e-9);
  vec2 z = q;
  for(int i = 0; i < 24; i++){
    if(float(i) >= P2.w) break;
    bool moved = false;
    if(hasA && dot(z - cA, z - cA) < rA2){
      z = cdivz(cmul(ha, z) + vec2(1.0, 0.0), cmul(y, z) + ha);
      moved = true;
    } else if(hasA && dot(z - cAi, z - cAi) < rA2){
      z = cdivz(cmul(ha, z) - vec2(1.0, 0.0), -cmul(y, z) + ha);
      moved = true;
    } else if(hasB && dot(z - cB, z - cB) < rB2){
      z = cdivz(cmul(hb, z) + u, cmul(v, z) + hb);
      moved = true;
    } else if(hasB && dot(z - cBi, z - cBi) < rB2){
      z = cdivz(cmul(hb, z) - u, -cmul(v, z) + hb);
      moved = true;
    }
    if(!moved) break;
  }
  return z;
}` },
  { name:'Juliascope', fn:'opJuliascope', par:true, deps:[],
    params:[['Power',-20,20,1,5],['Dist',-2,3,0.01,1],['Wedge cover',0,1,1,1,['fan','random']],['Iters',1,8,1,1]],
    glsl:`vec2 opJuliascope(vec2 q, vec4 P, inout float par){
  float power = P.x;
  float ap = max(abs(power) < 0.5 ? 1.0 : floor(abs(power) + 0.5), 1.0);
  float sp = (power < 0.0) ? -ap : ap;
  float dist = P.y;
  float iters = max(floor(P.w + 0.5), 1.0);
  vec2 z = q;
  for(int it = 0; it < 8; it++){
    if(float(it) >= iters) break;
    float phi = atan(z.y, z.x);
    float r = length(z);
    float k;
    if(P.z < 0.5){
      k = floor((phi + 3.14159265) / TAU * ap);
    } else {
      float seg = floor((phi + 3.14159265) / (TAU / ap));
      k = floor(hash1(vec2(seg * 7.13 + float(it) * 19.7, 1.7 + float(it) * 3.1)) * ap);
    }
    if(iters > 1.5){
      k = mod(k + floor(hash1(vec2(k * 5.3 + 0.5, float(it) * 11.9 + 0.5)) * ap), ap);
    }
    float odd = mod(k, 2.0);
    float sphi = (odd < 0.5) ? phi : -phi;
    if(odd >= 0.5) par = mod(par + 1.0, 2.0);
    float a = (TAU * k + sphi) / sp;
    float rp = pow(max(r, 1e-9), dist / sp);
    z = rp * vec2(cos(a), sin(a));
  }
  return z;
}` },
  { name:'Log spiral', fn:'opLogSpiral', par:true, deps:[],
    params:[['Scale',1.05,6,0.001,2],['Turn\u00b0',-180,180,0.5,0],['Arms',1,12,1,1],['Mirror',0,1,1,0,['off','on']]],
    glsl:`vec2 opLogSpiral(vec2 q, vec4 P, inout float par){
  float s = max(P.x, 1.001);
  float th = P.y * DEG;
  float arms = max(floor(P.z + 0.5), 1.0);
  float r = length(q);
  if(r < 1e-6) return q;
  float ls = log(s);
  float u = log(r);
  float v = atan(q.y, q.x);
  float n = floor(u / ls);
  u -= n * ls;
  v -= n * th;
  float seg = TAU / arms;
  v = mod(v, seg);
  if(P.w > 0.5){
    float h = seg * 0.5;
    if(v > h){ v = seg - v; par = mod(par + 1.0, 2.0); }
  }
  return exp(u) * vec2(cos(v), sin(v));
}` },
  { name:'Triangle fold', fn:'opTri', deps:[],
    params:[['Scale',0.5,8,0.1,3]],
    glsl:`vec2 opTri(vec2 q, vec4 P){
  vec2 p = q * P.x * 2.0;
  const vec2 n30 = vec2(-0.5, 0.86602540);
  for(int i = 0; i < 9; i++){
    p.x = 1.0 - abs(mod(p.x, 2.0) - 1.0);
    p.y = abs(p.y);
    float d = dot(p, n30);
    if(d > 0.0) p -= 2.0*d*n30;
  }
  return p / (P.x * 2.0);
}` },
  { name:'Mirror tile', fn:'opTile', par:true, deps:[],
    params:[['Tiles X',0.5,8,0.1,3],['Tiles Y',0.5,8,0.1,3],['Mode',0,3,1,0,['mirror','mirror X','mirror Y','repeat']]],
    glsl:`vec2 opTile(vec2 q, vec4 P, inout float par){
  float tx = P.x;
  float ty = (P.y < 0.01) ? P.x : P.y;
  vec2 g = q * vec2(tx, ty) + 0.5;
  vec2 m = mir(g);
  vec2 r = fract(g);
  vec2 fl = floor(g);
  float px = mod(fl.x, 2.0);
  float py = mod(fl.y, 2.0);
  vec2 o;
  float pp;
  if(P.z < 0.5)      { o = m;                 pp = px + py; }
  else if(P.z < 1.5) { o = vec2(m.x, r.y);    pp = px;      }
  else if(P.z < 2.5) { o = vec2(r.x, m.y);    pp = py;      }
  else               { o = r;                 pp = 0.0;     }
  par = mod(par + pp, 2.0);
  return (o - 0.5) / vec2(tx, ty);
}` },
  { name:'Ring fold', fn:'opRings', deps:[],
    params:[['Density',0.5,8,0.1,3]],
    glsl:`vec2 opRings(vec2 q, vec4 P){
  float r = length(q);
  float a = atan(q.y, q.x);
  float rr = (1.0 - abs(mod(r*P.x, 2.0) - 1.0)) / P.x;
  return vec2(cos(a), sin(a)) * rr;
}` },
  { name:'Lens', fn:'opLens', deps:[],
    params:[['Curve',-4,4,0.05,1.5]],
    glsl:`vec2 opLens(vec2 q, vec4 P){
  float r = max(length(q), 1e-5);
  float c = abs(P.x) + 1e-4;
  if(P.x >= 0.0) return q * (atan(r*c) / (r*c));
  return q * (tan(min(r*c, 1.35)) / (r*c));
}` },
  { name:'Bubbles', fn:'opBubbles', deps:[],
    params:[['Scale',0.5,6,0.1,3],['Floor',0.05,0.6,0.01,0.15],['Iters',1,7,1,5]],
    glsl:`vec2 opBubbles(vec2 q, vec4 P){
  vec2 p = q * P.x * 0.9;
  float itn = (P.z < 0.5) ? 7.0 : P.z;
  for(int i = 0; i < 7; i++){
    if(float(i) >= itn) break;
    p = -1.0 + 2.0*fract(0.5*p + 0.5);
    float dd = dot(p, p);
    if(dd < 1.0) p /= max(dd, P.y);
  }
  return p / (P.x * 0.9);
}` },
  { name:'Wave warp', fn:'opWarp', deps:['wv'],
    params:[['Amp',0,1,0.01,0.3],['Freq',0.5,8,0.1,2],['Wave',0,3,1,0,['sine','triangle','saw','square']]],
    glsl:`vec2 opWarp(vec2 q, vec4 P){
  float w = P.x * 0.12;
  return q + w * vec2(wv(q.y*P.y*TAU + uWavePh, P.z),
                      wv(q.x*P.y*TAU*1.37 - uWavePh*1.3, P.z));
}` },
  { name:'Shift', fn:'opShift', deps:[],
    params:[['X',-1,1,0.005,0.2],['Y',-1,1,0.005,0]],
    glsl:`vec2 opShift(vec2 q, vec4 P){ return q + P.xy; }` },
  { name:'Shear', fn:'opShear', deps:[],
    params:[['X',-1.5,1.5,0.01,0.4],['Y',-1.5,1.5,0.01,0]],
    glsl:`vec2 opShear(vec2 q, vec4 P){
  q.x += P.x * q.y;
  q.y += P.y * q.x;
  return q;
}` },
  { name:'Petal', fn:'opPetal', deps:[],
    params:[['Lobes',2,16,1,6],['Amp',0,0.5,0.005,0.12]],
    glsl:`vec2 opPetal(vec2 q, vec4 P){
  float r = length(q);
  float a = atan(q.y, q.x);
  r += sin(a * P.x) * P.y;
  return vec2(cos(a), sin(a)) * r;
}` },
  { name:'Spherical', fn:'opSpherical', deps:[],
    params:[['Radius',0.1,2,0.01,0.6]],
    glsl:`vec2 opSpherical(vec2 q, vec4 P){
  float r2 = max(dot(q, q), 1e-5);
  return q * (P.x * P.x) / r2;
}` },
  { name:'Complex', fn:'opComplexChain', deps:['cstage'],
    params:[['Stage 1',0,27,1,7,['identity','1/z','z²','sqrt','exp','log','log_divide','sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','asinh','acosh','atanh','sec','csc','cot','sech','csch','coth','asech','acosech','acoth']],['Stage 2',0,27,1,0,['identity','1/z','z²','sqrt','exp','log','log_divide','sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','asinh','acosh','atanh','sec','csc','cot','sech','csch','coth','asech','acosech','acoth']],['Stage 3',0,27,1,0,['identity','1/z','z²','sqrt','exp','log','log_divide','sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','asinh','acosh','atanh','sec','csc','cot','sech','csch','coth','asech','acosech','acoth']],['Stage 4',0,27,1,0,['identity','1/z','z²','sqrt','exp','log','log_divide','sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','asinh','acosh','atanh','sec','csc','cot','sech','csch','coth','asech','acosech','acoth']],['Freq X',0.1,8,0.05,1],['Freq Y',0.1,8,0.05,1],['Amount',0.1,3,0.01,1],['Reflect',0,1,1,0,['off','mirror']]],
    glsl:`vec2 opComplexChain(vec2 q, vec4 P, vec4 P2){
  vec2 z = q * vec2(P2.x, P2.y);
  z = cstage(z, P.x);
  z = cstage(z, P.y);
  z = cstage(z, P.z);
  z = cstage(z, P.w);
  float amt = (P2.z <= 0.0) ? 1.0 : P2.z;
  if(P2.w > 0.5 && hash1(q*13.0) < 0.5) z = -z;
  return amt * z;
}` },
  { name:'KIFS', fn:'opKifs', deps:[],
    params:[['Iters',1,12,1,6],['Fold',0,1,0.005,0.25],['Angle\u00b0',-180,180,0.5,25],['Scale',0.5,1.8,0.005,1.05]],
    glsl:`vec2 opKifs(vec2 q, vec4 P){
  mat2 R = rot(P.z * DEG) * P.w;
  vec2 p = q;
  for(int i = 0; i < 12; i++){
    if(float(i) >= P.x) break;
    p = abs(p) - P.y;
    p = R * p;
  }
  return p;
}` },
  { name:'Koch fold', fn:'opKoch', deps:[],
    params:[['Iters',0,6,1,4],['Scale',0.3,4,0.05,1]],
    glsl:`vec2 opKoch(vec2 q, vec4 P){
  const float PI = 3.14159265359;
  vec2 p = q * P.y;
  float a53 = 5.0/6.0 * PI;
  p.x = abs(p.x);
  p.y += tan(a53) * 0.5;
  vec2 n = vec2(sin(a53), cos(a53));
  float d = dot(p - vec2(0.5, 0.0), n);
  p -= n * max(0.0, d) * 2.0;
  n = vec2(sin(2.0/3.0 * PI), cos(2.0/3.0 * PI));
  p.x += 0.5;
  float sc = 1.0;
  for(int i = 0; i < 6; i++){
    if(float(i) >= P.x) break;
    p *= 3.0; sc *= 3.0;
    p.x -= 1.5;
    p.x = abs(p.x);
    p.x -= 0.5;
    p -= n * 2.0 * min(dot(p, n), 0.0);
  }
  return (p / sc) / P.y;
}` },
  { name:'Radial pow', fn:'opRadPow', deps:[],
    params:[['Amount',0.1,3,0.01,1],['Power',-3,3,0.01,1.5]],
    glsl:`vec2 opRadPow(vec2 q, vec4 P){
  float r = max(length(q), 1e-6);
  float rn = P.x * pow(r, P.y);
  return q * (rn / r);
}` },
  { name:'Fresnel', fn:'opFresnel', deps:[],
    params:[['Rings',0.5,12,0.1,3],['Gain',0.2,3,0.01,1]],
    glsl:`vec2 opFresnel(vec2 q, vec4 P){
  float r = length(q);
  float s = fract(r * P.x) / max(P.y, 0.01);
  return q * s;
}` },
  { name:'DModulus', fn:'opDModulus', deps:['dmwrap'],
    params:[['Size X',0.01,3,0.01,0.6],['Size Y',0.01,3,0.01,0.6],['Angle\u00b0',0,90,0.5,45],['Iters',1,8,1,3]],
    glsl:`vec2 opDModulus(vec2 q, vec4 P){
  float mx = max(P.x, 1e-3), my = max(P.y, 1e-3);
  float a = P.z * DEG;
  float ca = cos(a), sa = sin(a);
  float cc = ca*ca, ss = sa*sa, sc = sa*ca;
  vec2 p = q;
  for(int i = 0; i < 8; i++){
    if(float(i) >= P.w) break;
    vec2 tid = floor((p + vec2(mx, my)) / (2.0 * vec2(mx, my)));
    p.x = dmwrap(p.x, mx);
    p.y = dmwrap(p.y, my);
    float rr = hash1(tid * 17.31 + vec2(float(i)*13.19 + 3.7, float(i)*7.31 + 1.3));
    if(rr < cc){
      p = vec2( p.x*cc + p.y*sc + mx,
               -p.x*sc + p.y*cc - my);
    } else {
      p = vec2( p.x*sc + p.y*ss,
               -p.x*ss + p.y*sc);
    }
    p.x = dmwrap(p.x, mx);
    p.y = dmwrap(p.y, my);
  }
  return p;
}` },
  { name:'Wallpaper', fn:'opWallpaper', par:true, deps:['wc'],
    params:[['Group',0,16,1,16,['p1','p2','pm','pg','cm','pmm','pmg','pgg','cmm','p4','p4m','p4g','p3','p3m1','p31m','p6','p6m']],['Cell',0.2,4,0.05,1.2],['Angle\u00b0',-90,90,0.5,0]],
    glsl:`vec2 opWallpaper(vec2 q, vec4 P, inout float par){
  float gp = P.x;
  float cell = max(P.y, 0.05);
  vec2 g = rot(-P.z * DEG) * q / cell;
  vec2 b;
  float bp = 0.0;
  if(gp < 11.5){
    vec2 f = fract(g);
    float x = f.x, y = f.y;
    b = f;
    float bk = f.y*97.0 + f.x;
    if(gp < 0.5){ }
    else if(gp < 1.5){ wc(vec2(-x,-y),0.0,b,bk,bp); }
    else if(gp < 2.5){ wc(vec2(x,-y),1.0,b,bk,bp); }
    else if(gp < 3.5){ wc(vec2(x+0.5,-y),1.0,b,bk,bp); }
    else if(gp < 4.5){ wc(vec2(x,-y),1.0,b,bk,bp);
                       wc(vec2(x+0.5,y+0.5),0.0,b,bk,bp);
                       wc(vec2(x+0.5,0.5-y),1.0,b,bk,bp); }
    else if(gp < 5.5){ wc(vec2(-x,-y),0.0,b,bk,bp); wc(vec2(x,-y),1.0,b,bk,bp);
                       wc(vec2(-x,y),1.0,b,bk,bp); }
    else if(gp < 6.5){ wc(vec2(-x,-y),0.0,b,bk,bp); wc(vec2(x+0.5,-y),1.0,b,bk,bp);
                       wc(vec2(0.5-x,y),1.0,b,bk,bp); }
    else if(gp < 7.5){ wc(vec2(-x,-y),0.0,b,bk,bp);
                       wc(vec2(x+0.5,0.5-y),1.0,b,bk,bp);
                       wc(vec2(0.5-x,y+0.5),1.0,b,bk,bp); }
    else if(gp < 8.5){ wc(vec2(-x,-y),0.0,b,bk,bp); wc(vec2(x,-y),1.0,b,bk,bp);
                       wc(vec2(-x,y),1.0,b,bk,bp);
                       wc(vec2(x+0.5,y+0.5),0.0,b,bk,bp); wc(vec2(0.5-x,0.5-y),0.0,b,bk,bp);
                       wc(vec2(x+0.5,0.5-y),1.0,b,bk,bp); wc(vec2(0.5-x,y+0.5),1.0,b,bk,bp); }
    else if(gp < 9.5){ wc(vec2(-y,x),0.0,b,bk,bp); wc(vec2(-x,-y),0.0,b,bk,bp);
                       wc(vec2(y,-x),0.0,b,bk,bp); }
    else if(gp < 10.5){ wc(vec2(-y,x),0.0,b,bk,bp); wc(vec2(-x,-y),0.0,b,bk,bp);
                        wc(vec2(y,-x),0.0,b,bk,bp);
                        wc(vec2(y,x),1.0,b,bk,bp); wc(vec2(-x,y),1.0,b,bk,bp);
                        wc(vec2(-y,-x),1.0,b,bk,bp); wc(vec2(x,-y),1.0,b,bk,bp); }
    else { wc(vec2(-y,x),0.0,b,bk,bp); wc(vec2(-x,-y),0.0,b,bk,bp);
           wc(vec2(y,-x),0.0,b,bk,bp);
           wc(vec2(y+0.5,x+0.5),1.0,b,bk,bp); wc(vec2(0.5-x,y+0.5),1.0,b,bk,bp);
           wc(vec2(0.5-y,0.5-x),1.0,b,bk,bp); wc(vec2(x+0.5,0.5-y),1.0,b,bk,bp); }
    par = mod(par + bp, 2.0);
    return rot(P.z * DEG) * (b * cell);
  }
  mat2 MH = mat2(1.0, 0.0, 0.5, 0.86602540);
  mat2 MI = mat2(1.0, 0.0, -0.57735027, 1.15470054);
  vec2 f = fract(MI * g);
  float rotN; float mir; mat2 SM = mat2(1.0);
  if(gp < 12.5){ rotN = 3.0; mir = 0.0; }
  else if(gp < 13.5){ rotN = 3.0; mir = 1.0;
                      SM = mat2(-1.0, 0.0, -1.0, 1.0); }
  else if(gp < 14.5){ rotN = 3.0; mir = 1.0;
                      SM = mat2(1.0, 0.0, 1.0, -1.0); }
  else if(gp < 15.5){ rotN = 6.0; mir = 0.0; }
  else { rotN = 6.0; mir = 1.0;
         SM = mat2(1.0, 0.0, 1.0, -1.0); }
  mat2 A = (rotN > 4.0) ? mat2(0.0, 1.0, -1.0, 1.0)
                        : mat2(-1.0, 1.0, -1.0, 0.0);
  b = f;
  float bk = f.y*97.0 + f.x;
  vec2 cur = f;
  for(int k = 0; k < 6; k++){
    if(float(k) >= rotN) break;
    wc(cur, 0.0, b, bk, bp);
    if(mir > 0.5) wc(SM * cur, 1.0, b, bk, bp);
    cur = fract(A * cur);
  }
  par = mod(par + bp, 2.0);
  return rot(P.z * DEG) * ((MH * b) * cell);
}` },
  { name:'Mirror line', fn:'opMirrorLine', par:true, deps:[],
    params:[['Angle\u00b0',-180,180,0.5,0],['Side',0,1,1,0,['side A','side B']]],
    glsl:`vec2 opMirrorLine(vec2 q, vec4 P, inout float par){
  float a = P.x * DEG;
  vec2 n = vec2(-sin(a), cos(a));
  if(P.y > 0.5) n = -n;
  float d = dot(q, n);
  if(d > 0.0){ q -= 2.0*d*n; par = mod(par + 1.0, 2.0); }
  return q;
}` },
  { name:'Circle mirror', fn:'opCircleMirror', deps:[],
    params:[['Radius',0.05,1.5,0.005,0.4],['Mode',0,1,1,0,['ball','window']]],
    glsl:`vec2 opCircleMirror(vec2 q, vec4 P){
  float R2 = P.x * P.x;
  float r2 = max(dot(q, q), 1e-9);
  if(P.y < 0.5){
    if(r2 < R2) q *= R2 / r2;
  } else {
    if(r2 > R2) q *= R2 / r2;
  }
  return q;
}` },
  { name:'Frieze', fn:'opFrieze', par:true, deps:[],
    params:[['Group',0,6,1,1,['p1 hop','p11g step','p1m1 sidle','p2 spin hop','p2mg spin sidle','p11m jump','p2mm spin jump']],['Angle\u00b0',-90,90,0.5,0],['Period',0.1,3,0.01,0.8]],
    glsl:`vec2 opFrieze(vec2 q, vec4 P, inout float par){
  float gn = P.x;
  float a = P.y * DEG;
  float L = max(P.z, 0.05);
  vec2 u = rot(-a) * q;
  float f = fract(u.x / L);
  float y = u.y;
  float pp = 0.0;
  if(gn < 0.5){ }
  else if(gn < 1.5){
    if(f >= 0.5){ f -= 0.5; y = -y; pp += 1.0; }
  }
  else if(gn < 2.5){
    if(f > 0.5) pp += 1.0;
    f = 0.5 - abs(f - 0.5);
  }
  else if(gn < 3.5){
    if(f >= 0.5){ f = 1.0 - f; y = -y; }
  }
  else if(gn < 4.5){
    if(y < 0.0){ y = -y; f = fract(f + 0.5); pp += 1.0; }
    if(f > 0.5) pp += 1.0;
    f = 0.5 - abs(f - 0.5);
  }
  else if(gn < 5.5){
    if(y < 0.0) pp += 1.0;
    y = abs(y);
  }
  else {
    if(y < 0.0) pp += 1.0;
    y = abs(y);
    if(f > 0.5) pp += 1.0;
    f = 0.5 - abs(f - 0.5);
  }
  par = mod(par + pp, 2.0);
  u = vec2(f * L, y);
  return rot(a) * u;
}` },
  { name:'Pleat', fn:'opPleat', par:true, deps:[],
    params:[['Angle\u00b0',-90,90,0.5,0],['Width',0.05,1.5,0.005,0.3],['Tilt\u00b0',-45,45,0.5,12]],
    glsl:`vec2 opPleat(vec2 q, vec4 P, inout float par){
  float a = P.x * DEG;
  float W = max(P.y, 0.02);
  float tilt = P.z * DEG;
  vec2 u = rot(-a) * q;
  float i = floor(u.x / W);
  float pr = mod(i, 2.0);
  float cx = (i + 0.5) * W;
  vec2 loc = vec2(u.x - cx, u.y);
  if(pr >= 1.0){ loc.x = -loc.x; tilt = -tilt; par = mod(par + 1.0, 2.0); }
  loc = rot(tilt) * loc;
  u = vec2(cx, 0.0) + loc;
  return rot(a) * u;
}` },
  { name:'Hyperbolic', fn:'opHyperbolic', deps:[],
    params:[['p',3,12,1,4],['q',3,12,1,5],['Scale',0.2,2,0.01,0.7]],
    glsl:`vec2 opHyperbolic(vec2 q, vec4 P){
  float p  = max(floor(P.x + 0.5), 3.0);
  float qn = max(floor(P.y + 0.5), 3.0);
  float sc = max(P.z, 0.05);
  vec2 z = q * sc;
  float rad0 = length(z);
  if(rad0 > 0.999) z *= 0.999 / rad0;
  float seg = TAU / (2.0 * p);
  float C = cos(TAU / (2.0 * qn)) / max(sin(seg), 1e-4);
  bool hyp = C > 1.0001;
  float xm = hyp ? sqrt((C - 1.0) / (C + 1.0)) : 0.0;
  float d  = hyp ? 0.5 * (xm + 1.0 / xm) : 0.0;
  float rm = hyp ? 0.5 * (1.0 / xm - xm) : 0.0;
  float rm2 = rm * rm;
  for(int i = 0; i < 24; i++){
    float ang = atan(z.y, z.x);
    float rr  = length(z);
    ang = mod(ang, 2.0 * seg);
    if(ang > seg) ang = 2.0 * seg - ang;
    z = rr * vec2(cos(ang), sin(ang));
    if(!hyp) break;
    vec2 dz = z - vec2(d, 0.0);
    float l2 = dot(dz, dz);
    if(l2 >= rm2) break;
    z = vec2(d, 0.0) + dz * (rm2 / l2);
  }
  return z / sc;
}` },
  { name:'Polyhedral', fn:'opPolyhedral', deps:[],
    params:[['p',3,5,1,3],['q',3,5,1,5],['Scale',0.2,2,0.01,0.7]],
    glsl:`vec2 opPolyhedral(vec2 q, vec4 P){
  float p  = max(floor(P.x + 0.5), 3.0);
  float qn = max(floor(P.y + 0.5), 3.0);
  float sc = max(P.z, 0.05);
  vec2 z = q * sc;
  float seg = TAU / (2.0 * p);
  float C = cos(TAU / (2.0 * qn)) / max(sin(seg), 1e-4);
  bool sph = C < 0.9999;
  float xm = sph ? sqrt((1.0 - C) / (1.0 + C)) : 0.0;
  float D  = sph ? 0.5 * (xm - 1.0/xm) : 0.0;
  float Rm = sph ? 0.5 * (xm + 1.0/xm) : 0.0;
  float Rm2 = Rm * Rm;
  for(int i = 0; i < 24; i++){
    float ang = atan(z.y, z.x);
    float rr  = length(z);
    ang = mod(ang, 2.0 * seg);
    if(ang > seg) ang = 2.0 * seg - ang;
    z = rr * vec2(cos(ang), sin(ang));
    if(!sph) break;
    vec2 dz = z - vec2(D, 0.0);
    float l2 = dot(dz, dz);
    if(l2 <= Rm2) break;
    z = vec2(D, 0.0) + dz * (Rm2 / l2);
  }
  return z / sc;
}` },
  { name:'Mobius', fn:'opMobius', deps:[],
    params:[['Offset X',-0.95,0.95,0.01,0.3],['Offset Y',-0.95,0.95,0.01,0],['Rotate\u00b0',-180,180,1,0]],
    glsl:`vec2 opMobius(vec2 q, vec4 P){
  vec2 a = vec2(P.x, P.y);
  float al = length(a);
  if(al > 0.95) a *= 0.95 / al;
  vec2 z = q;
  vec2 n = z - a;
  vec2 den = vec2(1.0 - (a.x*z.x + a.y*z.y), -(a.x*z.y - a.y*z.x));
  float dd = max(dot(den, den), 1e-6);
  vec2 w = vec2(n.x*den.x + n.y*den.y, n.y*den.x - n.x*den.y) / dd;
  return rot(P.z * DEG) * w;
}` },
  { name:'Apollonian', fn:'opApollonian', deps:[],
    params:[['Iters',1,20,1,8],['Radius',0.5,1.2,0.01,1],['Scale',0.2,2,0.01,0.8]],
    glsl:`vec2 opApollonian(vec2 q, vec4 P){
  float sc = max(P.z, 0.05);
  float rc = 0.86602540 * clamp(P.y, 0.3, 1.5);
  float rc2 = rc * rc;
  vec2 c0 = vec2(0.0, 1.0);
  vec2 c1 = vec2(-0.86602540, -0.5);
  vec2 c2 = vec2(0.86602540, -0.5);
  vec2 z = q * sc;
  for(int i = 0; i < 20; i++){
    if(float(i) >= P.x) break;
    bool inv = false;
    vec2 d0 = z - c0; float l0 = dot(d0, d0);
    if(l0 < rc2){ z = c0 + d0 * (rc2 / max(l0, 1e-6)); inv = true; }
    else {
      vec2 d1 = z - c1; float l1 = dot(d1, d1);
      if(l1 < rc2){ z = c1 + d1 * (rc2 / max(l1, 1e-6)); inv = true; }
      else {
        vec2 d2 = z - c2; float l2 = dot(d2, d2);
        if(l2 < rc2){ z = c2 + d2 * (rc2 / max(l2, 1e-6)); inv = true; }
      }
    }
    if(!inv) break;
  }
  return z / sc;
}` },
  { name:'Rosette Cn', fn:'opRosette', deps:[],
    params:[['Segments',2,24,1,6],['Offset\u00b0',-180,180,1,0]],
    glsl:`vec2 opRosette(vec2 q, vec4 P){
  float N = max(floor(P.x + 0.5), 2.0);
  float seg = TAU / N;
  float ang = atan(q.y, q.x) + P.y * DEG;
  float r = length(q);
  ang = mod(ang, seg);
  return r * vec2(cos(ang), sin(ang));
}` },
  { name:'Aperiodic', fn:'opAperiodic', p2:true, deps:['apVertex'],
    params:[['Grids',2,7,1,5],['Cell',0.02,1.5,0.005,0.3],['Gamma',-1,1,0.01,0.2],['Mode',0,1,1,0,['cells','local']],['Levels',1,6,1,1],['Inflation',1.05,4,0.001,1.618]],
    glsl:`vec2 opAperiodic(vec2 q, vec4 P, vec4 P2){
  float N = clamp(floor(P.x + 0.5), 2.0, 7.0);
  float cell = max(P.y, 0.02);
  float gam = P.z;
  float L = clamp(floor(P2.x + 0.5), 1.0, 6.0);
  float lam = max(P2.y, 1.05);
  vec2 acc = vec2(0.0);
  vec2 p = q;
  float c = cell;
  for(int i = 0; i < 6; i++){
    if(float(i) >= L) break;
    vec2 v = apVertex(p, N, c, gam);
    acc += v;
    p -= v;
    c /= lam;
  }
  if(P.w < 0.5) return acc;
  return p;
}` },
  { name:'Disc', fn:'opDisc', deps:['sinhf','coshf'],
    params:[['Mode',0,8,1,0,['disc','idisc','wdisc','fdisc','edisc','spiral','squircle','tan','sech']],['Amount',0.1,30,0.1,1],['Twist',-3,3,0.01,0],['Petal',0,8,1,1]],
    glsl:`vec2 opDisc(vec2 q, vec4 P){
  float mode = P.x;
  float A = P.y;
  float tw = P.z;
  float petal = max(P.w, 0.0);
  float rr = length(q);
  float phi = atan(q.y, q.x) * petal;
  const float PI  = 3.14159265359;
  const float M1PI = 0.31830988618;
  vec2 o;
  if(mode < 3.5){
    float a, r;
    if(mode < 0.5){
      a = PI * rr;
      r = phi * M1PI;
      o = vec2(sin(a), cos(a)) * r;
    } else if(mode < 1.5){
      a = PI / (rr + 1.0);
      r = phi * M1PI;
      o = vec2(cos(a), sin(a)) * r;
    } else if(mode < 2.5){
      a = PI / (rr + 1.0);
      r = phi * M1PI;
      if(r > 0.0) a = PI - a;
      o = vec2(cos(a), sin(a)) * r;
    } else {
      float af = 2.0*PI / (rr + 1.0);
      float rf = (phi * M1PI + 1.0) * 0.5;
      o = rf * vec2(cos(af), sin(af));
    }
    if(abs(tw) > 1e-5){
      float oa = atan(o.y, o.x) + tw * length(o);
      o = length(o) * vec2(cos(oa), sin(oa));
    }
    return A * o;
  }
  if(mode > 3.5 && mode < 4.5){
    float sumsq = dot(q, q);
    float tmp = sumsq + 1.0;
    float tmp2 = 2.0 * q.x;
    float r1 = sqrt(max(tmp + tmp2, 0.0));
    float r2 = sqrt(max(tmp - tmp2, 0.0));
    float xmax = (r1 + r2) * 0.5;
    float a1 = log(max(xmax + sqrt(max(xmax - 1.0, 0.0)), 1e-9));
    float a2 = -acos(clamp(q.x / max(xmax, 1e-9), -1.0, 1.0));
    float w = A / 11.57034632;
    float snv = sin(a1), csv = cos(a1);
    float snhu = sinhf(a2), cshu = coshf(a2);
    if(q.y > 0.0) snv = -snv;
    return vec2(w * cshu * csv, w * snhu * snv);
  }
  {
    float pn = petal < 0.001 ? 1.0 : petal;
    float a, r;
    if(mode < 5.5){
      a = PI * rr + tw * phi;
      r = phi * M1PI;
      o = vec2(sin(a), cos(a)) * r;
    } else if(mode < 6.5){
      float pm = 1.0 + petal;
      float rn = pow(pow(abs(q.x), pm) + pow(abs(q.y), pm), 1.0 / pm);
      float ph2 = atan(q.y, q.x);
      a = PI * rn;
      r = ph2 * M1PI;
      o = vec2(sin(a), cos(a)) * r;
      if(abs(tw) > 1e-5){ float oa = atan(o.y,o.x) + tw*length(o); o = length(o)*vec2(cos(oa),sin(oa)); }
    } else if(mode < 7.5){
      float k = 1.0 + abs(tw);
      a = PI * rr;
      r = (tan(clamp(phi, -1.5, 1.5) * k * 0.5) / max(k, 1e-3)) * M1PI;
      o = vec2(sin(a), cos(a)) * r;
    } else {
      float env = 1.0 / coshf(rr * (0.3 + abs(tw)));
      a = PI * rr;
      r = phi * M1PI * env;
      o = vec2(sin(a), cos(a)) * r;
    }
    return A * o;
  }
}` },
  { name:'Julian', fn:'opJulian', deps:[],
    params:[['Power',1,20,1,5],['Dist',-2,3,0.01,1],['Wedge cover',0,1,1,1,['fan','random']]],
    glsl:`vec2 opJulian(vec2 q, vec4 P){
  float power = max(floor(P.x + 0.5), 1.0);
  float dist = P.y;
  float phi = atan(q.y, q.x);
  float r = length(q);
  float k;
  if(P.z < 0.5){
    k = floor((phi + 3.14159265) / TAU * power);
  } else {
    float seg = floor((phi + 3.14159265) / (TAU / power));
    k = floor(hash1(vec2(seg * 7.13, 1.7)) * power);
  }
  float a = (phi + TAU * k) / power;
  float rp = pow(max(r, 1e-9), dist / power);
  return rp * vec2(cos(a), sin(a));
}` },
  { name:'BusyBrad', fn:'opBusybrad', deps:[],
    params:[['Mode',0,2,1,2,['Susan','Jess','Combined']],['Grid size',0,4,0.01,1],['X offset',-2,2,0.01,0],['Y offset',-2,2,0.01,0],['Spin',-3.15,3.15,0.01,0.1],['Twist',-3,3,0.01,0.2],['Space',-2,2,0.01,0.4],['N',2,12,1,4],['Corner',1,8,1,1],['Mod spin',-3,3,0.01,0],['Mod twist',-3,3,0.01,0],['Sensen',0,1,1,0,['off','on']],['Sensen fold',0,4,0.01,1],['Amount',0.1,3,0.01,1]],
    glsl:`vec2 opBusybrad(vec2 q, vec4 P, vec4 P2, vec4 P3, vec4 P4){
  const float M_PI = 3.14159265359;
  float mode = P.x;
  float gridSize = P.y;
  float xOffset = P.z;
  float yOffset = P.w;
  float spin = P2.x;
  float twist = P2.y;
  float space = P2.z;
  float n = max(P2.w, 2.0);
  float mod_spin = P3.y;
  float mod_twist = P3.z;
  float sensen_on = P3.w;
  float sensen_fold = P4.x;
  float amount = (P4.y <= 0.0) ? 1.0 : P4.y;

  float cellCenterX = (gridSize == 0.0) ? 0.0 : gridSize * floor(q.x/gridSize + 0.5);
  float cellCenterY = (gridSize == 0.0) ? 0.0 : gridSize * floor(q.y/gridSize + 0.5);
  float local_x = (q.x - cellCenterX) - xOffset;
  float local_y = (q.y - cellCenterY) + yOffset;
  float tX = 0.0, tY = 0.0;

  if(mode < 0.5){                                   // Susan
    float rr = sqrt(local_x*local_x + local_y*local_y);
    if(rr < amount){
      float ang = atan(local_y, local_x) + spin + twist*(amount - rr);
      float r2 = amount * rr;
      tX = r2*cos(ang); tY = r2*sin(ang);
    } else {
      float r2 = (rr != 0.0) ? amount*(1.0 + space/rr) : 0.0;
      tX = r2*local_x; tY = r2*local_y;
    }
  } else if(mode < 1.5){                            // Jess
    float modulus = sqrt(local_x*local_x + local_y*local_y);
    float theta_check = atan(local_y, local_x);
    float r_poly = amount * cos(M_PI/n) / cos(theta_check - TAU/n*floor(n*theta_check/TAU + 0.5));
    if(modulus < r_poly){
      float twist_effect = (r_poly > 1e-9) ? twist*(r_poly - modulus)/r_poly : 0.0;
      float theta = theta_check + spin + twist_effect;
      tX = modulus*cos(theta); tY = modulus*sin(theta);
    } else {
      float nm = (modulus != 0.0) ? amount*(1.0 + space/modulus) : 0.0;
      tX = nm*local_x; tY = nm*local_y;
    }
  } else {                                          // Combined
    float rr = sqrt(local_x*local_x + local_y*local_y);
    float modv = (rr != 0.0) ? amount*(1.0 + space/rr) : 0.0;
    float dspin = spin + modv*mod_spin;
    float dtwist = twist + modv*mod_twist;
    float modulus = rr;
    float theta_check = atan(local_y, local_x);
    float r_poly = amount * cos(M_PI/n) / cos(theta_check - TAU/n*floor(n*theta_check/TAU + 0.5));
    if(modulus < r_poly){
      float twist_effect = (r_poly > 1e-9) ? dtwist*(r_poly - modulus)/r_poly : 0.0;
      float theta = theta_check + dspin + twist_effect;
      tX = modulus*cos(theta); tY = modulus*sin(theta);
    } else {
      tX = modv*local_x; tY = modv*local_y;
    }
  }

  if(sensen_on > 0.5 && sensen_fold != 0.0){        // Sensen fold post-effect
    float nr_x = floor(tX * sensen_fold);
    float mx = mod(nr_x, 2.0);
    if((nr_x >= 0.0 && mx > 0.5) || (nr_x < 0.0 && mx < 0.5)) tX = -tX;
    float nr_y = floor(tY * sensen_fold);
    float my = mod(nr_y, 2.0);
    if((nr_y >= 0.0 && my > 0.5) || (nr_y < 0.0 && my < 0.5)) tY = -tY;
  }

  return vec2(cellCenterX + tX - xOffset, cellCenterY + tY + yOffset);
}` },
  { name:'Complex sum', fn:'opComplexSum', deps:['crecip','clog','cdivz','csqrt','cexp','casinh','cacosh','catanh','casin','catan','csin','ccos','csinh','ccosh','ctanh'],
    params:[['Reciprocal',-3,3,0.01,1],['Log divide',-3,3,0.01,0],['Sqrt',-3,3,0.01,0],['Exp',-3,3,0.01,0],['Log',-3,3,0.01,0],['Asinh',-3,3,0.01,0],['Acosh',-3,3,0.01,0],['Atanh',-3,3,0.01,0],['Asech',-3,3,0.01,0],['Acosech',-3,3,0.01,0],['Acoth',-3,3,0.01,0],['Asin',-3,3,0.01,0],['Acos',-3,3,0.01,0],['Atan',-3,3,0.01,0],['Sin',-3,3,0.01,0],['Cos',-3,3,0.01,0],['Tan',-3,3,0.01,0],['Sinh',-3,3,0.01,0],['Cosh',-3,3,0.01,0],['Tanh',-3,3,0.01,0],['ZX mult',0,3,0.01,1],['ZY mult',0,3,0.01,1],['ZX add',-2,2,0.01,0],['ZY add',-2,2,0.01,0],['Amount',0.1,3,0.01,1],['Reflect',0,1,1,0,['off','mirror']]],
    glsl:`vec2 opComplexSum(vec2 q, vec4 P, vec4 P2, vec4 P3, vec4 P4, vec4 P5, vec4 P6, vec4 P7){
  const float M2 = 0.63661977236;                 // 2/pi
  float w_recip=P.x, w_logdiv=P.y, w_sqrt=P.z, w_exp=P.w;
  float w_log=P2.x, w_asinh=P2.y, w_acosh=P2.z, w_atanh=P2.w;
  float w_asech=P3.x, w_acosech=P3.y, w_acoth=P3.z, w_asin=P3.w;
  float w_acos=P4.x, w_atan=P4.y, w_sin=P4.z, w_cos=P4.w;
  float w_tan=P5.x, w_sinh=P5.y, w_cosh=P5.z, w_tanh=P5.w;
  float zxm=P6.x, zym=P6.y, zxa=P6.z, zya=P6.w;
  float amount = (P7.x <= 0.0) ? 1.0 : P7.x;
  float sgn = (P7.y > 0.5 && hash1(q*17.0) < 0.5) ? -1.0 : 1.0;

  vec2 r = vec2(q.x*zxm + zxa, q.y*zym + zya);      // input affine (pre_recip)
  vec2 acc = vec2(0.0);

  // pre-conditioner tier (post_trig order) overwrites r
  if(w_recip  != 0.0){ vec2 z = crecip(r); r = w_recip * amount * z; }
  if(w_logdiv != 0.0){ vec2 z = clog(cdivz(r + vec2(1.0,0.0), r - vec2(1.0,0.0))); r = w_logdiv * amount*M2 * z; }
  if(w_sqrt   != 0.0){ vec2 z = csqrt(r); r = w_sqrt * amount * sgn * z; }
  if(w_exp    != 0.0){ vec2 z = cexp(r); r = w_exp * amount * z; }
  if(w_log    != 0.0){ vec2 z = clog(r); r = w_log * amount * z; }

  // sum tier accumulates
  if(w_asinh   != 0.0) acc += w_asinh   * amount*M2 * casinh(r);
  if(w_acosh   != 0.0) acc += w_acosh   * amount*M2 * sgn * cacosh(r);
  if(w_atanh   != 0.0) acc += w_atanh   * amount*M2 * catanh(r);
  if(w_asech   != 0.0) acc += w_asech   * amount*M2 * cacosh(crecip(r));
  if(w_acosech != 0.0) acc += w_acosech * amount*M2 * sgn * casinh(crecip(r));
  if(w_acoth   != 0.0) acc += w_acoth   * amount*M2 * catanh(crecip(r));
  if(w_asin    != 0.0) acc += w_asin    * amount*M2 * casin(r);
  if(w_acos    != 0.0) acc += w_acos    * amount*M2 * vec2(1.57079632679 - casin(r).x, -casin(r).y);
  if(w_atan    != 0.0) acc += w_atan    * amount*M2 * catan(r);
  if(w_sin     != 0.0) acc += w_sin     * amount * csin(r);
  if(w_cos     != 0.0) acc += w_cos     * amount * ccos(r);
  if(w_tan     != 0.0) acc += w_tan     * amount * cdivz(csin(r), ccos(r));
  if(w_sinh    != 0.0) acc += w_sinh    * amount * csinh(r);
  if(w_cosh    != 0.0) acc += w_cosh    * amount * ccosh(r);
  if(w_tanh    != 0.0) acc += w_tanh    * amount * ctanh(r);

  float sumw = abs(w_asinh)+abs(w_acosh)+abs(w_atanh)+abs(w_asech)+abs(w_acosech)+abs(w_acoth)
             + abs(w_asin)+abs(w_acos)+abs(w_atan)+abs(w_sin)+abs(w_cos)+abs(w_tan)
             + abs(w_sinh)+abs(w_cosh)+abs(w_tanh);
  return (sumw == 0.0) ? r : acc;
}` },
];
export { OPS };
