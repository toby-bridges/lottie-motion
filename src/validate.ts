import type { Structure, Vertex, Edge } from './types/structure.js';

export class StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructureError';
    Object.setPrototypeOf(this, StructureError.prototype);
  }
}

/**
 * Validate and narrow the input to a well-formed Structure.
 *
 * Checks:
 * - Each vertex has unique id + complete numeric x/y/w/h (w, h > 0)
 * - Each edge's source/target reference existing vertex ids
 * - No missing geometry, dangling edges, duplicate ids
 *
 * @param input Unknown input to validate
 * @returns Narrowed Structure if valid
 * @throws StructureError if invalid
 */
export function validateStructure(input: unknown): Structure {
  // Type guard: is it an object?
  if (!input || typeof input !== 'object') {
    throw new StructureError('Structure must be an object');
  }

  const obj = input as Record<string, unknown>;

  // Check vertices array exists
  if (!Array.isArray(obj.vertices)) {
    throw new StructureError('Structure.vertices must be an array');
  }

  // Check edges array exists
  if (!Array.isArray(obj.edges)) {
    throw new StructureError('Structure.edges must be an array');
  }

  const vertices = obj.vertices as unknown[];
  const edges = obj.edges as unknown[];

  // Check that structure is not empty (must have at least one vertex)
  if (vertices.length === 0) {
    throw new StructureError('Structure must contain at least one vertex');
  }

  // Track vertex ids for edge validation
  const vertexIds = new Set<string>();

  // Validate each vertex
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!v || typeof v !== 'object') {
      throw new StructureError(`Vertex at index ${i} must be an object`);
    }

    const vertex = v as Record<string, unknown>;

    // Check id
    if (typeof vertex.id !== 'string' || !vertex.id) {
      throw new StructureError(`Vertex at index ${i} must have a non-empty string id`);
    }

    if (vertexIds.has(vertex.id)) {
      throw new StructureError(`Duplicate vertex id: "${vertex.id}"`);
    }
    vertexIds.add(vertex.id);

    // Check label
    if (typeof vertex.label !== 'string') {
      throw new StructureError(`Vertex "${vertex.id}" must have a string label`);
    }

    // Check geometry (all required, all numeric and finite, w/h > 0)
    if (typeof vertex.x !== 'number' || !Number.isFinite(vertex.x)) {
      throw new StructureError(`Vertex "${vertex.id}" has missing or non-finite x coordinate`);
    }
    if (typeof vertex.y !== 'number' || !Number.isFinite(vertex.y)) {
      throw new StructureError(`Vertex "${vertex.id}" has missing or non-finite y coordinate`);
    }
    if (typeof vertex.w !== 'number' || !Number.isFinite(vertex.w)) {
      throw new StructureError(`Vertex "${vertex.id}" has missing or non-finite width`);
    }
    if (typeof vertex.h !== 'number' || !Number.isFinite(vertex.h)) {
      throw new StructureError(`Vertex "${vertex.id}" has missing or non-finite height`);
    }

    if (vertex.w <= 0) {
      throw new StructureError(`Vertex "${vertex.id}" width must be > 0`);
    }
    if (vertex.h <= 0) {
      throw new StructureError(`Vertex "${vertex.id}" height must be > 0`);
    }
  }

  // Validate each edge
  const edgeIds = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || typeof e !== 'object') {
      throw new StructureError(`Edge at index ${i} must be an object`);
    }

    const edge = e as Record<string, unknown>;

    // Check id
    if (typeof edge.id !== 'string' || !edge.id) {
      throw new StructureError(`Edge at index ${i} must have a non-empty string id`);
    }

    if (edgeIds.has(edge.id)) {
      throw new StructureError(`Duplicate edge id: "${edge.id}"`);
    }
    edgeIds.add(edge.id);

    // Check label
    if (typeof edge.label !== 'string') {
      throw new StructureError(`Edge "${edge.id}" must have a string label`);
    }

    // Check connectivity
    if (typeof edge.source !== 'string' || !edge.source) {
      throw new StructureError(`Edge "${edge.id}" must have a non-empty string source`);
    }
    if (typeof edge.target !== 'string' || !edge.target) {
      throw new StructureError(`Edge "${edge.id}" must have a non-empty string target`);
    }

    if (!vertexIds.has(edge.source)) {
      throw new StructureError(`Edge "${edge.id}" source "${edge.source}" does not reference an existing vertex`);
    }
    if (!vertexIds.has(edge.target)) {
      throw new StructureError(`Edge "${edge.id}" target "${edge.target}" does not reference an existing vertex`);
    }
  }

  return {
    vertices: vertices as Vertex[],
    edges: edges as Edge[],
  };
}
