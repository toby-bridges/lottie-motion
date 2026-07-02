import { TimelineIR, TimelineEvent } from '../types/timeline.js';
import { Structure, Vertex } from '../types/structure.js';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Build reveal-end-frame map: which frame each node/edge finishes revealing
  const revealEndFrames = new Map<string, number>();

  // First pass: collect all frame info and check frame validity
  for (const event of timeline.events) {
    // Check non-negative frames
    if (event.startF < 0) {
      failures.push(`Event '${event.target}': negative startF (${event.startF})`);
    }
    if (event.endF < 0) {
      failures.push(`Event '${event.target}': negative endF (${event.endF})`);
    }

    // Check endF >= startF
    if (event.endF < event.startF) {
      failures.push(`Event '${event.target}': endF (${event.endF}) < startF (${event.startF})`);
    }

    // Motion intent
    if (event.startF === event.endF) {
      failures.push(`Event '${event.target}': motion intent violation (startF === endF, no duration)`);
    }

    // Track reveal end-times for edge-flow checks
    if (event.kind === 'reveal') {
      revealEndFrames.set(event.target, event.endF);
    }
  }

  // Second pass: spatial freeze and edge-flow constraints
  for (const event of timeline.events) {
    if (event.kind === 'reveal') {
      const vertex = vertexMap.get(event.target);
      if (!vertex) {
        failures.push(`Reveal event references non-existent vertex: ${event.target}`);
        continue;
      }

      // Spatial freeze
      if (event.x !== vertex.x) {
        failures.push(`Reveal '${event.target}': x mismatch (event=${event.x}, vertex=${vertex.x})`);
      }
      if (event.y !== vertex.y) {
        failures.push(`Reveal '${event.target}': y mismatch (event=${event.y}, vertex=${vertex.y})`);
      }
      if (event.w !== vertex.w) {
        failures.push(`Reveal '${event.target}': w mismatch (event=${event.w}, vertex=${vertex.w})`);
      }
      if (event.h !== vertex.h) {
        failures.push(`Reveal '${event.target}': h mismatch (event=${event.h}, vertex=${vertex.h})`);
      }
    } else if (event.kind === 'flow') {
      // Edge flow constraint: must start after both source and target are revealed
      const sourceEndF = revealEndFrames.get(event.from);
      const targetEndF = revealEndFrames.get(event.to);

      if (sourceEndF === undefined) {
        failures.push(`flow '${event.target}': source vertex '${event.from}' never revealed`);
      } else if (event.startF < sourceEndF) {
        failures.push(`flow '${event.target}': must start after source '${event.from}' is revealed (starts ${event.startF}, source revealed at ${sourceEndF})`);
      }

      if (targetEndF === undefined) {
        failures.push(`flow '${event.target}': target vertex '${event.to}' never revealed`);
      } else if (event.startF < targetEndF) {
        failures.push(`flow '${event.target}': must start after target '${event.to}' is revealed (starts ${event.startF}, target revealed at ${targetEndF})`);
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
