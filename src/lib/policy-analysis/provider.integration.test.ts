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
const mock = vi.hoisted(() => ({ count: 0, malformed: false, repairable: false }));
vi.mock('$lib/server/models/workload-settings', () => ({ resolveResearchDeepModel: async () => ({ modelId: 'synthetic/test-model', provider: 'openrouter' }) }));
vi.mock('$lib/llm/client', () => ({ getLLMClient: async () => ({ model: 'synthetic/test-model', client: { chat: { completions: { create: async (request: { messages: { content: string }[] }) => {
  mock.count++;
  recordLLMCall({ provider: 'synthetic', model: 'synthetic/test-model', tokensInput: 100, tokensOutput: 200, costUsd: null, cacheReadTokens: null, reasoningTokens: null, priceSnapshot: null });
  const input = JSON.parse(request.messages[1].content);
  let output = fixtureModel(1, 'fixture', input);
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
      const partial = await modelCaller(firstExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(partial.artefacts).toHaveLength(3);

      const [retryExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const repaired = await modelCaller(retryExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(repaired.artefacts).toHaveLength(4);
      expect(repaired.artefacts.some((item) => item.id === 's1_cached_objective_repaired')).toBe(true);
      expect(mock.count - before).toBe(2);
      const retryCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, retryExecution.id));
      expect(retryCalls).toMatchObject([{ callKey: 'cached#repair1', status: 'completed' }]);
    } finally {
      mock.repairable = false;
      await db.delete(policyAnalyses).where(eq(policyAnalyses.id, a.id));
      await db.execute(sql`delete from workflow_runs where input_data->>'analysisId' = ${a.id}`);
    }
  });
});
