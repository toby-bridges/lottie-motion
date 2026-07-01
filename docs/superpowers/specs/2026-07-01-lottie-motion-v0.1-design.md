# lottie-motion v0.1 — Design

> Status: approved design (brainstorming output). Next step: writing-plans.
> Date: 2026-07-01.

## Purpose

lottie-motion is a **deterministic Node library** that compiles a node-and-edge
**structure diagram** into a **Lottie vector animation** (nodes reveal in order →
edges flow → highlight), packaged as a skill. It is the vector/Lottie animation
layer that figure-canvas's roadmap deferred.

**v0.1 scope (locked):** validate the deterministic builder with **one** content
domain — **architecture diagrams + flowcharts** (isomorphic; both consume the
Vertex+Edge IR). All other content forms and use cases are deferred (see
`docs/roadmap.md`).

## Core principles (invariants across all layers)

1. **Deterministic, not model-driven.** The animation is produced by
   deterministic functions, never by an LLM writing Lottie JSON. (The
   LLM-writes-JSON path is the rejected anti-pattern — see
   `references/_archive/` and the diffusionstudio anti-pattern note.)
2. **Single time authority = the planner.** The planner owns the entire timeline.
   The compiler and renderer never invent time; they only execute the frame
   numbers handed to them. No implicit time cursor anywhere.
3. **Geometry is read-only and frozen.** The planner reads the input's
   `x/y/w/h`; it never guesses and never mutates coordinates. Layout is owned
   upstream (figure-canvas / the input), not by lottie-motion.
4. **The artifact is always a pure function of the inputs.** Nothing is
   patched after generation.

## §1 System overview — four-layer pipeline

Data flows one direction, top to bottom:

```
  Structure IR  (+ overrides slot reserved; NOT implemented in v0.1)
        │  ▼  planner   — pure function, single time authority
  Timeline IR   (planner's typed in-memory return value)
        │  ▼  compiler  — semantic events → LAST AST (@lottiefiles/last-builder)
  LAST AST
        │  ▼  relottie-stringify  (@lottiefiles/relottie)
  Lottie JSON
        │  ▼  renderer  (lottie-web headless)
  rendered frames
```

Four independent units, each single-purpose:

| Unit | Input → Output | Responsibility | Dependencies |
|---|---|---|---|
| **planner** | `Structure (+overrides)` → `Timeline IR` | ordering + timing (topological order; reveal/flow/highlight frame numbers) | none; pure function |
| **compiler** | `Timeline IR` → `Lottie JSON` | translate semantic timeline events into Lottie shapes + keyframes | `last-builder`, `relottie` |
| **renderer** | `Lottie JSON` → `frames` | headless-render sampled frames | `lottie-web` |
| **gates** | each layer's output → pass/fail | Builder / Compiler / Render verification | per layer |

## §2 Structure IR and input contract

**Canonical input format = standalone `Structure` JSON** (the core does NOT ingest
mxGraph XML directly):

```
Vertex    = { id, label, x, y, w, h }
Edge      = { id, source, target, label }
Structure = { vertices: Vertex[], edges: Edge[] }
```

- Connectivity is explicit (`edge.source`/`edge.target` reference vertex ids);
  geometry is explicit. Neither is inferred.
- **Hard geometry requirement:** every vertex MUST carry complete `x/y/w/h`.
  Input lacking geometry is **rejected** (fail fast, clear error) — the planner
  never computes layout.

**mxGraph XML goes through an adapter, not the core.** figure-canvas emits
mxGraph XML, so a standalone `mxgraph→Structure` adapter (boundary, optional)
parses XML into canonical Structure. The core planner only ever accepts Structure
JSON. New sources (tldraw records, hand-written JSON) each get their own adapter;
the core is untouched.

**Input validation (entry guard, before the planner runs):**
- each vertex has a unique id + complete numeric `x/y/w/h` (w, h > 0);
- each edge's source/target reference existing vertex ids;
- reject: missing geometry, dangling edges, duplicate ids.

**Layout is out of scope for v0.1.** The question "auto-layout vs modular-layout
vs hybrid" is out of scope: lottie-motion does not do layout. Supporting
coordinate-free input would be a future **boundary-side, optional layout adapter**
(a one-time pre-step calling e.g. dagre/elk before the frozen-geometry boundary) —
never layout inside the planner, which would break the single-geometry-authority
rule.

## §3 planner and Timeline IR

**planner:** pure function `plan(structure, overrides?) → TimelineIR`. It is the
single time authority. v0.1 reserves the `overrides` parameter slot but
implements no override behavior.

**Three-step computation:**

1. **Order** — DAG → **topological order**; cyclic → fall back to **visual order**
   (by y then x; stable, deterministic). Ordering uses only connectivity +
   geometry, both frozen inputs.
2. **Schedule** — turn order into frame numbers, with three semantic event types
   at a fixed cadence:
   - `reveal(node)` — nodes fade in by order, each spanning `revealDur` frames,
     `stagger` frames between adjacent ones;
   - `flow(edge)` — an edge flows only **after both its source and target are
     revealed** (invariant: an edge never precedes its endpoints);
   - `highlight` — closing emphasis after all reveals (minimal or omitted in v0.1).
3. **Emit Timeline IR** — a typed in-memory structure (NOT a serialized format).

**Timeline IR shape (semantic, readable, testable):**

```
TimelineEvent =
  | { kind:'reveal',    target: nodeId, startF, endF, x, y, w, h }
  | { kind:'flow',      target: edgeId, startF, endF, from:nodeId, to:nodeId }
  | { kind:'highlight', target: id,     startF, endF }

TimelineIR = {
  fps, width, height,
  totalFrames,              // = op; ip = 0
  events: TimelineEvent[]   // sorted by startF
}
```

Key points:
- **Each reveal event embeds its own `x/y/w/h`, copied verbatim from the input
  vertex.** This is the carrier of "spatial freeze": the Builder gate asserts
  `event.{x,y,w,h} === input vertex.{x,y,w,h}`, catching any layer that silently
  mutates coordinates.
- **All time is explicit** (absolute `startF`/`endF`); **no implicit cursor**.
  Events may be generated in any order without changing the result.
- **canvas/fps/totalFrames are set by the planner** and passed downstream (they
  become Lottie's `w/h/fr/op/ip`); the Compiler gate verifies the contract
  against these.

## §4 compiler and high-level semantic primitives

**compiler:** `compile(timelineIR) → LottieJSON`. Translates semantic timeline
events into Lottie shapes + keyframes; assembles via `last-builder`, serializes
via `relottie-stringify`. It only translates — it never invents time; every
frame number comes from the Timeline IR.

**Two layers:**

```
  high-level semantic primitives (we author)   — the compiler's vocabulary
        │  ▼ assemble down into
  LAST AST constructors (last-builder: rt/ob/ar/el/cl/at/ky/pt)
        │  ▼ relottie-stringify
  Lottie JSON
```

**High-level primitives (authored on top of last-builder):**

| Primitive | Input | Lottie concept produced |
|---|---|---|
| `node(vertex)` | id, x/y/w/h, label | a shape layer (rect + text), position from frozen geometry |
| `fadeIn(layer, startF, endF)` | frame span | two opacity keyframes 0→100 |
| `edgePath(edge, fromBox, toBox)` | two endpoint geometries | the connector path shape (endpoints computed from frozen coords) |
| `flow(pathLayer, startF, endF)` | frame span | trim-path 0→100 (the line "drawing itself") |
| `highlight(layer, startF, endF)` | frame span | scale/stroke emphasis keyframes |

**Orchestration:** the compiler walks `timelineIR.events`; each event → its
primitive → one layer's keyframes. `reveal`→`node`+`fadeIn`; `flow`→`edgePath`+
`flow`; `highlight`→`highlight`.

**Assembly & serialization:**
- each primitive builds a LAST subtree with `last-builder` constructors (e.g.
  `el`/`ob`/`pt` describing a shape and its keyframes);
- all attached under `rt` (root animation), with `w/h/fr/op/ip` from the Timeline
  IR;
- `relottie-stringify` → Lottie JSON.

**Verified toolchain facts** (smoke-tested 2026-07-01, not assumed):
- `@lottiefiles/last-builder@1.15.0` exports unist-style AST constructors
  (`rt/ob/ar/el/cl/at/ky/pt`) — low-level LAST building blocks, confirming A1's
  premise that we author the semantic layer above them.
- `@lottiefiles/relottie@1.15.0` is a unified processor with `parse` and
  `stringify`; `relottie-stringify` provides the LAST AST → Lottie JSON direction.
- Round-trip confirmed: a minimal Lottie with `ks.o.k` opacity keyframes
  `[{t:0,s:[0]},{t:30,s:[100]}]` parses to LAST and stringifies back with
  `w/h/fr/op` and keyframes preserved — proving "two distinct keyframes = motion
  intent" is expressible and faithful through this pipeline.

## §5 renderer and the three gates

**renderer:** `render(lottieJSON, sampleFrames) → frames[]`, via **lottie-web
headless**, sampling frames `[0, n/4, n/2, 3n/4, n-1]` (lanshu's sampling). This
is the only component needing a render environment (fallback: puppeteer driving a
headless browser that loads lottie-web).

**Three gates** — all deterministic, model-free, cheapest-first, fail-fast:

```
Timeline IR ──▶ Builder gate   (对 + motion intent; render-free)
Lottie JSON ──▶ Compiler gate  (contract; static)
frames      ──▶ Render gate    (motion realization; render)
```

**Builder gate** (against Timeline IR, cheapest):
- small fixtures: hand-written canonical graphs (3-node chain / diamond DAG /
  cyclic) → assert the exact timeline;
- large-graph invariant verifier: each node revealed exactly once; each edge
  flows only after both endpoints; no negative frames; ordering respects the
  partial order — **invariants only, never re-derives the answer**;
- spatial freeze: `event.{x,y,w,h} === input vertex.{x,y,w,h}` verbatim;
- motion intent: each moving entity has `startF ≠ endF` and a changing value;
- golden file: **pure regression (change detection)**, paired with the explicit
  anchors above — never the sole correctness oracle.

**Compiler gate** (against Lottie JSON, static):
- schema validation (official `lottie.schema.json`);
- contract: `w/h/fr/op-ip` == Timeline IR's width/height/fps/totalFrames;
- **does not ask whether anything moves.**

**Render gate** (against frames, most expensive):
- frame-diff: changed pixels between adjacent sampled frames; `has_motion` = any
  pair > 0;
- contract re-check: rendered output dimensions == w/h;
- **visual semantics is model-free only**: has_motion, dimensions, at most
  "bounding boxes don't overlap at reveal time" (computable geometry). **Subjective
  aesthetics never enter any gate** — that is out-of-pipeline human review.

## Skill packaging

A CLI entry `structure.json → animation.json` (Lottie):
- `--verify` runs the three gates;
- `--check` validates the output contract;
- non-zero exit code on failure (lanshu's exit-nonzero discipline).

The skill manifest wraps this CLI.

## Verification strategy (split by oracle)

Correctness is verified by three mechanisms with independent oracles; the golden
file is demoted to pure change-detection (not a correctness oracle). Full rationale:
`references/layered-primitives-and-planner.md` and
`references/three-gate-quality-model.md`.

| Mechanism | Scope | Oracle | Proves |
|---|---|---|---|
| Hand-written fixtures | small canonical graphs | a human computed the answer | exact correctness |
| Independent verifier | large / real graphs | invariants | constraint legality |
| Golden file | any snapshot | previous run | change detection only |
| Render gate | rendered frames | rendering (model-free) | motion realization + contract |

## Dependencies (all MIT, verified on npm 2026-07-01)

- `@lottiefiles/last-builder@1.15.0` — LAST AST constructors.
- `@lottiefiles/last@1.15.0` — LAST type definitions.
- `@lottiefiles/relottie@1.15.0` (+ `relottie-stringify`, `relottie-parse`) —
  LAST ↔ Lottie JSON.
- `lottie-web` — headless renderer for the Render gate.
- official `lottie.schema.json` — Compiler-gate schema source.

## Out of scope for v0.1 (see docs/roadmap.md)

- Overrides (architecture reserved via the `overrides` slot; behavior deferred).
  When built: constraint input re-entering the planner (never a patch); semantic
  hooks only; time only, never space (layout stays decoupled).
- Content forms other than architecture/flowchart (data-viz, metric animation,
  UI mock, product demo).
- Use cases 2 & 3 (concept→animation, icon→micro-animation).
- Coordinate-free input / any layout engine.
- An assertion auto-generation framework.
