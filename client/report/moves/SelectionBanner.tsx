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
 * `role="status"` rather than an alert: changing it is the reader's own doing,
 * so it should be announced without interrupting them.
 */
export function SelectionBanner({ selection, onClear }: { selection: Selection; onClear: () => void }) {
  return (
    <div className="prt-selection govuk-!-margin-bottom-4">
      <p className="govuk-body" role="status">{describeSelection(selection)}</p>
      {selection ? (
        <Button variant="secondary" onClick={onClear}>Clear the selection</Button>
      ) : null}
    </div>
  );
}
