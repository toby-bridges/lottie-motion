import type { Frame } from '../renderer/render.js';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

/**
 * Compare two RGBA pixel buffers and count differing pixels.
 * Returns the number of pixels that differ.
 */
function countDifferentPixels(data1: Uint8ClampedArray, data2: Uint8ClampedArray): number {
  if (data1.length !== data2.length) {
    return -1; // incomparable
  }

  let diffCount = 0;
  // Compare each pixel (4 bytes per pixel: RGBA)
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i];
    const g1 = data1[i + 1];
    const b1 = data1[i + 2];
    const a1 = data1[i + 3];

    const r2 = data2[i];
    const g2 = data2[i + 1];
    const b2 = data2[i + 2];
    const a2 = data2[i + 3];

    if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
      diffCount++;
    }
  }

  return diffCount;
}

export function renderGate(frames: Frame[], spec: { width: number; height: number }): GateResult {
  const failures: string[] = [];

  // Check dimension contract
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    if (frame.width !== spec.width) {
      failures.push(`Frame ${i}: width mismatch (frame.width=${frame.width}, spec.width=${spec.width})`);
    }

    if (frame.height !== spec.height) {
      failures.push(`Frame ${i}: height mismatch (frame.height=${frame.height}, spec.height=${spec.height})`);
    }
  }

  // Check motion: compare adjacent frames for pixel changes
  if (frames.length < 2) {
    // Single frame or empty: assume motion intent exists (builder gate verified it)
    // Render gate cannot disprove motion with < 2 samples
    return {
      pass: failures.length === 0,
      failures
    };
  }

  // Compare adjacent frame pairs
  let hasMotion = false;
  for (let i = 0; i < frames.length - 1; i++) {
    const frame1 = frames[i];
    const frame2 = frames[i + 1];

    const diffPixels = countDifferentPixels(frame1.data, frame2.data);
    if (diffPixels > 0) {
      hasMotion = true;
      break;
    }
  }

  if (!hasMotion) {
    failures.push('No motion detected: all sampled frames are identical (animation is fully static)');
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
