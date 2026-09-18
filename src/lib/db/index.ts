/**
 * The database handle — PGlite, not a Postgres pool.
 *
 * Upstream this opens a `pg` connection pool against the site's shared server.
 * Here the database is embedded: real PostgreSQL compiled to WebAssembly, living
 * in one directory, with nothing to install and nothing to run alongside the app.
 * Phase 0 verified that the copied store layer's Postgres-specific SQL —
 * advisory locks, `jsonb ->>`, `::uuid`, `DESC NULLS LAST` — all behave (see
 * docs/phase-0.md).
 *
 * ONE CONNECTION, and that is the thing to hold on to. PGlite serialises every
 * query through a single connection, so the advisory locks in `store.ts` and the
 * `SELECT … FOR UPDATE` in `worker.ts` are satisfied without ever contending.
 * They are kept because they cost nothing and because a second writer would need
 * them, not because anything here races.
 */
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

/** Where the database lives. Relative to the working directory so a clone runs
 *  without configuration; override for tests and for a packaged install. */
export const DATA_DIR = process.env.POLICY_DATA_DIR ?? path.join(process.cwd(), '.data', 'db');

// PGlite's Node filesystem creates its data directory but NOT the parents of
// it, so a first run in a clean clone dies on `ENOENT: mkdir '.data/db'` — the
// directory it is asked for, whose parent does not exist. Creating the tree
// first is the whole fix.
mkdirSync(DATA_DIR, { recursive: true });

export const client = new PGlite(DATA_DIR);
export const db = drizzle(client, { schema });

/**
 * Something that can run a statement: `db`, or the handle `db.transaction()`
 * passes its callback.
 *
 * A writer that closes over the `db` singleton cannot be composed — calling it
 * from inside `db.transaction(async (tx) => …)` runs it on a DIFFERENT
 * connection, so a rollback leaves its rows behind. Writers that take a
 * `DbExecutor` and default it to `db` compose without changing any call site.
 * (Upstream's words, and still true here even though the connection is one.)
 */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
