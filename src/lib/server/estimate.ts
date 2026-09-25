import {
  ASSURANCE_CATEGORIES, DEEP_CHAINS, DEFAULT_CONCURRENCY, DEPTH_LIMITS, PATTERNS, SCENARIOS, STAGES, type Depth,
} from '$lib/policy-analysis/contracts';

/**
 * HOW LONG IS THIS GOING TO TAKE?
 *
 * The honest answer at submission time is "nobody knows", and this does not
 * pretend otherwise. What it does is turn the pipeline's own arithmetic into a
 * RANGE, and say what the range is made of — because a reader watching a
 * progress bar for forty minutes deserves to know whether that is normal.
 *
 * THE COUNT IS PART KNOWN, PART CAPPED, PART GUESSED, and the three are kept
 * apart rather than averaged into a single confident number:
 *
 *   KNOWN     ingestion has already split the paper, so decomposition's
 *             fan-out is exactly the passage count. This is most of the run.
 *   CAPPED    actors, research questions and their follow-ups cannot exceed
 *             `DEPTH_LIMITS` for the chosen depth. The upper bound is real.
 *   FIXED     patterns (10), scenarios (8) and assurance categories (7) are
 *             constants in `contracts.ts`. They do not vary at all.
 *   GUESSED   entity groups and mechanisms are discovered, with no ceiling.
 *             They are scaled off the passage count, and that is the part of
 *             this estimate most likely to be wrong.
 *
 * THE CLOCK COMES FROM THIS RUN, NOT FROM A CONSTANT. A per-call duration
 * hard-coded here would be wrong for every model: the same paper ran at 6.6s a
 * call on `deepseek/deepseek-v4-flash` and 27.5s on the build behind
 * `~deepseek/deepseek-v4-flash-latest`, a four-fold difference that no default
 * could straddle. So the estimate says nothing about time until calls have
 * actually completed, and sharpens as more do.
 */

/** One stage's fan-out, and how much we actually know about it. */
type Fan = { low: number; high: number };

const fixed = (n: number): Fan => ({ low: n, high: n });

export type RunEstimate = {
  /** Model calls still to make, low and high. */
  calls: Fan;
  /** Model calls already made. Shown beside the remainder so the scale is visible. */
  made: number;
  /** Seconds remaining, or null while nothing has been measured yet. */
  seconds: Fan | null;
  /** Median seconds per completed call, or null. */
  perCall: number | null;
  /** How many completed calls the clock is based on. */
  measured: number;
  /** One sentence a reader can check the estimate against. */
  basis: string;
};

/**
 * Calls each fan-out stage will make.
 *
 * Stages absent from this map make one call. The keys are stage ordinals, and
 * they are the ones `pipeline.ts` calls `fanOut` for — if a stage gains or loses
 * a fan-out upstream this goes stale, which is why `basis` prints the numbers
 * rather than hiding them.
 */
function fanOuts(passages: number, artefacts: number, depth: Depth): Map<number, Fan> {
  const limits = DEPTH_LIMITS[depth];
  /*
   * THE LATER FAN-OUTS SCALE WITH ARTEFACTS, NOT PASSAGES, and getting that
   * wrong is how this estimate misled a whole afternoon.
   *
   * The first version sized every stage off the passage count, because
   * decomposition does. It predicted 149–213 calls for a 72-passage paper. The
   * real run made 385 by STAGE TWO, because decomposition had turned those 72
   * passages into 4,664 artefacts and the graph and theory stages fan out over
   * those. Being wrong by 2.5x is bad; being wrong LOW is worse, because an
   * estimate that under-reads is an estimate that says "nearly done" to someone
   * deciding whether to let it keep spending.
   *
   * `artefacts` is what exists NOW, which early in a run is only the passages —
   * so the guess starts pessimistic and sharpens as the inventory grows, rather
   * than starting cheerful and being overtaken.
   */
  const inventory = Math.max(artefacts, passages);
  return new Map<number, Fan>([
    // Known exactly: ingestion has already produced these.
    [1, fixed(passages)],
    // Entity groups cluster the INVENTORY, not the passages.
    [3, { low: Math.ceil(inventory / 40), high: Math.ceil(inventory / 12) }],
    // Capped by depth. The floor is not zero — a paper with no actors would not
    // be a policy paper — but it is well under the cap for a short document.
    [4, { low: Math.min(4, limits.actors), high: limits.actors }],
    [6, { low: Math.ceil(limits.questions / 2), high: limits.questions * limits.rounds }],
    // Fixed constants in contracts.ts.
    [7, fixed(PATTERNS.length)],
    [9, fixed(SCENARIOS.length)],
    [10, { low: Math.min(4, limits.actors), high: limits.actors }],
    // One programme logic model and at most DEEP_CHAINS deep chains since
    // phase 19; it used to scale with the inventory, one chain per mechanism.
    [14, { low: Math.min(DEEP_CHAINS, Math.max(1, Math.ceil(inventory / 60))) + 1, high: DEEP_CHAINS + 1 }],
    [16, fixed(ASSURANCE_CATEGORIES.length)],
  ]);
}

export function estimateRun({ passages, artefacts = 0, depth, completedStages, callDurationsMs, callsMade = 0, concurrency = DEFAULT_CONCURRENCY, repairRate = 0 }: {
  passages: number;
  /** Every artefact the run holds so far. The later fan-outs scale with THIS. */
  artefacts?: number;
  /** Calls already made, so the page can show the total rather than only what is left. */
  callsMade?: number;
  depth: Depth;
  /** Stage ordinals already finished, so their calls are not counted again. */
  completedStages: number[];
  /**
   * Durations of calls that have FINISHED in this run — completed or failed —
   * in milliseconds. A call that timed out still took the time it took.
   */
  callDurationsMs: number[];
  /**
   * How many units of a fan-out run at once. Defaults to `DEFAULT_CONCURRENCY`,
   * which is six since phase 19 — it was one, and the run of 2026-09-19 showed
   * what that meant: every call started at the exact second the previous one
   * ended. Wall-clock divides by this.
   */
  concurrency?: number;
  /**
   * Extra calls per unit, as a fraction, for the repair round-trip.
   *
   * A reply that fails validation gets a corrective attempt, sometimes two, and
   * those are real calls on the clock: `passage_0006` cost three. Ignoring them
   * made the first version of this estimate optimistic by however often the
   * model was sloppy, which is not a constant and so is measured rather than
   * assumed.
   */
  repairRate?: number;
}): RunEstimate {
  const done = new Set(completedStages);
  const fans = fanOuts(passages, artefacts, depth);

  let low = 0;
  let high = 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    if (done.has(stage)) continue;
    // Ingestion makes no model call at all — it is extraction, and counting it
    // would put a call in the estimate that never happens.
    if (stage === 0) continue;
    const fan = fans.get(stage) ?? fixed(1);
    low += fan.low;
    high += fan.high;
  }

  // THE MEDIAN, NOT THE MEAN. One call that took three minutes because a
  // provider was retrying drags a mean into nonsense, and the thing a reader
  // wants is the typical call.
  //
  // AND IT COUNTS THE FAILURES. The first version measured completed calls only,
  // which is survivorship bias with a clock attached: on the run of 2026-09-19 at
  // concurrency 6, three calls burned 420 seconds each hitting the deadline while
  // the four that finished averaged 172s — so excluding them made the estimate
  // FASTER the worse the run got. A call that failed still consumed the wall
  // clock it ran for, and the reader is waiting for wall clock.
  const sorted = [...callDurationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const perCall = !sorted.length
    ? null
    : (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) / 1000;

  // Repairs inflate the count; concurrency deflates the clock. Applied in that
  // order because a repair is a call whether or not anything ran beside it.
  const withRepairs = (n: number) => Math.round(n * (1 + Math.max(0, repairRate)));
  low = withRepairs(low);
  high = withRepairs(high);

  const lanes = Math.max(1, concurrency);
  const seconds = perCall === null
    ? null
    : { low: Math.round((low * perCall) / lanes), high: Math.round((high * perCall) / lanes) };

  const parts = [
    `${passages} passages, ${artefacts} artefacts`,
    // THE CALLS MADE COME FIRST. "149–213 left" read as a small job; "385 made,
    // 200–400 left" would have read as what it was.
    callsMade ? `${callsMade} calls made, ${low}–${high} left` : `${low}–${high} calls left`,
    lanes > 1 ? `${lanes} at a time` : 'one at a time',
    perCall === null
      ? 'no completed calls yet, so no time estimate'
      : `${perCall.toFixed(1)}s median over ${sorted.length} completed`,
  ];

  return { calls: { low, high }, made: callsMade, seconds, perCall, measured: sorted.length, basis: parts.join('; ') };
}

/** "about 25 minutes", "20–40 minutes", "under a minute" — never a false precision. */
export function describeEstimate(estimate: RunEstimate): string {
  if (!estimate.seconds) {
    return `${estimate.calls.low}–${estimate.calls.high} model calls to go. No timing yet — the first call has to finish before this can say anything about the clock.`;
  }
  const { low, high } = estimate.seconds;
  const unit = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} seconds` : `${Math.round(s / 60)} minutes`);
  // A range whose ends round to the same thing is not a range, and printing
  // "20-20 minutes" reads as a machine that has not thought about it.
  const lowText = unit(low);
  const highText = unit(high);
  return lowText === highText ? `about ${lowText} left` : `${unit(low).replace(/ (seconds|minutes)$/, '')} to ${highText} left`;
}
