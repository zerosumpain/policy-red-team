/**
 * The migrations and the Drizzle schema must describe the same database.
 *
 * This test exists because they did not. `policy_analyses.extraction` and
 * `policy_analyses.shared_context_first` are in upstream's schema and in its
 * running database but in none of its ten migration files — added with
 * `drizzle-kit push` rather than written down — so a fresh deployment from those
 * migrations produced a table the code could not insert into. It cost the first
 * integration run of this build; `migrations/0001-schema-catchup.sql` is the fix.
 *
 * Catching it needs no fixtures and no pipeline: ask the database what columns it
 * has, ask Drizzle what columns it expects, and compare. Cheap enough to keep
 * forever, and it fails the moment a column is added to one side only — including
 * a migration ported across the fork whose column nobody added to the schema.
 */
import { describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { client } from '$lib/db';
import * as schema from '$lib/db/schema';

const local =
  process.env.POLICY_LOCAL_TESTS === '1' &&
  /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');

describe.skipIf(!local)('the schema and the migrations agree', () => {
  it('has every column Drizzle expects, and no column it does not', async () => {
    const drift: string[] = [];

    for (const table of Object.values(schema)) {
      let config: ReturnType<typeof getTableConfig>;
      try {
        config = getTableConfig(table as PgTable);
      } catch {
        continue; // not a table — an inferred type, a helper
      }
      const expected = config.columns.map((c) => c.name).sort();
      const actual = (
        await client.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_name = $1`,
          [config.name]
        )
      ).rows
        .map((r) => r.column_name)
        .sort();

      const missing = expected.filter((c) => !actual.includes(c));
      const extra = actual.filter((c) => !expected.includes(c));
      if (missing.length) drift.push(`${config.name}: in the schema, not in the database — ${missing.join(', ')}`);
      if (extra.length) drift.push(`${config.name}: in the database, not in the schema — ${extra.join(', ')}`);
    }

    expect(drift).toEqual([]);
  });

  it('created all seventeen tables', async () => {
    const tables = (
      await client.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_%'`
      )
    ).rows.map((r) => r.tablename);
    // Phase 19 added three: the register of bodies, identity decisions and
    // affected groups.
    expect(tables).toHaveLength(17);
    expect(tables.filter((t) => t.startsWith('policy_'))).toHaveLength(15);
  });
});
