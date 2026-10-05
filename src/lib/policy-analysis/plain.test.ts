// Phase 23 — plain words for someone who has never read the policy.
//
// The sensitivity sentences are the live Best Start run's (`44dd5420`), where
// stage 9 printed an assumption's id in place of its name 76 times.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { ingest } from './server/ingest';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';
import { graftPlain, idsInProse, isPlainCheck, plainChecks, plainGap, plainRows, promptSchema, stripMalformedPlain, whatItIs, withoutIds, PLAIN_CHECK } from './plain';
import { triageOutput } from './validation';
import { repairPrompt, systemPrompt } from './prompts';

const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');

/** Everything stage 10 needs, built by the fixture model the way a run builds it. */
async function inventory(): Promise<{ prior: Artefact[]; actor: Artefact }> {
  const passages = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  const one = fixtureModel(1, 'k', { stage: 1, artefacts: passages, idPrefix: 's1_p_' } as never).artefacts;
  const two = fixtureModel(2, 'k', { stage: 2, artefacts: [...passages, ...one], idPrefix: 's2_p_' } as never).artefacts;
  const four = fixtureModel(4, 'k', { stage: 4, artefacts: [...passages, ...one, ...two], idPrefix: 's4_p_', targetActorId: two[0].id } as never).artefacts;
  return { prior: [...passages, ...one, ...two, ...four], actor: two[0] };
}
const playReply = (prior: Artefact[], actor: Artefact) => fixtureModel(10, 'k', { stage: 10, artefacts: prior, idPrefix: 's10_p_', targetActorId: actor.id } as never);

describe('a way to beat it carries a plain block, and a missing one costs an ask, never the play', () => {
  it('keeps a play with no block and asks for one', async () => {
    const { prior, actor } = await inventory();
    const reply = structuredClone(playReply(prior, actor));
    delete reply.artefacts[0].data.plain;
    const triaged = triageOutput(reply, 10, prior);
    expect(triaged.artefacts).toHaveLength(1);
    expect(triaged.rejected).toHaveLength(0);
    expect(triaged.incomplete).toMatchObject([{ id: reply.artefacts[0].id, code: 'plain' }]);
    expect(triaged.warnings.join(' ')).not.toMatch(/discarded/);
  });

  it('keeps a play whose block is malformed, drops the block, and says why in the ask', async () => {
    const { prior, actor } = await inventory();
    const reply = structuredClone(playReply(prior, actor));
    (reply.artefacts[0].data.plain as Record<string, unknown>).colour = 'an extra key the strict shape refuses';
    const triaged = triageOutput(reply, 10, prior);
    expect(triaged.artefacts).toHaveLength(1);
    expect(triaged.artefacts[0].data.plain).toBeUndefined();
    expect(triaged.incomplete?.[0].reason).toMatch(/plain/);
  });

  it('owes nothing for a cleared row, and nothing for a complete block', async () => {
    const { prior, actor } = await inventory();
    const reply = structuredClone(playReply(prior, actor));
    expect(triageOutput(reply, 10, prior).incomplete).toEqual([]);
    const cleared = structuredClone(reply);
    delete cleared.artefacts[0].data.plain;
    cleared.artefacts[0].data.cleared = true;
    expect(triageOutput(cleared, 10, prior).incomplete).toEqual([]);
  });

  it('grafts the answer onto the kept play and removes it from the reply', async () => {
    const { prior, actor } = await inventory();
    const kept = structuredClone(playReply(prior, actor).artefacts[0]);
    const block = kept.data.plain;
    delete kept.data.plain;
    const answer = { artefacts: [{ id: kept.id, kind: 'exploit', data: { plain: block } }], warnings: [] };
    const { raw, grafted } = graftPlain(answer, [kept], new Set([kept.id]));
    expect(grafted).toBe(1);
    expect((raw as { artefacts: unknown[] }).artefacts).toHaveLength(0);
    expect(kept.data.plain).toEqual(block);
    // The stored reply is the model's own words and is never touched.
    expect(answer.artefacts).toHaveLength(1);
  });

  it('asks for the block alone, not as a discard', () => {
    const prompt = repairPrompt([{ id: 's10_p_exploit', kind: 'exploit', code: 'plain', reason: 'Kept, but it has no usable plain-words block.' }], 's10_p_');
    expect(prompt).toMatch(/KEPT but have no plain-words block/);
    expect(prompt).not.toMatch(/discarded/);
    const mixed = repairPrompt([
      { id: 's10_p_a', kind: 'exploit', code: 'plain', reason: 'Kept.' },
      { id: 's10_p_b', kind: 'assumption', code: 'hypothesis', reason: 'An assumption must link to an affected actor or mechanism.' },
    ], 's10_p_');
    expect(mixed).toMatch(/Fix and resend ONLY the discarded items/);
    expect(mixed).toMatch(/KEPT but have no plain-words block/);
  });

  it('shows the model the block as required, though it parses as optional', () => {
    const ten = systemPrompt(10);
    expect(ten).toMatch(/"required":\[[^\]]*"plain"/);
    expect(ten).toMatch(/likeWhen/);
    expect(systemPrompt(9)).toMatch(/never by its id/);
    expect(systemPrompt(1)).toMatch(/"required":\[[^\]]*"whatItIs"/);
    expect(systemPrompt(1, null, 'indexed')).toMatch(/data\.whatItIs/);
    expect(promptSchema('finding', { required: ['section'] })).toEqual({ required: ['section'] });
  });
});

describe('reading the block', () => {
  it('draws nothing for an older row, and leaves out a comparison the model said it did not have', () => {
    expect(plainRows(artefact('s10_x', 'exploit', 'A play', 'x', {}))).toEqual([]);
    const rows = plainRows(artefact('s10_y', 'exploit', 'A play', 'x', { plain: { who: 'The Council.', does: 'It does less.', goesWrong: 'A parent waits.', likeWhen: null, whyItMatters: 'Help is slower.' } }));
    expect(rows.map((r) => r.label)).toEqual(['Who', 'What they do', 'What goes wrong', 'Why it matters']);
  });

  it('strips a malformed whatItIs and keeps the part of the policy', () => {
    const m = { kind: 'mechanism', data: { intervention: 'x', implementation: 'y', notes: 'z', whatItIs: '' } as Record<string, unknown> };
    expect(stripMalformedPlain(m)).toMatch(/whatItIs/);
    expect(m.data.whatItIs).toBeUndefined();
    expect(whatItIs(artefact('m', 'mechanism', 'Family Hubs', 'x', { whatItIs: ' Local centres. ' }))).toBe('Local centres.');
  });

  it('a block is missing only where it is owed', () => {
    expect(plainGap(artefact('s9_x', 'scenario', 'S', 'x', {}))).toBe('missing');
    expect(plainGap(artefact('s12_x', 'finding', 'F', 'x', {}))).toBeNull();
  });
});

const REAL_SENSITIVITY = [
  'If s1_023_assumption_001 is true, providers can supply enough suitable places. Cooperation then produces clearer access gains.',
  'If s1_019_assumption_001 and s1_019_assumption_002 are true, organisations adopt and safely use the identifier and sharing duty.',
  'The assumption that providers can supply funded places, s1_020_assumption_001, most changes the conclusion.',
];

describe('ids never reach a reader', () => {
  const assumption = (id: string, label: string) => artefact(id, 'assumption', label, 'x', { importance: 1, uncertainty: 1, consequence: 1, notes: 'x' });
  const run = [
    assumption('s1_023_assumption_001', 'Provider capacity is sufficient'),
    assumption('s1_019_assumption_001', 'Identifier adoption'),
    assumption('s1_020_assumption_001', 'Providers can supply funded places'),
    artefact('test_veto', 'test', 'Veto check', 'x', {}),
    artefact('s9_000_001', 'scenario', 'Genuine cooperation', 'x', { firstActor: 's1_023_assumption_001', assumptions: ['s1_023_assumption_001'], sensitivity: REAL_SENSITIVITY }),
  ];

  it('finds the ids the live run wrote, and not a section name', () => {
    expect(REAL_SENSITIVITY.flatMap(idsInProse)).toEqual(['s1_023_assumption_001', 's1_019_assumption_001', 's1_019_assumption_002', 's1_020_assumption_001']);
    expect(idsInProse('The test_results section and the high_risk_assumptions one.')).toEqual([]);
  });

  it('names each in words at display, and leaves every reference alone', () => {
    const shown = withoutIds(run);
    const scenario = shown.find((a) => a.id === 's9_000_001')!;
    const sentences = scenario.data.sensitivity as string[];
    expect(sentences[0]).toBe('If “Provider capacity is sufficient” is true, providers can supply enough suitable places. Cooperation then produces clearer access gains.');
    // An id the run does not hold is still not shown.
    expect(sentences[1]).toMatch(/^If “Identifier adoption” and another item in this assessment are true/);
    expect(sentences.flatMap(idsInProse)).toEqual([]);
    expect(scenario.data.firstActor).toBe('s1_023_assumption_001');
    expect(scenario.data.assumptions).toEqual(['s1_023_assumption_001']);
    expect(withoutIds([artefact('s12_f', 'finding', 'F', 'See test_veto and test_results.', {}), ...run])[0].statement).toBe('See “Veto check” and test_results.');
  });

  it('returns the same array when nothing changes, so a memo does not churn', () => {
    const clean = run.filter((a) => a.kind !== 'scenario');
    expect(withoutIds(clean)).toBe(clean);
  });
});

describe('the plain-English checks are warnings, one per kind of slip', () => {
  it('names an id in prose, a missing block, an undefined part and a long line', () => {
    const long = Array.from({ length: 40 }, () => 'word').join(' ');
    const warnings = plainChecks([
      artefact('s9_a', 'scenario', 'With an id', 'x', { sensitivity: ['If s1_023_assumption_001 is true, more places.'], plain: { what: 'a', firstMove: 'b', result: 'c', whyItMatters: 'd' } }),
      artefact('s9_b', 'scenario', 'No block', 'x', {}),
      artefact('s1_m', 'mechanism', 'Family Hubs', 'x', { intervention: 'x', implementation: 'y', notes: 'z' }),
      artefact('s10_l', 'exploit', 'Long', 'x', { plain: { who: long, does: 'b', goesWrong: 'c', likeWhen: null, whyItMatters: 'd' } }),
    ]);
    expect(warnings).toHaveLength(4);
    expect(warnings.every(isPlainCheck)).toBe(true);
    expect(warnings.every((w) => w.startsWith(PLAIN_CHECK) && w.length <= 1000)).toBe(true);
    expect(warnings.join('\n')).toMatch(/identifier in a sentence[\s\S]*no plain-words summary[\s\S]*no everyday description[\s\S]*soft limit/);
  });

  it('says nothing about a clean stage', () => {
    expect(plainChecks([artefact('s12_f', 'finding', 'A finding about test_results', 'Nothing to see.', {})])).toEqual([]);
  });
});
