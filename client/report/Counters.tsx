import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';
import { BandKey } from './Metrics';
import type { Selection } from './selection';

/** How many mechanisms are listed before the rest go behind a disclosure. */
const SHOWN = 12;

/**
 * Every mechanism a play aims at, from the play's own `targets`.
 *
 * NOT `mechanismOf`, which returns the FIRST mechanism in a play's `refs`. That
 * is the right join for "which mechanism does this play hang off" and the wrong
 * one for coverage: measured on the Post-16 run it yields 22 groups and drops
 * the five plays that cite no mechanism in `refs` at all, whereas `targets`
 * intersected with the mechanism inventory yields 55 groups, 35 of them holding
 * more than one play, and leaves exactly one play unattached.
 *
 * A PLAY IN TWO GROUPS IS IN BOTH, which is correct — it aims at both — and is
 * why the caption says so. Summed, the 47 plays make 142 rows.
 */
export function countersByMechanism(list: Play[], mechanismIds: Set<string>): Map<string, Play[]> {
  const grouped = new Map<string, Play[]>();
  for (const play of list) {
    const targets = play.artefact.data.targets;
    if (!Array.isArray(targets)) continue;
    for (const id of new Set(targets.filter((t): t is string => typeof t === 'string' && mechanismIds.has(t)))) {
      grouped.set(id, [...(grouped.get(id) ?? []), play]);
    }
  }
  return grouped;
}

/**
 * WHAT WOULD CLOSE THEM, GROUPED BY THE THING THAT GENERATES THEM.
 *
 * All 47 plays carry a written counter-measure — 47 distinct strings, averaging
 * 263 characters — and the report rendered none of them anywhere: `counter` is
 * read at exactly one place in the client, `PlayFlow`, which only the drill page
 * mounts. So the move called "what could be done to it" scored forty-seven
 * threats and offered no answer to any of them, and the offline pack, which has
 * no drill to walk to, carried none at all.
 *
 * GROUPED BY MECHANISM, NOT LISTED BY PLAY, because that is the difference this
 * section makes over the ranked list directly above it. One mechanism generates
 * up to eight plays here, so closing a mechanism answers eight counter-measures
 * at once — which is the whole argument the Causality move makes, arriving in
 * Threats with the actual answers attached.
 *
 * ONE DISCLOSURE PER MECHANISM, NOT PER PLAY. Shut, the section is a twelve-row
 * index of the machinery a reader can scan; open, a row is the plays it
 * generates and the wording that would close each of them. The print block
 * forces every `details` open, so the paper copy carries both readings.
 */
export function Counters({ list, artefacts, mechanismIds, onSelect, selection, linkTo }: {
  list: Play[];
  artefacts: Artefact[];
  mechanismIds: Set<string>;
  /** Optional: a report can be rendered with no way to change what is selected. */
  onSelect?: (selection: Selection) => void;
  selection?: Selection;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  const rows = useMemo(() => {
    const grouped = countersByMechanism(list, mechanismIds);
    const mechanisms = new Map(artefacts.filter((a) => a.kind === 'mechanism').map((a) => [a.id, a]));
    return [...grouped.entries()]
      .map(([id, plays]) => ({ mechanism: mechanisms.get(id), plays }))
      .filter((row): row is { mechanism: Artefact; plays: Play[] } => Boolean(row.mechanism))
      .sort((a, b) => b.plays.length - a.plays.length || a.mechanism.label.localeCompare(b.mechanism.label));
  }, [list, artefacts, mechanismIds]);

  if (!rows.length) return null;
  const widest = rows[0].plays.length;
  /*
   * COUNTED OVER THE WHOLE LIST, not over the rows. One play on this run aims at
   * no mechanism the run also wrote down, so it is in no group — counting the
   * groups would report 46 of 47 and blame the counter-measures for a gap in the
   * targeting.
   */
  const answered = list.filter(
    (play) => typeof play.artefact.data.counter === 'string' && play.artefact.data.counter,
  ).length;

  const playList = (plays: Play[], withCounters: boolean) => (
    <ol className="govuk-list prt-counter__list">
      {plays.map((play) => (
        <li key={play.artefact.id}>
          <p className="prt-counter__play">
            <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
            {linkTo ? linkTo(play.artefact) : play.artefact.label}
          </p>
          {withCounters && typeof play.artefact.data.counter === 'string' && play.artefact.data.counter ? (
            <p className="govuk-body-s prt-counter__says">
              <span className="prt-counter__label">Closed by</span>
              {play.artefact.data.counter}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );

  const row = (withCounters: boolean) => ({ mechanism, plays }: { mechanism: Artefact; plays: Play[] }) => {
    const selected = selection?.kind === 'mechanism' && selection.id === mechanism.id;
    const counts = (['severe', 'significant', 'moderate', 'limited'] as const)
      .map((band) => ({ band, n: plays.filter((p) => p.band === band).length }))
      .filter((entry) => entry.n);
    return (
      <li key={mechanism.id} className="prt-counter">
        <div className="prt-nodebar prt-counter__head">
          {onSelect ? (
            <button
              type="button"
              className="prt-nodebar__name"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : { kind: 'mechanism', id: mechanism.id, label: mechanism.label })}
            >
              {mechanism.label}
            </button>
          ) : (
            <span className="prt-nodebar__name prt-counter__name">{mechanism.label}</span>
          )}
          <span
            className="prt-nodebar__bar"
            style={{ width: `${(plays.length / widest) * 100}%` }}
            aria-hidden="true"
          >
            {counts.map((entry) => (
              <span key={entry.band} className={`prt-nodebar__seg prt-band--${entry.band}`} style={{ flexGrow: entry.n }} />
            ))}
          </span>
          <span className="prt-nodebar__n">
            {plays.length} {plays.length === 1 ? 'play' : 'plays'}
            <span className="govuk-visually-hidden">
              {': '}
              {counts.map((entry) => `${entry.n} ${BAND_LABEL[entry.band].toLowerCase()}`).join(', ')}
            </span>
          </span>
        </div>
        {/*
          THE TWELVE BUSIEST CARRY THEIR COUNTERS; THE REST CARRY THEIR PLAYS.
          A play that aims at two mechanisms is rendered under both, which is
          correct for a count and expensive for a counter-measure: the 47 plays
          make 142 rows across the 55 mechanisms, and the print block forces
          every disclosure open, so printing all of them would put about 37,000
          characters of duplicated prose on paper. The twelve busiest hold 68 of
          those rows and are where the argument is; below them a mechanism holds
          one to three plays, whose counter-measures are already on their own
          cards in the ranked list above.
        */}
        {withCounters ? (
          <Details summary={`What would close ${plays.length === 1 ? 'it' : `these ${plays.length}`}`}>
            {playList(plays, true)}
          </Details>
        ) : playList(plays, false)}
      </li>
    );
  };

  return (
    <div className="prt-counters">
      <p className="govuk-body">
        {answered === list.length
          ? `Every one of the ${list.length} plays has a counter-measure recorded.`
          : `${answered} of the ${list.length} plays have a counter-measure recorded.`}
        {' '}
        They are grouped by the machinery they aim at, busiest first, because closing a mechanism
        answers every play that targets it. A play aiming at two mechanisms appears under both.
      </p>
      <BandKey label="Each bar is divided by band:" />

      <ul className="prt-counters__list">{rows.slice(0, SHOWN).map(row(true))}</ul>

      {rows.length > SHOWN ? (
        <Details summary={`The other ${rows.length - SHOWN} mechanisms, and the plays that aim at them`}>
          <ul className="prt-counters__list">{rows.slice(SHOWN).map(row(false))}</ul>
        </Details>
      ) : null}
    </div>
  );
}
