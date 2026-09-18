import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The integration suite: the pipeline against a real database.
 *
 * Separate from `vitest.config.ts` because these tests are DESTRUCTIVE — they
 * create, cancel, purge and delete assessments — and because they need a
 * migrated database, which the unit suite does not.
 *
 * They are hermetic in the one way that matters: `server/provider` and
 * `server/research` are mocked in every file, so a full run makes no model call
 * and needs no API key. What they exercise is the store, the queue, the worker
 * and the sealing — everything phase 1 shimmed.
 */
export default defineConfig({
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['./tests/setup-integration.ts'],
    // One database, one connection: PGlite serialises everything through a
    // single handle, so two test files running at once would interleave their
    // transactions on the same rows. The upstream suite could fan out because
    // every worker got its own Postgres connection; this one cannot.
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
