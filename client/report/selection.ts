import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Band, type Play } from '$lib/policy-analysis/view';

/**
 * ONE OBJECT, FOUR QUESTIONS.
 *
 * The report is four views of the same assessment, and the thing that makes them
 * one page rather than four is that a choice made in any of them holds in the
 * others: pick a mechanism in Causality and the ranked list in Threats and the
 * bodies in Actors narrow to it. No GOV.UK pattern carries a filter across a tab
 * change, because no GOV.UK service needs to ask four questions about one
 * object.
 *
 * At forty-seven plays across twelve bodies and twenty-four mechanisms this
 * stops being a convenience and becomes the only way through. A twelve-play
 * sample did not make that case; the Post-16 run does.
 *
 * OPENING A PLAY IS NOT SELECTING IT. The first version of the prototype
 * filtered the whole page down to one play when you clicked it, which is exactly
 * why its chain view felt unrelated to its chart. Reading one play is a
 * navigation to the drill page; narrowing every view is this. They are kept
 * apart deliberately — see `Drill.tsx`, which argues the page case in writing.
 */
export type Selection =
  | { kind: 'band'; id: Band }
  | { kind: 'mechanism'; id: string; label: string }
  | { kind: 'actor'; id: string; label: string }
  | null;

/** What the banner above the views says, in words rather than a chip. */
export function describeSelection(selection: Selection): string {
  if (!selection) return 'Showing everything. Select a band, a mechanism or a body to narrow every view.';
  if (selection.kind === 'band') return `Showing ${BAND_LABEL[selection.id].toLowerCase()} exposure only.`;
  if (selection.kind === 'mechanism') return `Showing what follows from “${selection.label}”.`;
  return `Showing what “${selection.label}” is positioned to run.`;
}

/**
 * The mechanism a play hangs off, if any.
 *
 * A play cites the mechanism it exploits in `refs`, so the link is already in
 * the data — there is no separate edge to consult. `refs` also carries
 * assumptions and actors, which is why this looks the id up in the supplied set
 * rather than trusting position.
 */
export function mechanismOf(play: Play, mechanismIds: Set<string>): string | null {
  for (const ref of play.artefact.refs) if (mechanismIds.has(ref)) return ref;
  return null;
}

/**
 * Narrow a list of plays to the selection.
 *
 * RETURNS THE SAME ARRAY WHEN NOTHING IS SELECTED, so a view can compare by
 * identity to decide whether it is filtered without re-deriving the predicate.
 */
export function filterPlays(list: Play[], selection: Selection, mechanismIds: Set<string>): Play[] {
  if (!selection) return list;
  if (selection.kind === 'band') return list.filter((p) => p.band === selection.id);
  if (selection.kind === 'actor') return list.filter((p) => p.actor?.id === selection.id);
  return list.filter((p) => mechanismOf(p, mechanismIds) === selection.id);
}

/** Mechanism ids, as a set, for the two functions above. */
export function mechanismIdsOf(artefacts: Artefact[]): Set<string> {
  return new Set(artefacts.filter((a) => a.kind === 'mechanism').map((a) => a.id));
}

/**
 * Is this selection still meaningful against what is on screen?
 *
 * A selection that narrows to nothing is worse than no selection: the reader
 * sees an empty view and no reason for it. Callers use this to say "nothing
 * under this selection" rather than rendering a blank.
 */
export function isEmptyUnder(list: Play[], selection: Selection, mechanismIds: Set<string>): boolean {
  return Boolean(selection) && filterPlays(list, selection, mechanismIds).length === 0;
}

/**
 * Narrow a list, EXCEPT by the kind of selection this control itself sets.
 *
 * A control that chooses a band must keep showing every band, or the reader who
 * picked "severe" has no way to pick "moderate" — they would have to clear the
 * selection first, which is the interaction the carried selection exists to
 * avoid. The same holds for the mechanism bars and the actor board.
 *
 * So each of the three pickers narrows by the OTHER two kinds and never by its
 * own. Selecting a body and opening Causality shows every mechanism, counted by
 * the plays that body is positioned to run — which is the question the pairing
 * actually asks.
 *
 * Written down here rather than repeated in three components because it was not
 * written down at all in the first cut, and all three got it differently.
 */
export function narrowExcept(
  list: Play[],
  selection: Selection,
  mechanismIds: Set<string>,
  own: NonNullable<Selection>['kind'],
): Play[] {
  if (selection?.kind === own) return list;
  return filterPlays(list, selection, mechanismIds);
}

/**
 * A SELECTION IN A URL, so the reading position survives leaving the page.
 *
 * `move` and `selection` were plain component state, and the drill is a separate
 * route — so following a play out of the report and pressing Back returned the
 * reader to Move 1 with the banner reset to "Showing everything", whatever they
 * had been reading. Reload did the same. The URL was character-identical in
 * every one of those states, which also meant nobody could send a colleague
 * "look at Threats under this mechanism".
 *
 * ONLY THE KIND AND THE ID TRAVEL. A mechanism's and a body's `label` is the
 * artefact's name, not something to round-trip through a query string where it
 * would be stale the moment the assessment is restated — so it is resolved back
 * from the artefacts on the way in, and a selection whose id is no longer in the
 * run resolves to nothing rather than to a label that lies.
 */
export function selectionParam(selection: Selection): string | null {
  return selection ? `${selection.kind}:${selection.id}` : null;
}

export function parseSelection(param: string | null, artefacts: Artefact[]): Selection {
  if (!param) return null;
  const cut = param.indexOf(':');
  if (cut < 0) return null;
  const kind = param.slice(0, cut);
  const id = param.slice(cut + 1);
  if (kind === 'band') {
    return (['severe', 'significant', 'moderate', 'limited'] as Band[]).includes(id as Band)
      ? { kind: 'band', id: id as Band }
      : null;
  }
  if (kind !== 'mechanism' && kind !== 'actor') return null;
  const found = artefacts.find((a) => a.id === id);
  return found ? { kind, id, label: found.label } : null;
}
