import { createRequire } from 'node:module';
import { Structure, Vertex, Edge } from '../types/structure.js';
import { validateStructure } from '../validate.js';

// jsdom is loaded lazily on the first parseMxGraph() call — NOT at module load —
// so that importing this module (and the library root that re-exports
// parseMxGraph) has no side effects and does not pull jsdom into the graph.
// jsdom is CommonJS, so a synchronous createRequire keeps parseMxGraph's
// synchronous signature intact. The DOMParser constructor is cached after the
// first call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _DOMParser: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDOMParser(): any {
  if (!_DOMParser) {
    const require = createRequire(import.meta.url);
    const { JSDOM } = require('jsdom');
    _DOMParser = new JSDOM('').window.DOMParser;
  }
  return _DOMParser;
}

/**
 * Parse mxGraph XML (figure-canvas format) into canonical Structure IR.
 *
 * Converts mxGraph XML elements:
 * - <mxCell vertex="1"> with child <mxGeometry x/y/width/height> → Vertex
 * - <mxCell edge="1" source= target=> → Edge
 *
 * All parsed Vertices and Edges are validated by validateStructure:
 * - Each vertex MUST have complete numeric x/y/w/h (w, h > 0)
 * - Each edge's source/target MUST reference existing vertex ids
 * - Duplicate ids are rejected
 *
 * @param xml - mxGraph XML string
 * @returns Structure { vertices, edges } after validation
 * @throws Error if XML is malformed
 * @throws StructureError if validation fails (missing geometry, dangling edges, etc)
 */
export function parseMxGraph(xml: string): Structure {
  // Parse XML using DOMParser (jsdom loaded lazily on first use)
  const DOMParser = getDOMParser();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  // Check for parse errors
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid XML');
  }

  const vertices: Vertex[] = [];
  const edges: Edge[] = [];

  // Find all mxCell elements
  const cells = doc.querySelectorAll('mxCell');

  // First pass: extract vertices (cells with vertex="1" attribute and mxGeometry child)
  // Structural cells (id="0" or id="1", or parent="0") are skipped; real nodes are processed.
  for (const cell of cells) {
    const isVertex = cell.getAttribute('vertex') === '1';
    if (isVertex) {
      const id = cell.getAttribute('id');
      const parent = cell.getAttribute('parent');

      // Skip structural root cells: id="0", id="1", or any cell with parent="0"
      if (id === '0' || id === '1' || parent === '0') {
        continue;
      }

      const label = cell.getAttribute('value') || '';
      const geometry = cell.querySelector('mxGeometry');

      // Real vertex cells must have geometry; throw loudly if missing
      if (!geometry) {
        throw new Error(`mxGraph vertex '${id}' has no geometry`);
      }

      if (id) {
        const x = parseFloat(geometry.getAttribute('x') || '0');
        const y = parseFloat(geometry.getAttribute('y') || '0');
        const w = parseFloat(geometry.getAttribute('width') || '0');
        const h = parseFloat(geometry.getAttribute('height') || '0');

        vertices.push({ id, label, x, y, w, h });
      }
    }
  }

  // Second pass: extract edges (cells with edge="1" attribute)
  for (const cell of cells) {
    const isEdge = cell.getAttribute('edge') === '1';
    if (isEdge) {
      const id = cell.getAttribute('id');
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      const label = cell.getAttribute('value') || '';

      // Real edge cells must have id, source, and target; throw loudly if
      // missing instead of silently dropping the edge (consistent with the
      // "mxGraph vertex has no geometry" handling above).
      if (!id || !source || !target) {
        throw new Error(`mxGraph edge '${id}' is missing source or target`);
      }

      edges.push({ id, source, target, label });
    }
  }

  return validateStructure({ vertices, edges });
}
