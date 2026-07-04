import { TimelineIR, TimelineEvent } from '../types/timeline.js';
import { Structure, Vertex } from '../types/structure.js';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

/**
 * Detect whether a structure contains a cycle using DFS three-color marking.
 * Colors: white (unvisited) -> gray (in-progress) -> black (done).
 * If we reach a gray node, there's a cycle.
 * This is an independent implementation (not reusing the planner's Kahn algorithm).
 */
function hasCycle(structure: Structure): boolean {
  const visited = new Map<string, 'white' | 'gray' | 'black'>();
  const adjacency = new Map<string, string[]>();

  // Initialize: all vertices are white, build adjacency list
  for (const v of structure.vertices) {
    visited.set(v.id, 'white');
    adjacency.set(v.id, []);
  }

  // Add edges to adjacency list (skip edges referencing non-existent vertices)
  for (const edge of structure.edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  // DFS from each unvisited vertex
  function dfs(nodeId: string): boolean {
    const color = visited.get(nodeId);
    if (color === 'gray') {
      // Back edge: cycle detected
      return true;
    }
    if (color === 'black') {
      // Already processed
      return false;
    }

    // Mark as in-progress
    visited.set(nodeId, 'gray');

    // Visit all neighbors
    for (const neighbor of adjacency.get(nodeId) || []) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    // Mark as done
    visited.set(nodeId, 'black');
    return false;
  }

  // Run DFS from each unvisited vertex
  for (const vertexId of structure.vertices.map(v => v.id)) {
    if (visited.get(vertexId) === 'white') {
      if (dfs(vertexId)) {
        return true;
      }
    }
  }

  return false;
}

export function builderGate(timeline: TimelineIR, structure: Structure): GateResult {
  const failures: string[] = [];
  const vertexMap = new Map(structure.vertices.map(v => [v.id, v]));

  // Build reveal-end-frame map: which frame each node/edge finishes revealing
  const revealEndFrames = new Map<string, number>();
  const seenReveals = new Set<string>();
  const revealEventsByTarget = new Map<string, TimelineEvent>();

  // First pass: collect all frame info and check frame validity, duplicates
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

    // Check for duplicate reveals
    if (event.kind === 'reveal') {
      if (seenReveals.has(event.target)) {
        failures.push(`Vertex '${event.target}' revealed more than once`);
      }
      seenReveals.add(event.target);
      revealEndFrames.set(event.target, event.endF);
      revealEventsByTarget.set(event.target, event);
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

  // Third pass: check partial-order constraints (topological ordering)
  // Partial-order is a DAG-class property: only enforce it for acyclic structures.
  // For cyclic graphs, the planner already uses visual order and other invariants still apply.
  if (!hasCycle(structure)) {
    for (const edge of structure.edges) {
      const sourceEvent = revealEventsByTarget.get(edge.source);
      const targetEvent = revealEventsByTarget.get(edge.target);

      if (sourceEvent && targetEvent) {
        // Source must start revealing before target
        if (sourceEvent.startF >= targetEvent.startF) {
          failures.push(`Partial order violation: '${edge.source}' (source, startF=${sourceEvent.startF}) must be revealed before '${edge.target}' (target, startF=${targetEvent.startF})`);
        }
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
