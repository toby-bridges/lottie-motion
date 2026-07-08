import { describe, it, expect } from 'vitest';
import { scheduleEvents } from '../../src/planner/scheduling.js';
import { fixture3NodeChain, fixtureDiamondDAG } from './fixtures.js';

describe('planner/scheduling', () => {
  it('should generate reveal events with default revealDur=12, stagger=6', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6
    });

    const reveals = events.filter((e) => e.kind === 'reveal');
    expect(reveals).toHaveLength(3);

    expect(reveals[0]).toEqual({
      kind: 'reveal',
      target: 'A',
      startF: 0,
      endF: 12,
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      label: 'Node A'
    });

    expect(reveals[1]).toEqual({
      kind: 'reveal',
      target: 'B',
      startF: 18,
      endF: 30,
      x: 120,
      y: 0,
      w: 100,
      h: 50,
      label: 'Node B'
    });

    expect(reveals[2]).toEqual({
      kind: 'reveal',
      target: 'C',
      startF: 36,
      endF: 48,
      x: 240,
      y: 0,
      w: 100,
      h: 50,
      label: 'Node C'
    });
  });

  it('should generate flow events only after both endpoints are revealed', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6
    });

    const flows = events.filter((e) => e.kind === 'flow');
    expect(flows).toHaveLength(2);

    expect(flows[0]).toEqual({
      kind: 'flow',
      target: 'A-B',
      startF: 30,
      endF: 42,
      from: 'A',
      to: 'B',
      label: 'flow'
    });

    expect(flows[1]).toEqual({
      kind: 'flow',
      target: 'B-C',
      startF: 48,
      endF: 60,
      from: 'B',
      to: 'C',
      label: 'flow'
    });
  });

  it('should copy each edge.label verbatim into its flow event', () => {
    // Distinct labels per edge (diamond DAG: left/right/join/join) prove the
    // copy is per-edge and verbatim, not a shared constant.
    const ordered = ['A', 'B', 'C', 'D'];
    const events = scheduleEvents(fixtureDiamondDAG.input, ordered, {
      revealDur: 12,
      stagger: 6
    });

    const labelByTarget = new Map(
      events
        .filter((e): e is Extract<typeof e, { kind: 'flow' }> => e.kind === 'flow')
        .map((e) => [e.target, e.label])
    );

    expect(labelByTarget.get('A-B')).toBe('left');
    expect(labelByTarget.get('A-C')).toBe('right');
    expect(labelByTarget.get('B-D')).toBe('join');
    expect(labelByTarget.get('C-D')).toBe('join');
  });

  it('should emit events sorted by startF', () => {
    const ordered = ['A', 'B', 'C'];
    const events = scheduleEvents(fixture3NodeChain.input, ordered, {
      revealDur: 12,
      stagger: 6
    });

    for (let i = 1; i < events.length; i++) {
      expect(events[i].startF).toBeGreaterThanOrEqual(events[i - 1].startF);
    }
  });
});
