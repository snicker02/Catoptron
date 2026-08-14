/* draw.js — spline strokes for the Draw source.
   Strokes are stored as NORMALISED points (0..1) plus style, so they are
   resolution-independent: the same stroke list rasterises crisply at 1024 for the
   live view or at export resolution for an HQ render, and serialises into presets
   as compact vector data.

   Smoothing: raw pointer samples are decimated (points closer than MIN_STEP are
   dropped — this is what removes hand jitter), then a Catmull-Rom spline is fitted
   through the survivors and converted to cubic Béziers. Catmull-Rom passes THROUGH
   its control points, so the line follows what you actually drew while staying C1
   smooth — unlike a plain Bézier fit, which would drift off the stroke. */

const MIN_STEP = 0.004;    // normalised distance below which a new sample is ignored

export function newStroke(style){
  return { pts: [], color: style.color, width: style.width, alpha: style.alpha, cap: style.cap || 'round' };
}

export function addPoint(stroke, x, y, force){
  const p = stroke.pts;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  if(!force && p.length){
    const last = p[p.length - 1];
    const dx = x - last[0], dy = y - last[1];
    if(dx * dx + dy * dy < MIN_STEP * MIN_STEP) return false;
  }
  p.push([x, y]);
  return true;
}

/* Catmull-Rom (centripetal-ish, uniform) -> cubic Bézier control points. */
function splinePath(ctx, pts, S){
  const n = pts.length;
  if(n === 0) return;
  const X = i => pts[Math.max(0, Math.min(n - 1, i))][0] * S;
  const Y = i => pts[Math.max(0, Math.min(n - 1, i))][1] * S;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  if(n === 1){ ctx.lineTo(X(0) + 0.01, Y(0)); return; }
  if(n === 2){ ctx.lineTo(X(1), Y(1)); return; }
  for(let i = 0; i < n - 1; i++){
    const x0 = X(i - 1), y0 = Y(i - 1);
    const x1 = X(i),     y1 = Y(i);
    const x2 = X(i + 1), y2 = Y(i + 1);
    const x3 = X(i + 2), y3 = Y(i + 2);
    ctx.bezierCurveTo(
      x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6,
      x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6,
      x2, y2
    );
  }
}

/* Draw every stroke into a square 2D context of side S. */
export function renderStrokes(ctx, strokes, S, bg){
  ctx.save();
  ctx.clearRect(0, 0, S, S);
  if(bg && bg !== 'transparent'){ ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S); }
  ctx.lineJoin = 'round';
  for(const st of strokes){
    if(!st.pts || !st.pts.length) continue;
    ctx.globalAlpha = st.alpha == null ? 1 : st.alpha;
    ctx.strokeStyle = st.color;
    ctx.lineCap = st.cap || 'round';
    ctx.lineWidth = Math.max(0.5, st.width * S);
    if(st.pts.length === 1){                       // a dot
      ctx.beginPath();
      ctx.arc(st.pts[0][0] * S, st.pts[0][1] * S, ctx.lineWidth * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = st.color; ctx.fill();
      continue;
    }
    splinePath(ctx, st.pts, S);
    ctx.stroke();
  }
  ctx.restore();
}

/* Total point count — handy for status text / guarding huge drawings. */
export function strokeStats(strokes){
  let pts = 0;
  for(const s of strokes) pts += (s.pts ? s.pts.length : 0);
  return { strokes: strokes.length, points: pts };
}
