// The independent-challenge trail and the evaluation plan, against the shapes
// the real run has.
//
// Seven stubbed challenges (statement empty, data `{}`), seven responses that
// carry everything, and a review summary whose own accepted count says 5 while
// six of the responses say accepted. That disagreement is the case the section
// most has to get right, so it is the first thing tested.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { assuranceReview, evaluationPlan } from './assurance-view';

const challenge = (n: number): Artefact =>
  // Stubbed exactly as the payload is: the label is the whole claim.
  artefact(`c${n}`, 'assurance_challenge', `Challenge ${n} names a material omission`, '', {});

const response = (n: number, disposition: string, over: Record<string, unknown> = {}): Artefact =>
  artefact(`r${n}`, 'assurance_response', `Response to challenge ${n}`, disposition, {
    challengeId: `c${n}`,
    disposition,
    response: 'The challenge is accepted as a constraint on wording.',
    changes: 'The assured finding was rewritten.',
    remainingLimit: 'Specialist review is still required.',
    ...over,
  });

const summary = (accepted: number): Artefact =>
  artefact('s1', 'review_summary', 'Assured review summary', 'Independent challenge supports conditional use.', {
    judgement: 'supported_with_limits',
    decisionUse: 'independently_challenged',
    acceptedChallenges: accepted,
    openChallenges: 0,
    unresolvedMaterialChallenges: 0,
    limitations: ['No independent research sources were supplied.', 'Legal sign-off remains out of scope.'],
  });

/** Six accepted, one partly accepted, and a summary that disagrees. */
const world = (): Artefact[] => [
  ...[1, 2, 3, 4, 5, 6, 7].map(challenge),
  ...[1, 2, 3, 4, 5, 6].map((n) => response(n, 'accepted')),
  response(7, 'partly_accepted'),
  summary(5),
];

describe('assuranceReview', () => {
  it('counts the dispositions from the ROWS, not from the summary', () => {
    const review = assuranceReview(world());
    expect(review?.counts).toEqual([
      { key: 'accepted', label: 'Accepted', count: 6 },
      { key: 'partly_accepted', label: 'Partly accepted', count: 1 },
    ]);
  });

  it('prints both figures where the summary disagrees with the rows', () => {
    expect(assuranceReview(world())?.disagreement).toBe(
      "The review summary records 5 accepted; 6 of the 7 responses are marked accepted. Both figures are the run's own.",
    );
  });

  it('says nothing where the two agree', () => {
    const agreeing = [...world().filter((a) => a.kind !== 'review_summary'), summary(6)];
    expect(assuranceReview(agreeing)?.disagreement).toBeNull();
  });

  it('joins every response to its challenge and keeps the challenge label as the heading', () => {
    const review = assuranceReview(world());
    expect(review?.rows).toHaveLength(7);
    expect(review?.rows[0].label).toBe('Challenge 1 names a material omission');
    expect(review?.rows[6].dispositionLabel).toBe('Partly accepted');
  });

  it('renders a challenge nobody answered as Open rather than dropping it', () => {
    const unanswered = world().filter((a) => a.id !== 'r3');
    const review = assuranceReview(unanswered);
    expect(review?.rows).toHaveLength(7);
    expect(review?.rows[2].disposition).toBe('open');
    expect(review?.counts.find((c) => c.key === 'open')?.count).toBe(1);
  });

  it('still counts a response whose challenge is missing', () => {
    const orphaned = [...world().filter((a) => a.id !== 'c4')];
    const review = assuranceReview(orphaned);
    expect(review?.rows).toHaveLength(6);
    // Six rows, but the accepted tally is still six, because six responses said so.
    expect(review?.counts.find((c) => c.key === 'accepted')?.count).toBe(6);
  });

  it('drops a disposition nothing scored', () => {
    expect(assuranceReview(world())?.counts.map((c) => c.key)).not.toContain('rejected');
  });

  it('is null where the run had no assurance stage at all', () => {
    expect(assuranceReview([])).toBeNull();
  });
});

const plan = (over: Record<string, unknown> = {}): Artefact =>
  artefact('p1', 'evaluation_plan', 'Evaluation plan', 'One portfolio evaluation.', {
    counterfactual: 'Use a mixed counterfactual.',
    indicators: [
      { name: 'Implementation readiness', type: 'process', target: 'Not specified; set a threshold', baseline: 'Not specified; build a register' },
      { name: 'Delivery coverage', type: 'output', target: '80% of eligible learners', baseline: 'Not specified' },
    ],
    decisionRules: ['Do not scale until the owner is documented.'],
    dataGaps: ['No intervention-level baselines are supplied.'],
    impactQuestions: ['Do interventions increase participation?'],
    processQuestions: ['Are named owners established?'],
    valueForMoneyQuestions: [],
    ...over,
  });

describe('evaluationPlan', () => {
  it('reads each indicator’s own name and nothing else from the object', () => {
    expect(evaluationPlan([plan()])?.indicators).toEqual(['Implementation readiness', 'Delivery coverage']);
  });

  it('counts an indicator as unquantified only when BOTH target and baseline are unset', () => {
    // The second has a real target, so it is quantified even though its
    // baseline is not — saying otherwise would overstate the gap.
    expect(evaluationPlan([plan()])?.unquantified).toBe(1);
  });

  it('drops a question group the run left empty rather than printing an empty heading', () => {
    expect(evaluationPlan([plan()])?.questions.map((g) => g.label))
      .toEqual(['About the effects', 'About the delivery']);
  });

  it('is null where the run wrote no plan', () => {
    expect(evaluationPlan([])).toBeNull();
  });
});
