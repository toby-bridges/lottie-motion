import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, cl } from '@lottiefiles/last-builder'
import type { TimelineIR, TimelineEventReveal, TimelineEventFlow, TimelineEventHighlight } from '../types/timeline.js'
import { rootCanvasAsm, keyframe, keyframeVec, staticVal, staticMulti } from './primitives.js'
import { labelToContours, GlyphContour } from './labels.js'
import type { LottieJSON } from '../types/compiler.js'
import type { ObjectTitle } from '@lottiefiles/last'

/**
 * bezierPoint helper: wraps a [x, y] point into a nested bezier vertex array
 */
function bezierPoint(xy: [number, number]) {
  return ar('bezier-vertices', [pt(xy[0]), pt(xy[1])])
}

/**
 * scaleElement: builds a scale transform element (static or animated pulse)
 * @param highlightEvent optional; if present, creates animated scale pulse (100%→105%→100%)
 */
function scaleElement(highlightEvent?: TimelineEventHighlight) {
  if (!highlightEvent) {
    // Static scale (unchanged Task 8 behavior)
    return staticMulti('s', 'layer-transform-scale', 'animated-multidimensional-static', [100, 100, 100])
  }

  // Animated scale pulse — keyframe values are multidimensional [sx,sy,sz]
  const midF = Math.floor((highlightEvent.startF + highlightEvent.endF) / 2)
  return el('s', 'layer-transform-scale', ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframeVec(highlightEvent.startF, [100, 100, 100]),
      keyframeVec(midF, [105, 105, 105]),
      keyframeVec(highlightEvent.endF, [100, 100, 100]),
    ])),
  ]))
}

/**
 * buildGlyphPath: one closed glyph contour → a static 'sh' bezier shape.
 */
function buildGlyphPath(contour: GlyphContour, ind: number) {
  const wrap = (title: string, pts: [number, number][]) =>
    cl(title[0] as any, `bezier-${title}` as any, ar(`bezier-${title}-children` as any,
      pts.map((p) => ar(`bezier-${title}` as any, [pt(p[0]), pt(p[1])]))))

  const bezier = el('k', 'animated-shape-bezier', ob('bezier', [
    at('c', 'bezier-closed', pt(true)),
    cl('v', 'bezier-vertices', ar('bezier-vertices-children', contour.v.map((p) => bezierPoint(p)))),
    wrap('in-tangents', contour.i),
    wrap('out-tangents', contour.o),
  ]))

  return ob('shape-path', [
    at('ty', T.string.shapeType, pt('sh')),
    at('ind', 'shape-path-index', pt(ind)),
    el('ks', 'animated-shape-prop', ob('animated-shape-static', [
      at('a', T.intBoolean.animated, pt(0)),
      bezier,
    ])),
  ])
}

/**
 * buildGlyphGroup: a node label → one shape group of filled glyph contours
 * (font-to-path; see labels.ts). Returns null when the label yields nothing.
 * The group lives INSIDE the reveal layer, so it inherits the fade-in opacity
 * and any highlight scale pulse, and is centred on the rect automatically
 * (contours are centred on the origin, the rect's centre in layer space).
 */
function buildGlyphGroup(
  label: string,
  w: number,
  h: number,
  fillColor: [number, number, number, number] = [1, 1, 1, 1]
) {
  const { contours } = labelToContours(label, { w, h })
  if (contours.length === 0) {
    return null
  }

  const paths = contours.map((contour, idx) => buildGlyphPath(contour, idx))

  const fill = ob('shape-fill', [
    at('ty', T.string.shapeType, pt('fl')),
    el('c', 'shape-fill-color', ob('animated-color-static', [
      at('a', T.intBoolean.animated, pt(0)),
      cl('k', 'color-rgba', ar('static-values-children', fillColor.map((ch) => pt(ch)))),
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

  return ob('shape-group', [
    at('ty', T.string.shapeType, pt('gr')),
    cl('it', T.collection.shapeList, ar(T.array.shapeListChildren, [...paths, fill, trShape])),
  ])
}

/**
 * buildRevealLayer: constructs a reveal-event shape layer with animated opacity
 * @param event the reveal event (carries startF, endF, x, y, w, h)
 * @param layerIndex the layer's index
 * @param totalFrames from timeline (needed for layer ip/op)
 * @param highlightEvent optional highlight event (creates animated scale pulse)
 */
function buildRevealLayer(
  event: TimelineEventReveal,
  layerIndex: number,
  totalFrames: number,
  offsetX: number,
  offsetY: number,
  highlightEvent?: TimelineEventHighlight
): any {
  // animated opacity 0 -> 100 over [startF, endF]
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(event.startF, 0),
      keyframe(event.endF, 100),
    ])),
  ]))

  // Scale element: static by default, animated pulse if highlight is present
  const scale = scaleElement(highlightEvent)

  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children' as ObjectTitle, [
    opacity,
    staticVal('r', 'rotation-clockwise', 0),
    // rc rects are centre-anchored (p:[0,0] = box centre), but event.x/y is the
    // TOP-LEFT corner (mxGraph/draw.io convention — see buildFlowLayer below,
    // which already derives edge endpoints as x+w/2, y+h/2). Translating the
    // layer to the raw x/y put the box's CENTRE at the input's top-left corner,
    // shifting every node by (w/2, h/2) and leaving flow edges pointing at empty
    // space just outside the (mis-)rendered box.
    // The +offset shifts the whole diagram into the fitted canvas (see plan.ts);
    // event.x/y themselves stay the frozen input values.
    staticMulti('p', 'translation', 'animated-position-static', [event.x + event.w / 2 + offsetX, event.y + event.h / 2 + offsetY, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0, 0]),
    scale,
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

  // Label glyphs render as a second group in the SAME layer, so they inherit
  // the fade-in and highlight pulse and stay centred on the rect. Shape items
  // earlier in the list draw ON TOP, so glyphs must come before the rect group
  // or the opaque rect hides them.
  const glyphGroup = event.label ? buildGlyphGroup(event.label, event.w, event.h) : null
  const groups = glyphGroup ? [glyphGroup, group] : [group]

  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, groups))

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
  totalFrames: number,
  offsetX: number,
  offsetY: number
): any {
  // Edge endpoints are node centres, shifted by the same canvas offset as the
  // reveal layers (see plan.ts / buildRevealLayer) so edges stay attached.
  const fromC: [number, number] = [fromBox.x + fromBox.w / 2 + offsetX, fromBox.y + fromBox.h / 2 + offsetY]
  const toC: [number, number] = [toBox.x + toBox.w / 2 + offsetX, toBox.y + toBox.h / 2 + offsetY]

  const bezier = el('k', 'animated-shape-bezier', ob('bezier', [
    at('c', 'bezier-closed', pt(false)),
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

  // Trim END animates 0→100 ("the line draws itself", design §4); trim start
  // stays 0. The previous form animated START 0→100 with end=100, which is
  // reversed: the edge was fully visible BEFORE its flow window (first
  // keyframe value holds beforehand) and progressively ERASED during it,
  // vanishing by the final frame.
  const trim = ob('shape-trim', [
    at('ty', T.string.shapeType, pt('tm')),
    staticVal('s', 'shape-trim-start', 0),
    el('e', 'shape-trim-end', ob(T.object.animatedValue, [
      at('a', T.intBoolean.animated, pt(1)),
      cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
        keyframe(event.startF, 0),
        keyframe(event.endF, 100),
      ])),
    ])),
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
  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children' as ObjectTitle, [
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

/**
 * buildEdgeLabelLayer: an edge's label → its OWN glyph shape layer, placed just
 * above the edge midpoint and faded in over the flow window. Returns null when
 * the label is empty/whitespace (no layer emitted).
 *
 * Why a standalone layer and not a group inside buildFlowLayer: the flow layer's
 * trim-path animates over the SAME frame window and would clip any glyph sharing
 * its group. A separate layer keeps the text intact while the line draws itself.
 *
 * Synthetic fit box (deterministic — labelToContours fits the glyphs into it):
 *   w = max(60, 0.5 · edgeLength), h = 24
 * where edgeLength is the Euclidean distance between the two node-box centres.
 * Determinism holds because Math.hypot is IEEE-deterministic and labelToContours
 * rounds every emitted coordinate to 3 decimals.
 *
 * Position: the glyph group is origin-centred (see labels.ts), so the layer
 * translation places its centre 8px ABOVE (smaller y) the edge midpoint — clear
 * of the 4px stroke. Fill is dark grey [0.2,0.2,0.2,1]: edge labels sit on the
 * blank canvas (unlike node labels, which are white inside the dark box).
 */
function buildEdgeLabelLayer(
  event: TimelineEventFlow,
  fromBox: { x: number; y: number; w: number; h: number },
  toBox: { x: number; y: number; w: number; h: number },
  layerIndex: number,
  totalFrames: number,
  offsetX: number,
  offsetY: number
): any | null {
  const label = (event.label ?? '').trim()
  if (label === '') {
    return null
  }

  // Node-box centres, shifted by the same canvas offset as every other layer.
  const fromC: [number, number] = [fromBox.x + fromBox.w / 2 + offsetX, fromBox.y + fromBox.h / 2 + offsetY]
  const toC: [number, number] = [toBox.x + toBox.w / 2 + offsetX, toBox.y + toBox.h / 2 + offsetY]

  const edgeLength = Math.hypot(toC[0] - fromC[0], toC[1] - fromC[1])
  const boxW = Math.max(60, 0.5 * edgeLength)
  const boxH = 24

  const glyphGroup = buildGlyphGroup(label, boxW, boxH, [0.2, 0.2, 0.2, 1])
  if (!glyphGroup) {
    // Defensive: a non-empty trimmed label with a font that yields no contours.
    return null
  }

  const midX = (fromC[0] + toC[0]) / 2
  const midY = (fromC[1] + toC[1]) / 2

  // Fade in over the flow window [startF, endF] — mirrors buildRevealLayer's
  // opacity (keyframe() carries the required i/o easing handles).
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),
    cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(event.startF, 0),
      keyframe(event.endF, 100),
    ])),
  ]))

  const transform = el('ks', T.element.layerTransform, ob('layer-transform-children' as ObjectTitle, [
    opacity,
    staticVal('r', 'rotation-clockwise', 0),
    staticMulti('p', 'translation', 'animated-position-static', [midX, midY - 8, 0]),
    staticMulti('a', 'anchor-point', 'animated-position-static', [0, 0, 0]),
    staticMulti('s', 'layer-transform-scale', 'animated-multidimensional-static', [100, 100, 100]),
  ]))

  const shapes = cl('shapes', T.collection.shapeList, ar(T.array.shapeListChildren, [glyphGroup]))

  return ob(T.object.layerShape, [
    at('ddd', T.intBoolean.layerThreedimensional, pt(0)),
    at('ind', T.number.compositionIndex, pt(layerIndex)),
    at('ty', T.number.layerType, pt(4)),
    at('nm', 'name', pt('el')),
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

  // Canvas offset published by the planner (padding − bboxMin). Absent on
  // hand-built timelines → 0, i.e. the pre-viewport identity translation.
  const offsetX = timeline.offsetX ?? 0
  const offsetY = timeline.offsetY ?? 0

  // Build a map of reveal events by target id (for flow event lookups)
  const revealMap = new Map<string, TimelineEventReveal>()

  // Collect highlights by target id (v0.1: first highlight per target wins)
  const highlightMap = new Map<string, TimelineEventHighlight>()
  timeline.events.forEach(event => {
    if (event.kind === 'highlight' && !highlightMap.has(event.target)) {
      highlightMap.set(event.target, event)
    }
  })

  // Walk timeline events; process reveal events
  timeline.events.forEach(event => {
    if (event.kind === 'reveal') {
      const highlight = highlightMap.get(event.target)
      const layer = buildRevealLayer(event, layerIndex, timeline.totalFrames, offsetX, offsetY, highlight)
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

      const layer = buildFlowLayer(event, fromBox, toBox, layerIndex, timeline.totalFrames, offsetX, offsetY)
      layers.push(layer)
      layerIndex++
    }
  })

  // Walk timeline events; append edge-label glyph layers AFTER all flow layers
  // (array end). Each labelled edge adds one 'el' layer; empty labels add none.
  timeline.events.forEach(event => {
    if (event.kind === 'flow') {
      const fromEvent = revealMap.get(event.from)
      const toEvent = revealMap.get(event.to)

      // Unreachable in practice: the flow loop above already threw if an
      // endpoint was missing. Guard anyway so this pass never dereferences null.
      if (!fromEvent || !toEvent) {
        return
      }

      const fromBox = { x: fromEvent.x, y: fromEvent.y, w: fromEvent.w, h: fromEvent.h }
      const toBox = { x: toEvent.x, y: toEvent.y, w: toEvent.w, h: toEvent.h }

      const labelLayer = buildEdgeLabelLayer(event, fromBox, toBox, layerIndex, timeline.totalFrames, offsetX, offsetY)
      if (labelLayer) {
        layers.push(labelLayer)
        layerIndex++
      }
    }
  })

  return rootCanvasAsm(timeline, layers)
}
