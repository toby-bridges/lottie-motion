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
});
