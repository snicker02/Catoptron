"use strict";
import { OPS } from './engine/ops.js';
import { MAX_OPS } from './engine/assemble.js';
import { createProgramCache } from './engine/glcache.js';

/* ================= GL setup ================= */
const canvas = document.getElementById('glc');
const gl = canvas.getContext('webgl', {preserveDrawingBuffer:true, antialias:true});
if(!gl){ document.getElementById('stage').textContent = 'WebGL is not available in this browser.'; }

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

/* post pass for the feedback renderer: vignette + grain applied outside the loop */
const POSTFS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uVign;
uniform float uGrain;
uniform float uWavePh;
uniform float uSeed;
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
uniform float uRD;
uniform vec3 uTint;
uniform float uTintA;
uniform sampler2D uFx;
float hash1(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed)*43758.5453); }
vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735027); return c*cos(a) + cross(k, c)*sin(a) + k*dot(k, c)*(1.0-cos(a)); }
void main(){
  vec2 sv = vUv;
  if(uInterlace > 0.001){ float rr = step(0.5, fract(gl_FragCoord.y*0.25)); sv.x += (rr-0.5)*uInterlace*0.02; }
  vec3 col;
  if(uChanSplit > 0.001){ vec2 ds=vec2(uChanSplit*0.03,0.0); col=vec3(texture2D(uSrc,sv+ds).r, texture2D(uSrc,sv).g, texture2D(uSrc,sv-ds).b); }
  else col = texture2D(uSrc, sv).rgb;
  if(uRD > 0.5){
    float _p = smoothstep(0.02, 0.5, texture2D(uSrc, sv).g);
    vec3 _pc = texture2D(uFx, vUv).rgb;
    vec3 _imgC = mix(_pc*0.06, _pc, _p) + smoothstep(0.62, 1.0, _p)*0.35;
    col = mix(vec3(_p), _imgC, clamp(uTintA*2.0, 0.0, 1.0));
  }
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
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/* shared fullscreen-triangle buffer (bound per-program to that program's aPos location) */
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

function bindQuad(loc2){
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc2);
  gl.vertexAttribPointer(loc2, 2, gl.FLOAT, false, 0, 0);
}

/* post program (feedback vignette/grain pass) — static */
const postProg = gl.createProgram();
gl.attachShader(postProg, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(postProg, compile(gl.FRAGMENT_SHADER, POSTFS));
gl.linkProgram(postProg);
if(!gl.getProgramParameter(postProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(postProg));
const PU = {};
['uSrc','uVign','uGrain','uWavePh','uSeed','uExposure','uContrast','uSat','uWarm','uPosterize','uScan','uHueRot','uChanSplit','uChanSwap','uDropout','uDither','uNoiseG','uInterlace','uRD','uTint','uTintA','uFx'].forEach(n => PU[n] = gl.getUniformLocation(postProg, n));
const postLoc = gl.getAttribLocation(postProg, 'aPos');

// ---- motion blur: temporal accumulation of the final canvas ----
const MBFS = `precision highp float; varying vec2 vUv; uniform sampler2D uCur; uniform sampler2D uPrev; uniform float uBlur; void main(){ vec3 c=texture2D(uCur,vUv).rgb; vec3 p=texture2D(uPrev,vUv).rgb; gl_FragColor=vec4(mix(c,p,uBlur),1.0); }`;
const mbProg = gl.createProgram();
gl.attachShader(mbProg, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(mbProg, compile(gl.FRAGMENT_SHADER, MBFS));
gl.linkProgram(mbProg);
if(!gl.getProgramParameter(mbProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(mbProg));
const MBU = {}; ['uCur','uPrev','uBlur'].forEach(k => MBU[k] = gl.getUniformLocation(mbProg, k));
const mbLoc = gl.getAttribLocation(mbProg, 'aPos');
let mbCur = null, mbAccum = [], mbFbo = [], mbW = 0, mbH = 0, mbRead = 0, mbInit = false;
function mbTex(w, h){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
function ensureMB(w, h){
  if(mbW === w && mbH === h && mbCur) return;
  if(mbCur) gl.deleteTexture(mbCur);
  mbAccum.forEach(t => gl.deleteTexture(t)); mbFbo.forEach(f => gl.deleteFramebuffer(f));
  mbAccum = []; mbFbo = [];
  mbCur = mbTex(w, h);
  for(let i = 0; i < 2; i++){
    const t = mbTex(w, h);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    mbAccum.push(t); mbFbo.push(f);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  mbW = w; mbH = h; mbRead = 0; mbInit = false;
}
// runs AFTER the frame is drawn to the canvas; blends it into a persistent buffer
function motionBlurPass(w, h, amount){
  ensureMB(w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, mbCur);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);   // grab the fresh frame
  const blur = mbInit ? Math.max(0, Math.min(0.97, amount)) : 0.0;
  const write = 1 - mbRead;
  gl.useProgram(mbProg); bindQuad(mbLoc);
  gl.bindFramebuffer(gl.FRAMEBUFFER, mbFbo[write]); gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mbCur); gl.uniform1i(MBU.uCur, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mbAccum[mbRead]); gl.uniform1i(MBU.uPrev, 1);
  gl.uniform1f(MBU.uBlur, blur);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);   // blit result to canvas
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mbAccum[write]); gl.uniform1i(MBU.uCur, 0);
  gl.uniform1f(MBU.uBlur, 0.0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  mbRead = write; mbInit = true;
}

/* ================= assembled-program cache ================= */
/* the fold shader is assembled per stack+renderer; each program has its own uniform locations,
   discovered automatically by the cache, so operators declare as many param banks as they need */
const cache = createProgramCache(gl);
let curEntry = null;
let shaderErrShown = false;

/* ================= texture ================= */
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

let imgW = 1024, imgH = 1024;

function setImage(source, w, h){
  imgW = w; imgH = h;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

/* ================= source generators (probes) ================= */
function srand(seed){
  let a = (Math.floor(seed * 1e6) >>> 0) || 1;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function _hslRGB(h, s, l){
  h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l - q;
  const hk = t => { t = (t%1+1)%1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
  return [Math.round(hk(h+1/3)*255), Math.round(hk(h)*255), Math.round(hk(h-1/3)*255)];
}
function genGrid(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  x.fillStyle = '#f4f1ea'; x.fillRect(0,0,s,s);
  const quad = [[210,0,0],[40,s/2,0],[150,0,s/2],[320,s/2,s/2]];
  x.globalAlpha = 0.55;
  quad.forEach(([h,px,py])=>{ x.fillStyle = `hsl(${(((h+hu)%360)+360)%360},55%,82%)`; x.fillRect(px,py,s/2,s/2); });
  x.globalAlpha = 1;
  const line=(x1,y1,x2,y2)=>{ x.beginPath(); x.moveTo(x1,y1); x.lineTo(x2,y2); x.stroke(); };
  const fine=Math.max(4,Math.round(32*sc)), heavy=Math.max(2,Math.round(8*sc));
  x.strokeStyle=`rgba(60,80,110,${(0.10+0.30*vv).toFixed(3)})`; x.lineWidth=1;
  for(let i=0;i<=fine;i++){ const p=i*s/fine; line(p,0,p,s); line(0,p,s,p); }
  x.strokeStyle=`rgba(40,58,88,${(0.20+0.45*vv).toFixed(3)})`; x.lineWidth=2;
  for(let i=0;i<=heavy;i++){ const p=i*s/heavy; line(p,0,p,s); line(0,p,s,p); }
  x.lineWidth=5; x.strokeStyle='#c0392b'; line(0,s/2,s,s/2);
  x.strokeStyle='#2b5fc0'; line(s/2,0,s/2,s);
  x.strokeStyle='#0e7d6d'; x.lineWidth=4; x.beginPath(); x.arc(s/2,s/2,s*0.25,0,7); x.stroke();
  x.setLineDash([10,8]); x.beginPath(); x.arc(s/2,s/2,s*0.375,0,7); x.stroke(); x.setLineDash([]);
  x.fillStyle='#1b2333'; x.beginPath(); x.arc(s/2,s/2,8,0,7); x.fill();
}
function genPolar(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const cx=s/2, cy=s/2, Rr=s*0.75, sat=Math.round(35+50*vv);
  for(let a=0;a<360;a++){
    x.fillStyle=`hsl(${(((a+hu)%360)+360)%360},${sat}%,55%)`;
    x.beginPath(); x.moveTo(cx,cy); x.arc(cx,cy,Rr,(a-90)*Math.PI/180,(a-88.85)*Math.PI/180); x.fill();
  }
  const rings=Math.max(3,Math.round(12*sc));
  x.strokeStyle='rgba(10,12,22,0.6)';
  for(let i=1;i<=rings;i++){ x.lineWidth=(i%4===0)?4:1.5; x.beginPath(); x.arc(cx,cy,i*(Rr/rings),0,7); x.stroke(); }
  const spokeStep=Math.max(5,Math.round(15/sc));
  for(let a=0;a<360;a+=spokeStep){
    const heavy=a%90===0;
    x.strokeStyle=heavy?'rgba(255,255,255,0.9)':'rgba(10,12,22,0.5)'; x.lineWidth=heavy?4:1.5;
    x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx+Rr*Math.cos((a-90)*Math.PI/180), cy+Rr*Math.sin((a-90)*Math.PI/180)); x.stroke();
  }
  x.fillStyle='#fff'; x.beginPath(); x.arc(cx,cy,10,0,7); x.fill();
}
function genChecker(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const hues=[210,40,150,320], n=Math.max(2,Math.round(8*sc));
  const dl=Math.round(18+22*(1-vv)), ll=Math.round(58+24*vv);
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const qi=(i<n/2?0:1)+(j<n/2?0:2), dark=(i+j)%2===0;
    x.fillStyle=`hsl(${(((hues[qi]+hu)%360)+360)%360},55%,${dark?dl:ll}%)`;
    x.fillRect(i*s/n,j*s/n,s/n,s/n);
  }
  x.strokeStyle='rgba(255,255,255,0.85)'; x.lineWidth=3;
  x.beginPath(); x.moveTo(s/2,0); x.lineTo(s/2,s); x.moveTo(0,s/2); x.lineTo(s,s/2); x.stroke();
  const arrow=(cx,cy,ang)=>{ x.save(); x.translate(cx,cy); x.rotate(ang);
    x.strokeStyle='#fff'; x.fillStyle='#fff'; x.lineWidth=8; x.lineCap='round';
    x.beginPath(); x.moveTo(-s*0.07,0); x.lineTo(s*0.06,0); x.stroke();
    x.beginPath(); x.moveTo(s*0.06,-s*0.035); x.lineTo(s*0.11,0); x.lineTo(s*0.06,s*0.035); x.closePath(); x.fill(); x.restore(); };
  arrow(s*0.25,s*0.25,-3*Math.PI/4); arrow(s*0.75,s*0.25,-Math.PI/4);
  arrow(s*0.25,s*0.75,3*Math.PI/4); arrow(s*0.75,s*0.75,Math.PI/4);
}
function genPlasma(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const oct=4, base=Math.max(2,Math.round(4*sc)), lat=[];
  for(let o=0;o<oct;o++){ const n=(1<<o)*base+1; const g=new Float32Array(n*n); for(let i=0;i<n*n;i++) g[i]=R(); lat.push({n,g}); }
  const sm=t=>t*t*(3-2*t);
  const val=(o,u,v)=>{ const {n,g}=lat[o]; const X=u*(n-1),Y=v*(n-1); const xi=Math.min(n-2,X|0),yi=Math.min(n-2,Y|0);
    const fx=sm(X-xi),fy=sm(Y-yi); const a=g[yi*n+xi],b=g[yi*n+xi+1],c=g[(yi+1)*n+xi],e=g[(yi+1)*n+xi+1];
    return a+(b-a)*fx+(c-a)*fy+(a-b-c+e)*fx*fy; };
  const ph=R()+hu/360, con=0.7+1.3*vv;
  const img=x.createImageData(s,s), d=img.data, pal=(t,c,dd)=>0.5+0.5*Math.cos(6.28318*(c*t+dd));
  let p=0;
  for(let y=0;y<s;y++){ const v=y/s;
    for(let xx=0;xx<s;xx++){ const u=xx/s; let t=0,amp=0.5,tot=0;
      for(let o=0;o<oct;o++){ t+=val(o,u,v)*amp; tot+=amp; amp*=0.55; } t/=tot; t=0.5+(t-0.5)*con;
      d[p++]=255*pal(t,1.0,ph); d[p++]=255*pal(t,0.9,ph+0.18); d[p++]=255*pal(t,0.8,ph+0.38); d[p++]=255; } }
  x.putImageData(img,0,0);
}
function genOrbs(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const g=x.createLinearGradient(0,0,s,s), h0=((R()*360+hu)%360+360)%360;
  g.addColorStop(0,`hsl(${h0},45%,16%)`); g.addColorStop(0.5,`hsl(${(h0+90)%360},40%,28%)`); g.addColorStop(1,`hsl(${(h0+200)%360},55%,45%)`);
  x.fillStyle=g; x.fillRect(0,0,s,s);
  const n=Math.max(2,Math.round(8*sc)), light=Math.round(55+25*vv);
  for(let i=0;i<n;i++){ const px=R()*s,py=R()*s,r=s*(0.08+R()*0.22)/Math.sqrt(sc), hue=(h0+R()*220)%360;
    const rg=x.createRadialGradient(px,py,r*0.1,px,py,r);
    rg.addColorStop(0,`hsla(${hue},85%,${light}%,0.85)`); rg.addColorStop(1,'hsla(0,0%,0%,0)');
    x.fillStyle=rg; x.beginPath(); x.arc(px,py,r,0,7); x.fill(); }
  x.strokeStyle='rgba(255,255,255,0.5)'; x.lineWidth=5;
  x.beginPath(); x.arc(s*(0.3+R()*0.4),s*(0.3+R()*0.4),s*(0.1+R()*0.12),R()*3,3+R()*3); x.stroke();
}
function genRings(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const rings=Math.max(3,Math.round(10*sc)), cx=s/2, cy=s/2, maxR=Math.hypot(cx,cy);
  const img=x.createImageData(s,s), d=img.data; let p=0;
  for(let y=0;y<s;y++){ const dy=y-cy;
    for(let xx=0;xx<s;xx++){ const dx=xx-cx; const t=Math.sqrt(dx*dx+dy*dy)/maxR*rings; const f=t-Math.floor(t);
      const soft=0.5+0.5*Math.cos(f*6.28318), hard=f<0.5?1:0, band=soft*(1-vv)+hard*vv;
      const hue=hu+Math.floor(t)*24; const rgb=_hslRGB(hue,62,22+52*band);
      d[p++]=rgb[0]; d[p++]=rgb[1]; d[p++]=rgb[2]; d[p++]=255; } }
  x.putImageData(img,0,0);
}
function genStripes(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const count=Math.max(2,Math.round(12*sc)), ang=vv*Math.PI, ca=Math.cos(ang), sa=Math.sin(ang);
  const img=x.createImageData(s,s), d=img.data; let p=0;
  for(let y=0;y<s;y++) for(let xx=0;xx<s;xx++){
    const u=(xx*ca+y*sa)/s, idx=u*count, cell=Math.floor(idx), f=idx-cell;
    const hue=hu+cell*(360/count), shade=42+24*Math.sin(f*6.28318);
    const rgb=_hslRGB(hue,60,shade); d[p++]=rgb[0]; d[p++]=rgb[1]; d[p++]=rgb[2]; d[p++]=255;
  }
  x.putImageData(img,0,0);
}
function genWaves(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const f=6.28318*(1+4*sc)/s, mix=vv;
  const img=x.createImageData(s,s), d=img.data; let p=0;
  for(let y=0;y<s;y++) for(let xx=0;xx<s;xx++){
    const w=Math.sin(xx*f)+Math.sin(y*f)+mix*Math.sin((xx+y)*f*0.7)+(1-mix)*Math.sin(Math.hypot(xx-s/2,y-s/2)*f*1.3);
    const t=(w+3)/6, hue=hu+t*140, rgb=_hslRGB(hue,58,34+32*t);
    d[p++]=rgb[0]; d[p++]=rgb[1]; d[p++]=rgb[2]; d[p++]=255;
  }
  x.putImageData(img,0,0);
}
function genVoronoi(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const G=Math.max(2,Math.round(6*sc)), cell=s/G;
  const fx=new Float32Array(G*G), fy=new Float32Array(G*G), fh=new Float32Array(G*G);
  for(let j=0;j<G;j++) for(let i=0;i<G;i++){ const k=j*G+i; fx[k]=(i+R())*cell; fy[k]=(j+R())*cell; fh[k]=hu+R()*300; }
  const img=x.createImageData(s,s), d=img.data; let p=0;
  for(let y=0;y<s;y++){ const cj=Math.min(G-1,y/cell|0);
    for(let xx=0;xx<s;xx++){ const ci=Math.min(G-1,xx/cell|0);
      let d1=1e12,d2=1e12,best=0;
      for(let jj=-1;jj<=1;jj++) for(let ii=-1;ii<=1;ii++){ const gi=ci+ii,gj=cj+jj; if(gi<0||gj<0||gi>=G||gj>=G) continue;
        const k=gj*G+gi, ddx=xx-fx[k], ddy=y-fy[k], dd=ddx*ddx+ddy*ddy;
        if(dd<d1){ d2=d1; d1=dd; best=k; } else if(dd<d2){ d2=dd; } }
      const e=Math.min(1,(Math.sqrt(d2)-Math.sqrt(d1))/(cell*0.5));
      const baseL=28+40*(((best*2654435761)>>>0)%1000/1000), L=baseL*(1-vv*(1-e));
      const rgb=_hslRGB(fh[best],55,Math.max(6,Math.min(82,L)));
      d[p++]=rgb[0]; d[p++]=rgb[1]; d[p++]=rgb[2]; d[p++]=255; } }
  x.putImageData(img,0,0);
}
function genTruchet(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const G=Math.max(2,Math.round(8*sc)), cell=s/G, lw=cell*(0.12+0.30*vv);
  x.fillStyle=`hsl(${(((hu+20)%360)+360)%360},40%,16%)`; x.fillRect(0,0,s,s);
  x.strokeStyle=`hsl(${((hu%360)+360)%360},70%,62%)`; x.lineWidth=lw; x.lineCap='round';
  for(let j=0;j<G;j++) for(let i=0;i<G;i++){ const ox=i*cell, oy=j*cell, r=cell/2;
    x.beginPath();
    if(R()<0.5){ x.arc(ox,oy,r,0,Math.PI/2); x.moveTo(ox+cell,oy+cell); x.arc(ox+cell,oy+cell,r,Math.PI,Math.PI*1.5); }
    else { x.arc(ox+cell,oy,r,Math.PI/2,Math.PI); x.moveTo(ox,oy+cell); x.arc(ox,oy+cell,r,Math.PI*1.5,Math.PI*2); }
    x.stroke();
  }
}
function genHalftone(x, s, R, P){
  const sc=P?P.scale:1, hu=P?P.hue:0, vv=P?P.v:0.5;
  const G=Math.max(3,Math.round(18*sc)), cell=s/G, rmax=cell*0.5*(0.4+0.9*vv);
  x.fillStyle=`hsl(${(((hu+180)%360)+360)%360},30%,14%)`; x.fillRect(0,0,s,s);
  for(let j=0;j<G;j++) for(let i=0;i<G;i++){ const cx=(i+0.5)*cell, cy=(j+0.5)*cell;
    const t=(Math.sin((i/G)*6.28318)+Math.cos((j/G)*6.28318)+2)/4, r=rmax*(0.35+0.65*t);
    const hue=hu+(i+j)*(180/G); x.fillStyle=`hsl(${((hue%360)+360)%360},70%,${Math.round(45+20*t)}%)`;
    x.beginPath(); x.arc(cx,cy,r,0,7); x.fill();
  }
}

const GENS = {
  grid:     {seeded: false, fn: genGrid},
  polar:    {seeded: false, fn: genPolar},
  checker:  {seeded: false, fn: genChecker},
  plasma:   {seeded: true,  fn: genPlasma},
  orbs:     {seeded: true,  fn: genOrbs},
  rings:    {seeded: false, fn: genRings},
  stripes:  {seeded: false, fn: genStripes},
  waves:    {seeded: false, fn: genWaves},
  voronoi:  {seeded: true,  fn: genVoronoi},
  truchet:  {seeded: true,  fn: genTruchet},
  halftone: {seeded: false, fn: genHalftone},
};

function applySource(){
  if(!GENS[state.src]) return;   // 'user': leave the loaded texture alone
  const s = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  GENS[state.src].fn(ctx, s, srand(state.seed), {scale: state.srcScale, hue: state.srcHue, v: state.srcVar});
  setImage(cv, s, s);
}

/* ================= state ================= */
function defaultOp(t){
  return { t, p: OPS[t].params.map(pr => pr[4]), o: [0, 0], rot: 0 };
}
const state = {
  rend: 0,
  stack: [],
  depth: 14, step: 0.72, twist: 8, flip: 1,
  shiftX: 0, shiftY: 0, zoom: 1,
  frame: 0.45, frameW: 0.035, tint: '#5d8f86', tintA: 0.30,
  hue: 0, chroma: 0, ripple: 0, vign: 0.35, grain: 0.06,
  drift: 0.15, spin: 0, wobble: 0, rot: 0,
  audioOn: 0, audioMode: 'mic', audioGain: 1.6, audioResp: 0.5, beatSens: 0.55,
  aroutes: [ {band:'bass',target:'zoom',amt:0.5}, {band:'treble',target:'twist',amt:0.5} ],
  exposure: 1, contrast: 1, sat: 1, warm: 0, posterize: 0, scan: 0,
  pulse: 0, sway: 0, hueCycle: 0,
  chanSplit: 0, chanSwap: 0, dropout: 0, dither: 0, noiseG: 0, interlace: 0,
  stutter: 0, jitter: 0, burst: 0, mosh: 0, rd: 0, mblur: 0,
  cx: 0.5, cy: 0.5, seed: 7.13, aspect: 'free', fbAmt: 0.9, src: 'orbs',
  ccMode: 0, ccTint: '#ff5d7a',
  srcScale: 1, srcHue: 0, srcVar: 0.5
};
const defaults = JSON.parse(JSON.stringify(state));

const rendNotes = [
  'Facing mirrors: discrete panes scale toward the vanishing point. Depth = pane count.',
  'Continuous log-polar spiral. Twist shears the spiral; depth is infinite.',
  'Perspective raycast down an infinite mirrored box. Step = pane length, twist = spiral roll.',
  'Infinite mirrored pipe: cylindrical raycast down the bore. Step = pane length, twist = spiral roll.',
  'Parallel facing mirrors seen side-on: bands recede both directions. Step = band width, twist = skew.',
  'Optical feedback: every frame re-enters through the folds. Pull draws inward, Feedback sets persistence, glass applies per generation. Causal \u2014 loop recordings won\u2019t seam.',
  'Wallpaper tiling: the plane repeats in a rectangular grid. Tile size sets the cell, twist spins each cell, mirrored flips alternate cells.',
  'Kaleidoscope: reflected into N radial wedges with mirrored rings. Segments = wedge count, zoom scales, spin rotates.',
  'Sphere: the image wraps onto a rotating ball. Ball size scales it, spin turns the globe, shift scrolls the surface.',
  'Slit-scan: each column samples a different time slice, smearing motion diagonally across the frame. Time density = column rate, skew tilts the smear, drift/spin animate it.',
  'Poincaré disk: the hyperbolic disk model — the image crowds infinitely toward the rim. Ring density sets the recession rate, rotate spins it, drift scrolls inward.',
  'Hyperbolic tiling: a reflection group tessellates the disk (Escher “Circle Limit”). Sides sets the polygon order, rotate turns the pattern, drift drifts it.'
];

/* ================= presets (lite set uses operator indices 0\u201314) ================= */
const FACTORY = [
  {name:'Corridor',            d:{rend:0, stack:[], step:0.72, twist:8, depth:14}},
  {name:'Kaleido',             d:{rend:0, stack:[{t:0,p:[8,0]}], step:0.72, twist:8, depth:14}},
  {name:'Droste spiral',       d:{rend:1, stack:[], step:0.72, twist:12}},
  {name:'Mirror pipe',         d:{rend:3, stack:[], step:0.62, twist:4}},
  {name:'Infinity room',       d:{rend:2, stack:[], step:0.72, twist:0}},
  {name:'Between mirrors',     d:{rend:4, stack:[], step:0.7, twist:0}},
  {name:'Feedback well',       d:{rend:5, stack:[], step:0.6, twist:12}},
  {name:'Feedback mandala',    d:{rend:5, stack:[{t:0,p:[6,0]}], step:0.66, twist:8}},
  {name:'Shattered',           d:{rend:0, stack:[{t:6,p:[3,0.8]}], step:0.72, twist:0, depth:8}},
  {name:'Swirl well',          d:{rend:1, stack:[{t:4,p:[2.5]}], step:0.7, twist:0}},
  {name:'Spiral bloom',        d:{rend:1, stack:[{t:5,p:[0.8]},{t:0,p:[10,0]}], step:0.68, twist:20}},
  {name:'Bipolar bands',       d:{rend:0, stack:[{t:7,p:[1,0]}], step:0.75, twist:0, depth:10, src:'grid'}},
  {name:'Elliptic strip',      d:{rend:0, stack:[{t:8,p:[1,0]}], step:0.75, twist:0, depth:10, src:'grid'}},
  {name:'Kleinian gasket',     d:{rend:0, stack:[{t:10,p:[5,1,16,0.9,1,0,0,0]}], step:0.8, twist:0, depth:4, src:'plasma'}},
  {name:'Kleinian spiral',     d:{rend:0, stack:[{t:10,p:[6,0.96,18,0.9,1,18,0,0]}], step:0.8, twist:0, depth:4, src:'plasma'}},
  {name:'Kleinian strip',      d:{rend:0, stack:[{t:10,p:[5,1,16,1.1,1,0,0,1]}], step:0.8, twist:0, depth:4, src:'plasma'}},
  {name:'Mobius warp',         d:{rend:0, stack:[{t:11,p:[1.5,0.5,0,0,2,0,0.5,-0.5]}], step:0.8, twist:0, depth:6, src:'grid'}},
  {name:'Fuchsian torus',      d:{rend:0, stack:[{t:12,p:[3,0,3,0,0,3,0,16]}], step:0.8, twist:0, depth:5, src:'grid'}},
  {name:'Quasi-Fuchsian',      d:{rend:0, stack:[{t:12,p:[1.91,0.05,2,0,0,0,0,16]}], step:0.8, twist:0, depth:5, src:'plasma'}},
  {name:'Juliascope',          d:{rend:0, stack:[{t:13,p:[5,1,0,1]}], step:0.8, twist:0, depth:6, src:'plasma'}},
  {name:'Juliascope 2-color',  d:{rend:0, stack:[{t:13,p:[6,1,0,1]}], step:0.8, twist:0, depth:6, src:'plasma', ccMode:1}},
  {name:'Golden spiral',       d:{rend:0, stack:[{t:14,p:[1.618,90,1,0]}], step:0.8, twist:0, depth:6, src:'plasma'}},
  {name:'Similarity rings',    d:{rend:0, stack:[{t:14,p:[2,0,1,0]}], step:0.8, twist:0, depth:6, src:'grid'}},
  {name:'Counterchange kaleido',d:{rend:0, stack:[{t:0,p:[6,0]}], step:0.8, twist:0, depth:8, src:'plasma', ccMode:1}},
  {name:'Counterchange checker',d:{rend:0, stack:[{t:9,p:[1,0.5,0]}], step:0.8, twist:0, depth:6, src:'plasma', ccMode:4}},
  {name:'Mosaic well',         d:{rend:1, stack:[{t:3,p:[22]},{t:5,p:[1.5]}], step:0.7, twist:0}},
  {name:"Triangle tube",      d:{rend:0, stack:[{t:15,p:[3]}], step:0.72, twist:0, depth:10}},
  {name:"Mirror grid",        d:{rend:0, stack:[{t:16,p:[3,3,0]}], step:0.72, twist:0, depth:10}},
  {name:"Ring well",          d:{rend:0, stack:[{t:17,p:[3]}], step:0.72, twist:8, depth:14}},
  {name:"Mirror ball",        d:{rend:0, stack:[{t:18,p:[1.5]}], step:0.72, twist:0, depth:10}},
  {name:"Bubble chamber",     d:{rend:0, stack:[{t:19,p:[3.5,0.15,6]}], step:0.78, twist:0, depth:8}},
  {name:"Funhouse",           d:{rend:0, stack:[{t:20,p:[0.3,2,0]}], step:0.72, twist:8, depth:14}},
  {name:"Spherical",          d:{rend:0, stack:[{t:24,p:[0.6]}], step:0.75, twist:0, depth:10, src:"grid"}},
  {name:"Complex sin",        d:{rend:0, stack:[{t:25,p:[7,0,0,0,1,1,1,0]}], step:0.75, twist:0, depth:10, src:"grid"}},
  {name:"Complex tan",        d:{rend:0, stack:[{t:25,p:[9,0,0,0,2,2,1,0]}], step:0.75, twist:0, depth:10, src:"grid"}},
  {name:"Complex log",        d:{rend:1, stack:[{t:25,p:[5,0,0,0,1,1,1,0]}], step:0.72, twist:0, src:"grid"}},
  {name:"AcosH",              d:{rend:0, stack:[{t:25,p:[17,0,0,0,1,1,1,0]}], step:0.75, twist:0, depth:8, src:"plasma"}},
  {name:"Sqrt AcotH",         d:{rend:0, stack:[{t:25,p:[3,27,0,0,1,1,1,0]}], step:0.75, twist:0, depth:8, src:"grid"}},
  {name:"Complex cascade",    d:{rend:0, stack:[{t:25,p:[3,17,9,0,1,1,1,0]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Complex mirror",     d:{rend:0, stack:[{t:25,p:[3,18,0,0,1.5,1.5,1,1]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Post-trig blend",    d:{rend:0, stack:[{t:45,p:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0.5,0,0,0,1,1,0,0,1,0]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Hyperbolic sum",     d:{rend:0, stack:[{t:45,p:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0.5,1,1,0,0,1,0]}], step:0.78, twist:0, depth:6, src:"grid"}},
  {name:"Arc-hyper sum",      d:{rend:0, stack:[{t:45,p:[0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,0]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Reciprocal well",    d:{rend:1, stack:[{t:45,p:[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,0]}], step:0.7, twist:0, src:"plasma"}},
  {name:"Pre-recip + trig",   d:{rend:0, stack:[{t:45,p:[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,1,0]}], step:0.78, twist:0, depth:6, src:"grid"}},
  {name:"KIFS chamber",       d:{rend:0, stack:[{t:26,p:[6,0.25,25,1.05]}], step:0.75, twist:0, depth:8}},
  {name:"Koch snowflake",     d:{rend:0, stack:[{t:27,p:[4,1]}], step:0.75, twist:0, depth:8}},
  {name:"Fresnel lens",       d:{rend:0, stack:[{t:29,p:[3,1]}], step:0.75, twist:0, depth:10}},
  {name:"Double modulus",     d:{rend:0, stack:[{t:30,p:[0.6,0.6,45,3]}], step:0.75, twist:0, depth:8, src:"checker"}},
  {name:"Wallpaper p6m",      d:{rend:0, stack:[{t:31,p:[16,1.2,0]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Wallpaper pgg",      d:{rend:0, stack:[{t:31,p:[7,1.2,0]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Two mirrors",        d:{rend:0, stack:[{t:32,p:[0,0]},{t:32,p:[75,0]}], step:0.78, twist:0, depth:8, src:"plasma"}},
  {name:"Witch ball",         d:{rend:0, stack:[{t:33,p:[0.4,0]}], step:0.8, twist:0, depth:4}},
  {name:"Footprints",         d:{rend:0, stack:[{t:34,p:[1,0,0.8]}], step:0.78, twist:0, depth:6, src:"checker"}},
  {name:"Dressing screen",    d:{rend:0, stack:[{t:35,p:[0,0.3,12]}], step:0.78, twist:0, depth:6}},
  {name:"Hyperbolic {3,7}",   d:{rend:0, stack:[{t:36,p:[3,7,0.7]}], step:0.8, twist:0, depth:4, src:"plasma"}},
  {name:"Icosahedral",        d:{rend:0, stack:[{t:37,p:[3,5,0.7]}], step:0.8, twist:0, depth:4, src:"grid"}},
  {name:"Mobius drift",       d:{rend:0, stack:[{t:38,p:[0.4,0,0]},{t:36,p:[3,7,0.7]}], step:0.8, twist:0, depth:4, src:"plasma"}},
  {name:"Apollonian",         d:{rend:0, stack:[{t:39,p:[8,1,0.8]}], step:0.8, twist:0, depth:4, src:"plasma"}},
  {name:"Rosette C6",         d:{rend:0, stack:[{t:40,p:[6,0]}], step:0.8, twist:0, depth:8, src:"checker"}},
  {name:"Penrose",            d:{rend:0, stack:[{t:41,p:[5,0.3,0.2,0,1,1.618]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Ammann-Beenker",     d:{rend:0, stack:[{t:41,p:[4,0.3,0.2,0,1,2.414]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Disc",               d:{rend:0, stack:[{t:42,p:[0,1,0,1]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"iDisc bloom",        d:{rend:0, stack:[{t:42,p:[1,1,0,1]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"eDisc",              d:{rend:0, stack:[{t:42,p:[4,1,0,1]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"Julian",             d:{rend:0, stack:[{t:43,p:[5,1,0]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Petal kaleido",      d:{rend:0, stack:[{t:23,p:[8,0.15]},{t:0,p:[12,0]}], step:0.75, twist:14, depth:16}},
  {name:'BusyBrad Susan',      d:{rend:0, stack:[{t:44,p:[0,1,0,0,0.1,0.2,0.4,4,1,0,0,0,1,1]}], step:0.75, twist:0, depth:8, src:'grid'}},
  {name:'BusyBrad Jess',       d:{rend:0, stack:[{t:44,p:[1,1,0,0,0.15,0.3,0.4,6,1,0,0,0,1,1]}], step:0.75, twist:0, depth:8, src:'plasma'}},
  {name:'BusyBrad Combined',   d:{rend:0, stack:[{t:44,p:[2,1,0,0,0.1,0.2,0.4,6,1,1.5,1.2,0,1,1]}], step:0.78, twist:0, depth:6, src:'plasma'}},
  {name:'BusyBrad Sensen',     d:{rend:0, stack:[{t:44,p:[0,1.2,0,0,0.15,0.3,0.4,4,1,0,0,1,2,1]}], step:0.78, twist:0, depth:6, src:'grid'}},
  {name:'BusyBrad feedback',   d:{rend:5, stack:[{t:44,p:[2,1,0,0,0.1,0.25,0.4,5,1,1.0,0.8,0,1,1]}], step:0.62, twist:6, fbAmt:0.9, src:'plasma'}},
  {name:"Wave dc_gnarly",    d:{rend:0, stack:[{t:46,p:[1,1,1,0.08,0.08,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0.15,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,3,1]}], step:0.75, twist:0, depth:8, src:"plasma"}},
  {name:"Wave waves22",      d:{rend:0, stack:[{t:46,p:[0,1,1,0.05,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,3,1]}], step:0.75, twist:0, depth:8, src:"grid"}},
  {name:"Wave vibration2",   d:{rend:0, stack:[{t:46,p:[2,1,1,0.05,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,2.5,0.45,1.5708,1.5708,1.5,0.3,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,3,1]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Wave Jacobi",       d:{rend:0, stack:[{t:46,p:[4,1,1,1.5,0.75,1.5,2.5,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,0,0,1,1.5,1,0.75,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,3,1]}], step:0.72, twist:0, depth:8, src:"grid"}},
  {name:"Wave spiral",       d:{rend:0, stack:[{t:46,p:[11,1,1,0.12,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,2.5,5,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,3,1]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Wave Mobius",       d:{rend:1, stack:[{t:46,p:[13,1,1,0.5,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0.5,0,1,0,3,0,1.5,1.5,3,1]}], step:0.72, twist:0, depth:8, src:"grid"}},
  {name:"Wave fisheye",      d:{rend:0, stack:[{t:46,p:[15,1,1,0.5,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,2,1.8,3,1]}], step:0.78, twist:0, depth:6, src:"plasma"}},
  {name:"Wave swirl",        d:{rend:0, stack:[{t:46,p:[16,1,1,0.12,0.05,7,13,0,0,2,2,1,3.5,3.5,2,2,5,5,0,0,0,1.5708,1,0.25,1.5708,1.5708,1,0.25,0,0,1,1.5,1,1.5,1,0.25,2,10,0,2,0.1,0,1,-0.7,0.27,2,1.5,3,4,0.5,1,1,0,0,0,0,0,1,0,3,0,1.5,1.5,5,1.2]}], step:0.78, twist:0, depth:6, src:"grid"}},
  {name:"Lazy Susan",        d:{rend:0, stack:[{t:47,p:[0,1,0.4,0.4,0.3,0.1,0.2,1,0.5,1.5708,4,3.14159,0,1,0,1]}], step:0.8, twist:0, depth:8, src:"grid"}},
  {name:"Lazy Susan wide",   d:{rend:0, stack:[{t:47,p:[0,1.4,0.8,0.3,0.2,0.1,0.2,1,0.5,1.5708,4,3.14159,0,1,0,1]}], step:0.8, twist:0, depth:8, src:"plasma"}},
  {name:"Lazy Travis",       d:{rend:0, stack:[{t:47,p:[1,0.5,0.4,0.2,0.1,0.1,0.2,1,0.5,1.5708,4,3.14159,0,1,0,1]}], step:0.8, twist:0, depth:8, src:"grid"}},
  {name:"Lazy Travis spin",  d:{rend:0, stack:[{t:47,p:[1,0.5,0.4,0.2,0.1,0.1,0.2,-1.5,2,0.8,4,3.14159,0,1,0,1]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Lazy Jess",         d:{rend:0, stack:[{t:47,p:[2,0.6,0.4,0.2,0.1,0.1,0.2,1,0.5,1.5708,5,0.6,0.1,1,0,1]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"Lazy Jess star",    d:{rend:0, stack:[{t:47,p:[2,0.6,0.4,0.2,0.1,0.1,0.2,1,0.5,1.5708,3,0.4,0,2,0,1]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Lazy Sensen",       d:{rend:0, stack:[{t:47,p:[0,1,0.4,0.2,0.2,0.1,0.2,1,0.5,1.5708,4,3.14159,0,1,1,2]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"Loonie",            d:{rend:0, stack:[{t:48,p:[0,1,1,4,0.15,0.25,0]}], step:0.8, twist:0, depth:8, src:"grid"}},
  {name:"Loonie big bubble", d:{rend:0, stack:[{t:48,p:[0,0.9,1.8,4,0.15,0.25,0]}], step:0.8, twist:0, depth:8, src:"plasma"}},
  {name:"Loonie2 square",    d:{rend:0, stack:[{t:48,p:[1,1,1,4,0.15,0.25,0]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"Loonie2 star",      d:{rend:0, stack:[{t:48,p:[1,1,1,5,0.8,0.1,0]}], step:0.8, twist:0, depth:6, src:"plasma"}},
  {name:"Loonie2 hex spin",  d:{rend:0, stack:[{t:48,p:[1,1,1,6,0.3,0.4,15]}], step:0.8, twist:0, depth:6, src:"grid"}},
  {name:"Loonie3 lens",      d:{rend:0, stack:[{t:48,p:[2,1,1,4,0.15,0.25,0]}], step:0.8, twist:0, depth:6, src:"plasma"}},
];
let customPresets = [];

/* ================= UI plumbing ================= */
const $ = id => document.getElementById(id);
const sliders = [
  ['depth','depthV',    v=>v.toFixed(0)],
  ['audioGain','audioGainV', v=>v.toFixed(2)],
  ['audioResp','audioRespV', v=>v.toFixed(2)],
  ['beatSens','beatSensV', v=>v.toFixed(2)],
  ['fbAmt','fbAmtV',   v=>v.toFixed(3)],
  ['step','stepV',     v=>v.toFixed(3)],
  ['twist','twistV',    v=>v.toFixed(1)],
  ['shiftX','shiftXV',v=>v.toFixed(3)],
  ['shiftY','shiftYV',v=>v.toFixed(3)],
  ['zoom','zoomV',    v=>v.toFixed(3)],
  ['frame','frameV',  v=>v.toFixed(2)],
  ['frameW','frameWV',v=>v.toFixed(3)],
  ['tintA','tintAV',  v=>v.toFixed(2)],
  ['hue','hueV',      v=>v.toFixed(1)],
  ['chroma','chromaV',v=>v.toFixed(2)],
  ['ripple','rippleV',v=>v.toFixed(2)],
  ['vign','vignV',    v=>v.toFixed(2)],
  ['grain','grainV',  v=>v.toFixed(2)],
  ['drift','driftV',  v=>v.toFixed(2)],
  ['spin','spinV',    v=>v.toFixed(2)],
  ['rot','rotV',      v=>v.toFixed(0)],
  ['wobble','wobbleV',v=>v.toFixed(2)],
  ['exposure','exposureV',v=>v.toFixed(2)],
  ['contrast','contrastV',v=>v.toFixed(2)],
  ['sat','satV',v=>v.toFixed(2)],
  ['warm','warmV',v=>v.toFixed(2)],
  ['posterize','posterizeV',v=>v.toFixed(0)],
  ['scan','scanV',v=>v.toFixed(2)],
  ['pulse','pulseV',v=>v.toFixed(2)],
  ['sway','swayV',v=>v.toFixed(2)],
  ['hueCycle','hueCycleV',v=>v.toFixed(2)],
  ['chanSplit','chanSplitV',v=>v.toFixed(2)],
  ['chanSwap','chanSwapV',v=>v.toFixed(2)],
  ['dropout','dropoutV',v=>v.toFixed(2)],
  ['dither','ditherV',v=>v.toFixed(0)],
  ['noiseG','noiseGV',v=>v.toFixed(2)],
  ['interlace','interlaceV',v=>v.toFixed(2)],
  ['stutter','stutterV',v=>v.toFixed(2)],
  ['jitter','jitterV',v=>v.toFixed(2)],
  ['burst','burstV',v=>v.toFixed(2)],
  ['mosh','moshV',v=>v.toFixed(2)],
  ['mblur','mblurV',v=>v.toFixed(2)],
  ['rd','rdV',v=>v.toFixed(0)],
  ['srcScale','srcScaleV',v=>v.toFixed(2)],
  ['srcHue','srcHueV',v=>v.toFixed(0)],
  ['srcVar','srcVarV',v=>v.toFixed(2)],
];

// Convert standard text wrappers into custom editable text input blocks smoothly
sliders.forEach(([id, vid]) => {
  const el = $(vid);
  if (el) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'val';
    input.id = vid;

    const tgt = $(id);
    if (tgt) {
      input.min = tgt.min;
      input.max = tgt.max;
      input.step = tgt.step;
    }

    el.parentNode.replaceChild(input, el);

    input.addEventListener('input', e => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val) && tgt) {
        const min = parseFloat(tgt.min), max = parseFloat(tgt.max);
        if (val < min) val = min;
        if (val > max) val = max;
        state[id] = val;
        tgt.value = val;
      }
    });
  }
});

function syncUI(){
  sliders.forEach(([id, vid, fmt])=>{
    const slider = $(id);
    const valInput = $(vid);
    if (slider) slider.value = state[id];
    if (valInput && document.activeElement !== valInput) {
      valInput.value = fmt(+state[id]);
    }
  });
  $('tintC').value = state.tint;
  $('aspectSel').value = state.aspect || 'free';
  $('srcSel').value = state.src || 'user';
  { const sp=$('srcParams'); if(sp) sp.style.display = (state.src && state.src!=='user' && GENS[state.src]) ? '' : 'none'; }
  { const cr=$('camRow'), cv=$('camVideo'); if(cr) cr.style.display = (cv && cv.srcObject) ? '' : 'none'; }
  $('ccMode').value = state.ccMode || 0;
  $('ccTint').value = state.ccTint || '#ff5d7a';
  document.querySelectorAll('button.mode').forEach(b=>
    b.classList.toggle('on', +b.dataset.rend === state.rend));
  $('flip').classList.toggle('on', !!state.flip);
  $('flip').textContent = state.flip ? 'mirrored' : 'plain';
  $('depthRow').style.display = (state.rend===0 || state.rend===7) ? '' : 'none';
  { const dl=$('depthLbl'); if(dl) dl.textContent = state.rend===7 ? 'Segments' : 'Depth'; }
  $('fbRow').style.display    = state.rend===5 ? '' : 'none';
  { const mr=$('moshRow'); if(mr) mr.style.display = state.rend===5 ? '' : 'none'; }
  $('stepLbl').textContent  = (state.rend===2||state.rend===3) ? 'Pane length'
                            : (state.rend===4 ? 'Band width'
                            : (state.rend===5 ? 'Pull'
                            : (state.rend===6 ? 'Tile size'
                            : (state.rend===7 ? 'Zoom'
                            : (state.rend===8 ? 'Ball size' : (state.rend===9 ? 'Time density' : (state.rend===10 ? 'Ring density' : (state.rend===11 ? 'Sides (p)' : 'Step scale'))))))));
  $('twistLbl').textContent = state.rend===1 ? 'Spiral'
                            : ((state.rend===2||state.rend===3) ? 'Roll'
                            : (state.rend===4 ? 'Skew'
                            : (state.rend===5 ? 'Rotate'
                            : (state.rend===6 ? 'Cell spin'
                            : (state.rend===7 ? 'Spin'
                            : (state.rend===8 ? 'Ball spin' : (state.rend===9 ? 'Skew' : (state.rend===10 ? 'Rotate' : (state.rend===11 ? 'Rotate' : 'Twist')))))))));
  { const rr=$('rdRow'); if(rr) rr.style.display = state.rend===5 ? '' : 'none'; }
  if(state.rend===5 && state.rd){ $('stepLbl').textContent='Feed'; $('twistLbl').textContent='Kill'; }
  { const fl=$('fbLbl'); if(fl) fl.textContent = (state.rend===5 && state.rd) ? 'Image drive' : 'Feedback'; }
  { const ao=$('audioOn'); if(ao){ ao.classList.toggle('on', !!state.audioOn); ao.textContent = state.audioOn ? 'on' : 'enable'; }
    const am=$('audioMic'); if(am) am.classList.toggle('on', state.audioMode==='mic');
    const af=$('audioFileBtn'); if(af) af.classList.toggle('on', state.audioMode==='file'); }
  $('rendNote').textContent = rendNotes[state.rend];
  renderStack();
}

sliders.forEach(([id, vid, fmt])=>{
  const slider = $(id);
  if (slider) {
    slider.addEventListener('input', e=>{
      state[id] = +e.target.value;
      const valInput = $(vid);
      if (valInput) valInput.value = fmt(state[id]);
    });
  }
});
{ const _rdS = $('rd'); if(_rdS) _rdS.addEventListener('input', ()=> syncUI()); }
$('tintC').addEventListener('input', e=> state.tint = e.target.value);
$('ccMode').addEventListener('change', e=>{
  state.ccMode = +e.target.value;
  if(state.ccMode > 0 && !state.stack.filter(s=>!s.mute).some(s => OPS[s.t].par || OPS[s.t].ccop)){
    toast('needs a reflecting fold (Polar, Mirror, Wallpaper…) or the Counterchange fold in the stack');
  }
});
$('ccTint').addEventListener('input', e=> state.ccTint = e.target.value);
$('srcSel').addEventListener('change', e=>{
  const _prev = state.src;
  state.src = e.target.value;
  if(_prev === 'camera' && state.src !== 'camera') stopCamera();
  if(state.src === 'camera'){
    if(_prev !== 'camera') _preCameraSrc = _prev;
    startCamera();
  } else if(state.src === 'user'){
    toast('load or paste an image');
  } else {
    applySource();
    toast(state.src + (GENS[state.src].seeded ? ' \u00b7 reseed rerolls it' : ''));
  }
  const sp = $('srcParams'); if(sp) sp.style.display = GENS[state.src] ? '' : 'none';
});
document.querySelectorAll('button.mode').forEach(b=>{
  b.addEventListener('click', ()=>{ state.rend = +b.dataset.rend; syncUI(); });
});
$('flip').addEventListener('click', ()=>{ state.flip = state.flip?0:1; syncUI(); });
$('audioOn').addEventListener('click', ()=>{ audioEnable(!state.audioOn); });
$('audioMic').addEventListener('click', ()=>{ state.audioMode='mic'; if(state.audioOn) audioSetMode('mic'); syncUI(); });
$('audioFileBtn').addEventListener('click', ()=>{ $('audioFile').click(); });
$('audioFile').addEventListener('change', e=>{ const f = e.target.files && e.target.files[0]; if(f) audioLoadFile(f); });
$('addRoute').addEventListener('click', ()=>{ state.aroutes.push({band:'level', target:'zoom', amt:0.4}); renderRoutes(); });
$('audPlay').addEventListener('click', ()=>{
  if(!AUD.mediaEl){ toast('Load an audio file first'); return; }
  if(AUD.mediaEl.paused){ if(!state.audioOn) audioEnable(true); else AUD.mediaEl.play().catch(()=>{}); }
  else AUD.mediaEl.pause();
  updateAudTransport();
});
$('audSeek').addEventListener('input', ()=>{
  if(AUD.mediaEl && AUD.mediaEl.duration){ _seeking = true; AUD.mediaEl.currentTime = (+$('audSeek').value/1000) * AUD.mediaEl.duration;
    const tt=$('audTime'); if(tt) tt.textContent = fmtTime(AUD.mediaEl.currentTime) + ' / ' + fmtTime(AUD.mediaEl.duration); }
});
$('audSeek').addEventListener('change', ()=>{ _seeking = false; });

/* ---- fold stack UI ---- */
/* display order is alphabetical; option values stay the stable type indices */
const OPS_ALPHA = OPS.map((op, i)=>[op.name, i]).sort((a, b)=> a[0].localeCompare(b[0]));
const opSel = $('addOpSel');
OPS_ALPHA.forEach(([name, i])=>{
  const o = document.createElement('option');
  o.value = i; o.textContent = name;
  opSel.appendChild(o);
});
$('addOp').addEventListener('click', ()=>{
  if(state.stack.length >= MAX_OPS){ toast(`stack is full (${MAX_OPS} folds max)`); return; }
  state.stack.push(defaultOp(+opSel.value));
  pushHistory(); renderStack();
});

function renderStack(){
  const list = $('stackList');
  list.innerHTML = '';
  state.stack.forEach(s => { if(s.id == null) s.id = nextOpId++; else if(s.id >= nextOpId) nextOpId = s.id + 1; });
  state.stack.forEach((slot, idx)=>{
    const opDef = OPS[slot.t];
    const div = document.createElement('div');
    div.className = 'op';
    if(slot.mute) div.classList.add('muted');

    const head = document.createElement('div');
    head.className = 'ophead';
    const muteBtn = document.createElement('button');
    muteBtn.className = 'mute' + (slot.mute ? ' off' : '');
    muteBtn.textContent = slot.mute ? '\u25cb' : '\u25cf';
    muteBtn.title = slot.mute ? 'Muted (bypassed) \u2014 click to enable' : 'Enabled \u2014 click to mute';
    muteBtn.addEventListener('click', ()=>{ slot.mute = !slot.mute; pushHistory(); renderStack(); });
    head.appendChild(muteBtn);
    const sel = document.createElement('select');
    OPS_ALPHA.forEach(([name, i])=>{
      const o = document.createElement('option');
      o.value = i; o.textContent = name;
      if(i === slot.t) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', ()=>{
      state.stack[idx] = defaultOp(+sel.value);
      pushHistory(); renderStack();
    });
    head.appendChild(sel);

    const mk = (txt, fn, dis)=>{
      const b = document.createElement('button');
      b.textContent = txt; b.disabled = !!dis;
      if(dis) b.style.opacity = 0.35;
      b.addEventListener('click', fn);
      head.appendChild(b);
    };
    mk('\u2191', ()=>{ const s=state.stack; [s[idx-1],s[idx]]=[s[idx],s[idx-1]]; pushHistory(); renderStack(); }, idx===0);
    mk('\u2193', ()=>{ const s=state.stack; [s[idx+1],s[idx]]=[s[idx],s[idx+1]]; pushHistory(); renderStack(); }, idx===state.stack.length-1);
    mk('\u00d7', ()=>{ state.stack.splice(idx,1); pushHistory(); renderStack(); });
    div.appendChild(head);

    const selIdxs = new Set(opDef.params.map(p=>p[6]).filter(Boolean).map(x=>x[0]));
    opDef.params.forEach((pr, pi)=>{
      const [label, mn, mx, st, , names] = pr;
      const showIf = pr[6];
      if(showIf){ const cur = Math.round(slot.p[showIf[0]]); if(showIf.slice(1).indexOf(cur) === -1) return; }
      const row = document.createElement('div');
      row.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = label;
      row.appendChild(lab);

      if (names) {
        // discrete selector -> dropdown: fires change once, so re-filtering the
        // panel (for showIf) is clean, with no mid-drag rebuild of the control
        const sel = document.createElement('select');
        sel.className = 'val';
        sel.style.flex = '1';
        names.forEach((nm, ni)=>{
          const o = document.createElement('option');
          o.value = ni; o.textContent = nm;
          if (ni === Math.round(slot.p[pi])) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', ()=>{
          slot.p[pi] = +sel.value;
          if (selIdxs.has(pi)) renderStack();
        });
        row.appendChild(sel);
      } else {
        const rng = document.createElement('input');
        rng.type = 'range'; rng.min = mn; rng.max = mx; rng.step = st;
        rng.value = slot.p[pi];

        const val = document.createElement('input');
        val.type = 'number'; val.className = 'val';
        val.min = mn; val.max = mx; val.step = st;
        const fmt = v => (+v).toFixed(st >= 1 ? 0 : (st >= 0.1 ? 1 : 2));
        val.value = fmt(slot.p[pi]);
        val.addEventListener('input', e => {
          let num = parseFloat(e.target.value);
          if (!isNaN(num)) {
            if (num < mn) num = mn;
            if (num > mx) num = mx;
            slot.p[pi] = num;
            rng.value = num;
          }
        });
        rng.addEventListener('input', ()=>{
          slot.p[pi] = +rng.value;
          val.value = fmt(rng.value);
        });
        // a non-named selector (rare) re-filters on release, never mid-drag
        if (selIdxs.has(pi)) rng.addEventListener('change', ()=> renderStack());
        row.appendChild(rng); row.appendChild(val);
        row.appendChild(arBtn('fold:' + slot.id + ':' + pi));
      }
      div.appendChild(row);
    });

    slot.rot = slot.rot || 0;
    const arow = document.createElement('div');
    arow.className = 'row';
    const alab = document.createElement('label');
    alab.textContent = 'Angle';
    arow.appendChild(alab);
    const arng = document.createElement('input');
    arng.type = 'range'; arng.min = -180; arng.max = 180; arng.step = 1; arng.value = slot.rot;
    const aval = document.createElement('input');
    aval.type = 'number'; aval.className = 'val'; aval.min = -180; aval.max = 180; aval.step = 1;
    aval.value = Math.round(slot.rot);
    arng.addEventListener('input', ()=>{ slot.rot = +arng.value; aval.value = Math.round(slot.rot); });
    aval.addEventListener('input', ()=>{ let v = parseFloat(aval.value); if(!isNaN(v)){ v = Math.max(-180, Math.min(180, v)); slot.rot = v; arng.value = v; } });
    arow.appendChild(arng); arow.appendChild(aval);
    arow.appendChild(arBtn('fold:' + slot.id + ':rot'));
    div.appendChild(arow);

    slot.o = slot.o || [0, 0];
    const orow = document.createElement('div');
    orow.className = 'row';
    const olab = document.createElement('label');
    olab.textContent = 'Origin';
    olab.style.flex = '0 0 44px';
    orow.appendChild(olab);

    const oval = document.createElement('span');
    oval.className = 'val';
    oval.style.flex = '0 0 66px';
    const ofmt = ()=> `${slot.o[0].toFixed(2)}, ${slot.o[1].toFixed(2)}`;

    [0,1].forEach(axis=>{
      const rg = document.createElement('input');
      rg.type = 'range'; rg.min = -1; rg.max = 1; rg.step = 0.005;
      rg.value = slot.o[axis];
      rg.title = axis ? 'Origin Y' : 'Origin X';
      rg.addEventListener('input', ()=>{
        slot.o[axis] = +rg.value;
        oval.textContent = ofmt();
      });
      orow.appendChild(rg);
    });
    oval.textContent = ofmt();
    orow.appendChild(oval);
    const pick = document.createElement('button');
    pick.textContent = '\u2295';
    pick.title = 'Drag on the canvas to place this fold\u2019s origin';
    pick.className = 'toggle' + (pickOp === idx ? ' on' : '');
    pick.style.flex = '0 0 26px';
    pick.style.padding = '4px 0';
    pick.addEventListener('click', ()=>{
      pickOp = (pickOp === idx) ? -1 : idx;
      renderStack();
      if(pickOp >= 0) toast('drag on the canvas to place the fold origin');
    });
    orow.appendChild(pick);
    div.appendChild(orow);

    const rrow = document.createElement('div');
    rrow.className = 'row';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.title = 'Reset this fold\u2019s parameters, origin and angle to their defaults';
    resetBtn.style.flex = '1';
    resetBtn.style.opacity = '0.8';
    resetBtn.addEventListener('click', ()=>{
      const d = defaultOp(slot.t);
      slot.p = d.p; slot.o = d.o; slot.rot = d.rot;
      pushHistory(); renderStack();
    });
    rrow.appendChild(resetBtn);
    div.appendChild(rrow);

    list.appendChild(div);
  });
}

/* ---- presets ---- */
function rebuildPresetSel(){
  const sel = $('presetSel');
  sel.innerHTML = '';
  const g1 = document.createElement('optgroup'); g1.label = 'Factory';
  FACTORY.map((p, i)=>[p.name, i])
    .sort((a, b)=> a[0].localeCompare(b[0]))
    .forEach(([name, i])=>{
      const o = document.createElement('option');
      o.value = 'f'+i; o.textContent = name;
      g1.appendChild(o);
    });
  sel.appendChild(g1);
  if(customPresets.length){
    const g2 = document.createElement('optgroup'); g2.label = 'Yours';
    customPresets.map((p, i)=>[p.name, i])
      .sort((a, b)=> a[0].localeCompare(b[0]))
      .forEach(([name, i])=>{
        const o = document.createElement('option');
        o.value = 'c'+i; o.textContent = name;
        g2.appendChild(o);
      });
    sel.appendChild(g2);
  }
}
function applyPreset(val){
  if(val[0] === 'f'){
    const p = FACTORY[+val.slice(1)];
    const d = JSON.parse(JSON.stringify(p.d));
    state.rend = d.rend;
    state.stack = d.stack;
    if('step'  in d) state.step  = d.step;
    if('twist' in d) state.twist = d.twist;
    if('depth' in d) state.depth = d.depth;
    if('fbAmt' in d) state.fbAmt = d.fbAmt;
    if('drift' in d) state.drift = d.drift;
    if('spin'  in d) state.spin  = d.spin;
    if('wobble' in d) state.wobble = d.wobble;
    if('rot'   in d) state.rot   = d.rot;
    if('flip'  in d) state.flip  = d.flip;
    if('hue'   in d) state.hue   = d.hue;
    if('chroma' in d) state.chroma = d.chroma;
    if('ripple' in d) state.ripple = d.ripple;
    if('vign'  in d) state.vign  = d.vign;
    if('grain' in d) state.grain = d.grain;
    if('exposure' in d) state.exposure = d.exposure;
    if('contrast' in d) state.contrast = d.contrast;
    if('sat' in d) state.sat = d.sat;
    if('warm' in d) state.warm = d.warm;
    if('posterize' in d) state.posterize = d.posterize;
    if('scan' in d) state.scan = d.scan;
    if('pulse' in d) state.pulse = d.pulse;
    if('sway' in d) state.sway = d.sway;
    if('hueCycle' in d) state.hueCycle = d.hueCycle;
    if('aroutes' in d && Array.isArray(d.aroutes)) state.aroutes = JSON.parse(JSON.stringify(d.aroutes));
    if('audioGain' in d) state.audioGain = d.audioGain;
    if('audioResp' in d) state.audioResp = d.audioResp;
    if('beatSens' in d) state.beatSens = d.beatSens;
    if('audioMode' in d) state.audioMode = d.audioMode;
    renderRoutes();
    if('chanSplit' in d) state.chanSplit = d.chanSplit;
    if('chanSwap' in d) state.chanSwap = d.chanSwap;
    if('dropout' in d) state.dropout = d.dropout;
    if('dither' in d) state.dither = d.dither;
    if('noiseG' in d) state.noiseG = d.noiseG;
    if('interlace' in d) state.interlace = d.interlace;
    if('stutter' in d) state.stutter = d.stutter;
    if('jitter' in d) state.jitter = d.jitter;
    if('burst' in d) state.burst = d.burst;
    if('mosh' in d) state.mosh = d.mosh;
    if('mblur' in d) state.mblur = d.mblur;
    if('rd' in d) state.rd = d.rd;
    if('tint'  in d) state.tint  = d.tint;
    if('tintA' in d) state.tintA = d.tintA;
    if('zoom'  in d) state.zoom  = d.zoom;
    if('src'   in d){ state.src = d.src; applySource(); }
    if('ccMode' in d) state.ccMode = d.ccMode;
    if('ccTint' in d) state.ccTint = d.ccTint;
  } else {
    const p = customPresets[+val.slice(1)];
    Object.assign(state, JSON.parse(JSON.stringify(p.state)));
    if(GENS[state.src]) applySource();   // 'user' keeps whatever is loaded
  }
  syncUI();
  toast('applied preset');
}
$('presetSel').addEventListener('change', e=> applyPreset(e.target.value));
$('savePreset').addEventListener('click', ()=>{
  let name;
  try {
    name = prompt('Preset name:', 'untitled-' + (customPresets.length+1));
    if(name === undefined) throw new Error('no prompt');
  } catch(_){
    name = null;   // prompt() is blocked in sandboxed viewers
  }
  if(name === null){
    // fallback: inline name field (works where prompt() is blocked)
    const row = $('saveRow');
    if(row){ row.style.display = 'flex'; $('saveName').value = 'untitled-' + (customPresets.length+1); $('saveName').focus(); $('saveName').select(); }
    return;
  }
  if(!name) return;
  commitPreset(name);
});
function commitPreset(name){
  customPresets.push({name, state: JSON.parse(JSON.stringify(state))});
  rebuildPresetSel();
  $('presetSel').value = 'c' + (customPresets.length-1);
  toast(`saved "${name}"`);
}
$('saveOk').addEventListener('click', ()=>{
  const n = $('saveName').value.trim();
  if(!n) return;
  $('saveRow').style.display = 'none';
  commitPreset(n);
});
$('saveCancel').addEventListener('click', ()=>{ $('saveRow').style.display = 'none'; });
$('saveName').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); $('saveOk').click(); }
  else if(e.key === 'Escape'){ $('saveRow').style.display = 'none'; }
});

/* apply a pasted/loaded preset object {name, state} */
function loadPresetObject(p){
  if(!p || !p.state || !Array.isArray(p.state.stack)) return false;
  Object.assign(state, JSON.parse(JSON.stringify(p.state)));
  if(GENS[state.src]) applySource();
  syncUI();
  pushHistory();
  return true;
}

$('copyPreset').addEventListener('click', async ()=>{
  const payload = JSON.stringify({
    name: 'clip-' + Date.now(),
    state: JSON.parse(JSON.stringify(state))
  });
  let ok = false;
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(payload);
      ok = true;
    }
  } catch(_){ ok = false; }
  if(!ok){
    const row = $('clipRow');
    if(row){ row.style.display = 'flex'; $('clipText').value = payload; $('clipText').focus(); $('clipText').select(); }
    toast('clipboard blocked here \u2014 copy the text shown');
    return;
  }
  toast('recipe copied to clipboard');
});

$('pastePreset').addEventListener('click', async ()=>{
  let txt = null;
  try {
    if(navigator.clipboard && navigator.clipboard.readText){
      txt = await navigator.clipboard.readText();
    }
  } catch(_){ txt = null; }
  if(txt === null){
    const row = $('clipRow');
    if(row){ row.style.display = 'flex'; $('clipText').value = ''; $('clipText').placeholder = 'paste recipe JSON here, then press Load'; $('clipText').focus(); }
    toast('clipboard blocked here \u2014 paste into the field, then Load');
    return;
  }
  applyClipText(txt);
});

function applyClipText(txt){
  try {
    const p = JSON.parse(txt);
    if(loadPresetObject(p)){ toast('recipe pasted'); $('clipRow').style.display = 'none'; }
    else toast('not a valid recipe');
  } catch(_){ toast('could not parse recipe JSON'); }
}
$('clipLoad').addEventListener('click', ()=> applyClipText($('clipText').value));
$('clipClose').addEventListener('click', ()=>{ $('clipRow').style.display = 'none'; });
$('exportPresets').addEventListener('click', ()=>{
  if(!customPresets.length){ toast('no custom presets to export'); return; }
  const blob = new Blob([JSON.stringify(customPresets, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'catoptron-presets.json';
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
});
$('importPresets').addEventListener('change', e=>{
  const f = e.target.files[0];
  if(!f) return;
  f.text().then(txt=>{
    try{
      const arr = JSON.parse(txt);
      if(!Array.isArray(arr)) throw 0;
      let n = 0;
      arr.forEach(p=>{
        if(p && typeof p.name === 'string' && p.state && Array.isArray(p.state.stack)){
          customPresets.push({name: p.name, state: p.state});
          n++;
        }
      });
      rebuildPresetSel();
      toast(`imported ${n} preset${n===1?'':'s'}`);
    }catch(_){ toast('could not parse that file'); }
  });
  e.target.value = '';
});
rebuildPresetSel();

/* ---- chance ---- */
$('reset').addEventListener('click', ()=>{
  const keep = state.seed;
  Object.assign(state, JSON.parse(JSON.stringify(defaults)));
  state.seed = keep;
  syncUI(); toast('reset');
});
$('reseed').addEventListener('click', ()=>{
  state.seed = Math.random()*100;
  if(GENS[state.src] && GENS[state.src].seeded) applySource();
  toast('reseeded');
});
$('rand').addEventListener('click', ()=>{
  const r=(a,b)=>a+Math.random()*(b-a);
  const coin=p=>Math.random()<p;
  const n = 1 + Math.floor(r(0,3));
  state.stack = [];
  for(let i=0;i<n;i++){
    const t = Math.floor(r(0, OPS.length));
    const op = defaultOp(t);
    op.p = OPS[t].params.map(pr=>{
      const [,mn,mx,st] = pr;
      let v = r(mn, mx);
      if(st >= 1) v = Math.round(v);
      return +v.toFixed(3);
    });
    op.o = coin(0.6) ? [0,0] : [+r(-0.4,0.4).toFixed(3), +r(-0.4,0.4).toFixed(3)];
    op.rot = coin(0.6) ? 0 : +r(-180,180).toFixed(1);
    state.stack.push(op);
  }
  state.rend  = Math.floor(r(0,6));
  state.fbAmt = +r(0.75,0.95).toFixed(3);
  state.depth = Math.floor(r(6,40));
  state.step  = r(0.5,0.9);
  state.twist = coin(0.3) ? 0 : r(-60,60);
  state.shiftX = coin(0.6) ? 0 : r(-0.08,0.08);
  state.shiftY = coin(0.6) ? 0 : r(-0.08,0.08);
  state.zoom  = coin(0.5) ? 1 : r(0.7,1.6);
  state.flip  = coin(0.7) ? 1 : 0;
  state.frame = r(0,0.8);
  state.frameW= r(0.01,0.08);
  state.tintA = r(0.05,0.6);
  state.tint  = '#'+[0,0,0].map(()=>Math.floor(r(40,230)).toString(16).padStart(2,'0')).join('');
  state.hue   = coin(0.5) ? 0 : r(-35,35);
  state.chroma= coin(0.5) ? 0 : r(0.2,1.8);
  state.ripple= coin(0.6) ? 0 : r(0.1,0.7);
  state.cx = r(0.3,0.7); state.cy = r(0.3,0.7);
  state.seed = Math.random()*100;
  if(GENS[state.src] && GENS[state.src].seeded) applySource();
  syncUI(); pushHistory(); toast('randomized');
});

/* vanishing point + fold-origin picking */
let dragging = false, pickOp = -1;
const _ptrs = new Map(); let _gesture = null, _singleStartC = null;
function setCenter(e){
  const r = canvas.getBoundingClientRect();
  state.cx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  state.cy = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
}
function setOpOrigin(e){
  const slot = state.stack[pickOp];
  if(!slot){ pickOp = -1; return; }
  const r = canvas.getBoundingClientRect();
  const ux = (e.clientX - r.left) / r.width;
  const uy = 1 - (e.clientY - r.top) / r.height;
  const ca = r.width / r.height;
  slot.o = [
    Math.min(1, Math.max(-1, (ux - state.cx) * ca)),
    Math.min(1, Math.max(-1, (uy - state.cy)))
  ];
}
function _gStart(){
  const p = [..._ptrs.values()];
  const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
  _gesture = { dist0: Math.hypot(dx,dy) || 1, ang0: Math.atan2(dy,dx),
    mid0:{ x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2 },
    z0: state.zoom, rot0: state.rot || 0, sx0: state.shiftX, sy0: state.shiftY };
}
function _gMove(){
  if(!_gesture) return;
  const p = [..._ptrs.values()];
  const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
  const dist = Math.hypot(dx,dy) || 1, ang = Math.atan2(dy,dx);
  const mid = { x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2 };
  const r = canvas.getBoundingClientRect();
  state.zoom = Math.min(6, Math.max(0.2, _gesture.z0 * (dist / _gesture.dist0)));   // pinch
  state.rot  = _gesture.rot0 + (ang - _gesture.ang0) * 180 / Math.PI;                // twist
  const pf = 1.8 / state.zoom;                                                       // two-finger pan
  state.shiftX = _gesture.sx0 + ((mid.x - _gesture.mid0.x) / r.width)  * pf;
  state.shiftY = _gesture.sy0 - ((mid.y - _gesture.mid0.y) / r.height) * pf;
}
canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId);
  _ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(_ptrs.size === 1){
    _gesture = null; dragging = true;
    if(pickOp < 0) _singleStartC = [state.cx, state.cy];
    if(pickOp >= 0) setOpOrigin(e); else setCenter(e);         // tap-to-place focal point / fold origin
  } else if(_ptrs.size === 2){
    dragging = false;
    if(pickOp < 0 && _singleStartC){ state.cx = _singleStartC[0]; state.cy = _singleStartC[1]; }  // undo the first-finger move
    _gStart();
  }
});
canvas.addEventListener('pointermove', e=>{
  if(!_ptrs.has(e.pointerId)) return;
  _ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(_ptrs.size >= 2) _gMove();
  else if(dragging){ if(pickOp >= 0) setOpOrigin(e); else setCenter(e); }
});
function _ptrEnd(e){
  _ptrs.delete(e.pointerId);
  if(_ptrs.size < 2) _gesture = null;
  if(_ptrs.size === 0){
    dragging = false; _singleStartC = null;
    if(pickOp >= 0){ pickOp = -1; renderStack(); toast('fold origin set'); }
    if(typeof pushHistory === 'function') pushHistory();       // canvas gestures are undoable
  }
}
canvas.addEventListener('pointerup', _ptrEnd);
canvas.addEventListener('pointercancel', _ptrEnd);
canvas.addEventListener('dblclick',    ()=>{ state.cx = 0.5; state.cy = 0.5; toast('recentered'); });

/* file loading */
function loadFile(file){
  if(!file || !file.type.startsWith('image/')) return;
  stopCamera();
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = ()=>{
    const max = 4096;
    let w = im.naturalWidth, h = im.naturalHeight;
    if(Math.max(w,h) > max){
      const s = max / Math.max(w,h);
      const cv = document.createElement('canvas');
      cv.width = Math.round(w*s); cv.height = Math.round(h*s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      setImage(cv, cv.width, cv.height);
    } else {
      setImage(im, w, h);
    }
    URL.revokeObjectURL(url);
    state.src = 'user';
    $('srcSel').value = 'user';
    toast(`${file.name} \u00b7 ${imgW}\u00d7${imgH}`);
  };
  im.src = url;
}
$('file').addEventListener('change', e=> loadFile(e.target.files[0]));
const stage = document.getElementById('stage');
['dragenter','dragover'].forEach(ev=> window.addEventListener(ev, e=>{
  e.preventDefault(); stage.classList.add('drag');
}));
['dragleave','drop'].forEach(ev=> window.addEventListener(ev, e=>{
  e.preventDefault(); if(ev==='drop' || e.target===document.documentElement || !e.relatedTarget) stage.classList.remove('drag');
}));
window.addEventListener('drop', e=>{
  stage.classList.remove('drag');
  loadFile(e.dataTransfer.files[0]);
});
window.addEventListener('paste', e=>{
  const item = [...(e.clipboardData?.items || [])].find(i=>i.type.startsWith('image/'));
  if(item) loadFile(item.getAsFile());
});

/* toast */
let toastT;
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=> t.classList.remove('show'), 1800);
}

/* ================= render loop ================= */
function hexToRgb(h){ return [1,3,5].map(i=> parseInt(h.slice(i,i+2),16)/255); }
let phase = 0, spinA = 0, wavePh = 0, lastT = performance.now();
let pulsePh = 0, swayPh = 0, hueRotPh = 0;
let glitchClock = 0;
let gJx = 0, gJy = 0, gJr = 0, gBurst = 0, gStut = 0;
function updateGlitch(){
  const fr = x => x - Math.floor(x);
  gJx = gJy = gJr = gBurst = 0;
  gStut = state.stutter > 0.001 ? (0.02 + state.stutter*0.3) : 0;
  if(state.jitter > 0.001){ const f = Math.floor(glitchClock*30.0);
    gJx = (fr(Math.sin(f*12.9898)*43758.5453)-0.5)*state.jitter*0.06;
    gJy = (fr(Math.sin(f*78.233)*43758.5453)-0.5)*state.jitter*0.06;
    gJr = (fr(Math.sin(f*45.164)*43758.5453)-0.5)*state.jitter*0.3; }
  if(state.burst > 0.001){ const beat = Math.floor(glitchClock*1.5);
    if(fr(Math.sin(beat*91.7)*43758.5453) < state.burst*0.5) gBurst = Math.max(0, 1.0 - fr(glitchClock*1.5)*3.0)*state.burst; }
}
const gStQ = v => gStut > 0 ? Math.round(v/gStut)*gStut : v;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* aspect lock: letterbox the canvas inside the stage */
function aspectRatio(){
  if(!state.aspect || state.aspect === 'free') return 0;
  if(state.aspect === 'src') return imgW / imgH;
  const m = String(state.aspect).split(':');
  const r = parseFloat(m[0]) / parseFloat(m[1]);
  return (isFinite(r) && r > 0) ? r : 0;
}
let lastFit = '';
function fitCanvas(){
  const r = aspectRatio();
  const st = stage.getBoundingClientRect();
  let cssW = st.width, cssH = st.height;
  if(r){
    if(st.width / st.height > r){ cssH = st.height; cssW = st.height * r; }
    else { cssW = st.width; cssH = st.width / r; }
  }
  const key = cssW.toFixed(1) + 'x' + cssH.toFixed(1);
  if(key !== lastFit){
    lastFit = key;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
}
$('aspectSel').addEventListener('change', e=>{
  state.aspect = e.target.value;
  fitCanvas();
});

/* feedback ping-pong framebuffers */
let fbTex = [], fbFbo = [], fbW = 0, fbH = 0, fbRead = 0;
let fxTex = null, fxFbo = null, fxW = 0, fxH = 0;
function ensureFB(w, h){
  if(fbW === w && fbH === h && fbTex.length === 2) return;
  fbTex.forEach(t => gl.deleteTexture(t));
  fbFbo.forEach(f => gl.deleteFramebuffer(f));
  fbTex = []; fbFbo = [];
  for(let i = 0; i < 2; i++){
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fbTex.push(t); fbFbo.push(f);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  fbW = w; fbH = h; fbRead = 0;
}

/* folded-image colour buffer (RD only): the folds + tint rendered to a texture the display samples */
function ensureFx(w, h){
  if(fxW === w && fxH === h && fxTex) return;
  if(fxTex) gl.deleteTexture(fxTex);
  if(fxFbo) gl.deleteFramebuffer(fxFbo);
  fxTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fxTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  fxFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fxFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fxTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  fxW = w; fxH = h;
}

/* upload the full uniform set to the current assembled program (its own locations) */
function setUniforms(entry, w, h){
  const L = entry.locs;
  gl.uniform1i(L.uTex, 0);
  gl.uniform2f(L.uCanvas, w, h);
  gl.uniform2f(L.uImg, imgW, imgH);
  const _act = state.stack.filter(s => !s.mute);
  for(let i = 0; i < _act.length; i++){
    const slot = _act[i];
    const p = slot.p || [];
    const banks = Math.max(1, Math.ceil(OPS[slot.t].params.length / 4));
    for(let b = 0; b < banks; b++){
      const loc = L[`uP${i}_${b}`];
      if(loc) gl.uniform4f(loc, p[4*b]||0, p[4*b+1]||0, p[4*b+2]||0, p[4*b+3]||0);
    }
    const o = slot.o || [0, 0];
    const ol = L[`uO${i}`];
    if(ol) gl.uniform2f(ol, o[0], o[1]);
    const rl = L[`uR${i}`];
    if(rl) gl.uniform1f(rl, (slot.rot || 0) * Math.PI / 180);
  }
  updateGlitch();
  gl.uniform1f(L.uDepth, state.depth);
  gl.uniform1f(L.uStep, state.step);
  gl.uniform1f(L.uTwist, state.twist * Math.PI/180);
  gl.uniform1f(L.uFlip, state.flip);
  gl.uniform2f(L.uCenter, state.cx + 0.05*state.sway*Math.sin(swayPh), state.cy + 0.05*state.sway*Math.cos(swayPh*0.9));
  gl.uniform2f(L.uShift, state.shiftX + gJx, state.shiftY + gJy);
  gl.uniform1f(L.uZoom, state.zoom * (1.0 + 0.15*state.pulse*Math.sin(pulsePh)));
  gl.uniform1f(L.uFrame, state.frame);
  gl.uniform1f(L.uFrameW, state.frameW);
  const t = hexToRgb(state.tint);
  gl.uniform3f(L.uTint, t[0], t[1], t[2]);
  gl.uniform1f(L.uTintA, state.tintA);
  gl.uniform1f(L.uHueK, state.hue * Math.PI/180);
  gl.uniform1f(L.uChroma, state.chroma);
  gl.uniform1f(L.uRipple, state.ripple);
  gl.uniform1f(L.uVign, state.vign);
  gl.uniform1f(L.uGrain, state.grain);
  gl.uniform1f(L.uExposure, state.exposure);
  gl.uniform1f(L.uContrast, state.contrast);
  gl.uniform1f(L.uSat, state.sat);
  gl.uniform1f(L.uWarm, state.warm);
  gl.uniform1f(L.uPosterize, state.posterize);
  gl.uniform1f(L.uScan, state.scan);
  gl.uniform1f(L.uHueRot, hueRotPh);
  gl.uniform1f(L.uChanSplit, Math.min(1, state.chanSplit + (gBurst+arBurst)*0.6));
  gl.uniform1f(L.uChanSwap, state.chanSwap);
  gl.uniform1f(L.uDropout, Math.min(1, state.dropout + (gBurst+arBurst)*0.4));
  gl.uniform1f(L.uDither, state.dither);
  gl.uniform1f(L.uNoiseG, Math.min(1, state.noiseG + (gBurst+arBurst)*0.5));
  gl.uniform1f(L.uInterlace, state.interlace);
  gl.uniform1f(L.uPhase, gStQ(phase));
  gl.uniform1f(L.uSpinA, gStQ(spinA + gJr) + (state.rot || 0) * Math.PI / 180);
  gl.uniform1f(L.uWavePh, gStQ(wavePh));
  gl.uniform1f(L.uWobble, state.wobble);
  gl.uniform1f(L.uSeed, state.seed);
  gl.uniform1i(L.uPrev, 1);
  gl.uniform1f(L.uFbAmt, state.fbAmt);
  gl.uniform1f(L.uMosh, state.mosh);
  gl.uniform1f(L.uRD, state.rd);
  gl.uniform1f(L.uRDColorPass, 0.0);
  gl.uniform1f(L.uCcMode, state.ccMode);
  const ct = hexToRgb(state.ccTint);
  gl.uniform3f(L.uCcTint, ct[0], ct[1], ct[2]);
  gl.uniform1f(L.uPost, state.rend === 5 ? 0 : 1);
}

function presentFeedback(w, h, srcTexIdx){
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.useProgram(postProg);
  bindQuad(postLoc);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fbTex[srcTexIdx]);
  gl.uniform1i(PU.uSrc, 0);
  gl.uniform1f(PU.uVign, state.vign);
  gl.uniform1f(PU.uGrain, state.grain);
  gl.uniform1f(PU.uWavePh, wavePh);
  gl.uniform1f(PU.uSeed, state.seed);
  gl.uniform1f(PU.uExposure, state.exposure);
  gl.uniform1f(PU.uContrast, state.contrast);
  gl.uniform1f(PU.uSat, state.sat);
  gl.uniform1f(PU.uWarm, state.warm);
  gl.uniform1f(PU.uPosterize, state.posterize);
  gl.uniform1f(PU.uScan, state.scan);
  gl.uniform1f(PU.uHueRot, hueRotPh);
  gl.uniform1f(PU.uChanSplit, Math.min(1, state.chanSplit + (gBurst+arBurst)*0.6));
  gl.uniform1f(PU.uChanSwap, state.chanSwap);
  gl.uniform1f(PU.uDropout, Math.min(1, state.dropout + (gBurst+arBurst)*0.4));
  gl.uniform1f(PU.uDither, state.dither);
  gl.uniform1f(PU.uNoiseG, Math.min(1, state.noiseG + (gBurst+arBurst)*0.5));
  gl.uniform1f(PU.uInterlace, state.interlace);
  gl.uniform1f(PU.uRD, state.rd);
  { const _rt = hexToRgb(state.tint); gl.uniform3f(PU.uTint, _rt[0], _rt[1], _rt[2]); }
  gl.uniform1f(PU.uTintA, state.tintA);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fxTex); gl.uniform1i(PU.uFx, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderScene(w, h){
  /* pick (or reuse) the assembled program for this stack + renderer */
  const req = cache.request(state.stack.filter(s => !s.mute).map(s => s.t), state.rend);
  if(req.ready) curEntry = req.entry;
  if(req.error && !shaderErrShown){ shaderErrShown = true; toast('shader error \u2014 see console'); console.error(req.error); }
  if(!curEntry) return;              // first program still linking; nothing to draw yet
  const entry = curEntry;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  if(state.rend === 5){
    const rdOn = state.rd > 0.5;
    const rw = rdOn ? Math.min(w, 384) : w;
    const rh = rdOn ? Math.max(1, Math.round(rw * h / w)) : h;
    const sizeChanged = !(fbW === rw && fbH === rh && fbTex.length === 2);
    ensureFB(rw, rh);
    if(paused && !exporting && !sizeChanged){
      presentFeedback(w, h, fbRead);   // frozen: re-present last generation
      return;
    }
    gl.useProgram(entry.prog);
    bindQuad(entry.aPos);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    setUniforms(entry, rw, rh);
    let rdi = fbRead;
    const iters = rdOn ? 8 : 1;   // RD needs many Gray-Scott steps to form structure
    for(let it = 0; it < iters; it++){
      const write = 1 - rdi;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbFbo[write]);
      gl.viewport(0, 0, rw, rh);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fbTex[rdi]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rdi = write;
    }
    if(rdOn){
      /* colour pass: render the folded + tinted image so folds/tint drive RD colour */
      ensureFx(w, h);
      gl.uniform1f(entry.locs.uRDColorPass, 1.0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fxFbo);
      gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.uniform1f(entry.locs.uRDColorPass, 0.0);
    }
    /* present (upscales the capped RD buffer to the canvas) */
    presentFeedback(w, h, rdi);
    fbRead = rdi;
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(entry.prog);
    bindQuad(entry.aPos);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    setUniforms(entry, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

let exporting = false;
let paused = false;

function togglePause(){
  paused = !paused;
  const b = $('pauseBtn');
  b.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
  b.classList.toggle('on', paused);
  toast(paused ? 'paused' : 'playing');
}
$('pauseBtn').addEventListener('click', togglePause);
window.addEventListener('keydown', e=>{
  if((e.ctrlKey || e.metaKey) && !e.altKey){
    const k = e.key.toLowerCase();
    const ae = document.activeElement, tag = ae && ae.tagName, ty = ae && ae.type;
    const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && (ty === 'text' || ty === 'number' || ty === 'search'));
    if(!typing && k === 'z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
    if(!typing && (k === 'y' || (k === 'z' && e.shiftKey))){ e.preventDefault(); redo(); return; }
  }
  if(e.code === 'Space'){
    const t = document.activeElement && document.activeElement.tagName;
    if(t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'BUTTON') return;
    e.preventDefault();
    togglePause();
  }
});

/* ================= audio reactivity ================= */
const AUD = { ctx:null, analyser:null, freq:null, node:null, elNode:null, mediaEl:null, stream:null, bass:0, mid:0, treble:0, level:0, beat:0, _refr:0, _prevKick:0, hist:new Float32Array(43), hi:0, recDest:null };
let AR = {};        // per-target additive offsets, recomputed each frame
let arBurst = 0;    // audio glitch-burst, added to gBurst consumers
// --- offline FFT audio analysis (for synced HQ export; mirrors the live analyser) ---
function _fft(re, im){
  const n = re.length;
  for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j){ const tr=re[i];re[i]=re[j];re[j]=tr; const ti=im[i];im[i]=im[j];im[j]=ti; } }
  for(let len=2;len<=n;len<<=1){ const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang);
    for(let i=0;i<n;i+=len){ let cwr=1,cwi=0;
      for(let k=0;k<len/2;k++){ const ur=re[i+k],ui=im[i+k]; const br=re[i+k+len/2],bi=im[i+k+len/2];
        const vr=br*cwr-bi*cwi, vi=br*cwi+bi*cwr;
        re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const nwr=cwr*wr-cwi*wi; cwi=cwr*wi+cwi*wr; cwr=nwr; } } }
}
function makeOfflineAudio(chL, chR, sampleRate, fps, startSec){
  const N=2048, half=N/2; const re=new Float32Array(N), im=new Float32Array(N);
  const win=new Float32Array(N); for(let i=0;i<N;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  const smoothMag=new Float32Array(half); const minDb=-100,maxDb=-30,smoothC=0.6;
  const A={bass:0,mid:0,treble:0,level:0,beat:0,_refr:0,_prevKick:0,hist:new Float32Array(43),hi:0}; const dt=1/fps;
  return function(fn){
    const center=Math.floor(((startSec||0) + fn/fps)*sampleRate);
    for(let i=0;i<N;i++){ const s=center-N+i+1; let v=0; if(s>=0&&s<chL.length) v=(chL[s]+chR[s])*0.5; re[i]=v*win[i]; im[i]=0; }
    _fft(re,im);
    for(let k=0;k<half;k++){ const mag=Math.sqrt(re[k]*re[k]+im[k]*im[k])/N; smoothMag[k]=smoothC*smoothMag[k]+(1-smoothC)*mag; }
    const g=state.audioGain;
    const band=(a,b)=>{ let s=0,c=0; const i0=Math.floor(a*half),i1=Math.floor(b*half); for(let k=i0;k<i1;k++){ const db=20*Math.log10(smoothMag[k]||1e-9); const byte=Math.max(0,Math.min(255,255*(db-minDb)/(maxDb-minDb))); s+=byte;c++; } return c?(s/c)/255:0; };
    const bass=Math.min(1,band(0,0.04)*g), mid=Math.min(1,band(0.04,0.18)*g), treble=Math.min(1,band(0.18,0.5)*g);
    const level=Math.min(1,(bass*0.5+mid*0.35+treble*0.25)*1.2);
    const k=0.12+state.audioResp*0.75;
    A.bass+=(bass-A.bass)*k; A.mid+=(mid-A.mid)*k; A.treble+=(treble-A.treble)*k; A.level+=(level-A.level)*k;
    const kick=Math.min(1,band(0.002,0.025)*g);
    const H=A.hist,M=H.length; let hs=0; for(let i=0;i<M;i++)hs+=H[i]; const havg=hs/M; let hv=0; for(let i=0;i<M;i++){const d=H[i]-havg;hv+=d*d;} const hstd=Math.sqrt(hv/M);
    const kk=2.2-state.beatSens*1.8; const thr=havg+kk*hstd+0.015; const rising=kick>A._prevKick+0.004;
    if(kick>thr&&kick>0.08&&rising&&A._refr<=0){A.beat=1;A._refr=0.10;} else A.beat=Math.max(0,A.beat-dt*4.0);
    A._refr=Math.max(0,A._refr-dt); A._prevKick=kick; H[A.hi]=kick; A.hi=(A.hi+1)%M;
    return A;
  };
}
const AR_BANDS = ['bass','mid','treble','level','beat'];
const AR_BLABEL = { bass:'Bass', mid:'Mid', treble:'Treble', level:'Level', beat:'Beat' };
// AR targets are auto-derived from every sensible slider: real range -> scale + clamp, so all params react
const AR_LABEL = { zoom:'Zoom', twist:'Twist', rot:'Rotate', shiftX:'Pan X', shiftY:'Pan Y', depth:'Depth', step:'Step / RD Feed', ripple:'Ripple', chroma:'Chroma', wobble:'Wobble', fbAmt:'Feedback', exposure:'Exposure', contrast:'Contrast', sat:'Saturation', warm:'Warmth', hue:'Hue', tintA:'Tint amount', vign:'Vignette', grain:'Grain', posterize:'Posterize', scan:'Scanlines', chanSplit:'Channel split', chanSwap:'Channel swap', dropout:'Dropout', dither:'Dither', noiseG:'Noise', interlace:'Interlace', stutter:'Stutter', jitter:'Jitter', burst:'Glitch burst', mosh:'Datamosh', driftRate:'Drift speed', spinRate:'Spin speed', hueRate:'Hue-cycle speed', frame:'Frame', frameW:'Frame width', srcScale:'Source scale', srcHue:'Source hue', srcVar:'Source variance', pulse:'Pulse', sway:'Sway', mblur:'Motion blur' };
const AR_TUNE = { ripple:{mult:3.0,max:4}, chroma:{mult:1.2}, depth:{mult:0.5}, twist:{mult:0.5}, rot:{mult:0.35}, hue:{mult:0.5}, srcHue:{mult:0.4}, posterize:{mult:0.5}, dither:{mult:0.5}, zoom:{mult:0.4} };
const AR_MOTION = { drift:'driftRate', spin:'spinRate', hueCycle:'hueRate' };   // rate targets (added to accumulators)
const AR_RATE_META = { driftRate:{s:3}, spinRate:{s:3}, hueRate:{s:2.5} };
const AR_SPECIAL = { burst:{s:1} };
const AR_EXCLUDE = new Set(['audioGain','audioResp','beatSens','rd','burst']);
const AR_GROUPS = [
  ['Geometry', ['zoom','twist','rot','shiftX','shiftY','depth','step','ripple','chroma','wobble']],
  ['Feedback', ['fbAmt']],
  ['Grade', ['exposure','contrast','sat','warm','hue','tintA','vign','grain','posterize','scan']],
  ['Glitch', ['chanSplit','chanSwap','dropout','dither','noiseG','interlace','stutter','jitter','burst','mosh']],
  ['Motion', ['driftRate','spinRate','hueRate','pulse','sway','mblur']],
  ['Frame / source', ['frame','frameW','srcScale','srcHue','srcVar']],
];
const AR_DIRECT = {}, AR_TLABEL = {}, AR_SCALE = {};
function buildAR(){
  for(const s of sliders){
    const id = s[0];
    if(AR_EXCLUDE.has(id) || (id in AR_MOTION)) continue;
    const el = $(id); if(!el || el.tagName !== 'INPUT') continue;
    const mn = +el.min, mx = +el.max;
    if(!isFinite(mn) || !isFinite(mx) || mx <= mn) continue;
    const tune = AR_TUNE[id] || {};
    const mult = (tune.mult != null) ? tune.mult : 0.55;
    AR_DIRECT[id] = { k:id, s:(mx-mn)*mult, min:mn, max:(tune.max != null ? tune.max : mx) };
  }
  for(const t in AR_DIRECT){ AR_TLABEL[t] = AR_LABEL[t] || t; AR_SCALE[t] = AR_DIRECT[t].s; }
  for(const t in AR_RATE_META){ AR_TLABEL[t] = AR_LABEL[t] || t; AR_SCALE[t] = AR_RATE_META[t].s; }
  for(const t in AR_SPECIAL){ AR_TLABEL[t] = AR_LABEL[t] || t; AR_SCALE[t] = AR_SPECIAL[t].s; }
}
let nextOpId = 1;
function bandVal(b){ return b==='bass'?AUD.bass : b==='mid'?AUD.mid : b==='treble'?AUD.treble : b==='beat'?AUD.beat : AUD.level; }
// resolve a "fold:<id>:<pi|rot>" target to the live slot + clamp range, or null if the fold is gone
function foldMeta(target){
  const parts = target.split(':'); const id = +parts[1], key = parts[2];
  const slot = state.stack.find(s => s.id === id); if(!slot) return null;
  if(key === 'rot') return { slot, key:'rot', min:-180, max:180 };
  const pi = +key, pr = OPS[slot.t].params[pi]; if(!pr) return null;
  return { slot, key:pi, min:pr[1], max:pr[2] };
}
let _arSaved = null;
function applyAR(){
  _arSaved = { s:{}, f:[] };
  for(const t in AR){
    const off = AR[t]; if(!off) continue;
    if(t.indexOf('fold:') === 0){
      const fm = foldMeta(t); if(!fm) continue;
      const cur = fm.key === 'rot' ? fm.slot.rot : fm.slot.p[fm.key];
      _arSaved.f.push({ fm, v:cur });
      const nv = Math.max(fm.min, Math.min(fm.max, cur + off));
      if(fm.key === 'rot') fm.slot.rot = nv; else fm.slot.p[fm.key] = nv;
    } else if(AR_DIRECT[t]){
      const d = AR_DIRECT[t], key = d.k;
      if(!(key in _arSaved.s)) _arSaved.s[key] = state[key];
      let v = state[key] + off;
      if(d.min !== undefined) v = Math.max(d.min, v);
      if(d.max !== undefined) v = Math.min(d.max, v);
      state[key] = v;
    }
  }
}
function restoreAR(){ if(_arSaved){ for(const k in _arSaved.s) state[k] = _arSaved.s[k]; for(const e of _arSaved.f){ if(e.fm.key==='rot') e.fm.slot.rot = e.v; else e.fm.slot.p[e.fm.key] = e.v; } _arSaved = null; } }
// --- per-control AR toggle buttons ---
function arHasRoute(target){ return state.aroutes.some(r => r.target === target); }
function arToggle(target){
  if(arHasRoute(target)) state.aroutes = state.aroutes.filter(r => r.target !== target);
  else state.aroutes.push({ band:'level', target, amt:0.6 });
  renderRoutes(); syncARButtons();
}
function arBtn(target){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'arbtn'; b.textContent = '\u266a'; b.title = 'React to audio'; b.dataset.art = target;
  b.classList.toggle('on', arHasRoute(target));
  b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); arToggle(target); });
  return b;
}
function syncARButtons(){ document.querySelectorAll('.arbtn').forEach(b => b.classList.toggle('on', arHasRoute(b.dataset.art))); }
function injectARButtons(){
  for(const s of sliders){ const id = s[0];
    const target = (id in AR_MOTION) ? AR_MOTION[id] : (AR_TLABEL[id] ? id : null);
    if(!target) continue;
    const el = $(id); if(!el || !el.closest) continue;
    const row = el.closest('.row'); if(!row || row.querySelector('.arbtn')) continue;
    row.appendChild(arBtn(target));
  }
  syncARButtons();
}

async function audioEnable(on){
  state.audioOn = on ? 1 : 0;
  if(on){
    try {
      if(!AUD.ctx) AUD.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if(AUD.ctx.state === 'suspended') await AUD.ctx.resume();
      if(!AUD.analyser){ AUD.analyser = AUD.ctx.createAnalyser(); AUD.analyser.fftSize = 1024; AUD.analyser.smoothingTimeConstant = 0.6; AUD.freq = new Uint8Array(AUD.analyser.frequencyBinCount); }
      await audioSetMode(state.audioMode);
    } catch(e){ toast('Audio: ' + (e && e.message ? e.message : e)); state.audioOn = 0; }
  } else {
    if(AUD.mediaEl){ try{ AUD.mediaEl.pause(); }catch(_){} }
  }
  syncUI();
}
async function audioSetMode(mode){
  state.audioMode = mode;
  if(!AUD.ctx || !AUD.analyser) return;
  try { if(AUD.node) AUD.node.disconnect(AUD.analyser); } catch(_){}
  try { AUD.analyser.disconnect(); } catch(_){}
  if(AUD.stream){ AUD.stream.getTracks().forEach(t=>t.stop()); AUD.stream = null; }
  if(mode === 'mic'){
    AUD.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, autoGainControl:false, noiseSuppression:false } });
    AUD.node = AUD.ctx.createMediaStreamSource(AUD.stream);
    AUD.node.connect(AUD.analyser);   // analyser only (no speaker => no feedback)
  } else {
    if(!AUD.mediaEl){ toast('Load an audio file first'); return; }
    if(!AUD.elNode) AUD.elNode = AUD.ctx.createMediaElementSource(AUD.mediaEl);  // once per element
    AUD.node = AUD.elNode;
    AUD.node.connect(AUD.analyser);
    AUD.analyser.connect(AUD.ctx.destination);   // route file to speakers
    AUD.mediaEl.play().catch(()=>{});
  }
}
function audioLoadFile(file){
  if(!file) return;
  AUD.file = file;
  if(!AUD.mediaEl){ AUD.mediaEl = new Audio(); AUD.mediaEl.loop = true; }
  try{ if(AUD.mediaEl.src) URL.revokeObjectURL(AUD.mediaEl.src); }catch(_){}
  AUD.mediaEl.src = URL.createObjectURL(file);
  state.audioMode = 'file';
  if(state.audioOn) audioSetMode('file'); else audioEnable(true);
}
function audioSample(dt){
  if(!state.audioOn || !AUD.analyser){ AUD.bass=AUD.mid=AUD.treble=AUD.level=0; AUD.beat=Math.max(0,AUD.beat-dt*3.5); return; }
  AUD.analyser.getByteFrequencyData(AUD.freq);
  const nb = AUD.freq.length, g = state.audioGain;
  const band = (a,b)=>{ let s=0,c=0; const i0=Math.floor(a*nb), i1=Math.floor(b*nb); for(let i=i0;i<i1;i++){ s+=AUD.freq[i]; c++; } return c ? (s/c)/255 : 0; };
  const bass = Math.min(1, band(0.00,0.04)*g), mid = Math.min(1, band(0.04,0.18)*g), treble = Math.min(1, band(0.18,0.50)*g);
  const level = Math.min(1, (bass*0.5 + mid*0.35 + treble*0.25) * 1.2);
  const k = 0.12 + state.audioResp*0.75;
  AUD.bass += (bass-AUD.bass)*k; AUD.mid += (mid-AUD.mid)*k; AUD.treble += (treble-AUD.treble)*k; AUD.level += (level-AUD.level)*k;
  // beat: adaptive onset on an ISOLATED kick band vs a rolling local average (robust across tracks)
  const kick = Math.min(1, band(0.002, 0.025) * g);          // ~40-540Hz, isolates the kick transient
  const H = AUD.hist, N = H.length;
  let hs = 0; for(let i=0;i<N;i++) hs += H[i];
  const havg = hs / N;
  let hv = 0; for(let i=0;i<N;i++){ const d = H[i] - havg; hv += d*d; }
  const hstd = Math.sqrt(hv / N);
  const kk = 2.2 - state.beatSens * 1.8;                     // high sensitivity => low k => fires more easily
  const thr = havg + kk * hstd + 0.015;
  const rising = kick > AUD._prevKick + 0.004;
  if(kick > thr && kick > 0.08 && rising && AUD._refr <= 0){ AUD.beat = 1; AUD._refr = 0.10; }
  else AUD.beat = Math.max(0, AUD.beat - dt * 4.0);
  AUD._refr = Math.max(0, AUD._refr - dt);
  AUD._prevKick = kick;
  H[AUD.hi] = kick; AUD.hi = (AUD.hi + 1) % N;
}
function audioRoutes(){
  const o = {};
  if(state.audioOn && AUD.ctx){
    for(const r of state.aroutes){
      const v = bandVal(r.band);
      let scale;
      if(r.target.indexOf('fold:') === 0){ const fm = foldMeta(r.target); if(!fm) continue; scale = (fm.max - fm.min) * 0.55; }
      else scale = AR_SCALE[r.target] || 1;
      o[r.target] = (o[r.target]||0) + v * r.amt * scale;
    }
  }
  return o;
}
function updateMeter(){
  const set=(id,v)=>{ const el=$(id); if(el) el.style.width = Math.round(Math.min(1,v)*100) + '%'; };
  set('audMBass', AUD.bass); set('audMMid', AUD.mid); set('audMTreble', AUD.treble); set('audMLevel', AUD.level);
}
let _seeking = false;
function fmtTime(t){ t = Math.max(0, t|0); const mm = (t/60)|0, ss = t%60; return mm + ':' + (ss<10?'0':'') + ss; }
function updateAudTransport(){
  const tr = $('audTransport'); if(!tr) return;
  const show = !!(AUD.mediaEl && state.audioMode === 'file');
  tr.style.display = show ? 'flex' : 'none';
  if(!show) return;
  const pb = $('audPlay'); if(pb) pb.innerHTML = AUD.mediaEl.paused ? '&#9654;' : '&#10074;&#10074;';
  const d = AUD.mediaEl.duration || 0, c = AUD.mediaEl.currentTime || 0;
  if(!_seeking){ const sk = $('audSeek'); if(sk) sk.value = d ? Math.round(c / d * 1000) : 0; }
  const tt = $('audTime'); if(tt) tt.textContent = fmtTime(c) + ' / ' + fmtTime(d);
}
function renderRoutes(){
  const host = $('aroutes'); if(!host) return;
  host.innerHTML = '';
  state.aroutes.forEach((r, i)=>{
    const row = document.createElement('div'); row.className = 'aroute';
    const bandSel = document.createElement('select');
    AR_BANDS.forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=AR_BLABEL[b]; if(b===r.band) o.selected=true; bandSel.appendChild(o); });
    bandSel.addEventListener('change', ()=>{ r.band = bandSel.value; });
    const arrow = document.createElement('span'); arrow.textContent = '\u2192'; arrow.style.opacity = '0.5';
    let tgtEl;
    if(r.target.indexOf('fold:') === 0){
      tgtEl = document.createElement('span'); tgtEl.className = 'foldtgt';
      const fm = foldMeta(r.target);
      if(fm){ const idx = state.stack.indexOf(fm.slot) + 1; const pl = fm.key === 'rot' ? 'Angle' : OPS[fm.slot.t].params[fm.key][0]; tgtEl.textContent = 'Fold ' + idx + ' \u00b7 ' + pl; }
      else { tgtEl.textContent = 'Fold (removed)'; tgtEl.style.opacity = '0.5'; }
    } else {
      const tgtSel = document.createElement('select');
      AR_GROUPS.forEach(g=>{ const og=document.createElement('optgroup'); og.label=g[0]; g[1].forEach(t=>{ if(!(t in AR_TLABEL)) return; const o=document.createElement('option'); o.value=t; o.textContent=AR_TLABEL[t]; if(t===r.target) o.selected=true; og.appendChild(o); }); if(og.children.length) tgtSel.appendChild(og); });
      tgtSel.addEventListener('change', ()=>{ r.target = tgtSel.value; });
      tgtEl = tgtSel;
    }
    const amt = document.createElement('input'); amt.type='range'; amt.min='-1'; amt.max='1'; amt.step='0.01'; amt.value = r.amt;
    const amtv = document.createElement('span'); amtv.className='amtv'; amtv.textContent = (+r.amt).toFixed(2);
    amt.addEventListener('input', ()=>{ r.amt = +amt.value; amtv.textContent = (+amt.value).toFixed(2); });
    const rx = document.createElement('span'); rx.className='rx'; rx.textContent='\u00d7'; rx.title='remove';
    rx.addEventListener('click', ()=>{ state.aroutes.splice(i,1); renderRoutes(); syncARButtons(); });
    arrow.className = 'arw';
    const top = document.createElement('div'); top.className = 'ar-top'; top.append(bandSel, arrow, tgtEl, rx);
    const bot = document.createElement('div'); bot.className = 'ar-bot'; bot.append(amt, amtv);
    row.append(top, bot);
    host.appendChild(row);
  });
  syncARButtons();
}

function frame(now){
  const dt = Math.min(0.05, (now - lastT)/1000); lastT = now;
  if(exporting){ requestAnimationFrame(frame); return; }
  audioSample(dt); AR = audioRoutes(); arBurst = AR.burst || 0; updateMeter(); updateAudTransport();
  if(!reduced && !paused){
    phase  += dt * (state.drift + (AR.driftRate||0)) * 0.6;
    spinA  += dt * (state.spin + (AR.spinRate||0)) * 0.5;
    wavePh += dt * (state.wobble * 1.5 + (AR.wobble||0) * 1.5);
    pulsePh += dt * 1.8;
    swayPh  += dt * 1.3;
    hueRotPh += dt * (state.hueCycle * 0.7 + (AR.hueRate||0));
    glitchClock += dt;
  }
  if(kfPlaying && !paused) kfTick(dt);
  const period = state.flip ? 2 : 1;
  phase = ((phase % period) + period) % period;

  fitCanvas();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }

  if(camActive && camVideo && camVideo.readyState >= 2 && camVideo.videoWidth){
    setImage(camVideo, camVideo.videoWidth, camVideo.videoHeight);
  }
  applyAR();
  try { renderScene(w, h); } finally { restoreAR(); }
  { const mb = state.mblur + (AR.mblur||0); if(mb > 0.001) motionBlurPass(w, h, mb); else mbInit = false; }
  requestAnimationFrame(frame);
}
applySource();
requestAnimationFrame(frame);
buildAR();
injectARButtons();
renderRoutes();
syncUI();

/* ================= record animation ================= */
let recorder = null, recChunks = [], recTimer = null;
const recBtn = $('recBtn');

function loopSeconds(){
  const period = state.flip ? 2 : 1;
  const rate = Math.abs(state.drift) * 0.6;
  return rate > 1e-3 ? period / rate : 0;
}

recBtn.addEventListener('click', ()=>{
  if(recorder){ recorder.stop(); return; }
  if(exporting){ toast('HQ export in progress'); return; }
  if(typeof MediaRecorder === 'undefined' || !canvas.captureStream){
    toast('recording not supported in this browser'); return;
  }
  const fps  = +$('recFps').value;
  const mbps = +$('recQ').value;
  const lenSel = $('recLen').value;
  let dur = 0;
  if(lenSel === 'loop1' || lenSel === 'loop2'){
    const L = loopSeconds();
    if(!L){ toast('set a non-zero drift for loop recording'); return; }
    dur = L * (lenSel === 'loop2' ? 2 : 1);
  } else if(lenSel !== 'manual'){
    dur = +lenSel;
  }
  const _fmt = $('recFmt') ? $('recFmt').value : 'webm';
  const _mp4 = ['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1.42E01F','video/mp4'];
  const _webm = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mimes = _fmt === 'mp4' ? _mp4.concat(_webm) : _webm;
  const mime = mimes.find(m2=> MediaRecorder.isTypeSupported(m2)) || '';
  if(_fmt === 'mp4' && !/mp4/.test(mime)) toast('MP4 not supported for live record here - saving WebM');
  const stream = canvas.captureStream(fps);
  if(state.audioOn && AUD.ctx && AUD.node){
    try {
      AUD.recDest = AUD.ctx.createMediaStreamDestination();
      AUD.node.connect(AUD.recDest);
      const atrack = AUD.recDest.stream.getAudioTracks()[0];
      if(atrack) stream.addTrack(atrack);
    } catch(_){}
  }
  recChunks = [];
  try{
    recorder = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: mbps * 1e6
    });
  }catch(err){
    toast('could not start recorder'); recorder = null; return;
  }
  recorder.ondataavailable = e=>{ if(e.data.size) recChunks.push(e.data); };
  recorder.onstop = ()=>{
    clearInterval(recTimer); recTimer = null;
    if(AUD.recDest){ try{ AUD.node && AUD.node.disconnect(AUD.recDest); }catch(_){} AUD.recDest = null; }
    const blob = new Blob(recChunks, {type: mime || 'video/webm'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `catoptron-${Date.now()}.` + (/mp4/.test(mime)?'mp4':'webm');
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
    recorder = null;
    recBtn.textContent = 'Record WebM';
    recBtn.classList.remove('on');
    toast('saved animation');
  };
  phase = 0;
  const t0 = performance.now();
  recorder.start(250);
  recBtn.classList.add('on');
  recTimer = setInterval(()=>{
    const el = (performance.now() - t0) / 1000;
    recBtn.textContent = dur
      ? `\u25cf ${el.toFixed(1)} / ${dur.toFixed(1)}s`
      : `\u25cf ${el.toFixed(1)}s \u2014 stop`;
    if(dur && el >= dur && recorder) recorder.stop();
  }, 100);
});

/* ================= HQ export: WebCodecs + inline WebM muxer ================= */
/* minimal Matroska/WebM writer: one video track, clusters split on keyframes */
function WebMMuxer(width, height, codecId){
  const chunks = [];
  const txt = s => new TextEncoder().encode(s);
  const cat = arrs => {
    let n = 0; arrs.forEach(a => n += a.length);
    const o = new Uint8Array(n); let p = 0;
    arrs.forEach(a => { o.set(a, p); p += a.length; });
    return o;
  };
  const vint = n => {                       // EBML size, minimal length
    let len = 1;
    while(n > Math.pow(2, 7*len) - 2 && len < 8) len++;
    const o = new Uint8Array(len);
    let v = n;
    for(let i = len-1; i >= 0; i--){ o[i] = v & 0xff; v = Math.floor(v/256); }
    o[0] |= 0x80 >> (len-1);
    return o;
  };
  const u = n => {                          // unsigned int, minimal bytes
    const b = [];
    do { b.unshift(n & 0xff); n = Math.floor(n/256); } while(n > 0);
    return new Uint8Array(b);
  };
  const f64b = x => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
  const el = (idBytes, payload) => cat([new Uint8Array(idBytes), vint(payload.length), payload]);

  this.add = chunk => {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    chunks.push({ ts: Math.round(chunk.timestamp/1000), key: chunk.type === 'key', data });
  };
  this.finish = () => {
    const head = el([0x1A,0x45,0xDF,0xA3], cat([
      el([0x42,0x86], u(1)),  el([0x42,0xF7], u(1)),
      el([0x42,0xF2], u(4)),  el([0x42,0xF3], u(8)),
      el([0x42,0x82], txt('webm')),
      el([0x42,0x87], u(2)),  el([0x42,0x85], u(2)),
    ]));
    const durMs = chunks.length ? chunks[chunks.length-1].ts +
      (chunks.length > 1 ? chunks[1].ts - chunks[0].ts : 33) : 0;
    const info = el([0x15,0x49,0xA9,0x66], cat([
      el([0x2A,0xD7,0xB1], u(1000000)),
      el([0x44,0x89], f64b(durMs)),
      el([0x4D,0x80], txt('catoptron')),
      el([0x57,0x41], txt('catoptron')),
    ]));
    const tracks = el([0x16,0x54,0xAE,0x6B],
      el([0xAE], cat([
        el([0xD7], u(1)),
        el([0x73,0xC5], u(1)),
        el([0x83], u(1)),
        el([0x86], txt(codecId)),
        el([0xE0], cat([ el([0xB0], u(width)), el([0xBA], u(height)) ])),
      ]))
    );
    const clusters = [];
    let cur = null, base = 0;
    for(const c of chunks){
      if(c.key || !cur || (c.ts - base) > 30000){
        if(cur) clusters.push(el([0x1F,0x43,0xB6,0x75], cat(cur)));
        base = c.ts;
        cur = [ el([0xE7], u(base)) ];
      }
      const rel = c.ts - base;
      const bh = new Uint8Array([0x81, (rel >> 8) & 0xff, rel & 0xff, c.key ? 0x80 : 0x00]);
      cur.push(el([0xA3], cat([bh, c.data])));
    }
    if(cur) clusters.push(el([0x1F,0x43,0xB6,0x75], cat(cur)));
    const segment = el([0x18,0x53,0x80,0x67], cat([info, tracks, ...clusters]));
    return new Blob([head, segment], { type: 'video/webm' });
  };
}

const hqBtn = $('hqBtn');
let hqAbort = false;

function MP4Muxer(width, height, fps){
  const chunks = [], samples = [];
  let avcC = null;
  const aChunks = [], aSizes = []; let asc = null, aSR = 0, aCh = 2;
  const u16 = n => [(n>>>8)&255, n&255];
  const u32 = n => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
  const s4  = s => [s.charCodeAt(0),s.charCodeAt(1),s.charCodeAt(2),s.charCodeAt(3)];
  const cstr= s => { const a=[]; for(let i=0;i<s.length;i++) a.push(s.charCodeAt(i)); a.push(0); return a; };
  const cat = arrs => { let o=[]; for(const a of arrs) o = o.concat(a); return o; };
  const box = (t, ...p) => { const b = cat(p); return cat([u32(b.length+8), s4(t), b]); };
  const fbox= (t, v, f, ...p) => box(t, cat([[v],[(f>>>16)&255,(f>>>8)&255,f&255]]), ...p);
  const desclen = n => { const b=[]; do { let x=n & 0x7f; n>>=7; if(b.length) x|=0x80; b.unshift(x); } while(n>0); return b; };
  const MATRIX = cat([u32(0x00010000),u32(0),u32(0), u32(0),u32(0x00010000),u32(0), u32(0),u32(0),u32(0x40000000)]);
  return {
    add(chunk, meta){
      if(!avcC && meta && meta.decoderConfig && meta.decoderConfig.description)
        avcC = new Uint8Array(meta.decoderConfig.description);
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
      chunks.push(b); samples.push({ size: b.byteLength, key: chunk.type === 'key' });
    },
    setAudio(sr, ch){ aSR = sr; aCh = ch || 2; },
    addAudio(chunk, meta){
      if(!asc && meta && meta.decoderConfig && meta.decoderConfig.description) asc = new Uint8Array(meta.decoderConfig.description);
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); aChunks.push(b); aSizes.push(b.byteLength);
    },
    finish(){
      const N = samples.length;
      if(!avcC) avcC = new Uint8Array([1,66,0,31,255,225,0,0,1,0,0]);
      const hasAudio = aChunks.length > 0 && asc && aSR > 0;
      const ftyp = box('ftyp', s4('isom'), u32(512), s4('isom'), s4('iso2'), s4('avc1'), s4('mp41'));
      let vBytes = 0; for(const s of samples) vBytes += s.size;
      let aBytes = 0; for(const s of aSizes) aBytes += s;
      const mdatH = cat([u32(vBytes + aBytes + 8), s4('mdat')]);
      const keys = []; samples.forEach((s,i)=>{ if(s.key) keys.push(i+1); });
      const AF = aSizes.length, aSamplesTotal = AF * 1024;
      const aDurMovie = hasAudio ? Math.round(aSamplesTotal / aSR * fps) : 0;
      const movieDur = Math.max(N, aDurMovie);
      const videoTrak = (dataOffset)=>{
        const stts = fbox('stts',0,0, u32(1), u32(N), u32(1));
        const stss = fbox('stss',0,0, u32(keys.length), cat(keys.map(u32)));
        const stsc = fbox('stsc',0,0, u32(1), u32(1), u32(N), u32(1));
        const stsz = fbox('stsz',0,0, u32(0), u32(N), cat(samples.map(s=>u32(s.size))));
        const stco = fbox('stco',0,0, u32(1), u32(dataOffset));
        const avc1 = box('avc1', [0,0,0,0,0,0], u16(1), u16(0), u16(0), cat([u32(0),u32(0),u32(0)]),
          u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0),
          u16(1), new Array(32).fill(0), u16(0x0018), u16(0xFFFF), box('avcC', [...avcC]));
        const stbl = box('stbl', fbox('stsd',0,0, u32(1), avc1), stts, stss, stsc, stsz, stco);
        const minf = box('minf', fbox('vmhd',0,1, u16(0), u16(0),u16(0),u16(0)),
          box('dinf', fbox('dref',0,0, u32(1), fbox('url ',0,1))), stbl);
        const mdia = box('mdia',
          fbox('mdhd',0,0, u32(0),u32(0), u32(fps), u32(N), u16(0x55C4), u16(0)),
          fbox('hdlr',0,0, u32(0), s4('vide'), cat([u32(0),u32(0),u32(0)]), cstr('VideoHandler')), minf);
        return box('trak',
          fbox('tkhd',0,7, u32(0),u32(0), u32(1), u32(0), u32(N), u32(0),u32(0), u16(0),u16(0), u16(0),u16(0),
            MATRIX, u32(width*65536), u32(height*65536)), mdia);
      };
      const audioTrak = (aOffset)=>{
        const dsi = cat([[0x05], desclen(asc.length), [...asc]]);
        const dcdBody = cat([[0x40], [0x15], [0,0,0], u32(128000), u32(128000), dsi]);
        const dcd = cat([[0x04], desclen(dcdBody.length), dcdBody]);
        const slc = cat([[0x06], desclen(1), [0x02]]);
        const esBody = cat([u16(0), [0], dcd, slc]);
        const esDesc = cat([[0x03], desclen(esBody.length), esBody]);
        const esdsBox = fbox('esds', 0, 0, esDesc);
        const mp4a = box('mp4a', [0,0,0,0,0,0], u16(1), u32(0), u32(0), u16(aCh), u16(16), u16(0), u16(0), u32((aSR*65536)>>>0), esdsBox);
        const stts = fbox('stts',0,0, u32(1), u32(AF), u32(1024));
        const stsc = fbox('stsc',0,0, u32(1), u32(1), u32(AF), u32(1));
        const stsz = fbox('stsz',0,0, u32(0), u32(AF), cat(aSizes.map(u32)));
        const stco = fbox('stco',0,0, u32(1), u32(aOffset));
        const stbl = box('stbl', fbox('stsd',0,0, u32(1), mp4a), stts, stsc, stsz, stco);
        const minf = box('minf', fbox('smhd',0,0, u16(0), u16(0)),
          box('dinf', fbox('dref',0,0, u32(1), fbox('url ',0,1))), stbl);
        const mdia = box('mdia',
          fbox('mdhd',0,0, u32(0),u32(0), u32(aSR), u32(aSamplesTotal), u16(0x55C4), u16(0)),
          fbox('hdlr',0,0, u32(0), s4('soun'), cat([u32(0),u32(0),u32(0)]), cstr('SoundHandler')), minf);
        return box('trak',
          fbox('tkhd',0,7, u32(0),u32(0), u32(2), u32(0), u32(aDurMovie), u32(0),u32(0), u16(0),u16(0), u16(0x0100),u16(0),
            MATRIX, u32(0), u32(0)), mdia);
      };
      const buildMoov = (vOffset, aOffset)=>{
        const traks = [videoTrak(vOffset)];
        if(hasAudio) traks.push(audioTrak(aOffset));
        return box('moov',
          fbox('mvhd',0,0, u32(0),u32(0), u32(fps), u32(movieDur), u32(0x00010000), u16(0x0100), u16(0),
            cat([u32(0),u32(0)]), MATRIX, cat([u32(0),u32(0),u32(0),u32(0),u32(0),u32(0)]), u32(hasAudio?3:2)),
          ...traks);
      };
      const moov0 = buildMoov(0, 0);
      const vOffset = ftyp.length + moov0.length + mdatH.length;
      const aOffset = vOffset + vBytes;
      const moov = buildMoov(vOffset, aOffset);
      return new Blob([Uint8Array.from(ftyp), Uint8Array.from(moov), Uint8Array.from(mdatH), ...chunks, ...aChunks], {type:'video/mp4'});
    }
  };
}

async function pickH264(w, h, bitrate, fps){
  // constrained-baseline first (no B-frames, no ctts needed), then main, then high; several levels so one fits the resolution
  const codecs = [
    'avc1.42E028','avc1.42E029','avc1.42E02A','avc1.42E032','avc1.42E033','avc1.42E034',
    'avc1.4D4028','avc1.4D402A','avc1.4D4032','avc1.4D4034',
    'avc1.640028','avc1.64002A','avc1.640032','avc1.640034'
  ];
  for(const codec of codecs){
    try{
      const s = await VideoEncoder.isConfigSupported({codec, width:w, height:h, bitrate, framerate:fps});
      if(s && s.supported) return codec;
    }catch(_){}
  }
  return null;
}

async function pickCodec(w, h, bitrate, fps){
  const tries = [['vp09.00.10.08','V_VP9'], ['vp8','V_VP8']];
  for(const [codec, idc] of tries){
    try{
      const s = await VideoEncoder.isConfigSupported({codec, width:w, height:h, bitrate, framerate:fps});
      if(s.supported) return [codec, idc];
    }catch(_){}
  }
  return null;
}

hqBtn.addEventListener('click', async ()=>{
  if(exporting){ hqAbort = true; return; }
  if(recorder){ toast('stop the live recording first'); return; }
  if(typeof VideoEncoder === 'undefined'){ toast('WebCodecs not supported in this browser'); return; }

  const fps  = +$('recFps').value;
  const mbps = +$('recQ').value;
  const lenSel = $('recLen').value;
  const fmt = $('recFmt') ? $('recFmt').value : 'webm';
  // can we sync + mux the loaded audio file? if so, export starts at the scrubber position
  const canSyncAudio = fmt === 'mp4' && state.audioOn && state.audioMode === 'file' && AUD.file
    && $('hqSyncAudio') && $('hqSyncAudio').checked
    && typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined'
    && AUD.mediaEl && isFinite(AUD.mediaEl.duration);
  const startTime = canSyncAudio ? Math.max(0, AUD.mediaEl.currentTime || 0) : 0;
  const period = state.flip ? 2 : 1;
  let dur;
  if(lenSel === 'manual'){
    if(canSyncAudio){ dur = Math.max(0.2, AUD.mediaEl.duration - startTime); }   // scrub position -> end of track
    else { toast('manual length is live-record only \u2014 pick a duration (or load an audio file + MP4 to export from the scrubber to the end of the track)'); return; }
  } else if(lenSel === 'loop1' || lenSel === 'loop2'){
    const L = loopSeconds();
    if(!L){ toast('set a non-zero drift for loop export'); return; }
    dur = L * (lenSel === 'loop2' ? 2 : 1);
  } else dur = +lenSel;
  const frames = Math.max(1, Math.round(dur * fps));

  /* exact per-frame clock steps: loops close by construction */
  let phaseStep;
  if(lenSel === 'loop1')      phaseStep = period / frames;
  else if(lenSel === 'loop2') phaseStep = 2 * period / frames;
  else                        phaseStep = (1/fps) * state.drift * 0.6;
  const spinStep = (1/fps) * state.spin * 0.5;
  const waveStep = (1/fps) * state.wobble * 1.5;

  /* target size at current aspect, even dims, capped */
  const arNow = canvas.width / Math.max(1, canvas.height);
  const cap = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 4096);
  let eh = +$('hqSize').value;
  let ew = Math.round(eh * arNow);
  const shrink = Math.min(1, cap / Math.max(ew, eh));
  ew = Math.floor(ew * shrink / 2) * 2;
  eh = Math.floor(eh * shrink / 2) * 2;

  let mux, codec, codecId, ext, cfg;
  if(fmt === 'mp4'){
    codec = await pickH264(ew, eh, mbps*1e6, fps);
    if(!codec){ toast('H.264 (MP4) not supported here - use WebM'); return; }
    mux = new MP4Muxer(ew, eh, fps); codecId = codec; ext = 'mp4';
    cfg = {codec, width:ew, height:eh, bitrate:mbps*1e6, framerate:fps, avc:{format:'avc'}};
  } else {
    const picked = await pickCodec(ew, eh, mbps*1e6, fps);
    if(!picked){ toast('no supported video codec (VP9/VP8)'); return; }
    codec = picked[0]; codecId = picked[1];
    mux = new WebMMuxer(ew, eh, codecId); ext = 'webm';
    cfg = {codec, width:ew, height:eh, bitrate:mbps*1e6, framerate:fps};
  }
  // --- synced audio: decode the file + AAC encoder (MP4 + file source only; any failure => silent video) ---
  let audioEncoder = null, offlineSampler = null, syncAudio = false, audioBuffer = null, audioCh = 2;
  const wantAudio = canSyncAudio;
  let encErr = null;
  if(wantAudio){
    try {
      const abuf = await AUD.file.arrayBuffer();
      const dctx = new (window.AudioContext || window.webkitAudioContext)();
      audioBuffer = await dctx.decodeAudioData(abuf.slice(0));
      try { dctx.close(); } catch(_){}
      audioCh = Math.min(2, audioBuffer.numberOfChannels);
      const asr = audioBuffer.sampleRate;
      const sup = await AudioEncoder.isConfigSupported({ codec:'mp4a.40.2', sampleRate:asr, numberOfChannels:audioCh, bitrate:128000 });
      if(sup && sup.supported){
        mux.setAudio(asr, audioCh);
        audioEncoder = new AudioEncoder({ output:(c,meta)=>mux.addAudio(c,meta), error:e=>{ encErr = e; } });
        audioEncoder.configure({ codec:'mp4a.40.2', sampleRate:asr, numberOfChannels:audioCh, bitrate:128000 });
        const L = audioBuffer.getChannelData(0);
        const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : L;
        offlineSampler = makeOfflineAudio(L, R, asr, fps, startTime);
        syncAudio = true;
      }
    } catch(e){ syncAudio = false; audioEncoder = null; }
  }
  const encoder = new VideoEncoder({
    output: (chunk, meta) => mux.add(chunk, meta),
    error:  e => { encErr = e; }
  });
  encoder.configure(cfg);

  exporting = true; hqAbort = false;
  hqBtn.classList.add('on');
  const save = {phase, spinA, wavePh, pulsePh, swayPh, hueRotPh, glitchClock, cw:canvas.width, ch:canvas.height};
  const kfBase = kfActive() ? kfSnapshot() : null;
  canvas.width = ew; canvas.height = eh;
  if(lenSel === 'loop1' || lenSel === 'loop2') phase = 0;

  const isLoop = (lenSel === 'loop1' || lenSel === 'loop2');
  const step = ()=>{
    phase += phaseStep + (isLoop ? 0 : (1/fps) * (AR.driftRate||0) * 0.6);
    spinA += spinStep + (isLoop ? 0 : (1/fps) * (AR.spinRate||0) * 0.5);
    wavePh += waveStep + (1/fps) * (AR.wobble||0) * 1.5;
    pulsePh += (1/fps) * 1.8; swayPh += (1/fps) * 1.3;
    hueRotPh += (1/fps) * (state.hueCycle * 0.7 + (isLoop ? 0 : (AR.hueRate||0)));
    glitchClock += (1/fps);
    phase = ((phase % period) + period) % period;
  };
  const breathe = ()=> new Promise(r => requestAnimationFrame(r));

  try{
    mbInit = false;
    /* feedback: rebuild causal history at export resolution */
    if(state.rend === 5){
      ensureFB(ew, eh);
      const warm = Math.min(600, Math.max(60, Math.round(6 / (1 - state.fbAmt + 0.001))));
      for(let i = 0; i < warm && !hqAbort; i++){
        renderScene(ew, eh);
        if(state.mblur > 0.001) motionBlurPass(ew, eh, state.mblur);
        step();
        if(i % 15 === 0){ hqBtn.textContent = `warmup ${i}/${warm}`; await breathe(); }
      }
      if(lenSel === 'loop1' || lenSel === 'loop2') phase = 0;
    }

    let rendered = 0;
    for(let n = 0; n < frames && !hqAbort && !encErr; n++){
      if(kfBase) kfApply(kfExportU(n, frames));
      if(syncAudio){ const A = offlineSampler(n); AUD.bass=A.bass; AUD.mid=A.mid; AUD.treble=A.treble; AUD.level=A.level; AUD.beat=A.beat; AR = audioRoutes(); } else { AR = {}; }
      arBurst = AR.burst || 0;
      if(syncAudio) applyAR();
      renderScene(ew, eh);
      const mbAmt = state.mblur;
      if(syncAudio) restoreAR();
      if(mbAmt > 0.001) motionBlurPass(ew, eh, mbAmt);
      const vf = new VideoFrame(canvas, {
        timestamp: Math.round(n * 1e6 / fps),
        duration:  Math.round(1e6 / fps)
      });
      encoder.encode(vf, { keyFrame: n % (fps * 2) === 0 });
      vf.close();
      rendered = n + 1;
      step();
      while(encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 1));
      if(n % 5 === 0){
        hqBtn.textContent = `\u25cf ${n}/${frames} \u2014 tap to stop`;
        await breathe();
      }
    }

    if(rendered > 0 && !encErr){
      hqBtn.textContent = 'encoding\u2026';
      await encoder.flush();
      encoder.close();
      if(syncAudio && audioEncoder && !encErr){
        hqBtn.textContent = 'audio\u2026';
        const asr = audioBuffer.sampleRate;
        const L = audioBuffer.getChannelData(0);
        const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : L;
        const startSample = Math.floor(startTime * asr);
        const outDur = Math.min(dur, rendered / fps);
        const total = Math.max(0, Math.min(L.length - startSample, Math.ceil(outDur * asr)));
        const FR = 1024;
        for(let off = 0; off < total && !encErr; off += FR){
          const cnt = Math.min(FR, total - off);
          const src = startSample + off;
          const data = new Float32Array(cnt * audioCh);
          for(let i = 0; i < cnt; i++){ data[i] = L[src+i] || 0; if(audioCh > 1) data[cnt + i] = R[src+i] || 0; }
          const ad = new AudioData({ format:'f32-planar', sampleRate:asr, numberOfFrames:cnt, numberOfChannels:audioCh, timestamp: Math.round(off / asr * 1e6), data });
          audioEncoder.encode(ad); ad.close();
          if((off / FR) % 64 === 0) await breathe();
        }
        await audioEncoder.flush(); audioEncoder.close();
      }
      const blob = mux.finish();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `catoptron-hq-${Date.now()}.${ext}`;
      a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
      toast(`HQ export: ${ew}\u00d7${eh}, ${rendered} frames${hqAbort ? ' (stopped early)' : ''}, ${ext.toUpperCase()}${syncAudio ? ' + audio' : ''}`);
    } else {
      try{ encoder.close(); }catch(_){}
      toast(encErr ? 'encoder error \u2014 try a lower resolution' : 'HQ export cancelled (no frames)');
    }
  } catch(err){
    try{ encoder.close(); }catch(_){}
    toast('HQ export failed');
  } finally {
    restoreAR();
    canvas.width = save.cw; canvas.height = save.ch;
    phase = save.phase; spinA = save.spinA; wavePh = save.wavePh;
    pulsePh = save.pulsePh; swayPh = save.swayPh; hueRotPh = save.hueRotPh; glitchClock = save.glitchClock;
    exporting = false;
    if(kfBase) kfRestore(kfBase);
    hqBtn.classList.remove('on');
    hqBtn.textContent = 'HQ Video';
  }
});

/* ================= export PNG — single best path: SSAA + full-res feedback ================= */
$('exportBtn').addEventListener('click', async ()=>{
  if(recorder){ toast('stop recording first'); return; }
  if(exporting){ toast('HQ export in progress'); return; }
  const btn = $('exportBtn');
  const cap = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 8192);
  const pw = canvas.width, ph2 = canvas.height;   // live framing
  const sizeSel = $('exportSize').value;
  let ow, oh;
  if(sizeSel.charAt(0) === 'h'){        // fixed output height in px
    const th0 = parseInt(sizeSel.slice(1), 10);
    oh = th0; ow = Math.round(th0 * (pw / Math.max(1, ph2)));
  } else {                              // multiplier of the live framing
    const scale = parseFloat(sizeSel.slice(1)) || 1;
    ow = Math.round(pw * scale); oh = Math.round(ph2 * scale);
  }
  const s = Math.min(1, cap / Math.max(ow, oh));
  ow = Math.max(2, Math.round(ow * s)); oh = Math.max(2, Math.round(oh * s));
  const ss = (Math.max(ow, oh) * 2 <= cap) ? 2 : 1;   // 2× supersample for AA when it still fits
  const rw = ow * ss, rh = oh * ss;

  exporting = true;
  const save = {phase, spinA, wavePh, pulsePh, swayPh, hueRotPh, glitchClock};
  btn.textContent = 'rendering\u2026';
  try{
    canvas.width = rw; canvas.height = rh;
    if(state.rend === 5){
      /* feedback history is causal — rebuild it at render resolution so it exports at full res */
      ensureFB(rw, rh);
      const period = state.flip ? 2 : 1;
      const warm = Math.min(600, Math.max(60, Math.round(6 / (1 - state.fbAmt + 0.001))));
      for(let i = 0; i < warm; i++){
        renderScene(rw, rh);
        phase  += (1/60) * state.drift * 0.6;
        spinA  += (1/60) * state.spin * 0.5;
        wavePh += (1/60) * state.wobble * 1.5;
        pulsePh += (1/60) * 1.8; swayPh += (1/60) * 1.3; hueRotPh += (1/60) * state.hueCycle * 0.7; glitchClock += (1/60);
        phase = ((phase % period) + period) % period;
        if(i % 20 === 0){ btn.textContent = `warmup ${i}/${warm}`; await new Promise(r => requestAnimationFrame(r)); }
      }
    }
    renderScene(rw, rh);

    let blob;
    if(ss === 1){
      /* already full render resolution: read the GL canvas directly */
      blob = await new Promise((res, rej)=> canvas.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/png'));
    } else {
      /* 2:1 supersample downsample for anti-aliasing */
      const out = document.createElement('canvas');
      out.width = ow; out.height = oh;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, ow, oh);
      blob = await new Promise((res, rej)=> out.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/png'));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `catoptron-${Date.now()}.png`;
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
    toast(`exported ${ow}\u00d7${oh}${ss === 2 ? ' (2\u00d7 SSAA)' : ''}`);
  } catch(_){
    toast('export failed');
  } finally {
    canvas.width = pw; canvas.height = ph2;
    phase = save.phase; spinA = save.spinA; wavePh = save.wavePh;
    pulsePh = save.pulsePh; swayPh = save.swayPh; hueRotPh = save.hueRotPh; glitchClock = save.glitchClock;
    exporting = false;
    btn.textContent = 'Export PNG';
  }
});


// ── user guide overlay ───────────────────────────────────────────────
(function(){
  const ov = document.getElementById('helpOverlay');
  if(!ov) return;
  const open  = ()=> ov.classList.add('show');
  const close = ()=> ov.classList.remove('show');
  const btn = document.getElementById('helpBtn');   if(btn) btn.addEventListener('click', open);
  const x   = document.getElementById('helpClose'); if(x)   x.addEventListener('click', close);
  ov.addEventListener('click', e=>{ if(e.target === ov) close(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && ov.classList.contains('show')) close(); });
})();


// ===================== KEYFRAME ANIMATION =====================
let keyframes = [];
let kfPlaying = false, kfTime = 0, kfDuration = 6, kfSeamless = true, kfSel = -1;
const KF_LERP  = ['depth','step','twist','shiftX','shiftY','zoom','frame','frameW','tintA','hue','chroma','ripple','vign','grain','drift','spin','wobble','rot','fbAmt','cx','cy'];
const KF_COLOR = ['tint','ccTint'];
const KF_SNAP  = ['rend','ccMode','aspect','src','seed','flip'];
const _klerp = (a,b,f)=> a + (b-a)*f;
function _khexRGB(x){ x=(x||'#000000').replace('#',''); if(x.length===3) x=x.split('').map(c=>c+c).join(''); return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]; }
function _krgbHex(r,g,b){ const c=v=>('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2); return '#'+c(r)+c(g)+c(b); }
function _khexLerp(a,b,f){ const A=_khexRGB(a),B=_khexRGB(b); return _krgbHex(_klerp(A[0],B[0],f),_klerp(A[1],B[1],f),_klerp(A[2],B[2],f)); }

function kfSnapshot(){
  const s = { stack: state.stack.map(fd=>({t:fd.t, p:fd.p.slice(), o:(fd.o||[0,0]).slice(), rot:(fd.rot||0)})) };
  KF_LERP.forEach(k=> s[k]=state[k]);
  KF_COLOR.forEach(k=> s[k]=state[k]);
  KF_SNAP.forEach(k=> s[k]=state[k]);
  return s;
}
function kfActive(){ return keyframes.length >= 2; }

function kfRestore(kf){
  state.stack = kf.stack.map(fd=>({t:fd.t, p:fd.p.slice(), o:(fd.o||[0,0]).slice(), rot:(fd.rot||0)}));
  KF_LERP.forEach(k=> state[k]=kf[k]);
  KF_COLOR.forEach(k=> state[k]=kf[k]);
  KF_SNAP.forEach(k=> state[k]=kf[k]);
  if(typeof GENS!=='undefined' && GENS[state.src]) applySource();
  syncUI();
}

function kfApply(u){
  const n = keyframes.length;
  if(n === 0) return;
  if(n === 1){ kfWriteLerp(keyframes[0], keyframes[0], 0); return; }
  const segs = kfSeamless ? n : (n - 1);
  let x = u * segs;
  if(!kfSeamless) x = Math.max(0, Math.min(segs - 1e-6, x));
  const i = Math.floor(x), f = x - i;
  kfWriteLerp(keyframes[((i%n)+n)%n], keyframes[(((i+1)%n)+n)%n], f);
}
function kfWriteLerp(a, b, f){
  KF_LERP.forEach(k=> state[k] = _klerp(a[k], b[k], f));
  state.depth = Math.round(state.depth);
  KF_COLOR.forEach(k=> state[k] = _khexLerp(a[k], b[k], f));
  KF_SNAP.forEach(k=> state[k] = a[k]);
  for(let i=0;i<state.stack.length;i++){
    const fa=a.stack[i], fb=b.stack[i], sf=state.stack[i];
    if(!fa || sf.t !== fa.t) continue;
    const spec = OPS[fa.t] ? OPS[fa.t].params : [];
    const canLerp = fb && fb.t===fa.t && fb.p.length===fa.p.length;
    for(let pi=0; pi<fa.p.length; pi++){
      const discrete = spec[pi] && Array.isArray(spec[pi][5]);
      sf.p[pi] = (canLerp && !discrete) ? _klerp(fa.p[pi], fb.p[pi], f) : fa.p[pi];
    }
    if(!sf.o) sf.o=[0,0];
    if(canLerp && fa.o && fb.o){ sf.o[0]=_klerp(fa.o[0],fb.o[0],f); sf.o[1]=_klerp(fa.o[1],fb.o[1],f); }
    else if(fa.o){ sf.o[0]=fa.o[0]; sf.o[1]=fa.o[1]; }
    sf.rot = canLerp ? _klerp(fa.rot||0, fb.rot||0, f) : (fa.rot||0);
  }
}
function kfTick(dt){
  if(!kfActive()){ kfPlaying=false; kfSyncPlayBtn(); return; }
  kfTime += dt / Math.max(0.1, kfDuration);
  if(kfSeamless){ kfTime = ((kfTime%1)+1)%1; }
  else if(kfTime >= 1){ kfTime = 1; kfApply(1); kfStop(); kfScrubUI(); return; }
  kfApply(kfTime);
  kfScrubUI();
}
function kfStop(){ kfPlaying=false; kfSyncPlayBtn(); syncUI(); }
function kfExportU(n, frames){ return kfSeamless ? (n / Math.max(1,frames)) : (n / Math.max(1, frames-1)); }

function kfRenderList(){
  const box = document.getElementById('kfList'); if(!box) return;
  box.innerHTML = '';
  if(keyframes.length === 0){ box.innerHTML = '<span class="kf-empty">No keyframes — press ◆ Key (top bar) to capture the current look</span>'; return; }
  keyframes.forEach((kf, i)=>{
    const chip = document.createElement('button');
    chip.className = 'kf-chip' + (i===kfSel ? ' sel' : '');
    chip.textContent = (i+1);
    chip.title = 'Jump to keyframe ' + (i+1);
    chip.addEventListener('click', ()=>{ kfSel=i; kfPlaying=false; kfSyncPlayBtn(); kfRestore(keyframes[i]); kfRenderList(); toast('keyframe '+(i+1)); });
    box.appendChild(chip);
  });
}
function kfSyncPlayBtn(){ const b=document.getElementById('kfPlay'); if(b){ b.innerHTML = kfPlaying ? '⏸ Pause' : '▶ Play'; b.classList.toggle('on', kfPlaying); } }
function kfScrubUI(){ const s=document.getElementById('kfScrub'); if(s && document.activeElement!==s) s.value = Math.round(kfTime*1000); }

function kfAdd(){ keyframes.push(kfSnapshot()); kfSel = keyframes.length-1; kfRenderList(); toast('keyframe '+keyframes.length+' set'); }
function kfDup(){ if(kfSel<0){ if(keyframes.length) kfSel=keyframes.length-1; else return; } const c=JSON.parse(JSON.stringify(keyframes[kfSel])); keyframes.splice(kfSel+1,0,c); kfSel++; kfRenderList(); toast('duplicated'); }
function kfDel(){ if(kfSel<0||!keyframes.length) return; keyframes.splice(kfSel,1); if(kfSel>=keyframes.length) kfSel=keyframes.length-1; kfRenderList(); toast('removed'); }

(function kfWire(){
  const on=(id,ev,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener(ev,fn); };
  on('kfSetBtn','click', kfAdd);
  on('kfAdd','click', kfAdd);
  on('kfDup','click', kfDup);
  on('kfDel','click', kfDel);
  on('kfPlay','click', ()=>{
    if(!kfActive()){ toast('set at least 2 keyframes'); return; }
    kfPlaying = !kfPlaying;
    if(kfPlaying && kfTime >= 1) kfTime = 0;
    kfSyncPlayBtn();
    if(!kfPlaying) syncUI();
  });
  on('kfSeam','click', ()=>{ kfSeamless=!kfSeamless; const b=document.getElementById('kfSeam'); if(b) b.classList.toggle('on', kfSeamless); });
  on('kfDur','input', e=>{ kfDuration=+e.target.value; const v=document.getElementById('kfDurV'); if(v) v.textContent=(+e.target.value).toFixed(1)+'s'; });
  on('kfScrub','input', e=>{ if(!kfActive()) return; kfPlaying=false; kfSyncPlayBtn(); kfTime=(+e.target.value)/1000; kfApply(kfTime); });
  kfRenderList(); kfSyncPlayBtn();
  const b=document.getElementById('kfSeam'); if(b) b.classList.toggle('on', kfSeamless);
})();


// regenerate the source when its knobs change (rAF-throttled so heavy generators stay responsive)
let _srcPending = false;
function scheduleSource(){ if(_srcPending) return; _srcPending = true; requestAnimationFrame(()=>{ _srcPending = false; if(GENS[state.src]) applySource(); }); }
['srcScale','srcHue','srcVar'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input', scheduleSource); });


// ===================== UNDO / REDO + COLLAPSIBLE SECTIONS =====================
let _undo = [], _redo = [], _histTimer = null, _histLast = '';
function _histSnap(){ return JSON.stringify(state); }
function pushHistory(){
  if(kfPlaying) return;                       // don't record keyframe playback frames
  const j = _histSnap();
  if(j === _histLast) return;                 // nothing changed
  _undo.push(j); if(_undo.length > 80) _undo.shift();
  _redo.length = 0; _histLast = j;
}
function scheduleHistory(){ if(_histTimer) clearTimeout(_histTimer); _histTimer = setTimeout(()=>{ _histTimer = null; pushHistory(); }, 450); }
function _histApply(j){
  const snap = JSON.parse(j);
  Object.keys(state).forEach(k=>{ if(!(k in snap)) delete state[k]; });
  Object.assign(state, snap);
  if(GENS[state.src]) applySource();
  syncUI();
  _histLast = _histSnap();
}
function undo(){
  if(_histTimer){ clearTimeout(_histTimer); _histTimer = null; pushHistory(); }
  if(_undo.length < 2){ toast('nothing to undo'); return; }
  _redo.push(_undo.pop());
  _histApply(_undo[_undo.length - 1]); toast('undo');
}
function redo(){
  if(!_redo.length){ toast('nothing to redo'); return; }
  const j = _redo.pop(); _undo.push(j); _histApply(j); toast('redo');
}
(function _wireUndoCollapse(){
  ['panelL','panelR'].forEach(id=>{ const el = document.getElementById(id); if(el){ el.addEventListener('input', scheduleHistory); el.addEventListener('change', scheduleHistory); } });
  const u = document.getElementById('undoBtn'); if(u) u.addEventListener('click', undo);
  const r = document.getElementById('redoBtn'); if(r) r.addEventListener('click', redo);
  document.querySelectorAll('.group > h2').forEach(h2=> h2.addEventListener('click', ()=> h2.parentElement.classList.toggle('collapsed')));
  pushHistory();   // seed initial state
})();


// record-format button label
(function(){ const f = document.getElementById('recFmt'), b = document.getElementById('recBtn');
  if(!f || !b) return; const upd = ()=>{ b.textContent = 'Record ' + (f.value === 'mp4' ? 'MP4' : 'WebM'); };
  f.addEventListener('change', upd); upd();
})();


// ---- mobile layout: pin canvas above controls, collapse sections ----
(function __mobileLayout(){
  const mq = window.matchMedia('(max-width:760px)');
  const main = document.querySelector('main');
  const stage = document.getElementById('stage');
  const pL = document.getElementById('panelL');
  const pR = document.getElementById('panelR');
  const timeline = document.getElementById('timeline');
  if(!main || !stage || !pL || !pR) return;
  function order(){
    if(mq.matches){
      if(main.firstElementChild !== stage) main.insertBefore(stage, pL);   // canvas first
      if(timeline && timeline.parentElement !== main) main.appendChild(timeline); // Animation flows as a section
    } else {
      if(stage.previousElementSibling !== pL || stage.nextElementSibling !== pR) main.insertBefore(stage, pR); // panelL, stage, panelR
      if(timeline && timeline.parentElement === main){ main.parentElement.insertBefore(timeline, main.nextElementSibling); timeline.classList.remove('tl-collapsed'); } // back to bottom bar
    }
    if(typeof fitCanvas === 'function') fitCanvas();
  }
  order();
  if(mq.addEventListener) mq.addEventListener('change', order); else if(mq.addListener) mq.addListener(order);
  if(timeline){ const tlH2 = timeline.querySelector('h2'); if(tlH2) tlH2.addEventListener('click', ()=> timeline.classList.toggle('tl-collapsed')); }
  if(mq.matches){ document.querySelectorAll('.group').forEach(g=> g.classList.add('collapsed')); if(timeline) timeline.classList.add('tl-collapsed'); }
  let __rt; const __refit = ()=>{ clearTimeout(__rt); __rt = setTimeout(()=>{ if(typeof fitCanvas === 'function') fitCanvas(); }, 200); };
  window.addEventListener('resize', __refit);
  window.addEventListener('orientationchange', __refit);
})();


// ===================== LIVE CAMERA INPUT =====================
let camStream = null, camActive = false, camFacing = 'environment', _preCameraSrc = 'orbs';
const camVideo = document.getElementById('camVideo');
async function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('camera not supported here'); revertSrc(); return; }
  try{
    if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing }, audio: false });
    if(camVideo){ camVideo.srcObject = camStream; camVideo.muted = true; camVideo.setAttribute('playsinline',''); await camVideo.play().catch(()=>{}); }
    camActive = true;
    const cr = document.getElementById('camRow'); if(cr) cr.style.display = '';
    const sp = document.getElementById('srcParams'); if(sp) sp.style.display = 'none';
    toast('camera live \u00b7 ' + (camFacing === 'user' ? 'front' : 'back'));
  }catch(err){
    const why = (err && err.name === 'NotAllowedError') ? 'blocked/denied — close floating app bubbles, allow camera, then retry'
              : (err && err.name === 'NotFoundError') ? 'no camera found'
              : (err && err.message) || 'error';
    toast('camera: ' + why);
    camActive = false; revertSrc();
  }
}
function stopCamera(){
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
  if(camVideo) camVideo.srcObject = null;
  camActive = false;
  const cr = document.getElementById('camRow'); if(cr) cr.style.display = 'none';
}
function revertSrc(){
  state.src = (_preCameraSrc && _preCameraSrc !== 'camera') ? _preCameraSrc : 'orbs';
  const sel = document.getElementById('srcSel'); if(sel) sel.value = state.src;
  const sp = document.getElementById('srcParams'); if(sp) sp.style.display = (GENS[state.src]) ? '' : 'none';
  if(GENS[state.src]) applySource();
}
async function flipCamera(){ if(!camActive) return; camFacing = (camFacing === 'environment') ? 'user' : 'environment'; await startCamera(); }
(function(){ const b = document.getElementById('camFlip'); if(b) b.addEventListener('click', flipCamera); })();


// ===================== FULLSCREEN + WAKE LOCK =====================
let _wakeLock = null;
async function _acquireWake(){ try{ if('wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen'); }catch(_){}}
function _releaseWake(){ if(_wakeLock){ _wakeLock.release().catch(()=>{}); _wakeLock = null; } }
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible' && document.fullscreenElement) _acquireWake(); });
function toggleFullscreen(){
  const el = document.documentElement;
  if(!document.fullscreenElement && !document.webkitFullscreenElement){
    if(el.requestFullscreen) el.requestFullscreen().catch(()=>toast('fullscreen unavailable'));
    else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else toast('fullscreen not supported here');
  } else {
    if(document.exitFullscreen) document.exitFullscreen();
    else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}
function _onFsChange(){
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if(fs) _acquireWake(); else _releaseWake();
  const b = document.getElementById('fsBtn'); if(b) b.classList.toggle('on', fs);
  if(typeof fitCanvas === 'function') setTimeout(fitCanvas, 120);
}
document.addEventListener('fullscreenchange', _onFsChange);
document.addEventListener('webkitfullscreenchange', _onFsChange);
(function(){ const b = document.getElementById('fsBtn'); if(b) b.addEventListener('click', toggleFullscreen); })();

// ===================== CAMERA FREEZE-FRAME =====================
function freezeCamera(){
  if(!camActive || !camVideo || !camVideo.videoWidth){ toast('camera not live'); return; }
  const cv = document.createElement('canvas');
  cv.width = camVideo.videoWidth; cv.height = camVideo.videoHeight;
  cv.getContext('2d').drawImage(camVideo, 0, 0);
  setImage(cv, cv.width, cv.height);
  stopCamera();
  state.src = 'user';
  const sel = document.getElementById('srcSel'); if(sel) sel.value = 'user';
  toast('frozen \u00b7 now a still image');
  if(typeof pushHistory === 'function') pushHistory();
}
(function(){ const b = document.getElementById('freezeBtn'); if(b) b.addEventListener('click', freezeCamera); })();
