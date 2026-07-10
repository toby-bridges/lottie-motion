import { describe, it, expect } from 'vitest';
import { plan } from '../../src/planner/plan.js';
import { fixture3NodeChain, fixtureDiamondDAG, fixtureCyclicGraph } from './fixtures.js';

/**
 * Timeline IR golden files (design: layered-primitives-and-planner.md).
 *
 * One snapshot per canonical fixture pins all three determinism properties at
 * once: reveal ORDER (topological / visual fallback), TIME (absolute frame
 * numbers — an implicit cursor or call-order dependence drifts them), and
 * SPACE (reveal coordinates must stay verbatim input geometry — a layer that
 * quietly nudges a coordinate diverges from the input here).
 *
 * Boundary (per design): a golden file proves "same as last time", NOT
 * "correct". The first snapshot was human-reviewed against the scheduling
 * rules (revealDur=12, stagger=6; flow after both endpoints; closing
 * highlight on sinks; canvas = bbox + padding with offset). Exact-correctness
 * anchors live in plan.test.ts / scheduling.test.ts; this file is pure
 * change detection.
 */
describe('Timeline IR golden files (change detection)', () => {
  it('3-node chain timeline matches golden snapshot', () => {
    expect(plan(fixture3NodeChain.input)).toMatchSnapshot();
  });

  it('diamond DAG timeline matches golden snapshot', () => {
    expect(plan(fixtureDiamondDAG.input)).toMatchSnapshot();
  });

  it('cyclic graph timeline (visual-order fallback) matches golden snapshot', () => {
    expect(plan(fixtureCyclicGraph.input)).toMatchSnapshot();
  });
});
