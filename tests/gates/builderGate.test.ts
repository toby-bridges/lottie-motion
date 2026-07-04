import { describe, it, expect } from 'vitest';
import { builderGate } from '../../src/gates/builderGate.js';
import { TimelineIR, TimelineEvent } from '../../src/types/timeline.js';
import { Structure, Vertex } from '../../src/types/structure.js';
import { fixtureCyclicGraph } from '../planner/fixtures.js';
import { plan } from '../../src/planner/plan.js';

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
      expect(result.failures.some((f) => f.includes('n1'))).toBe(true);
      expect(result.failures[0]).toContain('x');
    });
  });

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
        { kind: 'reveal', target: 'n2', startF: 13, endF: 14, x: 100, y: 150, w: 60, h: 40 },
        { kind: 'flow', target: 'e1', startF: 15, endF: 27, from: 'n1', to: 'n2' } // duration > 0
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

  describe('cyclic graph invariant', () => {
    it('passes when cyclic graph is planned and gated (regression test)', () => {
      // Cyclic graph A → B → C → A
      const tl = plan(fixtureCyclicGraph.input);
      const result = builderGate(tl, fixtureCyclicGraph.input);

      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('passes with self-loop (single vertex cycling to itself)', () => {
      const vertices: Vertex[] = [
        { id: 'n1', label: 'Node 1', x: 10, y: 20, w: 50, h: 30 }
      ];
      const edges = [
        { id: 'e1', source: 'n1', target: 'n1', label: 'self' }
      ];
      const structure: Structure = { vertices, edges };

      const events: TimelineEvent[] = [
        { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
        { kind: 'flow', target: 'e1', startF: 12, endF: 24, from: 'n1', to: 'n1' }
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
  });
});
