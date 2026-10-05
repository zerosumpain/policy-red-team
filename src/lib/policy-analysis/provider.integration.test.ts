import { readFileSync } from 'node:fs';
import { PROMPT_VERSION } from './contracts';
import { describe, expect, it, vi } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAnalyses, policyExecutions, policyModelCalls, policyStages } from '$lib/db/schema';
import { recordLLMCall } from '$lib/context/execution';
import { createAnalysis } from './server/store';
import { ingest } from './server/ingest';
import { modelCaller } from './server/provider';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';
const mock = vi.hoisted(() => ({ count: 0, malformed: false, repairable: false, plainless: false, extraRef: null as string | null, asks: [] as string[] }));
vi.mock('$lib/server/models/workload-settings', () => ({ resolveResearchDeepModel: async () => ({ modelId: 'synthetic/test-model', provider: 'openrouter' }) }));
vi.mock('$lib/llm/client', () => ({ getLLMClient: async () => ({ model: 'synthetic/test-model', client: { chat: { completions: { create: async (request: { messages: { content: string }[] }) => {
  mock.count++;
  recordLLMCall({ provider: 'synthetic', model: 'synthetic/test-model', tokensInput: 100, tokensOutput: 200, costUsd: null, cacheReadTokens: null, reasoningTokens: null, priceSnapshot: null });
  const input = JSON.parse(request.messages[1].content);
  // A PLAY WITH NO PLAIN BLOCK (phase 23): round 0 leaves it off; the ask that
  // follows is answered with the block alone, as `repairPrompt` asks.
  if (mock.plainless) {
    const play = fixtureModel(10, 'fixture', input).artefacts[0];
    const last = request.messages.at(-1)?.content ?? '';
    if (last.includes('KEPT but have no plain-words block')) {
      mock.asks.push(last);
      return { model: 'synthetic/test-model', choices: [{ message: { content: JSON.stringify({ artefacts: [{ id: play.id, kind: 'exploit', data: { plain: play.data.plain } }], warnings: [] }) } }] };
    }
    const bare = structuredClone(play);
    delete bare.data.plain;
    return { model: 'synthetic/test-model', choices: [{ message: { content: JSON.stringify({ artefacts: [bare], warnings: [] }) } }] };
  }
  let output = fixtureModel(1, 'fixture', input);
  // A REF TO SOMETHING NOT SENT (phase 27): an earlier part of stage 17 wrote
  // it, and the call was told its id. Only `citable` can make it known.
  if (mock.extraRef) {
    output = structuredClone(output);
    output.artefacts[0].refs = [...output.artefacts[0].refs, mock.extraRef];
  }
  if (mock.repairable) {
    if (request.messages.at(-1)?.content.includes('Fix and resend ONLY the discarded items')) {
      const corrected = structuredClone(output.artefacts[0]);
      corrected.id = `${input.idPrefix}objective_repaired`;
      output = { artefacts: [corrected], warnings: [] };
    } else {
      output = structuredClone(output);
      output.artefacts[0].data = {};
    }
  }
  return { model: 'synthetic/test-model', choices: [{ message: { content: mock.malformed ? '{bad' : JSON.stringify(output) } }] };
} } } } }) }));
// DIVERGENCE: upstream keys this off DATABASE_URL naming its isolated
// Postgres. Here the throwaway database is a temp directory this suite created.
const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
describe.skipIf(!local)('persisted model audit and stage checkpoints', () => {
  it('records provider metadata and malformed output, and reuses a validated call after an interrupted stage', async () => {
    const bytes = readFileSync('tests/fixtures/policy-analysis/policy.txt');
    const a = await createAnalysis('preview@example.test', { title: 'Synthetic provider audit fixture', jurisdiction: null, policyArea: null, context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'fixture.txt', mimeType: 'text/plain', bytes });
    try {
      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const [execution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const prior = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const input = { stage: 1, artefacts: prior, idPrefix: 's1_fixture_' };
      const call = modelCaller(execution.id, stage.runId!, new AbortController().signal, prior);
      const output = await call(1, 'fixture', input);
      const [retry] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const next = modelCaller(retry.id, stage.runId!, new AbortController().signal, prior);
      expect(await next(1, 'fixture', input)).toEqual(output);
      expect(mock.count).toBe(1);
      mock.malformed = true;
      await expect(next(1, 'malformed', { ...input, idPrefix: 's1_bad_' })).rejects.toThrow('malformed JSON');
      const calls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, execution.id));
      expect(calls[0]).toMatchObject({ status: 'completed', provider: 'synthetic', model: 'synthetic/test-model', promptVersion: expect.stringContaining(PROMPT_VERSION) });
      expect(calls[0].usage).toMatchObject([{ tokensInput: 100, tokensOutput: 200, costUsd: null }]);
      const failed = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, retry.id));
      expect(failed[0]).toMatchObject({ status: 'failed', output: { malformedText: '{bad' } });
    } finally {
      mock.malformed = false;
      mock.repairable = false;
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, a.id));
      await db.execute(sql`delete from workflow_runs where input_data->>'analysisId' = ${a.id}`);
    }
  });

  it('lets a call cite what it was told an earlier part wrote, without sending it', async () => {
    const bytes = readFileSync('tests/fixtures/policy-analysis/policy.txt');
    const a = await createAnalysis('preview@example.test', { title: 'Synthetic citable fixture', jurisdiction: null, policyArea: null, context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'fixture.txt', mimeType: 'text/plain', bytes });
    try {
      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const prior = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const earlier = { ...structuredClone(prior[0]), id: 's17_000_finding_a' };
      mock.extraRef = earlier.id;
      const refsOf = async (citable: unknown[] | undefined, prefix: string) => {
        const [execution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
        const call = modelCaller(execution.id, stage.runId!, new AbortController().signal, prior);
        const out = await call(1, prefix, { stage: 1, artefacts: prior, idPrefix: prefix, ...(citable ? { citable } : {}) });
        const [stored] = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, execution.id));
        return { refs: out.artefacts.flatMap((x) => x.refs), sent: JSON.stringify(stored.input) };
      };
      const told = await refsOf([earlier], 's1_told_');
      expect(told.refs).toContain(earlier.id);
      // Never sent and never hashed: it is for triage alone.
      expect(told.sent).not.toContain('citable');
      const untold = await refsOf(undefined, 's1_untold_');
      expect(untold.refs).not.toContain(earlier.id);
    } finally {
      mock.extraRef = null;
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, a.id));
      await db.execute(sql`delete from workflow_runs where input_data->>'analysisId' = ${a.id}`);
    }
  });

  it('repairs rejected members of a cached response instead of replaying an incomplete subset', async () => {
    const bytes = readFileSync('tests/fixtures/policy-analysis/policy.txt');
    const a = await createAnalysis('preview@example.test', { title: 'Synthetic cached repair fixture', jurisdiction: null, policyArea: null, context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'fixture.txt', mimeType: 'text/plain', bytes });
    const before = mock.count;
    try {
      mock.repairable = true;
      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const prior = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const input = { stage: 1, artefacts: prior, idPrefix: 's1_cached_' };
      const [firstExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      // DIVERGENCE: the fresh call REPAIRS now. One artefact of four is rejected,
      // and the old floor of three meant a lone rejection was never re-asked —
      // this call used to return the incomplete three. It asks once and gets the
      // fourth back. See the divergence note in sync-core.mjs.
      const partial = await modelCaller(firstExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      // Nine: the fixture's four, and since phase 23 five more actor mentions
      // that exercise the master list of actors.
      expect(partial.artefacts).toHaveLength(9);
      // ONE round, not two: the second round is what a mostly-unusable response
      // gets, and this response was mostly fine.
      const firstCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, firstExecution.id)).orderBy(asc(policyModelCalls.startedAt));
      expect(firstCalls.map((c) => c.callKey)).toEqual(['cached', 'cached#repair1']);

      const [retryExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const repaired = await modelCaller(retryExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(repaired.artefacts).toHaveLength(9);
      expect(repaired.artefacts.some((item) => item.id === 's1_cached_objective_repaired')).toBe(true);
      // Three: the fresh call's round 0 and its repair, then the replay's repair.
      // The replay still has something to fix because round 0's stored output is
      // what the cache lookup finds, and that is the reply with the bad member.
      expect(mock.count - before).toBe(3);
      const retryCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, retryExecution.id));
      expect(retryCalls).toMatchObject([{ callKey: 'cached#repair1', status: 'completed' }]);
    } finally {
      mock.repairable = false;
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, a.id));
      await db.execute(sql`delete from workflow_runs where input_data->>'analysisId' = ${a.id}`);
    }
  });

  it('keeps a play that forgot its plain block, asks for the block alone, and puts the answer on the kept play', async () => {
    const bytes = readFileSync('tests/fixtures/policy-analysis/policy.txt');
    const a = await createAnalysis('preview@example.test', { title: 'Synthetic plain-block fixture', jurisdiction: null, policyArea: null, context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'fixture.txt', mimeType: 'text/plain', bytes });
    try {
      mock.plainless = true;
      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const passages = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const one = fixtureModel(1, 'k', { stage: 1, artefacts: passages, idPrefix: 's1_p_' } as never).artefacts;
      const two = fixtureModel(2, 'k', { stage: 2, artefacts: [...passages, ...one], idPrefix: 's2_p_' } as never).artefacts;
      const four = fixtureModel(4, 'k', { stage: 4, artefacts: [...passages, ...one, ...two], idPrefix: 's4_p_', targetActorId: two[0].id } as never).artefacts;
      const prior = [...passages, ...one, ...two, ...four];
      const [execution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const out = await modelCaller(execution.id, stage.runId!, new AbortController().signal, prior)(10, 'plain', { stage: 10, artefacts: prior, idPrefix: 's10_p_', targetActorId: two[0].id });
      // Kept from round 0, never discarded, and the block arrived on it.
      expect(out.artefacts).toHaveLength(1);
      expect(out.artefacts[0].data.plain).toMatchObject({ who: expect.any(String), likeWhen: expect.any(String) });
      expect(out.warnings.join(' ')).not.toMatch(/discarded/);
      expect(mock.asks).toHaveLength(1);
      expect(mock.asks[0]).not.toMatch(/Fix and resend ONLY the discarded items/);
      const calls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, execution.id)).orderBy(asc(policyModelCalls.startedAt));
      expect(calls.map((c) => c.callKey)).toEqual(['plain', 'plain#repair1']);
    } finally {
      mock.plainless = false;
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, a.id));
      await db.execute(sql`delete from workflow_runs where input_data->>'analysisId' = ${a.id}`);
    }
  });
});
