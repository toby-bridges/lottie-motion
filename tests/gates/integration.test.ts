import { describe, it, expect } from 'vitest';
import { builderGate, compilerGate, renderGate } from '../../src/gates/index.js';
import type { TimelineIR } from '../../src/types/timeline.js';
import type { Structure } from '../../src/types/structure.js';
import type { LottieJSON } from '../../src/types/compiler.js';
import type { Frame } from '../../src/renderer/render.js';

describe('Three-gate integration', () => {
  describe('canonical 3-node chain with motion', () => {
    it('passes all three gates for a valid animation', () => {
      // Structure: n1 -> n2 -> n3
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 },
          { id: 'n2', label: 'Middle', x: 100, y: 150, w: 60, h: 40 },
          { id: 'n3', label: 'End', x: 200, y: 280, w: 70, h: 50 }
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', label: 'flow' },
          { id: 'e2', source: 'n2', target: 'n3', label: 'flow' }
        ]
      };

      // Timeline: correct order, motion intent, spatial freeze
      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 150,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 },
          { kind: 'reveal', target: 'n2', startF: 15, endF: 27, x: 100, y: 150, w: 60, h: 40 },
          { kind: 'reveal', target: 'n3', startF: 30, endF: 42, x: 200, y: 280, w: 70, h: 50 },
          { kind: 'flow', target: 'e1', startF: 45, endF: 60, from: 'n1', to: 'n2' },
          { kind: 'flow', target: 'e2', startF: 63, endF: 78, from: 'n2', to: 'n3' },
          { kind: 'highlight', target: 'n3', startF: 78, endF: 90 }
        ]
      };

      // Builder gate
      const builderResult = builderGate(timeline, structure);
      expect(builderResult.pass).toBe(true);
      expect(builderResult.failures).toHaveLength(0);

      // Compiler gate (minimal valid Lottie)
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 150,
        w: 800,
        h: 600,
        nm: 'Canonical Chain',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const compilerResult = compilerGate(lottie, timeline);
      expect(compilerResult.pass).toBe(true);
      expect(compilerResult.failures).toHaveLength(0);

      // Render gate (mock frames: frame 0 = black, frame 1 = white)
      const frame0: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // black
      };

      const frame1Data = new Uint8ClampedArray(800 * 600 * 4);
      for (let i = 0; i < frame1Data.length; i += 4) {
        frame1Data[i] = 255;     // R
        frame1Data[i + 1] = 255; // G
        frame1Data[i + 2] = 255; // B
        frame1Data[i + 3] = 255; // A
      }

      const frame1: Frame = {
        width: 800,
        height: 600,
        data: frame1Data
      };

      const renderResult = renderGate([frame0, frame1], { width: 800, height: 600 });
      expect(renderResult.pass).toBe(true);
      expect(renderResult.failures).toHaveLength(0);
    });

    it('rejects animation with builder gate failure (spatial freeze violation)', () => {
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 }
        ],
        edges: []
      };

      // Timeline event has wrong x coordinate (99 instead of 10)
      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 50,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 99, y: 20, w: 50, h: 30 } // x mismatch
        ]
      };

      const result = builderGate(timeline, structure);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('x'))).toBe(true);
    });

    it('rejects animation with compiler gate failure (contract mismatch)', () => {
      const structure: Structure = {
        vertices: [
          { id: 'n1', label: 'Start', x: 10, y: 20, w: 50, h: 30 }
        ],
        edges: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 50,
        events: [
          { kind: 'reveal', target: 'n1', startF: 0, endF: 12, x: 10, y: 20, w: 50, h: 30 }
        ]
      };

      // Lottie has op=999 instead of 50
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 999,  // contract mismatch
        w: 800,
        h: 600,
        nm: 'Broken',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('out-point') || f.includes('op'))).toBe(true);
    });

    it('rejects animation with render gate failure (no motion)', () => {
      const frame1: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // all black
      };

      const frame2: Frame = {
        width: 800,
        height: 600,
        data: new Uint8ClampedArray(800 * 600 * 4) // also all black
      };

      const result = renderGate([frame1, frame2], { width: 800, height: 600 });
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('motion') || f.includes('static'))).toBe(true);
    });
  });
});
