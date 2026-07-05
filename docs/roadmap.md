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

## Deferred — use case 2: concept / text → general animation

Builds on the same scene-timeline base layer; no graph structure. Out of scope
until the base is validated by v0.1.

## Deferred — use case 3: icon → micro-animation

Micro-animations on the same base layer. Out of scope until v0.1.

## Open questions carried into design

- Wrap `@lottiefiles/last-builder` vs write own thin builder on `@lottiefiles/last`
  / `lottie-types` (approach A vs B). Leaning A.
- Input source: consume figure-canvas mxGraph XML directly vs a standalone
  `Structure` JSON + one adapter.
- Render gate renderer: lottie-web headless vs puppeteer vs
  `@lottiefiles/lottie-renderer`.
