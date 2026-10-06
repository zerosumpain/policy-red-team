import { useEffect } from 'react';
import { Button } from '../../govuk';
import { describeSelection, type Selection } from '../selection';

/**
 * WHAT IS SELECTED, SAID IN WORDS, above every view.
 *
 * A filter that survives a tab change is exactly the kind of thing that breaks
 * silently: nothing throws, the view simply shows a narrower set, and a reader
 * comparing two moves draws a conclusion from a list they did not know was
 * filtered. So the selection is never only a highlighted control inside one
 * view — it is stated here, in a sentence, wherever the reader is, and it is
 * clearable from all of them.
 *
 * IN THE SERVICE IT IS A BAR ALONG THE FOOT OF THE WINDOW (phase 29, `bar`).
 * Inserted above the page, it appeared at the moment of a press and pushed
 * everything under the reader's pointer down by its own height — the pressed
 * square moved away from the finger that pressed it — and on a long page it
 * was either off screen or, sticky, a band over the top of the thing being
 * read. Fixed to the foot from tablet up, it moves nothing when it arrives,
 * is always in view, and carries the count: how many ways to beat it the
 * selection leaves of how many. Below tablet it stays in the flow, where a
 * fixed bar would spend a phone's height (and 400% zoom's) on furniture.
 * The page reserves its height while it is shown (`prt-has-selectionbar`).
 *
 * `role="status"` rather than an alert: changing it is the reader's own doing,
 * so it should be announced without interrupting them.
 */
export function SelectionBanner({ selection, onClear, bar, count }: {
  selection: Selection;
  onClear: () => void;
  bar?: boolean;
  /** Ways to beat it the selection leaves, of all of them. */
  count?: { n: number; total: number };
}) {
  const shown = Boolean(bar && selection);
  useEffect(() => {
    if (!shown) return;
    document.documentElement.classList.add('prt-has-selectionbar');
    return () => document.documentElement.classList.remove('prt-has-selectionbar');
  }, [shown]);

  return (
    <div className={`prt-selection${bar ? ' prt-selection--bar' : ''} govuk-!-margin-bottom-4`}>
      <p className="govuk-body" role="status">
        {describeSelection(selection)}
        {selection && count ? (
          <> <span className="prt-selection__count">{count.n} of {count.total} {count.total === 1 ? 'way' : 'ways'} to beat it.</span></>
        ) : null}
      </p>
      {selection ? (
        <Button variant="secondary" onClick={onClear}>Clear the selection</Button>
      ) : null}
    </div>
  );
}
