// THE MASTER LIST OF ACTORS against a real database (phase 23): what a run
// writes to it, what the next run matches back in without asking, what a
// sealed run must never leave behind, the reader's rulings, and the backfill.
//
// Opt-in and isolated, exactly as `personas.integration.test.ts` is.
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyActorMentions, policyAnalyses, policyPersonas, policyStages, workflowRuns } from '$lib/db/schema';
import { claimNext } from '$lib/workflows/run-queue';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';
import { artefact, STAGES, TRIGGER } from './contracts';
import { acceptEntry, backfillRegister, keepWording, loadRegisterView, markNotActor, modelJoins, proposalQueue, registerEntry, registerTreeFor, reopenEntry, reparentEntry, reviewCount, reviewQueue, splitWording } from './server/actor-register';
import { mergePersonas } from './server/personas';
import { entryIndex, matchName } from './actor-register';
import { createAnalysis, loadArtefacts, persistArtefacts, purge, remove, sealOf } from './server/store';
import { executePolicyRun } from './server/worker';

const calls = vi.hoisted(() => ({ list: [] as { stage: number; key: string }[] }));
vi.mock('./server/provider', () => ({ modelCaller: () => async (stage: number, key: string, input: unknown) => {
  calls.list.push({ stage, key });
  return fixtureModel(stage, key, input);
} }));
vi.mock('./server/research', () => ({ research: async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] }) }));

const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
const owner = `register-${Date.now()}@example.test`;
const created: string[] = [];

const first = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const second = Buffer.concat([first, Buffer.from('\n\nThis note is a separate policy about the same Council.\n')]);
const third = Buffer.concat([first, Buffer.from('\n\nA sealed draft about the same Council.\n')]);

async function run(title: string, bytes: Buffer, sealed = false) {
  const analysis = await createAnalysis(owner, { title, jurisdiction: 'Synthetic jurisdiction', policyArea: 'Service access', context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed, sealedResearch: false, filename: 'policy.txt', mimeType: 'text/plain', bytes });
  created.push(analysis.id);
  for (let i = 0; i < STAGES.length; i++) {
    const stages = await db.select().from(policyStages).where(eq(policyStages.analysisId, analysis.id));
    const stage = stages.sort((a, b) => a.ordinal - b.ordinal).find((s) => s.status !== 'completed');
    if (!stage?.runId) break;
    await db.update(workflowRuns).set({ startedAt: new Date(0) }).where(eq(workflowRuns.id, stage.runId));
    const claimed = await claimNext('register-fixture-worker', 60_000, TRIGGER, stage.runId);
    expect(claimed).not.toBeNull();
    await executePolicyRun(claimed!, 'register-fixture-worker');
  }
  const [row] = await db.select().from(policyAnalyses).where(eq(policyAnalyses.id, analysis.id));
  return row;
}

const entries = () => db.select().from(policyPersonas).where(eq(policyPersonas.owner, owner));
const mentionsOf = (analysisId: string) => db.select().from(policyActorMentions).where(eq(policyActorMentions.analysisId, analysisId));
const castOf = async (analysisId: string) => (await loadArtefacts(analysisId)).filter((a) => a.kind === 'actor' && a.id.startsWith('s2_'));

describe.skipIf(!local)('the master list of actors across runs', () => {
  beforeAll(() => { process.env.POLICY_SEAL_KEY_DIR = mkdtempSync(path.join(tmpdir(), 'policy-register-it-')); });
  afterAll(async () => {
    for (const id of created) await purge(owner, id).catch(() => null);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, owner));
    delete process.env.POLICY_SEAL_KEY_DIR;
  });

  let one: { id: string };
  it('writes what the first paper proposes, and stamps each actor with its row', async () => {
    calls.list = [];
    one = await run('Register fixture — first policy', first);
    // One matching call for what the rules could not place.
    expect(calls.list.filter((c) => c.stage === 2).map((c) => c.key)).toEqual(['match']);
    const rows = await entries();
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect([...byName.keys()].sort()).toEqual(['Council', 'Department for Education', 'Providers', 'Shared access programme']);
    expect(byName.get('Department for Education')).toMatchObject({ bodyId: 'govuk:department-for-education', kind: 'organisation', status: 'proposed', proposedIn: one.id });
    expect(byName.get('Providers')!.kind).toBe('sector_or_category');
    expect(byName.get('Shared access programme')).toMatchObject({ kind: 'not_an_actor', notActorReason: 'programme', partOf: byName.get('Council')!.id });
    // THE PRIVACY FIX: the named resident is nowhere on the list.
    expect(JSON.stringify(rows)).not.toContain('Jane Smith');
    const mentions = await mentionsOf(one.id);
    expect(JSON.stringify(mentions)).not.toContain('Jane Smith');
    // "Council" and "Councils" are one actor, two mentions, each with a capacity.
    const council = byName.get('Council')!;
    expect(mentions.filter((m) => m.masterId === council.id).map((m) => m.wording).sort()).toEqual(['Council', 'Councils']);
    expect(mentions.every((m) => m.capacity)).toBe(true);
    const cast = await castOf(one.id);
    expect(cast.map((a) => a.label).sort()).toEqual(['Council', 'Department for Education', 'Providers']);
    for (const actor of cast) expect((actor.data.master as { id: string }).id).toBe(byName.get(actor.label)!.id);
  });

  it('takes the reader’s rulings, and refuses a loop', async () => {
    const byName = new Map((await entries()).map((r) => [r.name, r]));
    await acceptEntry(owner, byName.get('Council')!.id);
    await reparentEntry(owner, byName.get('Council')!.id, { partOf: byName.get('Department for Education')!.id });
    await expect(reparentEntry(owner, byName.get('Department for Education')!.id, { partOf: byName.get('Council')!.id })).rejects.toThrow(/cannot sit under it/);
    await expect(reparentEntry(owner, byName.get('Council')!.id, { partOf: byName.get('Shared access programme')!.id })).rejects.toThrow(/not an actor/);
    const tree = await registerTreeFor(owner);
    const council = tree.entries.find((e) => e.name === 'Council')!;
    expect(council).toMatchObject({ status: 'confirmed', partOfPath: ['Department for Education'] });
    expect(tree.partOf.children[byName.get('Department for Education')!.id]).toContain(council.id);
    expect(tree.counts).toMatchObject({ proposed: 3, notActors: 1 });
    const queue = await proposalQueue(owner);
    expect(queue.map((q) => q.name).sort()).toEqual(['Department for Education', 'Providers', 'Shared access programme']);
  });

  it('matches the second paper back in by rule, with no model call, under the reader’s structure', async () => {
    calls.list = [];
    const two = await run('Register fixture — second policy', second);
    expect(calls.list.filter((c) => c.stage === 2)).toEqual([]);
    const byName = new Map((await entries()).map((r) => [r.name, r]));
    expect(byName.size).toBe(4);
    const cast = await castOf(two.id);
    const council = cast.find((a) => a.label === 'Council')!;
    expect(council.data.master).toMatchObject({ id: byName.get('Council')!.id, status: 'confirmed', partOf: { name: 'Department for Education' } });
    expect(council.data.programmes).toEqual(['Shared access programme']);
    const tree = await registerTreeFor(owner);
    expect(tree.entries.find((e) => e.name === 'Council')!.papers).toBe(2);
  });

  it('lets a sealed paper READ the list and write nothing to it', async () => {
    const before = { entries: (await entries()).map((r) => [r.id, r.name, r.aliases, r.updatedAt?.toISOString()]), mentions: (await db.select().from(policyActorMentions).where(eq(policyActorMentions.owner, owner))).length };
    const sealed = await run('Register fixture — sealed draft', third, true);
    expect(['completed', 'completed_with_gaps']).toContain(sealed.status);
    const after = { entries: (await entries()).map((r) => [r.id, r.name, r.aliases, r.updatedAt?.toISOString()]), mentions: (await db.select().from(policyActorMentions).where(eq(policyActorMentions.owner, owner))).length };
    expect(after).toEqual(before);
    expect(await mentionsOf(sealed.id)).toEqual([]);
    // Matched to what was already there; nothing new carries an id.
    const cast = await castOf(sealed.id);
    expect((cast.find((a) => a.label === 'Council')!.data.master as { id: string }).id).toBe((await entries()).find((r) => r.name === 'Council')!.id);
  });

  it('marks a row not an actor, and keeps it out of the next paper’s cast', async () => {
    const providers = (await entries()).find((r) => r.name === 'Providers')!;
    await expect(markNotActor(owner, providers.id, 'named_person')).rejects.toThrow(/Remove it instead/);
    await markNotActor(owner, providers.id, 'other');
    calls.list = [];
    const four = await run('Register fixture — fourth policy', Buffer.concat([first, Buffer.from('\n\nA fourth paper.\n')]));
    expect((await castOf(four.id)).map((a) => a.label).sort()).toEqual(['Council', 'Department for Education']);
    await remove(owner, four.id);
  });

  it('lists a join only the model made, splits it off in one step, and merges it back (phase 24b)', async () => {
    calls.list = [];
    const five = await run('Register fixture — the local authority', Buffer.concat([first, Buffer.from('\n\nThe local authority runs the scheme day to day.\n')]));
    expect(calls.list.filter((c) => c.stage === 2).map((c) => c.key)).toEqual(['match']);
    const council = (await entries()).find((r) => r.name === 'Council')!;
    // The model's guess is now an alias — a rule on every later run — and says who put it there.
    expect(council.aliases).toContain('The local authority');
    expect(council.aliasOrigins['the local authority']).toMatchObject({ by: 'model', analysisId: five.id });
    const queue = await reviewQueue(owner);
    expect(queue.joined).toEqual([expect.objectContaining({ id: council.id, wording: 'The local authority', alias: true, analyses: [{ id: five.id, title: 'Register fixture — the local authority' }] })]);
    expect((await reviewCount(owner)).joined).toBe(1);

    // SPLIT: one step, and the next paper that says it no longer matches the council by rule.
    const split = await splitWording(owner, council.id, 'The local authority');
    expect(split).toMatchObject({ name: 'The local authority', created: true, moved: 1 });
    const after = await entries();
    expect(after.find((r) => r.id === council.id)!.aliases).not.toContain('The local authority');
    expect(after.find((r) => r.id === split.id)).toMatchObject({ status: 'proposed', proposedIn: five.id });
    expect((await mentionsOf(five.id)).filter((m) => m.wording === 'The local authority').map((m) => m.masterId)).toEqual([split.id]);
    expect(matchName('The local authority', entryIndex(await loadRegisterView(owner)))?.entry.id).toBe(split.id);
    expect((await modelJoins(owner)).joins.filter((j) => j.id === council.id)).toEqual([]);
    await expect(splitWording(owner, council.id, 'Councils')).rejects.toThrow(/own name/);

    // ITS UNDO is the merge: the wording comes home and the reader's word now stands for it.
    await mergePersonas(owner, council.id, split.id);
    const merged = (await entries()).find((r) => r.id === council.id)!;
    expect(merged.aliases).toContain('The local authority');
    expect(merged.aliasOrigins['the local authority']).toMatchObject({ by: 'reader' });
    expect((await mentionsOf(five.id)).filter((m) => m.wording === 'The local authority').map((m) => m.masterId)).toEqual([council.id]);
    expect(matchName('The local authority', entryIndex(await loadRegisterView(owner)))).toMatchObject({ entry: { id: council.id }, basis: 'ruling' });
    expect((await modelJoins(owner)).total).toBe(0);
    await keepWording(owner, council.id, 'The local authority');
    expect((await modelJoins(owner)).total).toBe(0);

    // An accept can be taken back; the entry's own page names where it sits and what papers gave it.
    await reopenEntry(owner, council.id);
    expect((await entries()).find((r) => r.id === council.id)!.status).toBe('proposed');
    await acceptEntry(owner, council.id);
    const page = (await registerEntry(owner, council.id))!;
    expect(page.partOf?.name).toBe('Department for Education');
    expect(Object.values(page.entry.capacityPapers).every((n) => n >= 1)).toBe(true);
    const dfe = (await entries()).find((r) => r.name === 'Department for Education')!;
    expect((await registerEntry(owner, dfe.id))!.children.partOf.map((c) => c.name)).toContain('Council');
    expect(await registerEntry(owner, 'not-a-uuid')).toBeNull();
    await remove(owner, five.id);
  });

  it('takes a paper’s proposals with it when it goes, and keeps what the reader confirmed', async () => {
    for (const id of created) await remove(owner, id).catch(() => false);
    const left = await entries();
    // The council was confirmed; the providers were ruled on; the rest were
    // proposals no paper names any more.
    expect(left.map((r) => r.name).sort()).toEqual(['Council', 'Providers']);
    expect(await db.select().from(policyActorMentions).where(eq(policyActorMentions.owner, owner))).toEqual([]);
  });
});

describe.skipIf(!local)('the backfill', () => {
  const backfillOwner = `backfill-${Date.now()}@example.test`;
  afterAll(async () => {
    const rows = await db.select({ id: policyAnalyses.id }).from(policyAnalyses).where(eq(policyAnalyses.owner, backfillOwner));
    for (const r of rows) await remove(backfillOwner, r.id).catch(() => false);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, backfillOwner));
  });

  it('maps a finished run’s old actors onto the list by rule, leaves its artefacts alone, and does it once', async () => {
    const a = await createAnalysis(backfillOwner, { title: 'Old run', jurisdiction: null, policyArea: null, context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'policy.txt', mimeType: 'text/plain', bytes: first });
    const passage = artefact('passage_0001', 'passage', 'Page 1', 'Text.', { documentHash: 'x' }, { origin: 'extracted_fact' });
    const old = (id: string, label: string, entityType: string, mentions: string[]) => artefact(id, 'actor', label, `${label} is named.`, { entityType, aliases: [], mentions, ambiguity: 'none', dates: [], parent: null }, { refs: [passage.id] });
    const actors = [
      old('s2_main_actor_001_candidate_0', 'Government', 'department', ['s1_a']),
      old('s2_main_actor_001_candidate_1', 'Government', 'concept', ['s1_b']),
      old('s2_main_actor_002', 'Department of Education', 'department', ['s1_c']),
      old('s2_main_actor_003', 'Lauren', 'person', ['s1_d']),
      old('s2_main_actor_004', 'Universal Credit', 'programme', ['s1_e']),
    ];
    // The seal is read BEFORE the transaction: PGlite is one connection, and a
    // read on `db` inside a transaction on it waits for itself.
    const seal = await sealOf(a.id);
    await db.transaction(async (tx) => {
      await persistArtefacts(tx, a.id, 0, [passage], seal);
      await persistArtefacts(tx, a.id, 2, actors, seal);
    });
    await db.update(policyAnalyses).set({ status: 'completed' }).where(eq(policyAnalyses.id, a.id));
    const before = (await loadArtefacts(a.id)).map((x) => [x.id, x.label, JSON.stringify(x.data)]);

    const report = await db.transaction((tx) => backfillRegister(tx, { owner: backfillOwner }));
    const run = report.runs.find((r) => r.analysisId === a.id)!;
    expect(run).toMatchObject({ actors: 5, labels: 4, masters: 3, dropped: 1 });
    // One label twice is one master actor, not a cluster of different wordings.
    expect(run.clusters).toEqual([]);
    const rows = await db.select().from(policyPersonas).where(eq(policyPersonas.owner, backfillOwner));
    expect(rows.map((r) => [r.name, r.kind, r.status]).sort()).toEqual([
      ['Department for Education', 'organisation', 'proposed'],
      ['Government', 'organisation', 'proposed'],
      ['Universal Credit', 'not_an_actor', 'proposed'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Lauren');
    // Both "Government" rows went to ONE master actor.
    const gov = rows.find((r) => r.name === 'Government')!;
    expect((await db.select().from(policyActorMentions).where(and(eq(policyActorMentions.analysisId, a.id), eq(policyActorMentions.masterId, gov.id)))).map((m) => m.actorId).sort()).toEqual(['s2_main_actor_001_candidate_0', 's2_main_actor_001_candidate_1']);
    // The old report reads exactly as it did.
    expect((await loadArtefacts(a.id)).map((x) => [x.id, x.label, JSON.stringify(x.data)])).toEqual(before);

    const again = await db.transaction((tx) => backfillRegister(tx, { owner: backfillOwner }));
    expect(again.runs).toEqual([]);
    expect(await db.select().from(policyPersonas).where(eq(policyPersonas.owner, backfillOwner))).toHaveLength(3);
  });
});
