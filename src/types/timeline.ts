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
  /**
   * Node label, copied verbatim from the input vertex (spatial-freeze sibling).
   * Optional so hand-built test timelines need not supply it; the planner always
   * populates it. The compiler renders a text layer only when it is non-empty.
   */
  label?: string;
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
