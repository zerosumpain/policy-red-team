// Phase 19 workstream B — the one-page brief: what it holds, in what order,
// and the fallback for an assessment written before key judgements existed.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { scoreExploits } from '$lib/policy-analysis/exposure';
import { shareableReport } from '$lib/policy-analysis/share';
import { briefMarkdown } from '$lib/policy-analysis/report-doc';
import { BRIEF_LIMITS, briefLimits, briefOf, clip, sentences } from './brief';

const passage = artefact('passage_0001', 'passage', 'Page 4', 'Colleges will be funded on completion rates from 2027.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, page: 4 });
const mechanism = { ...artefact('s1_000_mechanism', 'mechanism', 'Completion funding', 'Funding follows completion.', { intervention: 'i', implementation: 'x', notes: 'n' }), origin: 'extracted_fact' as const, sourceId: passage.id, sourceQuote: 'funded on completion rates', page: 4, refs: [passage.id] };
const assumption = artefact('s1_000_assumption', 'assumption', 'Completion means learning', 'Completion tracks learning.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'n' }, { refs: [passage.id, mechanism.id] });
const actor = artefact('s2_000_actor', 'actor', 'Colleges', 'Further education colleges.', { entityType: 'provider' }, { refs: [passage.id] });
const plays = scoreExploits([
  artefact('s10_000_exploit_001', 'exploit', 'Cream-skimming the likeliest completers', 'Enrol the learners most likely to finish.', {
    actorId: actor.id, motivation: 'm', play: 'Enrol the likeliest completers.', legality: 'compliant', targets: [mechanism.id], preconditions: [assumption.id], payoff: 'p', costToPolicy: 'c',
    incentive: 0.9, ease: 0.9, impact: 0.9, concealment: 0.9,
    earlyWarning: 'Enrolment of learners with low prior attainment falls. It falls fastest where funding is tightest.',
    counter: 'Weight completion by prior attainment. Publish the mix.', precedent: 'None.', precedentBasis: 'none',
  }, { refs: [mechanism.id, assumption.id] }),
  artefact('s10_000_exploit_002', 'exploit', 'Minimal visible compliance with the report', 'File the report and change nothing.', {
    actorId: actor.id, motivation: 'm', play: 'Tick the box.', legality: 'compliant', targets: [mechanism.id], preconditions: [assumption.id], payoff: 'p', costToPolicy: 'c',
    incentive: 0.3, ease: 0.3, impact: 0.3, concealment: 0.3, earlyWarning: 'Reports arrive on time.', counter: 'Audit a sample.', precedent: 'None.', precedentBasis: 'none',
  }, { refs: [mechanism.id] }),
]);
const prior: Artefact[] = [passage, mechanism, assumption, actor, ...plays];

const exec = artefact('s17_main_finding_001', 'finding', 'Executive assessment', 'The policy rewards selection rather than teaching. Colleges can meet the measure by choosing who they enrol. Nothing in the paper checks the mix.', { section: 'executive_assessment', revision: 'assured', judgement: 'well_supported', resultIds: [] });
const finding = (id: string, section: string, resultIds: string[], label = `${section} finding`) =>
  artefact(id, 'finding', label, `${label} statement. A second sentence. A third that the brief leaves out.`, { section, revision: 'assured', judgement: 'supported_with_limits', resultIds }, { refs: resultIds });
const findings = [
  exec,
  finding('s17_main_finding_002', 'exploitation', [plays[0].id], 'Selection is the sharpest play'),
  finding('s17_main_finding_003', 'mechanisms', [mechanism.id], 'Completion funding is exposed'),
];
const rec = artefact('s17_main_recommendation_001', 'recommendation', 'Weight completion by prior attainment', 'Weight it.', { revision: 'assured', findingIds: ['s17_main_finding_002'] });

const judgement = (rank: number, over: Record<string, unknown> = {}) => artefact(`s17_00${rank}_judgement`, 'key_judgement', `Judgement ${rank}`, `Colleges will pick finishers (${rank}).`, {
  rank, mechanismId: mechanism.id, playIds: [plays[1].id, plays[0].id], assumptionId: assumption.id,
  wouldChangeIf: 'Enrolment mix stays stable after funding changes.', decision: 'Whether to fund on completion.',
  action: 'Publish enrolment mix by college before the switch.', owner: 'Department for Education', ...over,
}, { refs: [mechanism.id], sourceId: passage.id, sourceQuote: 'funded on completion rates', page: 4, origin: 'structural_inference' });

const STAGES = [
  { name: 'Targeted research', ordinal: 5, warnings: ['Research unavailable for Completion evidence. Authority, freshness and jurisdiction remain unverified.', 'Research unavailable for Selection effects. Authority, freshness and jurisdiction remain unverified.'] },
  { name: 'Synthesis', ordinal: 12, warnings: ["This call exceeded the model's context window, so its input was reduced. 190 items were withheld from this call entirely: x. Read this stage as partial."] },
  { name: 'Entity resolution', ordinal: 2, warnings: ['176 of 398 source mentions were never resolved into a named body: a, b, c'] },
  { name: 'Document decomposition', ordinal: 1, warnings: ['12 model outputs were discarded and are not part of this assessment — bad. Affected: x'] },
];

describe('the brief, from key judgements', () => {
  const artefacts = [...prior, ...findings, rec, judgement(2), judgement(1)];
  const brief = briefOf(artefacts, STAGES);

  it('leads with the headline and at most one sentence after it', () => {
    expect(brief.headline).toBe('The policy rewards selection rather than teaching.');
    expect(brief.standfirst).toBe('Colleges can meet the measure by choosing who they enrol.');
  });

  it('holds the judgements in rank order, each with the quote, the sharpest play, the change-our-mind line and the owner', () => {
    expect(brief.source).toBe('judgements');
    expect(brief.items.map((i) => i.rank)).toEqual([1, 2]);
    const [first] = brief.items;
    expect(first.statement).toBe('Colleges will pick finishers (1).');
    expect(first.quote).toEqual({ text: 'funded on completion rates', page: 4 });
    // The sharpest play leads whatever order the judgement named them in.
    expect(first.play?.artefact.id).toBe(plays[0].id);
    expect(first.play?.pattern).toBe('Picking the easy cases');
    expect(first.play?.earlyWarning).toBe('Enrolment of learners with low prior attainment falls.');
    expect(first.play?.fix).toBe('Weight completion by prior attainment.');
    expect(first.morePlays).toBe(1);
    expect(first.wouldChangeIf).toMatch(/Enrolment mix/);
    expect(first.owner).toBe('Department for Education');
    expect(first.action).toMatch(/Publish enrolment mix/);
  });

  it('never holds more than five', () => {
    const many = [...prior, ...findings, ...[1, 2, 3, 4, 5, 6, 7].map((r) => judgement(r))];
    expect(briefOf(many, []).items).toHaveLength(5);
  });
});

describe('the brief, for an assessment written before key judgements', () => {
  const artefacts = [...prior, ...findings, rec];
  const brief = briefOf(artefacts, []);

  it('falls back to the ranked findings in the same shape, leaving out what a finding does not carry', () => {
    expect(brief.source).toBe('findings');
    expect(brief.items.map((i) => i.title)).toEqual(['Selection is the sharpest play', 'Completion funding is exposed']);
    const [first] = brief.items;
    expect(first.statement).toBe('Selection is the sharpest play statement.');
    expect(first.play?.artefact.id).toBe(plays[0].id);
    expect(first.wouldChangeIf).toBe('');
    expect(first.owner).toBe('');
    // The recommendation that answers it stands in for "who should do what".
    expect(first.action).toBe('Weight completion by prior attainment');
    expect(first.answer?.id).toBe(rec.id);
  });

  it('quotes the part of the policy the play is aimed at, and nothing looser', () => {
    expect(brief.items[0].about?.id).toBe(mechanism.id);
    expect(brief.items[0].quote).toEqual({ text: 'funded on completion rates', page: 4 });
  });

  it('does not show one play five times when another is there', () => {
    expect(brief.items[1].play?.artefact.id).toBe(plays[1].id);
  });

  it('never ranks the executive assessment as a finding: it is the headline', () => {
    expect(brief.items.some((i) => i.id === exec.id)).toBe(false);
  });
});

describe('what we could not check', () => {
  it('says at most three things, the unsearched evidence first', () => {
    const lines = briefLimits(STAGES);
    expect(lines).toHaveLength(BRIEF_LIMITS);
    expect(lines[0]).toMatch(/^2 questions could not be checked against published evidence/);
    expect(lines[1]).toMatch(/^In 1 of 4 steps the assessment was too big to show the model at once.*1 of those steps say to read their results as partial/);
    expect(lines[2]).toBe('176 of 398 source mentions were never resolved into a named body.');
  });

  it('says a sealed run did not search, rather than that the search failed', () => {
    const lines = briefLimits([{ name: 'Targeted research', warnings: ['Skipped: this is a sealed assessment.'] }]);
    expect(lines[0]).toMatch(/was sealed, so it did not search/);
  });

  it('falls back to what the run threw away when nothing was left uncovered', () => {
    expect(briefLimits([STAGES[3]])).toEqual(['The run threw out 12 pieces of its own work because they failed its checks. They are not in this assessment.']);
  });

  it('says nothing for a run that recorded nothing', () => {
    expect(briefLimits([])).toEqual([]);
  });
});

describe('the words', () => {
  it('cuts a sentence at the boundary headlineSentence trusts', () => {
    expect(sentences('Costs rose 2.5 per cent. Then they fell.', 1)).toBe('Costs rose 2.5 per cent.');
    expect(sentences('One. Two. Three.', 2)).toBe('One. Two.');
    expect(sentences('No stop at all', 1)).toBe('No stop at all');
  });

  it('clips a long quote at a word and says so', () => {
    const long = 'word '.repeat(100);
    const cut = clip(long, 50);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(51);
    expect(cut).not.toMatch(/wor…$/);
  });
});

describe('the brief as a document', () => {
  const artefacts = [...prior, ...findings, rec, judgement(1)];
  const meta = { title: 'Completion funding', completedAt: '2026-09-25' };

  it('is the brief and nothing else: headline, judgements, limits', () => {
    const md = briefMarkdown(artefacts, meta, briefOf(artefacts, STAGES));
    expect(md).toMatch(/^# Completion funding — the brief/);
    expect(md).toContain('The policy rewards selection rather than teaching.');
    expect(md).toContain('## Key judgements');
    expect(md).toContain('> “funded on completion rates” (page 4)');
    expect(md).toContain('**What would change our mind.** Enrolment mix stays stable');
    expect(md).toContain('**Who should act.** Department for Education: Publish enrolment mix');
    expect(md).toContain('## What we could not check');
    // Not the whole report: no playbook, no appendix, no key to the words.
    expect(md).not.toContain('## The exploitation playbook');
    expect(md).not.toContain('Appendix');
  });

  it('keeps the quote in a shared copy, exactly as a finding keeps one, and drops nothing else twice', () => {
    const shared = shareableReport({ artefacts, stages: [] });
    const md = briefMarkdown(shared.artefacts, { ...meta, withheld: ['the policy document'] }, briefOf(shared.artefacts, []));
    expect(md).toContain('“funded on completion rates”');
    expect(md).toContain('This is a shared copy');
    // The passage itself is not in the shared artefacts, so its text is not either.
    expect(md).not.toContain('from 2027');
  });
});
