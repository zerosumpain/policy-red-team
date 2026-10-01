// Phase 22 — grade the evidence, and let the grade constrain the judgement.
//
// The quality sentences below are real ones from the Best Start run
// (`44dd5420`), where every one of the 197 evidence rows rests on the paper or
// on a search excerpt and none states a grade.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { briefLimits } from '$lib/brief';
import {
  NOTHING_READ, NOTHING_READ_IN_FULL, evidenceReadLine, gradeFromText, gradeOf, gradeTally, markDownJudgements, markedDown,
} from '$lib/evidence-grade';

const passage = artefact('passage_0001', 'passage', 'Page 2', 'The paper says hubs work.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });
const source = (id: string, retrieval: 'full_text' | 'search_excerpt') => artefact(id, 'research_source', id, 's', { questionId: 'q', retrievedAt: 'now', quality: 'q', qualityBasis: 'b', freshness: 'f', jurisdictionalRelevance: 'j', retrieval, gap: 'g' });
const excerpt = source('source_s5_000_rq_001_1', 'search_excerpt');
const fullText = source('source_s5_000_rq_001_2', 'full_text');
const claim = artefact('s1_000_claim', 'claim', 'Hubs reach families', 'c', {}, { refs: [passage.id] });
const row = (id: string, sourceId: string | null, sourceQuality: string, over: Record<string, unknown> = {}, refs: string[] = []): Artefact =>
  artefact(id, 'evidence', `Evidence ${id}`, 'e', { claimId: claim.id, mechanismId: null, actorId: null, assumptionId: null, sourceId: sourceId ?? '', evidenceType: 't', result: 'supports', sourceQuality, relevance: 'r', freshness: 'f', dispute: 'd', ...over }, { refs: sourceId ? [sourceId, ...refs] : refs, sourceId });
const byId = (all: Artefact[]) => new Map(all.map((a) => [a.id, a]));

describe('a grade read from a quality sentence', () => {
  it('takes the lowest step the sentence names', () => {
    expect(gradeFromText('Moderate for descriptive provider data, but weak because this is a search excerpt and the publication date is unverified.')).toBe('weak');
    expect(gradeFromText('Moderate. The source is a government evaluation, but only an excerpt was reviewed.')).toBe('moderate');
    expect(gradeFromText('High quality: a systematic review of 40 trials.')).toBe('strong');
    expect(gradeFromText('Primary policy passage, but it states an objective rather than measured impact.')).toBeNull();
  });

  it('never reads "none" off a sentence — that step means no source at all', () => {
    expect(gradeFromText('None of the evaluations measured outcomes.')).toBeNull();
  });
});

describe('a row\'s grade, conservatively', () => {
  const all = [passage, excerpt, fullText, claim];

  it('caps anything resting only on a search excerpt at weak, whatever the sentence hopes', () => {
    const r = row('e1', excerpt.id, 'Moderate because it is government modelling with stated uncertainty.');
    expect(gradeOf(r, byId([...all, r]))).toEqual({ grade: 'weak', derived: true });
    const stated = row('e2', excerpt.id, 'An RCT.', { grade: 'strong' });
    expect(gradeOf(stated, byId([...all, stated]))).toEqual({ grade: 'weak', derived: false });
  });

  it('caps the paper\'s own word at weak, and reads a silent sentence as weak', () => {
    const r = row('e3', passage.id, 'Primary policy passage, but the underlying survey methods are not supplied here.');
    expect(gradeOf(r, byId([...all, r])).grade).toBe('weak');
  });

  it('lets a source read in full carry what its sentence says', () => {
    const r = row('e4', fullText.id, 'Strong: a randomised trial, read in full.');
    expect(gradeOf(r, byId([...all, r])).grade).toBe('strong');
    const stated = row('e5', fullText.id, 'Official statistics.', { grade: 'moderate' });
    expect(gradeOf(stated, byId([...all, stated]))).toEqual({ grade: 'moderate', derived: false });
  });

  it('is none only when no source is named, and weak when the named one is withheld', () => {
    const none = row('e6', null, 'Strong.');
    expect(gradeOf(none, byId([...all, none])).grade).toBe('none');
    // A shared copy drops every passage; the row still cites the paper.
    const withheld = row('e7', 'passage_0099', 'Strong.');
    expect(gradeOf(withheld, byId([...all, withheld])).grade).toBe('weak');
  });

  it('tallies every grade, zeros kept, and says how many were worked out', () => {
    const rows = [row('e1', excerpt.id, 'Moderate.'), row('e4', fullText.id, 'Strong.'), row('e5', fullText.id, 'x', { grade: 'moderate' })];
    const tally = gradeTally([...all, ...rows]);
    expect(tally.rows.map((r) => [r.grade, r.count])).toEqual([['strong', 1], ['moderate', 1], ['weak', 1], ['none', 0]]);
    expect(tally).toMatchObject({ total: 3, derived: 2 });
  });
});

describe('the judgement the evidence will carry', () => {
  const finding = (judgement: string, refs: string[] = [claim.id]) => artefact('s17_000_finding', 'finding', 'Hubs reach families', 'f', { section: 'mechanisms', resultIds: ['t'], hypothesisIds: ['h'], revision: 'assured', judgement }, { refs });

  it('marks "well supported" down when the best evidence behind it is weak, and says why', () => {
    const all = [passage, excerpt, claim, row('e1', excerpt.id, 'Moderate, but a search excerpt.'), finding('well_supported')];
    const out = markDownJudgements(all);
    const f = out.find((a) => a.id === 's17_000_finding')!;
    expect(f.data.judgement).toBe('supported_with_limits');
    expect(markedDown(f)).toEqual({ from: 'well_supported', reason: expect.stringMatching(/^Marked down from well supported: the best evidence behind it is weak/) });
    // The stored row is untouched: this is a reading, not a rewrite.
    expect(all.find((a) => a.id === 's17_000_finding')!.data.judgement).toBe('well_supported');
  });

  it('leaves it where strong evidence read in full stands behind it', () => {
    const all = [passage, fullText, claim, row('e4', fullText.id, 'Strong: a trial.'), finding('well_supported')];
    expect(markDownJudgements(all)).toBe(all);
  });

  it('falls back on the run\'s best evidence when nothing is cited, and never marks anything up', () => {
    const weakRun = [passage, excerpt, claim, row('e1', excerpt.id, 'Weak.'), finding('well_supported', ['other'])];
    expect(markDownJudgements(weakRun).find((a) => a.kind === 'finding')!.data.judgement).toBe('supported_with_limits');
    const provisional = [passage, excerpt, claim, row('e1', excerpt.id, 'Weak.'), finding('provisional')];
    expect(markDownJudgements(provisional)).toBe(provisional);
  });

  it('takes "supported with limits" to provisional only when there is no evidence at all', () => {
    const bare = [passage, claim, finding('supported_with_limits')];
    const f = markDownJudgements(bare).find((a) => a.kind === 'finding')!;
    expect(f.data.judgement).toBe('provisional');
    expect(markedDown(f)?.reason).toMatch(/no evidence row stands behind it/);
    const weak = [passage, excerpt, claim, row('e1', excerpt.id, 'Weak.'), finding('supported_with_limits')];
    expect(markDownJudgements(weak)).toBe(weak);
  });
});

describe('what was read, in the trust card', () => {
  it('says nothing outside the paper was read in full when research returned only snippets', () => {
    expect(evidenceReadLine([excerpt])).toBe(NOTHING_READ_IN_FULL);
    expect(NOTHING_READ_IN_FULL).toBe('Nothing outside the paper was read in full; these judgements rest on the paper and search snippets.');
  });

  it('says the paper alone when there was no search, and nothing when something was read in full', () => {
    expect(evidenceReadLine([passage])).toBe(NOTHING_READ);
    expect(evidenceReadLine([excerpt, fullText])).toBeNull();
  });

  it('leads the brief\'s limits, and gives way to a sealed run\'s own line', () => {
    expect(briefLimits([], [excerpt])[0]).toBe(NOTHING_READ_IN_FULL);
    const sealed = briefLimits([{ name: 'Targeted research', warnings: ['This is a sealed assessment, so research was not run.'] }], [passage]);
    expect(sealed).not.toContain(NOTHING_READ);
    expect(sealed[0]).toMatch(/sealed/);
  });
});
