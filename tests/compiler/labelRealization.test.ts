import { describe, it, expect } from 'vitest';
import { plan } from '../../src/planner/plan.js';
import { compile } from '../../src/compiler/compile.js';
import { render } from '../../src/renderer/render.js';
import type { Structure } from '../../src/types/structure.js';

/**
 * Label REALIZATION proof (pixel-level, through the real pipeline).
 *
 * Lesson learned 2026-07-05: a probe that only checks "doesn't throw" is not
 * proof — Lottie ty:5 text layers passed that bar while blanking every frame.
 * This test asserts labels actually contribute rendered pixels, and that they
 * do not blank the rest of the animation.
 */

const structure: Structure = {
  vertices: [
    { id: 'a', label: 'Auth', x: 200, y: 100, w: 160, h: 80 },
    { id: 'b', label: 'DB', x: 200, y: 400, w: 160, h: 80 },
  ],
  edges: [{ id: 'a-b', source: 'a', target: 'b', label: '' }],
};

function nonblank(data: Uint8ClampedArray): number {
  let n = 0;
  for (let j = 0; j < data.length; j += 4) {
    if (data[j + 3] !== 0) n++;
  }
  return n;
}

/** Glyphs are white on the dark node fill — count near-white opaque pixels. */
function whitePixels(data: Uint8ClampedArray): number {
  let n = 0;
  for (let j = 0; j < data.length; j += 4) {
    if (data[j] > 200 && data[j + 1] > 200 && data[j + 2] > 200 && data[j + 3] > 200) n++;
  }
  return n;
}

describe('label rendering realization', () => {
  it('glyphs render as white pixels on the boxes, and nothing goes blank', async () => {
    const timeline = plan(structure);
    const unlabeledStructure: Structure = {
      ...structure,
      vertices: structure.vertices.map((v) => ({ ...v, label: '' })),
    };
    const timelineUnlabeled = plan(unlabeledStructure);

    // Sample a frame where both nodes are fully revealed.
    const revealed = Math.max(
      ...timeline.events.filter((e) => e.kind === 'reveal').map((e) => e.endF)
    );

    const labeled = await render(compile(timeline), [revealed]);
    const unlabeled = await render(compile(timelineUnlabeled), [revealed]);

    // The boxes render in both cases — glyphs must not blank the frame
    // (the ty:5 text-layer failure mode).
    expect(nonblank(unlabeled[0].data)).toBeGreaterThan(0);
    expect(nonblank(labeled[0].data)).toBeGreaterThan(0);

    // Glyphs sit INSIDE the opaque boxes, so alpha counts don't change —
    // assert on colour instead: white glyph pixels appear only when labeled.
    expect(whitePixels(unlabeled[0].data)).toBe(0);
    expect(whitePixels(labeled[0].data)).toBeGreaterThan(100);
  }, 30000);
});
