import { describe, it, expect } from 'vitest';
import { plan } from '../../src/planner/plan.js';
import { compile } from '../../src/compiler/compile.js';
import type { Structure } from '../../src/types/structure.js';
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

  it('should set fps from planner and fit the canvas to the input bbox + padding', () => {
    const result = plan(fixture3NodeChain.input);
    // fps is still a pure planner default, independent of the input.
    expect(result.fps).toBe(30);
    // Canvas is no longer a fixed 1920×1080: it is the input bbox
    // ([0,0]..[340,50]) grown by 2·padding (padding=40 for these ≤100px boxes).
    expect(result.width).toBe(420);
    expect(result.height).toBe(130);
    expect(result.offsetX).toBe(40);
    expect(result.offsetY).toBe(40);
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

describe('planner/plan viewport fitting', () => {
  // node layers are named 'n', edge layers 'e' (see compile.ts)
  const nodeLayerPositions = (lottie: any): [number, number, number][] =>
    lottie.layers.filter((l: any) => l.nm === 'n').map((l: any) => l.ks.p.k);

  it('① fits the canvas to a single node near the origin, with the right offset', () => {
    const structure: Structure = {
      vertices: [{ id: 'X', label: 'Solo', x: 10, y: 10, w: 100, h: 60 }],
      edges: []
    };
    const result = plan(structure);

    // bbox [10,10]..[110,70] → 100×60; maxBoxDim=100 → padding=40.
    // canvas = bbox + 2·padding; offset = padding − bboxMin.
    expect(result.width).toBe(180); // 100 + 2·40
    expect(result.height).toBe(140); // 60 + 2·40
    expect(result.offsetX).toBe(30); // 40 − 10
    expect(result.offsetY).toBe(30); // 40 − 10

    // The single node's centre must land exactly `padding` in from the top-left:
    // x + w/2 + offsetX = 10 + 50 + 30 = 90 = padding + w/2.
    const [p] = nodeLayerPositions(compile(result));
    expect(p).toEqual([90, 70, 0]);
  });

  it('② translates a negative-coordinate structure into the canvas (freeze preserved, compiled positions in-bounds)', () => {
    const structure: Structure = {
      vertices: [
        { id: 'A', label: 'A', x: -500, y: -300, w: 100, h: 50 },
        { id: 'B', label: 'B', x: -200, y: -100, w: 100, h: 50 }
      ],
      edges: [{ id: 'e', source: 'A', target: 'B', label: '' }]
    };
    const result = plan(structure);

    // bbox [-500,-300]..[-100,-50] → 400×250; padding=40.
    expect(result.width).toBe(480); // 400 + 80
    expect(result.height).toBe(330); // 250 + 80
    expect(result.offsetX).toBe(540); // 40 − (−500)
    expect(result.offsetY).toBe(340); // 40 − (−300)

    // Spatial-freeze red line: reveal events keep the RAW negative input coords;
    // the offset lives only on the timeline, never on the event geometry.
    const revealA = result.events.find(
      (e): e is Extract<typeof e, { kind: 'reveal' }> => e.kind === 'reveal' && e.target === 'A'
    )!;
    expect(revealA.x).toBe(-500);
    expect(revealA.y).toBe(-300);

    // After compilation every node position must be positive and inside the canvas.
    const positions = nodeLayerPositions(compile(result));
    expect(positions.length).toBe(2);
    for (const [px, py] of positions) {
      expect(px).toBeGreaterThan(0);
      expect(py).toBeGreaterThan(0);
      expect(px).toBeLessThan(result.width);
      expect(py).toBeLessThan(result.height);
    }
    // A's centre: −500 + 50 + 540 = 90 ; −300 + 25 + 340 = 65.
    expect(positions[0]).toEqual([90, 65, 0]);
  });

  it('③ grows the canvas to hold a large-coordinate structure and pulls it into frame', () => {
    const structure: Structure = {
      vertices: [
        { id: 'A', label: 'A', x: 3000, y: 50, w: 200, h: 100 },
        { id: 'B', label: 'B', x: 3400, y: 50, w: 200, h: 100 }
      ],
      edges: [{ id: 'e', source: 'A', target: 'B', label: '' }]
    };
    const result = plan(structure);

    // bbox [3000,50]..[3600,150] → 600×100; maxBoxDim=200 → padding=40.
    // The canvas tracks the bbox (600 wide) instead of a fixed 1920, and the
    // offset is negative — it pulls the far-out content back toward the origin.
    expect(result.width).toBe(680); // 600 + 80
    expect(result.height).toBe(180); // 100 + 80
    expect(result.offsetX).toBe(-2960); // 40 − 3000
    expect(result.offsetY).toBe(-10); // 40 − 50

    const positions = nodeLayerPositions(compile(result));
    for (const [px, py] of positions) {
      expect(px).toBeGreaterThan(0);
      expect(py).toBeGreaterThan(0);
      expect(px).toBeLessThan(result.width);
      expect(py).toBeLessThan(result.height);
    }
  });

  it('grows padding above the 40 floor for a very large box (scale-pulse term)', () => {
    // maxBoxDim = 2000 makes the highlight-overflow term dominate the 40 floor:
    // padding = max(40, ceil(0.025·2000) + 4) = max(40, 54) = 54.
    const structure: Structure = {
      vertices: [{ id: 'Big', label: 'Big', x: 0, y: 0, w: 2000, h: 300 }],
      edges: []
    };
    const result = plan(structure);
    expect(result.offsetX).toBe(54);
    expect(result.offsetY).toBe(54);
    expect(result.width).toBe(2108); // 2000 + 2·54
    expect(result.height).toBe(408); // 300 + 2·54
  });
});
