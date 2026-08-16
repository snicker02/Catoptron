/* text.js — turn typed text into editable vector paths.

   Browsers expose no glyph-outline API, and pulling in a font library would break the
   no-dependencies rule. So instead the text is rasterised to an alpha mask and its
   contours are traced with marching squares, then simplified into a handful of nodes.
   The result is real editable paths — draggable, warpable, foldable — in whatever
   fonts the machine already has.

   Holes (the inside of 'o', 'a', 'e') come out as separate contours; each is tested
   for containment so the caller can knock them out when filling. */

/* Marching-squares contour extraction from a boolean mask.
   Segments are keyed by edge id so loops chain together exactly, with no
   floating-point matching. Returns closed loops in pixel coordinates. */
export function contoursFromMask(mask, W, H){
  const inside = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? false : !!mask[y * W + x];
  // horizontal edge (between (x,y) and (x+1,y))  -> id  = (y*(W+1) + x) * 2
  // vertical   edge (between (x,y) and (x,y+1))  -> id  = (y*(W+1) + x) * 2 + 1
  const hId = (x, y) => (y * (W + 1) + x) * 2;
  const vId = (x, y) => (y * (W + 1) + x) * 2 + 1;
  const pos = new Map();                       // edge id -> [x, y] midpoint
  const next = new Map();                      // edge id -> [edge ids] it connects to

  const link = (a, b) => {
    if(!next.has(a)) next.set(a, []);
    if(!next.has(b)) next.set(b, []);
    next.get(a).push(b);
    next.get(b).push(a);
  };

  for(let y = -1; y < H; y++){
    for(let x = -1; x < W; x++){
      const tl = inside(x, y), tr = inside(x + 1, y), bl = inside(x, y + 1), br = inside(x + 1, y + 1);
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if(c === 0 || c === 15) continue;
      const top    = hId(x + 1, y + 1 - 1 + 0);      // edge between tl..tr  -> stored at (x+1, y+1) grid slot
      const bottom = hId(x + 1, y + 1);
      const left   = vId(x + 1 - 1 + 0, y + 1);
      const right  = vId(x + 1, y + 1);
      pos.set(top,    [x + 1.5, y + 0.5 + 0.0]);
      pos.set(bottom, [x + 1.5, y + 1.5]);
      pos.set(left,   [x + 0.5 + 0.0, y + 1.5]);
      pos.set(right,  [x + 1.5, y + 1.5]);
      // correct midpoints for this cell (cell spans corners (x,y)..(x+1,y+1))
      pos.set(top,    [x + 0.5, y - 0.0]);
      pos.set(bottom, [x + 0.5, y + 1.0]);
      pos.set(left,   [x + 0.0, y + 0.5]);
      pos.set(right,  [x + 1.0, y + 0.5]);
      switch(c){
        case 1: case 14: link(left, bottom); break;
        case 2: case 13: link(bottom, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(top, right); break;
        case 5:          link(left, top); link(bottom, right); break;
        case 6: case 9:  link(top, bottom); break;
        case 7: case 8:  link(left, top); break;
        case 10:         link(left, bottom); link(top, right); break;
      }
    }
  }

  const seen = new Set(), loops = [];
  for(const startId of next.keys()){
    if(seen.has(startId)) continue;
    const loop = [];
    let cur = startId, prev = -1, guard = 0;
    while(cur != null && !seen.has(cur) && guard++ < 500000){
      seen.add(cur);
      const p = pos.get(cur);
      if(p) loop.push([p[0], p[1]]);
      const nbrs = next.get(cur) || [];
      let nxt = null;
      for(const nb of nbrs){ if(nb !== prev && !seen.has(nb)){ nxt = nb; break; } }
      prev = cur; cur = nxt;
    }
    if(loop.length >= 4) loops.push(loop);
  }
  return loops;
}

export function polyArea(pts){
  let a = 0;
  for(let i = 0, n = pts.length; i < n; i++){
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function pointInPoly(pt, poly){
  let inside = false;
  for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if(((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

/* Mark contours that sit inside an odd number of others — those are holes. */
export function markHoles(loops){
  return loops.map((lp, i) => {
    const probe = lp[0];
    let depth = 0;
    for(let j = 0; j < loops.length; j++){
      if(i === j) continue;
      if(pointInPoly(probe, loops[j])) depth++;
    }
    return { pts: lp, hole: (depth % 2) === 1, area: Math.abs(polyArea(lp)) };
  });
}
