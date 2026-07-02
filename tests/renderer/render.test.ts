import { describe, it, expect } from 'vitest';
import { sampleFrames, render } from '../../src/renderer/render.js';

describe('sampleFrames', () => {
  it('returns [] for totalFrames < 1', () => {
    expect(sampleFrames(0)).toEqual([]);
    expect(sampleFrames(-3)).toEqual([]);
  });
  it('returns [0] for totalFrames === 1', () => {
    expect(sampleFrames(1)).toEqual([0]);
  });
  it('dedupes small totals: totalFrames === 4 -> [0,1,2,3]', () => {
    expect(sampleFrames(4)).toEqual([0, 1, 2, 3]);
  });
  it('samples [0, n/4, n/2, 3n/4, n-1] for totalFrames === 60', () => {
    expect(sampleFrames(60)).toEqual([0, 15, 30, 45, 59]);
  });
});

// A rectangle with an opacity ramp: blank at frame 0, fully visible by frame 15+.
const animFixture: Record<string, unknown> = {
  v: '5.9.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 't', ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'r', sr: 1,
    ks: {
      o: { a: 1, k: [{ t: 0, s: [0] }, { t: 59, s: [100] }] },
      r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes: [{ ty: 'gr', it: [
      { ty: 'rc', d: 1, s: { a: 0, k: [80, 80] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 } },
      { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } },
      { ty: 'tr', p: { a: 0, k: [50, 50] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
    ]}],
    ip: 0, op: 60, st: 0, bm: 0,
  }],
};

function pixelSum(f: { data: Uint8ClampedArray }): number {
  let s = 0;
  for (let i = 0; i < f.data.length; i++) s += f.data[i];
  return s;
}

describe('render', () => {
  it('throws on invalid canvas dimensions', async () => {
    await expect(render({ w: 0, h: 0 }, [0])).rejects.toThrow(/invalid canvas dimensions/);
  });

  it('renders sampled frames at correct dimensions and detects the opacity ramp', async () => {
    const frames = sampleFrames(60);
    const rendered = await render(animFixture, frames);
    expect(rendered).toHaveLength(frames.length);
    expect(rendered.every((f) => f.width === 100 && f.height === 100)).toBe(true);
    const sums = rendered.map(pixelSum);
    // frame 0 is blank (opacity 0); later frames show the red rectangle.
    expect(sums[0]).toBe(0);
    expect(sums[sums.length - 1]).toBeGreaterThan(0);
  });
});
