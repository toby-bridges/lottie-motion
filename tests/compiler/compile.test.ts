import { describe, it, expect } from 'vitest'
import { compile } from '../../src/compiler/compile.js'
import type { TimelineIR } from '../../src/types/timeline.js'

describe('compile()', () => {
  it('accepts TimelineIR and returns Lottie JSON with metadata', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [],
    }

    const result = compile(timeline)

    expect(result).toBeDefined()
    expect(result.v).toBe('5.9.0')
    expect(result.fr).toBe(30)
    expect(result.w).toBe(200)
    expect(result.h).toBe(200)
    expect(result.ip).toBe(0)
    expect(result.op).toBe(60)
    expect(Array.isArray(result.layers)).toBe(true)
  })
})

describe('reveal event orchestration', () => {
  it('translates single reveal event to node layer with fadeIn', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
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
      ],
    }

    const result = compile(timeline)

    expect(result).toBeDefined()
    expect(result.layers).toBeDefined()
    expect(result.layers.length).toBe(1)

    const layer = result.layers[0]
    expect(layer.ty).toBe(4) // shape layer
    // Opacity should have two keyframes (0 at frame 0, 100 at frame 30)
    expect(layer.ks.o.a).toBe(1) // animated
    expect(layer.ks.o.k.length).toBe(2)
    expect(layer.ks.o.k[0]).toEqual({ t: 0, s: [0] })
    expect(layer.ks.o.k[1]).toEqual({ t: 30, s: [100] })
    // Verify render-critical structure
    expect(layer.ip).toBe(0)
    expect(layer.op).toBe(60)
    expect(layer.shapes).toBeDefined()
    expect(layer.shapes.length).toBeGreaterThan(0)
    expect(layer.shapes[0].ty).toBe('gr') // shape group
    expect(layer.shapes[0].it).toBeDefined()
    expect(layer.shapes[0].it.some((s: any) => s.ty === 'rc')).toBe(true) // has rect
  })

  it('translates multiple reveal events to multiple layers with auto-incrementing indices', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
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
          kind: 'reveal',
          target: 'node-2',
          startF: 10,
          endF: 40,
          x: 100,
          y: 150,
          w: 100,
          h: 80,
        },
      ],
    }

    const result = compile(timeline)

    expect(result.layers.length).toBe(2)
    expect(result.layers[0].ind).toBe(1)
    expect(result.layers[1].ind).toBe(2)
  })
})
