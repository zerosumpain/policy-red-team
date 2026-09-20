/**
 * THE ARITHMETIC OF THE SHARED FIGURES, OUT OF THE COMPONENTS.
 *
 * `relationships.ts` already holds `bars()` for the same reason this file
 * exists: "a chart whose arithmetic lives in its JSX cannot be tested, and the
 * one thing that must never happen to a bar chart is a bar of the wrong
 * length". These are the three pieces of geometry the new primitives need —
 * where a tick sits on a strip, where a band cut falls between two real values,
 * and how long the two halves of a diverging row are — kept here so each is
 * asserted in a test rather than eyeballed on a screenshot.
 *
 * NOTHING HERE KNOWS WHAT A PLAY IS. The strip is fed numbers and the diverge is
 * fed pairs of counts, so Move 1's exposure spread and Move 2's in/out degrees
 * use the same code without either importing the other's vocabulary.
 */

export type StripValue = {
  id: string;
  label: string;
  value: number;
};

export type StripTick = StripValue & {
  /** Position on the axis as a fraction of it, 0 at `min` and 1 at `max`. */
  at: number;
};

export type StripCut = {
  value: number;
  at: number;
  /** The nearest value below the cut, and the nearest at or above it. */
  below: number | null;
  above: number | null;
  /**
   * How much daylight there actually is at this cut.
   *
   * A band edge is a threshold, not a gap: the assessment's own `BANDS` put
   * severe at 0.7 and significant at 0.5 and draws both the same way. Measured
   * on the live run, the plays either side of 0.7 are 0.0039 apart and the plays
   * either side of 0.5 are 0.0847 apart — one cut is a hairline through a
   * cluster and the other is a real break, and that difference is the whole
   * reason the strip is worth drawing.
   */
  gap: number | null;
};

export type Strip = {
  min: number;
  max: number;
  ticks: StripTick[];
  cuts: StripCut[];
};

/** Where every value and every cut sits on one stated axis. */
export function strip(
  values: StripValue[],
  { min = 0, max = 1, cuts = [] }: { min?: number; max?: number; cuts?: number[] } = {},
): Strip {
  // A zero-width axis would put every tick at the same place and divide by zero
  // doing it; one value repeated forty-seven times is a legitimate run and has
  // to draw as a single line rather than as NaN.
  const span = max - min;
  const at = (value: number) => (span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0);

  const sorted = values.map((v) => v.value).sort((a, b) => a - b);
  return {
    min,
    max,
    ticks: values.map((v) => ({ ...v, at: at(v.value) })),
    cuts: cuts.map((value) => {
      const below = sorted.filter((v) => v < value);
      const above = sorted.filter((v) => v >= value);
      const lo = below.length ? below[below.length - 1] : null;
      const hi = above.length ? above[0] : null;
      return { value, at: at(value), below: lo, above: hi, gap: lo !== null && hi !== null ? hi - lo : null };
    }),
  };
}

export type Cluster = { count: number; of: number; low: number; high: number; width: number };

/**
 * The narrowest stretch of the axis that holds most of the values.
 *
 * NOT A GAP-DETECTING HEURISTIC, after trying one. Splitting the sorted values
 * wherever a consecutive gap exceeded k times the median gap gave 35 plays at
 * k = 4, 6 and 8 and 38 at k = 10 — the answer moved with the knob, which makes
 * it an argument about the knob rather than about the assessment. A share is a
 * stated quantity: "four in five of these sit inside this much of the scale" is
 * one number a reader can check against the axis, and the window it names is the
 * smallest one that can hold them.
 */
export function cluster(values: number[], share = 0.8): Cluster | null {
  if (!values.length || share <= 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const count = Math.min(sorted.length, Math.ceil(sorted.length * share));
  let best: Cluster | null = null;
  for (let i = 0; i + count - 1 < sorted.length; i++) {
    const low = sorted[i];
    const high = sorted[i + count - 1];
    const width = high - low;
    if (!best || width < best.width) best = { count, of: sorted.length, low, high, width };
  }
  return best;
}

export type DivergeInput = { left: number; right: number };
export type DivergeShare = { left: number; right: number };

/**
 * The longest half-row in a set, which is the scale every half-row is drawn on.
 *
 * ONE PEAK ACROSS EVERY ROW PASSED, and passed in rather than recomputed where
 * two blocks sit side by side: Move 2 draws bodies against machinery as two
 * separate figures making one comparison, and two blocks each normalised to
 * their own longest bar would draw 9 out and 6 in at the same length.
 */
export function divergePeak(rows: DivergeInput[]): number {
  return Math.max(0, ...rows.map((row) => Math.max(row.left, row.right)));
}

/** Each half as a percentage of the peak — the width a fill is given. */
export function divergeShares(rows: DivergeInput[], peak = divergePeak(rows)): DivergeShare[] {
  // A peak of zero means every count is zero. Two empty halves either side of
  // the centre rule is the honest drawing of that; dividing by it is not.
  const share = (n: number) => (peak > 0 ? Math.min(100, Math.max(0, (n / peak) * 100)) : 0);
  return rows.map((row) => ({ left: share(row.left), right: share(row.right) }));
}
