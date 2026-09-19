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
        <div key={metric.label} className={`prt-metric prt-metric--${metric.tone ?? 'neutral'}`}>
          <dd className="prt-metric__value">{metric.value}</dd>
          <dt className="prt-metric__label">{metric.label}</dt>
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
            <span className="prt-meta">
              {segment.count} of {sum} · {Math.round((segment.count / sum) * 100)}%
            </span>
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
export function Bar({ value, max = 1 }: { value: number; max?: number }) {
  const share = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <span className="prt-bar">
      <span className="prt-bar__track" aria-hidden="true">
        <span className="prt-bar__fill" style={{ width: `${share}%` }} />
      </span>
      <span className="prt-bar__value">{value.toFixed(2)}</span>
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
