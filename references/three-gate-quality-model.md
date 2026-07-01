# Design Insight: Three-Gate Quality Model

> **This is the authoritative quality-gate model for lottie-motion.** Proposed by
> the lanshu author (`cclank`) as a refinement of an earlier two-gate framing
> (now archived at `_archive/two-lines-of-defense.md`). It splits the single
> post-generation "quality gate" into two cost-tiered gates, yielding three
> deterministic, model-free gates that escalate cheapest → most expensive. Fail
> fast: a cheap gate must pass before the next, more expensive one runs.

## The three gates

| Gate | Operates on | Catches (failure class) | Cost | Owns |
|---|---|---|---|---|
| **Builder gate** | the planner output / Timeline IR — before any Lottie JSON exists | wrong reveal order, reversed edge direction, missing/duplicated node, **motion *intent*** (a semantic entity lacks ≥2 distinct timeline events) — **semantic / design-intent** bugs | cheapest (pure unit tests, no render) | **"对"** + **motion-intent** |
| **Compiler gate** | the emitted Lottie JSON — static, no rendering | schema invalidity; canvas/fps/duration mismatch (`w/h`, `fr`, `op`-`ip`) — **the JSON contract only** | medium (pure data checks) | **"没坏"** (contract) |
| **Render gate** | lottie-web headless render, then frame-diff | renders to blank / fully static; occlusion; renderer-specific breakage despite valid JSON — **motion *realization*** (did pixels actually move) | most expensive (must spin up a renderer) | **"没坏"** (motion-realization) |

### Each gate owns exactly one motion facet (settled)

Motion is split across the gates so each has one non-overlapping job:

- **Builder gate — motion *intent*** (cheap, IR layer). Does each semantic entity
  carry ≥2 distinct timeline events? This is render-free and fundamentally a "对"
  question, so it lives here. Catches the most common builder bug (forgot the 2nd
  keyframe) WITHOUT spinning up a renderer.
- **Compiler gate — contract only.** Never asks "does it move."
- **Render gate — motion *realization*** (expensive, pixel layer). Did rendered
  pixels actually change (frame-diff `has_motion`)? Only the renderer can prove
  this.

This corrects an earlier framing that put *all* motion proof in the Render gate —
too strict, since motion-intent is cheaply checkable at the IR layer.

## Why three, not two

The two-lines model put everything that isn't "对" into one "quality gate." But
that gate actually contains two cleanly separable responsibilities:

- **Compiler gate — the JSON contract, statically.** After compiling to Lottie,
  check *only* the contract: schema validity and canvas/fps/duration (`w/h`,
  `fr`, `op`-`ip`). It does NOT ask whether anything moves.
- **Render gate — "really moves", after rendering.** Render via lottie-web
  headless, *then* run frame-diff. Proving the animation actually moves lives
  **entirely** here.

Splitting them buys a **fail-fast escalation ladder**: most defects are caught by
the two cheap gates (Builder, Compiler); the costly Render gate only runs once
the JSON is already known valid and contract-correct.

### Single responsibility per gate (the lanshu author's refinement)

An earlier draft put a cheap JSON-level motion check (≥2 distinct keyframe
values) into the Compiler gate, overlapping the Render gate's `has_motion`. We
**removed** that. The clean rule the lanshu author drew:

- **Compiler gate = contract only** (schema + `w/h`/`fr`/`op`-`ip`). Static. Never
  asks "does it move".
- **Render gate = motion only** (frame-diff after render). The *sole* owner of
  "really moves".

Trade-off accepted: "valid JSON but fully static" can now only be caught by
spinning up the Render gate — the cheap static interception is given up. In
exchange every gate has one non-overlapping job. For v0.1 the simplicity wins.
This supersedes the "JSON level vs rendered level" two-tier framing in the
archived `_archive/lanshu-frame-diff-verification.md`: the JSON tier keeps only
contract checks; all motion proof moves to the render tier. The frame-diff
*algorithm itself* (sample frames `[0, n//4, n//2, 3n//4, n-1]`, count changed
pixels between adjacent pairs, `has_motion` = any pair > 0) still ports directly
into the Render gate — only its placement changed.

## How "对" and "没坏" map onto the gates

- **Builder gate = "对"** — correctness of intent (order/direction/semantics),
  guaranteed by construction and verified by unit tests on deterministic
  functions like `revealInOrder(topologicalSort(structure))`. No rendering, no
  guessing.
- **Compiler gate + Render gate = "没坏"** — contract, then real motion.
  Compiler gate is the contract half (schema + `w/h`/`fr`/`op`-`ip`, static, no
  motion question); Render gate is the motion half (frame-diff `has_motion` on
  sampled rendered frames).

## One-line takeaway

**Builder gate (对 + motion-intent) → Compiler gate (没坏, contract) → Render gate
(没坏, motion-realization)** — three deterministic, model-free gates, run
cheapest-first, fail-fast; each owns exactly one motion facet, no overlap.

Related: [[figure-canvas-structure-ir]]. Archived precursors (superseded by this
doc): `_archive/two-lines-of-defense.md`, `_archive/lanshu-frame-diff-verification.md`.
