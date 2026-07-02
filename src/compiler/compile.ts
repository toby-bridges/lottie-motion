import type { TimelineIR } from '../types/timeline.js'
import { rootCanvasAsm } from './primitives.js'
import type { LottieJSON } from '../types/compiler.js'

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []

  // Walk timeline events; for each event, append a layer.
  // For v0.1, just assemble the root with empty layers.
  // reveal/flow/highlight event types will be handled in later tasks.

  return rootCanvasAsm(timeline, layers)
}
