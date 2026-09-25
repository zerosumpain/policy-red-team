// Phase 19 workstream A — key judgements: what makes one, and how it is read.
//
// The validator's two refusals are the point of the kind: a judgement with no
// mechanism and no play is "stage the pilots", which would fit any white paper.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { scoreExploits } from './exposure';
import { keyJudgements, reconcileKeyJudgements } from './judgements';
import { assessmentMarkdown } from './report-doc';
import { shareableReport } from './share';
import { triageArtefacts } from './validation';

const passage = artefact('passage_0001', 'passage', 'Page 4', 'Colleges will be funded on completion rates from 2027.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, startOffset: 100, endOffset: 160, page: 4 });
const mechanism = { ...artefact('s1_000_mechanism', 'mechanism', 'Completion funding', 'Funding follows completion.', { intervention: 'i', implementation: 'x', notes: 'n' }), origin: 'extracted_fact' as const, sourceId: passage.id, sourceQuote: 'funded on completion rates', refs: [passage.id] };
const assumption = artefact('s1_000_assumption', 'assumption', 'Completion means learning', 'Completion tracks learning.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'n' }, { refs: [passage.id, mechanism.id] });
const actor = artefact('s2_000_actor', 'actor', 'Colleges', 'Further education colleges.', { entityType: 'provider' }, { refs: [passage.id] });
const [play] = scoreExploits([artefact('s10_000_exploit', 'exploit', 'Cream-skimming the likeliest completers', 'Enrol the learners most likely to finish.', {
  actorId: actor.id, motivation: 'm', play: 'Enrol the likeliest completers.', legality: 'compliant', targets: [mechanism.id], preconditions: [assumption.id], payoff: 'p', costToPolicy: 'c',
  incentive: 0.8, ease: 0.8, impact: 0.8, concealment: 0.8, earlyWarning: 'e', counter: 'c', precedent: 'None.', precedentBasis: 'none',
}, { refs: [mechanism.id, assumption.id] })]);
const prior: Artefact[] = [passage, mechanism, assumption, actor, play];

const judgement = (over: Record<string, unknown> = {}, id = 's17_000_judgement', patch: Partial<Artefact> = {}) => artefact(id, 'key_judgement', 'Colleges will pick finishers', 'Colleges will enrol the learners likeliest to finish, so completion funding rewards selection rather than teaching.', {
  rank: 1, mechanismId: mechanism.id, playIds: [play.id], assumptionId: assumption.id,
  wouldChangeIf: 'Enrolment mix stays stable after funding changes.', decision: 'Whether to fund on completion from 2027.',
  action: 'Publish enrolment mix by college before the switch.', owner: 'Department for Education', ...over,
}, { refs: [mechanism.id], sourceId: passage.id, sourceQuote: 'funded on completion rates', origin: 'structural_inference', ...patch });

describe('what a key judgement must carry', () => {
  it('keeps one that names its mechanism, play and assumption and quotes the paper, and takes the page from the passage', () => {
    const triaged = triageArtefacts({ artefacts: [judgement()], warnings: [] }, 17, prior);
    expect(triaged.rejected).toHaveLength(0);
    const [kept] = triaged.artefacts;
    expect(kept.page).toBe(4);
    expect(kept.startOffset).toBe(100 + passage.statement.indexOf('funded on completion rates'));
    expect(kept.refs).toEqual(expect.arrayContaining([mechanism.id, play.id, assumption.id, passage.id]));
  });

  it('refuses one with no mechanism', () => {
    const triaged = triageArtefacts({ artefacts: [judgement({ mechanismId: assumption.id })], warnings: [] }, 17, prior);
    expect(triaged.rejected[0]).toMatchObject({ code: 'traceability', reason: expect.stringContaining('mechanism') });
  });

  it('refuses one with no play, and narrows a list that names something else beside a play', () => {
    const none = triageArtefacts({ artefacts: [judgement({ playIds: [mechanism.id] })], warnings: [] }, 17, prior);
    expect(none.rejected[0]).toMatchObject({ code: 'traceability', reason: expect.stringContaining('play') });
    const mixed = triageArtefacts({ artefacts: [judgement({ playIds: [mechanism.id, play.id] })], warnings: [] }, 17, prior);
    expect(mixed.artefacts[0].data.playIds).toEqual([play.id]);
  });

  it('refuses one whose quote is not in the paper, whatever origin it claims', () => {
    const invented = triageArtefacts({ artefacts: [judgement({}, 's17_000_judgement', { sourceQuote: 'words the paper never used' })], warnings: [] }, 17, prior);
    expect(invented.rejected[0]).toMatchObject({ code: 'span', reason: expect.stringContaining('quote the paper') });
    const unquoted = triageArtefacts({ artefacts: [judgement({}, 's17_000_judgement', { sourceId: null, sourceQuote: null })], warnings: [] }, 17, prior);
    expect(unquoted.rejected[0]?.code).toBe('span');
  });

  it('does not belong to any stage but assured synthesis and a restatement', () => {
    expect(triageArtefacts({ artefacts: [judgement()], warnings: [] }, 12, prior).rejected[0]?.code).toBe('contract');
    expect(triageArtefacts({ artefacts: [judgement({}, 's100_000_judgement')], warnings: [] }, 100, prior, 'restatement').rejected).toHaveLength(0);
  });
});

describe('a surplus is reconciled', () => {
  it('keeps the last of each rank, then the top five, renumbered from one', () => {
    const rows = [3, 1, 9, 1, 4, 7, 2].map((rank, i) => judgement({ rank }, `s17_00${i}_judgement`));
    const { kept, dropped } = reconcileKeyJudgements(rows);
    expect(kept.map((j) => j.id)).toEqual(['s17_003_judgement', 's17_006_judgement', 's17_000_judgement', 's17_004_judgement', 's17_005_judgement']);
    expect(kept.map((j) => j.data.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(dropped.map((j) => j.id).sort()).toEqual(['s17_001_judgement', 's17_002_judgement']);
  });
});

describe('the view a report reads', () => {
  const current = [judgement({ rank: 2 }, 's17_001_judgement'), judgement({ rank: 1 }, 's17_000_judgement')];
  const all: Artefact[] = [...prior, ...current];

  it('joins each judgement to what it names, in rank order, with the pattern its play falls into', () => {
    const [first, second] = keyJudgements(all);
    expect([first.rank, second.rank]).toEqual([1, 2]);
    expect(first.mechanism?.id).toBe(mechanism.id);
    expect(first.plays.map((p) => p.id)).toEqual([play.id]);
    expect(first.patterns).toEqual([{ key: 'selective_take_up', label: 'Picking the easy cases', rank: 1 }]);
    expect(first.assumption?.id).toBe(assumption.id);
    expect(first.quote).toMatchObject({ text: 'funded on completion rates', sourceId: passage.id });
    expect(first.owner).toBe('Department for Education');
  });

  it('shows the latest generation only, so a restatement replaces rather than adds', () => {
    const restated = judgement({ rank: 1 }, 's100_000_judgement');
    const views = keyJudgements([...all, restated]);
    expect(views.map((v) => v.artefact.id)).toEqual([restated.id]);
  });

  it('leads the Word document, and turns the nineteen sections into the appendix', () => {
    const finding = artefact('s17_010_finding', 'finding', 'Executive assessment', 'The verdict.', { section: 'executive_assessment', revision: 'assured', resultIds: [play.id], hypothesisIds: [assumption.id] }, { refs: [play.id] });
    const doc = assessmentMarkdown([...all, finding], { title: 'T' });
    const at = (s: string) => doc.indexOf(s);
    expect(at('## Key judgements')).toBeGreaterThan(at('## The verdict'));
    expect(at('## Key judgements')).toBeLessThan(at('## Ways to beat the policy'));
    expect(doc).toContain('**Who should act.** Department for Education: Publish enrolment mix by college before the switch.');
    expect(doc).toContain('> “funded on completion rates”');
    expect(at('## Appendix: the assessment in full')).toBeGreaterThan(at('## Key judgements'));
    // Before key judgements existed, no appendix heading and no empty section.
    const legacy = assessmentMarkdown([...prior, finding], { title: 'T' });
    expect(legacy).not.toContain('## Key judgements');
    expect(legacy).not.toContain('Appendix: the assessment in full');
  });

  it('travels in a shared copy like a finding: the quote stays, the withheld passage does not', () => {
    const shared = shareableReport({ artefacts: all, stages: [] });
    const [kept] = shared.artefacts.filter((a) => a.kind === 'key_judgement');
    expect(kept.sourceQuote).toBe('funded on completion rates');
    expect(kept.sourceId).toBeNull();
    expect(kept.refs).not.toContain(passage.id);
    expect(kept.data.playIds).toEqual([play.id]);
  });
});
