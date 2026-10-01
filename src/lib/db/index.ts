/**
 * The database handle — PGlite by default, a Postgres server when told.
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
 *
 * A SERVER, SINCE PHASE 21. Where a directory does not outlive a deployment —
 * a Databricks App — `POLICY_DATABASE_URL` or libpq's `PGHOST` points the same
 * schema at a Postgres server instead (Lakebase, on Databricks). That is
 * upstream's own shape, so the store layer needs nothing. See `./postgres.ts`.
 */
import { drizzle } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { createPool, describeServer, rawClient, usesPostgres } from './postgres';

const server = usesPostgres();

/** Where the database lives. Relative to the working directory so a clone runs
 *  without configuration; override for tests and for a packaged install. For a
 *  server, a description of it (never its password), for the startup banner. */
export const DATA_DIR = server
  ? describeServer()
  : process.env.POLICY_DATA_DIR ?? path.join(process.cwd(), '.data', 'db');

// PGlite's Node filesystem creates its data directory but NOT the parents of
// it, so a first run in a clean clone dies on `ENOENT: mkdir '.data/db'` — the
// directory it is asked for, whose parent does not exist. Creating the tree
// first is the whole fix.
if (!server) mkdirSync(DATA_DIR, { recursive: true });

const pool = server ? createPool() : null;
const embedded = server ? null : new PGlite(DATA_DIR);

/**
 * `exec`, `query` and `close` — what the migrator and the shutdown path call.
 * Typed as the subset both handles share, so nothing can reach for a
 * PGlite-only method and break the server build without the compiler saying so.
 */
export const client: {
  exec(sql: string): Promise<unknown>;
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  close(): Promise<void>;
} = pool ? rawClient(pool) : (embedded as PGlite);

const embeddedDb = embedded ? drizzle(embedded, { schema }) : null;

/**
 * TYPED AS THE PGLITE DATABASE EITHER WAY. Both are drizzle's `PgDatabase` with
 * the same schema; they differ only in the result object `execute()` returns,
 * and every caller here reads `.rows`, which both have. Widening this to a union
 * would make every transaction callback in the store a union too, for no
 * behaviour anybody could observe.
 */
export const db = (pool ? drizzlePg(pool, { schema }) : embeddedDb) as NonNullable<typeof embeddedDb>;

/**
 * Something that can run a statement: `db`, or the handle `db.transaction()`
 * passes its callback.
 *
 * A writer that closes over the `db` singleton cannot be composed — calling it
 * from inside `db.transaction(async (tx) => …)` runs it on a DIFFERENT
 * connection, so a rollback leaves its rows behind. Writers that take a
 * `DbExecutor` and default it to `db` compose without changing any call site.
 * (Upstream's words, and true again here now that a pool is possible.)
 */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
