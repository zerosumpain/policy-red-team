import { MAX_KEY_JUDGEMENTS, type Artefact } from './contracts';
import { patternOf, playPatterns, type PatternKey } from './patterns';

/**
 * KEY JUDGEMENTS — the "so what" a report leads with.
 *
 * See `key_judgement` in `contracts.ts` for why the kind exists and what each
 * one must carry. This module holds the two things done with them after the
 * model writes them: the stage reconciles a surplus, and the report reads them.
 */

/**
 * KEEP THE LAST OF EACH RANK, THEN THE TOP FIVE, THEN NUMBER THEM 1..n.
 *
 * A corrective round answers with the whole revised assessment, and
 * `provider.ts` ACCUMULATES the rounds into one result — the trap that made
 * "exactly one review summary" a gate no retry could pass. A rule that counted
 * key judgements the same way would fail on the correction arriving, and
 * asking again would only add more. So a surplus is reconciled, never thrown:
 *
 *   - Two judgements with the same rank are one judgement restated; the later
 *     is the revised one (the same rule the review summary follows).
 *   - More than `MAX_KEY_JUDGEMENTS` distinct ranks keeps the highest ranked.
 *   - What is kept is renumbered 1..n, so a reader never sees "judgement 7 of 5".
 *
 * An ABSENCE is a different thing — the report has no "so what" — and the
 * stage's own rule fails on it after the top-up has asked once.
 *
 * Mutates the kept artefacts' `rank` and returns what was dropped, so the caller
 * can remove it and say so.
 */
export function reconcileKeyJudgements(artefacts: Artefact[]): { kept: Artefact[]; dropped: Artefact[] } {
  const judgements = artefacts.filter((a) => a.kind === 'key_judgement');
  const byRank = new Map<number, Artefact>();
  for (const j of judgements) byRank.set(Number(j.data.rank), j);
  const kept = [...byRank.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_KEY_JUDGEMENTS).map(([, j]) => j);
  kept.forEach((j, i) => { j.data.rank = i + 1; });
  const keep = new Set(kept);
  return { kept, dropped: judgements.filter((j) => !keep.has(j)) };
}

export type KeyJudgementView = {
  artefact: Artefact;
  rank: number;
  /** The one-sentence judgement. */
  judgement: string;
  quote: { text: string; sourceId: string | null; page: number | null; section: string | null } | null;
  mechanism: Artefact | null;
  plays: Artefact[];
  /** The patterns its plays fall into, in the run's pattern order. */
  patterns: { key: PatternKey; label: string; rank: number }[];
  assumption: Artefact | null;
  findings: Artefact[];
  wouldChangeIf: string;
  decision: string;
  action: string;
  owner: string;
};

const stageOf = (id: string) => Number(/^s(\d+)_/.exec(id)?.[1] ?? 0);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The current key judgements, in rank order, joined to what each one names.
 *
 * THE LATEST GENERATION ONLY: a restatement pass writes a second set over an
 * inventory that now holds the addenda, and showing both is the two-reports
 * failure `latestGeneration` in `view.ts` exists to prevent. Read from the id
 * namespace for the same reason that function gives.
 *
 * A name that no longer resolves — a shared copy withholds some kinds — joins
 * to null or is left out, rather than rendering a link to nothing.
 */
export function keyJudgements(artefacts: Artefact[]): KeyJudgementView[] {
  const all = artefacts.filter((a) => a.kind === 'key_judgement');
  if (!all.length) return [];
  const newest = Math.max(...all.map((a) => stageOf(a.id)));
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const patterns = new Map(playPatterns(artefacts).map((p) => [p.key, p]));
  return all
    .filter((a) => stageOf(a.id) === newest)
    .sort((a, b) => Number(a.data.rank) - Number(b.data.rank))
    .map((a) => {
      const plays = ids(a.data.playIds).map((id) => byId.get(id)).filter((p): p is Artefact => !!p);
      const keys = [...new Set(plays.map((p) => patternOf(p)))];
      return {
        artefact: a,
        rank: Number(a.data.rank),
        judgement: a.statement,
        quote: a.sourceQuote ? { text: a.sourceQuote, sourceId: a.sourceId, page: a.page, section: a.section } : null,
        mechanism: byId.get(text(a.data.mechanismId)) ?? null,
        plays,
        patterns: keys
          .map((key) => patterns.get(key))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({ key: p.key, label: p.label, rank: p.rank }))
          .sort((x, y) => x.rank - y.rank),
        assumption: byId.get(text(a.data.assumptionId)) ?? null,
        findings: ids(a.data.findingIds).map((id) => byId.get(id)).filter((f): f is Artefact => !!f),
        wouldChangeIf: text(a.data.wouldChangeIf),
        decision: text(a.data.decision),
        action: text(a.data.action),
        owner: text(a.data.owner),
      };
    });
}
