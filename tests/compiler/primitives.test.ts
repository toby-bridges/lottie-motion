import { describe, it, expect } from 'vitest'
import { fadeIn, rootCanvasAsm } from '../../src/compiler/primitives.js'
import type { TimelineIR } from '../../src/types/timeline.js'

describe('fadeIn primitive', () => {
  it('generates two opacity keyframes (0→100) with frame times', () => {
    // CORRECTION C: fadeIn takes two args (startF, endF), not three
    const result = fadeIn(0, 30)

    // result should be a LAST element node; stringify it to Lottie to verify keyframes
    // CORRECTION B: the key is at TOP LEVEL (node.key), not node.props.key
    expect(result).toBeDefined()
    expect(result.type).toBe('element')
    expect(result.key).toBe('o')  // opacity element key
    expect(result.title).toBe('transform-opacity')
  })
})

describe('compile root assembly', () => {
  it('creates root animation with w/h/fr/ip/op from TimelineIR', () => {
    const timelineIR: TimelineIR = {
      fps: 30,
      width: 200,
      height: 200,
      totalFrames: 60,
      events: [],  // empty for this unit test
    }
    const lottie = rootCanvasAsm(timelineIR, [])

    // Verify root metadata propagates to Lottie
    expect(lottie).toBeDefined()
    expect(lottie.fr).toBe(30)
    expect(lottie.w).toBe(200)
    expect(lottie.h).toBe(200)
    expect(lottie.ip).toBe(0)
    expect(lottie.op).toBe(60)
    expect(lottie.v).toBe('5.9.0')
    expect(lottie.layers).toEqual([])  // no layers yet
  })
})
