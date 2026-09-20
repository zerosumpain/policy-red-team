import { cluster, strip, type StripValue, type Cluster, type StripCut } from '$lib/figures';
import { BANDS } from '$lib/policy-analysis/exposure';
import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';

/**
 * WHAT THE EXPOSURE STRIP SAYS, COMPUTED WHERE IT CAN BE TESTED.
 *
 * `selection.ts` and `weighting.ts` are the precedent: presentation arithmetic
 * lives beside the component as a plain module with a test, because a caption
 * asserting "38 of 47 plays sit between 0.54 and 0.77" is a claim about the
 * assessment and a claim about the assessment is not something to write by hand
 * into JSX. Every number in the sentence this file returns is read off the plays
 * it was given.
 *
 * THE CUTS COME FROM `BANDS`, not from a list typed here. They are the floors the
 * scorer itself thresholds on — 0.7, 0.5, 0.3 — so if the assessment ever
 * re-cuts its bands the strip moves its rules with it instead of quietly drawing
 * the old ones.
 */

/** Everything the strip needs off a play, and nothing else — so the test can build forty-seven of them. */
export type SpreadPlay = { id: string; label: string; exposure: number; band: Band };

export type BandSpan = {
  band: Band;
  label: string;
  count: number;
  /** The lowest and highest exposure actually in this band on this run. */
  low: number | null;
  high: number | null;
  /** The stretch of the axis this band OWNS, which is not the same thing: the floors, not the plays. */
  from: number;
  to: number;
};

export type Spread = {
  values: StripValue[];
  cuts: number[];
  cluster: Cluster | null;
  spans: BandSpan[];
  /** The stretches between the cuts, named and counted, for the strip's axis. */
  regions: { label: string; from: number; to: number }[];
  caption: string;
};

/** Exposure is a geometric mean of four judgements on [0,1], so the axis is the scale itself, not the range that turned up. */
const MIN = 0;
const MAX = 1;

export const bandCuts = (): number[] => BANDS.map((b) => b.floor).filter((floor) => floor > MIN);

export function bandSpans(plays: SpreadPlay[]): BandSpan[] {
  return BANDS.map(({ band, floor }, i) => {
    const mine = plays.filter((p) => p.band === band).map((p) => p.exposure);
    return {
      band,
      label: BAND_LABEL[band],
      count: mine.length,
      low: mine.length ? Math.min(...mine) : null,
      high: mine.length ? Math.max(...mine) : null,
      from: floor,
      // `BANDS` runs heaviest first, so the ceiling of a band is the floor of the
      // one before it — and the top band's ceiling is the top of the scale.
      to: i === 0 ? MAX : BANDS[i - 1].floor,
    };
  });
}

export function exposureSpread(plays: SpreadPlay[]): Spread {
  const values: StripValue[] = plays.map((p) => ({ id: p.id, label: p.label, value: p.exposure }));
  const cuts = bandCuts();
  const found = cluster(plays.map((p) => p.exposure));
  const plot = strip(values, { min: MIN, max: MAX, cuts });
  const spans = bandSpans(plays);
  return {
    values,
    cuts,
    cluster: found,
    spans,
    // The count goes in the region label because the strip is drawn in one ink:
    // a reader needs the stretch named, and having named it, the number of plays
    // standing in it is the next thing they would ask.
    regions: spans.map((span) => ({ label: `${span.label} ${span.count}`, from: span.from, to: span.to })),
    caption: captionOf(found, plot.cuts),
  };
}

const two = (n: number) => n.toFixed(2);
/** Four places, because the whole finding at the severe cut is 0.0039 and three would round it to 0.004. */
const four = (n: number) => n.toFixed(4);

function captionOf(found: Cluster | null, cuts: StripCut[]): string {
  const parts: string[] = [];
  if (found) {
    const share = Math.round((found.width / (MAX - MIN)) * 100);
    parts.push(
      `${found.count} of the ${found.of} plays sit between ${two(found.low)} and ${two(found.high)} — ${share}% of the scale.`,
    );
  }
  // A cut with nothing on one side of it has no gap to report, and printing
  // "0.0000" there would read as two plays touching across a boundary nothing is
  // near. Those cuts are left out of the sentence rather than guessed at.
  const measured = cuts.filter((cut) => cut.gap !== null);
  if (measured.length) {
    parts.push(
      `The cuts are not alike: the plays either side of ${measured
        .map((cut) => `${two(cut.value)} are ${four(cut.gap as number)} apart`)
        .join(', either side of ')}.`,
    );
  }
  return parts.join(' ');
}
