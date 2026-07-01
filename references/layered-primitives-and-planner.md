# Design Insight: Layered Primitives + Deterministic Planner

> **Core architecture decision for lottie-motion**, sitting alongside
> [[three-gate-quality-model]]. Answers the lanshu author's question — "graph-
> structure primitives, scene-timeline primitives, or hybrid? get it wrong and
> determinism breaks" — and incorporates his follow-up constraints on overrides.

## The answer: strict, layered hybrid

Not a choice between the three — a **layered hybrid**, forced by the locked
decision "Lottie is the base, all three use cases grow on it":

| Layer | Primitives | Role |
|---|---|---|
| **Scene-timeline layer** (the real base) | `fadeIn(layer, f0, f1)`, `moveAlongPath`, `stagger`, … | Generic. Serves all three use cases (structure-diagram, concept→animation, icon→micro-animation). |
| **Graph-structure layer** (v0.1 only) | `revealInOrder(structure)`, edge-flow, highlight | A pure *compiler* from `Structure` IR down to scene-timeline calls. |

Pure graph primitives as the base would strand use cases 2 & 3 (they have no
graph). Pure timeline primitives force the caller to hand-compute topological
order / edge direction. The hybrid is the only solution consistent with the
"base" decision: timeline layer is the foundation, graph layer is a v0.1-specific
compiler on top.

## Where determinism breaks (the failure modes)

1. **Two time authorities** — if both the graph layer and hand-written timeline
   calls can set time, output depends on call/merge order → not reproducible.
2. **Implicit time cursor** — if timeline primitives keep a shared "current
   frame" (turtle-style), reordering calls changes output and blocks parallel
   generation.
3. **Geometry leakage** — if the graph layer *guesses* coordinates instead of
   reading the IR's explicit `x/y/w/h` (violating figure-canvas's "never infer
   connectivity/geometry" rule), reveal positions become unreproducible.

## The rules that preserve determinism (the lanshu author's constraints)

1. **Timeline has exactly one owner: the deterministic planner.** Not merely
   "only the planner assigns time" — the *entire timeline is owned* by the
   planner. No other role may ever write to it.

2. **Local overrides never patch a generated artifact.** An override must NOT
   patch an already-generated timeline, and *especially* not the Lottie JSON.
   Patching the artifact makes output = `planner(input)` + a pile of post-hoc
   surgery — no longer a pure function, no longer reproducible. Instead, an
   override is an **additional constraint input** that re-enters the planner:
   `plan(structure, overrides)` produces a fresh timeline from scratch. **The
   artifact is always cleanly generated from inputs, never edited after the
   fact. Determinism = the artifact is always a pure function of the inputs.**

3. **Overrides attach only to semantic hooks.** Never "shift frame 47 later"
   (anchored to a physical coordinate in the artifact — breaks the moment the
   artifact changes). Only "delay node `auth-service`'s reveal by 0.5s" (anchored
   to a **semantic entity**). Overrides reference **stable IDs in the input
   space** (node id, edge id, semantic event), never frame numbers in the output
   space. This keeps overrides valid and deterministic across regenerations.

## Overrides change TIME, never SPACE (layout stays decoupled)

The lanshu author asked whether an override can change *layout* — because the
answer decides whether the layout planner and the animation planner are **one
constraint system or two decoupled ones**. **Decision: decoupled. Overrides may
only move time, never space.**

Forced by the existing rules: geometry (`x/y/w/h`) is **owned by the upstream
structure layer** (figure-canvas / Structure IR); the animation planner reads it
read-only and never guesses (rule 3 above). So layout is a **frozen upstream
input** to the animation planner, not something it computes. Letting an override
change layout would create **two geometry authorities** (figure-canvas's layout +
lottie-motion's override) — the same class of bug as two time authorities, just
in the spatial dimension — and would re-implement figure-canvas's layout layer
(scope creep).

| Dimension | Owner | Can an override touch it? |
|---|---|---|
| **Space** (layout / geometry) | upstream (figure-canvas / Structure IR) | **No** |
| **Time** (order / delay / easing / duration) | animation planner | Yes (via semantic hook) |

To change layout you change the *input* `Structure` (in the figure-canvas layer)
and re-enter the animation planner — that is not an animation override. This
keeps the animation planner a pure function of **(frozen geometry, time
overrides)**.

## Refinements to the gate model

1. **Motion is split across gates (settled — see [[three-gate-quality-model]]).**
   *Motion intent* (does a semantic entity carry ≥2 distinct timeline events?) is
   cheaply assertable at the Timeline IR layer, render-free, and is a "对"
   question → **Builder gate**. *Motion realization* (did pixels actually move?) →
   **Render gate**. Compiler gate stays contract-only. Each gate owns exactly one
   non-overlapping motion facet. (This corrected the author's "all motion proof
   in the Render gate" framing, which was too strict.)

2. **Don't over-formalize the Timeline IR.** For v0.1 it should be the planner's
   **typed in-memory return value**, NOT a serialized format with its own parser.
   Formalize it into a serialized IR only when a real external consumer appears
   (e.g. persisting timelines, cross-tool exchange). Otherwise it's gold-plating
   / wheel-reinventing (a figure-canvas death cause).

## The pipeline: emit a Timeline IR, then compile to Lottie

A small but important intermediate layer (the lanshu author's suggestion). One
extra IR between planner and Lottie:

```
Structure + overrides
      │  ▼ planner (pure function)
  Timeline IR        ← Builder gate tests "对" here (semantic, readable, testable)
      │  ▼ compiler
  Lottie JSON        ← Compiler gate tests the contract here (schema / w·h / fr / op-ip)
      │  ▼ lottie-web headless
  rendered frames    ← Render gate tests "really moves" here (frame-diff)
```

Why the Timeline IR earns its place:
- The Builder gate asserts against a **human-readable semantic timeline**
  ("`auth-service` fadeIn over frames 0–12") instead of a blob of Lottie JSON —
  tests stay stable and legible.
- It makes the three gates map **one-to-one** onto the three pipeline stages.
- It isolates "semantic intent → timing" (planner) from "timing → Lottie shapes"
  (compiler): two small, independently testable units.

## The Timeline IR snapshot is the golden file

The lanshu author's observation: once the planner emits a Timeline IR, a
**snapshot of that IR is the golden file** — and it is the one artifact that
simultaneously proves all three determinism properties:

1. **Order is deterministic** — the snapshot pins reveal order (topological).
   Anything that scrambles order blows up the snapshot diff.
2. **Time is deterministic** — the snapshot pins each event's frame number. If the
   planner stops being a pure function (sneaks in an implicit cursor / call-order
   dependence), the timing drifts and the snapshot catches it immediately.
3. **Space was not secretly changed by the animation layer** — the sharpest
   point. Because geometry is a **read-only frozen upstream input**, the reveal
   coordinates recorded in the Timeline IR snapshot MUST equal the input
   `Structure`'s `x/y/w/h` verbatim. If the animation layer ever quietly "nudges"
   a coordinate (violating the geometry-read-only rule), the snapshot's spatial
   values diverge from the input — the golden file catches the leak.

So the **Timeline IR golden file is the concrete implementation form of the
Builder gate.** Not another check — the most natural way to land "test 对". It
also incidentally proves motion-intent (≥2 distinct events are visible in the
snapshot).

**Boundary:** a golden file proves "same as last time," NOT "correct." The first
snapshot must still be confirmed correct by a human or explicit assertions —
otherwise you've frozen a wrong output as the gold standard. So pair the snapshot
with a few **explicit semantic anchors** (e.g. "`auth-service`'s reveal frame <
`db`'s reveal frame") rather than relying on the snapshot alone.

### Verification split by oracle (the authoritative model)

Correctness is verified by **three mechanisms split by graph scale**, each with a
different, independent oracle. This supersedes an earlier draft that hung
"semantic anchor categories" on the golden file — the golden file is now demoted
to pure change-detection and is NOT a correctness oracle at all.

| Mechanism | Scope | Oracle (source of truth) | Proves |
|---|---|---|---|
| **Hand-written fixtures** | small canonical graphs | a human computed the exact expected timeline | exact correctness ("对", precisely) |
| **Independent verifier** | large / real graphs | **invariants** any correct output must satisfy | constraint legality |
| **Golden file** | any snapshot | the previous run of itself | **change detection only** (regression) |
| **Render gate** | rendered frames | rendering | visual semantics (see constraint below) |

Why this is better: it resolves the "golden proves *consistency*, not
*correctness*" boundary by **removing correctness from the golden file's job
entirely**. Correctness is proven by fixtures (small, exact, human oracle) and the
verifier (large, invariant oracle); golden only catches "did the output change
unexpectedly."

#### Two constraints that MUST hold (challenges to the proposal)

1. **Render gate's "visual semantics" must stay model-free / mechanical.** The
   whole pipeline's invariant is *all three gates are deterministic and
   model-free*. "Visual semantics" must mean only mechanically-decidable checks:
   `has_motion` (frame-diff), the contract (`w/h`, `fr`), and at most geometric
   checks like "node bounding boxes don't overlap at reveal time." **Subjective
   aesthetics ("does it look good / occlude nicely") may NOT enter any gate** — that
   is out-of-pipeline human review, not the Render gate. Otherwise determinism
   breaks.

2. **The independent verifier checks INVARIANTS, never RE-DERIVES the answer.**
   - *Invariant check* (legitimate): each node revealed exactly once; an edge
     reveals only after both endpoints; no negative frames; ordering respects the
     partial order. These are properties any correct output satisfies — an
     independent, cheap oracle.
   - *Re-derivation* (forbidden): the verifier recomputing the full topological
     timeline and diffing it. That is just a **second planner** — when the two
     disagree there is no tiebreaker, and it doubles the maintenance of the hard
     logic. "Check constraint legality" must mean invariants, not recomputation.

#### Small vs large boundary (concrete rule for v0.1)

- **Small (hand-written exact fixtures):** canonical graphs whose answer a human
  can compute by hand — a 3-node chain, a diamond DAG, a graph with a cycle.
- **Large (verifier, invariants only):** generated or real architecture/flowchart
  diagrams.

### Not for v0.1: an auto-generation framework

Building an assertion-generation engine is gold-plating / wheel-reinventing (a
figure-canvas death cause). v0.1 has one content form (architecture + flowchart):
a handful of hand-written fixtures + the invariant verifier + a regression golden
is enough. Defer any auto-generation engine until it pays for itself.

## v0.1 scope (locked)

v0.1 **builds the architecture but does not implement overrides.** The planner
signature reserves the `overrides` parameter slot (`plan(structure, overrides)`),
but v0.1 implements no override behavior — it validates the full pipeline with
**pure `Structure` → Timeline IR → Lottie → rendered** first. Consistent with the
locked "base-first, v0.1 minimal-validation" decision. Overrides (semantic-hook,
re-enter-planner) are designed-for but deferred.

## One-line takeaway

**One timeline owner (the planner); overrides are constraint *inputs* that
re-run the planner, never patches; overrides bind to semantic hooks, not frame
numbers; planner emits a Timeline IR that then compiles to Lottie.** Determinism
= the artifact is always a pure function of the inputs.

Related: [[three-gate-quality-model]], [[figure-canvas-structure-ir]].
