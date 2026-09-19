import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // The same alias the tsconfig maps, so the copied files resolve their
    // imports unchanged — see tsconfig.json for why the layout mirrors upstream.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    // `client/` is included so presentation LOGIC can be tested without a
    // browser. Nothing here renders React — the walk does that, and it is the
    // right tool for it — but the pure parts a view depends on (which plays a
    // selection narrows to, what a stage warning actually said) are arithmetic,
    // and arithmetic covered only by a browser walk is arithmetic covered
    // slowly and reported as a screenshot.
    include: ['src/**/*.test.ts', 'client/**/*.test.ts'],
    // Promise.try for pdfjs on Node 22.22 — see src/lib/polyfills.ts.
    setupFiles: ['./src/lib/polyfills.ts'],
    // The integration tests need a migrated database and a worker loop, which
    // phase 2 builds. Until then they are excluded by name rather than deleted.
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    // homeserv has 7.6 GB and a live service on it; an unbounded pool is how a
    // test run takes the box down. Vitest 4 removed `poolOptions` — these are
    // top-level now, and the old spelling was silently ignored.
    pool: 'threads',
    maxWorkers: 2,
    // Upstream's figure, for upstream's reason: the differential budget test
    // brute-forces bisection against a linear scan across four seeds and takes
    // over five seconds under load, so the 5s default fails it on a busy box
    // while it passes in isolation. Not flake — arithmetic.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
