/* Phase 0, spike A. Does PGlite carry the policy schema as written?
 *
 * Applies the eleven migrations through the real runner, then exercises every
 * Postgres feature the copied store layer depends on. Anything that throws
 * fails the spike; the point is to find out now, not in phase 1. */
import { PGlite } from '@electric-sql/pglite';
import { rm } from 'node:fs/promises';
import { migrate } from '../scripts/migrate.mjs';

const DATA = '/tmp/claude-1000/-home-john/16d59563-c7d6-4f32-9fc5-7f1b56f83f75/scratchpad/pglite-spike';
await rm(DATA, { recursive: true, force: true });

const db = new PGlite(DATA);
await db.waitReady;
console.log('engine:', (await db.query('select version() as v')).rows[0].v.split(',')[0]);

console.log('\nmigrations:');
await migrate(db, { log: (m) => console.log(m) });

const tables = await db.query(
  `select tablename from pg_tables where schemaname='public' and tablename not like '\\_%' order by tablename`
);
const names = tables.rows.map((r) => r.tablename);
const policy = names.filter((n) => n.startsWith('policy_'));
console.log(`\ntables: ${names.length} total, ${policy.length} policy`);
console.log('  ' + names.join('\n  '));

let failed = 0;
async function check(label, fn) {
  try { const r = await fn(); console.log('  ok    ', label, r === undefined ? '' : `→ ${r}`); }
  catch (err) { console.log('  FAIL  ', label, '\n         ', err.message); failed++; }
}

console.log('\nPostgres features the copied store layer depends on:');
await check('gen_random_uuid()', async () =>
  (await db.query('select gen_random_uuid() as u')).rows[0].u.slice(0, 8) + '…');
await check('gen_random_uuid()::text (workflow_runs default)', async () =>
  typeof (await db.query('select gen_random_uuid()::text as u')).rows[0].u);
await check('::uuid cast in a where clause (census.ts)', async () =>
  (await db.query(`select count(*)::int as n from policy_analyses where id = $1::uuid`,
    ['00000000-0000-0000-0000-000000000000'])).rows[0].n);
await check("jsonb ->> operator (census.ts, store.ts)", async () =>
  (await db.query(`select count(*)::int as n from workflow_runs where input_data ->> 'analysisId' = $1`, ['x'])).rows[0].n);
await check('DESC NULLS LAST (store.ts:389)', async () =>
  (await db.query(`select confidence from policy_artefacts order by confidence desc nulls last limit 1`)).rows.length);
await check('hashtext() (store.ts, personas.ts)', async () =>
  (await db.query(`select hashtext($1) as h`, ['policy:spike'])).rows[0].h);
await check('pg_advisory_xact_lock in a transaction (store.ts:36)', async () => {
  let got;
  await db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, ['policy:spike']);
    got = 'acquired';
  });
  return got;
});
await check('the same lock again, next transaction', async () => {
  await db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, ['policy:spike']);
  });
  return 'reacquired, so the first was released at commit';
});
await check('nothing left holding an advisory lock', async () =>
  (await db.query(`select count(*)::int as n from pg_locks where locktype='advisory'`)).rows[0].n);
await check('SELECT … FOR UPDATE (worker.ts:83)', async () => {
  await db.transaction(async (tx) => {
    await tx.query(`select id from workflow_runs where id = $1 for update`, ['none']);
  });
  return 'accepted';
});
await check('a real round trip: insert a run, read it back by jsonb key', async () => {
  await db.query(`insert into workflows (id, name) values ($1,$2) on conflict do nothing`,
    ['policy-analysis-v1', 'Policy analysis']);
  await db.query(
    `insert into workflow_runs (id, workflow_id, trigger, status, input_data) values ($1,$2,$3,$4,$5)`,
    ['run-1', 'policy-analysis-v1', 'policy-analysis', 'pending', JSON.stringify({ analysisId: 'a-1', stageId: 's-1' })]
  );
  const r = await db.query(`select count(*)::int as n from workflow_runs where input_data ->> 'analysisId' = $1`, ['a-1']);
  return `${r.rows[0].n} row`;
});
await check('the eleven policy tables are all present', async () => {
  if (policy.length !== 11) throw new Error(`expected 11, found ${policy.length}`);
  return '11';
});
await check('re-running the migrations is a no-op', async () => {
  const again = await migrate(db, { log: () => {} });
  if (again.length) throw new Error(`re-applied ${again.length}`);
  return 'nothing re-applied';
});

await db.close();
console.log(failed ? `\nSPIKE A: FAILED (${failed})` : '\nSPIKE A: PASSED');
process.exit(failed ? 1 : 0);
