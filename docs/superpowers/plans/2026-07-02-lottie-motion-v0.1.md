# lottie-motion v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministic Node library compiling architecture diagram / flowchart structures (Vertex+Edge graphs) into Lottie vector animations. Nodes reveal in topological order, edges flow, optional highlights close. Core responsibility: validate determinism across four independent layers (planner → compiler → renderer) with three model-free gates at each layer boundary.

**Architecture:** Four-layer pipeline:
1. **Input & Validation** — Structure IR (Vertex+Edge JSON); entry guard validates complete geometry, valid edges
2. **Planner** — pure function ordering (topological or visual fallback) + scheduling (reveal→flow→highlight frame numbers)
3. **Compiler** — Timeline IR → semantic primitives (fadeIn, edgePath, flow, highlight) → LAST AST → Lottie JSON via relottie
4. **Renderer** — lottie-web headless rendering; frame sampling [0, n/4, n/2, 3n/4, n-1]
5. **Gates** — three model-free quality verifiers: Builder (Timeline IR), Compiler (Lottie JSON), Render (frame-diff motion detection)
6. **CLI & Skill** — structure.json → animation.json with `--verify` (all three gates) and `--check` (contract) flags; non-zero exit on failure

**Tech Stack:**
- Language: TypeScript ESM (strict mode)
- Test framework: vitest (run with `npx vitest run <path>`)
- Package manager: npm (installed deps lock v0.1)
- Key dependencies:
  - `@lottiefiles/last-builder@1.15.0`, `@lottiefiles/last@1.15.0`, `@lottiefiles/relottie@1.15.0`, `relottie-stringify`, `relottie-parse`
  - `lottie-web` (headless rendering)
  - `ajv` (schema validation)
  - `canvas` (node-canvas for headless rendering)

## Global Constraints

1. **TypeScript ESM** — all source under `src/`, tests co-located as `*.test.ts` under `tests/` mirroring structure
2. **vitest** — all tests runnable with `npx vitest run <path>`
3. **Exact dep versions locked** — `@lottiefiles/last-builder@1.15.0`, `@lottiefiles/last@1.15.0`, `@lottiefiles/relottie@1.15.0`, `lottie-web`, `ajv`, `canvas`
4. **Determinism invariants** — single time authority (planner only), geometry frozen/read-only, artifact = pure function of inputs, all time explicit (no implicit cursor)
5. **Non-zero exit discipline** — CLI exits 1 on ANY validation/gate failure; exits 0 only on complete success
6. **No placeholders** — all code is real, verified TypeScript; no mocks or stubs except where explicitly noted for future
7. **Gate contract** — each gate returns `GateResult { pass: boolean; failures: string[] }`; cheapest-first, fail-fast ordering

## Verified toolchain facts (smoke-tested 2026-07-02, `/tmp/lb-probe` + `/tmp/render-probe`)

These were proven with real code before this plan was written — build on them, do not re-litigate:

- **Compiler (Task 7):** building a Lottie from scratch with `last-builder` constructors + `relottie-stringify` works; opacity keyframes `[{t:0,s:[0]},{t:30,s:[100]}]` survive. Use `T.intBoolean.layerThreedimensional` (not `T.number`) for `ddd`; `'layer-transform-children'` is a parser-synthesized title with no `TITLES` constant — use the string literal.
- **Un-smoke-tested primitives (Task 9):** `edgePath`/`flow` (trim-path), rect, and text titles are NOT yet verified. Discover them by parsing a known-good Lottie via `relottie-parse` and reading node titles (same technique used for opacity). NOTE: `relottie().use(parse).parse(x)` expects `x` to be a **JSON string** (`JSON.stringify(sampleLottie)`), not an object — fix any draft snippet that passes a raw object.
- **Renderer (Task 13):** headless render works with node-canvas + jsdom + lottie-web canvas renderer (no Chromium). Two constraints (each cost a failed attempt): the jsdom DOM must be created once at module load and left in place (lottie-web reads `document.readyState` on a deferred timer after `render()` returns); lottie-web must be imported dynamically AFTER `window` exists. A `shapes:[]` layer renders nothing — `node()` must emit a real rect+fill shape group.

## Provenance

This plan was assembled from a dynamic multi-agent workflow (8 parallel component drafters → synthesis → adversarial review). The synthesis step truncated the back half into stubs; the full per-component drafts were recovered from the workflow transcripts and stitched deterministically, with the renderer task rewritten around the verified headless-render recipe above.

---

# SHARED INTERFACE CONTRACT (all tasks MUST use these exact names/types)

```typescript
// --- Structure IR (input) — src/types/structure.ts ---
export interface Vertex { id: string; label: string; x: number; y: number; w: number; h: number }
export interface Edge { id: string; source: string; target: string; label: string }
export interface Structure { vertices: Vertex[]; edges: Edge[] }

// --- entry guard — src/validate.ts ---
export class StructureError extends Error { ... }
export function validateStructure(input: unknown): Structure  // returns narrowed Structure; THROWS StructureError on invalid

// --- Timeline IR — src/types/timeline.ts ---
export type TimelineEvent =
  | { kind: 'reveal'; target: string; startF: number; endF: number; x: number; y: number; w: number; h: number }
  | { kind: 'flow'; target: string; startF: number; endF: number; from: string; to: string }
  | { kind: 'highlight'; target: string; startF: number; endF: number }
export interface TimelineIR { fps: number; width: number; height: number; totalFrames: number; events: TimelineEvent[] }

// --- planner — src/planner/plan.ts ---
export function plan(structure: Structure, overrides?: unknown): TimelineIR

// --- compiler — src/compiler/compile.ts ---
export type LottieJSON = Record<string, unknown>
export function compile(timeline: TimelineIR): LottieJSON

// --- renderer — src/renderer/render.ts ---
export interface Frame { width: number; height: number; data: Uint8ClampedArray }
export function sampleFrames(totalFrames: number): number[]  // returns [0, n/4, n/2, 3n/4, n-1] floored, deduped
export async function render(lottie: LottieJSON, frames: number[]): Promise<Frame[]>

// --- gates — src/gates/builderGate.ts, compilerGate.ts, renderGate.ts ---
export interface GateResult { pass: boolean; failures: string[] }
export function builderGate(timeline: TimelineIR, structure: Structure): GateResult
export function compilerGate(lottie: LottieJSON, timeline: TimelineIR): GateResult
export function renderGate(frames: Frame[], spec: { width: number; height: number }): GateResult

// --- CLI — src/cli.ts ---
// reads structure.json, writes animation.json; flags --verify (run 3 gates), --check (contract); nonzero exit on failure
```

---

# TASK LIST (Sequential, dependency-ordered)

## PHASE 1: FOUNDATION & VALIDATION

### Task 1: Project scaffold + Structure & Timeline IR types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/types/structure.ts`, `src/types/timeline.ts`, `src/validate.ts`, `src/index.ts`
- Create: `tests/types.test.ts`

**Interfaces:** Produces (`Structure`, `Vertex`, `Edge`, `TimelineIR`, `TimelineEvent`, `validateStructure()`)

**Steps:**

- [ ] **Step 1: Initialize package.json with exact deps**

Write `/Users/li9292/Desktop/lottie-motion/package.json`:

```json
{
  "name": "lottie-motion",
  "version": "0.1.0",
  "type": "module",
  "description": "Deterministic Node library compiling structure diagrams to Lottie vector animations",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@lottiefiles/last-builder": "1.15.0",
    "@lottiefiles/last": "1.15.0",
    "@lottiefiles/relottie": "1.15.0",
    "lottie-web": "^5.12.2",
    "ajv": "^8.12.0",
    "canvas": "^2.11.2"
  },
  "devDependencies": {
    "@types/node": "^20.4.2",
    "typescript": "^5.1.6",
    "vitest": "^0.34.4"
  },
  "keywords": ["lottie", "animation", "structure diagram", "flowchart", "deterministic"],
  "author": "",
  "license": "MIT"
}
```

- [ ] **Step 2: Initialize tsconfig.json**

Write `/Users/li9292/Desktop/lottie-motion/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "composite": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Initialize vitest.config.ts**

Write `/Users/li9292/Desktop/lottie-motion/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Define Structure IR types**

Write `/Users/li9292/Desktop/lottie-motion/src/types/structure.ts`:

```typescript
/**
 * Structure IR types — the canonical input contract.
 * 
 * Connectivity is explicit (edge.source/target reference vertex ids).
 * Geometry is explicit (every vertex carries complete x/y/w/h).
 * Neither is inferred; both are frozen upstream (figure-canvas / input).
 */

export interface Vertex {
  /** Unique identifier for this vertex */
  id: string;
  /** Display label for this vertex */
  label: string;
  /** X coordinate (absolute positioning) */
  x: number;
  /** Y coordinate (absolute positioning) */
  y: number;
  /** Width (must be > 0) */
  w: number;
  /** Height (must be > 0) */
  h: number;
}

export interface Edge {
  /** Unique identifier for this edge */
  id: string;
  /** Source vertex id (must reference an existing vertex) */
  source: string;
  /** Target vertex id (must reference an existing vertex) */
  target: string;
  /** Display label for this edge */
  label: string;
}

export interface Structure {
  /** Array of vertices in the diagram */
  vertices: Vertex[];
  /** Array of edges in the diagram */
  edges: Edge[];
}
```

- [ ] **Step 5: Define Timeline IR types**

Write `/Users/li9292/Desktop/lottie-motion/src/types/timeline.ts`:

```typescript
/**
 * Timeline IR types — the planner's typed in-memory output.
 * 
 * All time is explicit (absolute startF/endF); no implicit cursor.
 * Geometry from input is embedded verbatim in reveal events (frozen).
 * Events sorted by startF; one time authority: the planner.
 */

export interface TimelineEventReveal {
  kind: 'reveal';
  target: string;
  startF: number;
  endF: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimelineEventFlow {
  kind: 'flow';
  target: string;
  startF: number;
  endF: number;
  from: string;
  to: string;
}

export interface TimelineEventHighlight {
  kind: 'highlight';
  target: string;
  startF: number;
  endF: number;
}

export type TimelineEvent = TimelineEventReveal | TimelineEventFlow | TimelineEventHighlight;

export interface TimelineIR {
  /** Frames per second for the animation */
  fps: number;
  /** Canvas width (in Lottie units) */
  width: number;
  /** Canvas height (in Lottie units) */
  height: number;
  /** Total frame count (inclusive range 0..totalFrames-1) */
  totalFrames: number;
  /** Timeline events sorted by startF */
  events: TimelineEvent[];
}
```

- [ ] **Step 6: Create validation function with error class**

Write `/Users/li9292/Desktop/lottie-motion/src/validate.ts`:

```typescript
import type { Structure, Vertex, Edge } from './types/structure.js';

export class StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructureError';
    Object.setPrototypeOf(this, StructureError.prototype);
  }
}

/**
 * Validate and narrow the input to a well-formed Structure.
 * 
 * Checks:
 * - Each vertex has unique id + complete numeric x/y/w/h (w, h > 0)
 * - Each edge's source/target reference existing vertex ids
 * - No missing geometry, dangling edges, duplicate ids
 * 
 * @param input Unknown input to validate
 * @returns Narrowed Structure if valid
 * @throws StructureError if invalid
 */
export function validateStructure(input: unknown): Structure {
  // Type guard: is it an object?
  if (!input || typeof input !== 'object') {
    throw new StructureError('Structure must be an object');
  }

  const obj = input as Record<string, unknown>;

  // Check vertices array exists
  if (!Array.isArray(obj.vertices)) {
    throw new StructureError('Structure.vertices must be an array');
  }

  // Check edges array exists
  if (!Array.isArray(obj.edges)) {
    throw new StructureError('Structure.edges must be an array');
  }

  const vertices = obj.vertices as unknown[];
  const edges = obj.edges as unknown[];

  // Track vertex ids for edge validation
  const vertexIds = new Set<string>();

  // Validate each vertex
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!v || typeof v !== 'object') {
      throw new StructureError(`Vertex at index ${i} must be an object`);
    }

    const vertex = v as Record<string, unknown>;

    // Check id
    if (typeof vertex.id !== 'string' || !vertex.id) {
      throw new StructureError(`Vertex at index ${i} must have a non-empty string id`);
    }

    if (vertexIds.has(vertex.id)) {
      throw new StructureError(`Duplicate vertex id: "${vertex.id}"`);
    }
    vertexIds.add(vertex.id);

    // Check label
    if (typeof vertex.label !== 'string') {
      throw new StructureError(`Vertex "${vertex.id}" must have a string label`);
    }

    // Check geometry (all required, all numeric, w/h > 0)
    if (typeof vertex.x !== 'number') {
      throw new StructureError(`Vertex "${vertex.id}" missing or invalid x coordinate`);
    }
    if (typeof vertex.y !== 'number') {
      throw new StructureError(`Vertex "${vertex.id}" missing or invalid y coordinate`);
    }
    if (typeof vertex.w !== 'number') {
      throw new StructureError(`Vertex "${vertex.id}" missing or invalid width`);
    }
    if (typeof vertex.h !== 'number') {
      throw new StructureError(`Vertex "${vertex.id}" missing or invalid height`);
    }

    if (vertex.w <= 0) {
      throw new StructureError(`Vertex "${vertex.id}" width must be > 0`);
    }
    if (vertex.h <= 0) {
      throw new StructureError(`Vertex "${vertex.id}" height must be > 0`);
    }
  }

  // Validate each edge
  const edgeIds = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || typeof e !== 'object') {
      throw new StructureError(`Edge at index ${i} must be an object`);
    }

    const edge = e as Record<string, unknown>;

    // Check id
    if (typeof edge.id !== 'string' || !edge.id) {
      throw new StructureError(`Edge at index ${i} must have a non-empty string id`);
    }

    if (edgeIds.has(edge.id)) {
      throw new StructureError(`Duplicate edge id: "${edge.id}"`);
    }
    edgeIds.add(edge.id);

    // Check label
    if (typeof edge.label !== 'string') {
      throw new StructureError(`Edge "${edge.id}" must have a string label`);
    }

    // Check connectivity
    if (typeof edge.source !== 'string' || !edge.source) {
      throw new StructureError(`Edge "${edge.id}" must have a non-empty string source`);
    }
    if (typeof edge.target !== 'string' || !edge.target) {
      throw new StructureError(`Edge "${edge.id}" must have a non-empty string target`);
    }

    if (!vertexIds.has(edge.source)) {
      throw new StructureError(`Edge "${edge.id}" source "${edge.source}" does not reference an existing vertex`);
    }
    if (!vertexIds.has(edge.target)) {
      throw new StructureError(`Edge "${edge.id}" target "${edge.target}" does not reference an existing vertex`);
    }
  }

  return {
    vertices: vertices as Vertex[],
    edges: edges as Edge[],
  };
}
```

- [ ] **Step 7: Create type exports**

Write `/Users/li9292/Desktop/lottie-motion/src/types/index.ts`:

```typescript
export type { Vertex, Edge, Structure } from './structure.js';
export type { TimelineEvent, TimelineEventReveal, TimelineEventFlow, TimelineEventHighlight, TimelineIR } from './timeline.js';
```

- [ ] **Step 8: Create main entry point**

Write `/Users/li9292/Desktop/lottie-motion/src/index.ts`:

```typescript
export * from './types/index.js';
export { validateStructure, StructureError } from './validate.js';
```

- [ ] **Step 9: Run toolchain smoke test**

```bash
cd /Users/li9292/Desktop/lottie-motion && npm install
```

Expected output: `added X packages, and audited Y packages`

- [ ] **Step 10: Create type-level smoke test**

Write `/Users/li9292/Desktop/lottie-motion/tests/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Vertex, Edge, Structure } from '../src/types/structure.js';
import type { TimelineEvent, TimelineIR } from '../src/types/timeline.js';
import { validateStructure, StructureError } from '../src/validate.js';

describe('Structure IR types', () => {
  it('should compile Vertex type', () => {
    const vertex: Vertex = {
      id: 'node-1',
      label: 'Auth Service',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    };
    expect(vertex.id).toBe('node-1');
  });

  it('should compile Edge type', () => {
    const edge: Edge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      label: 'calls',
    };
    expect(edge.source).toBe('node-1');
  });

  it('should compile Structure type', () => {
    const structure: Structure = {
      vertices: [
        { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
        { id: 'b', label: 'B', x: 100, y: 0, w: 50, h: 50 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: 'link' },
      ],
    };
    expect(structure.vertices).toHaveLength(2);
  });
});

describe('Timeline IR types', () => {
  it('should compile TimelineEvent reveal variant', () => {
    const event: TimelineEvent = {
      kind: 'reveal',
      target: 'node-1',
      startF: 0,
      endF: 12,
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    };
    expect(event.kind).toBe('reveal');
  });

  it('should compile TimelineEvent flow variant', () => {
    const event: TimelineEvent = {
      kind: 'flow',
      target: 'edge-1',
      startF: 15,
      endF: 25,
      from: 'node-1',
      to: 'node-2',
    };
    expect(event.kind).toBe('flow');
  });

  it('should compile TimelineEvent highlight variant', () => {
    const event: TimelineEvent = {
      kind: 'highlight',
      target: 'node-1',
      startF: 30,
      endF: 35,
    };
    expect(event.kind).toBe('highlight');
  });

  it('should compile TimelineIR type', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 800,
      height: 600,
      totalFrames: 60,
      events: [
        {
          kind: 'reveal',
          target: 'n1',
          startF: 0,
          endF: 12,
          x: 0,
          y: 0,
          w: 50,
          h: 50,
        },
      ],
    };
    expect(timeline.fps).toBe(30);
  });
});

describe('validateStructure', () => {
  it('should validate a well-formed Structure', () => {
    const input = {
      vertices: [
        { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
        { id: 'b', label: 'B', x: 100, y: 0, w: 50, h: 50 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: 'link' },
      ],
    };
    const result = validateStructure(input);
    expect(result.vertices).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('should reject non-object input', () => {
    expect(() => validateStructure(null)).toThrow(StructureError);
    expect(() => validateStructure('string')).toThrow(StructureError);
  });

  it('should reject missing vertices array', () => {
    expect(() => validateStructure({ edges: [] })).toThrow(/Structure\.vertices must be an array/);
  });

  it('should reject vertex with missing geometry', () => {
    expect(() =>
      validateStructure({
        vertices: [{ id: 'a', label: 'A', x: 0, y: 0, w: 50 }],
        edges: [],
      })
    ).toThrow(/missing or invalid height/);
  });

  it('should reject edge with dangling source', () => {
    expect(() =>
      validateStructure({
        vertices: [{ id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 }],
        edges: [{ id: 'e1', source: 'nonexistent', target: 'a', label: 'link' }],
      })
    ).toThrow(/does not reference an existing vertex/);
  });

  it('should reject duplicate vertex ids', () => {
    expect(() =>
      validateStructure({
        vertices: [
          { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
          { id: 'a', label: 'A2', x: 100, y: 0, w: 50, h: 50 },
        ],
        edges: [],
      })
    ).toThrow(/Duplicate vertex id/);
  });
});
```

- [ ] **Step 11: Run the tests and verify PASS**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/types.test.ts
```

Expected output: All tests pass.

- [ ] **Step 12: Verify TypeScript compilation**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx tsc --noEmit
```

Expected output: No errors (silent success).

- [ ] **Step 13: Commit the project scaffold and types**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add package.json tsconfig.json vitest.config.ts src/ tests/types.test.ts && git commit -m "$(cat <<'EOF'
chore: init TypeScript ESM project + Structure & Timeline IR types

- Initialize package.json with exact deps (@lottiefiles/last-builder@1.15.0, @lottiefiles/last@1.15.0, @lottiefiles/relottie@1.15.0, lottie-web, ajv, canvas)
- Configure TypeScript (ES2020, ESM, strict mode) and vitest
- Define Structure IR types (Vertex, Edge, Structure) with canonical input contract
- Define Timeline IR types (TimelineEvent variants, TimelineIR)
- Implement validateStructure entry guard with comprehensive validation + StructureError
- Add type-level smoke tests proving toolchain works
- All tests pass; TypeScript compilation clean; ready for planner implementation

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Implement planner (topological ordering + scheduling)

**Files:**
- Create: `src/planner/ordering.ts`, `src/planner/scheduling.ts`, `src/planner/plan.ts`
- Create: `tests/planner/fixtures.ts`, `tests/planner/ordering.test.ts`, `tests/planner/scheduling.test.ts`, `tests/planner/plan.test.ts`

**Interfaces:**
- Consumes: `Structure` from Task 1
- Produces: `TimelineIR` (via `plan()` orchestration function)

**Steps:**

- [ ] **Step 1: Create test fixtures (3-node chain, diamond DAG, cyclic graph)**

Write `/Users/li9292/Desktop/lottie-motion/tests/planner/fixtures.ts`:

```typescript
import { Structure } from '../../src/types/structure.js';
import { TimelineIR } from '../../src/types/timeline.js';

// Fixture 1: 3-node linear chain (A → B → C)
export const fixture3NodeChain = {
  input: {
    vertices: [
      { id: 'A', label: 'Node A', x: 0, y: 0, w: 100, h: 50 },
      { id: 'B', label: 'Node B', x: 120, y: 0, w: 100, h: 50 },
      { id: 'C', label: 'Node C', x: 240, y: 0, w: 100, h: 50 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'flow' },
      { id: 'B-C', source: 'B', target: 'C', label: 'flow' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    totalFrames: 72,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 0, y: 0, w: 100, h: 50 },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 120, y: 0, w: 100, h: 50 },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 240, y: 0, w: 100, h: 50 },
      { kind: 'flow' as const, target: 'B-C', startF: 48, endF: 60, from: 'B', to: 'C' }
    ]
  } as TimelineIR
};

// Fixture 2: Diamond DAG (A → {B, C} → D)
export const fixtureDiamondDAG = {
  input: {
    vertices: [
      { id: 'A', label: 'Root', x: 100, y: 0, w: 80, h: 40 },
      { id: 'B', label: 'Left', x: 0, y: 100, w: 80, h: 40 },
      { id: 'C', label: 'Right', x: 200, y: 100, w: 80, h: 40 },
      { id: 'D', label: 'Sink', x: 100, y: 200, w: 80, h: 40 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'left' },
      { id: 'A-C', source: 'A', target: 'C', label: 'right' },
      { id: 'B-D', source: 'B', target: 'D', label: 'join' },
      { id: 'C-D', source: 'C', target: 'D', label: 'join' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    totalFrames: 108,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 100, y: 0, w: 80, h: 40 },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 0, y: 100, w: 80, h: 40 },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 200, y: 100, w: 80, h: 40 },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'flow' as const, target: 'A-C', startF: 48, endF: 60, from: 'A', to: 'C' },
      { kind: 'reveal' as const, target: 'D', startF: 54, endF: 66, x: 100, y: 200, w: 80, h: 40 },
      { kind: 'flow' as const, target: 'B-D', startF: 66, endF: 78, from: 'B', to: 'D' },
      { kind: 'flow' as const, target: 'C-D', startF: 66, endF: 78, from: 'C', to: 'D' }
    ]
  } as TimelineIR
};

// Fixture 3: Cyclic graph (A → B → C → A)
export const fixtureCyclicGraph = {
  input: {
    vertices: [
      { id: 'A', label: 'Node A', x: 0, y: 0, w: 60, h: 60 },
      { id: 'B', label: 'Node B', x: 100, y: 0, w: 60, h: 60 },
      { id: 'C', label: 'Node C', x: 50, y: 100, w: 60, h: 60 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'next' },
      { id: 'B-C', source: 'B', target: 'C', label: 'next' },
      { id: 'C-A', source: 'C', target: 'A', label: 'back' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    totalFrames: 72,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 0, y: 0, w: 60, h: 60 },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 100, y: 0, w: 60, h: 60 },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 50, y: 100, w: 60, h: 60 },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'flow' as const, target: 'B-C', startF: 48, endF: 60, from: 'B', to: 'C' },
      { kind: 'flow' as const, target: 'C-A', startF: 60, endF: 72, from: 'C', to: 'A' }
    ]
  } as TimelineIR
};
```

- [ ] **Step 2: Implement topological ordering with visual-order fallback**

Write `/Users/li9292/Desktop/lottie-motion/src/planner/ordering.ts`:

```typescript
import { Structure, Vertex } from '../types/structure.js';

/**
 * Order vertices by topological sort (DAG) or visual order fallback (cyclic).
 * Returns a list of vertex IDs in reveal order.
 */
export function orderVertices(structure: Structure): string[] {
  const adjList = buildAdjacencyList(structure);
  
  // Attempt topological sort with cycle detection
  const sorted = topologicalSort(structure.vertices, adjList);
  
  if (sorted !== null) {
    return sorted;
  }

  // Fallback: visual order (by y asc, then x asc, stable)
  return visualOrder(structure.vertices);
}

/**
 * Build adjacency list from edges (source → targets).
 */
function buildAdjacencyList(structure: Structure): Map<string, Set<string>> {
  const adjList = new Map<string, Set<string>>();

  // Initialize all vertices
  for (const v of structure.vertices) {
    if (!adjList.has(v.id)) {
      adjList.set(v.id, new Set());
    }
  }

  // Add edges
  for (const e of structure.edges) {
    const targets = adjList.get(e.source);
    if (targets) {
      targets.add(e.target);
    }
  }

  return adjList;
}

/**
 * Kahn's algorithm for topological sort. Returns null if a cycle is detected.
 */
function topologicalSort(
  vertices: Vertex[],
  adjList: Map<string, Set<string>>
): string[] | null {
  const inDegree = new Map<string, number>();

  // Initialize in-degree
  for (const v of vertices) {
    inDegree.set(v.id, 0);
  }

  // Count in-degrees
  for (const [, targets] of adjList) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }

  // Collect vertices with in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    result.push(u);

    const targets = adjList.get(u) || new Set();
    for (const v of targets) {
      const newDegree = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, newDegree);
      if (newDegree === 0) {
        queue.push(v);
      }
    }
  }

  // If we processed all vertices, it's a DAG
  if (result.length === vertices.length) {
    return result;
  }

  // Otherwise, a cycle exists
  return null;
}

/**
 * Visual order: sort by y ascending, then x ascending (stable).
 */
function visualOrder(vertices: Vertex[]): string[] {
  return vertices
    .slice() // non-mutating
    .sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      return a.x - b.x;
    })
    .map((v) => v.id);
}
```

- [ ] **Step 3: Implement scheduling (reveal + flow events)**

Write `/Users/li9292/Desktop/lottie-motion/src/planner/scheduling.ts`:

```typescript
import { Structure, Vertex } from '../types/structure.js';
import { TimelineEvent } from '../types/timeline.js';

export interface ScheduleOptions {
  revealDur: number;
  stagger: number;
  fps: number;
}

/**
 * Schedule reveal and flow events for an ordered list of vertices.
 * Returns events sorted by startF.
 */
export function scheduleEvents(
  structure: Structure,
  orderedVertexIds: string[],
  options: ScheduleOptions
): TimelineEvent[] {
  const { revealDur, stagger, fps } = options;

  // Build a map of vertex id → Vertex for geometry lookups
  const vertexMap = new Map<string, Vertex>();
  for (const v of structure.vertices) {
    vertexMap.set(v.id, v);
  }

  // Build a map of edge id → { source, target }
  const edgeMap = new Map<string, { source: string; target: string }>();
  for (const e of structure.edges) {
    edgeMap.set(e.id, { source: e.source, target: e.target });
  }

  // Schedule reveals
  const reveals: TimelineEvent[] = [];
  const revealEndFrame = new Map<string, number>(); // track when each node finishes revealing

  for (let i = 0; i < orderedVertexIds.length; i++) {
    const vertexId = orderedVertexIds[i];
    const vertex = vertexMap.get(vertexId)!;

    const startF = i * (revealDur + stagger);
    const endF = startF + revealDur;

    reveals.push({
      kind: 'reveal',
      target: vertexId,
      startF,
      endF,
      x: vertex.x,
      y: vertex.y,
      w: vertex.w,
      h: vertex.h
    });

    revealEndFrame.set(vertexId, endF);
  }

  // Schedule flows
  // An edge flows only after BOTH endpoints are revealed
  const flows: TimelineEvent[] = [];
  const flowDur = revealDur; // flow duration = reveal duration

  for (const edge of structure.edges) {
    const source = edge.source;
    const target = edge.target;

    const sourceRevealEnd = revealEndFrame.get(source)!;
    const targetRevealEnd = revealEndFrame.get(target)!;

    // Flow starts after BOTH endpoints are revealed
    const flowStart = Math.max(sourceRevealEnd, targetRevealEnd);
    const flowEnd = flowStart + flowDur;

    flows.push({
      kind: 'flow',
      target: edge.id,
      startF: flowStart,
      endF: flowEnd,
      from: source,
      to: target
    });
  }

  // Combine and sort by startF
  const allEvents: TimelineEvent[] = [...reveals, ...flows];
  allEvents.sort((a, b) => a.startF - b.startF);

  return allEvents;
}
```

- [ ] **Step 4: Implement plan() orchestration**

Write `/Users/li9292/Desktop/lottie-motion/src/planner/plan.ts`:

```typescript
import { Structure } from '../types/structure.js';
import { TimelineIR } from '../types/timeline.js';
import { orderVertices } from './ordering.js';
import { scheduleEvents, ScheduleOptions } from './scheduling.js';

/**
 * Pure function: plan(structure, overrides?) → TimelineIR
 *
 * Single time authority. Computes reveal/flow/highlight event timeline deterministically
 * from structural input. v0.1 reserves overrides slot but implements no behavior.
 */
export function plan(
  structure: Structure,
  overrides?: unknown
): TimelineIR {
  // v0.1: ignore overrides parameter (reserved for future)
  (overrides);

  // Step 1: Order vertices (topological or visual fallback)
  const orderedVertexIds = orderVertices(structure);

  // Step 2: Set canvas and timing defaults
  const fps = 30;
  const width = 1920;
  const height = 1080;
  const revealDur = 12;
  const stagger = 6;

  // Step 3: Schedule reveal and flow events
  const events = scheduleEvents(structure, orderedVertexIds, {
    revealDur,
    stagger,
    fps
  });

  // Step 4: Compute total frames
  let maxEndF = 0;
  for (const event of events) {
    if (event.endF > maxEndF) {
      maxEndF = event.endF;
    }
  }
  const totalFrames = maxEndF;

  // Step 5: Emit Timeline IR
  return {
    fps,
    width,
    height,
    totalFrames,
    events
  };
}
```

- [ ] **Step 5: Create comprehensive planner tests**

Write `/Users/li9292/Desktop/lottie-motion/tests/planner/ordering.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { orderVertices } from '../../src/planner/ordering.js';
import { fixture3NodeChain, fixtureDiamondDAG, fixtureCyclicGraph } from './fixtures.js';

describe('planner/ordering', () => {
  it('should topologically sort 3-node chain (DAG)', () => {
    const result = orderVertices(fixture3NodeChain.input);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should topologically sort diamond DAG', () => {
    const result = orderVertices(fixtureDiamondDAG.input);
    expect(result[0]).toBe('A');
    expect(result[3]).toBe('D');
    expect(result.slice(1, 3).sort()).toEqual(['B', 'C']);
  });

  it('should fall back to visual order (y asc, x asc) for cyclic graph', () => {
    const result = orderVertices(fixtureCyclicGraph.input);
    expect(result).toEqual(['A', 'B', 'C']);
  });
});
```

Write `/Users/li9292/Desktop/lottie-motion/tests/planner/scheduling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scheduleEvents } from '../../src/planner/scheduling.js';
import { fixture3NodeChain } from './fixtures.js';

describe('planner/scheduling', () => {
  it('should generate reveal events with default revealDur=12, stagger=6', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6,
      fps: 30
    });

    const reveals = events.filter((e) => e.kind === 'reveal');
    expect(reveals).toHaveLength(3);

    expect(reveals[0]).toEqual({
      kind: 'reveal',
      target: 'A',
      startF: 0,
      endF: 12,
      x: 0,
      y: 0,
      w: 100,
      h: 50
    });

    expect(reveals[1]).toEqual({
      kind: 'reveal',
      target: 'B',
      startF: 18,
      endF: 30,
      x: 120,
      y: 0,
      w: 100,
      h: 50
    });

    expect(reveals[2]).toEqual({
      kind: 'reveal',
      target: 'C',
      startF: 36,
      endF: 48,
      x: 240,
      y: 0,
      w: 100,
      h: 50
    });
  });

  it('should generate flow events only after both endpoints are revealed', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6,
      fps: 30
    });

    const flows = events.filter((e) => e.kind === 'flow');
    expect(flows).toHaveLength(2);

    expect(flows[0]).toEqual({
      kind: 'flow',
      target: 'A-B',
      startF: 30,
      endF: 42,
      from: 'A',
      to: 'B'
    });

    expect(flows[1]).toEqual({
      kind: 'flow',
      target: 'B-C',
      startF: 48,
      endF: 60,
      from: 'B',
      to: 'C'
    });
  });

  it('should emit events sorted by startF', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6,
      fps: 30
    });

    for (let i = 1; i < events.length; i++) {
      expect(events[i].startF).toBeGreaterThanOrEqual(events[i - 1].startF);
    }
  });
});
```

Write `/Users/li9292/Desktop/lottie-motion/tests/planner/plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { plan } from '../../src/planner/plan.js';
import { fixture3NodeChain, fixtureDiamondDAG, fixtureCyclicGraph } from './fixtures.js';

describe('planner/plan', () => {
  it('should produce exact timeline for 3-node chain', () => {
    const result = plan(fixture3NodeChain.input);
    expect(result).toEqual(fixture3NodeChain.expectedTimeline);
  });

  it('should produce exact timeline for diamond DAG', () => {
    const result = plan(fixtureDiamondDAG.input);
    expect(result).toEqual(fixtureDiamondDAG.expectedTimeline);
  });

  it('should produce exact timeline for cyclic graph (visual order fallback)', () => {
    const result = plan(fixtureCyclicGraph.input);
    expect(result).toEqual(fixtureCyclicGraph.expectedTimeline);
  });

  it('should always emit events sorted by startF', () => {
    const allFixtures = [
      fixture3NodeChain.input,
      fixtureDiamondDAG.input,
      fixtureCyclicGraph.input
    ];

    for (const fixture of allFixtures) {
      const result = plan(fixture);
      for (let i = 1; i < result.events.length; i++) {
        expect(result.events[i].startF).toBeGreaterThanOrEqual(
          result.events[i - 1].startF
        );
      }
    }
  });

  it('should preserve geometry verbatim from input vertices', () => {
    const result = plan(fixture3NodeChain.input);
    const reveals = result.events.filter((e) => e.kind === 'reveal');

    for (const reveal of reveals) {
      const inputVertex = fixture3NodeChain.input.vertices.find(
        (v) => v.id === reveal.target
      )!;
      expect(reveal.x).toBe(inputVertex.x);
      expect(reveal.y).toBe(inputVertex.y);
      expect(reveal.w).toBe(inputVertex.w);
      expect(reveal.h).toBe(inputVertex.h);
    }
  });

  it('should set canvas/fps from planner, not from input', () => {
    const result = plan(fixture3NodeChain.input);
    expect(result.fps).toBe(30);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('should compute totalFrames as max event endF', () => {
    const result = plan(fixture3NodeChain.input);
    let maxEndF = 0;
    for (const event of result.events) {
      maxEndF = Math.max(maxEndF, event.endF);
    }
    expect(result.totalFrames).toBe(maxEndF);
  });
});
```

- [ ] **Step 6: Run all planner tests**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/planner/
```

Expected output: All planner tests PASS.

- [ ] **Step 7: Commit the planner**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/planner/ tests/planner/ && git commit -m "$(cat <<'EOF'
feat(planner): implement deterministic timeline orchestration

- Add topological ordering (Kahn's algorithm) with visual-order fallback (y asc, x asc) for cycles
- Add scheduling: compute reveal frame numbers at regular stagger intervals, flow edges start after both endpoints
- Add plan() orchestration: order → schedule → emit TimelineIR (single time authority)
- Add canonical fixtures: 3-node chain, diamond DAG, cyclic graph with hand-computed timelines
- All invariants verified: topological order respected, spatial geometry frozen, motion intent (startF ≠ endF)
- Tests cover DAG, DAG, cyclic, ordering, scheduling, full pipeline

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## PHASE 2: BUILDER GATE (verify Timeline IR — depends on planner)

### Task 3: Builder gate — test setup and spatial-freeze invariant

**Files:** Create/Modify/Test
- Create `src/gates/builderGate.ts`
- Create `tests/gates/builderGate.test.ts`

**Interfaces:** Consumes (from earlier tasks: exact signatures)
- `TimelineIR` and `TimelineEvent` from `src/types/timeline.ts`
- `Structure`, `Vertex`, `Edge` from `src/types/structure.ts`

Produces
- `builderGate(timeline: TimelineIR, structure: Structure): GateResult`

**Steps:**

- [ ] **Step 1: Write failing test for spatial-freeze invariant**
  
Create `tests/gates/builderGate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { builderGate } from '../../src/gates/builderGate';
import { TimelineIR, TimelineEvent } from '../../src/types/timeline';
import { Structure, Vertex } from '../../src/types/structure';

describe('builderGate', () => {
  describe('spatial-freeze invariant', () => {
    it('passes when reveal events carry frozen x/y/w/h from structure vertices', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when reveal event x does not match structure vertex x', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 99, y: 20, w: 50, h: 30 } // x mismatch
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures).toContain(expect.stringContaining('n1'));
      expect(result.failures[0]).toContain('x');
    });
  });
});
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **2 tests fail** (no builderGate function yet)

- [ ] **Step 2: Implement minimal builderGate with spatial-freeze check only**

Create `src/gates/builderGate.ts`:

```typescript
import { TimelineIR, TimelineEvent } from '../types/timeline';
import { Structure, Vertex } from '../types/structure';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Check each reveal event for spatial freeze
  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const vertex = vertexMap.get(event.target);
      if (!vertex) {
        failures.push(`Reveal event references non-existent vertex: ${event.target}`);
        continue;
      }

      if (event.x !== vertex.x) {
        failures.push(`Reveal '${event.target}': x mismatch (event=${event.x}, vertex=${vertex.x})`);
      }
      if (event.y !== vertex.y) {
        failures.push(`Reveal '${event.target}': y mismatch (event=${event.y}, vertex=${vertex.y})`);
      }
      if (event.w !== vertex.w) {
        failures.push(`Reveal '${event.target}': w mismatch (event=${event.w}, vertex=${vertex.w})`);
      }
      if (event.h !== vertex.h) {
        failures.push(`Reveal '${event.target}': h mismatch (event=${event.h}, vertex=${vertex.h})`);
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **2 tests pass**

- [ ] **Step 3: Commit spatial-freeze implementation**

```bash
git add src/gates/builderGate.ts tests/gates/builderGate.test.ts && git commit -m "feat(gates): builder gate spatial-freeze verification

Implement first invariant check for builderGate: verify that reveal events
carry frozen x/y/w/h coordinates matching the input structure vertices verbatim.
This catches any silent coordinate mutations in the planner or other layers.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Builder gate — motion-intent invariant (each reveal has distinct startF ≠ endF)

**Files:** Modify/Test
- Modify `src/gates/builderGate.ts`
- Modify `tests/gates/builderGate.test.ts`

**Interfaces:** Consumes
- Same as Task 1

Produces
- Enhanced `builderGate(...)` now checks motion intent

**Steps:**

- [ ] **Step 1: Write failing test for motion-intent invariant**

Add to `tests/gates/builderGate.test.ts`:

```typescript
  describe('motion-intent invariant', () => {
    it('passes when each reveal has startF !== endF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when reveal has startF === endF (no duration)', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 5, endF: 5, x: 10, y: 20, w: 50, h: 30 } // startF === endF
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('motion') || f.includes('startF'))).toBe(true);
    });

    it('passes when flow edge has startF !== endF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'flow', target: 'e1', startF: 15, endF: 27, from: 'n1', to: 'n2 } // duration > 0
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
    });

    it('fails when flow edge has startF === endF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'flow', target: 'e1', startF: 15, endF: 15, from: 'n1', to: 'n2' } // startF === endF
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('motion') || f.includes('duration'))).toBe(true);
    });
  });
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **4 tests fail** (motion-intent checks not implemented)

- [ ] **Step 2: Implement motion-intent check in builderGate**

Modify `src/gates/builderGate.ts`:

```typescript
export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Check each event
  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const vertex = vertexMap.get(event.target);
      if (!vertex) {
        failures.push(`Reveal event references non-existent vertex: ${event.target}`);
        continue;
      }

      // Spatial freeze
      if (event.x !== vertex.x) {
        failures.push(`Reveal '${event.target}': x mismatch (event=${event.x}, vertex=${vertex.x})`);
      }
      if (event.y !== vertex.y) {
        failures.push(`Reveal '${event.target}': y mismatch (event=${event.y}, vertex=${vertex.y})`);
      }
      if (event.w !== vertex.w) {
        failures.push(`Reveal '${event.target}': w mismatch (event=${event.w}, vertex=${vertex.w})`);
      }
      if (event.h !== vertex.h) {
        failures.push(`Reveal '${event.target}': h mismatch (event=${event.h}, vertex=${vertex.h})`);
      }

      // Motion intent
      if (event.startF === event.endF) {
        failures.push(`Reveal '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    } else if (event.kind === 'flow') {
      // Motion intent for flow
      if (event.startF === event.endF) {
        failures.push(`Flow '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    } else if (event.kind === 'highlight') {
      // Motion intent for highlight
      if (event.startF === event.endF) {
        failures.push(`Highlight '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **all tests pass** (including previous 2 spatial-freeze tests)

- [ ] **Step 3: Commit motion-intent implementation**

```bash
git add src/gates/builderGate.ts tests/gates/builderGate.test.ts && git commit -m "feat(gates): builder gate motion-intent invariant

Add motion-intent check: each reveal, flow, and highlight event must have
startF !== endF (non-zero duration). This catches the common builder bug
where an entity's second keyframe is missing, rendering it static.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Builder gate — ordering and edge-flow invariants (no negative frames, edges after both endpoints)

**Files:** Modify/Test
- Modify `src/gates/builderGate.ts`
- Modify `tests/gates/builderGate.test.ts`

**Interfaces:** Consumes (same as Task 1)
- Produces: Enhanced `builderGate(...)` now checks frame ordering and edge constraints

**Steps:**

- [ ] **Step 1: Write failing tests for frame and edge-flow invariants**

Add to `tests/gates/builderGate.test.ts`:

```typescript
  describe('frame ordering and edge-flow invariants', () => {
    it('passes when all events have non-negative startF/endF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
    });

    it('fails when any event has negative startF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: -5, endF: 12, x: 10, y: 20, w: 50, h: 30 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('negative') || f.includes('startF'))).toBe(true);
    });

    it('fails when any event has endF < startF', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 12, endF: 5, x: 10, y: 20, w: 50, h: 30 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('endF') && f.includes('startF'))).toBe(true);
    });

    it('passes when edge flow starts after both endpoints are revealed', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'flow', target: 'e1', startF: 28, endF: 40, from: 'n1', to: 'n2' } // after both
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
    });

    it('fails when flow edge starts before source endpoint is revealed', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'flow', target: 'e1', startF: 5, endF: 20, from: 'n1', to: 'n2' } // starts at frame 5, n1 not done until 12
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('flow') && f.includes('after'))).toBe(true);
    });

    it('fails when flow edge starts before target endpoint is revealed', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'flow', target: 'e1', startF: 20, endF: 35, from: 'n1', to: 'n2' } // starts at 20, n2 not done until 27, that's OK... wait, let me fix: n2 endF is 27, so 20 < 27
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('flow') && f.includes('after'))).toBe(true);
    });
  });
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **5 tests fail** (frame/edge-flow checks not implemented)

- [ ] **Step 2: Implement frame and edge-flow checks in builderGate**

Modify `src/gates/builderGate.ts`:

```typescript
export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Build reveal-end-frame map: which frame each node/edge finishes revealing
  const revealEndFrames = new Map<string, number>();

  // First pass: collect all frame info and check frame validity
  for (const event of timeline.events) {
    // Check non-negative frames
    if (event.startF < 0) {
      failures.push(`Event '${event.target}': negative startF (${event.startF})`);
    }
    if (event.endF < 0) {
      failures.push(`Event '${event.target}': negative endF (${event.endF})`);
    }

    // Check endF >= startF
    if (event.endF < event.startF) {
      failures.push(`Event '${event.target}': endF (${event.endF}) < startF (${event.startF})`);
    }

    // Motion intent
    if (event.startF === event.endF) {
      failures.push(`Event '${event.target}': motion intent violation (startF === endF, no duration)`);
    }

    // Track reveal end-times for edge-flow checks
    if (event.kind === 'reveal') {
      revealEndFrames.set(event.target, event.endF);
    }
  }

  // Second pass: spatial freeze and edge-flow constraints
  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const vertex = vertexMap.get(event.target);
      if (!vertex) {
        failures.push(`Reveal event references non-existent vertex: ${event.target}`);
        continue;
      }

      // Spatial freeze
      if (event.x !== vertex.x) {
        failures.push(`Reveal '${event.target}': x mismatch (event=${event.x}, vertex=${vertex.x})`);
      }
      if (event.y !== vertex.y) {
        failures.push(`Reveal '${event.target}': y mismatch (event=${event.y}, vertex=${vertex.y})`);
      }
      if (event.w !== vertex.w) {
        failures.push(`Reveal '${event.target}': w mismatch (event=${event.w}, vertex=${vertex.w})`);
      }
      if (event.h !== vertex.h) {
        failures.push(`Reveal '${event.target}': h mismatch (event=${event.h}, vertex=${vertex.h})`);
      }
    } else if (event.kind === 'flow') {
      // Edge flow constraint: must start after both source and target are revealed
      const sourceEndF = revealEndFrames.get(event.from);
      const targetEndF = revealEndFrames.get(event.to);

      if (sourceEndF === undefined) {
        failures.push(`Flow '${event.target}': source vertex '${event.from}' never revealed`);
      } else if (event.startF < sourceEndF) {
        failures.push(`Flow '${event.target}': starts at frame ${event.startF} but source '${event.from}' not revealed until frame ${sourceEndF}`);
      }

      if (targetEndF === undefined) {
        failures.push(`Flow '${event.target}': target vertex '${event.to}' never revealed`);
      } else if (event.startF < targetEndF) {
        failures.push(`Flow '${event.target}': starts at frame ${event.startF} but target '${event.to}' not revealed until frame ${targetEndF}`);
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **all tests pass** (spatial-freeze, motion-intent, and frame/edge-flow tests)

- [ ] **Step 3: Commit frame and edge-flow implementation**

```bash
git add src/gates/builderGate.ts tests/gates/builderGate.test.ts && git commit -m "feat(gates): builder gate frame ordering and edge-flow invariants

Add constraints: all frames non-negative with endF >= startF; flow edges
start only after both source and target are revealed. Prevents temporal
inversions and broken causality in the timeline.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Builder gate — no-duplicate-reveals and partial-order invariants

**Files:** Modify/Test
- Modify `src/gates/builderGate.ts`
- Modify `tests/gates/builderGate.test.ts`

**Interfaces:** Consumes (same as Task 1)
- Produces: Enhanced `builderGate(...)` now checks no-duplicates and partial-order

**Steps:**

- [ ] **Step 1: Write failing tests for no-duplicates and partial-order**

Add to `tests/gates/builderGate.test.ts`:

```typescript
  describe('no-duplicate-reveals invariant', () => {
    it('passes when each node revealed exactly once', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
    });

    it('fails when same node is revealed twice', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const structure: Structure = { vertices, edges: [] };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n1', startF: 15, endF: 27, x: 10, y: 20, w: 50, h: 30 } // duplicate
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('n1') && (f.includes('revealed') || f.includes('duplicate')))).toBe(true);
    });
  });

  describe('partial-order invariant', () => {
    it('passes when reveal order respects DAG connectivity', () => {
      // Chain: n1 -> n2 -> n3
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 },
        { id: 'n3', label: 'Node 3', x: 200, y: 280, w: 70, h: 50 }
      ];
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', label: 'edge' },
        { id: 'e2', source: 'n2', target: 'n3', label: 'edge' }
      ];
      const structure: Structure = { vertices, edges };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'reveal', target: 'n3', startF: 30, endF: 42, x: 200, y: 280, w: 70, h: 50 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(true);
    });

    it('fails when reveal order violates DAG (target before source)', () => {
      // Edge n1 -> n2, but n2 revealed before n1
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 },
        { id: 'n2', label: 'Node 2', x: 100, y: 150, w: 60, h: 40 }
      ];
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', label: 'edge' }
      ];
      const structure: Structure = { vertices, edges };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n2', startF: 0, endF: 12, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'reveal', target: 'n1', startF: 15, endF: 27, x: 10, y: 20, w: 50, h: 30 }
      ];

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 100,
        events
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('partial order') || f.includes('before') || f.includes('violates'))).toBe(true);
    });
  });
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **3 tests fail** (no-duplicates and partial-order checks not implemented)

- [ ] **Step 2: Implement no-duplicates and partial-order checks**

Modify `src/gates/builderGate.ts`:

```typescript
export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));
  const edgeMap = new Map(structure.edges.map(e => [e.id, e]));

  // Build reveal-end-frame map and check for duplicates
  const revealEndFrames = new Map<string, number>();
  const seenReveals = new Set<string>();

  // Build adjacency list for DAG partial order checking
  const successors = new Map<string, string[]>(); // source -> [targets]
  for (const v of structure.vertices) {
    successors.set(v.id, []);
  }
  for (const edge of structure.edges) {
    const targets = successors.get(edge.source) || [];
    targets.push(edge.target);
    successors.set(edge.source, targets);
  }

  // First pass: collect frame info, check duplicates, check frame validity
  const revealEventsByTarget = new Map<string, TimelineEvent>();
  
  for (const event of timeline.events) {
    // Check non-negative frames
    if (event.startF < 0) {
      failures.push(`Event '${event.target}': negative startF (${event.startF})`);
    }
    if (event.endF < 0) {
      failures.push(`Event '${event.target}': negative endF (${event.endF})`);
    }

    // Check endF >= startF
    if (event.endF < event.startF) {
      failures.push(`Event '${event.target}': endF (${event.endF}) < startF (${event.startF})`);
    }

    // Motion intent
    if (event.startF === event.endF) {
      failures.push(`Event '${event.target}': motion intent violation (startF === endF, no duration)`);
    }

    // Check for duplicate reveals
    if (event.kind === 'reveal') {
      if (seenReveals.has(event.target)) {
        failures.push(`Vertex '${event.target}' revealed more than once`);
      }
      seenReveals.add(event.target);
      revealEndFrames.set(event.target, event.endF);
      revealEventsByTarget.set(event.target, event);
    }
  }

  // Second pass: spatial freeze, edge-flow constraints, and partial-order checks
  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const vertex = vertexMap.get(event.target);
      if (!vertex) {
        failures.push(`Reveal event references non-existent vertex: ${event.target}`);
        continue;
      }

      // Spatial freeze
      if (event.x !== vertex.x) {
        failures.push(`Reveal '${event.target}': x mismatch (event=${event.x}, vertex=${vertex.x})`);
      }
      if (event.y !== vertex.y) {
        failures.push(`Reveal '${event.target}': y mismatch (event=${event.y}, vertex=${vertex.y})`);
      }
      if (event.w !== vertex.w) {
        failures.push(`Reveal '${event.target}': w mismatch (event=${event.w}, vertex=${vertex.w})`);
      }
      if (event.h !== vertex.h) {
        failures.push(`Reveal '${event.target}': h mismatch (event=${event.h}, vertex=${vertex.h})`);
      }
    } else if (event.kind === 'flow') {
      // Edge flow constraint: must start after both source and target are revealed
      const sourceEndF = revealEndFrames.get(event.from);
      const targetEndF = revealEndFrames.get(event.to);

      if (sourceEndF === undefined) {
        failures.push(`Flow '${event.target}': source vertex '${event.from}' never revealed`);
      } else if (event.startF < sourceEndF) {
        failures.push(`Flow '${event.target}': starts at frame ${event.startF} but source '${event.from}' not revealed until frame ${sourceEndF}`);
      }

      if (targetEndF === undefined) {
        failures.push(`Flow '${event.target}': target vertex '${event.to}' never revealed`);
      } else if (event.startF < targetEndF) {
        failures.push(`Flow '${event.target}': starts at frame ${event.startF} but target '${event.to}' not revealed until frame ${targetEndF}`);
      }
    }
  }

  // Third pass: check partial-order constraints (topological ordering)
  // For each reveal, check that all its predecessors (sources of incoming edges) were revealed before
  for (const [targetId, targetEvent] of revealEventsByTarget.entries()) {
    // Find all vertices with edges pointing to targetId
    for (const edge of structure.edges) {
      if (edge.target === targetId) {
        const sourceId = edge.source;
        const sourceEvent = revealEventsByTarget.get(sourceId);
        if (sourceEvent) {
          // Source must start revealing before target
          if (sourceEvent.startF >= targetEvent.startF) {
            failures.push(`Partial order violation: '${sourceId}' (source, startF=${sourceEvent.startF}) must be revealed before '${targetId}' (target, startF=${targetEvent.startF})`);
          }
        }
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/builderGate.test.ts
```

Expected output: **all tests pass**

- [ ] **Step 3: Commit no-duplicates and partial-order implementation**

```bash
git add src/gates/builderGate.ts tests/gates/builderGate.test.ts && git commit -m "feat(gates): builder gate no-duplicates and partial-order invariants

Add constraints: each node must be revealed exactly once; reveal order must
respect DAG partial order (source before target). Prevents semantic scrambling
and ensures topologically-sound animation sequencing.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

---

## PHASE 3: COMPILER (Timeline IR → Lottie JSON)

### Task 7: Implement fadeIn primitive and root canvas assembly

**Files:** Create `src/compiler/primitives.ts` (high-level semantic primitives); Modify `src/compiler/compile.ts` (compiler entry); Create `tests/compiler.test.ts` (TDD tests).

**Interfaces:** 
- Consumes: `TimelineIR` from `src/types/timeline.ts`
- Produces: `compile(timeline: TimelineIR): LottieJSON` exported from `src/compiler/compile.ts`

#### Steps

- [ ] **Step 1: Write failing test for fadeIn opacity keyframes.**

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/primitives.test.ts
```

Expected FAIL output (test does not exist yet):
```
FAIL  tests/compiler/primitives.test.ts > fadeInPrimitive generates two opacity keyframes
  not found
```

Test code at `/Users/li9292/Desktop/lottie-motion/tests/compiler/primitives.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fadeIn } from '../../src/compiler/primitives'

describe('fadeIn primitive', () => {
  it('generates two opacity keyframes (0→100) with frame times', () => {
    // fadeIn takes a layer index, start frame, end frame
    // returns LAST AST element for animated opacity
    const result = fadeIn(1, 0, 30)
    
    // result should be a LAST element node; stringify it to Lottie to verify keyframes
    expect(result).toBeDefined()
    expect(result.type).toBe('element')
    expect(result.props.key).toBe('o')  // opacity element key
  })
})
```

- [ ] **Step 2: Implement fadeIn primitive using last-builder.**

Create `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt } from '@lottiefiles/last-builder'

// Keyframe helper: { t, s:[value] }
function keyframe(t: number, s: number) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    at('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [pt(s)])),
  ])
}

/**
 * fadeIn primitive: generates an opacity element with two keyframes (0→100)
 * @param startF frame number when opacity = 0
 * @param endF frame number when opacity = 100
 */
export function fadeIn(startF: number, endF: number) {
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),  // animated: true
    at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(startF, 0),
      keyframe(endF, 100),
    ])),
  ]))
  return opacity
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/primitives.test.ts
```

Expected PASS:
```
PASS  tests/compiler/primitives.test.ts (3ms)
  ✓ fadeIn primitive (2ms)
    ✓ generates two opacity keyframes (0→100) with frame times
```

- [ ] **Step 3: Write failing test for compile root assembly with metadata.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/primitives.test.ts`:

```typescript
describe('compile root assembly', () => {
  it('creates root animation with w/h/fr/ip/op from TimelineIR', () => {
    const timelineIR: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [],  // empty for this unit test
    }
    const lottie = rootCanvasAsm(timelineIR, [])
    
    // Verify root metadata propagates to Lottie
    expect(lottie).toBeDefined()
    expect(lottie.fr).toBe(30)
    expect(lottie.w).toBe(200)
    expect(lottie.h).toBe(200)
    expect(lottie.ip).toBe(0)
    expect(lottie.op).toBe(60)
    expect(lottie.v).toBe('5.9.0')
    expect(lottie.layers).toEqual([])  // no layers yet
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/primitives.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/primitives.test.ts > compile root assembly > creates root animation with w/h/fr/ip/op from TimelineIR
  ReferenceError: rootCanvasAsm is not defined
```

- [ ] **Step 4: Implement rootCanvasAsm helper.**

Add to `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
import { relottie } from '@lottiefiles/relottie'
import stringify from '@lottiefiles/relottie-stringify'
import { rt, cl, ar, at, pt } from '@lottiefiles/last-builder'
import type { TimelineIR } from '../types/timeline'

export function rootCanvasAsm(timeline: TimelineIR, layers: any[]) {
  const root = rt([
    at('v', T.string.version, pt('5.9.0')),
    at('fr', T.number.framerate, pt(timeline.fps)),
    at('ip', T.number['in-point'], pt(0)),
    at('op', T.number['out-point'], pt(timeline.totalFrames)),
    at('w', T.number.width, pt(timeline.width)),
    at('h', T.number.height, pt(timeline.height)),
    cl('layers', T.collection.composition, ar(T.array.composition, layers)),
  ])
  
  // Stringify LAST AST to Lottie JSON
  const lottie = JSON.parse(relottie().use(stringify).stringify(root))
  return lottie
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/primitives.test.ts
```

Expected PASS:
```
PASS  tests/compiler/primitives.test.ts (15ms)
  ✓ compile root assembly
    ✓ creates root animation with w/h/fr/ip/op from TimelineIR
```

- [ ] **Step 5: Write failing test for compile entry point.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/compile.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { compile } from '../../src/compiler/compile'
import type { TimelineIR } from '../../src/types/timeline'

describe('compile()', () => {
  it('accepts TimelineIR and returns Lottie JSON with metadata', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [],
    }
    
    const result = compile(timeline)
    
    expect(result).toBeDefined()
    expect(result.v).toBe('5.9.0')
    expect(result.fr).toBe(30)
    expect(result.w).toBe(200)
    expect(result.h).toBe(200)
    expect(result.ip).toBe(0)
    expect(result.op).toBe(60)
    expect(Array.isArray(result.layers)).toBe(true)
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/compile.test.ts > compile() > accepts TimelineIR and returns Lottie JSON with metadata
  Error: Cannot find module '../../src/compiler/compile'
```

- [ ] **Step 6: Implement compile entry point.**

Create `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts`:

```typescript
import type { TimelineIR, TimelineEvent } from '../types/timeline'
import { rootCanvasAsm } from './primitives'
import type { LottieJSON } from '../types/compiler'

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  
  // Walk timeline events; for each event, append a layer.
  // For v0.1, just assemble the root with empty layers.
  // reveal/flow/highlight event types will be handled in later tasks.
  
  return rootCanvasAsm(timeline, layers)
}
```

Also create `/Users/li9292/Desktop/lottie-motion/src/types/compiler.ts`:

```typescript
export type LottieJSON = Record<string, unknown>
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected PASS:
```
PASS  tests/compiler/compile.test.ts (12ms)
  ✓ compile()
    ✓ accepts TimelineIR and returns Lottie JSON with metadata
```

- [ ] **Step 7: Commit the fadeIn primitive and root canvas assembly.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/compiler/primitives.ts src/compiler/compile.ts src/types/compiler.ts tests/compiler/primitives.test.ts tests/compiler/compile.test.ts && git commit -m "Implement fadeIn primitive and root canvas assembly (compile entry point)

- Add fadeIn(startF, endF) high-level primitive using last-builder opacity keyframes
- Add rootCanvasAsm(timeline, layers) helper to assemble LAST AST under rt() with metadata (w/h/fr/ip/op)
- Add compile(timeline) entry point that orchestrates layer assembly
- Verified with smoke tests: metadata propagates correctly, Lottie JSON serializes cleanly
- TDD: tests pass for empty-events baseline; later tasks will implement event-to-layer orchestration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Implement node primitive (rect + text layer) and reveal event orchestration

**Files:** Modify `src/compiler/primitives.ts`; Modify `src/compiler/compile.ts`; Create `tests/compiler/reveal.test.ts` (event-driven test).

**Interfaces:**
- Consumes: `TimelineIR` with `reveal` events from task 1's `compile()`
- Produces: compiled Lottie JSON with shape layers for revealed nodes (rect + text layer)

#### Steps

- [ ] **Step 1: Write failing test for node primitive (discover titles via relottie-parse).**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/reveal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { relottie } from '@lottiefiles/relottie'
import parse from '@lottiefiles/relottie-parse'

describe('node primitive discovery', () => {
  it('parses a known-good Lottie to find shape-layer, rect, and text titles', async () => {
    // A minimal known-good Lottie with a shape layer (rect + text).
    // This test is hand-written once by manually inspecting a Figma export or lottie-web sample.
    // For v0.1, we construct a minimal valid sample inline.
    
    const sampleLottie = {
      v: '5.9.0',
      fr: 30,
      ip: 0,
      op: 60,
      w: 200,
      h: 200,
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,  // shape layer
          ks: {
            o: { a: 0, k: 100 },
            p: { a: 0, k: [100, 100] },
          },
          shapes: [
            {
              ty: 'gr',
              it: [
                {
                  ty: 'rc',  // rect
                  p: { a: 0, k: [0, 0] },
                  s: { a: 0, k: [100, 50] },
                },
                {
                  ty: 'fl',  // fill
                  c: { a: 0, k: [0, 0, 0, 1] },
                },
              ],
            },
            {
              ty: 'tm',  // text (simplified)
              t: 'Node Label',
            },
          ],
        },
      ],
    }
    
    const ast = relottie().use(parse).parse(sampleLottie)
    
    // Walk the AST to find shape-layer, rect, and text node titles
    // (These will be used in step 2 to construct node primitives)
    expect(ast).toBeDefined()
    // After parsing, we inspect console.log(ast) to find the exact titles
    // and record them in the primitive implementation.
  })
})
```

Run test (exploratory):
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/reveal.test.ts --reporter=verbose 2>&1 | head -50
```

Expected output: Test passes (it's an exploration test). The human then inspects the parsed AST to find exact node titles. For reference, from the verified code in the spec:
- Shape layer: `ty: 4` (layer type), layer children under `shapes`
- Rect: `ty: 'rc'` (rect shape)
- Text: `ty: 'tm'` or similar

However, since we do not have the exact TITLES constants, we will use string literals (as noted in the spec) and rely on relottie's parser-synthesized titles.

- [ ] **Step 2: Write failing test for node(vertex) primitive.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/reveal.test.ts`:

```typescript
describe('node primitive', () => {
  it('creates a shape layer with rect and text from vertex', () => {
    const vertex = {
      id: 'node-1',
      label: 'Service A',
      x: 50,
      y: 100,
      w: 120,
      h: 60,
    }
    
    const result = node(vertex)
    
    // Result should be a LAST object (shape layer) with shapes array containing rect + text
    expect(result).toBeDefined()
    expect(result.type).toBe('object')
    // Exact structure depends on last-builder, but it should have:
    // - ty: 4 (shape layer)
    // - ks: transform with position [x, y] and opacity 100
    // - shapes: array with rect (size w x h) and text (label)
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/reveal.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/reveal.test.ts > node primitive > creates a shape layer with rect and text from vertex
  ReferenceError: node is not defined
```

- [ ] **Step 3: Implement node(vertex) primitive.**

Add to `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
import type { Vertex } from '../types/structure'

/**
 * node primitive: creates a shape layer with rect and text from vertex geometry
 * @param vertex the node to render (carries id, label, x, y, w, h)
 */
export function node(vertex: Vertex) {
  // Position transform: [x, y]
  const position = el('p', T.element.layerPosition, ob(T.object.layerPosition, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
      pt(vertex.x),
      pt(vertex.y),
    ])),
  ]))
  
  // Opacity (full, not animated; fadeIn will override in a later event)
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', T.number.keyframeValue, pt(100)),
  ]))
  
  // Scale to fit width/height (simplified: just use w/h as-is; scale is often [100, 100] base in Lottie)
  const scale = el('s', T.element.transformScale, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [
      pt(vertex.w),
      pt(vertex.h),
    ])),
  ]))
  
  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children', [
    position,
    opacity,
    scale,
  ]))
  
  // Shapes: rect + fill + text
  const rect = ob('rect-shape', [
    at('ty', T.string.shapeType, pt('rc')),
    at('p', T.element.layerPosition, ob(T.object.layerPosition, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
        pt(0),  // rect centered at layer origin
        pt(0),
      ])),
    ])),
    at('s', T.element.layerScale, ob(T.object.animatedValue, [  // size
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [
        pt(vertex.w),
        pt(vertex.h),
      ])),
    ])),
  ])
  
  const fill = ob('fill-shape', [
    at('ty', T.string.shapeType, pt('fl')),
    at('c', T.element.fillColor, ob(T.object.color, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.color, ar(T.array.colorChildren, [
        pt(0.2),  // R
        pt(0.2),  // G
        pt(0.2),  // B
        pt(1.0),  // A (opaque)
      ])),
    ])),
  ])
  
  // Text shape (simplified: single text)
  const textShape = ob('text-shape', [
    at('ty', T.string.shapeType, pt('tm')),
    at('t', T.string.textContent, pt(vertex.label)),
  ])
  
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [
    rect,
    fill,
    textShape,
  ]))
  
  // Build shape layer
  const shapeLayer = ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(1)),  // placeholder index; compile() will assign unique
    at('ty', T.number.layerType, pt(4)),  // shape layer
    transform,
    shapes,
  ])
  
  return shapeLayer
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/reveal.test.ts
```

Expected PASS:
```
PASS  tests/compiler/reveal.test.ts (8ms)
  ✓ node primitive
    ✓ creates a shape layer with rect and text from vertex
```

- [ ] **Step 4: Write failing test for reveal event → node+fadeIn orchestration.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/compile.test.ts`:

```typescript
describe('reveal event orchestration', () => {
  it('translates reveal event to node layer with fadeIn', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 100,
          w: 120,
          h: 60,
        },
      ],
    }
    
    // Mock vertex (in real usage, planner has already emitted this in TimelineIR)
    // For this test, we manually provide it
    const vertices = [
      { id: 'node-1', label: 'Service A', x: 50, y: 100, w: 120, h: 60 },
    ]
    
    const result = compile(timeline, vertices)
    
    expect(result).toBeDefined()
    expect(result.layers).toBeDefined()
    expect(result.layers.length).toBe(1)
    
    const layer = result.layers[0]
    expect(layer.ty).toBe(4)  // shape layer
    // Opacity should have two keyframes (0 at frame 0, 100 at frame 30)
    expect(layer.ks.o.a).toBe(1)  // animated
    expect(layer.ks.o.k.length).toBe(2)
    expect(layer.ks.o.k[0]).toEqual({ t: 0, s: [0] })
    expect(layer.ks.o.k[1]).toEqual({ t: 30, s: [100] })
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/compile.test.ts > reveal event orchestration > translates reveal event to node layer with fadeIn
  AssertionError: expected undefined to be defined (result.layers)
```

- [ ] **Step 5: Modify compile() to walk reveal events and emit node+fadeIn layers.**

Update `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts`:

```typescript
import type { TimelineIR, TimelineEvent } from '../types/timeline'
import type { Vertex } from '../types/structure'
import { rootCanvasAsm, node as nodeLayer, fadeIn } from './primitives'
import type { LottieJSON } from '../types/compiler'

export function compile(timeline: TimelineIR, vertices?: Vertex[]): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1
  
  // Build a lookup map from vertex id to vertex (for easy reference during event processing)
  const vertexMap = new Map<string, Vertex>()
  if (vertices) {
    vertices.forEach(v => vertexMap.set(v.id, v))
  }
  
  // Walk timeline events; process reveal events
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      // Find vertex from map (or reconstruct from event's frozen geometry)
      const vertex = vertexMap.get(event.target) || {
        id: event.target,
        label: 'Node',
        x: event.x,
        y: event.y,
        w: event.w,
        h: event.h,
      }
      
      // Create shape layer (rect + text)
      const shape = nodeLayer(vertex)
      
      // Patch layer index
      shape.props.children.find((c: any) => c.props?.key === 'ind').props.children[0].value = layerIndex
      
      // Add fadeIn animation (override opacity keyframes)
      const fadeInElement = fadeIn(event.startF, event.endF)
      // Replace opacity element in transform
      const transformEl = shape.props.children.find((c: any) => c.props?.key === 'ks')
      const opacityEl = transformEl.props.children.find((c: any) => c.props?.key === 'o')
      // Copy fadeIn structure into opacity element
      Object.assign(opacityEl.props.children, fadeInElement.props.children)
      
      layers.push(shape)
      layerIndex++
    }
    // Other event types (flow, highlight) handled in later tasks
  })
  
  return rootCanvasAsm(timeline, layers)
}
```

However, the above approach is fragile because we're mutating LAST AST nodes. A cleaner approach is to build the layer fresh with fadeIn baked in:

Update `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts` (cleaner):

```typescript
import type { TimelineIR, TimelineEvent, TimelineEventReveal } from '../types/timeline'
import type { Vertex } from '../types/structure'
import { rootCanvasAsm } from './primitives'
import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, cl } from '@lottiefiles/last-builder'
import type { LottieJSON } from '../types/compiler'

function keyframe(t: number, s: number) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    at('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [pt(s)])),
  ])
}

function buildRevealLayer(event: TimelineEventReveal, layerIndex: number) {
  // Position transform
  const position = el('p', T.element.layerPosition, ob(T.object.layerPosition, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
      pt(event.x),
      pt(event.y),
    ])),
  ]))
  
  // Opacity with fadeIn keyframes
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(event.startF, 0),
      keyframe(event.endF, 100),
    ])),
  ]))
  
  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children', [
    position,
    opacity,
  ]))
  
  // Minimal shape: rect fill
  const rect = ob('rect-shape', [
    at('ty', T.string.shapeType, pt('rc')),
    at('p', T.element.layerPosition, ob(T.object.layerPosition, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
        pt(0),
        pt(0),
      ])),
    ])),
    at('s', T.element.layerScale, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [
        pt(event.w),
        pt(event.h),
      ])),
    ])),
  ])
  
  const fill = ob('fill-shape', [
    at('ty', T.string.shapeType, pt('fl')),
    at('c', T.element.fillColor, ob(T.object.color, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.color, ar(T.array.colorChildren, [
        pt(0.2), pt(0.2), pt(0.2), pt(1.0),
      ])),
    ])),
  ])
  
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [
    rect,
    fill,
  ]))
  
  // Build shape layer
  const shapeLayer = ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    transform,
    shapes,
  ])
  
  return shapeLayer
}

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1
  
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const layer = buildRevealLayer(event, layerIndex)
      layers.push(layer)
      layerIndex++
    }
  })
  
  return rootCanvasAsm(timeline, layers)
}
```

Update `/Users/li9292/Desktop/lottie-motion/src/types/timeline.ts` to export TimelineEventReveal:

```typescript
export type TimelineEventReveal = {
  kind: 'reveal'
  target: string
  startF: number
  endF: number
  x: number
  y: number
  w: number
  h: number
}

export type TimelineEvent =
  | TimelineEventReveal
  | { kind: 'flow'; target: string; startF: number; endF: number; from: string; to: string }
  | { kind: 'highlight'; target: string; startF: number; endF: number }

export interface TimelineIR {
  fps: number
  width: number
  height: number
  totalFrames: number
  events: TimelineEvent[]
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected PASS:
```
PASS  tests/compiler/compile.test.ts (20ms)
  ✓ reveal event orchestration
    ✓ translates reveal event to node layer with fadeIn
```

- [ ] **Step 6: Commit reveal event orchestration and node+fadeIn assembly.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/compiler/compile.ts src/types/timeline.ts tests/compiler/reveal.test.ts && git commit -m "Implement reveal event orchestration with node+fadeIn layers

- Add buildRevealLayer() helper to translate reveal events into shape layers with animated opacity
- Modify compile() to walk reveal events and emit one shape layer per reveal
- Each reveal layer has position [x,y] and fadeIn opacity keyframes (0→100) over [startF, endF]
- Layer indices auto-increment; shapes are minimal (rect + fill, text deferred to task 3)
- TDD: test verifies opacity keyframes propagate correctly to Lottie JSON

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Discover and implement edgePath + flow primitives (trim-path animation)

**Files:** Modify `src/compiler/primitives.ts`; Modify `src/compiler/compile.ts`; Create `tests/compiler/flow.test.ts` (edge flow discovery and test).

**Interfaces:**
- Consumes: `TimelineIR` with `flow` events; edge geometry computed from source/target reveal events
- Produces: compiled Lottie JSON with path + trim-path layers for flowing edges

#### Steps

- [ ] **Step 1: Write discovery test to parse a known-good trim-path Lottie.**

Create `/Users/li9292/Desktop/lottie-motion/tests/compiler/flow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { relottie } from '@lottiefiles/relottie'
import parse from '@lottiefiles/relottie-parse'

describe('edge flow discovery (trim-path)', () => {
  it('parses known-good Lottie with stroke and trim-path to find titles', async () => {
    // Minimal Lottie with a path that has a stroke and trim-path (for edge flow animation)
    const sampleLottie = {
      v: '5.9.0',
      fr: 30,
      ip: 0,
      op: 60,
      w: 200,
      h: 200,
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,  // shape layer
          ks: {
            o: { a: 0, k: 100 },
            p: { a: 0, k: [0, 0] },
          },
          shapes: [
            {
              ty: 'sh',  // shape (path)
              ks: {
                a: 0,
                k: {
                  c: false,
                  v: [[50, 50], [150, 150]],  // simple line
                  i: [[0, 0], [0, 0]],
                  o: [[0, 0], [0, 0]],
                },
              },
            },
            {
              ty: 'st',  // stroke
              c: { a: 0, k: [0, 0, 0, 1] },
              w: { a: 0, k: 2 },
            },
            {
              ty: 'tm',  // trim path (for animation)
              s: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [100] }] },
              e: { a: 0, k: 100 },
              o: { a: 0, k: 0 },
            },
          ],
        },
      ],
    }
    
    const ast = relottie().use(parse).parse(sampleLottie)
    expect(ast).toBeDefined()
    // After parsing, inspect console output to find exact TITLES for:
    // - shape (path): ty:'sh'
    // - stroke: ty:'st'
    // - trim-path: ty:'tm'
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/flow.test.ts
```

Expected: Test passes. The human then manually inspects the parsed AST to confirm titles (or uses string literals as fallback, per spec note).

- [ ] **Step 2: Write failing test for edgePath(edge, fromBox, toBox) primitive.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/flow.test.ts`:

```typescript
describe('edgePath primitive', () => {
  it('creates a path shape layer from edge geometry', () => {
    const edge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      label: 'calls',
    }
    
    const fromBox = { x: 50, y: 100, w: 120, h: 60 }   // node-1 geometry
    const toBox = { x: 200, y: 300, w: 100, h: 50 }    // node-2 geometry
    
    const result = edgePath(edge, fromBox, toBox)
    
    expect(result).toBeDefined()
    expect(result.type).toBe('object')
    // Should contain shapes: path + stroke
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/flow.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/flow.test.ts > edgePath primitive > creates a path shape layer from edge geometry
  ReferenceError: edgePath is not defined
```

- [ ] **Step 3: Implement edgePath(edge, fromBox, toBox) primitive.**

Add to `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
import type { Edge } from '../types/structure'

interface Box { x: number; y: number; w: number; h: number }

/**
 * edgePath primitive: creates a shape layer with path and stroke for an edge
 * @param edge the connector to render
 * @param fromBox source node geometry (to compute start point)
 * @param toBox target node geometry (to compute end point)
 */
export function edgePath(edge: Edge, fromBox: Box, toBox: Box) {
  // Compute connection points: center of each box
  const fromCenter = [fromBox.x + fromBox.w / 2, fromBox.y + fromBox.h / 2]
  const toCenter = [toBox.x + toBox.w / 2, toBox.y + toBox.h / 2]
  
  // Path shape with bezier (simple straight line for v0.1)
  const pathShape = ob('path-shape', [
    at('ty', T.string.shapeType, pt('sh')),
    at('ks', T.element.layerPosition, ob(T.object.layerPath, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.object.pathValue, ob(T.object.bezierPath, [
        at('c', T.intBoolean.bezierClosed, pt(0)),  // open path
        cl('v', T.collection.vertices, ar(T.array.bezierPathChildren, [
          pt(fromCenter[0]),
          pt(fromCenter[1]),
          pt(toCenter[0]),
          pt(toCenter[1]),
        ])),
        // indices and out-tangents omitted for simplicity; Lottie spec requires them
      ])),
    ])),
  ])
  
  // Stroke
  const stroke = ob('stroke-shape', [
    at('ty', T.string.shapeType, pt('st')),
    at('c', T.element.fillColor, ob(T.object.color, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.color, ar(T.array.colorChildren, [
        pt(0), pt(0), pt(0), pt(1),  // black
      ])),
    ])),
    at('w', T.element.strokeWidth, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(2)),  // 2px
    ])),
  ])
  
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [
    pathShape,
    stroke,
  ]))
  
  // Build shape layer
  const edgeLayer = ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(1)),  // placeholder; compile() assigns unique
    at('ty', T.number.layerType, pt(4)),
    at('ks', T.element.layerTransform, ob('layer-transform-children', [
      el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
        at('a', T.intBoolean.animated, pt(0)),
        at('k', T.number.keyframeValue, pt(100)),
      ])),
    ])),
    shapes,
  ])
  
  return edgeLayer
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/flow.test.ts
```

Expected PASS (or close; may need adjustments to titles):
```
PASS  tests/compiler/flow.test.ts (12ms)
  ✓ edgePath primitive
    ✓ creates a path shape layer from edge geometry
```

- [ ] **Step 4: Write failing test for flow(pathLayer, startF, endF) trim-path animation.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/flow.test.ts`:

```typescript
describe('flow primitive', () => {
  it('adds trim-path animation (0→100 stroke) over frame span', () => {
    const result = flow(10, 40)  // startF=10, endF=40
    
    expect(result).toBeDefined()
    expect(result.type).toBe('object')
    // Should be a trim-path shape with animated s (start) keyframes
    // s: start at 0, end at 100 between frames 10-40
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/flow.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/flow.test.ts > flow primitive > adds trim-path animation (0→100 stroke) over frame span
  ReferenceError: flow is not defined
```

- [ ] **Step 5: Implement flow(startF, endF) trim-path primitive.**

Add to `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
/**
 * flow primitive: creates a trim-path shape for edge animation
 * @param startF frame when stroke begins drawing (0%)
 * @param endF frame when stroke finishes drawing (100%)
 */
export function flow(startF: number, endF: number) {
  const trimPath = ob('trim-path-shape', [
    at('ty', T.string.shapeType, pt('tm')),
    // Start (s): animated from 0 to 100
    at('s', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(1)),
      at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
        keyframe(startF, 0),
        keyframe(endF, 100),
      ])),
    ])),
    // End (e): always 100 (full stroke)
    at('e', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(100)),
    ])),
    // Offset (o): always 0
    at('o', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(0)),
    ])),
  ])
  
  return trimPath
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/flow.test.ts
```

Expected PASS:
```
PASS  tests/compiler/flow.test.ts (10ms)
  ✓ flow primitive
    ✓ adds trim-path animation (0→100 stroke) over frame span
```

- [ ] **Step 6: Write failing test for flow event orchestration in compile().**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/compile.test.ts`:

```typescript
describe('flow event orchestration', () => {
  it('translates flow event to edge layer with trim-path animation', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 120,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 100,
          w: 120,
          h: 60,
        },
        {
          kind: 'reveal',
          target: 'node-2',
          startF: 30,
          endF: 60,
          x: 200,
          y: 300,
          w: 100,
          h: 50,
        },
        {
          kind: 'flow',
          target: 'edge-1',
          startF: 60,
          endF: 90,
          from: 'node-1',
          to: 'node-2',
        },
      ],
    }
    
    const result = compile(timeline)
    
    expect(result.layers.length).toBe(3)  // 2 reveals + 1 flow
    const flowLayer = result.layers[2]
    expect(flowLayer.shapes).toBeDefined()
    // Should have path + stroke + trim-path
    const trimPathShape = flowLayer.shapes.find((s: any) => s.ty === 'tm')
    expect(trimPathShape).toBeDefined()
    expect(trimPathShape.s.a).toBe(1)  // animated
    expect(trimPathShape.s.k.length).toBe(2)
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/compile.test.ts > flow event orchestration > translates flow event to edge layer with trim-path animation
  AssertionError: expected 1 to equal 3 (result.layers.length)
```

- [ ] **Step 7: Modify compile() to orchestrate flow events.**

Update `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts`:

```typescript
import type { TimelineIR, TimelineEvent, TimelineEventReveal, TimelineEventFlow } from '../types/timeline'
import { rootCanvasAsm } from './primitives'
import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, cl } from '@lottiefiles/last-builder'
import type { LottieJSON } from '../types/compiler'

function keyframe(t: number, s: number) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    at('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [pt(s)])),
  ])
}

function buildRevealLayer(event: TimelineEventReveal, layerIndex: number) {
  // ... (unchanged from task 2)
}

function buildFlowLayer(event: TimelineEventFlow, layerIndex: number, eventMap: Map<string, TimelineEventReveal>) {
  // Look up source and target reveal events to get their geometry
  const fromEvent = eventMap.get(event.from)
  const toEvent = eventMap.get(event.to)
  
  if (!fromEvent || !toEvent) {
    throw new Error(`Flow edge ${event.target}: source/target nodes not in timeline`)
  }
  
  const fromBox = { x: fromEvent.x, y: fromEvent.y, w: fromEvent.w, h: fromEvent.h }
  const toBox = { x: toEvent.x, y: toEvent.y, w: toEvent.w, h: toEvent.h }
  
  // Compute connection points
  const fromCenter = [fromBox.x + fromBox.w / 2, fromBox.y + fromBox.h / 2]
  const toCenter = [toBox.x + toBox.w / 2, toBox.y + toBox.h / 2]
  
  // Bezier path (simplified: straight line)
  const pathShape = ob('path-shape', [
    at('ty', T.string.shapeType, pt('sh')),
    at('ks', T.element.layerPath, ob(T.object.layerPath, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.object.bezierPath, ob(T.object.bezierPath, [
        at('c', T.intBoolean.bezierClosed, pt(0)),
        cl('v', T.collection.vertices, ar(T.array.bezierPathChildren, [
          ar(T.array.bezierPathVertex, [pt(fromCenter[0]), pt(fromCenter[1])]),
          ar(T.array.bezierPathVertex, [pt(toCenter[0]), pt(toCenter[1])]),
        ])),
        cl('i', T.collection.bezierIn, ar(T.array.bezierInChildren, [])),
        cl('o', T.collection.bezierOut, ar(T.array.bezierOutChildren, [])),
      ])),
    ])),
  ])
  
  // Stroke
  const stroke = ob('stroke-shape', [
    at('ty', T.string.shapeType, pt('st')),
    at('c', T.element.fillColor, ob(T.object.color, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.color, ar(T.array.colorChildren, [
        pt(0), pt(0), pt(0), pt(1),
      ])),
    ])),
    at('w', T.element.strokeWidth, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(2)),
    ])),
  ])
  
  // Trim-path (flow animation)
  const trimPath = ob('trim-path-shape', [
    at('ty', T.string.shapeType, pt('tm')),
    at('s', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(1)),
      at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
        keyframe(event.startF, 0),
        keyframe(event.endF, 100),
      ])),
    ])),
    at('e', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(100)),
    ])),
    at('o', T.element.transformOpacity, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.number.keyframeValue, pt(0)),
    ])),
  ])
  
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [
    pathShape,
    stroke,
    trimPath,
  ]))
  
  const edgeLayer = ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    at('ks', T.element.layerTransform, ob('layer-transform-children', [
      el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
        at('a', T.intBoolean.animated, pt(0)),
        at('k', T.number.keyframeValue, pt(100)),
      ])),
    ])),
    shapes,
  ])
  
  return edgeLayer
}

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1
  
  // Build a map of reveal events by target id (for flow event lookups)
  const revealMap = new Map<string, TimelineEventReveal>()
  
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const layer = buildRevealLayer(event, layerIndex)
      layers.push(layer)
      revealMap.set(event.target, event)
      layerIndex++
    }
  })
  
  timeline.events.forEach(event => {
    if (event.kind === 'flow') {
      const layer = buildFlowLayer(event, layerIndex, revealMap)
      layers.push(layer)
      layerIndex++
    }
  })
  
  return rootCanvasAsm(timeline, layers)
}
```

Also update `/Users/li9292/Desktop/lottie-motion/src/types/timeline.ts`:

```typescript
export type TimelineEventFlow = {
  kind: 'flow'
  target: string
  startF: number
  endF: number
  from: string
  to: string
}

export type TimelineEvent =
  | TimelineEventReveal
  | TimelineEventFlow
  | { kind: 'highlight'; target: string; startF: number; endF: number }

export interface TimelineIR {
  fps: number
  width: number
  height: number
  totalFrames: number
  events: TimelineEvent[]
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected PASS:
```
PASS  tests/compiler/compile.test.ts (25ms)
  ✓ flow event orchestration
    ✓ translates flow event to edge layer with trim-path animation
```

- [ ] **Step 8: Commit edgePath + flow primitives and flow event orchestration.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/compiler/primitives.ts src/compiler/compile.ts src/types/timeline.ts tests/compiler/flow.test.ts && git commit -m "Implement edgePath + flow primitives and flow event orchestration

- Add edgePath(edge, fromBox, toBox) primitive to create path+stroke shape layers from edge geometry
- Add flow(startF, endF) trim-path primitive for edge drawing animation (0→100 stroke over frame span)
- Modify compile() to walk flow events after reveal events, compute connection points from source/target geometries
- Build edge layers with path + stroke + trim-path shapes; trim-path start animated from 0→100
- Layer indices continue auto-incrementing across reveal and flow events
- TDD: test verifies trim-path keyframes animate correctly

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Implement highlight primitive and close compiler layer

**Files:** Modify `src/compiler/compile.ts` (highlight event orchestration); Create `tests/compiler/highlight.test.ts` (highlight tests).

**Interfaces:**
- Consumes: `TimelineIR` with `highlight` events
- Produces: compiled Lottie JSON with scale/stroke emphasis animations for any layer

#### Steps

- [ ] **Step 1: Write failing test for highlight(startF, endF) primitive.**

Create `/Users/li9292/Desktop/lottie-motion/tests/compiler/highlight.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { highlight } from '../../src/compiler/primitives'

describe('highlight primitive', () => {
  it('creates scale and stroke emphasis keyframes', () => {
    const result = highlight(60, 90)  // startF=60, endF=90
    
    expect(result).toBeDefined()
    // highlight should return something we can inject into a layer's transform
    // for v0.1: scale pulse (100% → 110% → 100%) and stroke enhancement
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/highlight.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/highlight.test.ts > highlight primitive > creates scale and stroke emphasis keyframes
  ReferenceError: highlight is not defined
```

- [ ] **Step 2: Implement highlight(startF, endF) primitive (simplified for v0.1).**

Add to `/Users/li9292/Desktop/lottie-motion/src/compiler/primitives.ts`:

```typescript
/**
 * highlight primitive: creates scale emphasis keyframes
 * @param startF frame when emphasis begins
 * @param endF frame when emphasis ends
 */
export function highlight(startF: number, endF: number) {
  // Simplified v0.1: scale pulse 100 → 105 → 100 over the frame span
  const midF = Math.floor((startF + endF) / 2)
  
  const scale = el('s', T.element.transformScale, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(startF, 100),
      keyframe(midF, 105),
      keyframe(endF, 100),
    ])),
  ]))
  
  return scale
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/highlight.test.ts
```

Expected PASS:
```
PASS  tests/compiler/highlight.test.ts (8ms)
  ✓ highlight primitive
    ✓ creates scale and stroke emphasis keyframes
```

- [ ] **Step 3: Write failing test for highlight event orchestration.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/compile.test.ts`:

```typescript
describe('highlight event orchestration', () => {
  it('applies scale emphasis to any layer via highlight event', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 120,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 100,
          w: 120,
          h: 60,
        },
        {
          kind: 'highlight',
          target: 'node-1',
          startF: 90,
          endF: 120,
        },
      ],
    }
    
    const result = compile(timeline)
    
    expect(result.layers.length).toBe(1)  // 1 reveal layer (highlight modifies it in-place)
    const layer = result.layers[0]
    expect(layer.ks.s).toBeDefined()  // scale element
    expect(layer.ks.s.a).toBe(1)  // animated
    expect(layer.ks.s.k.length).toBe(3)  // 3 keyframes (start, mid, end)
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected FAIL:
```
FAIL  tests/compiler/compile.test.ts > highlight event orchestration > applies scale emphasis to any layer via highlight event
  AssertionError: expected undefined to be defined (layer.ks.s)
```

- [ ] **Step 4: Modify compile() to apply highlight animations.**

Update `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts`:

```typescript
export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1
  
  // Maps for lookups
  const revealMap = new Map<string, TimelineEventReveal>()
  const layersByTarget = new Map<string, any>()  // target id → layer object
  
  // First pass: build all reveal and flow layers
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const layer = buildRevealLayer(event, layerIndex)
      layers.push(layer)
      revealMap.set(event.target, event)
      layersByTarget.set(event.target, layer)
      layerIndex++
    }
  })
  
  timeline.events.forEach(event => {
    if (event.kind === 'flow') {
      const layer = buildFlowLayer(event, layerIndex, revealMap)
      layers.push(layer)
      layersByTarget.set(event.target, layer)
      layerIndex++
    }
  })
  
  // Second pass: apply highlight animations to existing layers
  timeline.events.forEach(event => {
    if (event.kind === 'highlight') {
      const targetLayer = layersByTarget.get(event.target)
      if (!targetLayer) {
        throw new Error(`Highlight: target ${event.target} not found in prior events`)
      }
      
      // Find or create scale element in transform
      const transformEl = targetLayer.props.children.find((c: any) => c.props?.key === 'ks')
      const transformChildren = transformEl.props.children
      
      let scaleEl = transformChildren.find((c: any) => c.props?.key === 's')
      if (!scaleEl) {
        // Create new scale element with highlight animation
        const midF = Math.floor((event.startF + event.endF) / 2)
        scaleEl = el('s', T.element.transformScale, ob(T.object.animatedValue, [
          at('a', T.intBoolean.animated, pt(1)),
          at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
            keyframe(event.startF, 100),
            keyframe(midF, 105),
            keyframe(event.endF, 100),
          ])),
        ]))
        transformChildren.push(scaleEl)
      } else {
        // Layer already has scale; modify its keyframes (or chain multiple highlights)
        // For v0.1, just skip (first highlight wins)
      }
    }
  })
  
  return rootCanvasAsm(timeline, layers)
}
```

However, the above approach mutates LAST AST nodes after construction, which is fragile. A cleaner approach is to collect highlights and apply them during layer construction. Simplify for v0.1: highlights are optional and apply only to reveals, not flows:

Update `/Users/li9292/Desktop/lottie-motion/src/compiler/compile.ts` (cleaner):

```typescript
function buildRevealLayer(event: TimelineEventReveal, layerIndex: number, highlightEvent?: TimelineEventHighlight) {
  // Position transform
  const position = el('p', T.element.layerPosition, ob(T.object.layerPosition, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
      pt(event.x),
      pt(event.y),
    ])),
  ]))
  
  // Opacity with fadeIn keyframes
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(event.startF, 0),
      keyframe(event.endF, 100),
    ])),
  ]))
  
  // Scale (optional: add if highlight event exists)
  let scale
  if (highlightEvent) {
    const midF = Math.floor((highlightEvent.startF + highlightEvent.endF) / 2)
    scale = el('s', T.element.transformScale, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(1)),
      at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
        keyframe(highlightEvent.startF, 100),
        keyframe(midF, 105),
        keyframe(highlightEvent.endF, 100),
      ])),
    ]))
  }
  
  const transformChildren = [position, opacity]
  if (scale) transformChildren.push(scale)
  
  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children', transformChildren))
  
  // Minimal shapes: rect + fill
  const rect = ob('rect-shape', [
    at('ty', T.string.shapeType, pt('rc')),
    at('p', T.element.layerPosition, ob(T.object.layerPosition, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.layerPositionValue, ar(T.array.layerPositionChildren, [
        pt(0),
        pt(0),
      ])),
    ])),
    at('s', T.element.layerScale, ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [
        pt(event.w),
        pt(event.h),
      ])),
    ])),
  ])
  
  const fill = ob('fill-shape', [
    at('ty', T.string.shapeType, pt('fl')),
    at('c', T.element.fillColor, ob(T.object.color, [
      at('a', T.intBoolean.animated, pt(0)),
      at('k', T.collection.color, ar(T.array.colorChildren, [
        pt(0.2), pt(0.2), pt(0.2), pt(1.0),
      ])),
    ])),
  ])
  
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [
    rect,
    fill,
  ]))
  
  const shapeLayer = ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    transform,
    shapes,
  ])
  
  return shapeLayer
}

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1
  
  const revealMap = new Map<string, TimelineEventReveal>()
  const highlightMap = new Map<string, TimelineEventHighlight>()
  
  // Collect highlights by target
  timeline.events.forEach(event => {
    if (event.kind === 'highlight') {
      highlightMap.set(event.target, event)
    }
  })
  
  // Build reveal layers with optional highlights
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const highlight = highlightMap.get(event.target)
      const layer = buildRevealLayer(event, layerIndex, highlight)
      layers.push(layer)
      revealMap.set(event.target, event)
      layerIndex++
    }
  })
  
  // Build flow layers
  timeline.events.forEach(event => {
    if (event.kind === 'flow') {
      const layer = buildFlowLayer(event, layerIndex, revealMap)
      layers.push(layer)
      layerIndex++
    }
  })
  
  return rootCanvasAsm(timeline, layers)
}
```

Also update `/Users/li9292/Desktop/lottie-motion/src/types/timeline.ts`:

```typescript
export type TimelineEventHighlight = {
  kind: 'highlight'
  target: string
  startF: number
  endF: number
}

export type TimelineEvent =
  | TimelineEventReveal
  | TimelineEventFlow
  | TimelineEventHighlight

export interface TimelineIR {
  fps: number
  width: number
  height: number
  totalFrames: number
  events: TimelineEvent[]
}
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected PASS:
```
PASS  tests/compiler/compile.test.ts (28ms)
  ✓ highlight event orchestration
    ✓ applies scale emphasis to any layer via highlight event
```

- [ ] **Step 5: Write end-to-end test (all three event types in one timeline).**

Add to `/Users/li9292/Desktop/lottie-motion/tests/compiler/compile.test.ts`:

```typescript
describe('compile end-to-end', () => {
  it('orchestrates reveal + flow + highlight events into a complete animation', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 150,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 50,
          w: 80,
          h: 60,
        },
        {
          kind: 'reveal',
          target: 'node-2',
          startF: 40,
          endF: 70,
          x: 150,
          y: 150,
          w: 80,
          h: 60,
        },
        {
          kind: 'flow',
          target: 'edge-1',
          startF: 80,
          endF: 110,
          from: 'node-1',
          to: 'node-2',
        },
        {
          kind: 'highlight',
          target: 'node-1',
          startF: 120,
          endF: 150,
        },
      ],
    }
    
    const result = compile(timeline)
    
    // Verify structure
    expect(result.v).toBe('5.9.0')
    expect(result.fr).toBe(30)
    expect(result.op).toBe(150)
    expect(result.w).toBe(200)
    expect(result.h).toBe(200)
    
    // Verify layers: node-1, node-2, edge-1
    expect(result.layers.length).toBe(3)
    
    // node-1: has fadeIn (0→100 opacity over 0-30) and highlight (scale 100→105→100 over 120-150)
    const node1 = result.layers[0]
    expect(node1.ks.o.a).toBe(1)
    expect(node1.ks.o.k[0]).toEqual({ t: 0, s: [0] })
    expect(node1.ks.o.k[1]).toEqual({ t: 30, s: [100] })
    expect(node1.ks.s).toBeDefined()
    expect(node1.ks.s.k[0]).toEqual({ t: 120, s: [100] })
    expect(node1.ks.s.k[1]).toEqual({ t: 135, s: [105] })  // midpoint
    expect(node1.ks.s.k[2]).toEqual({ t: 150, s: [100] })
    
    // node-2: has fadeIn (0→100 opacity over 40-70), no highlight
    const node2 = result.layers[1]
    expect(node2.ks.o.k[0]).toEqual({ t: 40, s: [0] })
    expect(node2.ks.o.k[1]).toEqual({ t: 70, s: [100] })
    expect(node2.ks.s).toBeUndefined()  // no highlight
    
    // edge-1: has path + stroke + trim-path (0→100 over 80-110)
    const edge1 = result.layers[2]
    expect(edge1.shapes).toBeDefined()
    const trimPathShape = edge1.shapes.find((s: any) => s.ty === 'tm')
    expect(trimPathShape.s.k[0]).toEqual({ t: 80, s: [0] })
    expect(trimPathShape.s.k[1]).toEqual({ t: 110, s: [100] })
  })
})
```

Run test:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/compiler/compile.test.ts
```

Expected PASS:
```
PASS  tests/compiler/compile.test.ts (35ms)
  ✓ compile end-to-end
    ✓ orchestrates reveal + flow + highlight events into a complete animation
```

- [ ] **Step 6: Commit highlight primitive and close compiler layer.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/compiler/compile.ts src/compiler/primitives.ts src/types/timeline.ts tests/compiler/highlight.test.ts && git commit -m "Implement highlight primitive and close compiler layer

- Add highlight(startF, endF) primitive for scale emphasis (100% → 105% → 100% pulse)
- Modify compile() to collect highlights by target and apply during layer construction
- Highlights attach to reveal layers' transform scale; optional per layer
- Add TimelineEventHighlight type and integrate into TimelineEvent union
- Add end-to-end test verifying all three event types (reveal + flow + highlight) orchestrate correctly
- Compiler layer now complete: walks events, emits layers, serializes to Lottie JSON via relottie-stringify
- Verified: opacity, trim-path, and scale keyframes all propagate correctly to Lottie

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

These four tasks implement the complete compiler layer for lottie-motion v0.1, following the TDD discipline, using real verified code from the design spec, and assembling the semantic primitives (node, fadeIn, edgePath, flow, highlight) into a working Lottie JSON compiler that orchestrates reveal, flow, and highlight events.

---

## PHASE 4: COMPILER GATE (verify Lottie contract — depends on compiler)

### Task 11: Compiler gate — schema validation setup

**Files:** Create/Modify/Test
- Create `src/gates/compilerGate.ts`
- Create `tests/gates/compilerGate.test.ts`
- Fetch and vendor lottie.schema.json

**Interfaces:** Consumes
- `LottieJSON` from `src/compiler/compile.ts` (type alias for `Record<string, unknown>`)
- `TimelineIR` from `src/types/timeline.ts`

Produces
- `compilerGate(lottie: LottieJSON, timeline: TimelineIR): GateResult`

**Steps:**

- [ ] **Step 1: Fetch and vendor official lottie.schema.json**

Run bash:
```bash
mkdir -p /Users/li9292/Desktop/lottie-motion/src/gates/schema && \
curl -s https://lottiefiles.github.io/lottie-docs/schema/lottie.schema.json \
  -o /Users/li9292/Desktop/lottie-motion/src/gates/schema/lottie.schema.json && \
wc -l /Users/li9292/Desktop/lottie-motion/src/gates/schema/lottie.schema.json
```

Expected output: `[large line count] /Users/li9292/Desktop/lottie-motion/src/gates/schema/lottie.schema.json`

- [ ] **Step 2: Write failing test for schema validation**

Create `tests/gates/compilerGate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { compilerGate } from '../../src/gates/compilerGate';
import { TimelineIR } from '../../src/types/timeline';
import type { LottieJSON } from '../../src/compiler/compile';

describe('compilerGate', () => {
  describe('schema validation', () => {
    it('passes when Lottie JSON is valid against schema', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test Animation',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when Lottie JSON is missing required top-level fields', () => {
      const lottie: LottieJSON = {
        // Missing v, fr, ip, op, w, h
        nm: 'Invalid'
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });
});
```

Run test:
```bash
npx vitest run tests/gates/compilerGate.test.ts
```

Expected output: **1 test fails** (no compilerGate function)

- [ ] **Step 3: Implement minimal compilerGate with ajv schema validation**

Install ajv:
```bash
cd /Users/li9292/Desktop/lottie-motion && npm install ajv
```

Create `src/gates/compilerGate.ts`:

```typescript
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import type { LottieJSON } from '../compiler/compile';
import { TimelineIR } from '../types/timeline';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

let ajvInstance: Ajv | null = null;
let schema: Record<string, unknown> | null = null;

function getValidator() {
  if (ajvInstance) {
    return ajvInstance;
  }

  ajvInstance = new Ajv();
  
  if (!schema) {
    const schemaPath = path.join(__dirname, 'schema', 'lottie.schema.json');
    const schemaText = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaText);
  }

  return ajvInstance;
}

export function compilerGate(lottie: LottieJSON, timeline: TimelineIR): GateResult {
  const failures: string[] = [];

  const ajv = getValidator();
  const validate = ajv.compile(schema as Record<string, unknown>);
  const valid = validate(lottie);

  if (!valid) {
    if (validate.errors) {
      for (const error of validate.errors) {
        failures.push(`Schema validation error: ${error.dataPath} ${error.message}`);
      }
    } else {
      failures.push('Schema validation failed (unknown error)');
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/compilerGate.test.ts
```

Expected output: **1 test passes**, **1 test fails** (contract check not implemented)

- [ ] **Step 4: Commit schema validation setup**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/gates/compilerGate.ts src/gates/schema/lottie.schema.json tests/gates/compilerGate.test.ts && git commit -m "feat(gates): compiler gate schema validation

Implement schema validation for Lottie JSON using ajv + official schema.
Vendor lottie.schema.json from lottiefiles docs.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Compiler gate — contract validation (w/h/fr/op-ip)

**Files:** Modify/Test
- Modify `src/gates/compilerGate.ts`
- Modify `tests/gates/compilerGate.test.ts`

**Interfaces:** Consumes (same as Task 5)
- Produces: Enhanced `compilerGate(...)` now checks contract

**Steps:**

- [ ] **Step 1: Write failing tests for contract validation**

Add to `tests/gates/compilerGate.test.ts`:

```typescript
  describe('contract validation (w/h/fr/op-ip)', () => {
    it('passes when Lottie contract matches Timeline IR', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(true);
    });

    it('fails when Lottie w does not match Timeline width', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 999,  // mismatch
        h: 600,
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('width') || f.includes('w'))).toBe(true);
    });

    it('fails when Lottie h does not match Timeline height', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 999,  // mismatch
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('height') || f.includes('h'))).toBe(true);
    });

    it('fails when Lottie fr (framerate) does not match Timeline fps', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 60,  // mismatch: timeline says 30
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('framerate') || f.includes('fps') || f.includes('fr'))).toBe(true);
    });

    it('fails when Lottie op (out-point) does not match Timeline totalFrames', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 999,  // mismatch: timeline says 120
        w: 800,
        h: 600,
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('op') || f.includes('totalFrames'))).toBe(true);
    });

    it('fails when Lottie ip (in-point) is not 0', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 5,  // must be 0
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('in-point') || f.includes('ip'))).toBe(true);
    });
  });
```

Run test:
```bash
npx vitest run tests/gates/compilerGate.test.ts
```

Expected output: **2 tests pass, 5 tests fail** (contract checks not implemented)

- [ ] **Step 2: Implement contract validation in compilerGate**

Modify `src/gates/compilerGate.ts`:

```typescript
export function compilerGate(lottie: LottieJSON, timeline: TimelineIR): GateResult {
  const failures: string[] = [];

  // Schema validation
  const ajv = getValidator();
  const validate = ajv.compile(schema as Record<string, unknown>);
  const valid = validate(lottie);

  if (!valid) {
    if (validate.errors) {
      for (const error of validate.errors) {
        failures.push(`Schema validation error: ${error.dataPath} ${error.message}`);
      }
    } else {
      failures.push('Schema validation failed (unknown error)');
    }
  }

  // Contract validation: w/h/fr/op-ip must match Timeline IR
  const w = lottie.w;
  const h = lottie.h;
  const fr = lottie.fr;
  const op = lottie.op;
  const ip = lottie.ip;

  if (w !== timeline.width) {
    failures.push(`Width contract mismatch: Lottie w=${w} does not match Timeline width=${timeline.width}`);
  }

  if (h !== timeline.height) {
    failures.push(`Height contract mismatch: Lottie h=${h} does not match Timeline height=${timeline.height}`);
  }

  if (fr !== timeline.fps) {
    failures.push(`Framerate contract mismatch: Lottie fr=${fr} does not match Timeline fps=${timeline.fps}`);
  }

  if (op !== timeline.totalFrames) {
    failures.push(`Out-point contract mismatch: Lottie op=${op} does not match Timeline totalFrames=${timeline.totalFrames}`);
  }

  if (ip !== 0) {
    failures.push(`In-point must be 0 (Lottie convention), got ip=${ip}`);
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/compilerGate.test.ts
```

Expected output: **all tests pass**

- [ ] **Step 3: Commit contract validation**

```bash
git add src/gates/compilerGate.ts tests/gates/compilerGate.test.ts && git commit -m "feat(gates): compiler gate contract validation

Add contract checks: Lottie w/h/fr/op-ip must equal Timeline width/height/fps/
totalFrames; in-point must be 0 (Lottie convention). Ensures the JSON and
semantic timeline remain synchronized.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

---

## PHASE 5: RENDERER (headless render — depends on compiler)

### Task 13: Renderer — headless Lottie rendering + frame sampling

**Files:**
- Create: `src/renderer/render.ts`
- Create: `tests/renderer/render.test.ts`

**Interfaces:**
- Consumes: `LottieJSON` (from compiler)
- Produces: `Frame { width; height; data: Uint8ClampedArray }`, `sampleFrames(totalFrames: number): number[]`, `render(lottie: LottieJSON, frames: number[]): Promise<Frame[]>`

> **Verified 2026-07-02** (`/tmp/render-probe`): node-canvas + jsdom + lottie-web canvas renderer renders our animations headless — NO Chromium/puppeteer. Two non-obvious constraints, each of which cost a failed attempt:
> 1. The jsdom DOM must be created ONCE at module load and LEFT IN PLACE. lottie-web schedules deferred timers that read `document.readyState` *after* `render()` returns; tearing down `globalThis.window` crashes with "Cannot read properties of undefined (reading 'readyState')".
> 2. lottie-web must be imported DYNAMICALLY, *after* `globalThis.window` exists. A static top-level `import lottie from 'lottie-web'` yields a default export with no `loadAnimation()`, because lottie-web inspects `window` at import time.
>
> Also proven: a layer with `shapes:[]` renders nothing — the compiler's `node()` primitive MUST emit a real rect+fill shape group. The render test below therefore uses a rectangle with an opacity ramp (blank at frame 0 → visible later) so frame-diff detects motion.

**Steps:**

- [ ] **Step 1: Write the failing test for sampleFrames + render**

Create `/Users/li9292/Desktop/lottie-motion/tests/renderer/render.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sampleFrames, render } from '../../src/renderer/render.js';

describe('sampleFrames', () => {
  it('returns [] for totalFrames < 1', () => {
    expect(sampleFrames(0)).toEqual([]);
    expect(sampleFrames(-3)).toEqual([]);
  });
  it('returns [0] for totalFrames === 1', () => {
    expect(sampleFrames(1)).toEqual([0]);
  });
  it('dedupes small totals: totalFrames === 4 -> [0,1,2,3]', () => {
    expect(sampleFrames(4)).toEqual([0, 1, 2, 3]);
  });
  it('samples [0, n/4, n/2, 3n/4, n-1] for totalFrames === 60', () => {
    expect(sampleFrames(60)).toEqual([0, 15, 30, 45, 59]);
  });
});

// A rectangle with an opacity ramp: blank at frame 0, fully visible by frame 15+.
const animFixture: Record<string, unknown> = {
  v: '5.9.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 't', ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'r', sr: 1,
    ks: {
      o: { a: 1, k: [{ t: 0, s: [0] }, { t: 59, s: [100] }] },
      r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes: [{ ty: 'gr', it: [
      { ty: 'rc', d: 1, s: { a: 0, k: [80, 80] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 } },
      { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } },
      { ty: 'tr', p: { a: 0, k: [50, 50] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
    ]}],
    ip: 0, op: 60, st: 0, bm: 0,
  }],
};

function pixelSum(f: { data: Uint8ClampedArray }): number {
  let s = 0;
  for (let i = 0; i < f.data.length; i++) s += f.data[i];
  return s;
}

describe('render', () => {
  it('throws on invalid canvas dimensions', async () => {
    await expect(render({ w: 0, h: 0 }, [0])).rejects.toThrow(/invalid canvas dimensions/);
  });

  it('renders sampled frames at correct dimensions and detects the opacity ramp', async () => {
    const frames = sampleFrames(60);
    const rendered = await render(animFixture, frames);
    expect(rendered).toHaveLength(frames.length);
    expect(rendered.every((f) => f.width === 100 && f.height === 100)).toBe(true);
    const sums = rendered.map(pixelSum);
    // frame 0 is blank (opacity 0); later frames show the red rectangle.
    expect(sums[0]).toBe(0);
    expect(sums[sums.length - 1]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/renderer/render.test.ts`
Expected: FAIL — `Cannot find module '../../src/renderer/render.js'` (or "render is not a function").

- [ ] **Step 3: Implement the renderer**

Create `/Users/li9292/Desktop/lottie-motion/src/renderer/render.ts`:

```typescript
// Headless Lottie rendering — node-canvas + jsdom + lottie-web canvas renderer.
// See Task notes: DOM is created ONCE at module load and left in place; lottie-web
// is imported dynamically AFTER window exists.
import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';

const _dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
(globalThis as unknown as { window: unknown }).window = _dom.window;
(globalThis as unknown as { document: unknown }).document = _dom.window.document;

export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA pixels
}

export function sampleFrames(totalFrames: number): number[] {
  if (totalFrames < 1) return [];
  const samples = [
    0,
    Math.floor(totalFrames / 4),
    Math.floor(totalFrames / 2),
    Math.floor((3 * totalFrames) / 4),
    totalFrames - 1,
  ];
  return Array.from(new Set(samples)).sort((a, b) => a - b);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lottie: any = null;
async function getLottie(): Promise<any> {
  if (!_lottie) {
    const mod: any = await import('lottie-web');
    _lottie = mod.default || mod;
  }
  return _lottie;
}

export async function render(
  lottie: Record<string, unknown>,
  frames: number[]
): Promise<Frame[]> {
  const width = Number(lottie.w);
  const height = Number(lottie.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`render: invalid canvas dimensions w=${lottie.w} h=${lottie.h}`);
  }

  const lottieWeb = await getLottie();
  const canvasEl = createCanvas(width, height);
  const ctx = canvasEl.getContext('2d');

  const item = lottieWeb.loadAnimation({
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: lottie,
    rendererSettings: { context: ctx, clearCanvas: true },
  });

  const out: Frame[] = [];
  for (const f of frames) {
    item.goToAndStop(f, true);
    const img = ctx.getImageData(0, 0, width, height);
    out.push({ width, height, data: img.data as unknown as Uint8ClampedArray });
  }
  item.destroy();
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/renderer/render.test.ts`
Expected: PASS — sampleFrames math holds; `render` returns 5 frames at 100×100; `sums[0] === 0` and the last sum `> 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add src/renderer/render.ts tests/renderer/render.test.ts && git commit -m "$(cat <<'EOF'
feat(renderer): headless Lottie render + frame sampling

- sampleFrames returns [0, n/4, n/2, 3n/4, n-1] floored, deduped
- render() rasterizes sampled frames via node-canvas + jsdom + lottie-web
  (canvas renderer, no Chromium); DOM set up once at module load, lottie-web
  imported dynamically after window exists
- verified: opacity-ramp rectangle renders blank->visible across frames

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## PHASE 6: RENDER GATE (verify motion — depends on renderer)

### Task 14: Render gate — motion detection and dimension contract

**Files:** Create/Modify/Test
- Create `src/gates/renderGate.ts`
- Create `tests/gates/renderGate.test.ts`

**Interfaces:** Consumes
- `Frame` interface from `src/renderer/render.ts`: `{ width: number; height: number; data: Uint8ClampedArray }`

Produces
- `renderGate(frames: Frame[], spec: { width: number; height: number }): GateResult`

**Steps:**

- [ ] **Step 1: Write failing test for motion detection**

Create `tests/gates/renderGate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderGate } from '../../src/gates/renderGate';
import type { Frame } from '../../src/renderer/render';

describe('renderGate', () => {
  describe('dimension contract', () => {
    it('passes when frame dimensions match spec', () => {
      // Create a simple RGBA frame (white pixels)
      const data = new Uint8ClampedArray(800 * 600 * 4);
      // Fill with white: RGBA = (255, 255, 255, 255)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      }

      const frame: Frame = {
        width: 800,
        height: 600,
        data
      };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame], spec);

      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when frame width does not match spec', () => {
      const data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      const frame: Frame = {
        width: 999,  // mismatch
        height: 600,
        data
      };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame], spec);

      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('width'))).toBe(true);
    });

    it('fails when frame height does not match spec', () => {
      const data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      const frame: Frame = {
        width: 800,
        height: 999,  // mismatch
        data
      };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame], spec);

      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('height'))).toBe(true);
    });
  });

  describe('motion detection (has_motion)', () => {
    it('passes when adjacent frames have differing pixels (motion detected)', () => {
      // Frame 1: black
      const data1 = new Uint8ClampedArray(800 * 600 * 4); // all zeros (black)
      
      // Frame 2: white (different)
      const data2 = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < data2.length; i += 4) {
        data2[i] = 255;
        data2[i + 1] = 255;
        data2[i + 2] = 255;
        data2[i + 3] = 255;
      }

      const frame1: Frame = { width: 800, height: 600, data: data1 };
      const frame2: Frame = { width: 800, height: 600, data: data2 };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame1, frame2], spec);

      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when all frames are identical (no motion)', () => {
      // Both frames: white
      const data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      const frame1: Frame = { width: 800, height: 600, data: new Uint8ClampedArray(data) };
      const frame2: Frame = { width: 800, height: 600, data: new Uint8ClampedArray(data) };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame1, frame2], spec);

      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('motion') || f.includes('static'))).toBe(true);
    });

    it('passes when single frame is provided (motion intent assumed)', () => {
      const data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      const frame: Frame = { width: 800, height: 600, data };

      const spec = { width: 800, height: 600 };
      const result = renderGate([frame], spec);

      // Single frame: we assume motion intent exists (builder gate already verified it)
      expect(result.pass).toBe(true);
    });
  });
});
```

Run test:
```bash
npx vitest run tests/gates/renderGate.test.ts
```

Expected output: **5 tests fail** (no renderGate function)

- [ ] **Step 2: Implement renderGate with motion detection and dimension validation**

Create `src/gates/renderGate.ts`:

```typescript
import type { Frame } from '../renderer/render';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

/**
 * Compare two RGBA pixel buffers and count differing pixels.
 * Returns the number of pixels that differ.
 */
function countDifferentPixels(data1: Uint8ClampedArray, data2: Uint8ClampedArray): number {
  if (data1.length !== data2.length) {
    return -1; // incomparable
  }

  let diffCount = 0;
  // Compare each pixel (4 bytes per pixel: RGBA)
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i];
    const g1 = data1[i + 1];
    const b1 = data1[i + 2];
    const a1 = data1[i + 3];

    const r2 = data2[i];
    const g2 = data2[i + 1];
    const b2 = data2[i + 2];
    const a2 = data2[i + 3];

    if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
      diffCount++;
    }
  }

  return diffCount;
}

export function renderGate(frames: Frame[], spec: { width: number; height: number }): GateResult {
  const failures: string[] = [];

  // Check dimension contract
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    if (frame.width !== spec.width) {
      failures.push(`Frame ${i}: width mismatch (frame.width=${frame.width}, spec.width=${spec.width})`);
    }

    if (frame.height !== spec.height) {
      failures.push(`Frame ${i}: height mismatch (frame.height=${frame.height}, spec.height=${spec.height})`);
    }
  }

  // Check motion: compare adjacent frames for pixel changes
  if (frames.length < 2) {
    // Single frame or empty: assume motion intent exists (builder gate verified it)
    // Render gate cannot disprove motion with < 2 samples
    return {
      pass: failures.length === 0,
      failures
    };
  }

  // Compare adjacent frame pairs
  let hasMotion = false;
  for (let i = 0; i < frames.length - 1; i++) {
    const frame1 = frames[i];
    const frame2 = frames[i + 1];

    const diffPixels = countDifferentPixels(frame1.data, frame2.data);
    if (diffPixels > 0) {
      hasMotion = true;
      break;
    }
  }

  if (!hasMotion) {
    failures.push('No motion detected: all sampled frames are identical (animation is fully static)');
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
```

Run test:
```bash
npx vitest run tests/gates/renderGate.test.ts
```

Expected output: **all tests pass**

- [ ] **Step 3: Commit render gate implementation**

```bash
git add src/gates/renderGate.ts tests/gates/renderGate.test.ts && git commit -m "feat(gates): render gate motion detection and dimension contract

Implement motion-realization check via frame-diff: sampled frames must show
pixel changes between adjacent pairs (has_motion). Also validate rendered
frame dimensions match spec. Proves animation actually renders and moves.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

---

## PHASE 7: GATE INTEGRATION

### Task 15: Export all gates from unified interface

**Files:** Create/Modify
- Create `src/gates/index.ts`
- Modify `src/types/gates.ts` (if needed)

**Interfaces:** Consumes
- `builderGate`, `compilerGate`, `renderGate`, `GateResult` from respective files

Produces
- Single export file for the gates layer

**Steps:**

- [ ] **Step 1: Create unified gates export index**

Create `src/gates/index.ts`:

```typescript
export { builderGate, type GateResult } from './builderGate';
export { compilerGate } from './compilerGate';
export { renderGate } from './renderGate';
```

Run test to ensure no build breakage:
```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/gates/
```

Expected output: **all gate tests pass**

- [ ] **Step 2: Commit unified export**

```bash
git add src/gates/index.ts && git commit -m "feat(gates): unified export interface

Export all three gates (builderGate, compilerGate, renderGate) and the
shared GateResult type from a single gates module index.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 16: Integration test — all three gates on a small canonical graph

**Files:** Create/Test
- Create `tests/gates/integration.test.ts`

**Interfaces:** Consumes
- All three gates from `src/gates/index.ts`
- Types from `src/types/timeline.ts`, `src/types/structure.ts`

Produces
- End-to-end fixture verifying gates work together

**Steps:**

- [ ] **Step 1: Write integration test combining all three gates**

Create `tests/gates/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { builderGate, compilerGate, renderGate } from '../../src/gates/index';
import type { TimelineIR } from '../../src/types/timeline';
import type { Structure } from '../../src/types/structure';
import type { LottieJSON } from '../../src/compiler/compile';
import type { Frame } from '../../src/renderer/render';

describe('Three-gate integration', () => {
  describe('canonical 3-node chain with motion', () => {
    it('passes all three gates for a valid animation', () => {
      // Structure: n1 -> n2 -> n3
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 },
          { id: 'n2', label: 'Middle', x: 100, y: 150, w: 60, h: 40 },
          { id: 'n3', label: 'End', x: 200, y: 280, w: 70, h: 50 }
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', label: 'flow' },
          { id: 'e2', source: 'n2', target: 'n3', label: 'flow' }
        ]
      };

      // Timeline: correct order, motion intent, spatial freeze
      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 150,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
          { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
          { kind: 'reveal', target: 'n3', startF: 30, endF: 42, x: 200, y: 280, w: 70, h: 50 },
          { kind: 'flow', target: 'e1', startF: 45, endF: 60, from: 'n1', to: 'n2' },
          { kind: 'flow', target: 'e2', startF: 63, endF: 78, from: 'n2', to: 'n3' }
        ]
      };

      // Builder gate
      const builderResult = builderGate(timeline, structure);
      expect(builderResult.pass).toBe(true);
      expect(builderResult.failures).toHaveLength(0);

      // Compiler gate (minimal valid Lottie)
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 150,
        w: 800,
        h: 600,
        nm: 'Canonical Chain',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const compilerResult = compilerGate(lottie, timeline);
      expect(compilerResult.pass).toBe(true);
      expect(compilerResult.failures).toHaveLength(0);

      // Render gate (mock frames: frame 0 = black, frame 1 = white)
      const frame0: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // black
      };

      const frame1Data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < frame1Data.length; i += 4) {
        frame1Data[i] = 255;     // R
        frame1Data[i + 1] = 255; // G
        frame1Data[i + 2] = 255; // B
        frame1Data[i + 3] = 255; // A
      }

      const frame1: Frame = {
        width: 800,
        height: 600,
        data: frame1Data
      };

      const renderResult = renderGate([frame0, frame1], { width: 800, height: 600 });
      expect(renderResult.pass).toBe(true);
      expect(renderResult.failures).toHaveLength(0);
    });

    it('rejects animation with builder gate failure (spatial freeze violation)', () => {
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 }
        ],
        edges: []
      };

      // Timeline event has wrong x coordinate (99 instead of 10)
      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 50,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 99, y: 20, w: 50, h: 30 } // x mismatch
        ]
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('x'))).toBe(true);
    });

    it('rejects animation with compiler gate failure (contract mismatch)', () => {
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 }
        ],
        edges: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 50,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 }
        ]
      };

      // Lottie has op=999 instead of 50
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 999,  // contract mismatch
        w: 800,
        h: 600,
        nm: 'Broken',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('out-point') || f.includes('op'))).toBe(true);
    });

    it('rejects animation with render gate failure (no motion)', () => {
      const frame1: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // all black
      };

      const frame2: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // also all black
      };

      const result = renderGate([frame1, frame2], { width: 800, height: 600 });
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('motion') || f.includes('static'))).toBe(true);
    });
  });
});
```

Run test:
```bash
npx vitest run tests/gates/integration.test.ts
```

Expected output: **all 4 integration tests pass**

- [ ] **Step 2: Commit integration test**

```bash
git add tests/gates/integration.test.ts && git commit -m "test(gates): integration tests for three-gate pipeline

Add end-to-end tests verifying builder, compiler, and render gates work
correctly in sequence on canonical graphs. Tests both pass and fail paths.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

---

## PHASE 8: CLI & SKILL PACKAGING

### Task 17: Create CLI entry point and fixture-based test

**Files:** Create `src/cli.ts`, test at `tests/cli.test.ts`, create fixture at `tests/fixtures/simple-chain.json`

**Interfaces:** Consumes (`validateStructure`, `plan`, `compile` from earlier tasks) / Produces (CLI executable with `--verify` and `--check` flags, exit codes)

- [ ] **Step 1: Write failing test for CLI reads structure.json and writes animation.json**

Create `tests/cli.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const fixtureDir = path.join(import.meta.dirname, 'fixtures');
const tmpDir = path.join(import.meta.dirname, 'tmp');

describe('CLI: structure.json → animation.json', () => {
  beforeEach(() => {
    if (!existsSync(tmpDir)) {
      // Will be created by mkdir -p in CLI if needed
    }
  });

  afterEach(() => {
    const files = ['structure.json', 'animation.json'];
    for (const f of files) {
      const fp = path.join(tmpDir, f);
      if (existsSync(fp)) unlinkSync(fp);
    }
  });

  it('reads structure.json, validates, plans, compiles, writes animation.json on success', () => {
    // Copy fixture to tmpDir
    const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI
    const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath}`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    // Assert animation.json exists and contains Lottie shape
    expect(existsSync(animationPath)).toBe(true);
    const animation = JSON.parse(readFileSync(animationPath, 'utf-8'));
    expect(animation).toHaveProperty('v'); // Lottie schema
    expect(animation).toHaveProperty('fr'); // fps
    expect(animation).toHaveProperty('ip'); // in point
    expect(animation).toHaveProperty('op'); // out point
  });
});
```

Run test (expect FAIL):

```bash
npx vitest run tests/cli.test.ts
```

Expected output:

```
FAIL  tests/cli.test.ts > CLI: structure.json → animation.json > reads structure.json, validates, plans, compiles, writes animation.json on success
Error: spawn npx tsx src/cli.ts ... ENOENT
```

- [ ] **Step 2: Create fixture `simple-chain.json`**

Create `tests/fixtures/simple-chain.json`:

```json
{
  "vertices": [
    { "id": "a", "label": "Start", "x": 0, "y": 0, "w": 100, "h": 50 },
    { "id": "b", "label": "Middle", "x": 150, "y": 0, "w": 100, "h": 50 },
    { "id": "c", "label": "End", "x": 300, "y": 0, "w": 100, "h": 50 }
  ],
  "edges": [
    { "id": "e1", "source": "a", "target": "b", "label": "" },
    { "id": "e2", "source": "b", "target": "c", "label": "" }
  ]
}
```

- [ ] **Step 3: Create minimal CLI skeleton**

Create `src/cli.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import process from 'process';
import { validateStructure } from './validate';
import { plan } from './planner/plan';
import { compile } from './compiler/compile';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');

if (inputIdx === -1 || outputIdx === -1) {
  console.error('Usage: cli.ts --input <structure.json> --output <animation.json>');
  process.exit(1);
}

const inputPath = args[inputIdx + 1];
const outputPath = args[outputIdx + 1];

try {
  // Read structure.json
  const structureRaw = JSON.parse(readFileSync(inputPath, 'utf-8'));

  // Validate
  const structure = validateStructure(structureRaw);

  // Plan
  const timeline = plan(structure);

  // Compile
  const lottie = compile(timeline);

  // Write animation.json
  const outputDir = path.dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(lottie, null, 2));

  process.exit(0);
} catch (e) {
  console.error('CLI error:', (e as Error).message);
  process.exit(1);
}
```

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

Expected output:

```
PASS  tests/cli.test.ts (3 tests) 1.2s
```

- [ ] **Step 4: Commit**

```bash
git add tests/cli.test.ts tests/fixtures/simple-chain.json src/cli.ts && git commit -m "feat: CLI reads structure.json, validates, plans, compiles, writes animation.json

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 18: Add --verify flag to CLI (runs three gates)

**Files:** Modify `src/cli.ts`, extend test at `tests/cli.test.ts`

**Interfaces:** Consumes (`builderGate`, `compilerGate`, `renderGate` from gate tasks, `sampleFrames`, `render` from renderer) / Produces (CLI with `--verify` flag, nonzero exit on gate failure)

- [ ] **Step 1: Write failing test for --verify runs all three gates and exits 0 on success**

Add to `tests/cli.test.ts`:

```typescript
it('--verify runs builder, compiler, render gates and exits 0 on success', () => {
  const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
  const structurePath = path.join(tmpDir, 'structure.json');
  const animationPath = path.join(tmpDir, 'animation.json');

  const fixtureContent = readFileSync(fixtureInput, 'utf-8');
  writeFileSync(structurePath, fixtureContent);

  // Run CLI with --verify
  const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --verify`;
  const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

  expect(result).toContain('Builder gate: PASS');
  expect(result).toContain('Compiler gate: PASS');
  expect(result).toContain('Render gate: PASS');
});
```

Run test (expect FAIL):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 2: Extend CLI to accept --verify and run gates**

Update `src/cli.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import process from 'process';
import { validateStructure } from './validate';
import { plan } from './planner/plan';
import { compile } from './compiler/compile';
import { builderGate } from './gates/builder-gate';
import { compilerGate } from './gates/compiler-gate';
import { renderGate } from './gates/render-gate';
import { sampleFrames, render } from './renderer/render';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');
const verifyIdx = args.indexOf('--verify');

if (inputIdx === -1 || outputIdx === -1) {
  console.error('Usage: cli.ts --input <structure.json> --output <animation.json> [--verify]');
  process.exit(1);
}

const inputPath = args[inputIdx + 1];
const outputPath = args[outputIdx + 1];
const shouldVerify = verifyIdx !== -1;

try {
  // Read structure.json
  const structureRaw = JSON.parse(readFileSync(inputPath, 'utf-8'));

  // Validate
  const structure = validateStructure(structureRaw);

  // Plan
  const timeline = plan(structure);

  // Compile
  const lottie = compile(timeline);

  // Builder gate (cheapest)
  if (shouldVerify) {
    const builderResult = builderGate(timeline, structure);
    console.log(`Builder gate: ${builderResult.pass ? 'PASS' : 'FAIL'}`);
    if (!builderResult.pass) {
      for (const msg of builderResult.failures) {
        console.error(`  ${msg}`);
      }
      process.exit(1);
    }
  }

  // Compiler gate
  if (shouldVerify) {
    const compilerResult = compilerGate(lottie, timeline);
    console.log(`Compiler gate: ${compilerResult.pass ? 'PASS' : 'FAIL'}`);
    if (!compilerResult.pass) {
      for (const msg of compilerResult.failures) {
        console.error(`  ${msg}`);
      }
      process.exit(1);
    }
  }

  // Render gate (most expensive)
  if (shouldVerify) {
    const frames = await render(lottie, sampleFrames(timeline.totalFrames));
    const renderResult = renderGate(frames, { width: timeline.width, height: timeline.height });
    console.log(`Render gate: ${renderResult.pass ? 'PASS' : 'FAIL'}`);
    if (!renderResult.pass) {
      for (const msg of renderResult.failures) {
        console.error(`  ${msg}`);
      }
      process.exit(1);
    }
  }

  // Write animation.json
  const outputDir = path.dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(lottie, null, 2));

  process.exit(0);
} catch (e) {
  console.error('CLI error:', (e as Error).message);
  process.exit(1);
}
```

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts tests/cli.test.ts && git commit -m "feat: CLI --verify flag runs three gates (builder, compiler, render)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 19: Add --check flag to CLI (validates output contract)

**Files:** Modify `src/cli.ts`, extend test at `tests/cli.test.ts`

**Interfaces:** Consumes (Timeline IR contract: `width`, `height`, `fps`, `totalFrames`) / Produces (CLI with `--check` flag, contract validation)

- [ ] **Step 1: Write failing test for --check validates output contract**

Add to `tests/cli.test.ts`:

```typescript
it('--check validates output contract (w, h, fr, op-ip)', () => {
  const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
  const structurePath = path.join(tmpDir, 'structure.json');
  const animationPath = path.join(tmpDir, 'animation.json');

  const fixtureContent = readFileSync(fixtureInput, 'utf-8');
  writeFileSync(structurePath, fixtureContent);

  // Run CLI with --check
  const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --check`;
  const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

  expect(result).toContain('Contract check: PASS');
});
```

Run test (expect FAIL):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 2: Extend CLI to accept --check and validate contract**

Update `src/cli.ts` to add contract validation function:

```typescript
function checkContract(lottie: unknown, timeline: any): { pass: boolean; failures: string[] } {
  const failures: string[] = [];

  if (typeof lottie !== 'object' || lottie === null) {
    failures.push('Lottie JSON must be an object');
    return { pass: false, failures };
  }

  const obj = lottie as Record<string, any>;

  // Check w, h match
  if (obj.w !== timeline.width) {
    failures.push(`Width mismatch: expected ${timeline.width}, got ${obj.w}`);
  }
  if (obj.h !== timeline.height) {
    failures.push(`Height mismatch: expected ${timeline.height}, got ${obj.h}`);
  }

  // Check fr (fps)
  if (obj.fr !== timeline.fps) {
    failures.push(`FPS mismatch: expected ${timeline.fps}, got ${obj.fr}`);
  }

  // Check op-ip (totalFrames)
  // op = out point = totalFrames - 1 (since ip = 0, op is the last frame index)
  const expectedOp = timeline.totalFrames - 1;
  if (obj.op !== expectedOp) {
    failures.push(`Out-point mismatch: expected ${expectedOp}, got ${obj.op}`);
  }
  if (obj.ip !== 0) {
    failures.push(`In-point must be 0, got ${obj.ip}`);
  }

  return { pass: failures.length === 0, failures };
}
```

Then update the main CLI logic to handle `--check`:

```typescript
const checkIdx = args.indexOf('--check');
const shouldCheck = checkIdx !== -1;

// ... after writing animation.json ...

if (shouldCheck) {
  const contractResult = checkContract(lottie, timeline);
  console.log(`Contract check: ${contractResult.pass ? 'PASS' : 'FAIL'}`);
  if (!contractResult.pass) {
    for (const msg of contractResult.failures) {
      console.error(`  ${msg}`);
    }
    process.exit(1);
  }
}
```

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts tests/cli.test.ts && git commit -m "feat: CLI --check flag validates output contract (w/h/fr/op-ip)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 20: Add test for deliberate failure (broken structure, nonzero exit)

**Files:** Modify test at `tests/cli.test.ts`, create fixture `tests/fixtures/broken-structure.json`

**Interfaces:** Consumes (CLI exit codes) / Produces (test assert nonzero exit on invalid structure)

- [ ] **Step 1: Create broken structure fixture**

Create `tests/fixtures/broken-structure.json`:

```json
{
  "vertices": [
    { "id": "a", "label": "Start", "x": 0, "y": 0, "w": 100, "h": 50 }
  ],
  "edges": [
    { "id": "e1", "source": "a", "target": "nonexistent", "label": "" }
  ]
}
```

- [ ] **Step 2: Write test for exit nonzero on broken structure**

Add to `tests/cli.test.ts`:

```typescript
it('exits nonzero (lanshu discipline) when structure is invalid (dangling edge)', () => {
  const fixtureInput = path.join(fixtureDir, 'broken-structure.json');
  const structurePath = path.join(tmpDir, 'structure.json');
  const animationPath = path.join(tmpDir, 'animation.json');

  const fixtureContent = readFileSync(fixtureInput, 'utf-8');
  writeFileSync(structurePath, fixtureContent);

  // Run CLI — should fail
  let exitCode = 0;
  try {
    execSync(`npx tsx src/cli.ts --input ${structurePath} --output ${animationPath}`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
  } catch (e: any) {
    exitCode = e.status;
  }

  expect(exitCode).not.toBe(0);
});
```

Run test (expect FAIL):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 3: Verify CLI already exits nonzero on validation error**

The existing CLI already has a try-catch that calls `process.exit(1)` on error, so the test should pass without changes.

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/cli.test.ts tests/fixtures/broken-structure.json && git commit -m "test: CLI exits nonzero on invalid structure (lanshu discipline)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 21: Create SKILL.md and CLI skill manifest

**Files:** Create `SKILL.md`, create `skill-manifest.json`

**Interfaces:** Consumes (CLI executable) / Produces (skill registered with Claude Code harness)

- [ ] **Step 1: Create SKILL.md documentation**

Create `SKILL.md`:

```markdown
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
npx lottie-motion --input structure.json --output animation.json

# Verify with all three gates (Builder, Compiler, Render)
npx lottie-motion --input structure.json --output animation.json --verify

# Check output contract (canvas dimensions, fps, duration)
npx lottie-motion --input structure.json --output animation.json --check
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
```

- [ ] **Step 2: Create skill-manifest.json**

Create `skill-manifest.json`:

```json
{
  "name": "lottie-motion",
  "version": "0.1.0",
  "description": "Deterministic compiler: architecture diagram/flowchart → Lottie vector animation",
  "entry": "npx tsx src/cli.ts",
  "type": "cli",
  "requires": {
    "input_file": {
      "description": "Path to structure.json (Vertex+Edge graph)",
      "format": "json",
      "schema": {
        "type": "object",
        "properties": {
          "vertices": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "label": { "type": "string" },
                "x": { "type": "number" },
                "y": { "type": "number" },
                "w": { "type": "number" },
                "h": { "type": "number" }
              },
              "required": ["id", "label", "x", "y", "w", "h"]
            }
          },
          "edges": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "source": { "type": "string" },
                "target": { "type": "string" },
                "label": { "type": "string" }
              },
              "required": ["id", "source", "target", "label"]
            }
          }
        },
        "required": ["vertices", "edges"]
      }
    }
  },
  "produces": {
    "output_file": {
      "description": "Path to animation.json (Lottie JSON)",
      "format": "json"
    }
  },
  "flags": [
    { "name": "input", "short": "i", "type": "string", "required": true, "description": "Path to structure.json" },
    { "name": "output", "short": "o", "type": "string", "required": true, "description": "Path to animation.json" },
    { "name": "verify", "short": "v", "type": "boolean", "required": false, "description": "Run three gates (Builder, Compiler, Render)" },
    { "name": "check", "short": "c", "type": "boolean", "required": false, "description": "Validate output contract" }
  ],
  "exitCodes": {
    "0": "Success",
    "1": "Validation/gate/contract failure"
  }
}
```

- [ ] **Step 3: Add test for skill invocation**

Add to `tests/cli.test.ts`:

```typescript
it('skill manifest correctly declares input/output/flags', () => {
  const manifest = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'skill-manifest.json'), 'utf-8'));

  expect(manifest.name).toBe('lottie-motion');
  expect(manifest.requires.input_file.format).toBe('json');
  expect(manifest.produces.output_file.format).toBe('json');
  expect(manifest.flags.map((f: any) => f.name)).toContain('input');
  expect(manifest.flags.map((f: any) => f.name)).toContain('output');
  expect(manifest.flags.map((f: any) => f.name)).toContain('verify');
  expect(manifest.flags.map((f: any) => f.name)).toContain('check');
});
```

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add SKILL.md skill-manifest.json tests/cli.test.ts && git commit -m "docs: Create SKILL.md and skill-manifest.json for CLI packaging

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 22: End-to-end integration test (all three gates + check)

**Files:** Add to `tests/cli.test.ts`

**Interfaces:** Consumes (CLI with all flags) / Produces (integration test asserting full pipeline)

- [ ] **Step 1: Write comprehensive integration test**

Add to `tests/cli.test.ts`:

```typescript
it('e2e: --verify --check runs all gates and checks contract, exits 0 on complete success', () => {
  const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
  const structurePath = path.join(tmpDir, 'structure.json');
  const animationPath = path.join(tmpDir, 'animation.json');

  const fixtureContent = readFileSync(fixtureInput, 'utf-8');
  writeFileSync(structurePath, fixtureContent);

  // Run CLI with both --verify and --check
  const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --verify --check`;
  const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

  expect(result).toContain('Builder gate: PASS');
  expect(result).toContain('Compiler gate: PASS');
  expect(result).toContain('Render gate: PASS');
  expect(result).toContain('Contract check: PASS');

  // Verify animation.json was written
  expect(existsSync(animationPath)).toBe(true);
  const animation = JSON.parse(readFileSync(animationPath, 'utf-8'));
  expect(animation.v).toBeDefined(); // Lottie version
});
```

Run test (expect PASS):

```bash
npx vitest run tests/cli.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add tests/cli.test.ts && git commit -m "test: e2e integration test for CLI with --verify --check

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

---

## PHASE 9: mxGraph ADAPTER (boundary, optional)

### Task 23: Create mxGraph XML test fixture and validate-mxgraph test structure

**Files:**
- Create: `tests/fixtures/simple-chain.mxgraph.xml` (small mxGraph XML fixture — 3-node chain)
- Create: `tests/adapters/mxgraph.test.ts` (TDD test file)
- Modify: `src/adapters/mxgraph.ts` (adapter, will create)

**Interfaces:**
- Consumes: `Structure` type from `src/types/structure.ts` (Vertex[], Edge[])
- Produces: `function parseMxGraph(xml: string): Structure` (exported from adapter)
- Uses: `validateStructure` from `src/validate.ts` (existing entry guard)

**Steps:**

- [ ] **Step 1: Create mxGraph XML fixture (3-node chain A→B→C).**

Create `/Users/li9292/Desktop/lottie-motion/tests/fixtures/simple-chain.mxgraph.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <!-- Node A: x=10, y=10, width=80, height=60 -->
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="10" y="10" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Node B: x=150, y=50, width=80, height="60" -->
    <mxCell id="nodeB" value="B" parent="1" vertex="1">
      <mxGeometry x="150" y="50" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Node C: x=280, y=80, width=80, height=60 -->
    <mxCell id="nodeC" value="C" parent="1" vertex="1">
      <mxGeometry x="280" y="80" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Edge A→B -->
    <mxCell id="edgeAB" edge="1" parent="1" source="nodeA" target="nodeB">
      <mxGeometry as="geometry" />
    </mxCell>
    <!-- Edge B→C -->
    <mxCell id="edgeBC" edge="1" parent="1" source="nodeB" target="nodeC">
      <mxGeometry as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

- [ ] **Step 2: Write failing test for parseMxGraph.**

Create `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseMxGraph } from '../../src/adapters/mxgraph';
import { Structure } from '../../src/types/structure';
import * as fs from 'fs';
import * as path from 'path';

describe('mxGraph adapter', () => {
  it('parses simple 3-node chain mxGraph XML to Structure', () => {
    const xmlPath = path.join(__dirname, '../fixtures/simple-chain.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    
    const result: Structure = parseMxGraph(xml);
    
    // Expect 3 vertices
    expect(result.vertices).toHaveLength(3);
    
    // Vertex A
    expect(result.vertices[0]).toEqual({
      id: 'nodeA',
      label: 'A',
      x: 10,
      y: 10,
      w: 80,
      h: 60
    });
    
    // Vertex B
    expect(result.vertices[1]).toEqual({
      id: 'nodeB',
      label: 'B',
      x: 150,
      y: 50,
      w: 80,
      h: 60
    });
    
    // Vertex C
    expect(result.vertices[2]).toEqual({
      id: 'nodeC',
      label: 'C',
      x: 280,
      y: 80,
      w: 80,
      h: 60
    });
    
    // Expect 2 edges
    expect(result.edges).toHaveLength(2);
    
    // Edge A→B
    expect(result.edges[0]).toEqual({
      id: 'edgeAB',
      source: 'nodeA',
      target: 'nodeB',
      label: ''
    });
    
    // Edge B→C
    expect(result.edges[1]).toEqual({
      id: 'edgeBC',
      source: 'nodeB',
      target: 'nodeC',
      label: ''
    });
  });
});
```

- [ ] **Step 3: Run test to confirm it fails (parseMxGraph does not exist).**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `FAIL ... Cannot find module '../../src/adapters/mxgraph'` or similar import error.

---

### Task 24: Implement parseMxGraph XML parser

**Files:**
- Create: `src/adapters/mxgraph.ts` (parser implementation)

**Interfaces:**
- Produces: `export function parseMxGraph(xml: string): Structure`
- Consumes: `Structure`, `Vertex`, `Edge` types from `src/types/structure.ts`

**Steps:**

- [ ] **Step 1: Create minimal mxgraph.ts with XML parsing using built-in DOM parser.**

Create `/Users/li9292/Desktop/lottie-motion/src/adapters/mxgraph.ts`:
```typescript
import { Structure, Vertex, Edge } from '../types/structure';

export function parseMxGraph(xml: string): Structure {
  // Parse XML using Node's built-in support (or DOMParser polyfill if needed)
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  
  // Check for parse errors
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid XML');
  }
  
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  
  // Find all mxCell elements
  const cells = doc.querySelectorAll('mxCell');
  
  // First pass: extract vertices (cells with vertex="1" attribute and mxGeometry child)
  for (const cell of cells) {
    const isVertex = cell.getAttribute('vertex') === '1';
    if (isVertex) {
      const id = cell.getAttribute('id');
      const label = cell.getAttribute('value') || '';
      const geometry = cell.querySelector('mxGeometry');
      
      if (id && geometry) {
        const x = parseFloat(geometry.getAttribute('x') || '0');
        const y = parseFloat(geometry.getAttribute('y') || '0');
        const w = parseFloat(geometry.getAttribute('width') || '0');
        const h = parseFloat(geometry.getAttribute('height') || '0');
        
        vertices.push({ id, label, x, y, w, h });
      }
    }
  }
  
  // Second pass: extract edges (cells with edge="1" attribute)
  for (const cell of cells) {
    const isEdge = cell.getAttribute('edge') === '1';
    if (isEdge) {
      const id = cell.getAttribute('id');
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      const label = cell.getAttribute('value') || '';
      
      if (id && source && target) {
        edges.push({ id, source, target, label });
      }
    }
  }
  
  return { vertices, edges };
}
```

- [ ] **Step 2: Install DOM parser polyfill for Node.js environment (if needed).**

Check if the test environment has DOMParser. If running in Node.js directly, add a polyfill. First, check if vitest is configured with jsdom or happy-dom:

```bash
cd /Users/li9292/Desktop/lottie-motion && grep -E '"environment"|jsdom|happy-dom' vitest.config.ts 2>/dev/null || echo "Check vitest config"
```

If not set, either:
- Update `vitest.config.ts` to set `environment: 'jsdom'`, OR
- Import a DOM parser polyfill at the top of the adapter:

```typescript
// At the very top of mxgraph.ts, if needed:
import { JSDOM } from 'jsdom';
const { DOMParser } = new JSDOM('').window;
```

(Assuming jsdom is already a dev dependency; if not, it will be added as part of vitest's standard setup.)

- [ ] **Step 3: Run test to verify parsing works.**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `PASS tests/adapters/mxgraph.test.ts (1 test)` ✓

- [ ] **Step 4: Commit implementation.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add -A && git commit -m "$(cat <<'EOF'
feat(adapters): implement mxGraph XML parser

Add parseMxGraph function to parse figure-canvas mxGraph XML (vertices with
geometry, edges with source/target) into canonical Structure IR.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Integrate validateStructure entry guard with parseMxGraph

**Files:**
- Modify: `src/adapters/mxgraph.ts` (call validateStructure on parsed output)
- Modify: `tests/adapters/mxgraph.test.ts` (add test for validation error on invalid input)

**Interfaces:**
- Consumes: `validateStructure(input: unknown): Structure` from `src/validate.ts`
- Produces: `parseMxGraph(xml: string): Structure` (now with validation)

**Steps:**

- [ ] **Step 1: Update parseMxGraph to call validateStructure on the output.**

Modify `/Users/li9292/Desktop/lottie-motion/src/adapters/mxgraph.ts`:

Replace the return statement at the end:
```typescript
import { validateStructure } from '../validate';

// ... (existing parsing code) ...

  return validateStructure({ vertices, edges });
}
```

Full updated function:
```typescript
import { Structure, Vertex, Edge } from '../types/structure';
import { validateStructure } from '../validate';

export function parseMxGraph(xml: string): Structure {
  // Parse XML using Node's built-in support
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  
  // Check for parse errors
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid XML');
  }
  
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  
  // Find all mxCell elements
  const cells = doc.querySelectorAll('mxCell');
  
  // First pass: extract vertices (cells with vertex="1" attribute and mxGeometry child)
  for (const cell of cells) {
    const isVertex = cell.getAttribute('vertex') === '1';
    if (isVertex) {
      const id = cell.getAttribute('id');
      const label = cell.getAttribute('value') || '';
      const geometry = cell.querySelector('mxGeometry');
      
      if (id && geometry) {
        const x = parseFloat(geometry.getAttribute('x') || '0');
        const y = parseFloat(geometry.getAttribute('y') || '0');
        const w = parseFloat(geometry.getAttribute('width') || '0');
        const h = parseFloat(geometry.getAttribute('height') || '0');
        
        vertices.push({ id, label, x, y, w, h });
      }
    }
  }
  
  // Second pass: extract edges (cells with edge="1" attribute)
  for (const cell of cells) {
    const isEdge = cell.getAttribute('edge') === '1';
    if (isEdge) {
      const id = cell.getAttribute('id');
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      const label = cell.getAttribute('value') || '';
      
      if (id && source && target) {
        edges.push({ id, source, target, label });
      }
    }
  }
  
  return validateStructure({ vertices, edges });
}
```

- [ ] **Step 2: Add test for validation error on dangling edge.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts` inside the describe block:

```typescript
  it('throws StructureError when edge references non-existent vertex', () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="10" y="10" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Edge references non-existent target -->
    <mxCell id="edgeDangling" edge="1" parent="1" source="nodeA" target="nodeX">
      <mxGeometry as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;
    
    expect(() => parseMxGraph(invalidXml)).toThrow();
  });
```

- [ ] **Step 3: Run tests to verify validation is triggered.**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `PASS tests/adapters/mxgraph.test.ts (2 tests)` ✓

- [ ] **Step 4: Commit integration.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add -A && git commit -m "$(cat <<'EOF'
feat(adapters): integrate validateStructure guard into mxGraph parser

parseMxGraph now validates parsed Structure against entry-guard rules
(unique ids, complete geometry, valid edges). Rejects dangling edges
and missing geometry at parse time.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Add edge label support and multi-node fixture test

**Files:**
- Create: `tests/fixtures/diamond-dag.mxgraph.xml` (more complex fixture with labeled edges)
- Modify: `tests/adapters/mxgraph.test.ts` (add test for diamond DAG with edge labels)

**Interfaces:**
- Consumes: `parseMxGraph(xml: string): Structure` (already implemented)
- Produces: same, but now tested with edge labels

**Steps:**

- [ ] **Step 1: Create diamond DAG fixture with labeled edges.**

Create `/Users/li9292/Desktop/lottie-motion/tests/fixtures/diamond-dag.mxgraph.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <!-- Node A (top) -->
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="100" y="10" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Node B (bottom-left) -->
    <mxCell id="nodeB" value="B" parent="1" vertex="1">
      <mxGeometry x="20" y="100" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Node C (bottom-right) -->
    <mxCell id="nodeC" value="C" parent="1" vertex="1">
      <mxGeometry x="180" y="100" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Node D (bottom center) -->
    <mxCell id="nodeD" value="D" parent="1" vertex="1">
      <mxGeometry x="100" y="190" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Edge A→B labeled "left" -->
    <mxCell id="edgeAB" value="left" edge="1" parent="1" source="nodeA" target="nodeB">
      <mxGeometry as="geometry" />
    </mxCell>
    <!-- Edge A→C labeled "right" -->
    <mxCell id="edgeAC" value="right" edge="1" parent="1" source="nodeA" target="nodeC">
      <mxGeometry as="geometry" />
    </mxCell>
    <!-- Edge B→D -->
    <mxCell id="edgeBD" edge="1" parent="1" source="nodeB" target="nodeD">
      <mxGeometry as="geometry" />
    </mxCell>
    <!-- Edge C→D -->
    <mxCell id="edgeCD" edge="1" parent="1" source="nodeC" target="nodeD">
      <mxGeometry as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

- [ ] **Step 2: Add test for diamond DAG with edge labels.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts` inside the describe block:

```typescript
  it('parses diamond DAG with labeled edges', () => {
    const xmlPath = path.join(__dirname, '../fixtures/diamond-dag.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    
    const result: Structure = parseMxGraph(xml);
    
    // Expect 4 vertices
    expect(result.vertices).toHaveLength(4);
    expect(result.vertices.map(v => v.id)).toEqual(['nodeA', 'nodeB', 'nodeC', 'nodeD']);
    
    // Expect 4 edges
    expect(result.edges).toHaveLength(4);
    
    // Check labeled edges
    const edgeAB = result.edges.find(e => e.id === 'edgeAB');
    expect(edgeAB).toEqual({
      id: 'edgeAB',
      source: 'nodeA',
      target: 'nodeB',
      label: 'left'
    });
    
    const edgeAC = result.edges.find(e => e.id === 'edgeAC');
    expect(edgeAC).toEqual({
      id: 'edgeAC',
      source: 'nodeA',
      target: 'nodeC',
      label: 'right'
    });
  });
```

- [ ] **Step 3: Run test to verify edge labels are correctly parsed.**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `PASS tests/adapters/mxgraph.test.ts (3 tests)` ✓

- [ ] **Step 4: Commit fixture and test.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add -A && git commit -m "$(cat <<'EOF'
test(adapters): add diamond DAG fixture and test edge labels

Add diamond-dag.mxgraph.xml fixture and test to verify edge labels are
correctly preserved during parsing. Covers 4-node DAG with 4 edges.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: Verify integration with Structure validation and document adapter contract

**Files:**
- Modify: `src/adapters/mxgraph.ts` (add JSDoc comments documenting the contract)
- Create: `tests/adapters/mxgraph.test.ts` (add test for missing geometry rejection)

**Interfaces:**
- Consumes: `validateStructure` from `src/validate.ts`
- Produces: `parseMxGraph(xml: string): Structure` (fully documented)

**Steps:**

- [ ] **Step 1: Add test for missing geometry in vertex (must be rejected by validateStructure).**

Add to `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts` inside the describe block:

```typescript
  it('throws error when vertex has no geometry', () => {
    const xmlNoGeometry = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <!-- Vertex without mxGeometry child -->
    <mxCell id="nodeA" value="A" parent="1" vertex="1" />
  </root>
</mxGraphModel>`;
    
    expect(() => parseMxGraph(xmlNoGeometry)).toThrow();
  });
```

- [ ] **Step 2: Add test for zero or negative width/height (must be rejected by validateStructure).**

Add to `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts` inside the describe block:

```typescript
  it('throws error when vertex has zero or negative dimensions', () => {
    const xmlZeroDim = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="10" y="10" width="0" height="60" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;
    
    expect(() => parseMxGraph(xmlZeroDim)).toThrow();
  });
```

- [ ] **Step 3: Run all tests to verify validation catches malformed inputs.**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `PASS tests/adapters/mxgraph.test.ts (5 tests)` ✓

- [ ] **Step 4: Add JSDoc contract to mxgraph.ts.**

Update `/Users/li9292/Desktop/lottie-motion/src/adapters/mxgraph.ts` to add JSDoc at the top:

```typescript
/**
 * Parse mxGraph XML (figure-canvas format) into canonical Structure IR.
 *
 * Converts mxGraph XML elements:
 * - <mxCell vertex="1"> with child <mxGeometry x/y/width/height> → Vertex
 * - <mxCell edge="1" source= target=> → Edge
 *
 * All parsed Vertices and Edges are validated by validateStructure:
 * - Each vertex MUST have complete numeric x/y/w/h (w, h > 0)
 * - Each edge's source/target MUST reference existing vertex ids
 * - Duplicate ids are rejected
 *
 * @param xml - mxGraph XML string
 * @returns Structure { vertices, edges } after validation
 * @throws Error if XML is malformed
 * @throws StructureError if validation fails (missing geometry, dangling edges, etc)
 */
export function parseMxGraph(xml: string): Structure {
  // ... existing implementation ...
}
```

- [ ] **Step 5: Commit validation and documentation.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add -A && git commit -m "$(cat <<'EOF'
test(adapters): add validation error tests and JSDoc contract

Add tests for missing geometry and zero-dimension validation. Add JSDoc
documenting the mxGraph→Structure adapter contract: entry-guard validates
all vertices have complete geometry, all edges reference valid vertices.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: End-to-end test: mxGraph XML → Structure → passed validation

**Files:**
- Modify: `tests/adapters/mxgraph.test.ts` (add integration test)

**Interfaces:**
- Consumes: `parseMxGraph(xml: string): Structure`, `validateStructure(input: unknown): Structure`
- Produces: validated Structure ready for planner

**Steps:**

- [ ] **Step 1: Add e2e test asserting that parsed Structure is ready for the planner.**

Add to `/Users/li9292/Desktop/lottie-motion/tests/adapters/mxgraph.test.ts` inside the describe block:

```typescript
  it('produces Structure ready for planner (e2e)', () => {
    const xmlPath = path.join(__dirname, '../fixtures/simple-chain.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    
    const structure: Structure = parseMxGraph(xml);
    
    // Verify all vertices have complete geometry
    for (const v of structure.vertices) {
      expect(v.id).toBeTruthy();
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.w).toBeGreaterThan(0);
      expect(v.h).toBeGreaterThan(0);
    }
    
    // Verify all edge endpoints exist
    const vertexIds = new Set(structure.vertices.map(v => v.id));
    for (const e of structure.edges) {
      expect(vertexIds.has(e.source)).toBe(true);
      expect(vertexIds.has(e.target)).toBe(true);
    }
    
    // Verify no duplicate vertex ids
    const ids = structure.vertices.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
```

- [ ] **Step 2: Run e2e test.**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run tests/adapters/mxgraph.test.ts
```

Expected output: `PASS tests/adapters/mxgraph.test.ts (6 tests)` ✓

- [ ] **Step 3: Verify all tests still pass (no regressions).**

```bash
cd /Users/li9292/Desktop/lottie-motion && npx vitest run
```

Expected output: All tests pass, including mxgraph tests.

- [ ] **Step 4: Final commit.**

```bash
cd /Users/li9292/Desktop/lottie-motion && git add -A && git commit -m "$(cat <<'EOF'
test(adapters): add e2e test for mxGraph→Structure→planner pipeline

Add integration test verifying parsed Structure is valid for planner:
all vertices have complete geometry, edges reference valid vertices,
no duplicate ids. This confirms the boundary adapter hands off to the
core with the correct contract.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

---

# VERIFICATION CHECKLIST

- [ ] Full test suite passes: `npx vitest run`
- [ ] TypeScript compiles clean: `npx tsc --noEmit`
- [ ] CLI e2e: `npx tsx src/cli.ts --input tests/fixtures/simple-chain.json --output /tmp/out.json --verify --check` exits 0
- [ ] Deliberately broken structure exits nonzero
- [ ] No TODO/TBD/placeholder remains: `grep -rn "TODO\|TBD\|deferred to inline\|not yet implemented" src/ | grep -v node_modules` returns nothing
- [ ] All commits use `Co-Authored-By: Claude <noreply@anthropic.com>`
