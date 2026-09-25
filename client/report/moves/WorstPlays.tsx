import { useState } from 'react';
import { type Band, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Button } from '../../govuk';
import { PlayList } from '../PlayList';
import { filterPlays, type Selection } from '../selection';
import { NoneUnder } from './NoneUnder';

/**
 * THE WORST WAYS TO BEAT IT — the three plays a reader should start on.
 *
 * WAS `VerdictLead`, and was the first thing in the Verdict move. Phase 19 put
 * the findings first, because the review of the real assessment found no final
 * finding names a play: the conclusions and the threats were two lists, and
 * the move called Verdict led with the threats. The three stay in Verdict,
 * after the findings, as the sharpest thing the assessment can point to.
 *
 * THE BAR IS NOT HERE ANY MORE. The segmented exposure bar is the one figure
 * that answers "where does the exposure sit", and inside this panel it opened
 * 1,372px down, behind a masthead, a phase banner, a status banner, the
 * headline, the selection banner, the tab strip and a six-item contents list —
 * so the first screen of the report a reader lands on was chrome, one sentence
 * and a strip of tabs. It is `ExposureRail` now, rendered above the tab strip,
 * where it is true of all five moves rather than of this one.
 *
 * THREE, THEN ALL OF THEM. Forty-seven plays is a wall, and a reader who meets
 * a wall reads none of it. Three is a start that can be finished, and the
 * control says how many it is hiding rather than saying "more".
 */
export function WorstPlays({ list, selection, onSelect, mechanismIds, linkTo }: {
  list: Play[];
  /**
   * STILL ACCEPTED, DELIBERATELY UNREAD, after the bar moved to `ExposureRail`.
   *
   * `Report` computes `bandCounts(list)` once and hands the same array to the
   * rail, to this lead and to the plot's section. Dropping it from the type
   * would turn moving the bar out into an edit of the spine as well, and the
   * spine is the file every other change in this wave also wants.
   */
  bands?: { band: Band; note: string; count: number }[];
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

  /*
   * `filterPlays`, NOT `narrowExcept`.
   *
   * This read `narrowExcept(list, selection, mechanismIds, 'band' as never)`.
   * `narrowExcept` returns the list UNFILTERED when the selection's kind is the
   * one it is told this control owns — and this list owns nothing; the band
   * PICKER was the `StackedBar` above it, which has since moved out to the rail.
   * So every band selection was silently cancelled here: at `?sel=band:limited`,
   * where the run holds two limited plays, the heading read "Read these first,
   * under this selection", the button read "Show all 47 under this selection",
   * and the three cards on screen were all severe.
   */
  const ranked = filterPlays(list, selection, mechanismIds);
  const visible = all ? ranked : ranked.slice(0, 3);
  const worst = Math.max(...list.map((play) => play.exposure));

  return (
    <section aria-labelledby="exposure-profile">
      <h2 className="govuk-heading-l" id="exposure-profile">The worst ways to beat it</h2>
      <p className="govuk-body">
        The assessment found {list.length} ways someone could beat this policy. These are the worst.
        All of them are in the Threats tab.
      </p>
      {/*
        THE SECOND HEADING IS GONE WITH THE BAR IT SEPARATED. With the stacked
        bar between them, "Where the exposure sits" and "Read these three first"
        were two sections; without it they were two consecutive headings saying
        the same thing, and the state the h3 carried — whether the three are the
        run's three or this selection's — is a fact about the list rather than a
        title for it.
      */}
      {selection ? (
        <p className="govuk-body-s prt-meta">
          {ranked.length} {ranked.length === 1 ? 'way' : 'ways'} to beat it under this selection.
        </p>
      ) : null}
      {visible.length ? (
        <PlayList plays={visible} linkTo={linkTo} rank exposureMax={worst} rankValue={(play) => play.exposure} />
      ) : (
        <NoneUnder selection={selection} onClear={() => onSelect(null)} />
      )}

      {ranked.length > 3 ? (
        <Button variant="secondary" onClick={() => setAll(!all)}>
          {all ? 'Show three' : `Show all ${ranked.length}${selection ? ' under this selection' : ''}`}
        </Button>
      ) : null}
    </section>
  );
}
