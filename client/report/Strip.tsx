import { strip, type StripValue } from '$lib/figures';

/**
 * WHERE EVERY VALUE ACTUALLY FALLS ON A SCALE, AND WHERE THE CUTS ARE.
 *
 * A stacked bar says twenty of forty-seven plays are severe. It cannot say that
 * the lowest severe play and the highest significant one are 0.0039 apart while
 * the next cut down is a 0.0847 break, or that four fifths of the run sits inside
 * a quarter of the scale. Four bands drawn as four equal tiers is a picture of a
 * classification; this is a picture of the distribution the classification was
 * cut out of.
 *
 * SVG HERE, AND THE LABELS IN HTML BESIDE IT — which is the opposite of this
 * build's usual answer and has one reason: a browser prints no backgrounds
 * unless it is asked to, so a tick drawn as a `background` on a positioned
 * `<span>` disappears from the printed copy, while an SVG `fill` is ink and
 * prints. Everything that is type — the axis ends, the cut values — stays in
 * HTML, where it scales with the reader rather than with the viewBox.
 *
 * NO STROKES, ONLY FILLED RECTANGLES. The box is stretched horizontally to the
 * width of its column (`preserveAspectRatio="none"`), which scales x and y by
 * different factors: a stroked line would come out thicker one way than the
 * other, where a rectangle is a rectangle.
 *
 * EVERY TICK IS INK, AND THE BANDS ARE NAMED UNDER THE AXIS RATHER THAN
 * COLOURED INTO IT. Drawn in the ramp, a limited play is #f0d5e3 on a `tint-95`
 * track — 1.23:1, measured — so the two lightest bands were two pixels of
 * nothing at the left-hand end, which is precisely where the report's most
 * interesting emptiness is. Position already carries the band here, because the
 * cuts are drawn: a tick right of the 0.70 rule IS a severe play. Naming the
 * stretches under the axis says it in words for everyone.
 *
 * BELOW 641px ITS FIGURE SHOWS THE TABLE, which is the reading this is built to
 * have at 320: the ticks are two units of a 1,000-unit box, so on a 300px axis
 * they are sub-pixel, and four named stretches collide into each other. The
 * stylesheet degrades the labels to a list anyway, for a caller that draws this
 * outside a `Figure`.
 *
 * NOT A SELECTOR. The bar above this one carries the band selection, so there is
 * no second focus order and no second state to keep in step. Each tick names its
 * row in a `<title>` for a pointer, and the figure's table twin is the reading
 * for everyone else.
 */

/** The viewBox is 1,000 units wide so a tick's position is a tenth of a percent. */
const UNITS = 1000;
/** Two units on a plot drawn about 1,100px wide is a little over 2px — a hair, and visible. */
const TICK = 2;
const CUT = 1;

export function Strip({ values, min = 0, max = 1, cuts = [], regions = [], label, format = (n: number) => n.toFixed(2), minLabel, maxLabel }: {
  values: StripValue[];
  min?: number;
  max?: number;
  /** The cut points, as values on the same axis — band floors, a median, a target. */
  cuts?: number[];
  /** The stretches between the cuts, named: "Severe 20", "Significant 18". */
  regions?: { label: string; from: number; to: number }[];
  /** What a screen reader hears in place of the drawing. */
  label: string;
  format?: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
}) {
  if (!values.length) return null;
  const plot = strip(values, { min, max, cuts });
  // Kept inside the box at both ends: a tick at 1.0 drawn from its centre would
  // hang half its width past the frame, which reads as a value off the scale.
  const x = (at: number, width: number) => Math.min(UNITS - width, Math.max(0, at * UNITS - width / 2));

  return (
    <div className="prt-strip">
      <div className="prt-strip__track">
        <svg viewBox={`0 0 ${UNITS} 44`} width="100%" height="44" preserveAspectRatio="none" role="img" aria-label={label}>
          {/* Ticks overlap where two values are within about two thousandths of
              each other — 0.7386, 0.7388 and 0.7388 on this run — and they are
              all one ink, so an overlap reads as one slightly wider mark rather
              than as whichever the array happened to hold last. */}
          {plot.ticks.map((tick) => (
            <rect
              key={tick.id}
              x={x(tick.at, TICK)}
              y="4"
              width={TICK}
              height="36"
              fill="#0b0c0c"
            >
              <title>{`${tick.label}: ${format(tick.value)}`}</title>
            </rect>
          ))}
          {/* The cut runs the full height of the track and the ticks stop short
              of it, so a cut is never mistaken for one more value. */}
          {plot.cuts.map((cut) => (
            <rect key={cut.value} x={x(cut.at, CUT)} y="0" width={CUT} height="44" fill="#0b0c0c" />
          ))}
        </svg>
      </div>
      {/* `aria-hidden`, because these repeat the axis the label already states
          and a screen reader reading "0.00 0.30 0.50 0.70 1.00" out of a row of
          absolutely positioned spans learns nothing from it. */}
      <div className="prt-strip__axis" aria-hidden="true">
        <span className="prt-strip__end">{minLabel ?? format(min)}</span>
        {plot.cuts.map((cut) => (
          <span key={cut.value} className="prt-strip__cut" style={{ left: `${cut.at * 100}%` }}>{format(cut.value)}</span>
        ))}
        <span className="prt-strip__end prt-strip__end--max">{maxLabel ?? format(max)}</span>
      </div>
      {regions.length ? (
        <p className="prt-strip__regions" aria-hidden="true">
          {regions.map((region) => (
            <span
              key={region.label}
              className="prt-strip__region"
              // Centred in its own stretch rather than on a cut: the label names
              // what is between two rules, and hanging it off one of them would
              // read as belonging to the rule.
              style={{ left: `${(((region.from + region.to) / 2 - min) / (max - min)) * 100}%` }}
            >
              {region.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
