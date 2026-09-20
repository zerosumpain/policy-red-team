import { useEffect, useMemo, useState } from 'react';
import { type Play } from '$lib/policy-analysis/view';
import { EXPOSURE_FACTORS } from '$lib/policy-analysis/exposure';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Button, Checkboxes, Details } from '../../govuk';
import { filterPlays, isEmptyUnder, type Selection } from '../selection';
import { EQUAL, isEqual, ordinal, rankMovement, weightedExposure, type Weights } from '../weighting';
import { PlayList } from '../PlayList';
import { NoneUnder } from './NoneUnder';

/**
 * How many ranked plays this move shows before asking.
 *
 * Ten rather than the Verdict lead's three: there, the list is a sample inside a
 * summary; here it is the section, and a reader has come to Threats to read it.
 */
const SHOWN = 10;

/**
 * How long the status sentence waits behind the sliders.
 *
 * React's `onChange` on `<input type="range">` maps to the `input` event and
 * fires on every step of a drag, so writing the movement figures straight into
 * the `role="status"` region announces four times for one drag from ×1 to ×3.
 * The LIST keeps updating live — that is the whole point of the control — and
 * only the sentence waits, because a live region is a queue and a queue of four
 * near-identical sentences is worse than silence.
 */
const SETTLE_MS = 400;

/**
 * RANK BY WHAT YOU CARE ABOUT.
 *
 * The assessment weighs incentive, ease, impact and concealment equally. A
 * reader may not: somebody deciding where to spend enforcement effort cares
 * about ease, somebody writing a monitoring plan cares about concealment.
 *
 * THIS CHANGES THE READING ORDER AND NOTHING ELSE, and the control says so in
 * its own words. The assessment's own exposure stays printed on every play, so
 * a re-ranked list can always be checked against what the run recorded — which
 * is the guard against the obvious abuse, re-weighting until the answer you
 * came for reaches the top. `weighting.ts` holds the arithmetic and a test
 * proving it reproduces `exposureOf` exactly at equal weights.
 *
 * THE CONTROL IS BEHIND A DISCLOSURE AND THE LIST IS NOT. The panel's contents
 * read "1. Rank by what you care about, 2. Ways to beat it", so a reader who
 * followed link 2 to find the ways to beat the policy landed on a paragraph
 * about geometric means and a scatter, while all forty-seven plays sat in
 * section 1 under a heading about sorting preferences. The heading is now the
 * question the move asks and the sliders are an option inside it.
 */

export function ThreatsLead({ list, selection, mechanismIds, linkTo, onClear, written, onProvenance }: {
  list: Play[];
  selection: Selection;
  /**
   * Passed in, never rebuilt here.
   *
   * This was `mechanismIdsOf([])` — an empty set — so `filterPlays` resolved
   * every mechanism selection to null and returned NOTHING. Carrying a
   * mechanism from Causality into this list is the stated reason the spine
   * exists, and it silently showed "0 plays" instead.
   */
  mechanismIds: Set<string>;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
  /**
   * Clears the carried selection. Optional for the same reason `linkTo` is: a
   * report can be rendered with no way to change what is selected, and then the
   * empty state is a sentence rather than a sentence and a dead button.
   */
  onClear?: () => void;
  /**
   * How many plays the run WROTE, against the number it kept.
   *
   * "47 plays" with no denominator is the overclaim `ProvenanceLead`'s own
   * doc-comment warns about: the run wrote 73 and refused 26 of them for resting
   * on something other than an assumption. Passed in because the figure lives in
   * the stage warnings, which this component has no business parsing, and
   * omitted rather than guessed when a caller has not got it.
   */
  written?: number;
  /** Opens the move that holds that denominator. Absent in the pack, which has no moves. */
  onProvenance?: () => void;
}) {
  const [weights, setWeights] = useState<Weights>(EQUAL);
  const [all, setAll] = useState(false);
  const [counters, setCounters] = useState(false);
  /*
   * RESET WHEN THE SELECTION CHANGES — the same rule, and for the same reason, as
   * VerdictLead: expand to all 47, pick a mechanism, and clearing it would drop
   * the reader back into the wall the cap exists to prevent.
   */
  const [lastSelection, setLastSelection] = useState(selection);
  if (lastSelection !== selection) {
    setLastSelection(selection);
    setAll(false);
  }
  const isDefault = isEqual(weights);
  /*
   * `filterPlays`, NOT `narrowExcept`.
   *
   * This read `narrowExcept(list, selection, mechanismIds, 'band' as never)`,
   * copied from VerdictLead, where the same call was equally wrong. `narrowExcept`
   * returns the list UNFILTERED when the selection's kind is the one named, so
   * naming `'band'` cancelled every band filter: at `?sel=band:limited`, where
   * there are two limited plays, this list rendered all 47 under a status line
   * reading "47 plays" and a banner reading "Showing limited exposure only". The
   * comment on the line above already said what it should do — the ranked list
   * sets no selection of its own, so it narrows by all three.
   */
  const shown = filterPlays(list, selection, mechanismIds);
  const empty = isEmptyUnder(list, selection, mechanismIds);

  /*
   * KEYED ON THE IDS, not on the array. `filterPlays` returns a fresh array
   * whenever a selection is active, so a dependency on `shown` changed identity
   * every render and the sort re-ran every time — the memo worked only in the
   * one case where the sort was already skipped.
   */
  const key = shown.map((p) => p.artefact.id).join(',');
  const ranked = useMemo(
    () => (isDefault ? shown : [...shown].sort((a, b) => weightedExposure(b, weights) - weightedExposure(a, weights))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `shown`
    [key, weights, isDefault],
  );

  /*
   * THE SENTENCE SETTLES; THE LIST DOES NOT. `settled` trails `weights` by
   * SETTLE_MS, and only the `role="status"` line reads it — see SETTLE_MS for
   * the announcement the live region would otherwise make four times a drag.
   */
  const [settled, setSettled] = useState<Weights>(EQUAL);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(weights), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [weights]);
  const announced = useMemo(
    () => (isEqual(settled) ? shown : [...shown].sort((a, b) => weightedExposure(b, settled) - weightedExposure(a, settled))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `shown`
    [key, settled],
  );
  const settledMove = useMemo(() => rankMovement(shown, announced), [shown, announced]);
  const liveMove = useMemo(() => rankMovement(shown, ranked), [shown, ranked]);

  if (!list.length) return null;

  /*
   * THE SPREAD THE TEN ROWS HIDE. The ten a reader first meets run 0.7693 down
   * to 0.7377 — the top four per cent of a range that ends at 0.0495 — so the
   * printed column reads as a run of similar decimals and is a fifteen-fold
   * difference. Read off the whole run, not off `shown`, because it is a
   * statement about the assessment rather than about the current filter.
   */
  const worst = Math.max(...list.map((play) => play.exposure));
  const mildest = Math.min(...list.map((play) => play.exposure));
  /*
   * THE VALUE THE LIST IS ORDERED BY, whichever order it is in — so a tie is a
   * tie in the arithmetic that produced the order on screen, not in an unrelated
   * one. Under a re-rank the assessment's own exposure no longer decides the
   * sequence, and marking ties by it would draw an `=` between two rows that are
   * where they are for a different reason.
   */
  const orderValue = isDefault
    ? (play: Play) => play.exposure
    : (play: Play) => weightedExposure(play, weights);
  const visible = all ? ranked : ranked.slice(0, SHOWN);
  const ties = visible.filter(
    (play, i) => i > 0 && orderValue(play).toFixed(4) === orderValue(visible[i - 1]).toFixed(4),
  );

  return (
    <section aria-labelledby="weights">
      <h2 className="govuk-heading-l" id="weights">Ways to beat it</h2>
      <p className="govuk-body">
        {list.length} of them, worst first. The assessment&rsquo;s own exposure is printed on every
        one, and the order can be changed without changing it.
      </p>

      <Details summary="Rank by what you care about">
        <p className="govuk-body">
          This changes the order you read in. It does not change the assessment, and the
          assessment&rsquo;s own exposure stays on every play.
        </p>

        <div className="prt-weights">
          {EXPOSURE_FACTORS.map(([factor, description]) => {
            const weight = weights[factor] ?? 1;
            return (
              <div key={factor} className="govuk-form-group">
                <label className="govuk-label" htmlFor={`weight-${factor}`}>
                  {factor.charAt(0).toUpperCase() + factor.slice(1)}
                </label>
                <div className="govuk-hint">{description}</div>
                {/*
                  THE SCALE IS DRAWN UNDER THE TRACK, NOT INFERRED FROM IT.
                  Four identical 28px black bars with the thumb a third of the way
                  along, and nothing on screen saying the range is 0 to 3 or where
                  1 — the assessment's own weighting — sits: at a glance ×0.5 and
                  ×2.5 were indistinguishable, and a reader who dragged had to
                  overshoot until the words came back or press Reset and lose all
                  four.

                  THE NEUTRAL MARK IS NOT A CONTROL. An element positioned over a
                  range input's track intercepts the pointer in exactly the region
                  a reader drags through most, so the mark is decoration and the
                  escape is the link beside the output.
                */}
                <div className="prt-range__scale">
                  <input
                    className="prt-range"
                    id={`weight-${factor}`}
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={weight}
                    // The raw value is "1" and "3", which tells a screen-reader
                    // reader nothing about what either means here.
                    aria-valuetext={weight === 1 ? 'as the assessment weighs it' : `times ${weight}`}
                    onChange={(e) => setWeights({ ...weights, [factor]: Number(e.currentTarget.value) })}
                  />
                  <span className="prt-range__ticks" aria-hidden="true">
                    <span>0 — ignore it</span>
                    <span>1 — as the assessment</span>
                    <span>3 — triple it</span>
                  </span>
                </div>
                <p className="prt-range__read">
                  <output htmlFor={`weight-${factor}`}>
                    {/* The multiplier is always printed, so the number and the
                        sentence are never separated. */}
                    ×{weight}
                    {weight === 1 ? ' · as the assessment weighs it' : ''}
                  </output>
                  {weight === 1 ? null : (
                    <button
                      type="button"
                      className="prt-linkbutton"
                      onClick={() => setWeights({ ...weights, [factor]: 1 })}
                    >
                      reset to 1
                      <span className="govuk-visually-hidden">
                        {' '}for {factor}
                      </span>
                    </button>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        <Button variant="secondary" disabled={isDefault} onClick={() => setWeights(EQUAL)}>
          Reset to the assessment&rsquo;s ranking
        </Button>
      </Details>

      <h3 className="govuk-heading-m govuk-!-margin-top-6" id="ranked">
        {isDefault ? 'In the assessment’s own order' : 'In your order'}
      </h3>
      {/*
        THE SENTENCE NAMES THE CONSEQUENCE, so it changes on every move.
        It used to read "47 plays, re-ranked." and then never change again: the
        first slider swapped one invariant sentence for another, and every
        subsequent drag re-sorted ten cards in silence.
      */}
      <p className="govuk-body-s prt-meta">
        {ranked.length} plays
        {typeof written === 'number' && written > list.length ? (
          <>
            {', out of '}
            {onProvenance ? (
              <button type="button" className="prt-linkbutton" onClick={onProvenance}>
                {written} the run wrote
              </button>
            ) : `${written} the run wrote`}
          </>
        ) : null}
        {isDefault ? ', ranked by the assessment’s exposure.' : ', re-ranked by your weighting.'}
      </p>
      {/*
        AN EMPTY LIVE REGION THAT IS ALWAYS IN THE DOCUMENT, and a link that is
        not inside it. A `role="status"` created at the moment it gets its first
        content is a region most screen readers never announce, and a control
        inside one is a control that moves under the reader.
      */}
      <p className="govuk-body-s prt-meta" role="status">
        {isEqual(settled)
          ? ''
          : `${settledMove.moved} of ${announced.length} plays moved. “${announced[0]?.artefact.label ?? ''}” is now first${
            settledMove.leaderWas ? ` (was ${ordinal(settledMove.leaderWas)})` : ''
          }. The biggest move is ${settledMove.furthest} places.`}
      </p>

      {/*
        THE PRINTED COPY RECORDS WHAT PRODUCED IT. Measured in print emulation
        with Ease at ×3: the sliders are hidden, the banner is hidden, and ten
        `.prt-play__yours` figures print with nothing on the page saying what
        weighting made them. Print is the one reading where the reader cannot
        scroll up to check.
      */}
      {isDefault ? null : (
        <p className="prt-weights__printed">
          Re-ranked: {EXPOSURE_FACTORS.map(([factor]) => `${factor} ×${weights[factor] ?? 1}`).join(', ')}.
          The assessment&rsquo;s own exposure is printed on every play.
        </p>
      )}

      {/*
        A TIE IS SAID IN WORDS, because the numbers cannot say it. Ranks 7 and 8
        in the assessment's own order are both 0.7388 in the stored data, so the
        order between them is whatever `sort` left; printed to two decimals four
        rows read 0.75 and four read 0.74, which makes every one of them look
        like a tie and the real one look like nothing.
      */}
      {ties.length ? (
        <p className="govuk-body-s prt-meta">
          {ties.length === 1
            ? 'Two plays score the same to four decimal places; they share a rank, and the order between them is arbitrary.'
            : `${ties.length} pairs of plays score the same to four decimal places; each pair shares a rank, and the order inside it is arbitrary.`}
        </p>
      ) : null}

      {empty ? <NoneUnder selection={selection} onClear={onClear} /> : null}

      {/*
        ONE CONTROL FOR FORTY-SEVEN DISCLOSURES. Every play carries a
        counter-measure, an early warning and a cost to the policy — 47 of 47 on
        this run — and the report rendered none of them anywhere outside the
        drill, which the offline pack does not have. Each card now carries its
        own disclosure, so the answer is one press away from the threat; this
        opens all of them at once for a reader working through the list, and for
        anyone about to print.
      */}
      {ranked.length ? (
        <div className="prt-counters-toggle">
        <Checkboxes
          id="show-counters"
          // The fieldset needs a legend and the page does not need a heading for
          // one checkbox: the control's own label already says what it does.
          legend={<span className="govuk-visually-hidden">What each play would take to close</span>}
          legendSize="s"
          small
          values={counters ? ['on'] : []}
          onChange={(values) => setCounters(values.includes('on'))}
          items={[{ value: 'on', text: 'Open what would close each play' }]}
        />
        </div>
      ) : null}

      {/*
        CAPPED, THE WAY THE VERDICT LEAD CAPS THE SAME LIST.
        Uncapped, the forty-seven cards ran from 690px to 4,071px inside this
        panel and pushed the exposure scatter four and a half screens below the
        fold, with the stress test five and a half — so the move whose subject is
        this list buried its own overview under it. VerdictLead.tsx:20-22 already
        argues the rule ("a reader who meets a wall reads none of it"); ten rather
        than three because here the list IS the section.
      */}
      <PlayList
        plays={visible}
        linkTo={linkTo}
        rank
        counters
        countersOpen={counters}
        exposureMax={worst}
        rankValue={orderValue}
        trailing={isDefault ? undefined : (play) => {
          const places = liveMove.places.get(play.artefact.id) ?? 0;
          return (
            <>
              <span className="prt-play__yours">
                <span className="govuk-visually-hidden">Your ranking </span>
                {weightedExposure(play, weights).toFixed(2)}
              </span>
              {/*
                GLYPH AND TEXT, NEVER COLOUR. A movement indicator that is only a
                red or green arrow is a movement indicator a third of readers
                cannot read, and this one also has to survive a greyscale print.
              */}
              <span className={`prt-move prt-move--${places > 0 ? 'up' : places < 0 ? 'down' : 'same'}`}>
                <span aria-hidden="true">{places > 0 ? `▲ ${places}` : places < 0 ? `▼ ${-places}` : '—'}</span>
                <span className="govuk-visually-hidden">
                  {places > 0 ? `up ${places} places` : places < 0 ? `down ${-places} places` : 'unmoved'}
                </span>
              </span>
            </>
          );
        }}
      />
      {ranked.length > SHOWN ? (
        <Button variant="secondary" onClick={() => setAll(!all)}>
          {all ? `Show the worst ${SHOWN}` : `Show all ${ranked.length}`}
        </Button>
      ) : null}

      {/*
        THE PROPORTION, ONCE, UNDER THE LIST. Without it the ten rows are the
        whole scale a reader is given, and they are the top four per cent of it.
      */}
      <p className="govuk-body-s prt-meta">
        The worst play scores {worst.toFixed(2)}; the mildest of the {list.length} scores {mildest.toFixed(2)}.
      </p>
    </section>
  );
}
