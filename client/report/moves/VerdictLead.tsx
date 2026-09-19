import { useState } from 'react';
import { BAND_LABEL, type Band, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Button } from '../../govuk';
import { narrowExcept, type Selection } from '../selection';

/**
 * WHERE THE EXPOSURE SITS, and the three plays to read first.
 *
 * The band profile is a magnitude, so it is one hue stepped light to dark — and
 * because the two light steps sit below 3:1 against the page, no reading here
 * depends on colour: every band is written in words beside its mark, and the
 * count is printed on the bar.
 *
 * THREE, THEN ALL OF THEM. Forty-seven plays is a wall, and a reader who meets
 * a wall reads none of it. Three is a start that can be finished, and the
 * control says how many it is hiding rather than saying "more".
 */
export function VerdictLead({ list, bands, selection, onSelect, mechanismIds, linkTo }: {
  list: Play[];
  bands: { band: Band; note: string; count: number }[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Passed in, never rebuilt: a `new Set()` here made every mechanism selection a no-op. */
  mechanismIds: Set<string>;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  /*
   * RESET WHEN THE SELECTION CHANGES. Expand to all 47, select "severe", and
   * the control disappears once the list is short — leaving `all` true, so
   * clearing the selection dropped the reader straight back into the 47-item
   * wall the "three, then all" rule exists to prevent.
   */
  const [lastSelection, setLastSelection] = useState(selection);
  if (lastSelection !== selection) {
    setLastSelection(selection);
    setAll(false);
  }
  if (!list.length) return null;

  // The profile always shows the WHOLE run: it is how a reader picks a band, so
  // filtering it by the band they picked would leave them nothing to change to.
  const total = list.length;
  /*
   * NARROWED BY EVERY SELECTION, not just a band.
   *
   * This read `selection?.kind === 'band' ? shown : list`, so choosing a body
   * left the global top three on screen under a heading asserting they were
   * that body's. The heading and the button both said "under this selection"
   * while the list ignored it.
   */
  const ranked = narrowExcept(list, selection, mechanismIds, 'band' as never);
  const visible = all ? ranked : ranked.slice(0, 3);

  return (
    <section aria-labelledby="exposure-profile">
      <h2 className="govuk-heading-l" id="exposure-profile">Where the exposure sits</h2>
      <p className="govuk-body">
        Exposure is the geometric mean of incentive, ease, impact and concealment, so it is a
        magnitude rather than a score. Select a band to carry it into the other three moves.
      </p>

      <ul className="prt-profile" aria-label="Plays by exposure band">
        {bands.map((entry) => {
          const selected = selection?.kind === 'band' && selection.id === entry.band;
          return (
            <li key={entry.band}>
              <button
                type="button"
                className={`prt-profile__band prt-profile__band--${entry.band}`}
                style={{ flexGrow: Math.max(entry.count, 1) }}
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : { kind: 'band', id: entry.band })}
              >
                {/* The word, the count and the share — never the colour alone. */}
                <span className="prt-profile__label">{BAND_LABEL[entry.band]}</span>
                <span className="prt-profile__count">
                  {entry.count} of {total}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="govuk-heading-m" id="read-first">
        {selection ? 'Read these first, under this selection' : 'Read these three first'}
      </h3>
      {visible.length ? (
        <ol className="govuk-list govuk-list--spaced" aria-labelledby="read-first">
          {visible.map((play) => (
            <li key={play.artefact.id}>
              <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
              {linkTo ? linkTo(play.artefact) : play.artefact.label}
              {play.actor ? <span className="prt-meta"> — {play.actor.label}</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="govuk-body">Nothing under this selection.</p>
      )}

      {ranked.length > 3 ? (
        <Button variant="secondary" onClick={() => setAll(!all)}>
          {all ? 'Show three' : `Show all ${ranked.length}${selection ? ' under this selection' : ''}`}
        </Button>
      ) : null}
    </section>
  );
}
