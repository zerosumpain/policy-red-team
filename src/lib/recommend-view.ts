/**
 * WHAT THE FOUR RECOMMENDATIONS ADD UP TO.
 *
 * "What it suggests" is the section a decision-maker acts on, and on the real
 * run it was four numbered paragraphs and 183 words. Three facts the assessment
 * had already written were on the page nowhere:
 *
 * WHO GAINS AND WHO PAYS. Every recommendation carries `data.beneficiaries` and
 * `data.burdenBearers` — 47 mentions across the four, 26 distinct strings — and
 * neither array reaches the page OR the .docx. Tallied, providers and employers
 * are the top of both lists, which is exactly what the "Distribution" finding is
 * about: employers gain in four and carry it in three, providers gain in three
 * and carry it in four.
 *
 * WHICH PLAYS THEY ANSWER. `linkRecommendation()` is a bounded two-edge join
 * that the drill uses and the report never ran. Over the four assured
 * recommendations it reaches 35 of the 47 plays, which means twelve are answered
 * by nothing — three of them severe.
 *
 * WHAT THE CHALLENGE ROUND REMOVED. There are ten recommendation artefacts: six
 * initial at stage 12 and four assured at stage 17. Tracing `refs`, the assured
 * four cite three of the six; the other three are cited by none of them. So the
 * independent challenge kept every one of the thirteen initial findings and
 * removed half of the advice, and the page presented the survivors as a
 * complete list numbered 1 to 4.
 *
 * NOTHING HERE NORMALISES A GROUP NAME, AND THAT IS THE DECISION. The strings
 * are as the assessment wrote them, so "providers" and "providers with genuine
 * improvement" are two groups, as are "Government" and "Government departments".
 * A stemmer that merged them would be this tool asserting an identity the
 * assessment did not, in the one figure whose whole subject is who is being
 * talked about. The caption on the page says so in as many words.
 */
import { BANDS } from '$lib/policy-analysis/exposure';
import type { Artefact } from '$lib/policy-analysis/contracts';

const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];

export type GroupTally = {
  /** The string exactly as the assessment wrote it. Also the row's key: there is nothing else stable. */
  label: string;
  /** Recommendations that name this group as a beneficiary. */
  gains: number;
  /** Recommendations that name it as carrying the burden. */
  bears: number;
};

export type BeneficiaryTally = {
  /** Groups at or above the floor — the rows the figure draws. */
  drawn: GroupTally[];
  /** Everyone else, named once and counted, so the figure discards nothing silently. */
  singles: GroupTally[];
  /** Total mentions across both arrays, which is what the caption's denominator means. */
  mentions: number;
};

/**
 * A group named in only ONE recommendation is a name, not a pattern.
 *
 * Measured on this run: 26 distinct groups, of which 19 are named exactly once.
 * Drawn, they are nineteen rows of one identical bar — about 500px of figure
 * carrying no comparison at all. The floor is where the comparison starts, and
 * the nineteen are still counted and still listed under the drawing.
 */
export const TALLY_FLOOR = 2;

export function beneficiaryTally(recs: Artefact[], floor = TALLY_FLOOR): BeneficiaryTally {
  const rows = new Map<string, GroupTally>();
  const bump = (label: string, side: 'gains' | 'bears') => {
    const row = rows.get(label) ?? { label, gains: 0, bears: 0 };
    row[side] += 1;
    rows.set(label, row);
  };
  let mentions = 0;
  for (const rec of recs) {
    // A recommendation that named the same group twice in one array would
    // otherwise count it twice for one recommendation, and the figure's unit is
    // "recommendations naming this group", not "times the word appears".
    for (const label of new Set(listOf(rec.data.beneficiaries))) bump(label, 'gains');
    for (const label of new Set(listOf(rec.data.burdenBearers))) bump(label, 'bears');
    mentions += listOf(rec.data.beneficiaries).length + listOf(rec.data.burdenBearers).length;
  }
  const ordered = [...rows.values()].sort((a, b) =>
    Math.max(b.gains, b.bears) - Math.max(a.gains, a.bears)
    || (b.gains + b.bears) - (a.gains + a.bears)
    || a.label.localeCompare(b.label));
  return {
    drawn: ordered.filter((row) => Math.max(row.gains, row.bears) >= floor),
    singles: ordered.filter((row) => Math.max(row.gains, row.bears) < floor),
    mentions,
  };
}

/** One recommendation and the plays `linkRecommendation()` reached from it. */
export type RecReach = { id: string; label: string; playIds: string[] };

export type CoverageRow = { id: string; label: string; counts: Record<string, number>; total: number };

export type Coverage = {
  /** The bands that have at least one play, in ramp order. */
  bands: string[];
  /** Every play, by band — the denominator each cell is a part of. */
  totals: Record<string, number>;
  rows: CoverageRow[];
  /** The plays no recommendation reaches. The honest column, and the finding. */
  none: { counts: Record<string, number>; total: number; playIds: string[] };
  /** Plays reached by at least one recommendation. */
  reached: number;
  plays: number;
};

/**
 * The coverage grid: how many plays in each band each recommendation answers.
 *
 * TAKES THE REACH RATHER THAN COMPUTING IT, because the join is
 * `linkRecommendation()`'s and that function has its own file, its own tiers and
 * its own fifteen-line argument for why it stops at two edges. This counts what
 * that returned; it must never become a second, looser join.
 *
 * A PLAY ANSWERED BY TWO RECOMMENDATIONS IS COUNTED IN BOTH ROWS, so the rows
 * do not sum to the number of plays and the page says so. Union rather than sum
 * is the only honest way to ask "and what is left", which is what `none` is.
 */
export function coverageByBand(reach: RecReach[], plays: { id: string; band: string }[]): Coverage {
  const bands = BANDS.map((b) => String(b.band)).filter((band) => plays.some((p) => p.band === band));
  const zero = (): Record<string, number> => Object.fromEntries(bands.map((band) => [band, 0]));
  const bandOf = new Map(plays.map((p) => [p.id, p.band]));

  const totals = zero();
  for (const play of plays) if (play.band in totals) totals[play.band] += 1;

  const rows = reach.map((rec) => {
    const counts = zero();
    let total = 0;
    // `new Set` because a caller that concatenated two tiers of the same join
    // could hand the same play in twice, and a cell is a count of plays.
    for (const id of new Set(rec.playIds)) {
      const band = bandOf.get(id);
      if (band === undefined || !(band in counts)) continue;
      counts[band] += 1;
      total += 1;
    }
    return { id: rec.id, label: rec.label, counts, total };
  });

  const union = new Set(reach.flatMap((rec) => rec.playIds));
  const missed = plays.filter((play) => !union.has(play.id));
  const noneCounts = zero();
  for (const play of missed) if (play.band in noneCounts) noneCounts[play.band] += 1;

  return {
    bands,
    totals,
    rows,
    none: { counts: noneCounts, total: missed.length, playIds: missed.map((p) => p.id) },
    reached: plays.length - missed.length,
    plays: plays.length,
  };
}

export type ChallengeRound = {
  /** The recommendations the report prints. */
  assured: number;
  /** What the challenge round was given to work from. */
  earlier: number;
  /** Earlier recommendations that no assured one cites — the advice that was dropped. */
  dropped: Artefact[];
};

/**
 * What the independent challenge did to the advice.
 *
 * SUPERSESSION IS TRACED THROUGH `refs`, not through position or wording. An
 * assured recommendation that rewrote an earlier one cites it; one that did not
 * is new. So an earlier recommendation cited by nobody was not rewritten, it was
 * removed — and on this run three of the six were, while all thirteen initial
 * FINDINGS were carried forward. Kept every conclusion, dropped half the advice.
 *
 * `all` and `assured` are both passed in because `recommendations()` already
 * decides which generation is current, and deciding it a second time here is how
 * two parts of one page come to disagree about what the report says.
 */
export function challengeRound(all: Artefact[], assured: Artefact[]): ChallengeRound {
  const current = new Set(assured.map((rec) => rec.id));
  const earlier = all.filter((rec) => !current.has(rec.id));
  const cited = new Set(assured.flatMap((rec) => rec.refs ?? []));
  return {
    assured: assured.length,
    earlier: earlier.length,
    dropped: earlier.filter((rec) => !cited.has(rec.id)),
  };
}
