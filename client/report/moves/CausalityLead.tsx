import { useCallback, useMemo } from 'react';
import { BAND_LABEL, type Band, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { assumptionsFor, chainsFor, mechanismChart } from '$lib/mechanisms';
import { filterPlays, mechanismsOf, narrowExcept, type Selection } from '../selection';
import { MechanismChain } from '../MechanismChain';
import { useRoving } from '../useRoving';
import { Details, InsetText } from '../../govuk';

/**
 * THE MECHANISMS THAT GENERATE THE MOST PLAYS.
 *
 * A mechanism is the thing the paper creates. One mechanism generates several
 * plays, which is why closing a mechanism is worth more than answering a play —
 * and why this view exists at all: the ranked list in Threats answers "what
 * could be done", and this answers "why is any of it possible".
 *
 * The bar is a count, not an exposure. A mechanism generating six limited plays
 * is a different object from one generating two severe ones, so the bands are
 * stacked inside the bar rather than averaged into a colour, and the counts are
 * printed.
 *
 * THE CHART USED TO BE WRONG IN TWO DIRECTIONS AT ONCE, and the section's own
 * claim is the arithmetic it got wrong. `if (!id) continue` dropped the plays
 * citing no mechanism, so the bars summed to 42 while every other figure in the
 * report said 47; and grouping on a play's FIRST mechanism ref alone gave a bar
 * to 22 mechanisms when 41 are cited. "Regulatory enforcement of speech duties"
 * and "Skills-needs analysis for education planning" rest under three plays
 * each and had no bar and no way to be selected. The grouping now lives in
 * `$lib/mechanisms` with a test, because a bar of the wrong length is the one
 * thing a chart must never do.
 *
 * THE ANSWER SITS ABOVE THE CHART, not below it. Measured live at 1280×900:
 * pressing any bar — the first or the last — left "What follows from it" at
 * viewport top 980 or 910, below the fold, and the page scrolled 13 pixels. The
 * only visible change a sighted reader got was the pressed button's own colour.
 * The result is now the thing nearest the control, and a press brings it back
 * into view only when it has actually left, which is the rule `Tabs.select`
 * already follows.
 */

/**
 * THE BARS ARE GONE; THE TABLE IS EVERY ROW (phase 19, workstream B).
 *
 * R capped the drawing at the ten bars that differed and put the other 31 in
 * a table behind a details, and said a later workstream would replace the
 * drawing with a pattern × mechanism grid. It has: the grid leads Threats, its
 * columns are the twelve parts of the policy most aimed at, and a column
 * number there is the same selection a bar was. What stays here is the table,
 * now of every row, because it is the only place every part of the policy a
 * way to beat it rests on is listed and selectable — and it is ONE tab stop,
 * with arrow keys inside it, for the reason `useRoving` gives.
 */
const BANDS = ['severe', 'significant', 'moderate', 'limited'] as const;

/** "3 severe · 2 significant · 1 limited" — the split, in words, for the row. */
function splitOf(plays: Play[]): { band: Band; n: number }[] {
  return BANDS.map((band) => ({ band, n: plays.filter((p) => p.band === band).length })).filter((e) => e.n);
}

/**
 * Does the paper's own implementation note record an absence?
 *
 * 52 of the 151 mechanisms carry an `implementation` string that says the paper
 * does not describe, specify or state how the thing would be delivered. That is
 * a finding rather than a blank field, so it is set in an inset rather than run
 * on as a second sentence.
 */
const ABSENT = /does not (describe|specify|state)|not described|not specified|omits/i;

export function CausalityLead({ artefacts, list, selection, onSelect, mechanismIds, linkTo }: {
  artefacts: Artefact[];
  list: Play[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Passed in rather than rebuilt, so one definition of "is a mechanism" serves every view. */
  mechanismIds: Set<string>;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
}) {
  /*
   * COUNTED UNDER THE SELECTION, except when a mechanism is the selection — the
   * bars are how a reader changes it, so they keep every mechanism. Before this
   * the rows ignored `selection` entirely, and a mechanism with one severe play
   * and five limited ones still claimed "6 plays" under a banner reading
   * "Showing severe exposure only".
   */
  const counted = useMemo(
    () => narrowExcept(list, selection, mechanismIds, 'mechanism'),
    [list, selection, mechanismIds],
  );

  /*
   * ONE DEFINITION OF THE JOIN, HANDED TO THE ARITHMETIC. `mechanismsOf` is the
   * report's answer to "which mechanisms does this play cite", and the chart and
   * the list under it disagreeing about that was the defect being fixed — so
   * `mechanismChart` is given the function rather than owning a second copy of
   * the ref walk.
   */
  const cites = useCallback((play: Play) => mechanismsOf(play, mechanismIds), [mechanismIds]);
  const { rows, orphans, pairs } = useMemo(() => mechanismChart(counted, cites), [counted, cites]);

  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);
  const assumptions = useMemo(() => assumptionsFor(artefacts, mechanismIds), [artefacts, mechanismIds]);
  const chains = useMemo(() => chainsFor(artefacts, mechanismIds), [artefacts, mechanismIds]);

  /*
   * THE TAIL IS A TABLE, NOT MORE BARS. The bar-length distribution on the real
   * run is {7:1, 5:2, 4:5, 3:6, 2:14, 1:13}: past the first ten the lengths
   * barely differ, so drawing them compares nothing. Every row of the table is
   * still a selection control — nothing is lost from the carried selection.
   */
  const tail = rows;

  const selectedId = selection?.kind === 'mechanism' ? selection.id : null;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  /*
   * `filterPlays`, NOW THAT IT ANSWERS THESE BARS.
   *
   * This used to be a local `list.filter(cites(play).includes(id))`, because
   * `filterPlays` resolved a mechanism selection by `mechanismOf` — the FIRST
   * mechanism a play names — so a bar reading "3 plays" for a mechanism that is
   * no play's first reference would have been answered here by an empty list.
   * The section answered its own bars to avoid contradicting itself, and the
   * rest of the report went on narrowing by the first ref.
   *
   * `filterPlays` is on `mechanismsOf` now, which is the same join `cites` is,
   * so the local copy was a second definition of one rule. One function decides
   * what follows from a mechanism, here and in every view this bar narrows.
   */
  const follows = useMemo(
    () => (selection?.kind === 'mechanism' ? filterPlays(list, selection, mechanismIds) : []),
    [list, selection, mechanismIds],
  );

  const tableRoving = useRoving<HTMLTableSectionElement>(tail.length, tail.findIndex((row) => row.id === selectedId));

  /*
   * NEVER SCROLL A TARGET ALREADY ON SCREEN. Two nested frames because the
   * result block has only just been rendered and the browser clamps the scroll
   * position after the document's height changes — the same guard, for the same
   * reason, as `Tabs.select` and `Report.goTo`.
   */
  const select = (row: { id: string; label: string }, isSelected: boolean) => {
    onSelect(isSelected ? null : { kind: 'mechanism', id: row.id, label: row.label });
    if (isSelected) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById('follows');
      if (!target) return;
      const { top } = target.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight) target.scrollIntoView({ block: 'start' });
    }));
  };

  if (!rows.length && !orphans.length) return null;

  const onMechanism = counted.length - orphans.length;
  const resting = selectedId ? assumptions.get(selectedId)?.size ?? 0 : 0;
  /** The mechanism resting on the most unestablished assumptions, among those drawn. */
  const heaviest = rows.length
    ? rows.reduce((worst, row) => (
      (assumptions.get(row.id)?.size ?? 0) > (assumptions.get(worst.id)?.size ?? 0) ? row : worst
    ))
    : null;

  const nameOf = (id: string) => byId.get(id)?.label ?? id;

  return (
    <section aria-labelledby="mechanisms">
      <h2 className="govuk-heading-l" id="mechanisms">The parts of the policy most ways to beat it rest on</h2>
      <p className="govuk-body">
        One part of the policy can open up several ways to beat it, so fixing that part does more
        than answering any one of them. Select a part to carry it into the other tabs.
      </p>
      {/* THE DENOMINATOR, GENERATED FROM THE ROWS THEMSELVES, so the sentence
          and the chart cannot disagree. Every other capped or partial list in
          this report states what it is out of — "the worst 12 of 99", "the
          other 223" — and the one figure that is the head of a move did not. */}
      <p className="govuk-body">
        {orphans.length
          ? `${onMechanism} of the ${counted.length} ways to beat it here rest on `
          : 'Every way to beat it here rests on '}
        {rows.length} of the {mechanismIds.size} parts of the policy the paper sets up.
        {pairs > onMechanism
          ? ` One can rest on more than one part, so the counts below add up to ${pairs} rather than ${onMechanism}.`
          : ''}
        {' '}Which kinds of way to beat it land on each is the grid at the top of Threats.
      </p>

      {selected ? (
        <div className="prt-mech" id="follows">
          <h3 className="govuk-heading-m">
            {/* THE MOVE'S PRIMARY OBJECT FINALLY HAS A ROUTE TO ITS OWN PAGE.
                `linkTo` was threaded into this component and used only for
                plays, so the mechanism carrying seven of the forty-seven plays
                had a drill page nobody could reach from the figure that is the
                whole point of the move. It goes here, on the one row there is
                exactly one of, rather than as a second control on all 41. */}
            What follows from {linkTo ? linkTo(selected) : selected.label}
          </h3>

          {typeof selected.data?.intervention === 'string' && selected.data.intervention ? (
            <p className="govuk-body"><strong>What it does.</strong> {selected.data.intervention}</p>
          ) : null}
          {typeof selected.data?.implementation === 'string' && selected.data.implementation ? (
            ABSENT.test(selected.data.implementation) ? (
              <InsetText>
                <strong>How it would be delivered.</strong> {selected.data.implementation}
              </InsetText>
            ) : (
              <p className="govuk-body"><strong>How it would be delivered.</strong> {selected.data.implementation}</p>
            )
          ) : null}

          {/* WHICH JOIN PRODUCED THE NUMBER, said on the number. An assumption
              reaches a mechanism either by naming it or through a causal chain
              that names both, and the two routes give very different answers —
              the Sector Based Work Academy Programme has none by the first and
              ten by the second. A reader comparing 30 against 4 has to know
              which. */}
          {resting ? (
            <p className="govuk-body-s prt-meta">
              Rests on {resting} {resting === 1 ? 'assumption' : 'assumptions'} the paper has not
              proven — counted where an assumption names this part of the policy, and where a chain
              of cause and effect names both.
            </p>
          ) : null}

          <h4 className="govuk-heading-s govuk-!-margin-bottom-1" id="follows-plays">
            {follows.length} {follows.length === 1 ? 'way to beat the policy rests' : 'ways to beat the policy rest'} on it
          </h4>
          <ol className="govuk-list govuk-list--spaced" aria-labelledby="follows-plays">
            {follows.map((play) => (
              <li key={play.artefact.id}>
                <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
                {linkTo ? linkTo(play.artefact) : play.artefact.label}
                {play.actor ? <span className="prt-meta"> — {play.actor.label}</span> : null}
              </li>
            ))}
          </ol>

          <MechanismChain
            mechanism={selected}
            chains={chains.get(selected.id) ?? []}
            byId={byId}
            linkTo={linkTo}
          />

          {linkTo ? (
            <p className="govuk-body-s prt-meta">
              {linkTo(selected, 'Open the full record for this part of the policy')} — every link,
              every assumption and every way to beat it that it appears in.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* THE PLAYS NO MECHANISM CLOSES, said rather than dropped. Not a
          control: no kind of selection can express "the complement of every
          mechanism". */}
      {orphans.length ? (
        <>
          <Details summary={`The ${orphans.length} ${orphans.length === 1 ? 'way to beat it that names' : 'ways to beat it that name'} no part of the policy`}>
            <p className="govuk-body-s">
              These name no part of the policy, so no bar can carry them and selecting a part never
              reaches them. They are in the list on the Threats tab.
            </p>
            <ul className="govuk-list govuk-list--spaced govuk-!-margin-bottom-0">
              {orphans.map((play) => (
                <li key={play.artefact.id}>
                  <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
                  {linkTo ? linkTo(play.artefact) : play.artefact.label}
                </li>
              ))}
            </ul>
          </Details>
        </>
      ) : null}

      {tail.length ? (
        <table className="govuk-table prt-mechtail">
          <caption className="govuk-table__caption govuk-table__caption--s">
            All {tail.length} parts of the policy a way to beat it rests on, most first
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">Part of the policy</th>
              <th scope="col" className="govuk-table__header govuk-table__header--numeric">Ways to beat it</th>
              <th scope="col" className="govuk-table__header">How exposed</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body" ref={tableRoving.container} onKeyDown={tableRoving.onKeyDown}>
            {tail.map((row, index) => {
              const isSelected = row.id === selectedId;
              return (
                <tr key={row.id} className="govuk-table__row">
                  <th scope="row" className="govuk-table__header">
                    {/* Still a selection control, as every row of the chart is:
                        a button, pressed when it is the carried selection. */}
                    <button type="button" className="prt-chips__chip" aria-pressed={isSelected}
                            data-roving="" tabIndex={tableRoving.tabIndexFor(index)}
                            onClick={() => select({ id: row.id, label: nameOf(row.id) }, isSelected)}>
                      {nameOf(row.id)}
                    </button>
                  </th>
                  <td className="govuk-table__cell govuk-table__cell--numeric">{row.plays.length}</td>
                  <td className="govuk-table__cell">
                    {splitOf(row.plays).map((entry) => `${entry.n} ${BAND_LABEL[entry.band].toLowerCase()}`).join(' · ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {heaviest && (assumptions.get(heaviest.id)?.size ?? 0) > 0 ? (
        <p className="govuk-body">
          {nameOf(heaviest.id)} opens up {heaviest.plays.length}{' '}
          {heaviest.plays.length === 1 ? 'way' : 'ways'} to beat the policy and rests
          on {assumptions.get(heaviest.id)?.size} unproven assumptions — more than any other part
          counted here. A bar says how many ways in there are; it does not say how much has to hold
          for the thing to work at all.
        </p>
      ) : null}
    </section>
  );
}
