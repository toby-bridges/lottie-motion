import { describe, it, expect } from 'vitest';
import { compilerGate } from '../../src/gates/compilerGate.js';
import type { TimelineIR } from '../../src/types/timeline.js';
import type { LottieJSON } from '../../src/types/compiler.js';

describe('compilerGate', () => {
  describe('schema validation', () => {
    it('passes when Lottie JSON is valid against schema', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test Animation',
        ddd: 0,
        assets: [],
        layers: [],
        markers: []
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when Lottie JSON is missing required top-level fields', () => {
      const lottie: LottieJSON = {
        // Missing v, fr, ip, op, w, h
        nm: 'Invalid'
      };

      const timeline: TimelineIR = {
        fps: 30,
        width: 800,
        height: 600,
        totalFrames: 120,
        events: []
      };

      const result = compilerGate(lottie, timeline);
      expect(result.pass).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some(f => f.includes('Schema validation error'))).toBe(true);
    });
  });
});
