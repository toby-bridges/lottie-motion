import { describe, it, expect } from 'vitest';
import { renderGate } from '../../src/gates/renderGate.js';
import type { Frame } from '../../src/renderer/render.js';

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
});
