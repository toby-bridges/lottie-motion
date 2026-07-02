/**
 * Timeline IR types — the planner's typed in-memory output.
 *
 * All time is explicit (absolute startF/endF); no implicit cursor.
 * Geometry from input is embedded verbatim in reveal events (frozen).
 * Events sorted by startF; one time authority: the planner.
 */

export interface TimelineEventReveal {
  kind: 'reveal';
  target: string;
  startF: number;
  endF: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimelineEventFlow {
  kind: 'flow';
  target: string;
  startF: number;
  endF: number;
  from: string;
  to: string;
}

export interface TimelineEventHighlight {
  kind: 'highlight';
  target: string;
  startF: number;
  endF: number;
}

export type TimelineEvent = TimelineEventReveal | TimelineEventFlow | TimelineEventHighlight;

export interface TimelineIR {
  /** Frames per second for the animation */
  fps: number;
  /** Canvas width (in Lottie units) */
  width: number;
  /** Canvas height (in Lottie units) */
  height: number;
  /** Total frame count (inclusive range 0..totalFrames-1) */
  totalFrames: number;
  /** Timeline events sorted by startF */
  events: TimelineEvent[];
}
