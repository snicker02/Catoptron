// Shared shader prelude: uniforms, constants, and the sampling/shading machinery.
// Reproduced verbatim from the current tool's FS. Every operator snippet assumes this.
const PRELUDE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uCanvas;
uniform vec2  uImg;
uniform float uDepth;
uniform float uStep;
uniform float uTwist;
uniform float uFlip;
uniform vec2  uCenter;
uniform vec2  uShift;
uniform float uZoom;
uniform float uFrame;
uniform float uFrameW;
uniform vec3  uTint;
uniform float uTintA;
uniform float uHueK;
uniform float uChroma;
uniform float uRipple;
uniform float uVign;
uniform float uGrain;
uniform float uExposure;
uniform float uContrast;
uniform float uSat;
uniform float uWarm;
uniform float uPosterize;
uniform float uScan;
uniform float uHueRot;
uniform float uChanSplit;
uniform float uChanSwap;
uniform float uDropout;
uniform float uDither;
uniform float uNoiseG;
uniform float uInterlace;
uniform float uMosh;
uniform float uRD;
uniform float uRDColorPass;
uniform float uIFSon;
uniform float uIFSn;
uniform float uIFSscale;
uniform float uIFSrot;
uniform float uIFScx;
uniform float uIFScy;
uniform float uIFSz;
uniform float uPhase;
uniform float uSpinA;
uniform float uWavePh;
uniform float uWobble;
uniform float uSeed;
uniform sampler2D uPrev;
uniform sampler2D uFluidV;
uniform sampler2D uDye;
uniform float uDyeMix;
uniform float uFluidOn;
uniform float uFluidTexel;
uniform sampler2D uCAField;
uniform float uCAOn;
uniform float uCATexel;
uniform float uFbAmt;
uniform float uCcMode;
uniform vec3  uCcTint;
uniform float uPost;

const float TAU = 6.28318530718;
const float DEG = 0.01745329252;

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
vec2 mir(vec2 p){ return 1.0 - abs(mod(p, 2.0) - 1.0); }

float hash1(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed)*43758.5453); }
vec2  hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
  return fract(sin(p + uSeed)*43758.5453);
}
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(0.57735027);
  return c*cos(a) + cross(k, c)*sin(a) + k*dot(k, c)*(1.0-cos(a));
}
vec3 photo(vec2 p){
  float ca = uCanvas.x / uCanvas.y;
  float ia = uImg.x / uImg.y;
  vec2 sc = (ia > ca) ? vec2(ca/ia, 1.0) : vec2(1.0, ia/ca);
  vec2 t = (p - 0.5) * sc + 0.5;
  return texture2D(uTex, mir(t)).rgb;
}
vec3 sampleC(vec2 p, float dk){
  if(uInterlace > 0.001){ float rr = step(0.5, fract(p.y*uCanvas.y*0.25)); p.x += (rr-0.5)*uInterlace*0.02; }
  if(uChroma <= 0.001 && uChanSplit <= 0.001) return photo(p);
  vec2 d = (p - 0.5) * uChroma * 0.006 * (1.0 + dk*0.35);
  vec2 ds = vec2(uChanSplit*0.03, 0.0);
  return vec3(photo(p + d + ds).r, photo(p).g, photo(p - d - ds).b);
}
vec2 rippled(vec2 p, float dk){
  if(uRipple <= 0.001) return p;
  float a = uRipple * 0.012 * (0.4 + dk*0.6);
  return p + a * vec2(sin(p.y*23.0 + dk*2.1 + uWavePh),
                      sin(p.x*19.0 - dk*1.7 - uWavePh*1.3));
}
vec3 shade(vec2 p, float dk, float e){
  vec3 s = sampleC(rippled(p, dk), dk);
  vec3 glass = mix(vec3(1.0), uTint, uTintA);
  s *= pow(glass, vec3(dk));
  if(abs(uHueK) > 0.0001) s = hueShift(s, uHueK * dk);
  if(uFrame > 0.001 && e < 900.0){
    s *= 1.0 - uFrame * (1.0 - smoothstep(0.0, uFrameW, e));
  }
  return s;
}
`;
export {PRELUDE};
