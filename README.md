# lottie-motion

Deterministic Node library that compiles structure diagrams (architecture
diagrams and flowcharts) into [Lottie](https://lottiefiles.com/) vector
animations. Same input always produces the same animation — the output is a
pure function of the input.

## What it does

Given a graph of vertices and edges, `lottie-motion` produces a Lottie JSON
animation where nodes reveal in order (topological for a DAG, visual order
otherwise), edges flow from source to target, and a closing highlight pulses
the sink node.

```
Structure IR  →  [planner]  →  Timeline IR  →  [compiler]  →  Lottie JSON  →  [render] frames
```

## Install

```bash
npm install lottie-motion
```

Requires **Node.js 18+**. The `canvas` dependency is used only by the render
gate (headless frame rendering).

## Quick start

```ts
import { validateStructure, plan, compile } from 'lottie-motion';

const structure = {
  vertices: [
    { id: 'a', label: 'Start',   x: 0,   y: 0, w: 120, h: 60 },
    { id: 'b', label: 'Process', x: 200, y: 0, w: 120, h: 60 },
    { id: 'c', label: 'End',     x: 400, y: 0, w: 120, h: 60 },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', label: '' },
    { id: 'e2', source: 'b', target: 'c', label: '' },
  ],
};

validateStructure(structure);           // throws StructureError on bad input
const timeline = plan(structure);        // Structure → Timeline IR
const lottie = compile(timeline);        // Timeline IR → Lottie JSON
// lottie is a plain object you can JSON.stringify and feed to any Lottie player
```

### Input: Structure IR

A canonical Vertex + Edge graph. Geometry (`x/y/w/h`) is **required and
frozen** — the planner never infers or mutates layout.

```jsonc
{
  "vertices": [
    { "id": "node-id", "label": "Node Label", "x": 0, "y": 0, "w": 100, "h": 50 }
  ],
  "edges": [
    { "id": "edge-id", "source": "node-a", "target": "node-b", "label": "" }
  ]
}
```

Vertices must have unique ids; edges must reference existing vertex ids.

### mxGraph input

If your diagram comes from draw.io / mxGraph XML, use the adapter:

```ts
import { parseMxGraph, plan, compile } from 'lottie-motion';

const structure = parseMxGraph(xmlString);
const lottie = compile(plan(structure));
```

## API

| Export | Description |
|---|---|
| `validateStructure(structure)` | Validates a Structure IR; throws `StructureError` on invalid input. |
| `plan(structure, overrides?)` | Structure → Timeline IR. Single time authority. `overrides` is reserved (no behavior in v0.1). |
| `compile(timeline)` | Timeline IR → Lottie JSON. |
| `render(lottie, frames)` / `sampleFrames(total)` | Headless frame rendering (used by the render gate). |
| `parseMxGraph(xml)` | mxGraph XML → Structure IR. |
| `builderGate`, `compilerGate`, `renderGate` | The three deterministic quality gates (see below). |

## Three-gate quality model

Every stage of the pipeline is checked by a deterministic gate:

1. **Builder gate** — Timeline IR correctness: reveal order, motion intent,
   spatial freeze (geometry never changes), label freeze.
2. **Compiler gate** — Lottie JSON contract: schema validity, canvas
   dimensions, fps, duration.
3. **Render gate** — Motion realization: a rendered frame-diff proves motion
   actually happens.

## Design principles

- **Deterministic** — same input always produces the same animation.
- **Single time authority** — the planner owns the entire timeline; no implicit
  time cursor.
- **Geometry is frozen** — layout is a read-only input, never inferred or
  mutated. Layout changes happen by editing the input `Structure`.
- **Pure function** — the artifact is always a pure function of inputs.

## Node labels

Labels render as filled vector glyph contours using a vendored copy of
[Fira Sans](https://github.com/mozilla/Fira) (SIL OFL 1.1). Vendoring a fixed
font keeps glyph paths byte-identical across machines, preserving determinism.
See `src/compiler/fonts/LICENSE-FiraSans.txt` for the font license.

## License

[MIT](./LICENSE)
