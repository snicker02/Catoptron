/* draw.js — vector paths for the Draw source.

   A path is stored as NORMALISED points (0..1) plus style, so it is resolution
   independent: the same data rasterises crisply at any size and serialises into
   presets as compact vector data.

   Path fields:
     pts[]     control points
     tension   0 = straight polyline (hard corners) .. >1 = loose flowing curve
     closed    join last->first and allow a fill
     color, width, alpha, cap
     color2    optional second colour -> gradient along the stroke
     brush     'solid' | 'dash' | 'dot' | 'calli' | 'outline'
     taper     0..1 thin-to-thick envelope towards the ends
     fill      null | { color, color2, angle }   (only drawn when closed)
     sym       { mode:'none'|'radial'|'mirrorx'|'mirrory'|'both', k:N }
*/

const MIN_STEP = 0.004;

export function newStroke(style){
  return {
    pts: [], color: style.color, width: style.width, alpha: style.alpha,
    cap: style.cap || 'round',
    tension: style.tension == null ? 1 : style.tension,
    closed: !!style.closed,
    color2: style.color2 || null,
    brush: style.brush || 'solid',
    taper: style.taper || 0,
    fill: style.fill ? { ...style.fill } : null,
    sym: style.sym ? { ...style.sym } : { mode: 'none', k: 6 },
  };
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

/* ---------- geometry ---------- */

function idx(i, n, closed){
  if(closed) return ((i % n) + n) % n;
  return Math.max(0, Math.min(n - 1, i));
}

function splinePath(ctx, pts, S, tension, closed){
  const n = pts.length;
  if(n === 0) return;
  const T = (tension == null ? 1 : tension) / 6;
  const X = i => pts[idx(i, n, closed)][0] * S;
  const Y = i => pts[idx(i, n, closed)][1] * S;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  if(n === 1){ ctx.lineTo(X(0) + 0.01, Y(0)); return; }
  if(n === 2 && !closed){ ctx.lineTo(X(1), Y(1)); return; }
  const last = closed ? n : n - 1;
  for(let i = 0; i < last; i++){
    const x1 = X(i), y1 = Y(i), x2 = X(i + 1), y2 = Y(i + 1);
    ctx.bezierCurveTo(
      x1 + (X(i + 1) - X(i - 1)) * T, y1 + (Y(i + 1) - Y(i - 1)) * T,
      x2 - (X(i + 2) - X(i)) * T,     y2 - (Y(i + 2) - Y(i)) * T,
      x2, y2
    );
  }
  if(closed) ctx.closePath();
}

export function samplePath(pts, tension, perSeg, closed){
  const n = pts.length, T = (tension == null ? 1 : tension) / 6, k = perSeg || 12, out = [];
  if(n === 0) return out;
  if(n === 1) return [{ x: pts[0][0], y: pts[0][1], seg: 0 }];
  const X = i => pts[idx(i, n, closed)][0];
  const Y = i => pts[idx(i, n, closed)][1];
  const last = closed ? n : n - 1;
  for(let i = 0; i < last; i++){
    const x1 = X(i), y1 = Y(i), x2 = X(i + 1), y2 = Y(i + 1);
    const c1x = x1 + (X(i + 1) - X(i - 1)) * T, c1y = y1 + (Y(i + 1) - Y(i - 1)) * T;
    const c2x = x2 - (X(i + 2) - X(i)) * T,     c2y = y2 - (Y(i + 2) - Y(i)) * T;
    for(let s = 0; s <= k; s++){
      const t = s / k, u = 1 - t;
      out.push({
        x: u*u*u*x1 + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*x2,
        y: u*u*u*y1 + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*y2,
        seg: i
      });
    }
  }
  return out;
}

export function nearestNode(pts, x, y, tol){
  let best = -1, bd = tol * tol;
  for(let i = 0; i < pts.length; i++){
    const dx = pts[i][0] - x, dy = pts[i][1] - y, d = dx*dx + dy*dy;
    if(d <= bd){ bd = d; best = i; }
  }
  return best;
}

export function nearestOnPath(pts, tension, x, y, closed){
  const s = samplePath(pts, tension, 16, closed);
  let bd = Infinity, bi = 0;
  for(let i = 0; i < s.length; i++){
    const dx = s[i].x - x, dy = s[i].y - y, d = dx*dx + dy*dy;
    if(d < bd){ bd = d; bi = i; }
  }
  if(!s.length) return null;
  return { dist: Math.sqrt(bd), seg: s[bi].seg, x: s[bi].x, y: s[bi].y };
}

export function bbox(pts){
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for(const p of pts){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if(!pts.length) return { x0: 0, y0: 0, x1: 1, y1: 1, cx: 0.5, cy: 0.5 };
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* Ramer–Douglas–Peucker: turn a dense freehand trail into a few editable nodes. */
export function simplify(pts, eps){
  if(pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while(stack.length){
    const [a, b] = stack.pop();
    let md = -1, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const vx = bx - ax, vy = by - ay, vv = vx*vx + vy*vy || 1e-9;
    for(let i = a + 1; i < b; i++){
      const wx = pts[i][0] - ax, wy = pts[i][1] - ay;
      const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / vv));
      const d = Math.hypot(pts[i][0] - (ax + t*vx), pts[i][1] - (ay + t*vy));
      if(d > md){ md = d; mi = i; }
    }
    if(md > eps && mi > 0){ keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}

/* ---------- symmetry ---------- */

function symTransforms(sym){
  const out = [p => p];
  if(!sym || sym.mode === 'none') return out;
  const mx = p => [1 - p[0], p[1]];
  const my = p => [p[0], 1 - p[1]];
  if(sym.mode === 'mirrorx') return [p => p, mx];
  if(sym.mode === 'mirrory') return [p => p, my];
  if(sym.mode === 'both')    return [p => p, mx, my, p => my(mx(p))];
  if(sym.mode === 'radial'){
    const k = Math.max(2, Math.min(24, sym.k || 6)), list = [];
    for(let i = 0; i < k; i++){
      const a = (Math.PI * 2 * i) / k, c = Math.cos(a), s = Math.sin(a);
      list.push(p => {
        const dx = p[0] - 0.5, dy = p[1] - 0.5;
        return [0.5 + dx*c - dy*s, 0.5 + dx*s + dy*c];
      });
    }
    return list;
  }
  return out;
}

/* ---------- rendering ---------- */

function makeGrad(ctx, pts, S, c1, c2, angleDeg){
  const b = bbox(pts);
  const a = (angleDeg || 0) * Math.PI / 180;
  const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.5 + 1e-4;
  const g = ctx.createLinearGradient(
    (b.cx - Math.cos(a) * r) * S, (b.cy - Math.sin(a) * r) * S,
    (b.cx + Math.cos(a) * r) * S, (b.cy + Math.sin(a) * r) * S
  );
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  return g;
}

/* Segment-by-segment stroking, used when the width varies along the path. */
function strokeVarying(ctx, samples, S, baseW, st){
  const n = samples.length;
  if(n < 2) return;
  const nib = Math.PI * 0.25;                     // calligraphic nib angle
  for(let i = 0; i < n - 1; i++){
    const a = samples[i], b = samples[i + 1];
    const t = i / (n - 2 || 1);
    let w = baseW;
    if(st.taper > 0){                              // thin at both ends
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.6);
      w = baseW * (1 - st.taper + st.taper * env);
    }
    if(st.brush === 'calli'){                      // width follows stroke direction
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      w *= 0.18 + 0.82 * Math.abs(Math.sin(ang - nib));
    }
    ctx.lineWidth = Math.max(0.4, w * S);
    ctx.beginPath();
    ctx.moveTo(a.x * S, a.y * S);
    ctx.lineTo(b.x * S, b.y * S);
    ctx.stroke();
  }
}

function drawOne(ctx, st, S, pts){
  const closed = !!st.closed;
  ctx.globalAlpha = st.alpha == null ? 1 : st.alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = st.cap || 'round';

  if(pts.length === 1){                            // a dot
    ctx.beginPath();
    ctx.arc(pts[0][0] * S, pts[0][1] * S, Math.max(0.5, st.width * S * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = st.color; ctx.fill();
    return;
  }

  // fill first so the stroke sits on top
  if(closed && st.fill && pts.length > 2){
    splinePath(ctx, pts, S, st.tension, true);
    ctx.fillStyle = st.fill.color2
      ? makeGrad(ctx, pts, S, st.fill.color, st.fill.color2, st.fill.angle)
      : st.fill.color;
    ctx.fill();
  }

  const strokeStyle = st.color2 ? makeGrad(ctx, pts, S, st.color, st.color2, 0) : st.color;
  ctx.strokeStyle = strokeStyle;

  const varying = (st.taper > 0) || st.brush === 'calli';
  if(varying){
    ctx.setLineDash([]);
    strokeVarying(ctx, samplePath(pts, st.tension, 14, closed), S, st.width, st);
    return;
  }

  const w = Math.max(0.5, st.width * S);
  if(st.brush === 'dash')      ctx.setLineDash([w * 2.2, w * 1.8]);
  else if(st.brush === 'dot')  { ctx.setLineDash([0.01, w * 2.0]); ctx.lineCap = 'round'; }
  else                          ctx.setLineDash([]);

  if(st.brush === 'outline'){                      // wide colour + narrow knock-out
    ctx.lineWidth = w;
    splinePath(ctx, pts, S, st.tension, closed); ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = Math.max(0.4, w * 0.45);
    splinePath(ctx, pts, S, st.tension, closed); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    return;
  }

  ctx.lineWidth = w;
  splinePath(ctx, pts, S, st.tension, closed);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function renderStrokes(ctx, strokes, S, bg){
  ctx.save();
  ctx.clearRect(0, 0, S, S);
  if(bg && bg !== 'transparent'){ ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S); }
  for(const st of strokes){
    if(!st.pts || !st.pts.length) continue;
    for(const T of symTransforms(st.sym)){
      const pts = st.pts.map(T);
      drawOne(ctx, st, S, pts);
    }
  }
  ctx.restore();
}

export function strokeStats(strokes){
  let pts = 0;
  for(const s of strokes) pts += (s.pts ? s.pts.length : 0);
  return { strokes: strokes.length, points: pts };
}

/* ---------- primitives ---------- */

export function primitive(kind, opts){
  const cx = opts.cx == null ? 0.5 : opts.cx, cy = opts.cy == null ? 0.5 : opts.cy;
  const r = opts.r == null ? 0.28 : opts.r, n = Math.max(3, opts.n || 6);
  const pts = [];
  if(kind === 'circle'){
    const k = 8;
    for(let i = 0; i < k; i++){ const a = (Math.PI * 2 * i) / k; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return [{ pts, closed: true, tension: 1 }];
  }
  if(kind === 'polygon'){
    for(let i = 0; i < n; i++){ const a = -Math.PI / 2 + (Math.PI * 2 * i) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return [{ pts, closed: true, tension: 0 }];
  }
  if(kind === 'star'){
    const ri = r * (opts.inner == null ? 0.42 : opts.inner);
    for(let i = 0; i < n * 2; i++){
      const a = -Math.PI / 2 + (Math.PI * i) / n, rr = (i % 2 ? ri : r);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return [{ pts, closed: true, tension: 0 }];
  }
  if(kind === 'spiral'){
    const turns = opts.turns || 3, steps = Math.max(12, turns * 10);
    for(let i = 0; i <= steps; i++){
      const t = i / steps, a = Math.PI * 2 * turns * t, rr = r * t;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return [{ pts, closed: false, tension: 1 }];
  }
  if(kind === 'grid'){
    const k = Math.max(2, Math.min(16, opts.n || 6)), out = [], a = cx - r, b = cx + r, c = cy - r, d = cy + r;
    for(let i = 0; i <= k; i++){
      const t = i / k;
      out.push({ pts: [[a + (b - a) * t, c], [a + (b - a) * t, d]], closed: false, tension: 0 });
      out.push({ pts: [[a, c + (d - c) * t], [b, c + (d - c) * t]], closed: false, tension: 0 });
    }
    return out;
  }
  return [{ pts: [[cx - r, cy], [cx + r, cy]], closed: false, tension: 0 }];
}
