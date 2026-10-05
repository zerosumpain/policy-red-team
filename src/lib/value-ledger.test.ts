import { describe, expect, it } from 'vitest';
import { drawn, percent, valueLedger } from './value-ledger';
import { runFacts } from './offline-run';

/**
 * A three-step run small enough to count by hand: ingestion makes two
 * passages, decomposition makes a claim and an actor mention in two calls (one
 * corrective), and the graph makes an edge citing the claim in one call that
 * read half its input from the cache, plus one that timed out.
 */
const stages = [
  { id: 'st0', ordinal: 0, name: 'Document ingestion' },
  { id: 'st1', ordinal: 1, name: 'Document decomposition' },
  { id: 'st3', ordinal: 3, name: 'Policy knowledge graph' },
];
const executions = [{ id: 'ex1', stageId: 'st1' }, { id: 'ex3', stageId: 'st3' }];
const usage = (input: number, output: number, cached = 0) => [{ tokensInput: input, tokensOutput: output, cacheReadTokens: cached }];
const calls = [
  { executionId: 'ex1', callKey: 'passage_0001', status: 'completed', usage: usage(1_000, 200) },
  { executionId: 'ex1', callKey: 'passage_0001#repair1', status: 'completed', usage: usage(1_200, 50) },
  { executionId: 'ex3', callKey: '000', status: 'completed', usage: usage(10_000, 300, 5_000) },
  { executionId: 'ex3', callKey: '001', status: 'failed', usage: [] },
];
const artefacts = [
  { id: 'passage_0001', kind: 'passage', refs: [] },
  { id: 'passage_0002', kind: 'passage', refs: [] },
  { id: 's1_000_claim_001', kind: 'claim', refs: ['passage_0001'] },
  { id: 's1_000_actor_001', kind: 'actor', refs: ['passage_0001'] },
  { id: 's3_000_edge_001', kind: 'edge', refs: ['s1_000_claim_001'] },
];
const artefactMetadata = [
  { id: 'passage_0001', stage: 0 }, { id: 'passage_0002', stage: 0 },
  { id: 's1_000_claim_001', stage: 1 }, { id: 's1_000_actor_001', stage: 1 },
  { id: 's3_000_edge_001', stage: 3 },
];

describe('the value ledger', () => {
  const ledger = valueLedger({ stages, executions, calls, artefacts, artefactMetadata })!;
  const row = (ordinal: number) => ledger.rows.find((r) => r.ordinal === ordinal)!;

  it('sums every round of every call, by the step its execution belongs to', () => {
    expect(row(1)).toMatchObject({ calls: 2, repairs: 1, input: 2_200, output: 250, cached: 0, unrecorded: 0 });
    // The timed-out call is counted as a call and named as unrecorded, never as zero tokens spent.
    expect(row(3)).toMatchObject({ calls: 2, repairs: 0, input: 10_000, cached: 5_000, unrecorded: 1 });
    expect(ledger.total).toMatchObject({ calls: 4, repairs: 1, input: 12_200, output: 550, cached: 5_000, unrecorded: 1 });
  });

  it('counts an item as cited only when a LATER step names it', () => {
    // One passage cited by decomposition; the claim cited by the graph; the
    // actor mention by nobody.
    expect(row(0)).toMatchObject({ made: 2, cited: 1 });
    expect(row(1)).toMatchObject({ made: 2, cited: 1 });
    // The last step that made anything: its items are the reader's, not a later step's.
    expect(row(3).cited).toBeNull();
  });

  it('counts what a reader meets on a page — a resolved body is drawn, a mention is not', () => {
    expect(row(1).shown).toBe(1);
    expect(drawn({ id: 's2_000_actor_001', kind: 'actor' })).toBe(true);
    expect(drawn({ id: 's1_000_actor_001', kind: 'actor' })).toBe(false);
    for (const kind of ['alias', 'node', 'persona_link', 'option_appraisal']) expect(drawn({ id: 'x', kind })).toBe(false);
  });

  it('says nothing, rather than zeros, where it cannot tie a call to a step', () => {
    expect(valueLedger({ stages: stages.map(({ ordinal, name }) => ({ ordinal, name })), executions, calls, artefacts, artefactMetadata })).toBeNull();
    expect(valueLedger({ stages, executions, calls: [], artefacts, artefactMetadata })).toBeNull();
  });

  it('prints a share, and a dash where there is nothing to divide by', () => {
    expect(percent(5_000, 10_000)).toBe('50%');
    expect(percent(0, 0)).toBe('—');
  });

  it('travels in the pack\'s run facts, so the pack draws the same table', () => {
    const facts = runFacts({
      analysis: { model: null, thinkingLevel: null, depth: 'standard' },
      stages: stages.map((s) => ({ ...s, status: 'completed', error: null })),
      calls: calls.map((c) => ({ ...c, provider: 'codex', model: 'm' })),
      artefactMetadata, artefacts, executions,
    });
    expect(facts.ledger?.total.input).toBe(12_200);
    // And an older caller that hands over no executions gets none, not a wrong one.
    expect(runFacts({ analysis: { model: null, thinkingLevel: null, depth: 'standard' }, stages: [] }).ledger).toBeNull();
  });
});
