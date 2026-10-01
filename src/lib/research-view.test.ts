// Phase 22 part 2 — "Checked outside the paper", per question and per item.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { itemChecks, researchChecks } from './research-view';

const assumption = artefact('s1_a', 'assumption', 'Councils have the staff', 'a', { importance: 1, uncertainty: 1, consequence: 1, notes: '' });
const claim = artefact('s1_c', 'claim', 'Every council opens a hub', 'c', { category: 'claim', notes: '' });
const question = (id: string, priority: number, extra: Record<string, unknown> = {}, refs = [assumption.id]) =>
  artefact(id, 'research_question', `Question ${id}`, '', { priority, rationale: `Why ${id}`, gap: `Gap ${id}`, ...extra }, { refs });
const source = (id: string, questionId: string, extra: Record<string, unknown> = {}) =>
  artefact(id, 'research_source', `Source ${id}`, 'text', { questionId, retrieval: 'search_excerpt', ...extra }, { url: `https://example.org/${id}`, origin: 'external_evidence' });
const evidence = (id: string, sourceId: string, result: string, grade: string, extra: Record<string, unknown> = {}) =>
  artefact(id, 'evidence', `Evidence ${id}`, '', { claimId: claim.id, mechanismId: null, actorId: null, assumptionId: null, sourceId, result, grade, sourceQuality: '', ...extra }, { refs: [claim.id, sourceId] });

const all: Artefact[] = [
  assumption, claim,
  question('q_low', 0.55),
  question('q_high', 0.9),
  question('q_reader', 1, { asked: 'reader', wording: 'family hubs evaluation' }, ['passage_0001']),
  source('src_1', 'q_high'),
  source('src_2', 'q_high', { retrieval: 'full_text' }),
  source('src_sup', 'q_reader', { retrieval: 'full_text', supplied: 'reader', aboutIds: [assumption.id] }),
  evidence('e1', 'src_1', 'supports', 'moderate'),
  evidence('e2', 'src_2', 'contradicts', 'moderate'),
  evidence('e3', 'src_sup', 'contradicts', 'moderate', { claimId: null }),
];

describe('researchChecks', () => {
  const checks = researchChecks(all);

  it('puts the reader’s questions first, then the model’s by priority, ranked among themselves', () => {
    expect(checks.questions.map((q) => q.question.id)).toEqual(['q_reader', 'q_high', 'q_low']);
    expect(checks.questions.map((q) => [q.askedBy, q.rank])).toEqual([['you', null], ['the model', 1], ['the model', 2]]);
    expect(checks.ranked).toBe(2);
  });

  it('says what came back, how much was read, and what it did', () => {
    const high = checks.questions[1];
    expect(high.sources.map((s) => [s.title, s.fullText, s.gradeLabel])).toEqual([['Source src_1', false, 'Weak'], ['Source src_2', true, 'Moderate']]);
    expect(high.outcome).toBe('mixed');
    expect(high.targets.map((t) => t.id)).toEqual([assumption.id]);
  });

  it('marks a supplied source, and a question nothing answered as open', () => {
    expect(checks.questions[0].sources[0].supplied).toBe(true);
    expect(checks.questions[0].outcome).toBe('contradicts');
    expect(checks.questions[2]).toMatchObject({ outcome: 'nothing', open: true, gap: 'Gap q_low' });
  });

  it('counts the lot', () => {
    expect(checks.counts).toEqual({ questions: 3, asked: 1, answered: 2, sources: 3, fullText: 2, supplied: 1, open: 1, unasked: 0 });
  });

  it('says a question was never searched when the run says so, rather than that nothing came back', () => {
    const said = researchChecks(all, ['This stage raised 3 further questions and followed up 2: … Not pursued: Question q_low.']);
    expect(said.questions[2]).toMatchObject({ outcome: 'unasked', open: true, nothingBecause: expect.stringMatching(/^Not searched/) });
    const searched = researchChecks(all, ['Enquiry round 2: No sources found for Question q_low.']);
    expect(searched.questions[2]).toMatchObject({ outcome: 'nothing', nothingBecause: 'Searched, and the search found nothing.' });
  });
});

describe('itemChecks', () => {
  it('finds links naming the item, and links from a source supplied about it', () => {
    // Strongest first: e1 is a snippet, so weak whatever it claimed.
    expect(itemChecks(all, claim.id).map((c) => c.evidence.id)).toEqual(['e2', 'e1']);
    const about = itemChecks(all, assumption.id);
    expect(about.map((c) => [c.evidence.id, c.supplied, c.fullText])).toEqual([['e3', true, true]]);
  });

  it('for a source, the links drawn from it; for a question, the links from its sources', () => {
    expect(itemChecks(all, 'src_2').map((c) => c.evidence.id)).toEqual(['e2']);
    expect(itemChecks(all, 'q_high').map((c) => c.evidence.id).sort()).toEqual(['e1', 'e2']);
  });

  it('never counts the paper citing itself as a check outside it', () => {
    const passage = artefact('passage_0001', 'passage', 'p', 'p', {});
    const own = artefact('e_paper', 'evidence', 'e', '', { claimId: claim.id, sourceId: passage.id, result: 'supports' }, { refs: [passage.id] });
    expect(itemChecks([...all, passage, own], claim.id).map((c) => c.evidence.id)).not.toContain('e_paper');
  });
});
