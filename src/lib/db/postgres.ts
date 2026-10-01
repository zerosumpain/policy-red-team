/**
 * A REAL POSTGRES, FOR WHERE A DIRECTORY ON DISK IS NOT FOREVER.
 *
 * The embedded PGlite in `./index.ts` is the right default — nothing to install,
 * nothing to run beside the app — and it is wrong in exactly one kind of place:
 * one whose filesystem does not outlive a deployment. A Databricks App is that
 * place. Its working directory is rebuilt on every deploy, so an assessment
 * stored there is lost the next time anybody ships a fix.
 *
 * So the same schema can live in a server instead. This is upstream's shape
 * (a `pg` pool under `drizzle-orm/node-postgres`), which is why nothing above
 * this file changes: the store layer was written against a pool in the first
 * place, and its advisory locks and `FOR UPDATE` were there for a second writer
 * that PGlite never had.
 *
 * ── WHERE THE CONNECTION COMES FROM ────────────────────────────────────────
 *
 *   POLICY_DATABASE_URL   a connection string, for any Postgres 16+
 *   PGHOST (+ PG*)        libpq's own variables — and exactly what a
 *                         Databricks App is given when a Lakebase database is
 *                         added to it as a resource: PGHOST, PGPORT,
 *                         PGDATABASE, PGUSER (the app's service principal),
 *                         PGSSLMODE. `pg` reads all five itself.
 *
 * ── THE LAKEBASE PASSWORD IS A ONE-HOUR TOKEN ──────────────────────────────
 *
 * Lakebase authenticates with OAuth: the password is a token minted for the
 * service principal, and it expires after an hour — checked only at login, so
 * an open connection survives it and a NEW one needs a fresh token. `pg`
 * accepts an async function as the password and calls it for every new
 * connection, so the pool can never log in with a stale one. Three ways to
 * mint it, the first that applies:
 *
 *   PGPASSWORD               a native Postgres password; nothing to mint
 *   LAKEBASE_ENDPOINT        an autoscaling project's compute endpoint,
 *                            `projects/<p>/branches/<b>/endpoints/<e>` —
 *                            POST /api/2.0/postgres/credentials
 *   LAKEBASE_INSTANCE        a provisioned database instance's name —
 *                            POST /api/2.0/database/credentials
 *   (neither)                the workspace OAuth token itself
 *
 * The first two are the documented credential APIs; set one of them. The last
 * is what a Databricks App template does when it is given neither, and is kept
 * as the fallback rather than a refusal so a misconfiguration fails at the
 * database's door with Postgres's own message, not here with ours.
 *
 * ── THE DATA KEYS ARE NOT IN HERE, ON PURPOSE ──────────────────────────────
 *
 * Settings and sealed runs are encrypted with keys kept OUTSIDE the database
 * (`POLICY_SEAL_KEY_DIR`), so a copy of the database is not a copy of what it
 * protects. That separation is the point and is kept: on Databricks the
 * settings key comes from `POLICY_SETTINGS_KEY` (a secret resource), and see
 * the README for what that means for sealed runs.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { normaliseHost, principalFromEnvironment, workspaceToken } from '$lib/databricks/oauth';

/** True when the environment names a server rather than a directory. */
export function usesPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.POLICY_DATABASE_URL?.trim() || env.PGHOST?.trim());
}

/** Where the database is, for the startup banner — never the password. */
export function describeServer(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.POLICY_DATABASE_URL?.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      return `postgres://${parsed.host}${parsed.pathname}`;
    } catch {
      return 'postgres (POLICY_DATABASE_URL)';
    }
  }
  const lakebase = env.LAKEBASE_ENDPOINT || env.LAKEBASE_INSTANCE ? ' (Lakebase)' : '';
  return `postgres://${env.PGHOST}:${env.PGPORT ?? 5432}/${env.PGDATABASE ?? ''}${lakebase}`;
}

/** A minted database credential, cached until a minute before it expires. */
let minted: { token: string; expiresAt: number } | undefined;

/** Dropped between tests. */
export function clearLakebaseCredentialCache(): void {
  minted = undefined;
}

/**
 * The password for a new connection. Called by `pg` once per connection.
 * Exported for the test; nothing else should need it.
 */
export async function lakebasePassword(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const principal = principalFromEnvironment(env);
  if (!principal) {
    throw new Error(
      'There is no database password: PGPASSWORD is not set, and neither are DATABRICKS_HOST, DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET to mint a Lakebase token with.',
    );
  }
  const workspace = await workspaceToken(principal);
  const endpoint = env.LAKEBASE_ENDPOINT?.trim();
  const instance = env.LAKEBASE_INSTANCE?.trim();
  if (!endpoint && !instance) return workspace;

  if (minted && minted.expiresAt - 60_000 > Date.now()) return minted.token;
  const host = normaliseHost(principal.host);
  const [path, body] = endpoint
    ? ['/api/2.0/postgres/credentials', { endpoint }]
    : ['/api/2.0/database/credentials', { instance_names: [instance], request_id: randomUUID() }];
  const response = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${workspace}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Databricks would not issue a database credential (${response.status}): ${text.slice(0, 600)}`);
  }
  const parsed = JSON.parse(text) as { token?: string; expiration_time?: string };
  if (!parsed.token) throw new Error('Databricks answered the credential request without a token.');
  const expires = parsed.expiration_time ? Date.parse(parsed.expiration_time) : NaN;
  minted = { token: parsed.token, expiresAt: Number.isFinite(expires) ? expires : Date.now() + 3_600_000 };
  return minted.token;
}

/** The pool the whole service shares. */
export function createPool(env: NodeJS.ProcessEnv = process.env): pg.Pool {
  const url = env.POLICY_DATABASE_URL?.trim();
  if (url) return new pg.Pool({ connectionString: url, max: 10 });
  return new pg.Pool({
    // Everything else — host, port, database, user, sslmode — `pg` reads from
    // the PG* variables itself, which is what makes a Lakebase resource work
    // with no configuration of ours.
    password: env.PGPASSWORD ? env.PGPASSWORD : () => lakebasePassword(env),
    max: 10,
    // Lakebase scales to zero; a first connection can take a few seconds to
    // wake it. Generous, so a cold start is slow rather than an outage.
    connectionTimeoutMillis: 30_000,
  });
}

/**
 * The raw handle `scripts/migrate.mjs` and the shutdown path use: `exec`,
 * `query` and `close`, the three things they call on a PGlite.
 *
 * ONE DEDICATED CONNECTION, not the pool. The migrator wraps each file in
 * `BEGIN … COMMIT` and sends `ROLLBACK` after a failure; through a pool, the
 * rollback could land on a different connection than the one left in a failed
 * transaction, which would then be handed to the next query.
 */
export function rawClient(pool: pg.Pool) {
  let held: Promise<pg.PoolClient> | undefined;
  const conn = () => (held ??= pool.connect());
  return {
    async exec(sql: string): Promise<void> {
      await (await conn()).query(sql);
    },
    async query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }> {
      const result = await (await conn()).query(sql, params);
      return { rows: result.rows as R[] };
    },
    async close(): Promise<void> {
      if (held) (await held).release();
      held = undefined;
      await pool.end();
    },
  };
}
