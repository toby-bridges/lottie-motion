import { Structure } from '../../src/types/structure.js';
import { TimelineIR } from '../../src/types/timeline.js';

// Fixture 1: 3-node linear chain (A → B → C)
export const fixture3NodeChain = {
  input: {
    vertices: [
      { id: 'A', label: 'Node A', x: 0, y: 0, w: 100, h: 50 },
      { id: 'B', label: 'Node B', x: 120, y: 0, w: 100, h: 50 },
      { id: 'C', label: 'Node C', x: 240, y: 0, w: 100, h: 50 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'flow' },
      { id: 'B-C', source: 'B', target: 'C', label: 'flow' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    // bbox [0,0]..[340,50] (maxBoxDim 100 → padding 40); canvas = bbox + 2·40
    width: 420,
    height: 130,
    totalFrames: 72,
    offsetX: 40,
    offsetY: 40,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 0, y: 0, w: 100, h: 50, label: 'Node A' },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 120, y: 0, w: 100, h: 50, label: 'Node B' },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 240, y: 0, w: 100, h: 50, label: 'Node C' },
      { kind: 'flow' as const, target: 'B-C', startF: 48, endF: 60, from: 'B', to: 'C' },
      { kind: 'highlight' as const, target: 'C', startF: 60, endF: 72 }
    ]
  } as TimelineIR
};

// Fixture 2: Diamond DAG (A → {B, C} → D)
export const fixtureDiamondDAG = {
  input: {
    vertices: [
      { id: 'A', label: 'Root', x: 100, y: 0, w: 80, h: 40 },
      { id: 'B', label: 'Left', x: 0, y: 100, w: 80, h: 40 },
      { id: 'C', label: 'Right', x: 200, y: 100, w: 80, h: 40 },
      { id: 'D', label: 'Sink', x: 100, y: 200, w: 80, h: 40 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'left' },
      { id: 'A-C', source: 'A', target: 'C', label: 'right' },
      { id: 'B-D', source: 'B', target: 'D', label: 'join' },
      { id: 'C-D', source: 'C', target: 'D', label: 'join' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    // bbox [0,0]..[280,240] (maxBoxDim 80 → padding 40); canvas = bbox + 2·40
    width: 360,
    height: 320,
    totalFrames: 90,
    offsetX: 40,
    offsetY: 40,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 100, y: 0, w: 80, h: 40, label: 'Root' },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 0, y: 100, w: 80, h: 40, label: 'Left' },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 200, y: 100, w: 80, h: 40, label: 'Right' },
      { kind: 'flow' as const, target: 'A-C', startF: 48, endF: 60, from: 'A', to: 'C' },
      { kind: 'reveal' as const, target: 'D', startF: 54, endF: 66, x: 100, y: 200, w: 80, h: 40, label: 'Sink' },
      { kind: 'flow' as const, target: 'B-D', startF: 66, endF: 78, from: 'B', to: 'D' },
      { kind: 'flow' as const, target: 'C-D', startF: 66, endF: 78, from: 'C', to: 'D' },
      { kind: 'highlight' as const, target: 'D', startF: 78, endF: 90 }
    ]
  } as TimelineIR
};

// Fixture 3: Cyclic graph (A → B → C → A)
export const fixtureCyclicGraph = {
  input: {
    vertices: [
      { id: 'A', label: 'Node A', x: 0, y: 0, w: 60, h: 60 },
      { id: 'B', label: 'Node B', x: 100, y: 0, w: 60, h: 60 },
      { id: 'C', label: 'Node C', x: 50, y: 100, w: 60, h: 60 }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B', label: 'next' },
      { id: 'B-C', source: 'B', target: 'C', label: 'next' },
      { id: 'C-A', source: 'C', target: 'A', label: 'back' }
    ]
  } as Structure,
  expectedTimeline: {
    fps: 30,
    // bbox [0,0]..[160,160] (maxBoxDim 60 → padding 40); canvas = bbox + 2·40
    width: 240,
    height: 240,
    totalFrames: 72,
    offsetX: 40,
    offsetY: 40,
    events: [
      { kind: 'reveal' as const, target: 'A', startF: 0, endF: 12, x: 0, y: 0, w: 60, h: 60, label: 'Node A' },
      { kind: 'reveal' as const, target: 'B', startF: 18, endF: 30, x: 100, y: 0, w: 60, h: 60, label: 'Node B' },
      { kind: 'flow' as const, target: 'A-B', startF: 30, endF: 42, from: 'A', to: 'B' },
      { kind: 'reveal' as const, target: 'C', startF: 36, endF: 48, x: 50, y: 100, w: 60, h: 60, label: 'Node C' },
      { kind: 'flow' as const, target: 'B-C', startF: 48, endF: 60, from: 'B', to: 'C' },
      { kind: 'flow' as const, target: 'C-A', startF: 48, endF: 60, from: 'C', to: 'A' },
      { kind: 'highlight' as const, target: 'C', startF: 60, endF: 72 }
    ]
  } as TimelineIR
};
