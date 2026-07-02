import { describe, it, expect } from 'vitest'
import { compile } from '../../src/compiler/compile.js'
import type { TimelineIR } from '../../src/types/timeline.js'

describe('highlight orchestration', () => {
  it('applies scale pulse to reveal layer via highlight event', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 150,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 100,
          w: 120,
          h: 60,
        },
        {
          kind: 'highlight',
          target: 'node-1',
          startF: 90,
          endF: 120,
        },
      ],
    }

    const result = compile(timeline)

    expect(result.layers.length).toBe(1) // 1 reveal layer (highlight modifies it in-place)
    const layer = result.layers[0]
    expect(layer.ks.s).toBeDefined() // scale element
    expect(layer.ks.s.a).toBe(1) // animated
    expect(layer.ks.s.k.length).toBe(3) // 3 keyframes (start, mid, end)

    // Scale keyframe values are MULTIDIMENSIONAL vectors
    expect(layer.ks.s.k[0]).toEqual({ t: 90, s: [100, 100, 100] })
    expect(layer.ks.s.k[1]).toEqual({ t: 105, s: [105, 105, 105] }) // midpoint of 90-120
    expect(layer.ks.s.k[2]).toEqual({ t: 120, s: [100, 100, 100] })

    // Opacity should still be intact (fadeIn)
    expect(layer.ks.o.a).toBe(1)
    expect(layer.ks.o.k.length).toBe(2)
    expect(layer.ks.o.k[0]).toEqual({ t: 0, s: [0] })
    expect(layer.ks.o.k[1]).toEqual({ t: 30, s: [100] })
  })

  it('keeps static scale for reveal without highlight', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [
        {
          kind: 'reveal',
          target: 'node-2',
          startF: 0,
          endF: 30,
          x: 50,
          y: 100,
          w: 120,
          h: 60,
        },
      ],
    }

    const result = compile(timeline)
    const layer = result.layers[0]

    // Without highlight, scale should be STATIC (a === 0)
    expect(layer.ks.s).toBeDefined()
    expect(layer.ks.s.a).toBe(0) // static, not animated
  })
})

describe('end-to-end orchestration', () => {
  it('orchestrates reveal + flow + highlight events into complete animation', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 150,
      events: [
        {
          kind: 'reveal',
          target: 'node-1',
          startF: 0,
          endF: 30,
          x: 50,
          y: 50,
          w: 80,
          h: 60,
        },
        {
          kind: 'reveal',
          target: 'node-2',
          startF: 40,
          endF: 70,
          x: 150,
          y: 150,
          w: 80,
          h: 60,
        },
        {
          kind: 'flow',
          target: 'edge-1',
          startF: 80,
          endF: 110,
          from: 'node-1',
          to: 'node-2',
        },
        {
          kind: 'highlight',
          target: 'node-1',
          startF: 120,
          endF: 150,
        },
      ],
    }

    const result = compile(timeline)

    // Verify structure
    expect(result.v).toBe('5.9.0')
    expect(result.fr).toBe(30)
    expect(result.op).toBe(150)
    expect(result.w).toBe(200)
    expect(result.h).toBe(200)

    // Verify layers: node-1, node-2, edge-1
    expect(result.layers.length).toBe(3)

    // node-1: has fadeIn (0→100 opacity over 0-30) and highlight (scale 100→105→100 over 120-150)
    const node1 = result.layers[0]
    expect(node1.ks.o.a).toBe(1)
    expect(node1.ks.o.k[0]).toEqual({ t: 0, s: [0] })
    expect(node1.ks.o.k[1]).toEqual({ t: 30, s: [100] })
    expect(node1.ks.s).toBeDefined()
    expect(node1.ks.s.a).toBe(1) // animated
    expect(node1.ks.s.k[0]).toEqual({ t: 120, s: [100, 100, 100] })
    expect(node1.ks.s.k[1]).toEqual({ t: 135, s: [105, 105, 105] }) // midpoint
    expect(node1.ks.s.k[2]).toEqual({ t: 150, s: [100, 100, 100] })

    // node-2: has fadeIn (0→100 opacity over 40-70), no highlight
    const node2 = result.layers[1]
    expect(node2.ks.o.k[0]).toEqual({ t: 40, s: [0] })
    expect(node2.ks.o.k[1]).toEqual({ t: 70, s: [100] })
    expect(node2.ks.s.a).toBe(0) // static scale (no highlight)

    // edge-1: has path + stroke + trim-path (0→100 over 80-110) inside gr group
    const edge1 = result.layers[2]
    expect(edge1.shapes).toBeDefined()
    const group = edge1.shapes[0]
    expect(group.ty).toBe('gr')
    const trimPathShape = group.it.find((s: any) => s.ty === 'tm')
    expect(trimPathShape).toBeDefined()
    expect(trimPathShape.s.k[0]).toEqual({ t: 80, s: [0] })
    expect(trimPathShape.s.k[1]).toEqual({ t: 110, s: [100] })
  })
})
