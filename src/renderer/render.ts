// Headless Lottie rendering — node-canvas + jsdom + lottie-web canvas renderer.
//
// IMPORTANT: this module has NO top-level side effects. Importing it (or the
// library root) must not create a JSDOM, stomp globalThis.window/document, or
// pull in the native `canvas` / `jsdom` / `lottie-web` modules. All of that is
// deferred to the FIRST call to render() via lazy dynamic imports (same
// convention as getLottie() below). `sampleFrames` and the `Frame` type stay at
// module top level because they are pure and dependency-free.

import type { TimelineIR } from '../types/timeline.js';

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

/**
 * eventSampleFrames: derive render sample frames from a timeline's events.
 *
 * The global sampleFrames() set ([0, n/4, n/2, 3n/4, n-1]) is event-blind: it
 * can miss the exact frame where a reveal/flow finishes, so a mis-placed box or
 * a dangling edge slips past a purely positional render gate. This adds one
 * sample per reveal/flow event at min(endF, totalFrames-1) — the earliest
 * renderable frame at/after the event completes, where its content should be
 * (nearly) fully drawn.
 *
 * Contract:
 *   - one candidate per reveal/flow event: min(endF, totalFrames-1); highlights
 *     add no candidate (they carry no positional assertion);
 *   - deduped + sorted;
 *   - capped at 24 event-derived frames — when more events exist, downsample
 *     uniformly across the sorted set (first and last always kept) so the gate's
 *     render cost stays bounded;
 *   - the global sampleFrames() set is ALWAYS unioned in, so has_motion and the
 *     positional baseline are preserved even if events are capped away.
 * Pure and dependency-free (TimelineIR is a type-only import), so it stays at
 * module top level next to sampleFrames.
 */
export function eventSampleFrames(timeline: TimelineIR): number[] {
  const n = timeline.totalFrames;
  const global = sampleFrames(n);

  const candidates: number[] = [];
  for (const event of timeline.events) {
    if (event.kind === 'reveal' || event.kind === 'flow') {
      candidates.push(Math.min(event.endF, n - 1));
    }
  }

  let eventFrames = Array.from(new Set(candidates)).sort((a, b) => a - b);

  const CAP = 24;
  if (eventFrames.length > CAP) {
    const picked: number[] = [];
    for (let i = 0; i < CAP; i++) {
      // Spread CAP indices evenly across [0, len-1] inclusive (endpoints kept).
      const idx = Math.round((i * (eventFrames.length - 1)) / (CAP - 1));
      picked.push(eventFrames[idx]);
    }
    eventFrames = Array.from(new Set(picked)).sort((a, b) => a - b);
  }

  return Array.from(new Set([...global, ...eventFrames])).sort((a, b) => a - b);
}

// --- lazy dependency initialization (runs at most once, on first render()) ---

let _domReady = false;
async function ensureDom(): Promise<void> {
  if (_domReady) return;
  // lottie-web references window/document at import time, so the DOM shim must
  // be installed BEFORE getLottie() runs.
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: unknown }).document = dom.window.document;
  _domReady = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lottie: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLottie(): Promise<any> {
  if (!_lottie) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('lottie-web');
    _lottie = mod.default || mod;
  }
  return _lottie;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _createCanvas: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCreateCanvas(): Promise<any> {
  if (!_createCanvas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('canvas');
    _createCanvas = mod.createCanvas;
  }
  return _createCanvas;
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

  // Acquire the optional rendering dependencies lazily. Only this acquisition is
  // wrapped so that genuine rendering errors (below) still surface unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lottieWeb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createCanvas: (width: number, height: number) => any;
  try {
    // Order matters: install the DOM shim first (lottie-web reads window at
    // import time), then acquire node-canvas (independent of the DOM), then
    // lottie-web. Acquiring canvas before lottie-web means a missing native
    // `canvas` fails with a clean ERR_MODULE_NOT_FOUND rather than a cryptic
    // downstream error from lottie-web's import-time canvas probing.
    await ensureDom();
    createCanvas = await getCreateCanvas();
    lottieWeb = await getLottie();
  } catch (err) {
    throw new Error(
      `render() needs its optional rendering dependencies (canvas, lottie-web). ` +
        `Install them with \`npm install lottie-motion --include=optional\`. ` +
        `(underlying: ${(err as Error).message})`
    );
  }

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
