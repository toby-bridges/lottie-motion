# Brought-in Reference: lanshu frame-diff output verification

> Source: `cclank/lanshu-animated-architecture-diagram` (MIT), the friend's repo.
> Local clone: `~/Desktop/code-driven-gifs/references/open-source/lanshu-animated-architecture-diagram/`
> Relevant file: `scripts/render_animated_diagram.py` (`frame_diff_report`, `check_outputs`).

## Why this matters here

A Lottie file can be structurally valid JSON yet animate nothing (e.g. keyframes
all identical, or a property never changes). lanshu solved the analogous problem
for GIFs with a dead-simple, model-free check: **sample frames across the output
and prove adjacent frames actually differ**. lottie-motion should adopt the same
"prove it really moves" discipline as a deterministic quality gate.

## The core idea (`frame_diff_report`)

1. Open the rendered animation. Pick 5 frame indices spread across the timeline:
   `[0, n//4, n//2, 3n//4, n-1]`.
2. For each adjacent pair, compute a pixel difference and count changed pixels.
3. Report `{frames, diffs:[{from,to,changed_pixels}]}`.
4. "Has motion" = **any** adjacent pair has `changed_pixels > 0`.

## The output contract (`check_outputs`)

lanshu validates the final artifact against a spec-derived contract and exits
nonzero on any failure (`--check`). Checks include:

- `gif_exists`, `gif_width`, `gif_height` match the target canvas
- `gif_frames` matches expected frame count
- `gif_fps` — duration_ms equals `int(1000 / expected_fps)`
- **`gif_has_motion`** — the frame-diff check above
- (lanshu-specific extras: excalidraw unique ids, fontFamily==5, files=={}, png dims)

## Translation to lottie-motion (vector, not raster)

The same philosophy, adapted to Lottie:

- **Structural validity**: the emitted JSON validates against the Lottie schema
  (we have a machine-readable schema candidate — see the builder research).
- **"Really moves" check** — two complementary levels:
  - *JSON level (cheap, deterministic):* assert that the intended animated
    properties carry ≥2 distinct keyframes with differing values over the
    timeline. Pure data check, no rendering.
  - *Rendered level (truthful):* render via lottie-web headless (or
    puppeteer/`@lottiefiles/lottie-renderer`) at sampled times, then run
    lanshu's exact frame-diff on the captured frames. Confirms it visually
    animates, not just that the JSON claims to.
- **Canvas/duration/fps contract**: assert `w/h`, `op-ip` (out/in point) frame
  count, and `fr` (frame rate) match the requested spec — the direct analogue of
  lanshu's `gif_width/height/frames/fps` checks.

## Design takeaway

Borrow lanshu's *verification philosophy* (deterministic, model-free, "prove
motion exists, prove the contract holds, exit nonzero on failure"). Do NOT adopt
its Pillow/GIF rendering path — lottie-motion is vector-first. The frame-diff
algorithm itself ports directly once we have sampled rendered frames.
