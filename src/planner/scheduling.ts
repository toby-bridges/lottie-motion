import { Structure, Vertex } from '../types/structure.js';
import { TimelineEvent } from '../types/timeline.js';

export interface ScheduleOptions {
  revealDur: number;
  stagger: number;
  fps: number;
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
  const { revealDur, stagger, fps } = options;

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
      h: vertex.h
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

  // Combine and sort by startF
  const allEvents: TimelineEvent[] = [...reveals, ...flows];
  allEvents.sort((a, b) => a.startF - b.startF);

  return allEvents;
}
