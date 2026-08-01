// Helper GLSL functions, each with declared dependencies on other helpers.
// The assembler pulls the transitive closure of only what the used operators need.
const HELPERS = {
  sinhf:    { deps:[], src:`float sinhf(float x){ float e = exp(x); return 0.5*(e - 1.0/e); }` },
  coshf:    { deps:[], src:`float coshf(float x){ float e = exp(x); return 0.5*(e + 1.0/e); }` },
  sqrt_safe:{ deps:[], src:`float sqrt_safe(float x){ return (x < 1e-7) ? 0.0 : sqrt(x); }` },
  sqrt1pm1: { deps:[], src:`float sqrt1pm1(float x){
  if(x > -0.0625 && x < 0.0625){
    float num = (((x/32.0  + 0.3125 )*x + 0.75  )*x + 0.5 )*x;
    float den = (((x/256.0 + 0.15625)*x + 0.9375)*x + 1.75)*x + 1.0;
    return num / den;
  }
  return sqrt(1.0 + x) - 1.0;
}` },
  cmul:  { deps:[], src:`vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }` },
  clog:  { deps:[], src:`vec2 clog(vec2 z){ return vec2(0.5*log(max(dot(z,z), 1e-12)), atan(z.y, z.x)); }` },
  csqrt: { deps:[], src:`vec2 csqrt(vec2 z){
  float r = length(z);
  float a = 0.5*atan(z.y, z.x);
  return sqrt(r) * vec2(cos(a), sin(a));
}` },
  casin: { deps:['cmul','csqrt','clog'], src:`vec2 casin(vec2 z){
  vec2 z2 = cmul(z, z);
  vec2 s = csqrt(vec2(1.0 - z2.x, -z2.y));
  vec2 w = vec2(-z.y + s.x, z.x + s.y);
  if(dot(w, w) < 1e-12) return vec2(0.0);
  vec2 L = clog(w);
  return vec2(L.y, -L.x);
}` },
  catan: { deps:['clog'], src:`vec2 catan(vec2 z){
  vec2 w1 = vec2(1.0 - z.y, z.x);
  vec2 w2 = vec2(1.0 + z.y, -z.x);
  if(dot(w1,w1) < 1e-12 || dot(w2,w2) < 1e-12) return vec2(0.0);
  vec2 L = clog(w1) - clog(w2);
  return 0.5 * vec2(L.y, -L.x);
}` },
  cdivz: { deps:[], src:`vec2 cdivz(vec2 a, vec2 b){
  float d = max(dot(b, b), 1e-9);
  return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / d;
}` },
  ctanh: { deps:[], src:`vec2 ctanh(vec2 z){
  float x = clamp(z.x, -15.0, 15.0);
  float ex = exp(x), enx = exp(-x);
  float shx = 0.5 * (ex - enx), chx = 0.5 * (ex + enx);
  float cy = cos(z.y), sy = sin(z.y);
  vec2 sh = vec2(shx * cy, chx * sy);
  vec2 ch = vec2(chx * cy, shx * sy);
  float dd = max(dot(ch, ch), 1e-6);
  return vec2(sh.x*ch.x + sh.y*ch.y, sh.y*ch.x - sh.x*ch.y) / dd;
}` },
  wc: { deps:[], src:`void wc(vec2 t, float pr, inout vec2 b, inout float bk, inout float bp){
  t = fract(t);
  float k = t.y*97.0 + t.x;
  if(k < bk){ bk = k; b = t; bp = pr; }
}` },
  wv: { deps:[], src:`float wv(float x, float t){
  if(t < 0.5) return sin(x);
  if(t < 1.5) return 1.0 - 4.0*abs(fract(x/TAU) - 0.5);
  if(t < 2.5) return 2.0*fract(x/TAU) - 1.0;
  return clamp(sin(x)*6.0, -1.0, 1.0);
}` },
  dmwrap: { deps:[], src:`float dmwrap(float v, float m){
  float r = 2.0 * m;
  if(v >  m) return -m + mod(v + m, r);
  if(v < -m) return  m - mod(m - v, r);
  return v;
}` },
  apVertex: { deps:[], src:`vec2 apVertex(vec2 p, float N, float c, float gam){
  vec2 v = vec2(0.0);
  for(int k = 0; k < 7; k++){
    if(float(k) >= N) break;
    float ang = 3.14159265 * float(k) / N;
    vec2 n = vec2(cos(ang), sin(ang));
    float K = floor(dot(p, n) / c - gam);
    v += K * n;
  }
  return v * (c * 2.0 / N);
}` },
  cexp:  { deps:[], src:`vec2 cexp(vec2 z){ float e = exp(z.x); return e*vec2(cos(z.y), sin(z.y)); }` },
  crecip:{ deps:[], src:`vec2 crecip(vec2 z){ float d = max(dot(z,z), 1e-12); return vec2(z.x, -z.y)/d; }` },
  csin:  { deps:['sinhf','coshf'], src:`vec2 csin(vec2 z){ return vec2(sin(z.x)*coshf(z.y), cos(z.x)*sinhf(z.y)); }` },
  ccos:  { deps:['sinhf','coshf'], src:`vec2 ccos(vec2 z){ return vec2(cos(z.x)*coshf(z.y), -sin(z.x)*sinhf(z.y)); }` },
  csinh: { deps:['sinhf','coshf'], src:`vec2 csinh(vec2 z){ return vec2(sinhf(z.x)*cos(z.y), coshf(z.x)*sin(z.y)); }` },
  ccosh: { deps:['sinhf','coshf'], src:`vec2 ccosh(vec2 z){ return vec2(coshf(z.x)*cos(z.y), sinhf(z.x)*sin(z.y)); }` },
  casinh:{ deps:['clog','csqrt','cmul'], src:`vec2 casinh(vec2 z){ vec2 s = csqrt(cmul(z,z) + vec2(1.0,0.0)); return clog(z + s); }` },
  cacosh:{ deps:['clog','csqrt','cmul'], src:`vec2 cacosh(vec2 z){ vec2 s = cmul(csqrt(z - vec2(1.0,0.0)), csqrt(z + vec2(1.0,0.0))); return clog(z + s); }` },
  catanh:{ deps:['clog'], src:`vec2 catanh(vec2 z){ return 0.5*(clog(vec2(1.0,0.0)+z) - clog(vec2(1.0,0.0)-z)); }` },
  cstage:{ deps:['crecip','cmul','csqrt','cexp','clog','cdivz','csin','ccos','csinh','ccosh','ctanh','casin','catan','casinh','cacosh','catanh'], src:`vec2 cstage(vec2 z, float m){
  if(m < 0.5)  return z;                                  // identity
  if(m < 1.5)  return crecip(z);                          // 1/z
  if(m < 2.5)  return cmul(z, z);                         // z^2
  if(m < 3.5)  return csqrt(z);
  if(m < 4.5)  return cexp(z);
  if(m < 5.5)  return clog(z);
  if(m < 6.5)  return clog(cdivz(z + vec2(1.0,0.0), z - vec2(1.0,0.0)));   // log_divide
  if(m < 7.5)  return csin(z);
  if(m < 8.5)  return ccos(z);
  if(m < 9.5)  return cdivz(csin(z), ccos(z));            // tan
  if(m < 10.5) return csinh(z);
  if(m < 11.5) return ccosh(z);
  if(m < 12.5) return ctanh(z);
  if(m < 13.5) return casin(z);
  if(m < 14.5) return vec2(1.57079632679 - casin(z).x, -casin(z).y);  // acos
  if(m < 15.5) return catan(z);
  if(m < 16.5) return casinh(z);
  if(m < 17.5) return cacosh(z);
  if(m < 18.5) return catanh(z);
  if(m < 19.5) return crecip(ccos(z));                    // sec
  if(m < 20.5) return crecip(csin(z));                    // csc
  if(m < 21.5) return crecip(cdivz(csin(z), ccos(z)));    // cot
  if(m < 22.5) return crecip(ccosh(z));                   // sech
  if(m < 23.5) return crecip(csinh(z));                   // csch
  if(m < 24.5) return crecip(ctanh(z));                   // coth
  if(m < 25.5) return cacosh(crecip(z));                  // asech
  if(m < 26.5) return casinh(crecip(z));                  // acosech
  return catanh(crecip(z));                               // acoth
}` },
};
export {HELPERS};
