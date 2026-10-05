import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAnalyses, policyDocuments, policyGrounding, policyRunGrounding, policyStages, workflowRuns } from '$lib/db/schema';
import { claimNext } from '$lib/workflows/run-queue';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';
import { STAGES, TRIGGER } from './contracts';
import { documentCount, wherePlace } from './document-set';
import { gradeOf } from '$lib/evidence-grade';
import { groundingItems } from './grounding';
import { stageOnePlaces, placeOf } from '$lib/refused';
import { createAnalysis, detail, loadArtefacts } from './server/store';
import { addLibraryItem, createPolicy, libraryOf } from './server/grounding';
import { samePaper } from './server/paper';
import { executePolicyRun } from './server/worker';

/**
 * PHASE 25 END TO END: a paper of two documents plus grounding, from
 * submission through all eighteen stages on the fixture model.
 */
const seen = vi.hoisted(() => ({ calls: [] as { stage: number; key: string; input: unknown }[] }));
vi.mock('./server/provider', () => ({ modelCaller: () => async (stage: number, key: string, input: unknown) => {
  seen.calls.push({ stage, key, input });
  return fixtureModel(stage, key, input);
} }));
vi.mock('./server/research', () => ({ research: async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] }) }));

const local = process.env.POLICY_LOCAL_TESTS === '1' && /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
const owner = 'documents@example.test';
const paper = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const annex = Buffer.from('Annex A: costings. The annex sets out how the shared access programme is paid for in its first three years. Councils receive a grant for each resident who uses the service, paid quarterly in arrears. The grant does not cover the cost of new staff, which councils must meet from their own budgets.');
const statistics = Buffer.from('Local authority workforce statistics, 2025. Councils reported 1,240 vacancies in the advice posts the programme relies on, a rise of a fifth on the year before. Vacancy rates were highest in rural areas, where one post in eight was unfilled.');
const evaluation = Buffer.from('An evaluation of the pilot found that residents who used the shared access service were seen sooner, but that waiting times rose again once the pilot grant ended and staff left.');
const created: string[] = [];

async function claim(id: string) {
  const stages = await db.select().from(policyStages).where(eq(policyStages.analysisId, id));
  const stage = stages.sort((a, b) => a.ordinal - b.ordinal).find((s) => s.status !== 'completed')!;
  await db.update(workflowRuns).set({ startedAt: new Date(0) }).where(eq(workflowRuns.id, stage.runId!));
  const claimed = await claimNext('policy-documents-worker', 60_000, TRIGGER, stage.runId!);
  expect(claimed).not.toBeNull();
  return claimed!;
}
const advance = async (id: string) => executePolicyRun(await claim(id), 'policy-documents-worker');
const base = { jurisdiction: 'England', policyArea: 'Service access', context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: true, sealedResearch: false, filename: 'policy.txt', mimeType: 'text/plain', bytes: paper };

describe.skipIf(!local)('several documents and a grounding library', () => {
  afterAll(async () => {
    for (const id of created) {
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, id));
      await db.execute(sql`delete from workflow_runs where trigger = ${TRIGGER} and input_data->>'analysisId' = ${id}`);
    }
  });

  it('reads two documents as one paper and judges it against the policy’s grounding', async () => {
    const policy = await createPolicy(owner, 'Shared access');
    await addLibraryItem(owner, policy.id, { kind: 'file', role: 'statistics', title: 'Workforce statistics 2025', publisher: 'Office for Local Statistics', publishedOn: 'March 2025', filename: 'workforce.txt', mimeType: 'text/plain', bytes: statistics }, { fetchNow: false });
    const a = await createAnalysis(owner, {
      ...base, title: 'Shared access white paper', sealed: false,
      parts: [{ filename: 'annex.txt', mimeType: 'text/plain', bytes: annex, title: 'Annex A: costings' }],
      policyId: policy.id, useGrounding: null,
      grounding: [{ kind: 'file', role: 'evaluation', title: 'Pilot evaluation', publisher: null, publishedOn: '2024', filename: 'pilot.txt', mimeType: 'text/plain', bytes: evaluation }],
    });
    created.push(a.id);

    // THE SET, IN ORDER: document 0 keeps the empty prefix; the annex is d1_.
    const documents = await db.select().from(policyDocuments).where(eq(policyDocuments.analysisId, a.id)).orderBy(policyDocuments.position);
    expect(documents.map((d) => [d.position, d.role, d.idPrefix])).toEqual([[0, 'main', ''], [1, 'part', 'd1_']]);
    // The brought evaluation went into the library first, and the run has its own copy of both.
    expect((await libraryOf(policy.id)).map((i) => i.title).sort()).toEqual(['Pilot evaluation', 'Workforce statistics 2025']);
    expect(await db.select({ n: sql<number>`count(*)::int` }).from(policyRunGrounding).where(eq(policyRunGrounding.analysisId, a.id))).toEqual([{ n: 2 }]);

    for (let stage = 0; stage < STAGES.length; stage++) await advance(a.id);
    const result = (await detail(owner, a.id))!;
    expect(result.stages.every((s) => s.status === 'completed')).toBe(true);
    const all = result.artefacts;
    const byId = new Map(all.map((a) => [a.id, a]));

    // Passage ids: the main paper's exactly as ever, the annex's under d1_.
    expect(all.some((p) => p.id === 'passage_0001' && p.kind === 'passage')).toBe(true);
    const annexPassage = all.find((p) => p.id === 'd1_passage_0001')!;
    expect(annexPassage.kind).toBe('passage');
    expect(annexPassage.label.startsWith('Annex A: costings · ')).toBe(true);
    expect(annexPassage.data.documentPosition).toBe(1);
    expect(documentCount(all)).toBe(2);

    // A CITATION NAMES ITS DOCUMENT: a claim read from the annex.
    const annexClaim = all.find((x) => x.kind === 'claim' && x.sourceId === 'd1_passage_0001')!;
    expect(annexClaim).toBeTruthy();
    expect(wherePlace(annexClaim, byId, documentCount(all))).toContain('Annex A: costings');
    // The prompt was told which document, inside the passage itself.
    const stageOneCall = seen.calls.find((c) => c.stage === 1 && (c.input as { artefacts: { id: string }[] }).artefacts.some((x) => x.id === 'd1_passage_0001'))!;
    const sent = (stageOneCall.input as { artefacts: { id: string; data: Record<string, unknown> }[] }).artefacts.find((x) => x.id === 'd1_passage_0001')!;
    expect(sent.data.documentTitle).toBe('Annex A: costings');
    // And the report places the annex's stage-1 slot on the annex, not the paper.
    expect(placeOf(annexClaim.id, stageOnePlaces(all))?.passage?.id).toBe('d1_passage_0001');

    // GROUNDING: its own kind, its own namespace, never `passage`.
    const items = groundingItems(all);
    expect(items.map((i) => [i.position, i.title, i.role])).toEqual([[1, 'Workforce statistics 2025', 'statistics'], [2, 'Pilot evaluation', 'evaluation']]);
    expect(all.filter((x) => x.kind === 'passage' && /^g\d+_/.test(x.id))).toEqual([]);
    // Read in full at stage 6, one call per item, and A QUOTE FROM IT IS VERIFIED.
    expect(seen.calls.filter((c) => c.stage === 6 && c.key.startsWith('grounding_')).map((c) => c.key).sort()).toEqual(['grounding_1', 'grounding_2']);
    const grounded = all.filter((x) => x.kind === 'evidence' && String(x.sourceId).startsWith('g'));
    expect(grounded.length).toBe(2);
    for (const row of grounded) {
      expect(row.startOffset).not.toBeNull();
      expect(byId.get(row.sourceId!)!.statement).toContain(row.sourceQuote!);
      // Graded as full text: moderate stands.
      expect(gradeOf(row, byId).grade).toBe('moderate');
    }
    // Reached the planner before research, as a digest.
    const planner = seen.calls.find((c) => c.stage === 5)!;
    const digests = (planner.input as { artefacts: { kind: string; data: Record<string, unknown> }[] }).artefacts.filter((x) => x.kind === 'grounding_passage');
    expect(digests.length).toBe(2);
    expect(digests.every((d) => d.data.digest === true)).toBe(true);

    // THE SAME PAPER: a re-run of the main paper alone shares the paper key.
    const again = await createAnalysis(owner, { ...base, title: 'Shared access white paper, again', sealed: false, policyId: policy.id, useGrounding: [] });
    created.push(again.id);
    const [k1] = await db.select({ key: policyAnalyses.paperKey, set: policyAnalyses.documentSetHash }).from(policyAnalyses).where(eq(policyAnalyses.id, a.id));
    const [k2] = await db.select({ key: policyAnalyses.paperKey, set: policyAnalyses.documentSetHash }).from(policyAnalyses).where(eq(policyAnalyses.id, again.id));
    expect(k1.set).not.toBe(k2.set);
    expect(k2.key).toBe(k1.key);
    expect((await samePaper(again.id)).has(a.id)).toBe(true);
    // Unticking everything means no grounding at all.
    expect(await db.select({ n: sql<number>`count(*)::int` }).from(policyRunGrounding).where(eq(policyRunGrounding.analysisId, again.id))).toEqual([{ n: 0 }]);
  }, 180_000);

  it('a sealed run copies grounding into sealed rows and never writes the library', async () => {
    const policy = await createPolicy(owner, 'Sealed access');
    await addLibraryItem(owner, policy.id, { kind: 'file', role: 'statistics', title: 'Workforce statistics 2025', publisher: null, publishedOn: null, filename: 'workforce.txt', mimeType: 'text/plain', bytes: statistics }, { fetchNow: false });
    const a = await createAnalysis(owner, {
      ...base, title: 'A sealed paper', sealed: true, policyId: policy.id, useGrounding: null,
      grounding: [{ kind: 'file', role: 'evaluation', title: 'A private evaluation', publisher: null, publishedOn: null, filename: 'private.txt', mimeType: 'text/plain', bytes: evaluation }],
    });
    created.push(a.id);
    const [row] = await db.select().from(policyAnalyses).where(eq(policyAnalyses.id, a.id));
    expect(row.policyId).toBeNull();
    expect((await libraryOf(policy.id)).map((i) => i.title)).toEqual(['Workforce statistics 2025']);
    const raw = JSON.stringify(await db.select().from(policyRunGrounding).where(eq(policyRunGrounding.analysisId, a.id)));
    for (const secret of ['A private evaluation', 'Workforce statistics', evaluation.toString('base64').slice(0, 40)]) expect(raw).not.toContain(secret);
    expect(raw).toContain('sealed:v1:');
    expect(await db.select({ n: sql<number>`count(*)::int` }).from(policyGrounding).where(eq(policyGrounding.policyId, policy.id))).toEqual([{ n: 1 }]);
    // Ingestion reads the sealed copy, and the passages are minted as for any run.
    await advance(a.id);
    const all = await loadArtefacts(a.id);
    expect(groundingItems(all).map((i) => i.title)).toEqual(['Workforce statistics 2025', 'A private evaluation']);
  });
});
