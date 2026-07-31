// Browser program cache. Assembled FS string -> linked program, with per-program uniform
// locations resolved once (each assembled program has its own locations). Keyed by stack
// signature: param tweaks reuse, only a new type/order/renderer signature compiles.
// The very first program compiles synchronously (instant startup); later ones link async via
// KHR_parallel_shader_compile when available, so reordering a fold never stalls the frame loop.
import { assemble, signature } from './assemble.js';

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

export function createProgramCache(gl, uniformNames){
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const cache = new Map();          // sig -> entry
  let seededOnce = false;           // first program blocks so we never show a blank frame
  let vs = null;

  function vshader(){
    if(vs) return vs;
    vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VS); gl.compileShader(vs);
    return vs;
  }
  function build(stack, rend){
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, assemble(stack, rend)); gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vshader());
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return { prog, fs, ready:false, error:null, locs:null, aPos:-1 };
  }
  function done(entry){
    if(ext) return !!gl.getProgramParameter(entry.prog, ext.COMPLETION_STATUS_KHR);
    return true;                    // no extension: link was synchronous
  }
  function finalize(entry){
    if(entry.ready) return;
    if(!gl.getShaderParameter(entry.fs, gl.COMPILE_STATUS))
      entry.error = 'compile: ' + gl.getShaderInfoLog(entry.fs);
    else if(!gl.getProgramParameter(entry.prog, gl.LINK_STATUS))
      entry.error = 'link: ' + gl.getProgramInfoLog(entry.prog);
    else {
      entry.locs = {};
      for(const n of uniformNames) entry.locs[n] = gl.getUniformLocation(entry.prog, n);
      entry.aPos = gl.getAttribLocation(entry.prog, 'aPos');
    }
    entry.ready = true;
  }

  return {
    // { entry, ready, error, hit }. When not ready, the caller keeps drawing the last program.
    request(stack, rend){
      const sig = signature(stack, rend);
      let entry = cache.get(sig), hit = true;
      if(!entry){
        hit = false;
        entry = build(stack, rend);
        entry.sig = sig;
        cache.set(sig, entry);
        if(!seededOnce){ finalize(entry); seededOnce = true; }   // first ever: block
      }
      if(!entry.ready && done(entry)) finalize(entry);
      return { entry, ready: entry.ready && !entry.error, error: entry.error, hit };
    },
    has(stack, rend){ return cache.has(signature(stack, rend)); },
    prewarm(stack, rend){ this.request(stack, rend); },
    size(){ return cache.size; }
  };
}
