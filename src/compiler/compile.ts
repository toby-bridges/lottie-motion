import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, cl } from '@lottiefiles/last-builder'
import type { TimelineIR, TimelineEventReveal, TimelineEventFlow } from '../types/timeline.js'
import { rootCanvasAsm, keyframe, staticVal, staticMulti } from './primitives.js'
import type { LottieJSON } from '../types/compiler.js'

/**
 * bezierPoint helper: wraps a [x, y] point into a nested bezier vertex array
 */
function bezierPoint(xy: [number, number]) {
  return ar('bezier-vertices', [pt(xy[0]), pt(xy[1])])
}

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

/**
 * buildFlowLayer: constructs a flow-event edge layer with animated trim-path
 * @param event the flow event (carries startF, endF, from, to)
 * @param fromBox source node geometry
 * @param toBox target node geometry
 * @param layerIndex the layer's index
 * @param totalFrames from timeline (needed for layer ip/op)
 */
function buildFlowLayer(
  event: TimelineEventFlow,
  fromBox: { x: number; y: number; w: number; h: number },
  toBox: { x: number; y: number; w: number; h: number },
  layerIndex: number,
  totalFrames: number
): any {
  const fromC: [number, number] = [fromBox.x + fromBox.w / 2, fromBox.y + fromBox.h / 2]
  const toC: [number, number] = [toBox.x + toBox.w / 2, toBox.y + toBox.h / 2]

  const bezier = el('k', 'animated-shape-bezier', ob('bezier', [
    at('c', 'bezier-closed', pt(0)),
    cl('v', 'bezier-vertices', ar('bezier-vertices-children', [bezierPoint(fromC), bezierPoint(toC)])),
    cl('i', 'bezier-in-tangents', ar('bezier-in-tangents-children', [
      ar('bezier-in-tangents', [pt(0), pt(0)]),
      ar('bezier-in-tangents', [pt(0), pt(0)]),
    ])),
    cl('o', 'bezier-out-tangents', ar('bezier-out-tangents-children', [
      ar('bezier-out-tangents', [pt(0), pt(0)]),
      ar('bezier-out-tangents', [pt(0), pt(0)]),
    ])),
  ]))

  const path = ob('shape-path', [
    at('ty', T.string.shapeType, pt('sh')),
    at('ind', 'shape-path-index', pt(0)),
    el('ks', 'animated-shape-prop', ob('animated-shape-static', [
      at('a', T.intBoolean.animated, pt(0)),
      bezier,
    ])),
  ])

  const stroke = ob('shape-stroke', [
    at('ty', T.string.shapeType, pt('st')),
    staticMulti('c', 'shape-stroke-color', 'animated-multidimensional-static', [0, 0, 0, 1]),
    staticVal('o', 'stroke-opacity', 100),
    staticVal('w', 'stroke-width', 4),
    at('lc', 'line-cap-round', pt(2)),
    at('lj', 'line-join-round', pt(2)),
    at('bm', 'blend-mode-normal', pt(0)),
  ])

  const trim = ob('shape-trim', [
    at('ty', T.string.shapeType, pt('tm')),
    el('s', 'shape-trim-start', ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(1)),
      cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
        keyframe(event.startF, 0),
        keyframe(event.endF, 100),
      ])),
    ])),
    staticVal('e', 'shape-trim-end', 100),
    staticVal('o', 'shape-trim-offset', 0),
    at('m', 'trim-multiple-shapes-simultaneously', pt(1)),
  ])

  const tr = ob('shape-transform', [
    at('ty', T.string.shapeType, pt('tr')),
    staticMulti('p', 'translation', 'animated-position-static', [0, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0]),
    staticMulti('s', 'shape-transform-scale', 'animated-multidimensional-static', [100, 100]),
    staticVal('r', 'rotation-clockwise', 0),
    staticVal('o', 'shape-trim-offset', 100),
  ])

  const group = ob('shape-group', [
    at('ty', T.string.shapeType, pt('gr')),
    cl('it', T.collection.shapeList, ar(T.array.shapeListChildren, [path, stroke, trim, tr])),
  ])
  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [group]))

  const opacity = el('o', T.element.transformOpacity, ob('animated-value-static', [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', 'static-value', pt(100)),
  ]))
  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children', [
    opacity,
    staticVal('r', 'rotation-clockwise', 0),
    staticMulti('p', 'translation', 'animated-position-static', [0, 0, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0, 0]),
    staticMulti('s', 'layer-transform-scale', 'animated-multidimensional-static', [100, 100, 100]),
  ]))

  return ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    at('nm', 'name', pt('e')),
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

  // Build a map of reveal events by target id (for flow event lookups)
  const revealMap = new Map<string, TimelineEventReveal>()

  // Walk timeline events; process reveal events
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const layer = buildRevealLayer(event, layerIndex, timeline.totalFrames)
      layers.push(layer)
      revealMap.set(event.target, event)
      layerIndex++
    }
  })

  // Walk timeline events; process flow events
  timeline.events.forEach(event => {
    if (event.kind === 'flow') {
      const fromEvent = revealMap.get(event.from)
      const toEvent = revealMap.get(event.to)

      if (!fromEvent || !toEvent) {
        throw new Error(`Flow edge ${event.target}: source/target nodes not in timeline`)
      }

      const fromBox = { x: fromEvent.x, y: fromEvent.y, w: fromEvent.w, h: fromEvent.h }
      const toBox = { x: toEvent.x, y: toEvent.y, w: toEvent.w, h: toEvent.h }

      const layer = buildFlowLayer(event, fromBox, toBox, layerIndex, timeline.totalFrames)
      layers.push(layer)
      layerIndex++
    }
  })

  return rootCanvasAsm(timeline, layers)
}
