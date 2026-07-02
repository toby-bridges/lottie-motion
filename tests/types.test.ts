import { describe, it, expect } from 'vitest';
import type { Vertex, Edge, Structure } from '../src/types/structure.js';
import type { TimelineEvent, TimelineIR } from '../src/types/timeline.js';
import { validateStructure, StructureError } from '../src/validate.js';

describe('Structure IR types', () => {
  it('should compile Vertex type', () => {
    const vertex: Vertex = {
      id: 'node-1',
      label: 'Auth Service',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    };
    expect(vertex.id).toBe('node-1');
  });

  it('should compile Edge type', () => {
    const edge: Edge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      label: 'calls',
    };
    expect(edge.source).toBe('node-1');
  });

  it('should compile Structure type', () => {
    const structure: Structure = {
      vertices: [
        { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
        { id: 'b', label: 'B', x: 100, y: 0, w: 50, h: 50 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: 'link' },
      ],
    };
    expect(structure.vertices).toHaveLength(2);
  });
});

describe('Timeline IR types', () => {
  it('should compile TimelineEvent reveal variant', () => {
    const event: TimelineEvent = {
      kind: 'reveal',
      target: 'node-1',
      startF: 0,
      endF: 12,
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    };
    expect(event.kind).toBe('reveal');
  });

  it('should compile TimelineEvent flow variant', () => {
    const event: TimelineEvent = {
      kind: 'flow',
      target: 'edge-1',
      startF: 15,
      endF: 25,
      from: 'node-1',
      to: 'node-2',
    };
    expect(event.kind).toBe('flow');
  });

  it('should compile TimelineEvent highlight variant', () => {
    const event: TimelineEvent = {
      kind: 'highlight',
      target: 'node-1',
      startF: 30,
      endF: 35,
    };
    expect(event.kind).toBe('highlight');
  });

  it('should compile TimelineIR type', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 800,
      height: 600,
      totalFrames: 60,
      events: [
        {
          kind: 'reveal',
          target: 'n1',
          startF: 0,
          endF: 12,
          x: 0,
          y: 0,
          w: 50,
          h: 50,
        },
      ],
    };
    expect(timeline.fps).toBe(30);
  });
});

describe('validateStructure', () => {
  it('should validate a well-formed Structure', () => {
    const input = {
      vertices: [
        { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
        { id: 'b', label: 'B', x: 100, y: 0, w: 50, h: 50 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: 'link' },
      ],
    };
    const result = validateStructure(input);
    expect(result.vertices).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('should reject non-object input', () => {
    expect(() => validateStructure(null)).toThrow(StructureError);
    expect(() => validateStructure('string')).toThrow(StructureError);
  });

  it('should reject missing vertices array', () => {
    expect(() => validateStructure({ edges: [] })).toThrow(/Structure\.vertices must be an array/);
  });

  it('should reject vertex with missing geometry', () => {
    expect(() =>
      validateStructure({
        vertices: [{ id: 'a', label: 'A', x: 0, y: 0, w: 50 }],
        edges: [],
      })
    ).toThrow(/missing or invalid height/);
  });

  it('should reject edge with dangling source', () => {
    expect(() =>
      validateStructure({
        vertices: [{ id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 }],
        edges: [{ id: 'e1', source: 'nonexistent', target: 'a', label: 'link' }],
      })
    ).toThrow(/does not reference an existing vertex/);
  });

  it('should reject duplicate vertex ids', () => {
    expect(() =>
      validateStructure({
        vertices: [
          { id: 'a', label: 'A', x: 0, y: 0, w: 50, h: 50 },
          { id: 'a', label: 'A2', x: 100, y: 0, w: 50, h: 50 },
        ],
        edges: [],
      })
    ).toThrow(/Duplicate vertex id/);
  });
});
