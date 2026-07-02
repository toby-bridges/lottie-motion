import { TimelineIR, TimelineEvent } from '../types/timeline.js';
import { Structure, Vertex } from '../types/structure.js';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Check each event
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

      // Motion intent
      if (event.startF === event.endF) {
        failures.push(`Reveal '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    } else if (event.kind === 'flow') {
      // Motion intent for flow
      if (event.startF === event.endF) {
        failures.push(`Flow '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    } else if (event.kind === 'highlight') {
      // Motion intent for highlight
      if (event.startF === event.endF) {
        failures.push(`Highlight '${event.target}': motion intent violation (startF === endF, no duration)`);
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
