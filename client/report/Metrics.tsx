import type { ReactNode } from 'react';

/**
 * THE FIGURES A READER TAKES AWAY, sized like figures.
 *
 * These were two-column tables and a wrapping run of numbers with their labels
 * above them: "items discarded / 148" beside "pages carried no policy text /
 * 4 of 72", each column as wide as its longest word, wrapping into a ragged
 * second row. A number that is the point of a section should not be smaller
 * than the sentence explaining it.
 *
 * ONE RULE MAKES THIS WORK: the number is the largest thing in the card, the
 * label sits under it, and every card is the same height whatever the label's
 * length. A grid of `auto-fit` columns with a floor keeps them even without
 * anyone counting them.
 *
 * A TONE IS NOT A DECORATION. `tone` tints the rule above the number, and it
 * carries no meaning a reader could miss: the label says what the figure is, and
 * the tone only agrees with it. Nothing here is red for "bad" — a discarded
 * artefact is not a failure, it is the pipeline refusing to keep something it
 * could not check, and colouring it as an alarm would misread the whole view.
 */
export type Metric = {
  label: string;
  value: ReactNode;
  /** A smaller line under the value: a denominator, a share, a qualifier. */
  note?: ReactNode;
  tone?: 'neutral' | 'severe' | 'significant' | 'moderate' | 'limited' | 'good';
};

export function Metrics({ metrics, columns }: { metrics: Metric[]; columns?: 2 | 3 | 4 }) {
  if (!metrics.length) return null;
  return (
    <dl className={`prt-metrics${columns ? ` prt-metrics--${columns}` : ''}`}>
      {metrics.map((metric) => (
        /*
         * THE TERM COMES FIRST IN THE MARKUP, and the figure is put back on top
         * in CSS (`.prt-metric__value { order: -1 }`).
         *
         * HTML's content model for a `div` inside a `dl` is one or more `dt`
         * followed by one or more `dd`. Emitting the value first made every one
         * of these a definition with no term — fourteen of them across the
         * report — and axe cannot see it: `structuredDlitemsEvaluate` walks the
         * `dl`'s direct children, which are these `div`s, so it never inspects
         * the ordering and the rule passes. A green gate on an invalid list.
         *
         * AND NO MODIFIER WHERE THERE IS NO TONE. This emitted
         * `prt-metric--neutral` on every untoned card and the stylesheet has
         * never defined it — it rendered correctly only because `.prt-metric`'s
         * own black rule is what "neutral" was meant to mean. A class the markup
         * asks for and the stylesheet has never heard of is a vocabulary with a
         * hole in it, and the hole is invisible precisely because the default is
         * right.
         */
        <div key={metric.label} className={`prt-metric${metric.tone ? ` prt-metric--${metric.tone}` : ''}`}>
          <dt className="prt-metric__label">{metric.label}</dt>
          <dd className="prt-metric__value">{metric.value}</dd>
          {metric.note ? <dd className="prt-metric__note">{metric.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * ONE BAR, SEGMENTED — not four cards standing next to each other.
 *
 * Exposure bands are parts of one whole: forty-seven plays divided four ways.
 * Four equal boxes say "four categories" and hide the only thing that matters,
 * which is that twenty of the forty-seven are severe. A segmented bar says it in
 * the geometry before a single number is read.
 *
 * EVERY SEGMENT CARRIES ITS WORD AND ITS COUNT, and where a segment is too
 * narrow to hold them the key below does — because the two light steps of the
 * ramp sit below 3:1 against the page and must never be the only signal. The
 * whole bar is a group of buttons: selecting one carries that band into the
 * other three moves.
 */
export type Segment = {
  id: string;
  label: string;
  count: number;
  /** The band class suffix: severe, significant, moderate, limited. */
  tone: string;
  /**
   * What this segment means for the reader, in the vocabulary's own words.
   *
   * `bandCounts()` has always returned `{ band, note, count }` and every caller
   * destructured the note onto the floor, so the report taught a reader four
   * colours and four words and withheld the actionable half: severe is "Strong
   * incentive, low effort, real damage, and hard to see. Redesign before
   * publication." A key that says "Severe 20 of 47 · 43%" and stops is a legend
   * for a chart rather than a reading of an assessment.
   */
  note?: string;
  selected?: boolean;
  onSelect?: () => void;
};

export function StackedBar({ segments, total, label }: { segments: Segment[]; total: number; label: string }) {
  const sum = total || segments.reduce((n, s) => n + s.count, 0);
  if (!sum) return null;

  return (
    <div className="prt-stack">
      <div className="prt-stack__bar" role="group" aria-label={label}>
        {segments.filter((s) => s.count).map((segment) => {
          const share = (segment.count / sum) * 100;
          return (
            <button
              key={segment.id}
              type="button"
              className={`prt-stack__seg prt-band--${segment.tone}${segment.selected ? ' is-selected' : ''}`}
              style={{ width: `${share}%` }}
              aria-pressed={segment.selected ?? false}
              onClick={segment.onSelect}
            >
              {/* Visible only where the segment is wide enough; the key below
                  carries it for every band regardless. */}
              <span className="prt-stack__n" aria-hidden="true">{segment.count}</span>
              <span className="govuk-visually-hidden">
                {segment.label}: {segment.count} of {sum}
                {/* The note goes inside the control, not only in the key below
                    it: a screen-reader user pressing "Severe, 20 of 47" is
                    choosing to narrow the whole report by it, and why 20 matters
                    is the thing that decides whether they want to. */}
                {segment.note ? `. ${segment.note}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      <ul className="prt-stack__key">
        {segments.map((segment) => (
          <li key={segment.id}>
            <span className={`prt-stack__swatch prt-band--${segment.tone}`} aria-hidden="true" />
            <strong>{segment.label}</strong>
            <span className="prt-denom">
              {segment.count} of {sum} · {Math.round((segment.count / sum) * 100)}%
            </span>
            {/* Hidden from assistive technology because the segment button above
                already carries it; a screen reader reading the bar and then the
                key hears the same sentence twice otherwise. */}
            {segment.note ? <span className="prt-stack__note" aria-hidden="true">{segment.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A NUMBER AND THE LENGTH THAT NUMBER IS.
 *
 * An exposure column of 0.77, 0.76, 0.75, 0.73 … 0.05 reads as a run of similar
 * decimals; it is a fifteen-fold spread. The bar is the comparison a reader
 * makes without doing arithmetic, and the figure stays on the row exactly as it
 * was, so nothing is read off the bar's length that is not also printed.
 *
 * NOT A COLOUR RAMP. The band already carries severity in the playbook, in four
 * steps a reader has been taught; repeating it here in a continuous scale would
 * be a second, finer encoding of the same thing, disagreeing with it at every
 * boundary. This is ink on grey and means only "more".
 */
export function Bar({ value, max = 1, digits, scale }: {
  value: number;
  max?: number;
  digits?: number;
  /**
   * What this length is measured against, for a screen reader — "summed
   * exposure, 0 to 5.75 on this table".
   *
   * THE SAME SENTENCE BELONGS IN THE FIGURE'S CAPTION, where it is said once and
   * seen. It is repeated per row here because a row is what a screen-reader user
   * reads: two tables in the same panel draw identical-looking bars on different
   * scales — one normalised to its own top row, one absolute on 0–1 — and
   * hearing "5.75" and "0.77" with nothing else is hearing two numbers that
   * cannot be compared and no way to know it.
   */
  scale?: string;
}) {
  const share = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  /*
   * PRECISION IS NOT A SIDE EFFECT OF THE AXIS MAXIMUM.
   *
   * This was `max > 1 ? 0 : 2`, which is right for a score out of a hundred —
   * "82.00" beside "72.00" is precision nobody asked for — and wrong for
   * anything summed. Move 4's pressure column passes the largest pressure as its
   * max, 5.749 on the live run, so every row printed whole: the twelve true
   * values 5.75, 5.09, 5.05, 5.05, 5.01, 4.64, 4.40, 3.59, 3.39, 2.98, 2.89,
   * 2.88 printed as 6, 5, 5, 5, 5, 5, 4, 4, 3, 3, 3, 3. Five consecutive rows
   * read 5 and four read 3, in a table whose only purpose is a ranking, with the
   * bars beside them drawn at the right lengths and contradicting the figures.
   *
   * Ten is the threshold because that is where the two families actually
   * separate: a percentage or a score runs to 100 and a sum of exposures on a
   * 0–1 scale reaches about six here. `digits` still overrides both.
   */
  const places = digits ?? (max > 10 ? 0 : 2);
  return (
    <span className="prt-bar">
      <span className="prt-bar__track" aria-hidden="true">
        <span className="prt-bar__fill" style={{ width: `${share}%` }} />
      </span>
      <span className="prt-bar__value">
        {value.toFixed(places)}
        {scale ? <span className="govuk-visually-hidden"> — {scale}</span> : null}
      </span>
    </span>
  );
}

/**
 * WHAT THE SHADES MEAN, said once under a chart that uses them.
 *
 * The mechanism bars stack four bands inside each bar and printed no key at
 * all, so a reader could see that one bar was darker than another and had no
 * way to learn that dark meant severe. A colour ramp with no legend is a
 * decoration.
 *
 * Counts are the `StackedBar`'s job, not this one: there the segments ARE the
 * quantity being read, and here each bar has its own division.
 */
export function BandKey({ label }: { label?: string }) {
  const bands: [string, string][] = [
    ['severe', 'Severe'], ['significant', 'Significant'],
    ['moderate', 'Moderate'], ['limited', 'Limited'],
  ];
  return (
    <p className="prt-bandkey">
      {label ? <span className="prt-bandkey__label">{label}</span> : null}
      {bands.map(([tone, word]) => (
        <span key={tone} className="prt-bandkey__item">
          <span className={`prt-stack__swatch prt-band--${tone}`} aria-hidden="true" />
          {word}
        </span>
      ))}
    </p>
  );
}
