import { JSDOM } from 'jsdom';
import { Structure, Vertex, Edge } from '../types/structure.js';

const { DOMParser } = new JSDOM('').window;

export function parseMxGraph(xml: string): Structure {
  // Parse XML using DOMParser
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
  for (const cell of cells) {
    const isVertex = cell.getAttribute('vertex') === '1';
    if (isVertex) {
      const id = cell.getAttribute('id');
      const label = cell.getAttribute('value') || '';
      const geometry = cell.querySelector('mxGeometry');

      if (id && geometry) {
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

      if (id && source && target) {
        edges.push({ id, source, target, label });
      }
    }
  }

  return { vertices, edges };
}
