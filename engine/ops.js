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
  { name:'Counterchange', fn:'opCounterchange', par:true, deps:[],
    params:[['Mode',0,3,1,1,['stripes','checker','pinwheel','rings']],['Cell',0.02,2,0.01,0.5],['Angle\u00b0',-180,180,1,0]],
    glsl:`vec2 opCounterchange(vec2 q, vec4 P, inout float par){
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
];
export { OPS };
