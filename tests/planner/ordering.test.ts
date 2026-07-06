import { describe, it, expect } from 'vitest';
import { orderVertices } from '../../src/planner/ordering.js';
import { fixture3NodeChain, fixtureDiamondDAG, fixtureCyclicGraph } from './fixtures.js';

describe('planner/ordering', () => {
  it('should topologically sort 3-node chain (DAG)', () => {
    const result = orderVertices(fixture3NodeChain.input);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should topologically sort diamond DAG', () => {
    const result = orderVertices(fixtureDiamondDAG.input);
    expect(result[0]).toBe('A');
    expect(result[3]).toBe('D');
    expect(result.slice(1, 3).sort()).toEqual(['B', 'C']);
  });

  it('should fall back to visual order (y asc, x asc) for cyclic graph', () => {
    const result = orderVertices(fixtureCyclicGraph.input);
    expect(result).toEqual(['A', 'B', 'C']);
  });
});
