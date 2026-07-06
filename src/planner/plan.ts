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

  // Step 2: Set canvas and timing defaults
  const fps = 30;
  const width = 1920;
  const height = 1080;
  const revealDur = 12;
  const stagger = 6;

  // Step 3: Schedule reveal and flow events
  const events = scheduleEvents(structure, orderedVertexIds, {
    revealDur,
    stagger,
    fps
  });

  // Step 4: Compute total frames
  let maxEndF = 0;
  for (const event of events) {
    if (event.endF > maxEndF) {
      maxEndF = event.endF;
    }
  }
  const totalFrames = maxEndF;

  // Step 5: Emit Timeline IR
  return {
    fps,
    width,
    height,
    totalFrames,
    events
  };
}
