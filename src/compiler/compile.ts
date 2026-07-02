import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, cl } from '@lottiefiles/last-builder'
import type { TimelineIR, TimelineEventReveal } from '../types/timeline.js'
import { rootCanvasAsm, keyframe, staticVal, staticMulti } from './primitives.js'
import type { LottieJSON } from '../types/compiler.js'

/**
 * buildRevealLayer: constructs a reveal-event shape layer with animated opacity
 * @param event the reveal event (carries startF, endF, x, y, w, h)
 * @param layerIndex the layer's index
 * @param totalFrames from timeline (needed for layer ip/op)
 */
function buildRevealLayer(
  event: TimelineEventReveal,
  layerIndex: number,
  totalFrames: number
): any {
  // animated opacity 0 -> 100 over [startF, endF]
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(event.startF, 0),
      keyframe(event.endF, 100),
    ])),
  ]))

  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children', [
    opacity,
    staticVal('r', 'rotation-clockwise', 0),
    staticMulti('p', 'translation', 'animated-position-static', [event.x, event.y, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0, 0]),
    staticMulti('s', 'layer-transform-scale', 'animated-multidimensional-static', [100, 100, 100]),
  ]))

  const rect = ob('shape-rectangle', [
    at('ty', T.string.shapeType, pt('rc')),
    at('d', 'shape-direction-clockwise', pt(1)),
    staticMulti('s', 'shape-rectangle-size', 'animated-multidimensional-static', [event.w, event.h]),
    staticMulti('p', 'animated-position-prop', 'animated-position-static', [0, 0]),
    staticVal('r', 'rounded', 0),
  ])

  const fill = ob('shape-fill', [
    at('ty', T.string.shapeType, pt('fl')),
    el('c', 'shape-fill-color', ob('animated-color-static', [
      at('a', T.intBoolean.animated, pt(0)),
      cl('k', 'color-rgba', ar('static-values-children', [pt(0.2), pt(0.2), pt(0.2), pt(1)])),
    ])),
    staticVal('o', 'shape-fill-opacity', 100),
  ])

  const trShape = ob('shape-transform', [
    at('ty', T.string.shapeType, pt('tr')),
    staticMulti('p', 'animated-position-prop', 'animated-position-static', [0, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0]),
    staticMulti('s', 'layer-transform-scale', 'animated-multidimensional-static', [100, 100]),
    staticVal('r', 'rotation-clockwise', 0),
    staticVal('o', 'shape-fill-opacity', 100),
  ])

  const group = ob('shape-group', [
    at('ty', T.string.shapeType, pt('gr')),
    cl('it', T.collection.shapeList, ar(T.array.shapeListChildren, [rect, fill, trShape])),
  ])

  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [group]))

  // NOTE: the per-layer ip/op/st/bm are REQUIRED for the layer to render.
  return ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    at('nm', 'name', pt('n')),
    at('sr', 'time-stretch', pt(1)),
    transform,
    at('ao', 'auto-orient', pt(0)),
    shapes,
    at('ip', T.number.inPoint, pt(0)),
    at('op', T.number.outPoint, pt(totalFrames)),
    at('st', 'start-time', pt(0)),
    at('bm', 'blend-mode', pt(0)),
  ])
}

export function compile(timeline: TimelineIR): LottieJSON {
  const layers: any[] = []
  let layerIndex = 1

  // Walk timeline events; process reveal events
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const layer = buildRevealLayer(event, layerIndex, timeline.totalFrames)
      layers.push(layer)
      layerIndex++
    }
    // Other event types (flow, highlight) handled in later tasks
  })

  return rootCanvasAsm(timeline, layers)
}
