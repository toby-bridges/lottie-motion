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
