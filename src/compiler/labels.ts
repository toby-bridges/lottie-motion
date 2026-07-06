import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Default import: opentype.js ships a CJS main without an exports map, so
// named ESM imports fail under plain Node (vitest's transform masks this).
import opentype from 'opentype.js';
import type { Font, PathCommand } from 'opentype.js';

/**
 * Font-to-path label rendering (roadmap "Deferred — Node label rendering").
 *
 * Labels are rendered as filled vector glyph contours, NOT Lottie text layers:
 * a ty:5 text layer draws nothing under the headless render stack (jsdom +
 * node-canvas + lottie-web) and blanks the whole frame (verified 2026-07-05).
 *
 * Determinism: the font is vendored with the package (Fira Sans Regular,
 * SIL OFL — see fonts/LICENSE-FiraSans.txt); no system-font lookup, so the
 * same label + box yields byte-identical contours on every machine. All
 * coordinates are rounded to 3 decimals for JSON stability.
 */

/** One closed bezier contour in Lottie shape terms (parallel arrays). */
export interface GlyphContour {
  /** Vertices [x, y] */
  v: [number, number][];
  /** In-tangents, relative to the vertex */
  i: [number, number][];
  /** Out-tangents, relative to the vertex */
  o: [number, number][];
}

export interface LabelContours {
  contours: GlyphContour[];
  /** Font size (px) chosen by the fit rule; useful for tests/debugging */
  fontSize: number;
}

// Fit rule constants: label height ≤ 40% of box height, width ≤ 90% of box width.
const HEIGHT_RATIO = 0.4;
const WIDTH_RATIO = 0.9;

let _font: Font | null = null;

function getFont(): Font {
  if (!_font) {
    const here = dirname(fileURLToPath(import.meta.url));
    const buf = readFileSync(join(here, 'fonts', 'FiraSans-Regular.ttf'));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

const R = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Convert opentype path commands into closed Lottie bezier contours.
 * Quadratic (Q) segments are raised to cubic: cp1 = prev + 2/3·(q − prev),
 * cp2 = curr + 2/3·(q − curr); Lottie tangents are stored relative to their
 * vertex. Counters (e.g. the hole of an "O") survive via the nonzero fill
 * rule because TrueType winds inner contours opposite to outer ones.
 */
function commandsToContours(cmds: PathCommand[]): GlyphContour[] {
  const contours: GlyphContour[] = [];
  let cur: GlyphContour | null = null;
  let prev: [number, number] = [0, 0];

  for (const c of cmds) {
    if (c.type === 'M') {
      cur = { v: [[R(c.x!), R(c.y!)]], i: [[0, 0]], o: [[0, 0]] };
      contours.push(cur);
      prev = [c.x!, c.y!];
    } else if (c.type === 'L' && cur) {
      cur.v.push([R(c.x!), R(c.y!)]);
      cur.i.push([0, 0]);
      cur.o.push([0, 0]);
      prev = [c.x!, c.y!];
    } else if (c.type === 'Q' && cur) {
      const cp1: [number, number] = [prev[0] + (2 / 3) * (c.x1! - prev[0]), prev[1] + (2 / 3) * (c.y1! - prev[1])];
      const cp2: [number, number] = [c.x! + (2 / 3) * (c.x1! - c.x!), c.y! + (2 / 3) * (c.y1! - c.y!)];
      cur.o[cur.o.length - 1] = [R(cp1[0] - prev[0]), R(cp1[1] - prev[1])];
      cur.v.push([R(c.x!), R(c.y!)]);
      cur.i.push([R(cp2[0] - c.x!), R(cp2[1] - c.y!)]);
      cur.o.push([0, 0]);
      prev = [c.x!, c.y!];
    } else if (c.type === 'C' && cur) {
      cur.o[cur.o.length - 1] = [R(c.x1! - prev[0]), R(c.y1! - prev[1])];
      cur.v.push([R(c.x!), R(c.y!)]);
      cur.i.push([R(c.x2! - c.x!), R(c.y2! - c.y!)]);
      cur.o.push([0, 0]);
      prev = [c.x!, c.y!];
    }
    // 'Z': contours are emitted as closed ('c': true) — nothing to do.
  }

  // Drop degenerate contours (fewer than 3 vertices cannot enclose area).
  return contours.filter((ct) => ct.v.length >= 3);
}

/**
 * labelToContours: pure function (label, box) → closed bezier contours,
 * centred on the origin — which is the node rect's centre in layer space,
 * so appending these to the reveal layer aligns label and box by default.
 */
export function labelToContours(label: string, box: { w: number; h: number }): LabelContours {
  const text = label.trim();
  if (text === '') {
    return { contours: [], fontSize: 0 };
  }

  const font = getFont();

  // Fit rule: bounded by box height and by box width (via advance width at 1px).
  const advPerPx = font.getAdvanceWidth(text, 1);
  const byHeight = HEIGHT_RATIO * box.h;
  const byWidth = advPerPx > 0 ? (WIDTH_RATIO * box.w) / advPerPx : byHeight;
  const fontSize = R(Math.min(byHeight, byWidth));

  // Horizontal centre: shift left by half the advance width.
  const width = font.getAdvanceWidth(text, fontSize);
  const x0 = -width / 2;

  // Vertical centre: baseline sits half the cap height below centre.
  const capHeight = font.tables.os2?.sCapHeight ?? 0.7 * font.unitsPerEm;
  const y0 = (capHeight / font.unitsPerEm) * fontSize * 0.5;

  const path = font.getPath(text, x0, y0, fontSize);
  return { contours: commandsToContours(path.commands), fontSize };
}
