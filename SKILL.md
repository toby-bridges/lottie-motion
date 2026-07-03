# lottie-motion Skill

Deterministic compiler: **architecture diagram / flowchart structure → Lottie vector animation**.

## Input: structure.json

A canonical Structure IR (Vertex + Edge graph):

```json
{
  "vertices": [
    { "id": "node-id", "label": "Node Label", "x": 0, "y": 0, "w": 100, "h": 50 }
  ],
  "edges": [
    { "id": "edge-id", "source": "node-a", "target": "node-b", "label": "" }
  ]
}
```

- Geometry (`x/y/w/h`) is **required and frozen** (never inferred by the planner).
- Vertices must have unique ids; edges must reference existing vertex ids.

## Output: animation.json

A Lottie JSON animation file. Nodes reveal in topological order → edges flow → highlight closes.

## Usage

```bash
# Compile structure to animation (basic)
npx tsx src/cli.ts --input structure.json --output animation.json

# Verify with all three gates (Builder, Compiler, Render)
npx tsx src/cli.ts --input structure.json --output animation.json --verify

# Check output contract (canvas dimensions, fps, duration)
npx tsx src/cli.ts --input structure.json --output animation.json --check
```

## Flags

| Flag | Purpose |
|---|---|
| `--input <path>` | Path to input structure.json |
| `--output <path>` | Path to output animation.json |
| `--verify` | Run all three deterministic gates (fail-fast) |
| `--check` | Validate output contract (w/h/fr/op-ip) |

## Exit codes

- `0` — success
- `1` — validation error, planning error, compilation error, or gate failure

## Design principles

1. **Deterministic** — same input always produces same animation.
2. **Single time authority** — the planner owns the entire timeline.
3. **Geometry is frozen** — never inferred or mutated.
4. **Pure function** — output is always a pure function of the input.

## Three gates (--verify)

1. **Builder gate** — Timeline IR correctness: reveal order, motion intent, spatial freeze.
2. **Compiler gate** — Lottie JSON contract: schema validity, canvas/fps/duration.
3. **Render gate** — Motion realization: rendered frame-diff proves motion actually happens.

See `references/three-gate-quality-model.md` for full details.
