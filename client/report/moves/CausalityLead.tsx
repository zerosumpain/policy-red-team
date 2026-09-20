import { useCallback, useMemo } from 'react';
import { BAND_LABEL, type Band, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { assumptionsFor, chainsFor, mechanismChart } from '$lib/mechanisms';
import { filterPlays, mechanismsOf, narrowExcept, type Selection } from '../selection';
import { BandKey } from '../Metrics';
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
 * Below how many one-play mechanisms the tail is left as bars.
 *
 * Folding thirteen identical minimum-length rows into chips recovers about
 * 570px of chart that carried no comparison — every one of them was the same
 * one-seventh of the track with the same "1 play" beside it. Folding three
 * would be two lists where one would do.
 */
const FOLD_AT = 5;

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
   * THE TAIL IS A ROW OF CHIPS, NOT THIRTEEN MORE BARS. The bar-length
   * distribution on this run is {7:1, 5:2, 4:5, 3:6, 2:14, 1:13}, and the
   * thirteen at the bottom are the same length drawn thirteen times. A chip
   * keeps every one of them selectable — nothing is lost from the carried
   * selection — and the cut is the section's own thesis, "generates more than
   * one play", rather than an arbitrary top-N.
   */
  const many = rows.filter((row) => row.plays.length > 1);
  const ones = rows.filter((row) => row.plays.length === 1);
  const folded = many.length > 0 && ones.length >= FOLD_AT;
  const bars = folded ? many : rows;
  const chips = folded ? ones : [];

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

  const barRoving = useRoving(bars.length, bars.findIndex((row) => row.id === selectedId));
  const chipRoving = useRoving(chips.length, chips.findIndex((row) => row.id === selectedId));

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

  const widest = bars[0]?.plays.length ?? 1;
  const onMechanism = counted.length - orphans.length;
  const resting = selectedId ? assumptions.get(selectedId)?.size ?? 0 : 0;
  /** The mechanism resting on the most unestablished assumptions, among those drawn. */
  const heaviest = rows.length
    ? rows.reduce((worst, row) => (
      (assumptions.get(row.id)?.size ?? 0) > (assumptions.get(worst.id)?.size ?? 0) ? row : worst
    ))
    : null;

  const nameOf = (id: string) => byId.get(id)?.label ?? id;

  const chipButton = (row: { id: string }, index: number, roving: ReturnType<typeof useRoving>) => {
    const isSelected = row.id === selectedId;
    return (
      <button
        type="button"
        data-roving=""
        className="prt-chips__chip"
        aria-pressed={isSelected}
        tabIndex={roving.tabIndexFor(index)}
        onClick={() => select({ id: row.id, label: nameOf(row.id) }, isSelected)}
      >
        {nameOf(row.id)}
      </button>
    );
  };

  return (
    <section aria-labelledby="mechanisms">
      <h2 className="govuk-heading-l" id="mechanisms">The mechanisms that generate the most plays</h2>
      <p className="govuk-body">
        One mechanism can generate several plays, which is why closing a mechanism is worth more
        than answering a play. Select one to carry it into the other three moves.
      </p>
      {/* THE DENOMINATOR, GENERATED FROM THE ROWS THEMSELVES, so the sentence
          and the chart cannot disagree. Every other capped or partial list in
          this report states what it is out of — "the worst 12 of 99", "the
          other 223" — and the one figure that is the head of a move did not. */}
      <p className="govuk-body">
        {orphans.length
          ? `${onMechanism} of the ${counted.length} plays here rest on `
          : 'Every play here rests on '}
        {rows.length} of the {mechanismIds.size} mechanisms the paper names.
        {pairs > onMechanism
          ? ` A play can rest on more than one, so the counts below sum to ${pairs} rather than ${onMechanism}.`
          : ''}
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
              established — counted both where an assumption names this mechanism and where one of
              its causal chains names both.
            </p>
          ) : null}

          <h4 className="govuk-heading-s govuk-!-margin-bottom-1" id="follows-plays">
            {follows.length} {follows.length === 1 ? 'play' : 'plays'} rest on it
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
              {linkTo(selected, 'Open the full record for this mechanism')} — every relationship,
              every assumption and every play it appears in.
            </p>
          ) : null}
        </div>
      ) : null}

      {bars.length ? (
        <ul
          className="prt-nodebars prt-nodebars--mechanisms"
          /* A COMPOSITE CONTROL, WHICH IS WHAT IT ALWAYS WAS. See `useRoving`
             for why this is a toolbar and not a radiogroup, and for the 22
             leading tab stops that made the case. `role="presentation"` on the
             items is the same pairing `Tabs` uses for its tablist, and the
             reason axe stays clean about a list whose children have had their
             semantics taken away. */
          role="toolbar"
          aria-orientation="vertical"
          aria-label="Mechanisms by the number of plays they generate"
          ref={barRoving.container}
          onKeyDown={barRoving.onKeyDown}
        >
          {bars.map((row, index) => {
            const mechanism = byId.get(row.id);
            const label = mechanism?.label ?? row.id;
            const isSelected = row.id === selectedId;
            const split = splitOf(row.plays);
            return (
              <li key={row.id} className="prt-nodebar" role="presentation">
                <button
                  type="button"
                  data-roving=""
                  className="prt-nodebar__name"
                  aria-pressed={isSelected}
                  tabIndex={barRoving.tabIndexFor(index)}
                  onClick={() => select({ id: row.id, label }, isSelected)}
                >
                  {label}
                </button>
                {/* THE BAR IS THE TRACK AND THE FILL IS INSIDE IT. It used to be
                    the fill alone, sized by an inline percentage in a
                    `minmax(0, 1fr)` column, so a one-play stub was a mark
                    floating in about 310px of bare page with no ceiling to read
                    it against — while the exposure bars 800px away have had a
                    track since they were drawn. */}
                <span className="prt-nodebar__bar" aria-hidden="true">
                  <span
                    className="prt-nodebar__fill"
                    style={{ width: `${(row.plays.length / widest) * 100}%` }}
                  >
                    {split.map((entry) => (
                      <span
                        key={entry.band}
                        className={`prt-nodebar__seg prt-band--${entry.band}`}
                        style={{ flexGrow: entry.n }}
                      />
                    ))}
                  </span>
                </span>
                <span className="prt-nodebar__n">
                  <strong>{row.plays.length}</strong> {row.plays.length === 1 ? 'play' : 'plays'}
                  {/* THE SPLIT IS VISIBLE TEXT NOW, not a hidden span. Two bars
                      both reading "2 plays" were 1 severe + 1 moderate and 2
                      significant, and the only thing separating them was two
                      steps of a ramp whose lighter half sits below 3:1 against
                      the page. A screen reader was told; nobody looking at it
                      was. */}
                  <span className="prt-nodebar__split">
                    {split.map((entry) => `${entry.n} ${BAND_LABEL[entry.band].toLowerCase()}`).join(' · ')}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* THE PLAYS NO MECHANISM CLOSES, drawn as the last row of the chart
          rather than dropped out of it. Not a control: `Selection` has three
          kinds and none of them can express "the complement of every
          mechanism", so a fourth would have to be threaded through the URL and
          all five moves for one row. The dashed rule and the black, unlinked
          name are what say it is not one. */}
      {orphans.length ? (
        <>
          <div className="prt-nodebar prt-nodebar--none">
            <span className="prt-nodebar__none">No named mechanism</span>
            <span className="prt-nodebar__bar" aria-hidden="true">
              <span className="prt-nodebar__fill" style={{ width: `${Math.min(orphans.length / widest, 1) * 100}%` }}>
                {splitOf(orphans).map((entry) => (
                  <span
                    key={entry.band}
                    className={`prt-nodebar__seg prt-band--${entry.band}`}
                    style={{ flexGrow: entry.n }}
                  />
                ))}
              </span>
            </span>
            <span className="prt-nodebar__n">
              <strong>{orphans.length}</strong> {orphans.length === 1 ? 'play' : 'plays'}
              <span className="prt-nodebar__split">
                {splitOf(orphans).map((entry) => `${entry.n} ${BAND_LABEL[entry.band].toLowerCase()}`).join(' · ')}
              </span>
            </span>
          </div>
          <Details summary={`The ${orphans.length} ${orphans.length === 1 ? 'play' : 'plays'} no mechanism accounts for`}>
            <p className="govuk-body-s">
              These cite no mechanism at all, so no bar can carry them and no mechanism selection
              reaches them. They are in the playbook on Move 3.
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

      {chips.length ? (
        <>
          <p className="govuk-body-s prt-meta" id="mechanisms-ones">
            {chips.length} more mechanisms generate one play each. Every one is still selectable.
          </p>
          <ul
            className="prt-chips"
            role="toolbar"
            aria-orientation="horizontal"
            aria-labelledby="mechanisms-ones"
            ref={chipRoving.container}
            onKeyDown={chipRoving.onKeyDown}
          >
            {chips.map((row, index) => (
              <li key={row.id} className="prt-chips__item" role="presentation">
                {chipButton(row, index, chipRoving)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* The bars stack four bands and said nowhere what the shades were. A
          ramp with no key is a decoration; the counts are already read out to
          anyone not looking at it, so this is the same fact for anyone who is. */}
      <BandKey label="Each bar is divided by band:" />

      {heaviest && (assumptions.get(heaviest.id)?.size ?? 0) > 0 ? (
        <p className="govuk-body">
          {nameOf(heaviest.id)} generates {heaviest.plays.length}{' '}
          {heaviest.plays.length === 1 ? 'play' : 'plays'} and rests
          on {assumptions.get(heaviest.id)?.size} unestablished assumptions — more than any other
          mechanism on this chart. A bar says how many ways in there are; it does not say how much
          has to hold for the thing to work at all.
        </p>
      ) : null}
    </section>
  );
}
