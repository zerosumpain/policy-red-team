import type { ReactNode } from 'react';
import type { Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { factorReading, factorRows } from '$lib/factor-view';
import { Bar } from './Metrics';

/**
 * WHAT MAKES THEM WORK — the four judgements behind every exposure score.
 *
 * `factorProfile()` has been in the view layer since it was copied, with a
 * fourteen-line comment saying the verdict should show it beside the headline
 * "because they say WHY the policy is exposed, which no single count does".
 * It had exactly one caller and that caller was its own test. Four separate
 * reviews of this report found it independently, which is about as strong a
 * signal as a missing figure gets.
 *
 * What it says on this run is a sentence the four counts cannot say: ease
 * 0.71, concealment 0.69, incentive 0.64, impact 0.51 — an easy, quiet,
 * well-motivated playbook with middling blast radius. A paper whose plays were
 * devastating and difficult would print the identical "47 ways to beat it".
 *
 * A FIXED 0–1 TRACK, NOT A NORMALISED ONE. `bars()` in relationships.ts scales
 * to the largest value it is given, which would draw ease at 100% of the track
 * and assert that it is maximal when it is 0.715 of a bounded scale. `Bar`
 * takes `max` and this passes 1, so the empty part of each track is the part
 * of the judgement the paper did not earn.
 *
 * INK, NEVER THE BAND RAMP. Four different quantities are not four
 * severities, and `Bar`'s own comment already refuses a ramp for the same
 * reason one section down.
 *
 * NO CONTROL. `ThreatsLead` owns re-weighting — four sliders and
 * `weightedExposure` — and a second ranking control two moves away would
 * disagree with it at every step. This is a reading, not an instrument.
 *
 * NOT WRAPPED IN `Figure`. The toggle exists because an SVG answers "what
 * exactly is that one" badly; these four rows are HTML that already print
 * their own numbers as text, so the table twin would be the same four numbers
 * in a second place.
 */
export function FactorProfile({ list, linkTo }: {
  list: Play[];
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  if (!list.length) return null;

  /*
   * IN `FACTOR_KEYS` ORDER, NOT SORTED BY MEAN.
   *
   * Sorting would put the reading in the sequence, which is tempting and wrong
   * here: the same four words appear as four sliders in Move 3 and as four
   * rows on every play's drill, always in this order, and a reader who has met
   * them there should not have to re-find them. The comparison is carried by
   * the shared fixed track instead — on one axis the short bar is the short
   * bar wherever it sits — and the caption names the top and the bottom in
   * words.
   */
  const rows = factorRows(list);

  return (
    <figure className="prt-factors">
      <ol className="prt-factors__list">
        {rows.map((factor) => (
          <li key={factor.key} className="prt-factor">
            <p className="prt-factor__head">
              <span className="prt-factor__name">{factor.label}</span>
              {/*
                `scale` rather than a bare number, because a screen-reader user
                hears "0.71" with nothing around it otherwise, and three other
                tables on this page draw bars against three other maxima.
              */}
              <Bar value={factor.mean} max={1} scale={`average across the ${list.length} ways to beat it, 0 to 1`} />
            </p>
            <p className="prt-factor__gloss prt-meta">{factor.gloss}</p>
            {/*
              THE WORST PLAY ON THIS FACTOR IS ALREADY COMPUTED and was being
              thrown away: `factorProfile()` returns it as `top`. A mean with
              no exemplar is a statistic; a mean with the play that tops it is
              an argument a reader can go and check.

              AND THE TIE IS SAID, because on this run three of the four
              factors have one — see `factor-view.ts`. Printing a single
              "worst" where two plays score identically would name one of them
              on the strength of where `sort` happened to leave it.
            */}
            {factor.top ? (
              <p className="prt-factor__top prt-meta">
                Worst on this, at {factor.peak.toFixed(2)}:{' '}
                {linkTo ? linkTo(factor.top.artefact) : factor.top.artefact.label}
                {factor.sharing
                  ? ` — and ${factor.sharing === 1 ? 'one other scores' : `${factor.sharing} others score`} exactly the same.`
                  : '.'}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {/*
        THE METHOD SENTENCE LIVES HERE NOW, ONCE. It used to stand in the
        Verdict lead where the answer should have been — "Exposure is the
        geometric mean of incentive, ease, impact and concealment" — which is
        arithmetic rather than a finding, and a reader passed it four times in
        one session. On the figure that actually draws the four ingredients it
        is a caption; anywhere else it was a substitute.
      */}
      <figcaption className="prt-caption">{factorReading(rows, list.length)}</figcaption>
    </figure>
  );
}
