import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // jsdom, canvas and lottie-web are now loaded lazily on the first render()
    // (and jsdom on the first parseMxGraph()). Under Vite that first dynamic
    // import triggers on-demand transform/resolution of these large deps inside
    // the test body, which is far slower than a plain Node import (~0.5s cold in
    // production vs several seconds through Vite under parallel load). Give the
    // suite headroom so that first-call cost never trips the per-test timeout.
    testTimeout: 30000,
  },
});
