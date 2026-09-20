/**
 * THE GEOMETRY OF THE EASE × IMPACT SCATTER, OUT OF THE COMPONENT.
 *
 * `plotPoints()` in the copied core is 11 lines and no test covers it, which is
 * exactly how the drawing came to be wrong in four separate ways at once. All
 * four are arithmetic, and all four are asserted beside this file rather than
 * eyeballed on a screenshot:
 *
 *   THE BOX WAS 360 UNITS RENDERED AT 600px, a scale of 1.667 — so `r="6"`
 *   painted a 20px circle and `fontSize="13"` painted 21.7px type, larger than
 *   the report's own 19px body. Measured on the live page: the grey plot rect
 *   is exactly 600 × 600 and "Easier to do →" is set bigger than the prose
 *   around it. Here the box is 720 units drawn at 720px, so a user unit IS a
 *   CSS pixel at full width and a font size means what it says.
 *
 *   THE DOMAIN WAS [0,1] AND THE DATA IS NOT. On this assessment ease runs
 *   0.20–0.90 and impact 0.01–0.72, so the marks used 50% of the plot area and
 *   the whole lower-left quadrant was permanently empty. The domain is fitted,
 *   which is what takes the overlapping pairs from 53 to 16.
 *
 *   NOTHING SAID WHERE A POSITION WAS. Two bare axis lines, no ticks, no
 *   numbers, no gridlines: a mark at three quarters of the way across could not
 *   be read as 0.72 by anybody.
 *
 *   THREE PAIRS OF PLAYS SHARE A COORDINATE EXACTLY, so three plays were drawn
 *   and painted over. Two of those pairs are severe-and-severe — identical
 *   shape, identical fill — so no paint order and no opacity saves them. They
 *   are the only marks this file moves, and it moves both halves of the pair
 *   half a mark apart so their midpoint is still the value they share.
 *
 * NOTHING HERE KNOWS WHAT A `Play` IS beyond six fields. The component maps its
 * `Play[]` down with `plotPlays()`, which is also here so the mapping is tested
 * rather than trusted — indexing a parallel array is how the old code coloured
 * its marks, and it is the pairing that silently mis-colours the day anything
 * filters the list.
 */
import type { Band } from '$lib/policy-analysis/exposure';
import type { Play } from '$lib/policy-analysis/view';

export type PlotPlay = {
  id: string;
  label: string;
  band: Band;
  exposure: number;
  ease: number;
  impact: number;
};

/**
 * The shape a band is drawn as.
 *
 * Band is a function of exposure, the geometric mean of four factors, so it is
 * NOT recoverable from a position on two of them — fill was its only signal,
 * and measured against the plot's own `#f3f2f1` ground the ramp runs 12.02:1,
 * 5.55:1, 2.30:1 and 1.23:1, with moderate and limited only 1.87:1 apart. A
 * four-way call at that separation is not a call. Shape survives greyscale, a
 * photocopier and every form of colour blindness.
 */
export type MarkShape = 'circle' | 'square' | 'diamond' | 'ring';

export const BAND_SHAPE: Record<Band, MarkShape> = {
  severe: 'circle',
  significant: 'square',
  moderate: 'diamond',
  limited: 'ring',
};

/**
 * Radius by band, in user units.
 *
 * NOT `plotPoints`' own `r = 8 + exposure * 16`, which the core's `BAND_INK`
 * docstring claims every mark is sized by and which nothing has ever used:
 * measured on this run it takes the overlapping pairs from 53 to 413, and
 * `corr(exposure, impact) = 0.957`, so mark area would be a 96%-faithful
 * restatement of the mark's own height. Four steps agree with the four shapes
 * instead of competing with them, and the whole ramp fits in 4.5 units of
 * radius so the fitted domain is not spent back on ink.
 */
export const BAND_RADIUS: Record<Band, number> = {
  severe: 9,
  significant: 7.5,
  moderate: 6,
  limited: 4.5,
};

/**
 * A heavier outline on the two bands whose fill cannot be seen.
 *
 * Moderate at 2.30:1 and limited at 1.23:1 are below the 3:1 floor against the
 * plot ground; their outline is the only part of them that clears it, so it is
 * drawn at 1.5px against the darker bands' 1px. Third cue after shape and size,
 * and the one that survives a fax.
 */
export const BAND_STROKE: Record<Band, number> = {
  severe: 1,
  significant: 1,
  moderate: 1.5,
  limited: 1.5,
};

export type PlotPoint = {
  play: PlotPlay;
  /** User-space coordinates inside the box, mark centre. */
  x: number;
  y: number;
  r: number;
  shape: MarkShape;
  stroke: number;
  /**
   * How far this mark was moved off its own value, in user units, and why.
   *
   * Non-zero only for a play that shares a coordinate with another play
   * exactly. Everything else sits on its value, which is the promise the ticks
   * make on the reader's behalf.
   */
  shifted: number;
};

export type PlotTick = {
  value: number;
  /** The user-space coordinate of the tick along its own axis. */
  at: number;
};

export type PlotFrame = {
  box: number;
  area: { left: number; top: number; width: number; height: number };
  domain: { x: [number, number]; y: [number, number] };
  ticks: { x: PlotTick[]; y: PlotTick[] };
  /** Paint order: ascending exposure, so severe marks land LAST and on top. */
  points: PlotPoint[];
  /** Where the halfway rule on each axis falls, or null when it is off the fitted domain. */
  cross: { x: number | null; y: number | null };
  /** Marks whose ink touches another mark's ink, after the coincidence shift. */
  overlap: { pairs: number; marks: number };
  /** The question the figure was drawn to answer, as a count. */
  quadrant: { both: number; hard: number; total: number };
  /** The two marks worth naming: furthest right, and highest. */
  extremes: { ease: PlotPoint; impact: PlotPoint } | null;
};

/** The drawing is 720 units and is drawn at 720px, so a unit is a pixel. */
export const PLOT_BOX = 720;
/**
 * Room for the y tick labels and the rotated caption on the left, for the x
 * tick labels and its caption below, and 28 for the half of a 9-unit mark that
 * hangs past the domain edge at the other two sides. Left + right and top +
 * bottom are equal totals on purpose: the plot area comes out square, and both
 * axes span exactly 0.80 on this run, so a unit of ease and a unit of impact
 * are the same distance and the diagonal means something.
 */
export const PLOT_MARGIN = { left: 72, right: 28, top: 28, bottom: 72 };

/** Halfway on each axis — the line the "easy and damaging" question is asked about. */
const HALFWAY = 0.5;
/** The dangerous quadrant's inner threshold, as the lead already frames it. */
const HARD = { ease: 0.7, impact: 0.6 };
/** Domain edges snap to this, so the tick labels are numbers a reader would write. */
const SNAP = 0.05;
/** Clear air around the data, as a share of its own span. */
const BREATHE = 0.05;

// `+ 0` is not decoration: `Math.ceil(-1e-9)` is negative zero, so a domain
// starting at 0 produced a tick whose label rendered as "-0.0". Adding zero
// turns negative zero back into zero and leaves every other value alone.
const round = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/**
 * An envelope round the data that a reader would recognise as a scale.
 *
 * Padded by a twentieth of the observed span and then snapped OUTWARD to the
 * nearest 0.05, clamped to the 0–1 the factors are defined on. The padding is
 * not cosmetic: it is what guarantees a strip of empty plot at the top of the
 * box, which is where the quadrant's own count is written — at 5% of a 620-unit
 * axis that is 31 units of clear air for a 13px label, on any run.
 */
export function fitDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // One value repeated is a legitimate run and must not produce a zero-width
  // axis, which would put every mark in the same place and divide by zero.
  const span = hi - lo || 1;
  const out: [number, number] = [
    Math.max(0, round(Math.floor((lo - span * BREATHE) / SNAP + 1e-9) * SNAP)),
    Math.min(1, round(Math.ceil((hi + span * BREATHE) / SNAP - 1e-9) * SNAP)),
  ];
  return out[0] === out[1] ? [Math.max(0, out[0] - SNAP), Math.min(1, out[1] + SNAP)] : out;
}

/** Every tenth inside the domain, inclusive — the numbers that get printed. */
export function axisTicks([lo, hi]: [number, number]): number[] {
  const out: number[] = [];
  for (let step = Math.ceil(lo * 10 - 1e-9); step <= Math.floor(hi * 10 + 1e-9); step++) {
    out.push(round(step / 10));
  }
  return out;
}

/** A `Play` reduced to the six fields the drawing uses. */
export function plotPlays(plays: Play[]): PlotPlay[] {
  const factor = (play: Play, key: string) => play.factors.find((f) => f.key === key)?.value ?? 0;
  return plays.map((play) => ({
    id: play.artefact.id,
    label: play.artefact.label,
    band: play.band,
    exposure: play.exposure,
    ease: factor(play, 'ease'),
    impact: factor(play, 'impact'),
  }));
}

export function plotFrame(plays: PlotPlay[], box = PLOT_BOX, margin = PLOT_MARGIN): PlotFrame {
  const area = {
    left: margin.left,
    top: margin.top,
    width: box - margin.left - margin.right,
    height: box - margin.top - margin.bottom,
  };
  const domain = {
    x: fitDomain(plays.map((p) => p.ease)),
    y: fitDomain(plays.map((p) => p.impact)),
  };
  const toX = (v: number) => area.left + ((v - domain.x[0]) / (domain.x[1] - domain.x[0])) * area.width;
  const toY = (v: number) => area.top + (1 - (v - domain.y[0]) / (domain.y[1] - domain.y[0])) * area.height;

  /*
   * THE ONLY MARKS THAT MOVE.
   *
   * Three pairs share a coordinate exactly on this run — (0.78, 0.62),
   * (0.72, 0.68) and (0.68, 0.66) — and two of the three are severe against
   * severe, so they are the same shape in the same fill and one is simply not
   * on the page. The group is spread on a pitch of its largest radius and
   * CENTRED on the shared value, so neither half is presented as the truth and
   * the pair's midpoint still is. At 9 units against a 77-unit gridline
   * interval that is an eighth of one tenth; the figcaption says it happened
   * and how many marks it touched.
   */
  const groups = new Map<string, PlotPlay[]>();
  for (const play of plays) {
    const key = `${play.ease},${play.impact}`;
    const found = groups.get(key);
    if (found) found.push(play);
    else groups.set(key, [play]);
  }
  const shift = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.exposure - b.exposure || a.id.localeCompare(b.id));
    const pitch = Math.max(...ordered.map((p) => BAND_RADIUS[p.band]));
    ordered.forEach((play, i) => shift.set(play.id, (i - (ordered.length - 1) / 2) * pitch));
  }

  /*
   * PAINT ASCENDING BY EXPOSURE, which is one line and fixes the worst defect
   * on the figure. `plays()` sorts DESCENDING and the old code mapped it
   * straight into the DOM, so the severe marks were drawn first and every
   * lighter mark painted over them: 16 of the 20 severe marks were under
   * something drawn later. The reader was being shown the least alarming
   * version of a cloud whose whole point is the alarming corner of it.
   */
  const points: PlotPoint[] = [...plays]
    .sort((a, b) => a.exposure - b.exposure || a.id.localeCompare(b.id))
    .map((play) => ({
      play,
      x: toX(play.ease) + (shift.get(play.id) ?? 0),
      y: toY(play.impact),
      r: BAND_RADIUS[play.band],
      shape: BAND_SHAPE[play.band],
      stroke: BAND_STROKE[play.band],
      shifted: shift.get(play.id) ?? 0,
    }));

  let pairs = 0;
  const touching = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
        pairs++;
        touching.add(a.play.id);
        touching.add(b.play.id);
      }
    }
  }

  const inside = (v: number, [lo, hi]: [number, number]) => v > lo && v < hi;

  /*
   * Ties broken on the OTHER axis, then on exposure, then on the id.
   *
   * Two plays share the highest ease on this run — 0.90 with impact 0.65 and
   * 0.90 with impact 0.18 — so a bare argmax names whichever the sort happened
   * to leave first, and would name a different play on a re-run. Breaking on
   * the other axis picks the one that is actually further into the corner,
   * which is the play the sentence beside the figure is about.
   */
  const best = (of: (p: PlotPlay) => number, other: (p: PlotPlay) => number) =>
    points.reduce((a, b) => {
      const rank = of(b.play) - of(a.play)
        || other(b.play) - other(a.play)
        || b.play.exposure - a.play.exposure
        || a.play.id.localeCompare(b.play.id);
      return rank > 0 ? b : a;
    });

  return {
    box,
    area,
    domain,
    ticks: {
      x: axisTicks(domain.x).map((value) => ({ value, at: toX(value) })),
      y: axisTicks(domain.y).map((value) => ({ value, at: toY(value) })),
    },
    points,
    cross: {
      x: inside(HALFWAY, domain.x) ? toX(HALFWAY) : null,
      y: inside(HALFWAY, domain.y) ? toY(HALFWAY) : null,
    },
    overlap: { pairs, marks: touching.size },
    quadrant: {
      both: plays.filter((p) => p.ease > HALFWAY && p.impact > HALFWAY).length,
      hard: plays.filter((p) => p.ease > HARD.ease && p.impact > HARD.impact).length,
      total: plays.length,
    },
    extremes: points.length
      ? {
          ease: best((p) => p.ease, (p) => p.impact),
          impact: best((p) => p.impact, (p) => p.ease),
        }
      : null,
  };
}
