import type { Frame } from '../renderer/render.js';
import type { TimelineIR, TimelineEventReveal } from '../types/timeline.js';

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

/** clamp an integer into [lo, hi]. */
function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Any non-transparent (alpha > 0) pixel inside the half-open rect
 * [x0,x1) × [y0,y1)? The canvas has no background layer, so untouched pixels
 * stay alpha 0 — "alpha > 0" is a mechanical, model-free "something drew here".
 */
function hasNonTransparentInRect(frame: Frame, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let y = y0; y < y1; y++) {
    const row = y * frame.width;
    for (let x = x0; x < x1; x++) {
      if (frame.data[(row + x) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

/** Any non-transparent pixel within the Chebyshev radius `r` of (px,py)? */
function hasNonTransparentNear(frame: Frame, px: number, py: number, r: number): boolean {
  const cx = Math.round(px);
  const cy = Math.round(py);
  const x0 = clampInt(cx - r, 0, frame.width);
  const x1 = clampInt(cx + r + 1, 0, frame.width);
  const y0 = clampInt(cy - r, 0, frame.height);
  const y1 = clampInt(cy + r + 1, 0, frame.height);
  return hasNonTransparentInRect(frame, x0, y0, x1, y1);
}

/**
 * The sampled frame on which to assert an event of end-frame `endF`.
 *
 * Target = min(endF, totalFrames-1): the earliest renderable frame at/after the
 * event completes (endF can equal totalFrames, one past the last index). Pick
 * the nearest sampled frame ≥ target; if the caller sampled nothing that late,
 * fall back to the latest sampled frame. Returns null only when no frame exists.
 */
function pickAssertFrameNumber(endF: number, totalFrames: number, sortedFrameNumbers: number[]): number | null {
  if (sortedFrameNumbers.length === 0) return null;
  const target = Math.min(endF, totalFrames - 1);
  for (const f of sortedFrameNumbers) {
    if (f >= target) return f;
  }
  return sortedFrameNumbers[sortedFrameNumbers.length - 1];
}

/**
 * Event-aligned region assertions (run only when a timeline is supplied).
 *
 * reveal: at the event's assertion frame, the box's rendered footprint
 *   [x+offsetX .. x+w+offsetX] × [y+offsetY .. y+h+offsetY] (clamped to canvas)
 *   must contain a non-transparent pixel. A box drawn at the wrong place (the
 *   historical "centre at input top-left, offset dropped" bug) leaves this
 *   region empty and fails, naming the node.
 * flow: sample 5 points evenly along from-centre → to-centre (both +offset) and
 *   require a non-transparent pixel within radius 4px of at least 3 of them.
 *   Endpoints sit under the (opaque) node boxes and the stroke covers the span,
 *   so a correctly drawn edge scores 5/5; a missing/dangling edge scores ≤2.
 */
function assertEvents(
  frames: Frame[],
  timeline: TimelineIR,
  frameNumbers: number[],
  failures: string[]
): void {
  const offsetX = timeline.offsetX ?? 0;
  const offsetY = timeline.offsetY ?? 0;

  // Map frame number → Frame (zip the parallel arrays the caller rendered).
  const frameByNumber = new Map<number, Frame>();
  for (let i = 0; i < frameNumbers.length && i < frames.length; i++) {
    frameByNumber.set(frameNumbers[i], frames[i]);
  }
  const sortedFrameNumbers = Array.from(frameByNumber.keys()).sort((a, b) => a - b);

  // Reveal geometry, keyed by target id, for flow endpoint lookups.
  const revealByTarget = new Map<string, TimelineEventReveal>();
  for (const event of timeline.events) {
    if (event.kind === 'reveal') revealByTarget.set(event.target, event);
  }

  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const fn = pickAssertFrameNumber(event.endF, timeline.totalFrames, sortedFrameNumbers);
      if (fn === null) continue; // no frames to inspect
      const frame = frameByNumber.get(fn)!;

      const x0 = clampInt(Math.floor(event.x + offsetX), 0, frame.width);
      const x1 = clampInt(Math.ceil(event.x + event.w + offsetX), 0, frame.width);
      const y0 = clampInt(Math.floor(event.y + offsetY), 0, frame.height);
      const y1 = clampInt(Math.ceil(event.y + event.h + offsetY), 0, frame.height);

      if (x1 <= x0 || y1 <= y0 || !hasNonTransparentInRect(frame, x0, y0, x1, y1)) {
        failures.push(
          `Reveal '${event.target}': box region empty at frame ${fn} ` +
            `(no non-transparent pixels in [${x0}..${x1}]x[${y0}..${y1}])`
        );
      }
    } else if (event.kind === 'flow') {
      const from = revealByTarget.get(event.from);
      const to = revealByTarget.get(event.to);
      // A flow whose endpoints have no reveal geometry is a builder/compiler
      // fault the earlier gates own; this render gate can't place the segment,
      // so it skips rather than emit a spurious pixel failure.
      if (!from || !to) continue;

      const fn = pickAssertFrameNumber(event.endF, timeline.totalFrames, sortedFrameNumbers);
      if (fn === null) continue;
      const frame = frameByNumber.get(fn)!;

      const fx = from.x + from.w / 2 + offsetX;
      const fy = from.y + from.h / 2 + offsetY;
      const tx = to.x + to.w / 2 + offsetX;
      const ty = to.y + to.h / 2 + offsetY;

      const SAMPLES = 5;
      const RADIUS = 4;
      const MIN_HITS = 3; // "at least a few" of 5 — majority; correct edge = 5/5.
      let hits = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const t = i / (SAMPLES - 1);
        if (hasNonTransparentNear(frame, fx + (tx - fx) * t, fy + (ty - fy) * t, RADIUS)) {
          hits++;
        }
      }

      if (hits < MIN_HITS) {
        failures.push(
          `Flow '${event.target}': edge not drawn at frame ${fn} ` +
            `(${hits}/${SAMPLES} sample points within ${RADIUS}px of a pixel, need >=${MIN_HITS})`
        );
      }
    }
  }
}

/**
 * renderGate — dimension contract + global has_motion, plus (when a timeline is
 * supplied) event-aligned region assertions.
 *
 * @param frames        rendered RGBA frames
 * @param spec          expected canvas dimensions
 * @param timeline      optional; when present, enables event assertions
 * @param frameNumbers  optional; frame index of frames[i] (parallel array), so
 *                      each event can be checked on the frame where it completes.
 *
 * Backward compatible: called with two args it behaves exactly as before.
 */
export function renderGate(
  frames: Frame[],
  spec: { width: number; height: number },
  timeline?: TimelineIR,
  frameNumbers?: number[]
): GateResult {
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

  // Check motion: compare adjacent frames for pixel changes. With < 2 samples we
  // cannot disprove motion (builder gate verified the intent), so we skip the
  // check rather than fail — identical to the pre-existing behaviour.
  if (frames.length >= 2) {
    let hasMotion = false;
    for (let i = 0; i < frames.length - 1; i++) {
      const diffPixels = countDifferentPixels(frames[i].data, frames[i + 1].data);
      if (diffPixels > 0) {
        hasMotion = true;
        break;
      }
    }

    if (!hasMotion) {
      failures.push('No motion detected: all sampled frames are identical (animation is fully static)');
    }
  }

  // Event-aligned assertions — opt-in, only when the caller supplies both the
  // timeline and the frame numbers it rendered.
  if (timeline && frameNumbers) {
    assertEvents(frames, timeline, frameNumbers, failures);
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
