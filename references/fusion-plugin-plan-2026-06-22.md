# Fusion Plugin v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained Codex plugin that turns a paper's method section into an editable mxGraph-XML vector skeleton on a tldraw canvas, then renders it to a publication-quality bitmap via Codex `imagegen`.

**Architecture:** Fork cowart's canvas+MCP base into a new plugin `figure-canvas/`. Add a pure conversion core (`lib/structure.mjs`) that maps mxGraph XML ↔ tldraw store records, with structural connectivity carried in shape `meta` (version-robust, deterministic read-back). Two new MCP tools (`render_structure`, `get_structure`) wrap the core with thin HTTP handlers against cowart's existing `/api/canvas`. Three vendored markdown skills supply the happy-figure semantic brain and the AutoFigure VLM-Judge rubric.

**Tech Stack:** Node ESM (`.mjs`), tldraw `^5.1.1` (via cowart canvas), Vite dev server (cowart base), `fractional-indexing` (cowart), `fast-xml-parser` `^4.3.0` (new), `node:test` + `node:assert` for tests (zero-install).

## Global Constraints

- Single Node runtime only. Do NOT add Python, Mermaid CLI, Puppeteer, or Playwright to this plugin.
- v0.1 supports exactly one figure type: technical roadmap / architecture diagram. Do not generalize.
- Plugin must be self-contained: vendored copies of cowart base and happy-figure/AutoFigure text, zero external-repo runtime dependency.
- The intermediate representation (IR) used across all conversion functions is fixed:
  - `Vertex = { id: string, label: string, x: number, y: number, w: number, h: number }`
  - `Edge = { id: string, source: string, target: string, label: string }`
  - `Structure = { vertices: Vertex[], edges: Edge[] }`
- Structural connectivity lives in tldraw shape `meta`, never inferred from geometry: vertices carry `meta.sciKind='vertex'`, `meta.sciCellId`; edges carry `meta.sciKind='edge'`, `meta.sciCellId`, `meta.sciSourceId`, `meta.sciTargetId`. Both carry `meta.sciLabel`.
- tldraw shape `props` must validate against the installed tldraw version (`^5.1.1`). If a live render rejects a shape, inspect `figure-canvas/node_modules/tldraw` default shape definitions and adjust props — do NOT guess silently.
- Test files end in `.test.mjs` and run via `node --test`. Run all tests with `npm test` from `figure-canvas/`.
- Commit after every task (each task ends in a passing test + commit).

---

### Task 1: Scaffold the fusion plugin from cowart base

**Files:**
- Create: `figure-canvas/` (copied from `cowart/`, excluding `.git`, `node_modules`, `canvas`)
- Modify: `figure-canvas/package.json`
- Modify: `figure-canvas/.codex-plugin/plugin.json`
- Create: `figure-canvas/test/mcp-stdio.mjs` (test helper)
- Create: `figure-canvas/test/smoke.test.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `callMcp(requests: object[]) => Promise<object[]>` from `test/mcp-stdio.mjs` — spawns `node mcp/server.mjs`, writes each request as a JSON line, resolves with parsed response lines in order. Used by Tasks 6, 7, 9.

- [ ] **Step 1: Copy cowart base into the new plugin directory**

Run from repo root (`/Users/li9292/Desktop/codex flowchart`):

```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='canvas' cowart/ figure-canvas/
```

- [ ] **Step 2: Rename plugin identity**

Edit `figure-canvas/package.json` — change the `name` field:

```json
"name": "figure-canvas",
```

Add `fast-xml-parser` to `dependencies` and a `test` script:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "fast-xml-parser": "^4.3.0",
    "fractional-indexing": "^3.2.0",
    "vite": "^7.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tldraw": "^5.1.1"
  },
```

Edit `figure-canvas/.codex-plugin/plugin.json` — change `name`, `interface.displayName`, and `interface.shortDescription`:

```json
  "name": "figure-canvas",
  "version": "0.1.0",
  "description": "Turn a paper's method section into an editable vector structure diagram on a local canvas, then render it to a publication-quality figure with Codex imagegen.",
```

```json
    "displayName": "Figure Canvas",
    "shortDescription": "Paper to editable structure diagram to publication figure, inside Codex.",
```

- [ ] **Step 3: Install dependencies**

```bash
cd figure-canvas && npm install
```

Expected: installs without error; `node_modules/fast-xml-parser` and `node_modules/fractional-indexing` exist.

- [ ] **Step 4: Write the MCP stdio test helper**

Create `figure-canvas/test/mcp-stdio.mjs`:

```js
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "mcp", "server.mjs");

export function callMcp(requests, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [serverPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const responses = [];
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.length === 0) continue;
        responses.push(JSON.parse(line));
        if (responses.length === requests.length) {
          child.kill();
          resolve(responses);
        }
      }
    });
    child.on("error", reject);
    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
  });
}
```

- [ ] **Step 5: Write the failing smoke test**

Create `figure-canvas/test/smoke.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { callMcp } from "./mcp-stdio.mjs";

test("MCP server lists tools", async () => {
  const [, listed] = await callMcp([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("get_cowart_selection"));
  assert.ok(names.includes("insert_cowart_image"));
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd figure-canvas && npm test`
Expected: PASS — the copied cowart MCP server boots and lists its two existing tools. (If FAIL with module-not-found, re-check Step 3.)

- [ ] **Step 7: Commit**

```bash
cd figure-canvas && git add -A && cd .. && git add figure-canvas
git commit -m "feat: scaffold figure-canvas plugin from cowart base"
```

---

### Task 2: Parse mxGraph XML into the IR

**Files:**
- Create: `figure-canvas/lib/structure.mjs`
- Create: `figure-canvas/test/structure-parse.test.mjs`

**Interfaces:**
- Consumes: `fast-xml-parser` (XMLParser).
- Produces: `parseMxGraphXml(xml: string) => Structure` — exported from `lib/structure.mjs`. Vertices come from `<mxCell vertex="1">` (label from `value`, geometry from child `<mxGeometry>`); edges from `<mxCell edge="1">` (`source`/`target` attributes). Root cells (`id="0"`, `id="1"`) are ignored.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/structure-parse.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMxGraphXml } from "../lib/structure.mjs";

const XML = `<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="Input" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="n2" value="Model" vertex="1" parent="1"><mxGeometry x="240" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" value="feeds" edge="1" parent="1" source="n1" target="n2"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;

test("parseMxGraphXml extracts vertices and edges", () => {
  const structure = parseMxGraphXml(XML);
  assert.deepEqual(structure.vertices, [
    { id: "n1", label: "Input", x: 40, y: 40, w: 120, h: 60 },
    { id: "n2", label: "Model", x: 240, y: 40, w: 120, h: 60 },
  ]);
  assert.deepEqual(structure.edges, [
    { id: "e1", source: "n1", target: "n2", label: "feeds" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/structure-parse.test.mjs`
Expected: FAIL with "Cannot find module '../lib/structure.mjs'".

- [ ] **Step 3: Write minimal implementation**

Create `figure-canvas/lib/structure.mjs`:

```js
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "mxCell",
});

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseMxGraphXml(xml) {
  const parsed = xmlParser.parse(xml);
  const cells = parsed?.mxGraphModel?.root?.mxCell ?? [];
  const vertices = [];
  const edges = [];
  for (const cell of cells) {
    const id = String(cell["@_id"]);
    const label = cell["@_value"] != null ? String(cell["@_value"]) : "";
    if (cell["@_vertex"] === "1") {
      const geo = cell.mxGeometry ?? {};
      vertices.push({
        id,
        label,
        x: asNumber(geo["@_x"]),
        y: asNumber(geo["@_y"]),
        w: asNumber(geo["@_width"], 120),
        h: asNumber(geo["@_height"], 60),
      });
    } else if (cell["@_edge"] === "1") {
      edges.push({
        id,
        source: String(cell["@_source"]),
        target: String(cell["@_target"]),
        label,
      });
    }
  }
  return { vertices, edges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/structure-parse.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs test/structure-parse.test.mjs && cd ..
git commit -m "feat: parse mxGraph XML into structure IR"
```

---

### Task 3: Convert IR to tldraw store records

**Files:**
- Modify: `figure-canvas/lib/structure.mjs`
- Create: `figure-canvas/test/structure-to-records.test.mjs`

**Interfaces:**
- Consumes: `Structure` IR; `fractional-indexing` (`generateKeyBetween`).
- Produces: `structureToTldrawRecords(structure: Structure, pageId: string) => { records: object[] }`. Each vertex becomes a `geo` rectangle shape `id="shape:<sanitized cellId>"` carrying `meta.sciKind="vertex"`. Each edge becomes an `arrow` shape `id="shape:edge-<sanitized cellId>"` with `props.start`/`props.end` at source/target box centers and `meta.sciKind="edge"`. `sanitizeId(raw: string) => string` is also exported.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/structure-to-records.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { structureToTldrawRecords } from "../lib/structure.mjs";

const STRUCTURE = {
  vertices: [
    { id: "n1", label: "Input", x: 0, y: 0, w: 100, h: 60 },
    { id: "n2", label: "Model", x: 200, y: 0, w: 100, h: 60 },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", label: "feeds" }],
};

test("vertices become geo shapes with sci meta", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  const box = records.find((r) => r.meta?.sciCellId === "n1");
  assert.equal(box.type, "geo");
  assert.equal(box.typeName, "shape");
  assert.equal(box.parentId, "page:main");
  assert.equal(box.props.geo, "rectangle");
  assert.equal(box.props.text, "Input");
  assert.equal(box.meta.sciKind, "vertex");
});

test("edges become arrow shapes anchored at box centers", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  const arrow = records.find((r) => r.meta?.sciCellId === "e1");
  assert.equal(arrow.type, "arrow");
  assert.equal(arrow.meta.sciKind, "edge");
  assert.equal(arrow.meta.sciSourceId, "n1");
  assert.equal(arrow.meta.sciTargetId, "n2");
  assert.deepEqual(arrow.props.start, { x: 50, y: 30 });
  assert.deepEqual(arrow.props.end, { x: 250, y: 30 });
});

test("all shapes get distinct fractional indexes", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  const indexes = records.map((r) => r.index);
  assert.equal(new Set(indexes).size, records.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/structure-to-records.test.mjs`
Expected: FAIL with "structureToTldrawRecords is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `figure-canvas/lib/structure.mjs`:

```js
import { generateKeyBetween } from "fractional-indexing";

export function sanitizeId(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function center(vertex) {
  return { x: vertex.x + vertex.w / 2, y: vertex.y + vertex.h / 2 };
}

function geoShape(vertex, pageId, index) {
  return {
    id: `shape:${sanitizeId(vertex.id)}`,
    typeName: "shape",
    type: "geo",
    x: vertex.x,
    y: vertex.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    parentId: pageId,
    index,
    props: {
      geo: "rectangle",
      w: vertex.w,
      h: vertex.h,
      text: vertex.label,
      color: "black",
      labelColor: "black",
      fill: "none",
      dash: "draw",
      size: "m",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      growY: 0,
      url: "",
    },
    meta: { sciKind: "vertex", sciCellId: vertex.id, sciLabel: vertex.label },
  };
}

function arrowShape(edge, byId, pageId, index) {
  const start = center(byId.get(edge.source));
  const end = center(byId.get(edge.target));
  return {
    id: `shape:edge-${sanitizeId(edge.id)}`,
    typeName: "shape",
    type: "arrow",
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    parentId: pageId,
    index,
    props: {
      start,
      end,
      bend: 0,
      text: edge.label,
      color: "black",
      labelColor: "black",
      dash: "draw",
      size: "m",
      font: "draw",
      arrowheadStart: "none",
      arrowheadEnd: "arrow",
    },
    meta: {
      sciKind: "edge",
      sciCellId: edge.id,
      sciSourceId: edge.source,
      sciTargetId: edge.target,
      sciLabel: edge.label,
    },
  };
}

export function structureToTldrawRecords(structure, pageId) {
  const byId = new Map(structure.vertices.map((v) => [v.id, v]));
  const records = [];
  let index = generateKeyBetween(null, null);
  for (const vertex of structure.vertices) {
    records.push(geoShape(vertex, pageId, index));
    index = generateKeyBetween(index, null);
  }
  for (const edge of structure.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    records.push(arrowShape(edge, byId, pageId, index));
    index = generateKeyBetween(index, null);
  }
  return { records };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/structure-to-records.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs test/structure-to-records.test.mjs && cd ..
git commit -m "feat: convert structure IR to tldraw records"
```

---

### Task 4: Read tldraw records back into the IR

**Files:**
- Modify: `figure-canvas/lib/structure.mjs`
- Create: `figure-canvas/test/records-to-structure.test.mjs`

**Interfaces:**
- Consumes: tldraw shape records (with sci meta).
- Produces: `tldrawRecordsToStructure(records: object[]) => Structure`. Reads only records with `meta.sciKind`. Vertex geometry/label reflect the record's live `x/y/props.w/props.h/props.text` (so user edits are captured). Round-trip property: feeding `structureToTldrawRecords` output back yields the original structure.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/records-to-structure.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  structureToTldrawRecords,
  tldrawRecordsToStructure,
} from "../lib/structure.mjs";

const STRUCTURE = {
  vertices: [
    { id: "n1", label: "Input", x: 0, y: 0, w: 100, h: 60 },
    { id: "n2", label: "Model", x: 200, y: 0, w: 100, h: 60 },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", label: "feeds" }],
};

test("round-trips structure through records", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  assert.deepEqual(tldrawRecordsToStructure(records), STRUCTURE);
});

test("captures user edits to position and label", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  const moved = records.map((r) =>
    r.meta.sciCellId === "n1"
      ? { ...r, x: 500, props: { ...r.props, text: "Renamed" } }
      : r,
  );
  const result = tldrawRecordsToStructure(moved);
  const n1 = result.vertices.find((v) => v.id === "n1");
  assert.equal(n1.x, 500);
  assert.equal(n1.label, "Renamed");
});

test("dropped vertices disappear from structure", () => {
  const { records } = structureToTldrawRecords(STRUCTURE, "page:main");
  const kept = records.filter((r) => r.meta.sciCellId !== "n2");
  const result = tldrawRecordsToStructure(kept);
  assert.equal(result.vertices.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/records-to-structure.test.mjs`
Expected: FAIL with "tldrawRecordsToStructure is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `figure-canvas/lib/structure.mjs`:

```js
export function tldrawRecordsToStructure(records) {
  const vertices = [];
  const edges = [];
  for (const record of records) {
    const kind = record?.meta?.sciKind;
    if (kind === "vertex") {
      vertices.push({
        id: record.meta.sciCellId,
        label: record.props?.text ?? record.meta.sciLabel ?? "",
        x: record.x,
        y: record.y,
        w: record.props?.w ?? 120,
        h: record.props?.h ?? 60,
      });
    } else if (kind === "edge") {
      edges.push({
        id: record.meta.sciCellId,
        source: record.meta.sciSourceId,
        target: record.meta.sciTargetId,
        label: record.props?.text ?? record.meta.sciLabel ?? "",
      });
    }
  }
  return { vertices, edges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/records-to-structure.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs test/records-to-structure.test.mjs && cd ..
git commit -m "feat: read tldraw records back into structure IR"
```

---

### Task 5: Serialize the IR back to mxGraph XML

**Files:**
- Modify: `figure-canvas/lib/structure.mjs`
- Create: `figure-canvas/test/structure-to-xml.test.mjs`

**Interfaces:**
- Consumes: `Structure` IR.
- Produces: `structureToMxGraphXml(structure: Structure) => string`. Output re-parses via `parseMxGraphXml` to an equal structure (round-trip stable). Values are XML-escaped.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/structure-to-xml.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMxGraphXml,
  structureToMxGraphXml,
} from "../lib/structure.mjs";

const STRUCTURE = {
  vertices: [
    { id: "n1", label: "In & Out", x: 40, y: 40, w: 120, h: 60 },
    { id: "n2", label: "Model", x: 240, y: 40, w: 120, h: 60 },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", label: "feeds" }],
};

test("xml round-trips back to the same structure", () => {
  const xml = structureToMxGraphXml(STRUCTURE);
  assert.deepEqual(parseMxGraphXml(xml), STRUCTURE);
});

test("escapes special characters in labels", () => {
  const xml = structureToMxGraphXml(STRUCTURE);
  assert.ok(xml.includes("In &amp; Out"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/structure-to-xml.test.mjs`
Expected: FAIL with "structureToMxGraphXml is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `figure-canvas/lib/structure.mjs`:

```js
function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function structureToMxGraphXml(structure) {
  const lines = ['<mxGraphModel><root>', '<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const v of structure.vertices) {
    lines.push(
      `<mxCell id="${escapeXml(v.id)}" value="${escapeXml(v.label)}" vertex="1" parent="1">` +
        `<mxGeometry x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" as="geometry"/></mxCell>`,
    );
  }
  for (const e of structure.edges) {
    lines.push(
      `<mxCell id="${escapeXml(e.id)}" value="${escapeXml(e.label)}" edge="1" parent="1" ` +
        `source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }
  lines.push("</root></mxGraphModel>");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/structure-to-xml.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs test/structure-to-xml.test.mjs && cd ..
git commit -m "feat: serialize structure IR to mxGraph XML"
```

---

### Task 6: Snapshot mutation + `render_structure` MCP tool

**Files:**
- Modify: `figure-canvas/lib/structure.mjs`
- Modify: `figure-canvas/mcp/server.mjs`
- Create: `figure-canvas/test/apply-structure.test.mjs`

**Interfaces:**
- Consumes: `parseMxGraphXml`, `structureToTldrawRecords`, a tldraw snapshot `{schema, store}`.
- Produces:
  - `applyStructureToSnapshot(snapshot: object, structure: Structure, pageId: string) => object` (pure) — returns a new snapshot where all prior `meta.sciKind` shapes on `pageId` are replaced by the structure's records (idempotent re-render).
  - New MCP tool `render_structure` in `server.mjs` with input `{ xml, pageId?, cowartUrl?, ...canvasDir args }`: GET `/api/canvas`, apply, PUT, return inserted shape ids.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/apply-structure.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStructureToSnapshot } from "../lib/structure.mjs";

function baseSnapshot() {
  return {
    schema: { schemaVersion: 2 },
    store: {
      "page:main": { id: "page:main", typeName: "page", name: "Main", index: "a1" },
      "shape:keep": { id: "shape:keep", typeName: "shape", type: "geo", parentId: "page:main", meta: {} },
    },
  };
}

const STRUCTURE = {
  vertices: [{ id: "n1", label: "Input", x: 0, y: 0, w: 100, h: 60 }],
  edges: [],
};

test("adds structure shapes without touching non-sci shapes", () => {
  const next = applyStructureToSnapshot(baseSnapshot(), STRUCTURE, "page:main");
  assert.ok(next.store["shape:keep"], "non-sci shape preserved");
  const added = Object.values(next.store).find((r) => r.meta?.sciCellId === "n1");
  assert.ok(added, "structure shape added");
});

test("re-render replaces prior sci shapes", () => {
  const once = applyStructureToSnapshot(baseSnapshot(), STRUCTURE, "page:main");
  const twice = applyStructureToSnapshot(once, STRUCTURE, "page:main");
  const sciShapes = Object.values(twice.store).filter((r) => r.meta?.sciKind === "vertex");
  assert.equal(sciShapes.length, 1, "no duplicate sci shapes after re-render");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/apply-structure.test.mjs`
Expected: FAIL with "applyStructureToSnapshot is not a function".

- [ ] **Step 3: Write the pure mutation function**

Append to `figure-canvas/lib/structure.mjs`:

```js
export function applyStructureToSnapshot(snapshot, structure, pageId) {
  const store = { ...snapshot.store };
  for (const [id, record] of Object.entries(store)) {
    if (record?.meta?.sciKind && record.parentId === pageId) delete store[id];
  }
  const { records } = structureToTldrawRecords(structure, pageId);
  for (const record of records) store[record.id] = record;
  return { schema: snapshot.schema, store };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd figure-canvas && node --test test/apply-structure.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire the MCP tool**

In `figure-canvas/mcp/server.mjs`, add this import at the top (after the existing imports):

```js
import { parseMxGraphXml, applyStructureToSnapshot, structureToMxGraphXml, readStructureFromSnapshot } from "../lib/structure.mjs";
```

Add a tool-name constant near the other `TOOL_*` constants:

```js
const TOOL_RENDER_STRUCTURE = "render_structure";
```

Add a handler function above `toolDefinitions()`:

```js
async function renderStructure(args = {}) {
  const xml = nonEmptyString(args.xml);
  if (!xml) throw new Error("xml is required.");
  const { cowartUrl, snapshot } = await loadCanvasSnapshot(args);
  const viewState = await readViewState(args);
  const pageId =
    nonEmptyString(args.pageId) ||
    nonEmptyString(viewState?.currentPageId) ||
    Object.values(snapshot.store).find((r) => r?.typeName === "page")?.id;
  if (!pageId || !snapshot.store[pageId]) throw new Error("Could not determine target pageId.");
  const structure = parseMxGraphXml(xml);
  const next = applyStructureToSnapshot(snapshot, structure, pageId);
  if (!args.dryRun) await saveCanvasSnapshot(cowartUrl, next);
  const shapeIds = Object.values(next.store)
    .filter((r) => r?.meta?.sciKind && r.parentId === pageId)
    .map((r) => r.id);
  return { cowartUrl, pageId, shapeIds, vertexCount: structure.vertices.length, edgeCount: structure.edges.length, dryRun: Boolean(args.dryRun) };
}
```

Add a tool definition object to the array returned by `toolDefinitions()`:

```js
    {
      name: TOOL_RENDER_STRUCTURE,
      title: "Render Structure",
      description: "Render an mxGraph XML structure diagram as editable tldraw shapes on a Cowart page. Replaces any previously rendered structure shapes on that page.",
      inputSchema: {
        type: "object",
        properties: {
          xml: { type: "string", description: "mxGraph XML describing vertices and edges." },
          pageId: { type: "string", description: "Target tldraw page id. Optional; defaults to current/first page." },
          projectDir: { type: "string", description: "Absolute Cowart project directory containing canvas/." },
          canvasDir: { type: "string", description: "Absolute canvas directory. Overrides projectDir." },
          cowartUrl: { type: "string", description: "Running Cowart URL." },
          dryRun: { type: "boolean", description: "Compute without saving." },
        },
        required: ["xml"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
```

Add a branch in `handleToolCall(id, params)` before the final `sendError`:

```js
  if (params?.name === TOOL_RENDER_STRUCTURE) {
    const result = await renderStructure(params.arguments ?? {});
    sendResult(id, {
      content: [{ type: "text", text: `Rendered ${result.vertexCount} boxes and ${result.edgeCount} arrows on ${result.pageId}.` }],
      structuredContent: result,
    });
    return;
  }
```

- [ ] **Step 6: Add a failing tool-list assertion, then confirm it passes**

Append to `figure-canvas/test/smoke.test.mjs`:

```js
test("MCP server lists render_structure", async () => {
  const [, listed] = await callMcp([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  const names = listed.result.tools.map((t) => t.name);
  assert.ok(names.includes("render_structure"));
});
```

Run: `cd figure-canvas && npm test`
Expected: PASS (all suites, including the new tool-list assertion). The `readStructureFromSnapshot` import resolves only after Task 7; until then add a temporary stub at the end of `lib/structure.mjs`: `export function readStructureFromSnapshot() { throw new Error("not implemented"); }` and DELETE the stub in Task 7 Step 3.

- [ ] **Step 7: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs mcp/server.mjs test/apply-structure.test.mjs test/smoke.test.mjs && cd ..
git commit -m "feat: add render_structure MCP tool"
```

---

### Task 7: Structure read-back + `get_structure` MCP tool

**Files:**
- Modify: `figure-canvas/lib/structure.mjs`
- Modify: `figure-canvas/mcp/server.mjs`
- Create: `figure-canvas/test/read-structure.test.mjs`

**Interfaces:**
- Consumes: `tldrawRecordsToStructure`, `structureToMxGraphXml`, a snapshot, optional selected shape ids.
- Produces:
  - `readStructureFromSnapshot(snapshot: object, { pageId?: string, shapeIds?: string[] }) => Structure` (pure) — reads sci shapes, optionally filtered to `shapeIds` or `pageId`.
  - New MCP tool `get_structure` returning the rebuilt mxGraph XML for the current page (or selection).

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/read-structure.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStructureToSnapshot,
  readStructureFromSnapshot,
} from "../lib/structure.mjs";

function snapshotWith(structure) {
  const base = {
    schema: { schemaVersion: 2 },
    store: { "page:main": { id: "page:main", typeName: "page", name: "Main", index: "a1" } },
  };
  return applyStructureToSnapshot(base, structure, "page:main");
}

const STRUCTURE = {
  vertices: [
    { id: "n1", label: "Input", x: 0, y: 0, w: 100, h: 60 },
    { id: "n2", label: "Model", x: 200, y: 0, w: 100, h: 60 },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", label: "feeds" }],
};

test("reads full page structure", () => {
  const snapshot = snapshotWith(STRUCTURE);
  assert.deepEqual(readStructureFromSnapshot(snapshot, { pageId: "page:main" }), STRUCTURE);
});

test("filters to selected shape ids", () => {
  const snapshot = snapshotWith(STRUCTURE);
  const result = readStructureFromSnapshot(snapshot, { shapeIds: ["shape:n1"] });
  assert.equal(result.vertices.length, 1);
  assert.equal(result.vertices[0].id, "n1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/read-structure.test.mjs`
Expected: FAIL — the Task 6 stub throws "not implemented".

- [ ] **Step 3: Replace the stub with the real implementation**

In `figure-canvas/lib/structure.mjs`, DELETE the temporary stub line `export function readStructureFromSnapshot() { throw new Error("not implemented"); }` and append:

```js
export function readStructureFromSnapshot(snapshot, { pageId, shapeIds } = {}) {
  const idSet = shapeIds ? new Set(shapeIds) : null;
  const records = Object.values(snapshot.store).filter((record) => {
    if (record?.typeName !== "shape" || !record.meta?.sciKind) return false;
    if (idSet) return idSet.has(record.id);
    if (pageId) return record.parentId === pageId;
    return true;
  });
  return tldrawRecordsToStructure(records);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/read-structure.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire the MCP tool**

In `figure-canvas/mcp/server.mjs`, add a constant near the other `TOOL_*`:

```js
const TOOL_GET_STRUCTURE = "get_structure";
```

Add a handler above `toolDefinitions()`:

```js
async function getStructure(args = {}) {
  const { snapshot } = await loadCanvasSnapshot(args);
  const { selection } = await readSelectionState(args);
  const viewState = await readViewState(args);
  const selectedIds = (selection.selectedShapes ?? []).map((shape) => shape.id);
  const pageId =
    nonEmptyString(args.pageId) ||
    nonEmptyString(viewState?.currentPageId) ||
    Object.values(snapshot.store).find((r) => r?.typeName === "page")?.id;
  const filter = selectedIds.length > 0 ? { shapeIds: selectedIds } : { pageId };
  const structure = readStructureFromSnapshot(snapshot, filter);
  const xml = structureToMxGraphXml(structure);
  return { xml, pageId, vertexCount: structure.vertices.length, edgeCount: structure.edges.length, scope: selectedIds.length > 0 ? "selection" : "page" };
}
```

Add a tool definition to the `toolDefinitions()` array:

```js
    {
      name: TOOL_GET_STRUCTURE,
      title: "Get Structure",
      description: "Read the editable structure shapes from a Cowart page (or current selection) and return them as mxGraph XML, capturing any user edits to position, labels, or which shapes remain.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Target tldraw page id. Optional." },
          projectDir: { type: "string", description: "Absolute Cowart project directory containing canvas/." },
          canvasDir: { type: "string", description: "Absolute canvas directory. Overrides projectDir." },
          cowartUrl: { type: "string", description: "Running Cowart URL." },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
```

Add a branch in `handleToolCall`:

```js
  if (params?.name === TOOL_GET_STRUCTURE) {
    const result = await getStructure(params.arguments ?? {});
    sendResult(id, {
      content: [{ type: "text", text: `Read ${result.vertexCount} boxes and ${result.edgeCount} arrows from ${result.scope}.` }],
      structuredContent: result,
    });
    return;
  }
```

- [ ] **Step 6: Confirm full suite passes**

Run: `cd figure-canvas && npm test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
cd figure-canvas && git add lib/structure.mjs mcp/server.mjs test/read-structure.test.mjs && cd ..
git commit -m "feat: add get_structure MCP tool"
```

---

### Task 8: Vendored skills — semantic brain + judge rubric

**Files:**
- Create: `figure-canvas/skills/paper-to-structure/SKILL.md`
- Create: `figure-canvas/skills/paper-to-structure/agents/openai.yaml`
- Create: `figure-canvas/skills/structure-to-figure/SKILL.md`
- Create: `figure-canvas/skills/structure-to-figure/agents/openai.yaml`
- Create: `figure-canvas/skills/review-figure/SKILL.md`
- Create: `figure-canvas/skills/review-figure/agents/openai.yaml`
- Create: `figure-canvas/test/skills.test.mjs`

**Interfaces:**
- Consumes: the MCP tools `render_structure`, `get_structure`, `insert_cowart_image` (referenced in skill prose).
- Produces: three skills discoverable by Codex. Validation: each `SKILL.md` has YAML frontmatter with non-empty `name` and `description`.

- [ ] **Step 1: Write the failing test**

Create `figure-canvas/test/skills.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const skills = ["paper-to-structure", "structure-to-figure", "review-figure"];

for (const skill of skills) {
  test(`${skill} has valid frontmatter`, async () => {
    const text = await readFile(join(here, "..", "skills", skill, "SKILL.md"), "utf8");
    const match = /^---\n([\s\S]*?)\n---/.exec(text);
    assert.ok(match, "frontmatter block present");
    assert.match(match[1], /name:\s*\S+/, "name present");
    assert.match(match[1], /description:\s*\S+/, "description present");
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figure-canvas && node --test test/skills.test.mjs`
Expected: FAIL with ENOENT (skill files do not exist yet).

- [ ] **Step 3: Write `paper-to-structure` skill**

Create `figure-canvas/skills/paper-to-structure/SKILL.md`:

```markdown
---
name: paper-to-structure
description: Use when the user wants to turn a paper method section, abstract, or technical description into an editable structure diagram on the Figure Canvas. Produces mxGraph XML for a technical roadmap / architecture diagram and renders it as draggable tldraw shapes. Only handles technical roadmap / pipeline / architecture figures in v0.1.
---

# Paper to Structure

Turn a technical paper's method section into an editable mxGraph XML structure diagram, then render it onto the canvas.

## Scope (v0.1)

Only the technical roadmap / research pipeline / system architecture figure type. If the user asks for a mechanism diagram, apparatus diagram, multi-panel figure, graphical abstract, or cover art, say these are not yet supported and offer the roadmap framing instead.

## Workflow

1. Read the user's pasted text or file. Extract: the research start / problem, 3-6 key steps or modules, the final output or validation target, and anything the figure must NOT invent.

2. Build a Figure Brief internally, following the happy-figure technical-roadmap master:
   - Image goal: one sentence on what the figure helps the reader understand.
   - Layout: horizontal main flow, vertical flow, three-stage, or layered — pick the one that fits the paper's logic.
   - Modules: each as a short label, not a sentence.
   - Connections: arrow direction, branches, feedback.
   - Visible text: the exact set of labels allowed in the figure.
   - Scientific boundary: what must not be added, fabricated, or mis-drawn.

3. Emit mxGraph XML. Each module is a `<mxCell vertex="1">` with a short `value` and an `<mxGeometry>` laying modules out left-to-right (or per the chosen layout) with ~80px gaps. Each connection is a `<mxCell edge="1">` with `source`/`target` referencing module ids. Keep labels short.

4. Call the `render_structure` MCP tool with the XML to draw the editable skeleton on the canvas. Tell the user they can now drag, rename, or delete boxes directly on the canvas.

5. When the user has edited and wants to continue, use the `structure-to-figure` skill.

## Constraints

- Do not invent research steps, data, or modules not present in the source.
- Do not output a final bitmap here; this skill only produces the editable structure.
- Keep module labels short enough to read on a social/figure canvas.
```

Create `figure-canvas/skills/paper-to-structure/agents/openai.yaml`:

```yaml
interface:
  display_name: "Paper to Structure"
  short_description: "Turn a paper method section into an editable structure diagram"
  default_prompt: "Use $figure-canvas:paper-to-structure to turn this paper method section into an editable structure diagram on the canvas."

policy:
  allow_implicit_invocation: true
```

- [ ] **Step 4: Write `structure-to-figure` skill**

Create `figure-canvas/skills/structure-to-figure/SKILL.md`:

```markdown
---
name: structure-to-figure
description: Use when the user has an editable structure diagram on the Figure Canvas and wants to render it into a publication-quality bitmap figure with Codex imagegen. Reads the current structure back from the canvas, builds a rendering prompt, generates the image, and places it beside the skeleton.
---

# Structure to Figure

Render the user's confirmed structure skeleton into a publication-quality bitmap.

## Workflow

1. Call the `get_structure` MCP tool to read the current structure (capturing the user's latest edits) as mxGraph XML.

2. Build a Stage-2 rendering prompt from that structure, following the happy-figure rendering-master approach:
   - Preserve every module label and connection from the structure exactly. Treat them as the only allowed visible text.
   - Specify a clean academic schematic style appropriate for a technical roadmap: clear modules, directional arrows, generous whitespace, no photorealism, no advertising gloss.
   - State the scientific boundary: do not add modules, data, or steps beyond the structure.

3. Generate the bitmap with the built-in `imagegen` skill. Resolve the actual local output image carefully — use the exact path returned by the image generation tool call; if none is returned, extract the latest `image_generation_call.result` from the current Codex session JSONL and write it to a timestamped file. Visually confirm it is the freshly generated image before inserting.

4. Insert the bitmap beside the skeleton with the `insert_cowart_image` MCP tool, using `placement: "right"` and the first structure box as the anchor when available.

5. Tell the user the figure is placed. If they want changes, they can edit the skeleton (then re-run this skill) or annotate the bitmap (cowart annotation edit).

## Constraints

- The structure skeleton is the source of truth; the bitmap must not introduce structure the skeleton does not have.
- Use a timestamped filename; never overwrite an existing asset.
```

Create `figure-canvas/skills/structure-to-figure/agents/openai.yaml`:

```yaml
interface:
  display_name: "Structure to Figure"
  short_description: "Render the canvas structure into a publication-quality figure"
  default_prompt: "Use $figure-canvas:structure-to-figure to render the current canvas structure into a publication-quality figure."

policy:
  allow_implicit_invocation: true
```

- [ ] **Step 5: Write `review-figure` skill**

Create `figure-canvas/skills/review-figure/SKILL.md`:

```markdown
---
name: review-figure
description: Use when the user wants a quality review of a generated scientific figure or wants the agent to iteratively refine it. Scores the figure 1-10 across visual design, communication effectiveness, and content fidelity to the source text, with specific actionable feedback.
---

# Review Figure

Evaluate a scientific figure with a VLM-as-Judge rubric (adapted from AutoFigure, ICLR 2026). Use for a one-shot quality check, or to drive a review-refine loop.

## Inputs

- The figure image (a generated bitmap on the canvas, or a path).
- The source text the figure should faithfully represent (paper method section, etc.).

## Rubric — score each dimension 1-10 (one decimal place)

**Part 1: Visual Design Excellence**
1. Aesthetic & Design Quality — modern visual appeal, composition, design beyond plain boxes-and-arrows.
2. Visual Expressiveness — meaningful icons/structure, abstract concepts made concrete, style sophistication.
3. Professional Polish — consistent styling, alignment, scaling, cohesive treatment.

**Part 2: Communication Effectiveness**
4. Clarity — is complex information well-organized and quickly graspable?
5. Logical Flow — does it present a clear progression / narrative?

**Part 3: Content Fidelity (only if source text provided)**
6. Accuracy — does it faithfully represent all key components and relationships in the source?
7. Completeness — are any critical source elements missing or misrepresented?
8. Appropriateness — is complexity and abstraction right for an academic audience?

## Output

- A score per dimension and an overall score (1-10).
- 3-6 specific, actionable fixes, each tied to a dimension.
- Distinguish sophistication from clutter: do not penalize rich, well-organized design. Reserve 9-10 for figures that are both visually sophisticated AND clearly communicative; a basic minimal figure scores 5-6.

## Review-Refine loop (optional)

If the user wants automatic refinement: review, then feed the specific feedback into a re-run of `structure-to-figure` (or a structure edit), then review again. Stop when the overall score stops improving or the user is satisfied.
```

Create `figure-canvas/skills/review-figure/agents/openai.yaml`:

```yaml
interface:
  display_name: "Review Figure"
  short_description: "Score and critique a scientific figure with a publication rubric"
  default_prompt: "Use $figure-canvas:review-figure to score and critique the current figure against the source text."

policy:
  allow_implicit_invocation: true
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd figure-canvas && node --test test/skills.test.mjs`
Expected: PASS (all three skills have valid frontmatter).

- [ ] **Step 7: Commit**

```bash
cd figure-canvas && git add skills/paper-to-structure skills/structure-to-figure skills/review-figure test/skills.test.mjs && cd ..
git commit -m "feat: add vendored semantic-brain and judge skills"
```

---

### Task 9: Remove obsolete cowart skill, finalize manifest, full integration check

**Files:**
- Delete: `figure-canvas/skills/cowart-image-gen/` (superseded by `structure-to-figure`)
- Keep: `figure-canvas/skills/cowart-image-edit/`, `figure-canvas/skills/cowart-open-canvas/`
- Modify: `figure-canvas/test/smoke.test.mjs`
- Create: `figure-canvas/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a complete plugin where MCP exposes exactly four tools (`get_cowart_selection`, `insert_cowart_image`, `render_structure`, `get_structure`) and `skills/` contains the five intended skills.

- [ ] **Step 1: Remove the superseded image-gen skill**

The new `structure-to-figure` skill replaces cowart's generic `cowart-image-gen` for our flow. Keep `cowart-image-edit` (annotation edits) and `cowart-open-canvas` (canvas launch).

```bash
cd figure-canvas && git rm -r skills/cowart-image-gen && cd ..
```

- [ ] **Step 2: Write the failing final integration test**

Replace the body of `figure-canvas/test/smoke.test.mjs` with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callMcp } from "./mcp-stdio.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("MCP exposes exactly the four intended tools", async () => {
  const [, listed] = await callMcp([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  const names = listed.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["get_cowart_selection", "get_structure", "insert_cowart_image", "render_structure"]);
});

test("skills directory contains the intended skills", async () => {
  const entries = (await readdir(join(here, "..", "skills"), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(entries, [
    "cowart-image-edit",
    "cowart-open-canvas",
    "paper-to-structure",
    "review-figure",
    "structure-to-figure",
  ]);
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd figure-canvas && npm test`
Expected: PASS (all suites). If the tools assertion fails, re-check Tasks 6-7 wiring; if the skills assertion fails, re-check Step 1 and Task 8.

- [ ] **Step 4: Write the plugin README**

Create `figure-canvas/README.md`:

```markdown
# Figure Canvas

A Codex plugin that turns a paper's method section into an editable vector structure diagram on a local tldraw canvas, then renders it to a publication-quality figure with Codex imagegen.

## Flow

1. `paper-to-structure` — paste a method section; get an editable mxGraph-XML skeleton rendered on the canvas (`render_structure`).
2. Edit on the canvas — drag, rename, delete boxes. `get_structure` reads your edits back precisely (connectivity is stored in shape metadata).
3. `structure-to-figure` — render the confirmed structure to a publication-quality bitmap with Codex imagegen, placed beside the skeleton.
4. `review-figure` — score and critique the figure (VLM-as-Judge rubric), optionally in a refine loop.

## Scope (v0.1)

Technical roadmap / architecture diagrams only. Single Node runtime. Other figure types and animation are on the roadmap.

## Run

`./scripts/start-canvas.sh /path/to/your/project` opens the canvas; the MCP server is launched by Codex via `.mcp.json`.
```

- [ ] **Step 5: Manual canvas verification (cannot be unit-tested)**

This step validates tldraw prop compatibility, which unit tests cannot cover.

```bash
cd figure-canvas && ./scripts/start-canvas.sh /tmp/figtest &
```

Then, via the MCP `render_structure` tool (or `curl` an XML through it), render a 3-box roadmap and open `http://127.0.0.1:43217`. Confirm: three labeled rectangles and two arrows appear and are draggable. If tldraw rejects a shape (console error / shape missing), inspect `node_modules/tldraw` default `geo`/`arrow` shape props and adjust `geoShape`/`arrowShape` in `lib/structure.mjs`, then re-run `npm test`. Document any prop change in the commit message.

- [ ] **Step 6: Commit**

```bash
cd figure-canvas && git add -A && cd .. && git add figure-canvas
git commit -m "feat: finalize figure-canvas manifest and integration checks"
```

---

## Self-Review

**Spec coverage:**
- Single Node runtime, no Python/Mermaid/Playwright → Global Constraints + Task 1 (cowart base only). ✓
- Double-layer model (vector skeleton + bitmap) → Tasks 2-7 (vector skeleton) + Task 8 `structure-to-figure` (bitmap). ✓
- mxGraph XML as structure carrier → Tasks 2, 5, 6, 7. ✓
- `render_structure` / `get_structure` MCP tools (the success watershed) → Tasks 6, 7. ✓
- Connectivity in shape meta (deterministic read-back) → Global Constraints + Tasks 3, 4. ✓
- happy-figure technical-roadmap brain (one figure type) → Task 8 `paper-to-structure`. ✓
- Codex imagegen for bitmap, reusing cowart's output resolution → Task 8 `structure-to-figure`. ✓
- AutoFigure VLM-Judge rubric → Task 8 `review-figure`. ✓
- Manual + automatic refine modes → Task 8 `review-figure` (loop) + canvas editing. ✓
- Editable on canvas (drag/rename/delete read back) → Task 4 tests + Task 9 Step 5 manual check. ✓
- Self-contained plugin, four MCP tools, five skills → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The Task 6 stub is explicitly created and explicitly deleted in Task 7 Step 3 (documented hand-off, not a placeholder). ✓

**Type consistency:** IR shape (`Vertex`/`Edge`/`Structure`) is fixed in Global Constraints and used identically in Tasks 2-7. Function names are stable: `parseMxGraphXml`, `structureToTldrawRecords`, `tldrawRecordsToStructure`, `structureToMxGraphXml`, `applyStructureToSnapshot`, `readStructureFromSnapshot`, `sanitizeId`. The `server.mjs` import in Task 6 references `readStructureFromSnapshot` (defined Task 7) — resolved by the explicit stub-then-replace sequence. ✓

**Known v0.1 limitation (documented):** Arrows use computed endpoints, not tldraw bindings, so dragging a box does not move its arrows until the next `render_structure` round-trip. This is an accepted v0.1 tradeoff (real bindings are version-risky against tldraw ^5.1.1) and belongs on the roadmap.
