/**
 * `drain` must take an assessment all the way to a terminal state on its own.
 *
 * The copied integration tests advance ONE stage at a time, by design — they are
 * testing claiming, leases and resumption. Nothing tested the thing the CLI
 * actually does, which is keep going until there is nothing left, and the first
 * real run found two faults in exactly that gap:
 *
 *   - `completed_with_gaps` was not in the terminal set, so a finished run hung
 *     for the full idle timeout and then reported failure.
 *   - an empty claim is normal, not the end: stages are enqueued with a delay,
 *     so `claimNext` returning null usually means "not yet".
 *
 * Both are cheap to get wrong again, so they are asserted here.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

vi.mock('$lib/policy-analysis/server/provider', () => ({
  modelCaller: () => async (stage: number, key: string, input: unknown) => fixtureModel(stage, key, input),
}));
vi.mock('$lib/policy-analysis/server/research', () => ({
  research: async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] }),
}));

const { STAGES } = await import('$lib/policy-analysis/contracts');
const { createAnalysis, detail } = await import('$lib/policy-analysis/server/store');
const { drain, isFinished } = await import('$lib/worker');

const local =
  process.env.POLICY_LOCAL_TESTS === '1' &&
  /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');

const bytes = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const owner = 'drain@example.test';

describe.skipIf(!local)('drain runs an assessment to the end', () => {
  it('completes all eighteen stages and stops', async () => {
    const analysis = await createAnalysis(owner, {
      title: 'Drain fixture', jurisdiction: null, policyArea: null, context: null,
      depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null,
      extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false,
      filename: 'policy.txt', mimeType: 'text/plain', bytes,
    });

    const seen: number[] = [];
    const status = await drain(analysis.id, {
      idleTimeoutMs: 20_000,
      onStage: ({ completed }) => seen.push(completed),
    });

    // It returned, rather than spinning until the idle timeout — which is the
    // regression that matters, because a finished run looks idle.
    expect(isFinished(status)).toBe(true);

    const full = await detail(owner, analysis.id);
    expect(full?.stages).toHaveLength(STAGES.length);
    expect(full?.stages.filter((s) => s.status === 'completed')).toHaveLength(STAGES.length);
    expect(seen).toHaveLength(STAGES.length);
  });

  /*
   * WHAT A READER BRINGS, END TO END (phase 22 part 2): a web address and a
   * look-up at submission. The page is read by the fixture page reader that
   * `setup-integration.ts` swaps in; the look-up reaches the (stubbed) search
   * first and finds nothing, and is still listed as the reader's question.
   */
  it('carries a supplied page and a look-up from submission to the evidence and the challenge', async () => {
    const analysis = await createAnalysis(owner, {
      title: 'Drain fixture with reader sources', jurisdiction: null, policyArea: null, context: null,
      depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null,
      extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false,
      filename: 'policy.txt', mimeType: 'text/plain', bytes,
      readerSources: [{ kind: 'page', url: 'https://www.example.org/capacity-review', about: 'council capacity', note: 'The 2025 review.' }],
      lookUps: ['council delivery capacity evaluation'],
    });
    const status = await drain(analysis.id, { idleTimeoutMs: 20_000 });
    expect(isFinished(status)).toBe(true);
    const full = await detail(owner, analysis.id);
    const artefacts = full?.artefacts ?? [];
    const source = artefacts.find((a) => a.kind === 'research_source' && a.data.supplied === 'reader');
    expect(source).toMatchObject({ url: 'https://www.example.org/capacity-review', label: 'Council delivery capacity review', data: { retrieval: 'full_text', suppliedAs: 'page', note: 'The 2025 review.' } });
    expect(artefacts.find((a) => a.kind === 'research_question' && a.data.asked === 'reader' && a.data.wording === 'council delivery capacity evaluation')).toBeTruthy();
    // Cited like any other source, and graded on what it is.
    expect(artefacts.find((a) => a.kind === 'evidence' && a.data.sourceId === source!.id)?.data).toMatchObject({ result: 'contradicts', grade: 'moderate' });
    // And the remit that only runs when there is something to balance, ran.
    expect(artefacts.some((a) => a.kind === 'assurance_challenge' && a.data.category === 'supplied_balance')).toBe(true);
  }, 60_000);

  it('treats a run with warnings as finished, not failed', () => {
    // Every run without a Tavily key warns, so getting this wrong fails every
    // real assessment a standalone user makes.
    expect(isFinished('completed')).toBe(true);
    expect(isFinished('completed_with_gaps')).toBe(true);
    expect(isFinished('failed')).toBe(false);
    expect(isFinished('cancelled')).toBe(false);
    expect(isFinished('running')).toBe(false);
  });
});
