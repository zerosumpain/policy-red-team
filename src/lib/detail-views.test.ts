import { describe, expect, it } from 'vitest';
import type { Artefact } from './policy-analysis/contracts';
import { leverage } from './policy-analysis/stress';
import { forProgress, forTheReport, modelsUsed, RUN_INDEX_CAP } from './detail-views';

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
    expect(byId.get('chain_1')!.data.outcomes).toBeUndefined();
    expect(byId.get('chain_1')!.data.negativePathways).toBeUndefined();
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
