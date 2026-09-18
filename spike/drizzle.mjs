/* Phase 0, spike C. The copied store layer is drizzle code, not raw SQL: it
 * calls `db.transaction`, `tx.execute(sql...)`, `.for('update')`, `onConflictDoNothing`
 * and `inArray`. PGlite answering psql is not the same as drizzle driving PGlite,
 * so the pattern of every risky call site in store.ts and worker.ts is replayed here. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, text, timestamp, jsonb, integer, doublePrecision, uuid } from 'drizzle-orm/pg-core';
import { eq, inArray, sql, and } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import { migrate } from '../scripts/migrate.mjs';

const DATA = '/tmp/claude-1000/-home-john/16d59563-c7d6-4f32-9fc5-7f1b56f83f75/scratchpad/pglite-drizzle';
await rm(DATA, { recursive: true, force: true });
const client = new PGlite(DATA);
await client.waitReady;
await migrate(client, { log: () => {} });

const db = drizzle(client);

// A faithful slice of the real schema — the columns the risky call sites touch.
const workflows = pgTable('workflows', {
  id: text('id').primaryKey(), name: text('name').notNull(), description: text('description'),
});
const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey(), workflowId: text('workflow_id').notNull(),
  status: text('status').notNull(), trigger: text('trigger').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  claimedBy: text('claimed_by'), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  inputData: jsonb('input_data'),
});
const policyAnalyses = pgTable('policy_analyses', {
  id: uuid('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
  status: text('status').notNull(),
});
const policyArtefacts = pgTable('policy_artefacts', {
  id: text('id').notNull(), analysisId: uuid('analysis_id').notNull(), stage: integer('stage').notNull(),
  kind: text('kind').notNull(), label: text('label').notNull(), statement: text('statement').notNull(),
  origin: text('origin').notNull(), confidence: doublePrecision('confidence'), data: jsonb('data').notNull(),
});

let failed = 0;
async function check(label, fn) {
  try { const r = await fn(); console.log('  ok    ', label, r === undefined ? '' : `→ ${r}`); }
  catch (err) { console.log('  FAIL  ', label, '\n         ', err.message); failed++; }
}

console.log('drizzle-orm/pglite driving the real schema:\n');

await check('insert … onConflictDoNothing (store.ts:28)', async () => {
  await db.insert(workflows).values({ id: 'policy-analysis-v1', name: 'Policy analysis' }).onConflictDoNothing();
  await db.insert(workflows).values({ id: 'policy-analysis-v1', name: 'Policy analysis' }).onConflictDoNothing();
  return (await db.select().from(workflows)).length + ' row after two inserts';
});

await check('transaction + tx.execute(advisory lock) + insert (store.ts:29-36)', async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'policy:owner'}))`);
    await tx.insert(workflowRuns).values({
      id: 'run-1', workflowId: 'policy-analysis-v1', trigger: 'policy-analysis', status: 'pending',
      startedAt: new Date(), inputData: { analysisId: 'a-1', stageId: 's-1' },
    });
  });
  return 'committed';
});

await check('select … .for("update") inside a transaction (worker.ts:83)', async () => {
  let got;
  await db.transaction(async (tx) => {
    [got] = await tx.select().from(workflowRuns).where(eq(workflowRuns.id, 'run-1')).for('update');
  });
  return got?.status;
});

await check('jsonb round-trips as an object, not a string', async () => {
  const [r] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, 'run-1'));
  if (typeof r.inputData !== 'object' || r.inputData === null) throw new Error(`got ${typeof r.inputData}`);
  return `inputData.analysisId = ${r.inputData.analysisId}`;
});

await check('timestamptz round-trips as a Date', async () => {
  const [r] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, 'run-1'));
  if (!(r.startedAt instanceof Date)) throw new Error(`got ${r.startedAt?.constructor?.name}`);
  return 'Date';
});

await check('a raw sql fragment on a column (store.ts:252)', async () => {
  const rows = await db.select().from(policyArtefacts)
    .where(and(eq(policyArtefacts.kind, 'cross_policy'), sql`${policyArtefacts.data} ->> 'otherAnalysisId' = ${'x'}`));
  return rows.length + ' rows';
});

await check('orderBy with a DESC NULLS LAST fragment (store.ts:389)', async () => {
  const rows = await db.select().from(policyArtefacts)
    .orderBy(sql`${policyArtefacts.confidence} DESC NULLS LAST`);
  return rows.length + ' rows';
});

await check('inArray update (store.ts:432)', async () => {
  const r = await db.update(workflowRuns)
    .set({ status: 'cancelled', claimedBy: null, leaseExpiresAt: null, completedAt: new Date() })
    .where(inArray(workflowRuns.id, ['run-1']));
  const [after] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, 'run-1'));
  return after.status;
});

await check('a failing transaction rolls back', async () => {
  await db.transaction(async (tx) => {
    await tx.insert(workflowRuns).values({ id: 'run-2', workflowId: 'policy-analysis-v1', trigger: 't', status: 'pending' });
    throw new Error('deliberate');
  }).catch(() => {});
  const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.id, 'run-2'));
  if (rows.length) throw new Error('run-2 survived a rolled-back transaction');
  return 'rolled back';
});

await check('the session is usable after a rollback', async () => {
  const rows = await db.select().from(workflowRuns);
  return rows.length + ' rows readable';
});

await client.close();
console.log(failed ? `\nSPIKE C: FAILED (${failed})` : '\nSPIKE C: PASSED');
process.exit(failed ? 1 : 0);
