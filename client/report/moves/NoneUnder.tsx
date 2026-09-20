import { Button } from '../../govuk';
import { describeSelection, nothingUnder, type Selection } from '../selection';

/**
 * A LIST THE SELECTION EMPTIED, WITH A WAY BACK OUT OF IT.
 *
 * Both leads printed the bare sentence "Nothing under this selection." and
 * nothing else. The only control that can clear a selection is the banner's, and
 * the banner is above the tab strip: measured at 320px on the real run, the
 * document is 130,015px, `.prt-selection` computes to `position: static` and
 * sits at y=990, and the Threats panel begins at y=29,507 — so a reader who
 * lands on an emptied Threats list is about thirty-two screens from the only
 * button that can undo it.
 *
 * IT IS REACHED BY A LINK, NOT BY A CLICK. No picker on the page can empty a
 * list: every band holds at least two plays, every drawn mechanism bar at least
 * one, and there is no body picker at all. It is reached by a shared or stale
 * URL — `?sel=mechanism:s1_000_mechanism_001` is one of the 110 of 151
 * mechanisms that no play cites, and it renders this state twice. That is
 * exactly the reader least able to work out what happened, because they did not
 * do it.
 *
 * NO WIDENING. An earlier proposal offered "show significant as well" beside the
 * exit; band adjacency is a semantic the report does not have anywhere else, and
 * inventing one here would put a relationship on screen the assessment never
 * asserted.
 */
export function NoneUnder({ selection, onClear }: {
  selection: Selection;
  /**
   * Optional, like every other control in the report tree: the offline pack
   * renders whatever it is handed, and a report rendered without a way to change
   * the selection still has to explain why the list is empty.
   */
  onClear?: () => void;
}) {
  if (!selection) return null;

  return (
    <div className="prt-none">
      <p className="govuk-body prt-none__says">
        Nothing under this selection. {nothingUnder(selection)}
      </p>
      {onClear ? (
        <Button variant="secondary" onClick={onClear}>Clear the selection</Button>
      ) : null}
    </div>
  );
}

/**
 * A SECTION THAT CANNOT NARROW, SAYING SO.
 *
 * The selection banner sits above the tab strip, so it is on screen over every
 * panel — and three sections underneath it genuinely read the whole assessment:
 * the relationship network is `network(artefacts)`, the stress lab is
 * `leverage(artefacts)`, and the Provenance move is about the RUN rather than
 * about the paper, so a band or a mechanism has nothing to say to it. Nothing on
 * the page distinguished those from the sections that do narrow, so a reader who
 * picked a mechanism in Causality met "Showing what follows from X" above twenty
 * rows that had not changed and had to assume the numbers were filtered.
 *
 * ONE SENTENCE, IN THE BANNER'S OWN INK, and it says what the selection IS as
 * well as that it does not apply — otherwise a reader two screens down has to
 * scroll back up to find out what is being excused.
 *
 * It renders nothing when nothing is selected, which is the common case, so the
 * three sections are unchanged for a reader who has not narrowed anything.
 */
export function ScopeNote({ selection, subject = 'the whole run' }: {
  selection: Selection;
  /** What this section actually reads, in the section's own words. */
  subject?: string;
}) {
  if (!selection) return null;
  return (
    <p className="prt-scope">
      This section reads {subject} — the selection does not narrow it.{' '}
      <span className="prt-scope__what">{describeSelection(selection)}</span>
    </p>
  );
}
