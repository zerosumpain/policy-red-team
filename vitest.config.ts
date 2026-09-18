import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // The same alias the tsconfig maps, so the copied files resolve their
    // imports unchanged — see tsconfig.json for why the layout mirrors upstream.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
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
    minWorkers: 1,
    // Upstream's figure, for upstream's reason: the differential budget test
    // brute-forces bisection against a linear scan across four seeds and takes
    // over five seconds under load, so the 5s default fails it on a busy box
    // while it passes in isolation. Not flake — arithmetic.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
