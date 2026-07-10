# lottie-motion Roadmap

> Base-first scope discipline (locked): Lottie is the foundation; v0.1 validates
> the deterministic builder with **one** use case only. Everything else is
> deferred here so v0.1 stays minimal and shippable.

## v0.1 — validate the deterministic builder (current scope)

One use case end-to-end: **structure diagram → animation** (continuing the
animation layer figure-canvas's roadmap deferred).

**Content form (locked):** v0.1 serves **architecture diagrams + flowcharts** —
the two forms that are isomorphic and both consume the Vertex+Edge IR directly.
Architecture diagrams hit the IR most purely (static topology, reveal by
topological order); flowcharts add directed-flow semantics (start→decision→end)
where reveal-in-order reads even more naturally. The two are near-identical
structurally, so serving both costs almost nothing over serving one.

- Input: `Structure` IR (`vertices[]` + `edges[]`, explicit connectivity &
  geometry). See [[figure-canvas-structure-ir]].
- Pipeline: `Structure → [planner] Timeline IR → [compiler] Lottie JSON →
  [render] frames`. See [[layered-primitives-and-planner]].
- Three deterministic gates: Builder (对) / Compiler (contract) / Render (motion).
  See [[three-gate-quality-model]].
- Animation: nodes reveal in order (topological for a DAG, visual order
  otherwise) → edges flow source→target → highlight.
- Determinism rules enforced: single timeline owner (planner); geometry read-only
  (frozen upstream input); no implicit time cursor.
- Deliverable: standalone Node builder lib, packaged as a skill.
- Base layer = scene-timeline primitives; graph layer = a pure compiler on top.

**Explicitly NOT in v0.1** (architecture reserved, behavior not built):
- **Overrides** — see below.
- Use cases 2 & 3 (concept→animation, icon→micro-animation) — see below.

## v0.1 closing-animation notes (2026-07-05)

Two "reveal → flow → **highlight**" details resolved after the initial gate work:

- **Closing highlight — implemented.** The planner schedules a closing highlight
  (scale pulse) on sink vertices, falling back to the last vertex in reveal
  order for cyclic graphs (which have no sink), so every valid input gets one.
  Wiring it surfaced a latent compiler bug: multidimensional animated keyframes
  MUST carry `i`/`o` bezier easing handles or lottie-web silently fails to render
  the layer (1-D scalars like opacity/trim tolerate their absence). Fixed in
  `keyframeVec`.
- **Node labels — carried through the IR, rendering deferred.** `reveal.label`
  now flows through the Timeline IR and is checked by the builder gate's
  label-freeze invariant (the textual sibling of spatial-freeze). Labels are NOT
  drawn: a Lottie text layer (`ty:5`) does not render under the render gate's
  headless stack (jsdom + node-canvas + lottie-web) — it draws nothing AND blanks
  the whole frame. Visible labels need a headless-text-capable renderer or vector
  glyph paths (font-to-path); deferred rather than shipped broken.

## Node label rendering (vector glyph paths) — IMPLEMENTED 2026-07-06

Shipped as designed below (Pareto plan B, 2026-07-05): labels render as **filled
vector glyph contours** via opentype.js + vendored Fira Sans (SIL OFL), inside
the reveal layer (so they inherit fade-in and highlight pulse). Implementing it
surfaced and fixed a deeper latent bug: **every** animated keyframe needs `i`/`o`
easing handles — without them lottie-web's canvas renderer corrupts the whole
composition while the value interpolates (boxes vanished while an un-eased trim
animated; pre-existing since v0.1, masked by the render gate's has_motion-only
check). Original decision record follows.

- **Why not `ty:5` text layers:** verified 2026-07-05 — under the render gate's
  headless stack (jsdom + node-canvas + lottie-web) a text layer draws nothing
  AND blanks the entire frame. Text layers are a dead end for this pipeline.
- **Why not swapping the renderer (puppeteer):** a heavy browser runtime is
  pre-mortem death cause #1 (fusion-plugin); the render gate's environment
  stays minimal.
- **Determinism requirements when built:** vendor a fixed font file with the
  package (no system-font lookup — same input must yield byte-identical glyph
  paths on every machine); glyph outlines become ordinary shape layers, so all
  three gates work unchanged; label text comes verbatim from `reveal.label`.
- **Already in place on the v0.1 branch:** `TimelineEventReveal.label` flows
  through the planner, and the builder gate enforces label-freeze (event label
  === input vertex label). The follow-up only adds the compiler-side glyph
  rendering; no IR or gate changes expected.

## Deferred — Overrides (semantic-hook, re-enter-planner)

The planner signature **reserves** the `overrides` parameter slot
(`plan(structure, overrides)`), but v0.1 implements **no** override behavior.
When built, overrides MUST obey (per the lanshu author's constraints):

1. **Constraint input, not a patch.** An override never patches a generated
   timeline and never patches Lottie JSON. It re-enters the planner, which
   regenerates a fresh timeline. The artifact is always a pure function of inputs.
2. **Semantic hooks only.** Overrides bind to stable input-space IDs (node id,
   edge id, semantic event), never to output-space frame numbers.
3. **Time only, never space.** Overrides may change order / delay / easing /
   duration. They may NOT change layout — geometry is owned upstream
   (figure-canvas / Structure IR) and is a frozen input. Layout changes happen by
   editing the input `Structure`, not via an animation override. (This is *why*
   the layout planner and animation planner stay decoupled — two systems, not one
   shared constraint system.)

## Non-goals for v0.1 (content forms)

Forms the lanshu author raised that v0.1 explicitly does **not** serve. The
deciding rule: v0.1's input is the Vertex+Edge `Structure` IR, so only
node-and-edge topologies fit. The rest need a different IR and are out of scope.

| Form | Fits Vertex+Edge IR? | v0.1? |
|---|---|---|
| Architecture diagram | yes (native nodes+edges) | **goal** |
| Flowchart | yes (directed nodes+edges) | **goal** |
| Data visualization | no — data→shape mapping, not topology | non-goal |
| Metric / KPI animation | no — value→change, no graph | non-goal |
| UI mock | no — layout tree, not a graph | non-goal |
| Product demo animation | no — scene sequence, most complex | non-goal |

These non-goals are about *content form*. They may become reachable later via use
cases 2 & 3 (which build on the same scene-timeline base), but none is in v0.1.

## Prerequisite for use cases 2 & 3: extract the scene-timeline primitive layer (2026-07-08)

Honest gap between design and code, worth flagging before anyone picks up use
case 2 or 3. Per [[layered-primitives-and-planner]], the intended architecture
is a **layered hybrid**: a generic scene-timeline layer as "the real base"
(its own example primitives: `fadeIn(layer, f0, f1)`, `moveAlongPath`,
`stagger`), with the graph-structure layer (`revealInOrder`, edge-flow,
highlight) as "a pure *compiler* from `Structure` IR down to scene-timeline
calls." **That base layer has not actually been extracted yet:**

- `src/compiler/primitives.ts` only holds keyframe/value-level helpers
  (`keyframe`, `keyframeVec`, `staticVal`, `staticMulti`, `rootCanvasAsm`) — one
  level lower than "scene-timeline primitives."
- `fadeIn` — the design doc's own named example of a scene-timeline primitive —
  does exist in `primitives.ts`, but has zero call sites outside its own unit
  test (`tests/compiler/primitives.test.ts`).
- `buildRevealLayer` and `buildFlowLayer`, the functions that actually
  translate `TimelineIR` events into Lottie layers, live as private functions
  inside `src/compiler/compile.ts` and build LAST elements (`el`/`ob`/`cl`/…)
  directly — they don't compile down to `fadeIn` or any other scene-timeline
  call. `buildRevealLayer` inlines its own opacity construction (mirroring
  `fadeIn`'s body) instead of calling it.

So today there is effectively one layer (direct LAST-element construction)
with graph-shaped functions sitting on top of it, not the two-layer hybrid the
design calls for. **This is fine for v0.1** — one use case doesn't justify
pre-emptively building out a reusable primitive layer, an instinct consistent
with the don't-over-formalize rule already applied to the Timeline IR itself
(see [[layered-primitives-and-planner]]). But it means the first step for use
case 2 is NOT "write a new compiler on top of the existing primitive layer" —
it's extracting a real scene-timeline primitive layer out of `compile.ts`
first, since the base the design assumes doesn't exist yet.

## Deferred — use case 2: concept / text → general animation

Builds on the same scene-timeline base layer; no graph structure. Out of scope
until the base is validated by v0.1.

## Deferred — use case 3: icon → micro-animation

Micro-animations on the same base layer. Out of scope until v0.1.

## Open questions carried into design — RESOLVED 2026-07-08

All three questions below were open when this roadmap was written; each is now
settled in code.

- **Wrap `@lottiefiles/last-builder` vs write own thin builder on
  `@lottiefiles/last` / `lottie-types` (approach A vs B) → chose A (wrap).**
  `src/compiler/primitives.ts` and `src/compiler/compile.ts` build Lottie JSON
  directly on `@lottiefiles/last-builder`'s `el`/`ob`/`ar`/`at`/`pt`/`rt`/`cl`
  constructors; no separate builder layer was written.
- **Input source: figure-canvas mxGraph XML directly vs a standalone
  `Structure` JSON + adapter → chose the standalone JSON + adapter.** The
  planner and compiler only ever consume the `Structure` IR (`vertices[]` +
  `edges[]`); `src/adapters/mxgraph.ts` is the one boundary adapter, parsing
  mxGraph XML into `Structure` before anything downstream touches it.
- **Render gate renderer: lottie-web headless vs puppeteer vs
  `@lottiefiles/lottie-renderer` → chose lottie-web headless.**
  `src/renderer/render.ts` runs lottie-web's canvas renderer inside jsdom +
  node-canvas; puppeteer was ruled out per the pre-mortem (heavy browser
  runtime = pre-mortem death cause #1 — see the label-rendering decision
  record above).
