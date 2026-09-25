import { describe, expect, it } from 'vitest';
import type { Artefact } from './policy-analysis/contracts';
import { leverage } from './policy-analysis/stress';
import { costSegments, forProgress, forTheReport, keptByStage, modelsUsed, reportCost, RUN_INDEX_CAP, STEP_CLIP } from './detail-views';

const a = (id: string, kind: string, extra: Partial<Artefact> = {}): Artefact => ({
  id,
  kind,
  label: id,
  statement: 'a sentence the report might render',
  origin: 'stated_in_document',
  refs: [],
  data: {},
  sourceQuote: 'quoted from the paper',
  ...extra,
} as Artefact);

/**
 * A miniature of the real shape: two assumptions, one of which is cited ONLY by
 * a causal chain — the kind the report never renders and therefore stubs.
 */
const SET: Artefact[] = [
  a('assume_cited_by_chain', 'assumption'),
  a('assume_cited_by_play', 'assumption'),
  a('chain_1', 'causal_chain', {
    data: {
      assumptions: ['assume_cited_by_chain'],
      outcomes: ['a long nested structure the report never draws'],
      negativePathways: ['another one'],
    },
  }),
  a('play_1', 'exploit', { data: { preconditions: ['assume_cited_by_play'] } }),
  a('finding_1', 'finding'),
];

const full = { analysis: {}, stages: [], passes: [{ id: 'p' }], personas: [], heartbeat: null, artefactMetadata: SET.map((x, i) => ({ id: x.id, stage: i, updatedAt: '' })), artefacts: SET };

describe('the report view', () => {
  const view = forTheReport(full);
  const byId = new Map(view.artefacts.map((x) => [x.id, x]));

  it('keeps every artefact, so nothing the report counts goes missing', () => {
    expect(view.artefacts).toHaveLength(SET.length);
  });

  it('strips the prose of a kind the report never renders', () => {
    expect(byId.get('chain_1')!.statement).toBe('');
    expect(byId.get('chain_1')!.sourceQuote).toBeNull();
    expect(byId.get('chain_1')!.data.negativePathways).toBeUndefined();
  });

  it('keeps a chain\'s five steps for the theory-of-change strips, clipped', () => {
    // Phase 19 draws them; everything else a chain carries is still stubbed.
    expect(byId.get('chain_1')!.data.outcomes).toEqual(['a long nested structure the report never draws']);
    const long = forTheReport({ ...full, artefacts: [a('chain_2', 'causal_chain', { data: { inputs: ['x'.repeat(STEP_CLIP + 50)], mechanismId: 'm' } })] });
    const inputs = long.artefacts[0].data.inputs as string[];
    expect(inputs[0].length).toBe(STEP_CLIP);
    expect(inputs[0].endsWith('…')).toBe(true);
    expect(long.artefacts[0].data.mechanismId).toBe('m');
  });

  it('leaves a kind the report DOES render completely alone', () => {
    expect(byId.get('play_1')).toEqual(SET.find((x) => x.id === 'play_1'));
    expect(byId.get('finding_1')!.statement).not.toBe('');
  });

  it('KEEPS the citation keys, so the stress lab still finds its levers', () => {
    // THE WHOLE POINT. `leverage()` counts data.assumptions / preconditions /
    // hypothesisIds on EVERY artefact whatever its kind. On the real run
    // causal_chain supplies 635 of those citations, and dropping the kind
    // outright took the lever list from 414 assumptions to 95.
    const before = leverage(SET).map((row) => row.artefact.id);
    const after = leverage(view.artefacts as Artefact[]).map((row) => row.artefact.id);
    expect(after).toEqual(before);
    expect(after).toContain('assume_cited_by_chain');
  });

  it('drops the members the client cannot read', () => {
    expect(Object.keys(view)).not.toContain('calls');
    expect(Object.keys(view)).not.toContain('executions');
    expect(Object.keys(view)).not.toContain('documents');
    expect(Object.keys(view)).not.toContain('inbound');
  });
});

describe('the progress view', () => {
  const many = Array.from({ length: RUN_INDEX_CAP + 7 }, (_, i) => a(`actor_${i}`, 'actor'));
  const view = forProgress({ ...full, artefacts: [...SET, ...many], artefactMetadata: [...SET, ...many].map((x, i) => ({ id: x.id, stage: i, updatedAt: '' })) });

  it('caps each kind at what the run index shows', () => {
    expect(view.artefacts.filter((x) => x.kind === 'actor')).toHaveLength(RUN_INDEX_CAP);
  });

  it('reports the TRUE total for a kind it capped', () => {
    // A cap that silently changed the count beside the heading would be a
    // quieter kind of wrong than the payload it replaced.
    expect(view.artefactCounts.actor).toBe(RUN_INDEX_CAP + 7);
  });

  it('sends only the metadata for the rows it sent', () => {
    expect(view.artefactMetadata).toHaveLength(view.artefacts.length);
  });

  it('carries no statements at all — the index is links and stage tags', () => {
    expect(view.artefacts.every((x) => x.statement === '')).toBe(true);
  });
});

describe('which models a run was made of', () => {
  const call = (provider: string | null, model: string | null) => ({ provider, model });

  it('counts one model as one entry', () => {
    expect(modelsUsed([call('codex', 'gpt-5.6-luna'), call('codex', 'gpt-5.6-luna')]))
      .toEqual([{ id: 'codex/gpt-5.6-luna', calls: 2 }]);
  });

  it('names BOTH when a resumed stage ran on something else, busiest first', () => {
    // The real case: 419 calls on one model, then a restart resumed the last
    // stage after the configured default had moved, and the report went on
    // naming one model for a run made by two.
    const calls = [
      ...Array.from({ length: 419 }, () => call('codex', 'gpt-5.6-luna')),
      ...Array.from({ length: 2 }, () => call('codex', 'gpt-5.6-sol')),
    ];
    expect(modelsUsed(calls)).toEqual([
      { id: 'codex/gpt-5.6-luna', calls: 419 },
      { id: 'codex/gpt-5.6-sol', calls: 2 },
    ]);
  });

  it('spells an id the way `analysis.model` does, so the two can be compared', () => {
    expect(modelsUsed([call('codex', 'gpt-5.6-luna')])[0].id).toBe('codex/gpt-5.6-luna');
    expect(modelsUsed([call(null, 'gpt-5.6-luna')])[0].id).toBe('gpt-5.6-luna');
  });

  it('does not split one model because some of its calls failed before a provider', () => {
    // THE REAL SHAPE. Six of the live run's 421 calls failed and recorded a null
    // provider, so keying on `provider/model` printed "codex/gpt-5.6-luna (413)"
    // and "gpt-5.6-luna (6)" — a run made by two models rendered as three.
    const calls = [
      ...Array.from({ length: 413 }, () => call('codex', 'gpt-5.6-luna')),
      ...Array.from({ length: 6 }, () => call(null, 'gpt-5.6-luna')),
      ...Array.from({ length: 2 }, () => call('codex', 'gpt-5.6-sol')),
    ];
    expect(modelsUsed(calls)).toEqual([
      { id: 'codex/gpt-5.6-luna', calls: 419 },
      { id: 'codex/gpt-5.6-sol', calls: 2 },
    ]);
  });

  it('says nothing rather than guessing when there are no calls to read', () => {
    expect(modelsUsed(undefined)).toEqual([]);
    expect(modelsUsed([])).toEqual([]);
    // A call that never reached a provider carries no model and is not a model.
    expect(modelsUsed([call('codex', null)])).toEqual([]);
  });
});

describe('what each stage minted', () => {
  it('tallies the rows by the stage that wrote them', () => {
    // The real distribution is the point: stage 2 minted 1,275 of the run's
    // 2,296 artefacts and stage 12 minted none.
    const counts = keptByStage([{ stage: 1 }, { stage: 1 }, { stage: 3 }]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(3)).toBe(1);
  });

  it('gives a stage that minted nothing no entry, so the caller says zero', () => {
    expect(keptByStage([{ stage: 1 }]).has(2)).toBe(false);
  });

  it('ignores a row with no stage on it rather than counting it as stage zero', () => {
    expect(keptByStage([{}, { stage: 0 }]).get(0)).toBe(1);
  });

  it('is attached to every stage the report view sends', () => {
    const view = forTheReport({ ...full, stages: [{ ordinal: 0 }, { ordinal: 1 }] });
    expect(view.stages.map((stage) => stage.kept)).toEqual([1, 1]);
  });
});

describe('what the run cost', () => {
  const usage = (input: number, output: number, extra: Record<string, unknown> = {}) =>
    ({ provider: 'codex', model: 'gpt-5.6-luna', usage: [{ tokensInput: input, tokensOutput: output, ...extra }] });

  it('reads the usage array `Call` now declares', () => {
    // THE FAILURE THIS GUARDS. `Call` was `{ provider; model }` with no `usage`,
    // and `runCost`'s parameter is `{ model?; usage?: unknown }[]` — so passing
    // the old array typechecked perfectly and returned all zeros.
    const cost = reportCost([usage(1_000, 100), usage(2_000, 200)])!;
    expect(cost.input).toBe(3_000);
    expect(cost.output).toBe(300);
    expect(cost.total).toBe(3_300);
    expect(cost.calls).toBe(2);
  });

  it('says nothing rather than drawing a run that spent nothing', () => {
    expect(reportCost(undefined)).toBeNull();
    expect(reportCost([])).toBeNull();
    // Calls with no usage reported are not a run that cost zero.
    expect(reportCost([{ provider: 'codex', model: 'gpt-5.6-luna' }])).toBeNull();
  });

  it('keeps a null price null, because subscription quota is not free money', () => {
    expect(reportCost([usage(10, 1)])!.cash).toBeNull();
    expect(reportCost([usage(10, 1, { costUsd: 0.5 })])!.cash).toBe(0.5);
  });
});

describe('the token split, which is nested and not four categories', () => {
  const cost = reportCost([
    { provider: 'codex', model: 'm', usage: [{ tokensInput: 1_000, tokensOutput: 400, cacheReadTokens: 900, reasoningTokens: 300 }] },
  ])!;

  it('partitions the total exactly, rather than summing overlapping figures', () => {
    // cached is inside input and reasoning is inside output, so adding all four
    // would claim 2,600 tokens for a 1,400-token run.
    const segments = costSegments(cost);
    expect(segments.reduce((n, s) => n + s.tokens, 0)).toBe(cost.total);
    expect(segments.map((s) => s.tokens)).toEqual([900, 100, 300, 100]);
  });

  it('draws no segment for a share that is zero', () => {
    const none = reportCost([{ provider: 'codex', model: 'm', usage: [{ tokensInput: 10, tokensOutput: 0 }] }])!;
    expect(costSegments(none).map((s) => s.key)).toEqual(['fresh']);
  });

  it('clamps a provider figure that overruns the one it sits inside', () => {
    // A `cached` larger than `input` would otherwise draw a negative segment,
    // which is a bar that lies quietly.
    const odd = reportCost([{ provider: 'codex', model: 'm', usage: [{ tokensInput: 100, tokensOutput: 10, cacheReadTokens: 999 }] }])!;
    const segments = costSegments(odd);
    expect(segments.every((s) => s.tokens >= 0)).toBe(true);
    expect(segments.reduce((n, s) => n + s.tokens, 0)).toBe(odd.total);
  });
});
