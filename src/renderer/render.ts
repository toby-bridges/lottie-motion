// Headless Lottie rendering — node-canvas + jsdom + lottie-web canvas renderer.
// See Task notes: DOM is created ONCE at module load and left in place; lottie-web
// is imported dynamically AFTER window exists.
import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';

const _dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
(globalThis as unknown as { window: unknown }).window = _dom.window;
(globalThis as unknown as { document: unknown }).document = _dom.window.document;

export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA pixels
}

export function sampleFrames(totalFrames: number): number[] {
  if (totalFrames < 1) return [];
  const samples = [
    0,
    Math.floor(totalFrames / 4),
    Math.floor(totalFrames / 2),
    Math.floor((3 * totalFrames) / 4),
    totalFrames - 1,
  ];
  return Array.from(new Set(samples)).sort((a, b) => a - b);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lottie: any = null;
async function getLottie(): Promise<any> {
  if (!_lottie) {
    const mod: any = await import('lottie-web');
    _lottie = mod.default || mod;
  }
  return _lottie;
}

export async function render(
  lottie: Record<string, unknown>,
  frames: number[]
): Promise<Frame[]> {
  const width = Number(lottie.w);
  const height = Number(lottie.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`render: invalid canvas dimensions w=${lottie.w} h=${lottie.h}`);
  }

  const lottieWeb = await getLottie();
  const canvasEl = createCanvas(width, height);
  const ctx = canvasEl.getContext('2d');

  const item = lottieWeb.loadAnimation({
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: lottie,
    rendererSettings: { context: ctx, clearCanvas: true },
  });

  const out: Frame[] = [];
  for (const f of frames) {
    item.goToAndStop(f, true);
    const img = ctx.getImageData(0, 0, width, height);
    out.push({ width, height, data: img.data as unknown as Uint8ClampedArray });
  }
  item.destroy();
  return out;
}
