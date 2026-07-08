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
  /**
   * Edge label, copied verbatim from the input edge (the flow sibling of
   * reveal.label). Optional so hand-built test timelines need not supply it; the
   * planner always populates it. The compiler renders a glyph layer only when it
   * is non-empty (whitespace-trimmed).
   */
  label?: string;
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
  /**
   * Canvas translation the COMPILER adds to every layer so that content whose
   * input coordinates are negative or far from the origin still lands inside the
   * [0,width]×[0,height] canvas. This is the ONLY place a translation lives:
   * reveal events keep their input x/y/w/h frozen verbatim (builder-gate
   * spatial-freeze red line), and the planner never mutates geometry — it only
   * publishes this offset (= padding − bboxMin). Optional so hand-built test
   * timelines need not supply it; the compiler treats an absent value as 0,
   * reproducing the pre-viewport behaviour. Sibling convention to `label?`.
   */
  offsetX?: number;
  offsetY?: number;
  /** Timeline events sorted by startF */
  events: TimelineEvent[];
}
