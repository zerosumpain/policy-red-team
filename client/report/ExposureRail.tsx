import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';
import { StackedBar } from './Metrics';
import type { Selection } from './selection';

/**
 * WHERE THE EXPOSURE SITS, ABOVE THE SPINE RATHER THAN INSIDE MOVE 1.
 *
 * MEASURED, NOT ARGUED. Off the rendered page at 1280×800: masthead 0–62, phase
 * banner 62–125, Back 148, the assessment's title 218–292, the tag row 316, the
 * status banner 352–508, the headline 560–645, the standing caveat 660–700, the
 * selection banner 730–770, the tab strip 790–902, the contents heading 947 and
 * its six-item list 980–1200, the "Where the exposure sits" heading 1255, two
 * lines of definition 1300–1350 — and the bar itself at 1372. The one figure
 * that answers the panel's own heading opened two screens below the fold, and
 * the whole first screen of the report was chrome, one sentence and a strip of
 * tabs.
 *
 * AND IT IS TRUE OF ALL FIVE MOVES. The bar is also the only band picker on the
 * page, and a selection made in it holds across every panel — so living inside
 * one of them meant a reader in Threats or Actors had to go back to Move 1 to
 * change the band the banner above their head was describing. Above the strip
 * it sits beside the banner that states what it did.
 *
 * NO LINKS, NO ROUTER, NO FETCH: it takes the counts and a callback, so it
 * renders identically in the service, in print and in the offline pack.
 */
export function ExposureRail({ bands, total, selection, onSelect }: {
  bands: { band: Band; note: string; count: number }[];
  /** The whole run's play count — the denominator every segment is a share of. */
  total: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  if (!bands.length || !total) return null;
  const selected = (band: Band) => selection?.kind === 'band' && selection.id === band;

  return (
    <section className="prt-verdictband" aria-label="Ways to beat it, by how exposed">
      <StackedBar
        label="Ways to beat it, by how exposed the policy is to each. Select a level to narrow every tab."
        total={total}
        segments={bands.map((entry) => ({
          id: entry.band,
          label: BAND_LABEL[entry.band],
          count: entry.count,
          tone: entry.band,
          /*
           * THE NOTE `bandCounts()` HAS ALWAYS RETURNED AND EVERY CALLER DROPPED.
           * `{ band, note, count }` comes out of `view.ts`; the old segment map
           * read `entry.band` and `entry.count` and left `entry.note` on the
           * floor, so the key read "Severe 20 of 47 · 43%" and the reader was
           * taught four colours and four words with no way to learn that severe
           * means "Redesign before publication."
           */
          note: entry.note,
          selected: selected(entry.band),
          onSelect: () => onSelect(selected(entry.band) ? null : { kind: 'band', id: entry.band }),
        }))}
      />
      {/*
        THE SENTENCE THE BAR USED TO CARRY IN MOVE 1, kept with the control it
        belongs to. Without it the strip is four coloured blocks above a tab
        row and nothing says they can be pressed.
      */}
      <p className="govuk-body-s prt-meta prt-verdictband__say">
        {total} ways to beat this policy, by how exposed it is to each. Select a level to narrow every tab.
      </p>
    </section>
  );
}
