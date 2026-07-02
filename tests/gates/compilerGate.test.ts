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

  describe('contract validation (w/h/fr/op-ip)', () => {
    it('passes when Lottie contract matches Timeline IR', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
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
    });

    it('fails when Lottie w does not match Timeline width', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 999,  // mismatch
        h: 600,
        nm: 'Test',
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
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('width') || f.includes('w'))).toBe(true);
    });

    it('fails when Lottie h does not match Timeline height', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 120,
        w: 800,
        h: 999,  // mismatch
        nm: 'Test',
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
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('height') || f.includes('h'))).toBe(true);
    });

    it('fails when Lottie fr (framerate) does not match Timeline fps', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 60,  // mismatch: timeline says 30
        ip: 0,
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
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
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('framerate') || f.includes('fps') || f.includes('fr'))).toBe(true);
    });

    it('fails when Lottie op (out-point) does not match Timeline totalFrames', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 0,
        op: 999,  // mismatch: timeline says 120
        w: 800,
        h: 600,
        nm: 'Test',
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
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('op') || f.includes('totalFrames'))).toBe(true);
    });

    it('fails when Lottie ip (in-point) is not 0', () => {
      const lottie: LottieJSON = {
        v: '5.8.1',
        fr: 30,
        ip: 5,  // must be 0
        op: 120,
        w: 800,
        h: 600,
        nm: 'Test',
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
      expect(result.pass).toBe(false);
      expect(result.failures.some(f => f.includes('in-point') || f.includes('ip'))).toBe(true);
    });
  });
});
