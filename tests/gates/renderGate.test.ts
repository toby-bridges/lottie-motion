import { describe, it, expect } from 'vitest';
import { renderGate } from '../../src/gates/renderGate.js';
import { eventSampleFrames, type Frame } from '../../src/renderer/render.js';
import type { TimelineIR } from '../../src/types/timeline.js';

// --- helpers for event-assertion tests: hand-built RGBA frames ---

/** A fully transparent (alpha 0) RGBA frame. */
function blankFrame(w: number, h: number): Frame {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

/** Paint an opaque grey rect over the half-open box [x0,x1) x [y0,y1). */
function paint(frame: Frame, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * frame.width + x) * 4;
      frame.data[idx] = 100;
      frame.data[idx + 1] = 100;
      frame.data[idx + 2] = 100;
      frame.data[idx + 3] = 255;
    }
  }
}

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

  // --- event-aligned region assertions (opt-in via timeline + frameNumbers) ---

  describe('backward compatibility (no timeline)', () => {
    it('does NOT run event assertions when timeline is omitted (opt-in)', () => {
      // A blank frame whose box region is empty: it FAILS with a timeline but
      // must PASS without one (2-arg behaviour is unchanged).
      const W = 200;
      const H = 100;
      const timeline: TimelineIR = {
        fps: 30, width: W, height: H, totalFrames: 60, offsetX: 10, offsetY: 20,
        events: [{ kind: 'reveal', target: 'nodeA', startF: 0, endF: 12, x: 0, y: 0, w: 40, h: 30 }],
      };
      const frame = blankFrame(W, H); // box region [10,50)x[20,50) is transparent

      // 2-arg: no event assertions → single blank frame passes as before.
      expect(renderGate([frame], { width: W, height: H }).pass).toBe(true);

      // 4-arg: the same frame now fails the reveal region assertion.
      expect(renderGate([frame], { width: W, height: H }, timeline, [59]).pass).toBe(false);
    });
  });

  describe('reveal region assertion', () => {
    const W = 200;
    const H = 100;
    const timeline: TimelineIR = {
      fps: 30, width: W, height: H, totalFrames: 60, offsetX: 10, offsetY: 20,
      events: [{ kind: 'reveal', target: 'nodeA', startF: 0, endF: 12, x: 0, y: 0, w: 40, h: 30 }],
    };

    it('passes when the box region has non-transparent pixels', () => {
      const frame = blankFrame(W, H);
      paint(frame, 10, 20, 50, 50); // region = [x+offsetX .. x+w+offsetX] x [y+offsetY .. y+h+offsetY]
      const result = renderGate([frame], { width: W, height: H }, timeline, [59]);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails and names the node when the box region is fully transparent', () => {
      const frame = blankFrame(W, H); // nothing drawn in the box region
      const result = renderGate([frame], { width: W, height: H }, timeline, [59]);
      expect(result.pass).toBe(false);
      expect(result.failures.some((f) => f.includes('nodeA'))).toBe(true);
      // message carries the frame number too
      expect(result.failures.some((f) => f.includes('frame 59'))).toBe(true);
    });

    it('checks the OFFSET-shifted region, not the raw input coordinates', () => {
      // offset large enough that origin box and offset box are disjoint.
      const tl: TimelineIR = {
        fps: 30, width: 200, height: 200, totalFrames: 60, offsetX: 100, offsetY: 100,
        events: [{ kind: 'reveal', target: 'n', startF: 0, endF: 12, x: 0, y: 0, w: 30, h: 30 }],
      };
      // Painted at the OFFSET location [100,130)x[100,130) → passes.
      const good = blankFrame(200, 200);
      paint(good, 100, 100, 130, 130);
      expect(renderGate([good], { width: 200, height: 200 }, tl, [59]).pass).toBe(true);

      // Painted only at the raw origin [0,30)x[0,30) → gate looks at the offset
      // region, finds nothing, fails. (Proves the offset is applied.)
      const bad = blankFrame(200, 200);
      paint(bad, 0, 0, 30, 30);
      const result = renderGate([bad], { width: 200, height: 200 }, tl, [59]);
      expect(result.pass).toBe(false);
      expect(result.failures.some((f) => f.includes("'n'"))).toBe(true);
    });
  });

  describe('flow region assertion', () => {
    const W = 200;
    const H = 100;
    // nodeA centre+offset = (30,35); nodeB centre+offset = (130,35); segment y=35.
    const timeline: TimelineIR = {
      fps: 30, width: W, height: H, totalFrames: 60, offsetX: 10, offsetY: 20,
      events: [
        { kind: 'reveal', target: 'nodeA', startF: 0, endF: 12, x: 0, y: 0, w: 40, h: 30 },
        { kind: 'reveal', target: 'nodeB', startF: 0, endF: 12, x: 100, y: 0, w: 40, h: 30 },
        { kind: 'flow', target: 'edgeAB', startF: 12, endF: 24, from: 'nodeA', to: 'nodeB' },
      ],
    };

    function paintBoxes(frame: Frame): void {
      paint(frame, 10, 20, 50, 50);   // nodeA region
      paint(frame, 110, 20, 150, 50); // nodeB region
    }

    it('passes when the edge is drawn along the segment', () => {
      const frame = blankFrame(W, H);
      paintBoxes(frame);
      paint(frame, 30, 33, 131, 38); // stroke band covering y=35 for x in [30,130]
      const result = renderGate([frame], { width: W, height: H }, timeline, [59]);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails and names the edge when the segment interior is empty', () => {
      const frame = blankFrame(W, H);
      paintBoxes(frame); // endpoints covered (reveals pass), but no stroke between them
      const result = renderGate([frame], { width: W, height: H }, timeline, [59]);
      expect(result.pass).toBe(false);
      expect(result.failures.some((f) => f.includes('edgeAB'))).toBe(true);
      // the reveals themselves must NOT fail (their boxes are painted)
      expect(result.failures.some((f) => f.includes('nodeA') || f.includes('nodeB'))).toBe(false);
    });
  });
});

describe('eventSampleFrames', () => {
  it('adds one frame per reveal/flow at min(endF, n-1) and always unions the global set', () => {
    const timeline: TimelineIR = {
      fps: 30, width: 100, height: 100, totalFrames: 60,
      events: [
        { kind: 'reveal', target: 'a', startF: 0, endF: 12, x: 0, y: 0, w: 10, h: 10 },
        { kind: 'reveal', target: 'b', startF: 18, endF: 30, x: 20, y: 0, w: 10, h: 10 },
        { kind: 'flow', target: 'e', startF: 30, endF: 45, from: 'a', to: 'b' },
        { kind: 'highlight', target: 'b', startF: 45, endF: 60 }, // contributes NO sample
      ],
    };
    // global sampleFrames(60) = [0,15,30,45,59]; event frames = 12,30,45.
    expect(eventSampleFrames(timeline)).toEqual([0, 12, 15, 30, 45, 59]);
  });

  it('dedupes when events share an end frame', () => {
    const timeline: TimelineIR = {
      fps: 30, width: 100, height: 100, totalFrames: 60,
      events: [
        { kind: 'reveal', target: 'a', startF: 0, endF: 20, x: 0, y: 0, w: 10, h: 10 },
        { kind: 'reveal', target: 'b', startF: 0, endF: 20, x: 20, y: 0, w: 10, h: 10 },
        { kind: 'flow', target: 'e', startF: 8, endF: 20, from: 'a', to: 'b' },
      ],
    };
    const result = eventSampleFrames(timeline);
    // 20 appears exactly once; result is strictly ascending (deduped + sorted).
    expect(result.filter((f) => f === 20)).toHaveLength(1);
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeGreaterThan(result[i - 1]);
  });

  it('clamps an endF of totalFrames down to totalFrames-1', () => {
    const timeline: TimelineIR = {
      fps: 30, width: 100, height: 100, totalFrames: 50,
      events: [{ kind: 'flow', target: 'e', startF: 20, endF: 50, from: 'a', to: 'b' }],
    };
    const result = eventSampleFrames(timeline);
    expect(result).toContain(49); // min(50, 49)
    expect(result).not.toContain(50);
  });

  it('caps event-derived frames at 24 (uniform downsample) but keeps the global set', () => {
    const events: TimelineIR['events'] = [];
    for (let i = 1; i <= 40; i++) {
      events.push({ kind: 'reveal', target: `n${i}`, startF: i - 1, endF: i, x: 0, y: 0, w: 5, h: 5 });
    }
    const timeline: TimelineIR = { fps: 30, width: 100, height: 100, totalFrames: 100, events };
    const global = [0, 25, 50, 75, 99]; // sampleFrames(100)
    const result = eventSampleFrames(timeline);

    // 40 distinct event frames capped to <=24, plus <=5 global → <=29 total.
    expect(result.length).toBeLessThanOrEqual(24 + global.length);
    // global set always present; first & last event frames retained by the cap.
    for (const g of global) expect(result).toContain(g);
    expect(result).toContain(1);  // first event endF
    expect(result).toContain(40); // last event endF (min(40,99))
    // strictly ascending (sorted + deduped)
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeGreaterThan(result[i - 1]);
  });
});
