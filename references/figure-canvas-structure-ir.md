# Brought-in Reference: figure-canvas Structure IR

> Source project: `~/Desktop/codex flowchart/figure-canvas/` (a Codex plugin).
> This is a **distilled reference**, not a copy of the code. It captures the
> structure intermediate-representation (IR) that the lottie-motion v0.1 use
> case ("structure diagram → animation") will consume as input.

## Why this matters here

lottie-motion v0.1 validates the deterministic Lottie builder by turning a
**node-and-edge structure diagram** into an animated Lottie (nodes reveal in
order → edges flow → highlight). The structure it animates is exactly the IR
that figure-canvas already produces from `get_structure`. We reuse the IR shape
so the animation layer can later snap onto figure-canvas as the "animation
layer" its roadmap deferred.

## The fixed IR (from figure-canvas plan, 2026-06-22)

```
Vertex    = { id: string, label: string, x: number, y: number, w: number, h: number }
Edge      = { id: string, source: string, target: string, label: string }
Structure = { vertices: Vertex[], edges: Edge[] }
```

- Geometry (`x/y/w/h`) is in the diagram's own coordinate space.
- Connectivity is explicit (`edge.source` / `edge.target` reference vertex ids),
  **never inferred from geometry**. This determinism is the whole point — the
  animation builder reads exact node boxes and exact edge endpoints, it does not
  guess.

## Two equivalent serializations figure-canvas uses

1. **mxGraph XML** — the canonical, draw.io-compatible carrier.
   `<mxCell vertex="1">` for nodes (label in `value`, geometry in child
   `<mxGeometry>`); `<mxCell edge="1" source=".." target="..">` for edges.
2. **tldraw store records** — live canvas shapes. Connectivity is carried in
   shape `meta`: vertices have `meta.sciKind="vertex"`, `meta.sciCellId`; edges
   have `meta.sciKind="edge"`, `meta.sciCellId`, `meta.sciSourceId`,
   `meta.sciTargetId`. Both carry `meta.sciLabel`.

## Implication for lottie-motion v0.1

- Input format options to decide in design: take mxGraph XML directly (reuse
  figure-canvas's parser concept), OR define a tiny standalone `Structure` JSON
  that mirrors the IR above. The IR is small enough that a standalone JSON input
  keeps lottie-motion decoupled from figure-canvas while staying trivially
  bridgeable (one adapter from XML → Structure).
- The animation builder consumes `Structure` and emits Lottie JSON. The reveal
  order is topological when the graph is a DAG, visual order otherwise — this
  ordering rule is also inherited from the figure-canvas / code-driven-gifs
  lineage.
