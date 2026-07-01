# Design Insight: Two Lines of Defense — "没坏" vs "对"

> Distilled from a question raised by the lanshu author (`cclank`): does the
> quality gate prove the animation is *valid and unbroken*, or that it *matches
> the design intent*? The answer forced a clean separation that is now a core
> principle of lottie-motion.

## The distinction

A quality gate that samples rendered frames (lanshu's frame-diff) can prove the
animation **didn't break**. It cannot prove the animation is **correct** —
"pixels changed" is not "the right thing changed".

| Question | Solved by | When | Model-free? |
|---|---|---|---|
| Is it valid, unbroken, and really moving? (**"没坏"**) | Quality gate: schema validation + canvas/duration/fps contract + frame-diff `has_motion` | **After** generation | Yes |
| Does it match the design intent — reveal order, edge direction, semantics? (**"对"**) | Deterministic builder + unit tests on the builder | **Before** / by construction | Yes |

## What the quality gate proves ("没坏")

- Structural validity — emitted JSON passes the Lottie schema.
- Contract — `w/h`, `op`-`ip` (frame count), `fr` (frame rate) match the spec.
- **Really moves** — adjacent sampled frames differ (`has_motion`), ruling out
  the most insidious silent failure: legal JSON that animates nothing.

This is a deterministic, model-free, MUST-PASS lower bound. Its whole value is
catching "looked successful but is actually static / broken".

## What the quality gate canNOT prove ("对")

- Whether nodes reveal in **topological order**.
- Whether an edge flows **source → target** (not reversed).
- Whether the motion is semantically/aesthetically right — timing, occlusion,
  pacing.

"The picture is changing" ≠ "it changed into the right thing." Frame-diff sees
that pixels moved, not whether the thing that moved was the intended thing.

## Why this is the argument FOR the deterministic path

In a deterministic-builder architecture, "对" is not *detected after the fact* —
it is *guaranteed by construction*. Because the animation is produced by
deterministic functions like `revealInOrder(topologicalSort(structure))`,
correctness of order/direction/semantics becomes a **unit-testable property of
the builder**: given a `Structure`, assert the emitted keyframe timeline matches
the topological order — no rendering, no guessing.

This is precisely why we rejected the "LLM writes the whole Lottie JSON" path
(see the diffusionstudio anti-pattern note): under that path, "对" can only be
*checked by rendering and eyeballing*, because there is no deterministic logic to
test. Under our path, "对" is plain testable code.

## One-line takeaway

**Quality gate owns "没坏"; the deterministic builder owns "对".**
Two lines of defense, cleanly separated by when they act (after vs by
construction) and what they can possibly know (pixels-moved vs intent-met).

## Refinement: three gates

The lanshu author later split the single "quality gate" ("没坏") into two
cost-tiered gates — a static **Compiler gate** and a truthful **Render gate** —
producing a three-gate, fail-fast model. See [[three-gate-quality-model]] for the
refined version, which supersedes the two-gate framing here.

Related: [[three-gate-quality-model]], [[lanshu-frame-diff-verification]],
[[figure-canvas-structure-ir]].
