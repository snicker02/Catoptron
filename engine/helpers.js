// Helper GLSL functions, each with declared dependencies on other helpers.
// The assembler pulls the transitive closure of only what the used operators need.
const HELPERS = {
  sinhf:    { deps:[], src:`float sinhf(float x){ float e = exp(x); return 0.5*(e - 1.0/e); }` },
  coshf:    { deps:[], src:`float coshf(float x){ float e = exp(clamp(x,-12.0,12.0)); return 0.5*(e + 1.0/e); }` },
  tanhf:    { deps:[], src:`float tanhf(float x){ float e = exp(-2.0*abs(x)); float t = (1.0-e)/(1.0+e); return x < 0.0 ? -t : t; }` },
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
  whash:  { deps:[], src:`float whash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }` },
  asinh_f:{ deps:[], src:`float asinh_f(float x){ return log(x + sqrt(x*x + 1.0)); }` },
  sqr_f:  { deps:[], src:`float sqr_f(float x){ return x*x; }` },
  tanh_f: { deps:[], src:`float tanh_f(float x){ float e2 = exp(2.0*x); return (e2 - 1.0)/(e2 + 1.0); }` },
  vib_mod:{ deps:[], src:`float vib_mod(float amp, float freq, float x){ return amp * cos(x * freq * 6.28318); }` },
  gauss4: { deps:['whash'], src:`float gauss4(vec2 p, float s){ return (whash(p+vec2(s,1.0))+whash(p+vec2(s*2.1,2.4))+whash(p+vec2(s*3.5,3.8))+whash(p+vec2(s*4.9,5.2))) - 2.0; }` },
  cpow:   { deps:[], src:`vec2 cpow(vec2 z, float n){ float r = length(z) + 1e-10; float a = atan(z.y, z.x); return pow(r, n) * vec2(cos(a*n), sin(a*n)); }` },
  hash_n: { deps:[], src:`float hash_n(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }` },
  vnoise: { deps:['hash_n'], src:`float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = hash_n(i); float b = hash_n(i + vec2(1.0,0.0)); float c = hash_n(i + vec2(0.0,1.0)); float d = hash_n(i + vec2(1.0,1.0)); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }` },
  fbm:    { deps:['vnoise'], src:`float fbm(vec2 p, float oct, float rough){ float val=0.0, amp=0.5, freq=1.0; for(int i=0;i<8;i++){ if(float(i)>=oct) break; val += amp*vnoise(p*freq); amp *= rough; freq *= 2.0; } return val; }` },
  bessel_j1:{ deps:[], src:`float bessel_j1(float x){
  float ax = abs(x); float ans;
  if(ax < 8.0){
    float y = x*x;
    float n = x*(72362614232.0 + y*(-7895059235.0 + y*(242396853.1 + y*(-2972611.439 + y*(15704.48260 + y*(-30.16036606))))));
    float d = 144725228442.0 + y*(2300535178.0 + y*(18583304.74 + y*(99447.43394 + y*(376.9991397 + y*1.0))));
    ans = n/d;
  } else {
    float z = 8.0/ax; float y = z*z; float xx = ax - 2.356194491;
    float p1 = 1.0 + y*(-0.001831163 + y*(0.3516396496e-4 + y*(-0.2457520174e-5 + y*0.240337019e-6)));
    float p2 = 0.04687499995 + y*(-0.002002690873 + y*(0.8449199096e-4 + y*(-0.88228987e-5 + y*0.105787412e-5)));
    ans = sqrt(0.636619772/ax)*(cos(xx)*p1 - z*sin(xx)*p2);
    if(x < 0.0) ans = -ans;
  }
  return ans;
}` },
  jacobi_sn:{ deps:['tanh_f'], src:`float jacobi_sn(float uu, float emmc){
  float CA = 3e-4;
  float sn, cn, dn, a, b, c, d, emc, u;
  emc = emmc; u = uu;
  if(abs(emc) < 1e-7){ return tanh_f(u); }
  bool bo = false; d = 0.0;
  if(emc < 0.0){ bo = true; d = 1.0 - emc; emc = -emc/d; d = sqrt(d); u = d*u; }
  a = 1.0; dn = 1.0; c = 0.0;
  float em0,em1,em2,em3,em4,em5,em6,em7;
  float en0,en1,en2,en3,en4,en5,en6,en7;
  int lv = 0;
  em0=a; emc=sqrt(abs(emc)); en0=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=1;
  em1=a; emc=sqrt(abs(emc)); en1=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=2;
  em2=a; emc=sqrt(abs(emc)); en2=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=3;
  em3=a; emc=sqrt(abs(emc)); en3=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=4;
  em4=a; emc=sqrt(abs(emc)); en4=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=5;
  em5=a; emc=sqrt(abs(emc)); en5=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=6;
  em6=a; emc=sqrt(abs(emc)); en6=emc; c=0.5*(a+emc);
  if(abs(a-emc) > CA*a){ emc=a*emc; a=c; lv=7;
  em7=a; emc=sqrt(abs(emc)); en7=emc; c=0.5*(a+emc);
  }}}}}}}
  u = c*u; sn = sin(u); cn = cos(u);
  if(abs(sn) > 1e-7){
    a = cn/sn; c = a*c;
    if(lv >= 7){ b=em7; a=c*a; c=dn*c; dn=(en7+a)/(b+a); a=c/b; }
    if(lv >= 6){ b=em6; a=c*a; c=dn*c; dn=(en6+a)/(b+a); a=c/b; }
    if(lv >= 5){ b=em5; a=c*a; c=dn*c; dn=(en5+a)/(b+a); a=c/b; }
    if(lv >= 4){ b=em4; a=c*a; c=dn*c; dn=(en4+a)/(b+a); a=c/b; }
    if(lv >= 3){ b=em3; a=c*a; c=dn*c; dn=(en3+a)/(b+a); a=c/b; }
    if(lv >= 2){ b=em2; a=c*a; c=dn*c; dn=(en2+a)/(b+a); a=c/b; }
    if(lv >= 1){ b=em1; a=c*a; c=dn*c; dn=(en1+a)/(b+a); a=c/b; }
    { b=em0; a=c*a; c=dn*c; dn=(en0+a)/(b+a); a=c/b; }
    a = 1.0/sqrt(c*c + 1.0);
    sn = (sn < 0.0) ? -a : a;
    cn = c*sn;
  }
  if(bo){ float tmp = dn; dn = cn; cn = tmp; sn = sn/d; }
  return sn;
}` },
  fmodf:  { deps:[], src:`float fmodf(float a, float b){ float q=a/b; float t=(q<0.0)?-floor(-q):floor(q); return a - b*t; }` },
};
export {HELPERS};
