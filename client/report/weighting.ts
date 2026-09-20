import { FACTOR_KEYS, type Play } from '$lib/policy-analysis/view';

/**
 * RE-RANKING, WITHOUT RE-SCORING.
 *
 * The assessment weighs incentive, ease, impact and concealment equally. A
 * reader may not: somebody deciding where to spend enforcement effort cares
 * about ease, somebody writing a monitoring plan cares about concealment. This
 * changes the order they read in, and nothing else.
 *
 * IT MUST REPRODUCE THE ASSESSMENT AT EQUAL WEIGHTS, exactly. If it does not,
 * the "your order" figure and the assessment's own figure are two different
 * arithmetics printed side by side, and a reader comparing them is comparing
 * this file's bug with the pipeline's answer. The test asserts it to four
 * decimal places against `exposureOf`, which is the copied implementation.
 *
 * THE FLOOR IS THE ASSESSMENT'S, and it is not symmetric. `exposure.ts` floors
 * concealment at 0.15 on the grounds that a play nobody would notice is not made
 * harmless by being noticeable — whereas zero incentive really is harmless, so
 * that factor has no floor and a geometric mean is allowed to collapse to zero.
 * A re-weighting that dropped the floor would produce orderings the pipeline
 * never would.
 */
export const FLOOR: Record<string, number> = { concealment: 0.15 };

export type Weights = Record<string, number>;

export const EQUAL: Weights = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 1]));

export function isEqual(weights: Weights): boolean {
  return FACTOR_KEYS.every((k) => (weights[k] ?? 1) === 1);
}

/**
 * The geometric mean of the four factors, each raised to its weight.
 *
 * A weight of zero removes a factor from the mean rather than multiplying by
 * zero — otherwise setting one slider to nothing would take every play to zero
 * and the list would stop having an order at all.
 */
export function weightedExposure(play: Play, weights: Weights): number {
  /*
   * CLAMPED, FLOORED, AND ZERO-SHORT-CIRCUITED — in that order, because that is
   * what `exposureOf` does. Any divergence here shows up as two different
   * numbers printed beside each other on the same play, one of them this file's
   * bug. Summing logarithms rather than multiplying powers for the same reason:
   * it is the copied implementation's arithmetic, and floating point is not
   * associative enough for "equivalent" to mean "identical to four places".
   */
  const parts: { value: number; weight: number }[] = [];
  for (const key of FACTOR_KEYS) {
    const weight = weights[key] ?? 1;
    if (weight <= 0) continue;
    const raw = Number(play.factors.find((f) => f.key === key)?.value);
    const clamped = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    parts.push({ value: Math.max(clamped, FLOOR[key] ?? 0), weight });
  }
  if (!parts.length) return 0;
  // A factor at zero takes the whole thing to zero: a play nobody is motivated
  // to run is not a threat, however easy it would be.
  if (parts.some((p) => p.value === 0)) return 0;
  const total = parts.reduce((n, p) => n + p.weight, 0);
  return Math.exp(parts.reduce((sum, p) => sum + p.weight * Math.log(p.value), 0) / total);
}

/** 1st, 2nd, 3rd, 4th — for a sentence that names a rank rather than printing it. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * WHAT THE RE-RANK ACTUALLY DID, as numbers rather than as a list that silently
 * re-orders.
 *
 * Measured by running `weightedExposure` above over the real 47 plays: impact ×0
 * changes the position of 41 of them and replaces four of the assessment's top
 * ten, biggest move 12 places; ease ×3 moves 35, biggest 15; incentive ×0 moves
 * 36, biggest 10; concealment ×3 moves 36, biggest 11. That is a large, real
 * effect, and before this the only sign of it was ten cards swapping places and
 * a second decimal on each one.
 *
 * MEASURED INSIDE WHAT IS ON SCREEN. `base` must be the list the reader can see
 * — the NARROWED one — not the whole run: under a mechanism selection the list
 * is six plays, and arrows drawn against all 47 would tell a reader a play moved
 * nine places when it moved one.
 *
 * A PLAY THAT WAS NOT IN THE BASE GETS NO ARROW. It has not moved from anywhere;
 * saying it rose from the end of a list it was never in would be an invention.
 *
 * Here rather than in the component because it is arithmetic the sentence on the
 * page is only as true as, and a component is not a thing this repo can test.
 */
export function rankMovement(base: Play[], ranked: Play[]): {
  /** How many plays sit at a different index than they did. */
  moved: number;
  /** The biggest single move, in places. */
  furthest: number;
  /** Where the play now at the top used to be, 1-based; 0 when it was not in the base list. */
  leaderWas: number;
  /** Per-play, positive for a move up the list. Absent where the play was not in the base. */
  places: Map<string, number>;
} {
  const was = new Map(base.map((play, i) => [play.artefact.id, i]));
  const places = new Map<string, number>();
  let moved = 0;
  let furthest = 0;
  ranked.forEach((play, i) => {
    const before = was.get(play.artefact.id);
    if (before === undefined) return;
    const delta = before - i;
    places.set(play.artefact.id, delta);
    if (delta !== 0) moved += 1;
    if (Math.abs(delta) > furthest) furthest = Math.abs(delta);
  });
  const leader = ranked.length ? was.get(ranked[0].artefact.id) : undefined;
  return { moved, furthest, leaderWas: leader === undefined ? 0 : leader + 1, places };
}
