# Catoptron — User Guide

*Catoptron* (from the Greek **κάτοπτρον**, "mirror") — the root of *catoptrics*, the classical science of reflection. A fitting name for a tool whose oldest heart is mirrors and reflected light, though it has since grown into a general image-folding engine where reflection is just one of ten renderers.

Catoptron turns a photo (or a built-in pattern) into kaleidoscopic, fractal, and
conformal artwork. You build an effect by **stacking coordinate "folds"** and choosing a
**renderer** that reflects/recurses the result, then dress it with color, framing, and motion.
Everything runs live on the GPU in your browser — no install, nothing uploaded.

---

## 1. The idea in one picture

```
  SOURCE            FOLD STACK                 RENDERER            GLASS            MOTION
  image     →   fold₁ → fold₂ → …    →   Panes/Droste/…    →   color/frame   →   animate
 (photo)      (coordinate transforms,     (reflects & tiles      (tint, counter-    (drift, spin,
              applied top to bottom)       the folded plane)      change, grain)     wobble)
```

Read it left to right. Each **fold** bends the coordinate grid; the folds **compose in order**,
so the same folds in a different order give a different result. The **renderer** then takes that
bent grid and mirrors/repeats it into the final structure. **Glass** handles color and framing.
**Motion** animates any of it over time for video export.

The single most useful habit: **add one fold, watch what it does, then add the next.** Stacks of
2–4 folds already go a very long way.

---

## 2. Quick start

1. **Source** (top of the left panel): click **Load image** to use your own photo, or pick a
   built-in pattern (`orbs`, `plasma`, `rings`, `stripes`, `waves`, `voronoi`, `truchet`, `halftone`, or a `grid`/`polar`/`checker` probe) — each shaped by three knobs (**Scale** density, **Hue** color, **Variation**) to learn an
   effect against a clean reference.
2. **Renderer**: start on **Panes**.
3. **Fold stack**: choose an operator in the *add* dropdown and click **+** (or "add"). Try
   **Polar fold** first — instant kaleidoscope.
4. Drag its sliders. Add a second fold (say **Swirl** or **Spiral**).
5. Open **Presets** and load a few to see what full recipes look like.
6. **Export PNG** when you like it, or open **Record / HQ Video** for animation.

---

## 3. The interface

The left panel is grouped top to bottom:

- **Source / Image** — load a photo or pick a probe pattern; set **Aspect** (free, source, 1:1,
  4:5, 3:4, 2:3, 9:16, 4:3, 3:2, 16:9); **HQ Still** exports a super-sampled frame.
- **Presets** — load, save, randomize, reseed, and copy/paste or import/export recipes as text.
- **Fold stack** — the heart of the tool: add, order, and tune the folds (section 5).
- **Renderer** — the twelve reflection engines (section 4) plus their shared controls
  (Depth, Step scale, Twist, Shift X/Y, Zoom, mirrored).
- **Glass** — color, framing & signal glitch (section 6): Frame, Tint, Counterchange, Chroma, Ripple, Vignette, Grain; a post colour-**grade** (Exposure, Contrast, Saturation, Warmth, Posterize, Scanlines); and **signal glitch** (Channel split/swap, Block dropout, Dither, Signal noise, Interlace).
- **Motion** — animation (section 7): Drift, Spin, Rotate, Wobble, Pulse, Sway, Hue cycle, plus **motion glitch** (Stutter, Jitter, Glitch burst).
- **Record** — WebM capture and offline HQ video.

---

## 4. Renderers

The renderer decides how the folded plane is reflected and repeated. Same stack, different
renderer = very different image, so try switching.

| Renderer | What it does | Good for |
|---|---|---|
| **Panes** | Straightforward mirrored tiling of the folded plane | Clean kaleidoscopes, learning a fold |
| **Droste** | Logarithmic-spiral recursion (image inside itself, forever) | Infinite-zoom, spiral vortices |
| **Room** | Opposed-mirror "hall of mirrors" corridor | Deep receding reflections |
| **Tube** | Wraps the plane around a cylinder | Tunnels, wormholes |
| **Strip** | Repeats along a single band | Friezes, ribbon patterns |
| **Feedback** | Feeds the previous frame back in (trails) | Painterly buildup, motion smear |
| **Grid** | Wallpaper tiling — the plane repeats in a rectangular lattice | Mosaics, wallpaper |
| **Kaleido** | Radial kaleidoscope — N mirrored wedges with mirrored rings | Classic kaleidoscopes |
| **Sphere** | Wraps the image onto a rotating ball | Planet / globe looks |
| **Slit-scan** | Each column samples a different time slice — diagonal motion smear | Time-smear, datamosh motion |
| **Poincaré disk** | The hyperbolic disk model — the image crowds infinitely toward the rim | Escher-like hyperbolic space |
| **Hyperbolic tiling** | A {p,·} reflection group tessellates the disk (Escher "Circle Limit") | Hyperbolic tessellations |

Shared renderer controls:

- **Depth** — how many reflection/recursion steps (higher = more intricate, slower).
- **Step scale** — zoom ratio between recursion levels (drives Droste/Room depth feel).
- **Twist** — rotation added per level.
- **Shift X / Y**, **Zoom** — pan and zoom the whole view.
- **mirrored** — flip alternating tiles for seamless mirror symmetry.
- **Feedback** (Feedback renderer only) — how much of the last frame persists (trail length).
- **Mosh** (Feedback renderer only) — datamosh: block-displaces the previous frame before it re-enters, for chunky motion-smear corruption.
- **Reaction-diffusion** (Feedback renderer only) — a Gray-Scott mode that grows organic Turing patterns (spots, mazes, coral) seeded and continuously fed by the image. In this mode the Pull / Rotate knobs become **Feed / Kill**, which select the pattern type.

---

## 5. The fold stack

This is where you compose the effect.

- **Add** a fold: pick it in the dropdown, click add. It appends to the bottom.
- **Reorder**: the ↑ / ↓ buttons. **Order matters** — Swirl-then-Mirror ≠ Mirror-then-Swirl.
- **Remove**: the × button.
- **Tune**: each fold shows its parameters. Numeric params are sliders (with an editable number
  box); **choice params are dropdowns** (mode, style, wave type, symmetry group, …).
- **Mode-aware panels**: multi-mode folds (Lazy, Loonie, Wave bank, Complex, …) show **only the
  parameters for the mode you've selected** — pick "Travis" on the Lazy fold and only Travis's
  knobs appear.
- **Origin** (⊕): every fold has an X/Y origin so you can move where it acts. Click the ⊕ and
  **drag on the canvas** to place that fold's center — great for off-center swirls and lenses.

A good mental model: the first fold acts on the raw image coordinates; each later fold acts on the
result of the one above it.

---

## 6. Operator reference

All 127 folds, grouped by what they do. Parameters listed are the main ones; multi-mode folds
reveal the rest once you pick a mode.

### Basic transforms
| Fold | What it does | Key params |
|---|---|---|
| **Rotate** | Spins coordinates | Angle° |
| **Scale** | Zooms coordinates in/out | Factor |
| **Shift** | Translates the plane | X, Y |
| **Shear** | Slants the plane | X, Y |
| **Mosaic** | Snaps to a blocky grid | Cells |

### Kaleidoscope & symmetry
| Fold | What it does | Key params |
|---|---|---|
| **Polar fold** | Classic wedge kaleidoscope — mirrors N angular slices | Segments, Offset° |
| **Rosette Cn** | Rotational (Cn) symmetry **without** mirroring — pinwheels | Segments, Offset° |
| **Triangle fold** | Folds through a triangle (triangular kaleidoscope) | Scale |
| **Mirror line** | Reflects across a line; keep side A or B | Angle°, Side |
| **Mirror tile** | Tiles X×Y with mirror or repeat | Tiles X, Tiles Y, Mode |
| **Abs fold** | Box fold — reflects anything past ±fold back inward | Fold |
| **Brick** | Brick-wall tiling, offset alternating rows | Scale X, Scale Y |
| **Bravais** | Softly pulls points toward a lattice | Scale, Pull |
| **Chainmail** | Interlocking-ring tiling | Scale, Ring ratio |
| **Hexagonal** | Hex-cell tiling (cube-coordinate) | Scale |
| **Honeycomb** | Soft pull toward a hex lattice | Scale, Pull |
| **Wallpaper** | All 17 wallpaper groups — seamless symmetric wallpaper | Group (p1…p6m), Cell, Angle° |
| **Frieze** | The 7 frieze (strip) symmetry groups | Group, Angle°, Period |
| **Hyperbolic** | Hyperbolic {p,q} tiling in the Poincaré disk | p, q, Scale |
| **Polyhedral** | Spherical / polyhedral {p,q} symmetry | p, q, Scale |
| **Aperiodic** | Quasicrystal / aperiodic tilings (Penrose, Ammann–Beenker) | Grids, Cell, Gamma, Mode, Levels, Inflation |
| **Quasicrystal** | 5-fold quasicrystal interference shimmer | Freq, Amp |
| **Penrose fold** | Golden-ratio Penrose lattice fold | Scale |
| **Shape warp** | Shape-boundary warp bank — 10 shapes × 6 warp modes (see below) | Shape, Warp mode, + |
| **Tessellated** | Grid/distort tiling bank — 10 modes × 6 symmetries (see below) | Mode, Symmetry, Scale, + |
| **Tri lattice** | Triangular-lattice fold (morphable) | Scale, Morph |
| **Truchet2** | Truchet arc tiling (random per-cell orientation) | Exponents, Widths, Tiles, Seed, Inverse |
| **Weave** | Over/under basket-weave distortion | Scale, Warp |

### Swirls, spirals & waves
| Fold | What it does | Key params |
|---|---|---|
| **Swirl** | Whirlpool — rotation that grows with radius | Amount |
| **Spiral** | Spiral distortion | Amount |
| **Log spiral** | Logarithmic spiral arms | Scale, Turn°, Arms, Mirror |
| **Wave warp** | Sine / triangle / saw / square displacement | Amp, Freq, Wave |
| **Lens bank** | Optical lens bank — 12 modes (see below) | Mode + per-mode |
| **Curl noise** | Divergence-free swirl (incompressible flow) | Freq, Strength |
| **Chladni** | Standing-wave (vibrating-plate) nodal warp | m, n, Amplitude |
| **Fault** | Geological fault — hard shift across a line | Angle, Displacement |
| **Jet stream** | Horizontal gaussian shear jet | Speed, Width, Center |
| **Karman vortex** | Von Karman vortex street — alternating eddies | Freq, Strength, Sep |
| **PDJ** | Four-sine PDJ warp (with phase offsets) | a, b, c, d, e, f |
| **Popcorn2** | Parametrized popcorn sin(tan()) jitter | X, Y, C |
| **Superposition** | Two-frequency radial interference rings | Freq1, Freq2, Phase |
| **Satin** | Diagonal double-sine fabric sheen | Freq, Sheen |
| **Stwin** | Twin-swirl distortion (Apophysis stwin) | Distort, Offsets |
| **Screw** | Radial screw / helix twist | Pitch |
| **Maelstrom** | Swirl-warped exponential spiral | Swirl, Freq, Scale |
| **Oscilloscope** | Mirror the image inside a cosine band | Separation, Frequency, Amplitude, Damping |
| **Mitosis** | Cell-division pinch/split (tanh neck) | Separation, Width, Phase |
| **Mushroom** | Cap/stalk vertical profile | Cap radius, Cap width, Stalk width |
| **Wave bank** | 17-style mega wave warper (see below) | Style, + per-style knobs |
| **Pleat** | Folded-paper pleats | Angle°, Width, Tilt° |
| **Petal** | Flower-petal lobes | Lobes, Amp |
| **Wedge** | Angular pie-slice fan with swirl | Angle, Hole, Count, Swirl |
| **Whorl** | Inside/outside differential spiral | Inside, Outside |
| **Tidal lock** | Angular ratio spin with eccentric wobble | Ratio, Ecc |
| **Wood grain** | Concentric wood-ring displacement | Freq, Amp, Grain, Grain freq |
| **Target** | Log-ring alternating angular rotate | Even, Odd, Size |
| **Target sp** | Target with log-spiral tweak | Twist, N of sp, Size, Tightness |

### Lenses, rings & bubbles
| Fold | What it does | Key params |
|---|---|---|
| **Spherical** | Spherical inversion (1/r²) — fisheye bubble | Radius |
| **Lens** | Radial magnification | Curve |
| **Ring fold** | Folds into concentric rings | Density |
| **Fresnel** | Concentric Fresnel-lens rings | Rings, Gain |
| **Gear teeth** | Radial gear-tooth ripple | Teeth, Depth |
| **Hammer** | Hammer-Aitoff map projection | Scale |
| **Mercator** | Mercator map projection | Scale |
| **Perspective** | Apophysis perspective tilt (foreshortening) | Angle, Dist |
| **Stereographic plane** | Stereographic plane projection (lat/lon) | Scale |
| **Supernova** | Spinning ring-shell shockwave | Radius, Boost, Spin |
| **Projective** | Full 9-coefficient projective / homography | A–C, A1–C1, A2–C2 |
| **Quadrupole** | 4-pole cos(2θ)/r² field warp | Strength, Smooth |
| **Rainbow arc** | Bends radius bands into an arc | Radius, Width, Arc |
| **Klein** | Circle inversion inside a radius, with twist | Inner radius, Twist |
| **Membrane** | Drumhead ring bulge (gaussian ripple) | Radius, Height, Stiff |
| **Moebius strip** | Half-twist ring wrap | Radius |
| **Ouroboros** | Radius wraps into a twisting ring | Radius, Twist |
| **Bubbles** | Circle-packing bubbles | Scale, Floor, Iters |
| **Circle mirror** | Reflect across a circle (ball = inside-out, window = keep inside) | Radius, Mode |
| **Radial pow** | Raises radius to a power | Amount, Power |
| **Loonie** | Circle-inversion bubbles (see below) | Mode, Amount, + |

### Conformal & complex maps
| Fold | What it does | Key params |
|---|---|---|
| **Complex** | 4-stage complex-function pipeline — the conformal Swiss army knife (see below) | Stage 1–4, Freq X/Y, Reflect |
| **Complex sum** | 26-weight complex-function accumulator — blend many functions additively (see below) | function weights, input affine, Reflect |
| **Mobius** | Simple Möbius transform | Offset X, Offset Y, Rotate° |
| **Mobius abcd** | Full Möbius (az+b)/(cz+d), all 8 real/imag terms | Re/Im a,b,c,d |
| **Foci** | Hyperbolic foci warp (Apophysis) | Amount |
| **Murl** | Murl / Murl2 curl-coil (complex) | Type, c, Power |
| **Mcarpet** | Magic-carpet twist/tilt warp | X, Y, Twist, Tilt |
| **Mask** | Complex sin/cosh mask warp | shifts, scales |
| **Bipolar** | Bipolar conformal map — lens/eye stretches | Amount, Shift |
| **Elliptic** | Elliptic conformal map | Amount, Mode |
| **Disc** | Disc-family conformal maps (disc, idisc, wdisc, fdisc, edisc, spiral, squircle, tan, sech) | Mode, Amount, Twist, Petal |
| **Zhukowski** | Joukowski airfoil conformal map | c |

### Fractal folds
| Fold | What it does | Key params |
|---|---|---|
| **KIFS** | Kaleidoscopic IFS fractal fold | Iters, Fold, Angle°, Scale |
| **Multi-fold IFS** | Multi-attractor KIFS: each iteration folds toward the *nearest* of N ring-arranged centres (a deterministic stand-in for an IFS's random map pick). Fold adds a KIFS abs-crinkle per centre, Radius decay nests the rings, Variation breaks the symmetry per centre; Shear opens affine (fern-like) attractors, Softness blends crisp Voronoi facets into organic blobs, Precession spirals the ring per iteration, Pull biases contraction toward the nearest centre | Iters, Centres, Scale, Angle°, Radius, Fold, Offset°, Radius decay, Variation, Shear, Softness, Precession°, Pull |
| **Koch fold** | Koch-curve folding (snowflake edges) | Iters, Scale |
| **DModulus** | Double-modulus fractal tiling | Size X/Y, Angle°, Iters |
| **Shatter** | Breaks the plane into tilted cells (shattered glass) | Cells, Tilt |
| **Bedhead** | Chaotic-attractor warp — organic, glitchy | a, b |
| **Ikeda** | Ikeda attractor — swirl-collapse chaos | u |
| **Pickover** | Pickover attractor — chaotic sine map | a, b, c, d |
| **Svensson** | Svensson attractor — chaotic sine/cos map | a, b, c, d |
| **Symmetric icon** | Symmetric-icon quadratic map — rotational symmetry | Lambda, Alpha, Beta, Omega |
| **Kleinian** | Kleinian-group circle-inversion fractal | Circles, Radius, Iters, Scale, Bound, Spin°, Twist°, Frame |
| **Fuchsian** | Fuchsian group (hyperbolic tilings) | trace ta/tb/tab, Iters |
| **Apollonian** | Apollonian gasket circle packing | Iters, Radius, Scale |
| **Inversive IFS** | Chaos-game circle-inversion IFS — each iteration inverts through the *nearest* of N ring-arranged circles (inversive sibling of Multi-fold IFS; distinct from Kleinian's group and Apollonian's packing). Limit-set mode inverts only inside a circle; Kaleido inverts always | Iters, Circles, Circle radius, Ring radius, Spin°, Offset°, Mode, Blend |
| **Mandelbox fold** | Box-fold + sphere-fold iteration (reflect across walls, radially inflate, scale) — crunchy "alien-machine" structure, neither affine nor inversive | Iters, Scale, Min radius, Fixed radius, Fold limit, Blend |
| **Power IFS** | Conformal IFS: applies a complex power about the nearest of N centres — curved, spiralling self-similarity | Iters, Centres, Power, Radius, Spin°, Offset°, Scale, Blend |
| **Flame IFS** | Apophysis-style IFS: applies one of 17 selectable nonlinear variations (spherical, swirl, sinusoidal, horseshoe, polar, handkerchief, heart, disc, spiral, hyperbolic, diamond, ex, bent, fisheye, cylinder, bubble, cross) about the nearest centre each iteration. Var amount dials linear↔nonlinear, Symmetry adds an N-fold kaleidoscopic fold, Precession spirals the ring, Radius decay nests it | Iters, Centres, Variation, Radius, Spin°, Offset°, Scale, Blend, Var amount, Precession°, Radius decay, Symmetry |
| **Juliascope** | Julia-set wedge mapping | Power, Dist, Wedge cover, Iters |
| **Julian** | Julia mapping | Power, Dist, Wedge cover |
| **Worley** | Worley / cellular (F1) noise fold | Scale, Jitter |
| **Voronoi fold** | Voronoi-cell fold toward nearest site | Scale, Fold |

### Glitch folds
Digital-corruption folds — all keyed to the global **Seed**, so **Reseed** rerolls their block/tear patterns.
| Fold | What it does | Key params |
|---|---|---|
| **Block displace** | Quantizes into blocks and jumps each a hashed distance | Size, Shift, Density |
| **Row tear** | Offsets horizontal bands sideways (VHS tearing) | Bands, Shift, Density |
| **Bit crush** | Snaps coordinates to a coarse grid (chunky mosaic) | Levels, Mix |
| **Shear cascade** | Per-band horizontal shear that jumps at hashed steps | Steps, Shear |
| **DCT ring** | 8×8-style block quantize with a cosine wobble (JPEG ringing) | Size, Ring, Freq |
| **Block shuffle** | Snaps whole blocks to a different grid cell (tile-swap) | Size, Density, Spread |

### Image-driven folds
These read the **photo itself** — sampling brightness, colour, or the local gradient at each point and letting the image content steer the warp. Order matters especially here: placed after another fold, they read the *already-folded* image. No Seed dependence — they're driven by the picture, not randomness.
| Fold | What it does | Key params |
|---|---|---|
| **Luma displace** | Pushes coordinates along the image's own brightness (self-melt) | Push, Freq |
| **Gradient displace** | Pushes along the brightness gradient — relief (downhill) or contour (perpendicular flow) | Push, Detail, Mode |
| **Refract** | Treats brightness as a height field and refracts through it, like wet / rippled glass | Index, Detail |
| **Flow march** | Marches coordinates along the image's flow for N steps — streamline smear (your flow-field plotter, in coordinate space) | Steps, Step len, Detail |
| **Edge shock** | Displaces only where edges are strong; flat areas stay put | Push, Detail, Gate |
| **Channel drive** | Steers the warp by a chosen channel (R / G / B) or hue instead of luma | Push, Channel, Freq |
| **Value slide** | Slides sample position proportional to banded brightness — a pixel-sort cousin | Slide, Bands, Direction |

### The big multi-mode banks

- **Complex** — apply up to **four** complex functions in sequence (identity, 1/z, z², sqrt, exp,
  log, the trig family, the hyperbolic family, and all their inverses), with per-axis frequency
  and an optional mirror. Chaining e.g. `sqrt → acoth` reproduces classic JWildfire looks.
- **Complex sum** — instead of chaining, **add** functions together with individual weights: a
  pre-conditioner tier (reciprocal, log, sqrt, exp) plus a 15-function sum tier, with an input
  affine (ZX/ZY mult & add). Turn weights up to taste.
- **Wave bank** — one fold, **17 wave styles**: `waves22`, `dc_gnarly` (8 nested-trig modes),
  `vibration2`, `waves23`, `waves2b` (Jacobi-elliptic / Bessel), `waves2`, `waves2_radial`,
  `waves3`, `waves42`, `waves4`, `waves_julia`, `waves_spiral`, `waves_noise` (FBM),
  `waves_mobius`, `waves_power`, `waves_fisheye`, `waves_swirl`. Pick **Style** and only that
  style's parameters show. **Weight** blends the effect; **Seed** feeds the input back in.
- **Lazy** — the classic lazy-susan family: **Susan** (circular swirl with a movable center via
  x/y), **Travis** (square-metric swirl, spin_in/out), **Jess** (n-gon swirl with corner-flip),
  plus a **Sensen** post-fold toggle. Amount sets the swirl radius; for Travis/Jess try
  Amount ≈ 0.5–0.6 to stay in frame, higher for a bolder look.
- **Loonie** — circle-inversion bubbles: **Loonie** (circle), **Loonie2** (n-gon / star / circle
  blend — Sides, Star, Circle), **Loonie3** (parabolic). Two extras: **Radius** sizes the bubble
  independently of Amount, and **Rotate** spins the Loonie2 polygon.
- **BusyBrad** — the grid version of the lazy family: tiles the plane into cells (Grid size), each
  running a **Susan / Jess / Combined** swirl, with Spin, Twist, Space, N, offsets, and a Sensen
  fold. Grid size 0 makes it a single centered swirl.
- **Shape warp** — a warp bank driven by a shape boundary: pick a **Shape** (square, rectangle,
  circle, diamond, triangle, pentagon, hexagon, flower, star, cloud) whose outline sets an
  inner→outer falloff, then a **Warp mode** (rotate, scale-radial, swirl, scale-XY, fisheye,
  shear) applied by that falloff. Shape-specific knobs appear only for the relevant shape.
- **Tessellated** — a tiling/distortion bank: pick a **Mode** (square power/sine/radial, hex
  offset, true hex, radial tiling, exp-log, tangent, polynomial, Julia) and a **Symmetry**
  (none, X/Y-reflect, quadrant, D4, Dn). **Scale** sets cell density; **Edge blend** softens cell
  seams; **Grid/Cell rotate** with a **Rotate pattern** (checker/rows/columns) spin whole cells.
  Mode-specific knobs (Num sectors, Julia iters, Fold n) show only when relevant.

### Recolor
- **Counterchange** — the one fold that changes **color, not geometry**. It splits the plane into
  **stripes / checker / pinwheel / rings** and recolors alternating regions
  (**negate**, **hue 180°**, **desaturate**, or **tint**). Use **Cell** for scale and **Angle°**
  for orientation. (There's also a global Counterchange in the Glass panel — the fold gives you a
  second, independent one you can place anywhere in the stack.)

---

## 7. Glass — color & framing

- **Frame / Frame width** — draw a border vignette-frame around the piece.
- **Tint** — pick a color and blend amount to wash the image.
- **Counterchange** (global) — the same stripes/checker/pinwheel/rings recolor as the fold, applied
  once at the end: **off / negate / hue 180° / desaturate / tint**, with a **Counterchange fold**
  scale.
- **Chroma** — chromatic-aberration color fringing.
- **Ripple** — a final rippling distortion pass.
- **Vignette** — darken the edges.
- **Grain** — film grain.
- **Post grade** — applied after everything else, to every renderer including Feedback: **Exposure**, **Contrast**, **Saturation**, **Warmth**, **Posterize** (0 = off, else colour-bands), **Scanlines** (CRT sweep).
- **Signal glitch** — **Channel split** (RGB separation), **Channel swap** (per-region RGB permutation), **Block dropout** (punches blocks to black / white / inverted), **Dither** (ordered-dither palette crush), **Signal noise** (static), **Interlace** (scanline comb). Block patterns reroll with **Reseed**.
- **Hue / depth** — shifts hue with recursion depth for rainbow layering.

---

## 8. Motion — animation

Turn these up to animate for video export:

- **Drift** — slowly evolves fold parameters over time.
- **Spin** — continuous rotation of the whole view.
- **Rotate** — a fixed rotation offset (also animatable).
- **Wobble** — gently undulates the whole pattern over time; it animates *every* fold (a global warp), plus the Wave folds and Ripple more strongly. Wobble 0 is fully static.
- **Pulse** — breathes the zoom in and out.
- **Sway** — drifts the framing in a slow orbit.
- **Hue cycle** — rotates all colours over time (0 = still).
- **Stutter** — quantizes the animation clock into hold-then-jump steps (robotic strobe).
- **Jitter** — hashed per-frame shake on framing and rotation (signal instability).
- **Glitch burst** — on a hashed beat, spikes channel-split / noise / dropout for a few frames then relaxes — the "freaks out every couple seconds" datamosh driver. Fires even with the Glass glitch sliders at 0.

Animation loops are built to close seamlessly when exported as HQ Video.

---

## 9. Presets

- **Load** a factory preset from the dropdown (93 included, from clean kaleidoscopes to the Wave,
  Lazy, and Loonie families) to see complete recipes.
- **Save** your own; **Randomize** for happy accidents; **Reseed** to reshuffle random elements.
- **Copy / Paste** and **Import / Export** share recipes as plain text — hand a preset to someone
  else and they get your exact stack.

Note: a preset saved from an older build may not map cleanly if operator numbering changed since;
re-save presets after big updates.

---

## 10. Export & recording

- **Export PNG** — save a super-sampled still; the size dropdown offers **×1 / ×2 / ×4** of the live view, or a **fixed height** (1080 / 1440 / 2160 / 2880 px).
- **Record (WebM)** — captures the live canvas in real time; set FPS, quality, and length.
- **HQ Video** — renders **offline, frame by frame** via WebCodecs at export resolution, so loops
  close exactly and Feedback trails are rebuilt cleanly. Slower than real time but crisp.
- **Aspect** — lock the composition to any common ratio before exporting.

---

## 11. Recipes to try

- **Kaleidoscope portrait**: Polar fold (6–12 segments) → Swirl (small) → Panes, add a Tint.
- **Infinite vortex**: Spiral → Droste renderer, raise Step scale and Twist.
- **Stained glass**: Wallpaper (p6m) → Counterchange (checker, tint) → Panes.
- **Liquid chrome**: Wave bank (dc_gnarly) → Feedback renderer, add Chroma and a little Drift.
- **Bubble field**: Loonie (Loonie2, sides 6, some Star) → Spherical → Room.
- **Quiet spiral galaxy**: Log spiral → Wave bank (waves_spiral) → Droste, Vignette up.

When something looks muddy, **remove the last fold** — over-stacking is the usual culprit. When
it looks flat, switch the **renderer** before adding more folds.

---

## Appendix — running & deploying (for developers)

Single-page app, no build step. The fold shader is **assembled at runtime** from only the
operators in your stack, which is what lets the library grow without hitting the WebGL1 compile
ceiling.

```
index.html        markup + CSS, loads main.js as a module
main.js           UI, render loop, presets, recording, PNG/HQ export
engine/
  prelude.js      shared uniforms + sampling/shading GLSL
  helpers.js      GLSL math helpers (complex arithmetic, hyperbolics, noise, …)
  ops.js          operator registry (UI params + GLSL together) — the file that grows
  assemble.js     per-stack shader assembly + the 6 renderer bodies
  glcache.js      assembled program cache with async parallel compile
```

**GitHub Pages**: commit these files keeping `engine/` as a folder next to `index.html`; in
Settings → Pages, deploy from your branch root. Pages serves `.js` with the right MIME type, so the
modules load.

**Local testing**: ES modules don't load from `file://`, so run a static server from the repo
folder — `python -m http.server 8000` — and open `http://localhost:8000`.

**Validation**: all 127 operators × 12 renderers (1,524 combinations) and all 93 preset recipes are
compiled *and* rendered through headless ANGLE (the same `WebGL GLSL ES 1.0` path the browser
uses). The one thing only a real browser exercises is `KHR_parallel_shader_compile` — the async
recompile when you add or reorder a fold — so it's worth a quick check that reordering stays smooth.

**Adding an operator**: append one record to `engine/ops.js` (`name`, `fn` matching the GLSL
function name, `deps` from `helpers.js`, `params`, and the `glsl`). Choice params render as
dropdowns via a `names` array; a 7th param entry `[selectorIndex, …values]` hides that row unless
the selector matches, which is how multi-mode panels show only the active mode's controls.
