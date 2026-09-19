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
