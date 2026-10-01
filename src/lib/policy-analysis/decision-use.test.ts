// Phase 22 part 2 — an open rival explanation keeps a report exploratory.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { capForRival, openRivals, OPEN_RIVAL_REASON } from './decision-use';
import { assuranceReview } from '$lib/assurance-view';
import { briefLimits } from '$lib/brief';

const challenge = (id: string, category: string, finding = 'issue') => artefact(id, 'assurance_challenge', `Challenge ${id}`, 'c', {
  category, finding, materiality: 'medium', targetIds: ['f'], challenge: 'c', testApplied: 't', evidence: 'e', resolutionNeeded: 'r',
  ...(category === 'rival_explanation' ? { rival: 'Access was rising anyway.', discriminators: ['x'] } : {}),
});
const response = (challengeId: string, disposition: string) => artefact(`r_${challengeId}`, 'assurance_response', 'r', 'r', { challengeId, disposition, response: 'r', changes: 'c', remainingLimit: 'l' });
const summary = (decisionUse: string, extra: Record<string, unknown> = {}) => artefact('s17_summary', 'review_summary', 'Review', 'The review.', {
  decisionUse, judgement: 'supported_with_limits', openChallenges: 0, acceptedChallenges: 0, unresolvedMaterialChallenges: 0, scope: 's', limitations: [], ...extra,
});

describe('a rival explanation the report could not rule out', () => {
  it('leaves the decision use alone when the rival was answered', () => {
    for (const disposition of ['accepted', 'partly_accepted', 'rejected']) {
      const all: Artefact[] = [challenge('c1', 'rival_explanation'), response('c1', disposition)];
      expect(openRivals(all)).toHaveLength(0);
      expect(capForRival('independently_challenged', all)).toEqual({ use: 'independently_challenged', reason: null });
      expect(capForRival('decision_support', all)).toEqual({ use: 'decision_support', reason: null });
    }
  });

  it('caps it at exploratory, with the reason, when unresolved or unanswered', () => {
    for (const all of [[challenge('c1', 'rival_explanation'), response('c1', 'unresolved')], [challenge('c1', 'rival_explanation')]]) {
      expect(capForRival('independently_challenged', all)).toEqual({ use: 'exploratory', reason: OPEN_RIVAL_REASON });
      expect(capForRival('decision_support', all)).toEqual({ use: 'exploratory', reason: OPEN_RIVAL_REASON });
    }
  });

  it('is not tripped by a rival the reviewer cleared, or by any other open challenge', () => {
    expect(capForRival('decision_support', [challenge('c1', 'rival_explanation', 'cleared')]).use).toBe('decision_support');
    expect(capForRival('decision_support', [challenge('c2', 'omission'), response('c2', 'unresolved')]).use).toBe('decision_support');
  });

  it('reads through on the page and the trust card, for a summary written before the rule', () => {
    const all = [challenge('c1', 'rival_explanation'), response('c1', 'unresolved'), summary('independently_challenged')];
    expect(assuranceReview(all)).toMatchObject({ decisionUse: 'exploratory', decisionUseReason: OPEN_RIVAL_REASON });
    expect(briefLimits([], all)).toContain(OPEN_RIVAL_REASON);
  });

  it('leaves an older run exactly as it was', () => {
    const all = [challenge('c2', 'omission'), response('c2', 'accepted'), summary('independently_challenged')];
    expect(assuranceReview(all)).toMatchObject({ decisionUse: 'independently_challenged', decisionUseReason: null });
    expect(briefLimits([], all)).not.toContain(OPEN_RIVAL_REASON);
  });
});
