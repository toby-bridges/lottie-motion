import { Structure, Vertex } from '../types/structure.js';

/**
 * Order vertices by topological sort (DAG) or visual order fallback (cyclic).
 * Returns a list of vertex IDs in reveal order.
 */
export function orderVertices(structure: Structure): string[] {
  const adjList = buildAdjacencyList(structure);

  // Attempt topological sort with cycle detection
  const sorted = topologicalSort(structure.vertices, adjList);

  if (sorted !== null) {
    return sorted;
  }

  // Fallback: visual order (by y asc, then x asc, stable)
  return visualOrder(structure.vertices);
}

/**
 * Build adjacency list from edges (source → targets).
 */
function buildAdjacencyList(structure: Structure): Map<string, Set<string>> {
  const adjList = new Map<string, Set<string>>();

  // Initialize all vertices
  for (const v of structure.vertices) {
    if (!adjList.has(v.id)) {
      adjList.set(v.id, new Set());
    }
  }

  // Add edges
  for (const e of structure.edges) {
    const targets = adjList.get(e.source);
    if (targets) {
      targets.add(e.target);
    }
  }

  return adjList;
}

/**
 * Kahn's algorithm for topological sort. Returns null if a cycle is detected.
 */
function topologicalSort(
  vertices: Vertex[],
  adjList: Map<string, Set<string>>
): string[] | null {
  const inDegree = new Map<string, number>();

  // Initialize in-degree
  for (const v of vertices) {
    inDegree.set(v.id, 0);
  }

  // Count in-degrees
  for (const [, targets] of adjList) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }

  // Collect vertices with in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    result.push(u);

    const targets = adjList.get(u) || new Set();
    for (const v of targets) {
      const newDegree = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, newDegree);
      if (newDegree === 0) {
        queue.push(v);
      }
    }
  }

  // If we processed all vertices, it's a DAG
  if (result.length === vertices.length) {
    return result;
  }

  // Otherwise, a cycle exists
  return null;
}

/**
 * Visual order: sort by y ascending, then x ascending (stable).
 */
function visualOrder(vertices: Vertex[]): string[] {
  return vertices
    .slice() // non-mutating
    .sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      return a.x - b.x;
    })
    .map((v) => v.id);
}
