import { Structure, Vertex } from '../types/structure.js';
import { TimelineEvent } from '../types/timeline.js';

export interface ScheduleOptions {
  revealDur: number;
  stagger: number;
}

/**
 * Schedule reveal and flow events for an ordered list of vertices.
 * Returns events sorted by startF.
 */
export function scheduleEvents(
  structure: Structure,
  orderedVertexIds: string[],
  options: ScheduleOptions
): TimelineEvent[] {
  const { revealDur, stagger } = options;

  // Build a map of vertex id → Vertex for geometry lookups
  const vertexMap = new Map<string, Vertex>();
  for (const v of structure.vertices) {
    vertexMap.set(v.id, v);
  }

  // Build a map of edge id → { source, target }
  const edgeMap = new Map<string, { source: string; target: string }>();
  for (const e of structure.edges) {
    edgeMap.set(e.id, { source: e.source, target: e.target });
  }

  // Schedule reveals
  const reveals: TimelineEvent[] = [];
  const revealEndFrame = new Map<string, number>(); // track when each node finishes revealing

  for (let i = 0; i < orderedVertexIds.length; i++) {
    const vertexId = orderedVertexIds[i];
    const vertex = vertexMap.get(vertexId)!;

    const startF = i * (revealDur + stagger);
    const endF = startF + revealDur;

    reveals.push({
      kind: 'reveal',
      target: vertexId,
      startF,
      endF,
      x: vertex.x,
      y: vertex.y,
      w: vertex.w,
      h: vertex.h,
      label: vertex.label
    });

    revealEndFrame.set(vertexId, endF);
  }

  // Schedule flows
  // An edge flows only after BOTH endpoints are revealed
  const flows: TimelineEvent[] = [];
  const flowDur = revealDur; // flow duration = reveal duration

  for (const edge of structure.edges) {
    const source = edge.source;
    const target = edge.target;

    const sourceRevealEnd = revealEndFrame.get(source)!;
    const targetRevealEnd = revealEndFrame.get(target)!;

    // Flow starts after BOTH endpoints are revealed
    const flowStart = Math.max(sourceRevealEnd, targetRevealEnd);
    const flowEnd = flowStart + flowDur;

    flows.push({
      kind: 'flow',
      target: edge.id,
      startF: flowStart,
      endF: flowEnd,
      from: source,
      to: target
    });
  }

  // Schedule closing highlights
  // "Highlight closes": after every reveal and flow has finished, emphasise the
  // terminal node(s). Deterministic target rule:
  //   - sinks (out-degree 0) — the semantic end of the flow; or
  //   - if the graph has no sink (e.g. a pure cycle on the visual-order path),
  //     fall back to the last vertex in reveal order so every valid input still
  //     gets exactly one closing highlight (the feature stays reachable).
  const highlightDur = revealDur; // highlight duration = reveal duration
  const highlights: TimelineEvent[] = [];

  // closeStart = the frame after all reveals and flows have ended
  let closeStart = 0;
  for (const event of [...reveals, ...flows]) {
    if (event.endF > closeStart) {
      closeStart = event.endF;
    }
  }

  // Sinks = vertices that are never an edge source (deterministic input order)
  const sourceIds = new Set(structure.edges.map((e) => e.source));
  const sinkIds = orderedVertexIds.filter((id) => !sourceIds.has(id));
  const highlightTargets =
    sinkIds.length > 0
      ? sinkIds
      : orderedVertexIds.length > 0
        ? [orderedVertexIds[orderedVertexIds.length - 1]]
        : [];

  for (const target of highlightTargets) {
    highlights.push({
      kind: 'highlight',
      target,
      startF: closeStart,
      endF: closeStart + highlightDur
    });
  }

  // Combine and sort by startF
  const allEvents: TimelineEvent[] = [...reveals, ...flows, ...highlights];
  allEvents.sort((a, b) => a.startF - b.startF);

  return allEvents;
}
