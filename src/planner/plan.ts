import { Structure } from '../types/structure.js';
import { TimelineIR } from '../types/timeline.js';
import { orderVertices } from './ordering.js';
import { scheduleEvents, ScheduleOptions } from './scheduling.js';

/**
 * Pure function: plan(structure, overrides?) → TimelineIR
 *
 * Single time authority. Computes reveal/flow/highlight event timeline deterministically
 * from structural input. v0.1 reserves overrides slot but implements no behavior.
 */
export function plan(
  structure: Structure,
  overrides?: unknown
): TimelineIR {
  // v0.1: ignore overrides parameter (reserved for future)
  (overrides);

  // Step 1: Order vertices (topological or visual fallback)
  const orderedVertexIds = orderVertices(structure);

  // Step 2: Set timing defaults
  const fps = 30;
  const revealDur = 12;
  const stagger = 6;

  // Step 3: Fit the canvas to the input.
  //
  // Real draw.io/mxGraph coordinates are arbitrary (negative, or thousands),
  // so a fixed 1920×1080 canvas clips or hides content. Instead:
  //   canvas = input bounding box + uniform padding.
  // The bbox spans every vertex's min(x)/min(y)..max(x+w)/max(y+h); edges never
  // exceed it because an edge always connects two node CENTRES, which lie inside
  // their own boxes and therefore inside the bbox.
  //
  // Padding must cover two ways rendered content overshoots the raw bbox, on
  // every side:
  //   1. the highlight scale pulse — a node scales to 105% about its own centre,
  //      so its far edge overshoots the box (worst case, the bbox edge) by 2.5%
  //      of the box's largest dimension: 0.025 · maxBoxDim.
  //   2. the flow-edge stroke — 4px wide, centred on a segment ending at a node
  //      centre; half (2px) spills past the endpoint, so a full stroke width (+4)
  //      is a conservative cover.
  //   padding = max(40, ceil(0.025 · maxBoxDim) + 4)
  // The max(40, …) floor keeps a comfortable margin for small diagrams.
  //
  // The bbox is then translated into the canvas by offsetX/offsetY = padding −
  // bboxMin, so the top-left of the content sits exactly `padding` from the
  // canvas origin. The translation is applied ONLY by the compiler; reveal
  // events keep their frozen input coordinates (builder-gate spatial-freeze).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxBoxDim = 0;
  for (const v of structure.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x + v.w > maxX) maxX = v.x + v.w;
    if (v.y + v.h > maxY) maxY = v.y + v.h;
    const dim = Math.max(v.w, v.h);
    if (dim > maxBoxDim) maxBoxDim = dim;
  }
  // Defensive: validateStructure rejects an empty vertex set, but plan() is a
  // pure function callable in isolation — degrade to an origin bbox rather than
  // propagate Infinity/-Infinity.
  if (structure.vertices.length === 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
    maxBoxDim = 0;
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const padding = Math.max(40, Math.ceil(0.025 * maxBoxDim) + 4);

  const offsetX = padding - minX;
  const offsetY = padding - minY;
  // ceil keeps the canvas an integer size that never clips fractional-coordinate
  // content (left/top margin is exactly `padding`; right/bottom is padding..padding+1).
  const width = Math.ceil(bboxW + 2 * padding);
  const height = Math.ceil(bboxH + 2 * padding);

  // Step 4: Schedule reveal and flow events
  const events = scheduleEvents(structure, orderedVertexIds, {
    revealDur,
    stagger
  });

  // Step 5: Compute total frames
  let maxEndF = 0;
  for (const event of events) {
    if (event.endF > maxEndF) {
      maxEndF = event.endF;
    }
  }
  const totalFrames = maxEndF;

  // Step 6: Emit Timeline IR
  return {
    fps,
    width,
    height,
    totalFrames,
    offsetX,
    offsetY,
    events
  };
}
