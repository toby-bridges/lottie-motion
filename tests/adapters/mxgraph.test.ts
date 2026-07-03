import { describe, it, expect } from 'vitest';
import { parseMxGraph } from '../../src/adapters/mxgraph.js';
import type { Structure } from '../../src/types/structure.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('mxGraph adapter', () => {
  it('parses simple 3-node chain mxGraph XML to Structure', () => {
    const xmlPath = path.join(__dirname, '../fixtures/simple-chain.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');

    const result: Structure = parseMxGraph(xml);

    // Expect 3 vertices
    expect(result.vertices).toHaveLength(3);

    // Vertex A
    expect(result.vertices[0]).toEqual({
      id: 'nodeA',
      label: 'A',
      x: 10,
      y: 10,
      w: 80,
      h: 60
    });

    // Vertex B
    expect(result.vertices[1]).toEqual({
      id: 'nodeB',
      label: 'B',
      x: 150,
      y: 50,
      w: 80,
      h: 60
    });

    // Vertex C
    expect(result.vertices[2]).toEqual({
      id: 'nodeC',
      label: 'C',
      x: 280,
      y: 80,
      w: 80,
      h: 60
    });

    // Expect 2 edges
    expect(result.edges).toHaveLength(2);

    // Edge A→B
    expect(result.edges[0]).toEqual({
      id: 'edgeAB',
      source: 'nodeA',
      target: 'nodeB',
      label: ''
    });

    // Edge B→C
    expect(result.edges[1]).toEqual({
      id: 'edgeBC',
      source: 'nodeB',
      target: 'nodeC',
      label: ''
    });
  });

  it('throws StructureError when edge references non-existent vertex', () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="10" y="10" width="80" height="60" as="geometry" />
    </mxCell>
    <!-- Edge references non-existent target -->
    <mxCell id="edgeDangling" edge="1" parent="1" source="nodeA" target="nodeX">
      <mxGeometry as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

    expect(() => parseMxGraph(invalidXml)).toThrow();
  });

  it('throws error when vertex has no geometry', () => {
    const xmlNoGeometry = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <!-- Vertex without mxGeometry child (will be skipped during parsing) -->
    <mxCell id="nodeA" value="A" parent="1" vertex="1" />
    <!-- Edge referencing the skipped vertex creates a dangling edge -->
    <mxCell id="edge1" edge="1" parent="1" source="nodeA" target="nodeA">
      <mxGeometry as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

    expect(() => parseMxGraph(xmlNoGeometry)).toThrow();
  });

  it('throws error when vertex has zero or negative dimensions', () => {
    const xmlZeroDim = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" parent="1" vertex="1" />
    <mxCell id="1" parent="0" />
    <mxCell id="nodeA" value="A" parent="1" vertex="1">
      <mxGeometry x="10" y="10" width="0" height="60" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

    expect(() => parseMxGraph(xmlZeroDim)).toThrow();
  });

  it('parses diamond DAG with labeled edges', () => {
    const xmlPath = path.join(__dirname, '../fixtures/diamond-dag.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');

    const result: Structure = parseMxGraph(xml);

    // Expect 4 vertices
    expect(result.vertices).toHaveLength(4);
    expect(result.vertices.map(v => v.id)).toEqual(['nodeA', 'nodeB', 'nodeC', 'nodeD']);

    // Expect 4 edges
    expect(result.edges).toHaveLength(4);

    // Check labeled edges
    const edgeAB = result.edges.find(e => e.id === 'edgeAB');
    expect(edgeAB).toEqual({
      id: 'edgeAB',
      source: 'nodeA',
      target: 'nodeB',
      label: 'left'
    });

    const edgeAC = result.edges.find(e => e.id === 'edgeAC');
    expect(edgeAC).toEqual({
      id: 'edgeAC',
      source: 'nodeA',
      target: 'nodeC',
      label: 'right'
    });
  });

  it('produces Structure ready for planner (e2e)', () => {
    const xmlPath = path.join(__dirname, '../fixtures/simple-chain.mxgraph.xml');
    const xml = fs.readFileSync(xmlPath, 'utf-8');

    const structure: Structure = parseMxGraph(xml);

    // Verify all vertices have complete geometry
    for (const v of structure.vertices) {
      expect(v.id).toBeTruthy();
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.w).toBeGreaterThan(0);
      expect(v.h).toBeGreaterThan(0);
    }

    // Verify all edge endpoints exist
    const vertexIds = new Set(structure.vertices.map(v => v.id));
    for (const e of structure.edges) {
      expect(vertexIds.has(e.source)).toBe(true);
      expect(vertexIds.has(e.target)).toBe(true);
    }

    // Verify no duplicate vertex ids
    const ids = structure.vertices.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
