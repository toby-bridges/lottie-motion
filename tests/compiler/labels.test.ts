import { describe, it, expect } from 'vitest';
import { labelToContours } from '../../src/compiler/labels.js';

describe('compiler/labels — font-to-path glyph contours', () => {
  const box = { w: 120, h: 60 };

  it('converts a label to at least one closed bezier contour', () => {
    const result = labelToContours('Auth', box);
    expect(result.contours.length).toBeGreaterThan(0);
    for (const c of result.contours) {
      // parallel arrays: vertices, in-tangents, out-tangents
      expect(c.v.length).toBeGreaterThan(2);
      expect(c.i.length).toBe(c.v.length);
      expect(c.o.length).toBe(c.v.length);
    }
  });

  it('is deterministic: same label + box → identical contours', () => {
    const a = labelToContours('Auth Service', box);
    const b = labelToContours('Auth Service', box);
    expect(a).toEqual(b);
  });

  it('preserves counters: "O" yields outer + inner contour', () => {
    const result = labelToContours('O', box);
    expect(result.contours.length).toBe(2);
  });

  it('returns empty contours for empty or whitespace-only labels', () => {
    expect(labelToContours('', box).contours).toEqual([]);
    expect(labelToContours('   ', box).contours).toEqual([]);
  });

  it('fits the glyphs inside the box (width and height margins)', () => {
    // long label must be shrunk to fit the box width
    const result = labelToContours('A Very Long Service Name', box);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of result.contours) {
      for (const [x, y] of c.v) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    // contours are centred on the origin (the node rect's centre in layer space)
    expect(maxX - minX).toBeLessThanOrEqual(box.w);
    expect(maxY - minY).toBeLessThanOrEqual(box.h);
    expect(Math.abs((minX + maxX) / 2)).toBeLessThan(2); // horizontally centred
  });

  it('rounds coordinates to 3 decimals (JSON stability)', () => {
    const result = labelToContours('S', box);
    for (const c of result.contours) {
      for (const arr of [c.v, c.i, c.o]) {
        for (const [x, y] of arr) {
          expect(x).toBe(Math.round(x * 1000) / 1000);
          expect(y).toBe(Math.round(y * 1000) / 1000);
        }
      }
    }
  });
});
