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
    // keyframes carry i/o easing handles (required by the canvas renderer),
    // so assert on t/s rather than exact object equality
    expect(layer.ks.o.k[0].t).toBe(0)
    expect(layer.ks.o.k[0].s).toEqual([0])
    expect(layer.ks.o.k[1].t).toBe(30)
    expect(layer.ks.o.k[1].s).toEqual([100])
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

describe('label glyph orchestration', () => {
  const revealWithLabel = {
    kind: 'reveal' as const,
    target: 'node-1',
    startF: 0,
    endF: 30,
    x: 50,
    y: 100,
    w: 120,
    h: 60,
    label: 'Auth',
  }
  const base = (events: TimelineIR['events']): TimelineIR => ({
    fps: 30,
    width: 200,
    height: 200,
    totalFrames: 60,
    events,
  })

  it('appends a glyph shape group to the reveal layer when label is non-empty', () => {
    const result = compile(base([revealWithLabel]))

    expect(result.layers.length).toBe(1) // glyphs live IN the reveal layer
    const layer = result.layers[0]
    expect(layer.shapes.length).toBe(2) // glyph group + rect group

    // glyph group comes FIRST: earlier shape items draw on top, and the
    // opaque rect would otherwise hide the glyphs
    const glyphGroup = layer.shapes[0]
    expect(glyphGroup.ty).toBe('gr')
    // at least one bezier path per contour, plus a white fill
    const paths = glyphGroup.it.filter((s: any) => s.ty === 'sh')
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p.ks.k.c).toBe(true) // glyph contours are closed
    }
    const fill = glyphGroup.it.find((s: any) => s.ty === 'fl')
    expect(fill).toBeDefined()
    expect(fill.c.k).toEqual([1, 1, 1, 1]) // white on the dark node fill
  })

  it('adds no glyph group when label is empty, missing, or whitespace', () => {
    for (const label of [undefined, '', '   ']) {
      const result = compile(base([{ ...revealWithLabel, label }]))
      expect(result.layers[0].shapes.length).toBe(1) // rect group only
    }
  })

  it('is deterministic: same timeline with labels → identical Lottie JSON', () => {
    const a = compile(base([revealWithLabel]))
    const b = compile(base([revealWithLabel]))
    expect(a).toEqual(b)
  })
})

describe('flow event orchestration', () => {
  it('translates flow event to edge layer with trim-path animation', () => {
    const timeline: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 120,
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
          startF: 30,
          endF: 60,
          x: 200,
          y: 300,
          w: 100,
          h: 50,
        },
        {
          kind: 'flow',
          target: 'edge-1',
          startF: 60,
          endF: 90,
          from: 'node-1',
          to: 'node-2',
        },
      ],
    }

    const result = compile(timeline)

    expect(result.layers.length).toBe(3) // 2 reveals + 1 flow
    const flowLayer = result.layers[2]
    expect(flowLayer.ty).toBe(4) // shape layer
    expect(flowLayer.shapes).toBeDefined()
    expect(flowLayer.shapes.length).toBeGreaterThan(0)

    // Shapes are wrapped in a group
    const group = flowLayer.shapes[0]
    expect(group.ty).toBe('gr') // shape group
    expect(group.it).toBeDefined()

    // Find trim path inside the group
    const trim = group.it.find((s: any) => s.ty === 'tm')
    expect(trim).toBeDefined()
    // trim END animates 0→100 (line draws itself); start stays 0
    expect(trim.s.a).toBe(0)
    expect(trim.s.k).toBe(0)
    expect(trim.e.a).toBe(1) // animated
    expect(trim.e.k.length).toBe(2)
    expect(trim.e.k[0].t).toBe(60)
    expect(trim.e.k[0].s).toEqual([0])
    expect(trim.e.k[1].t).toBe(90)
    expect(trim.e.k[1].s).toEqual([100])

    // Path vertices should be box centers
    // node-1 center: [50 + 120/2, 100 + 60/2] = [110, 130]
    // node-2 center: [200 + 100/2, 300 + 50/2] = [250, 325]
    const path = group.it.find((s: any) => s.ty === 'sh')
    expect(path).toBeDefined()
    expect(path.ks.k.v).toEqual([[110, 130], [250, 325]])

    // Layer should have proper ip/op
    expect(flowLayer.ip).toBe(0)
    expect(flowLayer.op).toBe(120)
  })
})
