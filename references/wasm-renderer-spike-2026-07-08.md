# Spike: WASM Lottie renderers vs the jsdom/node-canvas/lottie-web render gate

> **Exploratory spike (2026-07-08).** Question: can a WASM Lottie renderer
> replace or supplement the current render-gate stack — lottie-web driven headless
> through three global shims (`window`/`document` via jsdom, plus native
> `node-canvas`)? Two candidates were taken to a minimal working render against
> the repo's real pipeline. Time-boxed ~30 min per route. Spike scripts lived in
> `spike/` and are **not** committed; this document is the only artifact.

## One-line conclusion

**Feasible — both routes work end to end (V1–V3 all pass).** Recommend adopting
**`@lottiefiles/dotlottie-web` (Route A, ThorVG/WASM) as an alternate render
backend behind the existing `render()`/`Frame` seam**, and optionally wiring
**`canvaskit-wasm` (Route B, Skia/Skottie) as an independent cross-check oracle**.
Both are pure-WASM, DOM-free, deterministic, and 200–500× faster cold than the
current stack. Do **not** pursue byte-exact cross-renderer golden images — §V2
shows a uniform ±1 channel rounding across engines that makes byte-equality
infeasible (region-level gating is fine).

## Test object (built through the real pipeline)

`validateStructure → plan → compile`, no hand-authored Lottie:

- Two labelled vertices `Alpha`(40,40,120×60) → `Beta`(40,240,120×60), one
  labelled edge `next`. `plan()` auto-emits a closing highlight on the sink.
- Result: canvas **200×340**, fps 30, `totalFrames` 54, 4 Lottie layers.
- Events: `reveal n1@0–12`, `reveal n2@18–30`, `flow e1@30–42`, `highlight n2@42–54`.
- `eventSampleFrames(timeline)` → **`[0, 12, 13, 27, 30, 40, 42, 53]`** (the frames each renderer drew).
- Features exercised: rect + fill, glyph-outline bezier labels, trim-path flow
  draw-on, opacity fade-in, scale pulse (highlight), keyframe easing handles.
  (Labels compile to vector glyph contours, not Lottie text layers, so **no
  renderer needs a font** — a real advantage for cross-renderer consistency.)

Frame convention is uniform across all three renderers (fps 30, integer frames):
lottie-web `goToAndStop(f)` ≡ dotlottie `setFrame(f)` ≡ Skottie `seekFrame(f)`.
The anticipated "seconds vs normalized progress" seek pitfall never materialised —
`seekFrame(frameIndex)` maps 1:1 to `op` frames.

## Baseline (current stack, for comparison)

| Metric | lottie-web + jsdom + node-canvas |
|---|---|
| Render gate result | pass (reference) |
| Cold start + render 8 frames | **≈ 9,900 ms** |
| Global shims required | 3 — `globalThis.window`, `globalThis.document`, native `canvas` |
| Install footprint | ≈ **52 M** (lottie-web 25M + jsdom 8.3M + canvas 19M) |
| Native build | yes — node-canvas/Cairo compiles against system libs |

---

## Route A — `@lottiefiles/dotlottie-web@0.76.0` (ThorVG Rust+WASM, software)

**How far it got: fully working, all acceptance criteria pass.**

Approach that worked — the **`RenderSurface` software path**, no real canvas at all:

```
DotLottie.setWasmUrl('file://…/dist/dotlottie-player.wasm')
new DotLottie({ canvas: { width, height }, data: JSON.stringify(lottie),
                autoplay:false, loop:false, useFrameInterpolation:false })
await 'load' event
per frame:  player.setFrame(f)   // high-level setFrame SEEKS AND RENDERS
            player.buffer         // RGBA Uint8Array, length w*h*4
```

`Config.canvas` accepts `HTMLCanvasElement | OffscreenCanvas | RenderSurface`,
and `RenderSurface` is just `{ width, height }` — passing that renders into an
internal software buffer exposed as `.buffer`. **No `@napi-rs/canvas` needed.**

| Criterion | Result |
|---|---|
| **V1 feasibility** | **PASS.** Non-empty RGBA, buffer `272000 B = 200×340×4`. **No DOM shim** (no window/document/navigator), **no native module**. Only shim: a **5-line `file://` fetch handler** (Node's native `fetch` rejects `file://`, and the WASM is loaded via `fetch`). |
| **V2a gate** | **PASS** — `renderGate(frames, spec, timeline, frameNumbers)` all region assertions green. |
| **V2b pixel-diff vs lottie-web** | `0.0 / 0.5 / 0.5 / 1.1 / 0.9 / 1.0 / 1.0 / 1.5 %` (**max 1.5 %**). On plain fills ThorVG is **byte-identical** to lottie-web (n2 fill at 75 % = `[50,50,50,191]` in both). Divergence is confined to glyph anti-aliasing edges. |
| **V3 determinism** | **DETERMINISTIC.** Two fresh instances byte-identical (0.000 %); same-instance re-seek identical; **3 separate processes → identical `sha256` `2755012f…`**. |
| Install size | **9.1 M** (wasm `dotlottie-player.wasm` = 1.8 MB) |
| Timing | cold start + 8 frames ≈ **19 ms** (~510× faster than lottie-web) |

Gotcha hit and fixed: `player.render is not a function` — `render()` lives on the
low-level `DotLottiePlayerWasm` core, not the high-level `DotLottie`; the
high-level `setFrame()` already renders.

---

## Route B — `canvaskit-wasm@0.41.1` (Skia / Skottie, pure WASM)

**How far it got: fully working, all acceptance criteria pass.**

```
require('canvaskit-wasm/bin/full/canvaskit.js')   // NOTE: bin/full, not bin/
CanvasKitInit({ locateFile: f => binFullDir + '/' + f })
const anim = CanvasKit.MakeManagedAnimation(JSON.stringify(lottie))
const surface = CanvasKit.MakeSurface(w, h)      // in-memory raster, no DOM
per frame:  canvas.clear(CanvasKit.TRANSPARENT)
            anim.seekFrame(f); anim.render(canvas, LTRBRect(0,0,w,h))
            surface.flush()
            canvas.readPixels(0,0,{RGBA_8888, Unpremul, SRGB})  // Uint8Array
```

| Criterion | Result |
|---|---|
| **V1 feasibility** | **PASS.** Non-empty RGBA, buffer `272000 B`. **Zero DOM, zero native module** — pure WASM. No shim of any kind. |
| **V2a gate** | **PASS** — all region assertions green. |
| **V2b pixel-diff vs lottie-web** | `0.0 / 0.5 / 0.5 / 11.1 / 0.9 / 1.0 / 1.0 / 1.4 %` — one outlier (frame 27). **Decomposed:** `transparentDiffPx = 0` (all real content), and it is a **uniform off-by-1 RGB rounding** on the partially-opaque n2 fill: Skottie `[51,51,51,191]` vs lottie-web/ThorVG `[50,50,50,191]`. Strict equality flags the entire box; a ±2-per-channel tolerance clears it. **Opacity/easing is identical** — alpha = 191 (= exactly 75 %) in all three engines, so no easing-handle divergence. |
| **V3 determinism** | **DETERMINISTIC.** Two fresh instances byte-identical (0.000 %). |
| Install size | **24 M** (wasm `bin/full/canvaskit.wasm` = 8.08 MB) |
| Timing | WASM init 19 ms + 8 frames 10 ms = **≈ 45 ms** cold (~220× faster than lottie-web) |

Gotchas hit and fixed: (1) `CanvasKit.MakeManagedAnimation is not a function` —
the default `bin/canvaskit.js` build **omits Skottie**; the `bin/full/` build ships
it. (2) `Cannot pass deleted object` — reading `anim.fps()` after `anim.delete()`
(spike-harness bug, not a library issue).

---

## Bonus finding: the native stack leaks in-process state into other renderers

While measuring V3 the two engines reported *identical* 2.6–7.9 % run-to-run
variance — impossible for two unrelated rasterizers unless the cause is external.
It was: both scripts ran the **lottie-web baseline between the two runs**.

| Scenario | Run-to-run diff |
|---|---|
| WASM render, then WASM render (nothing between) | **0.000 % — byte-identical** (both engines) |
| WASM render, **lottie-web render**, WASM render | **2.6 – 7.9 %**, growing with content |

Isolated in `spike/probe-determinism.ts`: removing the intervening lottie-web
call makes both WASM renderers byte-identical. **The jsdom/node-canvas stack
perturbs a subsequently-run, fully independent WASM renderer in the same
process** — almost certainly a native library changing the FP control word
(MXCSR rounding/flush-to-zero) or a global. This is a concrete, previously
undocumented fragility of the current gate and an independent argument for
isolating or replacing it: any future gate that renders with *two* backends in
one process cannot trust the native one to leave the other alone.

---

## Head-to-head

| | lottie-web (current) | Route A · dotlottie-web | Route B · canvaskit-wasm |
|---|---|---|---|
| Engine | lottie-web JS | ThorVG (Rust→WASM) | Skia/Skottie (C++→WASM) |
| DOM shims | window + document | **none** | **none** |
| Native module | node-canvas (compiled) | none (RenderSurface path) | none |
| Other shim | — | 5-line `file://` fetch | — |
| V2a region gate | pass (ref) | **pass** | **pass** |
| Max pixel-diff vs lottie-web | — | **1.5 %** | 11.1 % (uniform ±1 rounding) |
| Determinism (V3) | not tested here | **byte-identical** | **byte-identical** |
| Install size | ≈ 52 M | **9.1 M** | 24 M |
| Cold render (8 frames) | ≈ 9,900 ms | **≈ 19 ms** | ≈ 45 ms |

## Decision framework — when it's worth switching

Switch (or add a WASM backend) when any of these becomes true; until then the pin
to `lottie-web@5.13.0` plus this spike's evidence is enough to stay put:

1. **lottie-web silently changes behavior again.** The 5.13.0 pin is defensive;
   a byte-deterministic WASM renderer removes the class of risk.
2. **CI must run on Alpine/musl or ARM** where node-canvas/Cairo won't build.
   Both WASM candidates have **no native build step** (napi-canvas is prebuilt and
   not even needed for Route A). This is the strongest concrete trigger.
3. **Cross-platform pixel-golden tests are wanted.** WASM output is byte-stable
   within a build; node-canvas/Cairo is not portably byte-for-byte.
4. **Render-gate cost matters.** It is the most expensive of the three gates;
   WASM cold start is 200–500× faster, which compounds across a growing suite.

## Recommended form

- **Primary: adopt `dotlottie-web` (Route A) as an alternate backend behind the
  existing `render()` seam** in `src/renderer/render.ts` (already the single
  isolation point — it returns `Frame[]`, lazily loads its deps, and has no
  top-level side effects). A `RENDER_BACKEND` switch can select lottie-web or
  dotlottie-web with **zero** change to `renderGate`. Route A is the best single
  replacement: pure-WASM software path with only a 5-line shim (vs three globals),
  byte-matches lottie-web on fills, smallest footprint, deterministic, official
  Node support, and same vendor (LottieFiles) as the compiler's `@lottiefiles/*`
  toolchain → aligned Lottie semantics.
- **Optional cross-check: `canvaskit-wasm` (Route B) as a second, independent
  oracle** (Skia/Google — maximal engine diversity for catching renderer-specific
  bugs). A dual-renderer gate must compare with a **tolerance** (region assertions
  + ≥ ±2 per-channel), never byte-equality — see the §V2 rounding result.
- **Avoid:** byte-exact cross-renderer golden images. Different engines round
  antialiased/partial-opacity pixels by ±1; that is a property of the engines, not
  a bug to chase.

## Dead ends & gotchas (honest record)

Nothing died, but the traps that cost time — recorded so the next attempt skips them:

- **Node `fetch` rejects `file://`** (`fetch failed`). dotlottie-web loads its WASM
  via `fetch(_wasmUrl)`; Node ≥ 18 native fetch has no `file://` scheme. Needs a
  tiny fetch shim (or a `data:` URL). Not a blocker, but undocumented for Node.
- **CanvasKit default build has no Skottie.** `require('canvaskit-wasm')` →
  `bin/canvaskit.js` lacks `MakeManagedAnimation`. Use `bin/full/canvaskit.js`
  and point `locateFile` at `bin/full/` (the 8 MB wasm).
- **dotlottie high-level `render()` doesn't exist** — `setFrame()` renders; the
  bare `render()` is on the low-level `DotLottiePlayerWasm` core.
- **`@napi-rs/canvas` is a red herring for this use case.** The official Node
  example uses it, but the `RenderSurface` path renders to an internal buffer with
  no canvas object, so Route A never imports it.

## Appendix — minimal reproducible snippets

Deps (spike only, never committed): `npm install --no-save
@lottiefiles/dotlottie-web@0.76.0 canvaskit-wasm@0.41.1`. Feed each renderer the
`compile()` output and `eventSampleFrames(timeline)`, wrap the RGBA buffer as
`{ width, height, data: Uint8ClampedArray }`, then hand it straight to the
existing `renderGate`.

**Route A — dotlottie-web (RenderSurface software path):**

```ts
import { readFile } from 'node:fs/promises';
// WASM-loading shim: teach fetch() to read file:// (Node native fetch can't).
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (typeof url === 'string' && url.startsWith('file://'))
    return new Response(await readFile(new URL(url)), { headers: { 'content-type': 'application/wasm' } });
  return realFetch(input, init);
}) as typeof fetch;

const { DotLottie } = await import('@lottiefiles/dotlottie-web');
DotLottie.setWasmUrl('file://' + resolve('node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm'));
const player: any = new DotLottie({
  canvas: { width, height },                 // RenderSurface — no DOM canvas
  data: JSON.stringify(lottie), autoplay: false, loop: false,
  useFrameInterpolation: false, backgroundColor: 'transparent',
});
await new Promise<void>(res => player.addEventListener('load', () => res()));
const frames = frameNumbers.map(f => {
  player.setFrame(Math.min(f, player.totalFrames - 1));
  return { width, height, data: new Uint8ClampedArray(player.buffer) };
});
player.destroy();
```

**Route B — canvaskit-wasm (Skottie + raster surface):**

```ts
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js'); // full build!
const CanvasKit = await CanvasKitInit({ locateFile: f => binFullDir + '/' + f });
const anim = CanvasKit.MakeManagedAnimation(JSON.stringify(lottie));
const surface = CanvasKit.MakeSurface(width, height);
const canvas = surface.getCanvas();
const info = { width, height, colorType: CanvasKit.ColorType.RGBA_8888,
               alphaType: CanvasKit.AlphaType.Unpremul, colorSpace: CanvasKit.ColorSpace.SRGB };
const dst = CanvasKit.LTRBRect(0, 0, width, height);
const totalFrames = Math.round(anim.duration() * anim.fps());
const frames = frameNumbers.map(f => {
  canvas.clear(CanvasKit.TRANSPARENT);
  anim.seekFrame(Math.min(f, totalFrames - 1));
  anim.render(canvas, dst); surface.flush();
  return { width, height, data: new Uint8ClampedArray(canvas.readPixels(0, 0, info)) };
});
anim.delete(); surface.delete();
```

Related: [[three-gate-quality-model]] (the render gate is the "most expensive"
gate this spike accelerates), [[figure-canvas-structure-ir]].
