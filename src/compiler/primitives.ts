import { TITLES as T } from '@lottiefiles/last/titles'
import { el, ob, ar, at, pt, rt, cl } from '@lottiefiles/last-builder'
import { relottie } from '@lottiefiles/relottie'
import stringify from '@lottiefiles/relottie-stringify'
import type { TimelineIR } from '../types/timeline.js'

// Keyframe helper: { t, s:[value] }
export function keyframe(t: number, s: number) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    at('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, [pt(s)])),
  ])
}

// Keyframe helper for multidimensional values: { t, s:[a, b, c, ...] }
export function keyframeVec(t: number, arr: number[]) {
  return ob(T.object.keyframe, [
    at('t', T.number.keyframeTime, pt(t)),
    cl('s', T.collection.keyframeValue, ar(T.array.keyframeValueChildren, arr.map((n) => pt(n)))),
  ])
}

// Static scalar value (a=0, k=scalar)
export function staticVal(key: string, title: string, v: number) {
  return el(key, title, ob('animated-value-static', [
    at('a', T.intBoolean.animated, pt(0)),
    at('k', 'static-value', pt(v)),
  ]))
}

// Static vector value (a=0, k=[...])
export function staticMulti(key: string, title: string, objTitle: string, arr: number[]) {
  return el(key, title, ob(objTitle, [
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
    at('k', T.collection.keyframeList, ar(T.array.keyframeListChildren, [
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
  const lottie = JSON.parse(relottie().use(stringify).stringify(root))
  return lottie
}
