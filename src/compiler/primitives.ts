import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, rt, cl } from '@lottiefiles/last-builder'
import { relottie } from '@lottiefiles/relottie'
import stringify from '@lottiefiles/relottie-stringify'
import type { TimelineIR } from '../types/timeline.js'
import type { ObjectTitle, ElementTitle } from '@lottiefiles/last'

// Keyframe helper: { t, s:[value] }
export function keyframe(t: number, s: number) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    cl('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [pt(s)])),
  ])
}

// Easing tangent handle ({ x:[v], y:[v] }) for a keyframe in/out bezier.
function easeHandle(key: 'i' | 'o') {
  const title = (key === 'i' ? 'keyframe-in-tangent' : 'keyframe-out-tangent') as ElementTitle
  return el(key, title, ob('keyframe-bezier-handle' as ObjectTitle, [
    cl('x', 'keyframe-bezier-handle-x-axis' as any, ar('static-values-children' as any, [pt(0.5)])),
    cl('y', 'keyframe-bezier-handle-y-axis' as any, ar('static-values-children' as any, [pt(0.5)])),
  ]))
}

// Keyframe helper for multidimensional values: { t, i, o, s:[a, b, c, ...] }.
// NOTE: multidimensional animated keyframes MUST carry i/o bezier handles or
// lottie-web's canvas renderer silently fails to render the whole layer (1D
// scalar keyframes like opacity/trim tolerate their absence; multidim does not).
export function keyframeVec(t: number, arr: number[]) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    easeHandle('i'),
    easeHandle('o'),
    cl('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, arr.map((n) => pt(n)))),
  ])
}

// Static scalar value (a=0, k=scalar)
export function staticVal(key: string, title: string, v: number) {
  return el(key, title as ElementTitle, ob('animated-value-static' as ObjectTitle, [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', 'static-value', pt(v)),
  ]))
}

// Static vector value (a=0, k=[...])
export function staticMulti(key: string, title: string, objTitle: string, arr: number[]) {
  return el(key, title as ElementTitle, ob(objTitle as ObjectTitle, [
    at('a', T.intBoolean.animated, pt(0)),
    cl('k', 'static-values', ar('static-values-children', arr.map((n) => pt(n)))),
  ]))
}

/**
 * fadeIn primitive: generates an opacity element with two keyframes (0→100)
 * @param startF frame number when opacity = 0
 * @param endF frame number when opacity = 100
 */
export function fadeIn(startF: number, endF: number) {
  const opacity = el('o', T.element.transformOpacity, ob(T.object.animatedValue, [
    at('a', T.intBoolean.animated, pt(1)),  // animated: true
    cl('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
      keyframe(startF, 0),
      keyframe(endF, 100),
    ])),
  ]))
  return opacity
}

/**
 * rootCanvasAsm: assembles the root Lottie JSON with metadata
 * @param timeline TimelineIR containing fps, width, height, totalFrames
 * @param layers the layers array (may be empty for v0.1)
 */
export function rootCanvasAsm(timeline: TimelineIR, layers: any[]) {
  // CORRECTION A: use T.number.inPoint and T.number.outPoint (not ['in-point'] and ['out-point'])
  const root = rt([
    at('v', T.string.version, pt('5.9.0')),
    at('fr', T.number.framerate, pt(timeline.fps)),
    at('ip', T.number.inPoint, pt(0)),
    at('op', T.number.outPoint, pt(timeline.totalFrames)),
    at('w', T.number.width, pt(timeline.width)),
    at('h', T.number.height, pt(timeline.height)),
    cl('layers', T.collection.composition, ar(T.array.composition, layers)),
  ])

  // Stringify LAST AST to Lottie JSON
  const lottie = JSON.parse((relottie().use(stringify) as any).stringify(root))
  return lottie
}
