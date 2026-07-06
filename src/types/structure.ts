/**
 * Structure IR types — the canonical input contract.
 *
 * Connectivity is explicit (edge.source/target reference vertex ids).
 * Geometry is explicit (every vertex carries complete x/y/w/h).
 * Neither is inferred; both are frozen upstream (figure-canvas / input).
 */

export interface Vertex {
  /** Unique identifier for this vertex */
  id: string;
  /** Display label for this vertex */
  label: string;
  /** X coordinate (absolute positioning) */
  x: number;
  /** Y coordinate (absolute positioning) */
  y: number;
  /** Width (must be > 0) */
  w: number;
  /** Height (must be > 0) */
  h: number;
}

export interface Edge {
  /** Unique identifier for this edge */
  id: string;
  /** Source vertex id (must reference an existing vertex) */
  source: string;
  /** Target vertex id (must reference an existing vertex) */
  target: string;
  /** Display label for this edge */
  label: string;
}

export interface Structure {
  /** Array of vertices in the diagram */
  vertices: Vertex[];
  /** Array of edges in the diagram */
  edges: Edge[];
}
