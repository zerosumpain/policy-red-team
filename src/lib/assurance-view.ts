/**
 * WHAT SURVIVED CHALLENGE, AND HOW YOU WOULD KNOW.
 *
 * Stages 16 and 17 exist specifically to attack the assessment's own
 * conclusions, and they produced seven `assurance_challenge`, seven
 * `assurance_response` and one `review_summary`. A grep across the client found
 * not one reference to any of the three kinds outside the drill route's kind
 * list: the stage that rewrote thirteen findings into nineteen was recorded on
 * the page as four sentences in one write-up card.
 *
 * TWO SHAPES OF ROW, AND ONLY ONE OF THEM IS WRITTEN. The challenges are
 * stubbed — `statement` empty and `data` `{}` on all seven — so the label is
 * the only text there is, and it is a full sentence ("Critical delivery and
 * control actors are omitted from the actor conclusion"). Everything a reader
 * needs is on the responses, which are not stubbed: `disposition`,
 * `challengeId` (resolving 7 of 7), `changes` and `remainingLimit`. So the
 * join is challenge → response, and a challenge with no response is Open
 * rather than dropped.
 *
 * THE TALLY IS RECOMPUTED FROM THE ROWS, and this is not a preference.
 * `contracts.ts` states the rule where it enforces it for addendum summaries —
 * "a tally the model writes drifts from the rows it is a tally of, and the
 * reader reads the tally" — and here it has drifted: `acceptedChallenges`
 * reads 5 while six of the seven responses say `accepted`. Printing the
 * summary's figure beside seven rows that disagree with it would be the worst
 * possible defect in the section whose subject is the report's own
 * reliability, so both figures are returned and the component prints both.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The stored enum in words, plus the value the join invents for an unanswered challenge. */
export const DISPOSITION_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  partly_accepted: 'Partly accepted',
  rejected: 'Rejected',
  unresolved: 'Unresolved',
  open: 'Open',
};

/** The order a reader meets them in: settled, part-settled, refused, still running. */
export const DISPOSITION_ORDER = ['accepted', 'partly_accepted', 'rejected', 'unresolved', 'open'] as const;

export type ChallengeRow = {
  id: string;
  /** The challenge as a sentence. On this run the label is all there is. */
  label: string;
  disposition: string;
  dispositionLabel: string;
  /** What the assured report was rewritten to say. Empty where the challenge is open. */
  changes: string;
  /** What is still not covered after accepting it — the sentence a decision needs. */
  remainingLimit: string;
  response: Artefact | null;
};

export type AssuranceReview = {
  rows: ChallengeRow[];
  /** Counted from the rows, in vocabulary order, dropping dispositions nothing scored. */
  counts: { key: string; label: string; count: number }[];
  /**
   * Challenges still outstanding — no response, or one that resolved nothing.
   *
   * Returned separately BECAUSE IT IS ZERO HERE and `counts` drops zeros. "0
   * still open" is the one figure in this section a reader is entitled to see
   * whatever it is; a chip row that shows it only when something is wrong
   * makes its absence unreadable.
   */
  open: number;
  statement: string;
  judgement: string;
  decisionUse: string;
  limitations: string[];
  /**
   * Where the summary's own accepted count disagrees with the rows, said in
   * full. Null when they agree, or when the run wrote no summary.
   */
  disagreement: string | null;
};

export function assuranceReview(artefacts: Artefact[]): AssuranceReview | null {
  const challenges = artefacts.filter((a) => a.kind === 'assurance_challenge');
  const responses = artefacts.filter((a) => a.kind === 'assurance_response');
  const summary = artefacts.find((a) => a.kind === 'review_summary') ?? null;
  if (!challenges.length && !responses.length && !summary) return null;

  const answered = new Map(responses.map((r) => [str(r.data.challengeId), r]));

  const rows: ChallengeRow[] = challenges.map((challenge) => {
    const response = answered.get(challenge.id) ?? null;
    /*
     * A CHALLENGE WITH NO RESPONSE IS OPEN, NOT ABSENT. Dropping it would make
     * the row count agree with the response count and quietly lose the one
     * thing a reader of an assurance section most needs to see.
     */
    const disposition = response ? str(response.data.disposition) || 'unresolved' : 'open';
    return {
      id: challenge.id,
      label: challenge.label,
      disposition,
      dispositionLabel: DISPOSITION_LABEL[disposition] ?? disposition,
      changes: str(response?.data.changes),
      remainingLimit: str(response?.data.remainingLimit),
      response,
    };
  });

  /*
   * A RESPONSE POINTING AT A CHALLENGE THAT IS NOT THERE IS STILL A RESPONSE.
   * It cannot be given a heading — the challenge's label is the heading — but
   * it must be counted, or the tally stops adding up to the number of responses
   * the run actually wrote.
   */
  const orphans = responses.filter((r) => !challenges.some((c) => c.id === str(r.data.challengeId)));

  const seen = [...rows.map((row) => row.disposition), ...orphans.map((r) => str(r.data.disposition))];
  const counts = [
    ...DISPOSITION_ORDER,
    ...[...new Set(seen)].filter((key) => key && !(DISPOSITION_ORDER as readonly string[]).includes(key)).sort(),
  ]
    .map((key) => ({ key, label: DISPOSITION_LABEL[key] ?? key, count: seen.filter((s) => s === key).length }))
    /*
     * ZEROS ARE DROPPED HERE, unlike on the structural checks. There, "Low risk
     * 0" is the reading — not one check came back clean. Here a rejected count
     * of zero is not a finding about the review, and five chips of which three
     * are zero is the same defect as the four evidence cards one section up.
     */
    .filter((entry) => entry.count);

  const accepted = seen.filter((key) => key === 'accepted').length;
  const claimed = typeof summary?.data.acceptedChallenges === 'number' ? summary.data.acceptedChallenges : null;

  return {
    rows,
    counts,
    open: seen.filter((key) => key === 'open' || key === 'unresolved').length,
    statement: summary?.statement ?? '',
    judgement: str(summary?.data.judgement),
    decisionUse: str(summary?.data.decisionUse),
    limitations: strings(summary?.data.limitations),
    disagreement: claimed !== null && claimed !== accepted
      ? `The review summary records ${claimed} accepted; ${accepted} of the ${seen.length} responses `
        + 'are marked accepted. Both figures are the run\'s own.'
      : null,
  };
}

export type EvaluationPlan = {
  statement: string;
  counterfactual: string;
  /** Each indicator's own name. The other six fields are read for the gap count only. */
  indicators: string[];
  decisionRules: string[];
  dataGaps: string[];
  /** The fifteen impact, process and value-for-money questions, labelled. */
  questions: { label: string; items: string[] }[];
  /**
   * How many indicators carry neither a baseline nor a target.
   *
   * Nine of nine on this run: every one records "Not specified". An evaluation
   * plan whose indicators have no baseline cannot be run, and that is a
   * stronger statement than the nine names beside it.
   */
  unquantified: number;
};

/** "Not specified", however the model chose to continue the sentence. */
const UNSET = /^\s*not specified\b/i;

export function evaluationPlan(artefacts: Artefact[]): EvaluationPlan | null {
  const plan = artefacts.find((a) => a.kind === 'evaluation_plan');
  if (!plan) return null;

  const indicators = Array.isArray(plan.data.indicators) ? plan.data.indicators : [];
  const named = indicators
    .map((indicator) => (indicator && typeof indicator === 'object' ? str((indicator as Record<string, unknown>).name) : ''))
    .filter(Boolean);

  const unquantified = indicators.filter((indicator) => {
    if (!indicator || typeof indicator !== 'object') return false;
    const row = indicator as Record<string, unknown>;
    return UNSET.test(str(row.target)) && UNSET.test(str(row.baseline));
  }).length;

  const questions = [
    { label: 'About the effects', items: strings(plan.data.impactQuestions) },
    { label: 'About the delivery', items: strings(plan.data.processQuestions) },
    { label: 'About value for money', items: strings(plan.data.valueForMoneyQuestions) },
  ].filter((group) => group.items.length);

  return {
    statement: plan.statement,
    counterfactual: str(plan.data.counterfactual),
    indicators: named,
    decisionRules: strings(plan.data.decisionRules),
    dataGaps: strings(plan.data.dataGaps),
    questions,
    unquantified,
  };
}
