import type { Artefact } from './contracts';

/**
 * AN OPEN RIVAL EXPLANATION KEEPS AN ASSESSMENT EXPLORATORY (phase 22, part 2).
 *
 * Stage 17 has always set `decisionUse` from the server's own count: a
 * material challenge left unresolved keeps the report `exploratory`, any other
 * unresolved one leaves it `decision_support`, and none at all makes it
 * `independently_challenged`. Part 1 added the twelfth remit, which BUILDS the
 * strongest other account of the report's most consequential conclusion — and
 * a rival the report could not rule out is a different kind of open item from
 * a citation it did not fix. If another explanation fits the same evidence,
 * the report has not yet said which of two accounts a decision would be
 * acting on. John's ruling, 1 October 2026: that blocks decision support.
 *
 * "Open" is the same reading `assuranceReview` makes: a rival raised as an
 * ISSUE whose response is `unresolved`, or that has no response at all. A rival
 * the reviewer itself marked `cleared` (it found nothing that fits as well) is
 * not open, and neither is one the report accepted, partly accepted or
 * rejected with reasons — those are answers.
 *
 * ONE FUNCTION FOR BOTH SIDES. The pipeline writes the cap and the sentence
 * into the review summary; `assurance-view.ts` applies the same reading at
 * render, so a summary written before this rule cannot claim decision support
 * over an open rival on the page. Runs before part 1 have no rival challenge
 * and read exactly as they did.
 */
export const OPEN_RIVAL_REASON = 'Another explanation fits the same evidence and the report could not rule it out, so this is not yet fit to support a decision.';

export type DecisionUse = 'exploratory' | 'decision_support' | 'independently_challenged';

/** Rival challenges raised as an issue and left unanswered or unresolved. */
export function openRivals(artefacts: Artefact[]): Artefact[] {
  const disposition = new Map(artefacts.filter((a) => a.kind === 'assurance_response').map((r) => [String(r.data.challengeId), String(r.data.disposition ?? '')]));
  return artefacts.filter((a) => a.kind === 'assurance_challenge'
    && a.data.category === 'rival_explanation'
    && a.data.finding !== 'cleared'
    && (!disposition.has(a.id) || disposition.get(a.id) === 'unresolved'));
}

/**
 * The decision use after the rival rule, and the sentence that says why. The
 * sentence is given whenever a rival is open — even where an unresolved
 * material challenge had already made the run exploratory — because it is
 * still true and it is the more specific of the two reasons.
 */
export function capForRival(use: DecisionUse | string, artefacts: Artefact[]): { use: DecisionUse | string; reason: string | null } {
  if (!openRivals(artefacts).length) return { use, reason: null };
  return { use: 'exploratory', reason: OPEN_RIVAL_REASON };
}
