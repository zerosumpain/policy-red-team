import { useMemo } from 'react';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { filterPlays, mechanismIdsOf, mechanismOf, type Selection } from '../selection';

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
 */
export function CausalityLead({ artefacts, list, selection, onSelect, linkTo }: {
  artefacts: Artefact[];
  list: Play[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
}) {
  const mechanismIds = useMemo(() => mechanismIdsOf(artefacts), [artefacts]);

  const rows = useMemo(() => {
    const byMechanism = new Map<string, Play[]>();
    for (const play of list) {
      const id = mechanismOf(play, mechanismIds);
      if (!id) continue;
      byMechanism.set(id, [...(byMechanism.get(id) ?? []), play]);
    }
    const mechanisms = new Map(artefacts.filter((a) => a.kind === 'mechanism').map((a) => [a.id, a]));
    return [...byMechanism.entries()]
      .map(([id, plays]) => ({ mechanism: mechanisms.get(id)!, plays }))
      .filter((row) => row.mechanism)
      .sort((a, b) => b.plays.length - a.plays.length);
  }, [artefacts, list, mechanismIds]);

  if (!rows.length) return null;
  const widest = rows[0].plays.length;

  return (
    <section aria-labelledby="mechanisms">
      <h2 className="govuk-heading-l" id="mechanisms">The mechanisms that generate the most plays</h2>
      <p className="govuk-body">
        One mechanism can generate several plays, which is why closing a mechanism is worth more
        than answering a play. Select one to carry it into the other three moves.
      </p>

      <ul className="prt-nodebars" aria-label="Mechanisms by the number of plays they generate">
        {rows.map(({ mechanism, plays: generated }) => {
          const selected = selection?.kind === 'mechanism' && selection.id === mechanism.id;
          const counts = (['severe', 'significant', 'moderate', 'limited'] as const)
            .map((band) => ({ band, n: generated.filter((p) => p.band === band).length }))
            .filter((entry) => entry.n);
          return (
            <li key={mechanism.id} className="prt-nodebar">
              <button
                type="button"
                className="prt-nodebar__name"
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : { kind: 'mechanism', id: mechanism.id, label: mechanism.label })}
              >
                {mechanism.label}
              </button>
              <span
                className="prt-nodebar__bar"
                style={{ width: `${(generated.length / widest) * 100}%` }}
                aria-hidden="true"
              >
                {counts.map((entry) => (
                  <span
                    key={entry.band}
                    className={`prt-nodebar__seg prt-band--${entry.band}`}
                    style={{ flexGrow: entry.n }}
                  />
                ))}
              </span>
              <span className="prt-nodebar__n">
                {generated.length} {generated.length === 1 ? 'play' : 'plays'}
                <span className="govuk-visually-hidden">
                  {': '}
                  {counts.map((entry) => `${entry.n} ${BAND_LABEL[entry.band].toLowerCase()}`).join(', ')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {selection?.kind === 'mechanism' ? (
        <>
          <h3 className="govuk-heading-m" id="follows">What follows from it</h3>
          <ol className="govuk-list govuk-list--spaced" aria-labelledby="follows">
            {filterPlays(list, selection, mechanismIds).map((play) => (
              <li key={play.artefact.id}>
                <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
                {linkTo ? linkTo(play.artefact) : play.artefact.label}
                {play.actor ? <span className="prt-meta"> — {play.actor.label}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
