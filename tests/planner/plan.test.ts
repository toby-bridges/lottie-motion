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
