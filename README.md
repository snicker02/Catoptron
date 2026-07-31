# Hall of Mirrors — lite (deployable)

Working, module-split build ready for GitHub Pages. Same UI, renderers, feedback,
presets, recording and export as before; the fold shader is now **assembled at runtime**
from only the operators in your stack (see `engine/`), which is what lets the operator
library grow without hitting the WebGL1 compile ceiling.

This lite build ships **15 operators** (the ones validated end-to-end). Adding the rest is
mechanical — one record each in `engine/ops.js` — and does not touch anything else.

## Files
```
index.html        markup + CSS, loads main.js as a module
main.js           UI, render loop, presets, recording, PNG/HQ export
engine/
  prelude.js      shared uniforms + sampling/shading GLSL
  helpers.js      GLSL math helpers (complex arithmetic, hyperbolics, ...)
  ops.js          operator registry (UI params + GLSL together) — the file that grows
  assemble.js     per-stack shader assembly + the 6 renderer bodies
  glcache.js      assembled string -> linked program, async parallel compile, per-program caching
```

## Put it on GitHub Pages
1. Commit these files preserving the layout (keep `engine/` as a folder next to `index.html`).
2. Repo → Settings → Pages → deploy from your branch, root.
3. Open the Pages URL. That's it — Pages serves `.js` with the right type, so the modules load.

## Test locally
ES modules don't load from `file://`, so don't double-click `index.html`. Instead, from the
repo folder:
```
python -m http.server 8000
```
then open http://localhost:8000 . (Any static server works.)

## What was validated
Every operator and all 6 renderers were compiled **and rendered** (pixel readback) through
headless ANGLE — the same `WebGL GLSL ES 1.0` path the browser uses — across 48 renderer×stack
combinations, all producing valid output. One thing only a real browser can exercise:
`KHR_parallel_shader_compile` (async recompile when you add/reorder a fold). Worth a quick check
that reordering folds stays smooth.

## Adding an operator (later)
Append one record to `engine/ops.js`:
```js
{ name:'Swirl', fn:'opSwirl', deps:[],
  params:[['Amount',-6,6,0.05,2]],
  glsl:`vec2 opSwirl(vec2 q, vec4 P){ return rot(P.x * length(q)) * q; }` },
```
Rules: `fn` must equal the GLSL function name; `deps` lists helpers from `helpers.js`
(closure pulled automatically); set one of `par` / `crack` / `p2` if the operator writes
counterchange parity, writes the crack mask, or uses the 2nd param bank. New renderer →
add a body to `RENDERERS` in `assemble.js`.
