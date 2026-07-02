import { describe, it, expect } from 'vitest';
import { builderGate } from '../../src/gates/builderGate.js';
import { TimelineIR, TimelineEvent } from '../../src/types/timeline.js';
import { Structure, Vertex } from '../../src/types/structure.js';

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
});
