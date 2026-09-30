import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { scoreExploits } from '$lib/policy-analysis/exposure';
import { bandCounts, plays as playsOf } from '$lib/policy-analysis/view';
import { OVERVIEW_ROWS, overviewCard, overviewOf } from './overview';

/*
 * The summary's one promise is that it counts nothing a second way: every
 * figure must equal the one the tab it opens prints. So most of these compare
 * against the view functions the tabs call, rather than against literals.
 */
const passage = artefact('passage_0001', 'passage', 'Page 4', 'Colleges will be funded on completion rates from 2027.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, page: 4 });
const mechanism = (n: number, label: string) => ({ ...artefact(`s1_00${n}_mechanism`, 'mechanism', label, 'How it works.', { intervention: 'i', implementation: 'x', notes: 'n' }), origin: 'extracted_fact' as const, sourceId: passage.id, sourceQuote: 'funded on completion rates', page: 4, refs: [passage.id] });
const funding = mechanism(1, 'Completion funding');
const reporting = mechanism(2, 'Annual reporting');
const unused = mechanism(3, 'Nobody aims at this');
const colleges = artefact('s2_000_actor', 'actor', 'Colleges', 'Further education colleges.', { entityType: 'provider' }, { refs: [passage.id] });
// A second candidate row for the same body — entity resolution keeps them apart.
const collegesAgain = artefact('s2_001_actor', 'actor', 'colleges ', 'Colleges again.', { entityType: 'provider' }, { refs: [passage.id] });
const ofsted = artefact('s2_002_actor', 'actor', 'Ofsted', 'The inspectorate.', { entityType: 'regulator' }, { refs: [passage.id] });
const idle = artefact('s2_003_actor', 'actor', 'Parents', 'Parents.', { entityType: 'user_group' }, { refs: [passage.id] });

const play = (n: number, actorId: string, score: number, targets: string[], legality = 'compliant', label = `Play ${n}`) =>
  artefact(`s10_00${n}_exploit`, 'exploit', label, 'Do the thing.', {
    actorId, motivation: 'm', play: 'Do the thing.', legality, targets, preconditions: [], payoff: 'p', costToPolicy: 'c',
    incentive: score, ease: score, impact: score, concealment: score, earlyWarning: 'w', counter: 'c', precedent: 'None.', precedentBasis: 'none',
  }, { refs: targets });

const scored = scoreExploits([
  play(1, colleges.id, 0.95, [funding.id], 'compliant', 'Cream-skimming the likeliest completers'),
  play(2, collegesAgain.id, 0.9, [funding.id, reporting.id], 'grey'),
  play(3, ofsted.id, 0.6, [reporting.id]),
  play(4, ofsted.id, 0.2, [funding.id]),
  play(5, colleges.id, 0.4, []),
]);

const finding = (n: number, judgement: string) => artefact(`s17_main_finding_00${n}`, 'finding', `Finding ${n}`, `The policy rewards selection (${n}).`, { section: n === 1 ? 'executive_assessment' : 'exploitation', revision: 'assured', judgement, resultIds: [] });
const rec = artefact('s17_main_recommendation_001', 'recommendation', 'Weight completion by prior attainment', 'Weight it.', { revision: 'assured', judgement: 'supported_with_limits', findingIds: ['s17_main_finding_002'] });
const answering = artefact('s17_main_finding_002', 'finding', 'Selection is the sharpest play', 'Selection.', { section: 'exploitation', revision: 'assured', judgement: 'well_supported', resultIds: [scored[0].id] }, { refs: [scored[0].id] });

const artefacts: Artefact[] = [
  passage, funding, reporting, unused, colleges, collegesAgain, ofsted, idle, ...scored,
  finding(1, 'supported_with_limits'), answering, finding(3, 'provisional'), rec,
];

describe('the summary of an assessment', () => {
  const view = overviewOf(artefacts);

  it('counts the ways to beat it and their bands exactly as the tabs do', () => {
    const list = playsOf(artefacts);
    expect(view.plays.total).toBe(list.length);
    for (const { band, count } of bandCounts(list)) expect(view.plays.bands[band]).toBe(count);
    expect(view.plays.compliant).toBe(4);
  });

  it('lists the worst first, with who would do it and the pattern it is filed under', () => {
    expect(view.plays.top[0].label).toBe('Cream-skimming the likeliest completers');
    expect(view.plays.top[0].who).toBe('Colleges');
    expect(view.plays.top[0].pattern).toBe('Picking the easy cases');
    expect(view.plays.top.map((p) => p.exposure)).toEqual([...view.plays.top.map((p) => p.exposure)].sort((a, b) => b - a));
    expect(view.plays.top.length).toBeLessThanOrEqual(OVERVIEW_ROWS);
  });

  it('counts parts of the policy under pressure against every part the paper sets up', () => {
    expect(view.parts.total).toBe(3);
    expect(view.parts.underPressure).toBe(2);
    expect(view.parts.top[0]).toMatchObject({ label: 'Completion funding', plays: 3 });
    const tally = view.parts.top[0].bands;
    expect(Object.values(tally).reduce((n, v) => n + v, 0)).toBe(3);
  });

  it('counts bodies by NAME, so two candidate rows for one body are one body', () => {
    // Colleges (two rows, "Colleges" and "colleges "), Ofsted; Parents runs nothing.
    expect(view.bodies.active).toBe(2);
    expect(view.bodies.named).toBe(3);
    const colleges = view.bodies.top.find((b) => b.label === 'Colleges');
    expect(colleges?.plays).toBe(3);
    expect(view.bodies.top[0].label).toBe('Colleges');
  });

  it('says how many ways to beat it the recommendations answer, and how many severe ones none does', () => {
    expect(view.recs.items).toHaveLength(1);
    expect(view.recs.items[0].answers).toBeGreaterThanOrEqual(1);
    expect(view.recs.answered + view.recs.unanswered).toBe(view.plays.total);
    expect(view.recs.severeUnanswered).toBeLessThanOrEqual(view.recs.unanswered);
  });

  it('reads the confidence of the findings strongest first', () => {
    expect(view.findings.confidence.map((c) => c.label)).toEqual(['Well supported', 'Supported with limits', 'Provisional']);
  });

  it('says nothing about a run with nothing to count', () => {
    expect(overviewCard([passage, funding])).toBeNull();
    const empty = overviewOf([passage]);
    expect(empty.plays.total).toBe(0);
    expect(empty.recs.unanswered).toBe(0);
  });

  it('gives the landing page counts and the headline only', () => {
    const card = overviewCard(artefacts);
    expect(card).not.toBeNull();
    expect(Object.keys(card!).sort()).toEqual(['bands', 'bodies', 'headline', 'parts', 'plays', 'recs']);
    expect(card!.plays).toBe(view.plays.total);
  });
});
