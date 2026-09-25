import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Band, type Play } from '$lib/policy-analysis/view';
import { OTHER_PATTERN, PLAY_PATTERNS, patternOf, type PatternKey } from '$lib/policy-analysis/patterns';

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
  /*
   * A KIND OF WAY TO BEAT IT, optionally aimed at one part of the policy — a
   * row or a cell of the pattern grid that leads Threats (phase 19). One kind
   * rather than two because a cell IS a row narrowed by a column, and the
   * banner has to say both halves in one sentence.
   */
  | { kind: 'pattern'; id: PatternKey; label: string; mechanism?: { id: string; label: string } }
  | null;

/** What the banner above the views says, in words rather than a chip. */
export function describeSelection(selection: Selection): string {
  if (!selection) return 'Showing everything. Select a level of exposure, a kind of way to beat it, a part of the policy or a body to narrow every tab.';
  if (selection.kind === 'band') return `Showing ${BAND_LABEL[selection.id].toLowerCase()} ways to beat it only.`;
  if (selection.kind === 'mechanism') return `Showing what follows from “${selection.label}”.`;
  if (selection.kind === 'pattern') {
    return selection.mechanism
      ? `Showing “${selection.label.toLowerCase()}” aimed at “${selection.mechanism.label}”.`
      : `Showing “${selection.label.toLowerCase()}” only.`;
  }
  return `Showing what “${selection.label}” could do.`;
}

/**
 * The same subject, in the negative, for a list the selection emptied.
 *
 * A blank where a list was is the one state that reads as a broken page rather
 * than an answer. `?sel=mechanism:s1_000_mechanism_001` — "Parliamentary
 * presentation", one of the 110 of 151 mechanisms no play cites — renders two
 * empty leads and a "0 plays" status line on the real run, so this is reachable
 * from any shared or stale link, not a theoretical state.
 *
 * IT USES THE BANNER'S OWN VERBS. "follows from" for a mechanism, "positioned to
 * run" for a body: a reader who has just read `describeSelection` at the top of
 * the page should meet the same relationship worded the same way, or the two
 * sentences read as being about two different filters.
 */
export function nothingUnder(selection: Selection): string {
  if (!selection) return '';
  if (selection.kind === 'band') return `Nothing here is ${BAND_LABEL[selection.id].toLowerCase()}.`;
  if (selection.kind === 'mechanism') return `Nothing here follows from “${selection.label}”.`;
  if (selection.kind === 'pattern') {
    return selection.mechanism
      ? `Nothing here is “${selection.label.toLowerCase()}” aimed at “${selection.mechanism.label}”.`
      : `Nothing here is “${selection.label.toLowerCase()}”.`;
  }
  return `Nothing here is something “${selection.label}” could do.`;
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
 * EVERY mechanism a play cites, not just the first one.
 *
 * `mechanismOf` answers "which mechanism does this play hang off", which is the
 * right question for a single-parent grouping and the wrong one for coverage.
 * Measured over the 47 plays on the Post-16 run: 11 cite one mechanism, 14 cite
 * two, 11 cite three and 6 cite four — so a count built on the first ref alone
 * attributes 42 plays where the run recorded 108 citations, and a mechanism that
 * is a play's second reference looks, to the reader, like a mechanism no play
 * touches.
 *
 * De-duplicated and in the order the play wrote them, because `refs` may name
 * the same mechanism twice and a caller rendering these as a list must not print
 * it twice.
 */
export function mechanismsOf(play: Play, mechanismIds: Set<string>): string[] {
  const found: string[] = [];
  for (const ref of play.artefact.refs) {
    if (mechanismIds.has(ref) && !found.includes(ref)) found.push(ref);
  }
  return found;
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
  /*
   * THE GRID'S OWN JOIN, NOT `mechanismsOf`. `patternGrid` places a play in a
   * column by `data.targets` — what the play says it is aimed at — so a cell
   * reading "2" has to narrow to exactly those two. `mechanismsOf` walks
   * `refs`, which also carries what a play merely mentions.
   */
  if (selection.kind === 'pattern') {
    const mechanism = selection.mechanism?.id;
    return list.filter((p) => patternOf(p.artefact) === selection.id
      && (!mechanism || targetsOf(p).includes(mechanism)));
  }
  /*
   * MEMBERSHIP, NOT THE FIRST REF, and the two disagree on most of this run.
   *
   * This asked `mechanismOf(p) === id` — the first mechanism a play names — so
   * a mechanism that is never any play's FIRST reference narrowed the whole
   * report to nothing. The mechanism chart above it had already moved to
   * `mechanismsOf`: measured on the Post-16 run it draws 41 rows over 96
   * play-mechanism pairs, while 42 plays have a first ref, so a reader could
   * press a bar reading "3 plays" and watch Threats and Actors empty. Move 2
   * was answering its own bars locally to hide the contradiction; it no longer
   * has to.
   *
   * `mechanismsOf` is the same de-duplicated join the chart counts with, so the
   * bar and everything the bar narrows now come from one definition.
   */
  return list.filter((p) => mechanismsOf(p, mechanismIds).includes(selection.id));
}

/** What a play says it is aimed at — `data.targets`, the join `patternGrid` uses. */
export function targetsOf(play: Play): string[] {
  const targets = play.artefact.data.targets;
  return Array.isArray(targets) ? targets.filter((t): t is string => typeof t === 'string') : [];
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
 *
 * ONLY A PICKER CALLS THIS. A list that sets no selection of its own wants
 * `filterPlays`, and calling this instead is the defect that cost the report its
 * headline claim: `VerdictLead` and `ThreatsLead` both read
 * `narrowExcept(list, selection, mechanismIds, 'band' as never)`, which returns
 * the list UNFILTERED whenever a band is selected. Measured live at
 * `?sel=band:limited`, where there are two limited plays: the banner read
 * “Showing limited exposure only”, the button read “Show all 47 under this
 * selection”, and the three cards on screen were all severe. Four other views
 * on the same page honoured the band correctly, which is what made it silent.
 *
 * The `as never` cast is what let it compile — `never` is assignable to any
 * parameter, so no signature can forbid it. The guard is therefore the rule,
 * not the type: three call sites pass their own picker's kind (`'actor'` for
 * the board, `'mechanism'` for the mechanism bars, `'band'` for the band row),
 * and a fourth caller that has no picker is a caller that wanted `filterPlays`.
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
  if (selection?.kind === 'pattern' && selection.mechanism) return `pattern:${selection.id}@${selection.mechanism.id}`;
  return selection ? `${selection.kind}:${selection.id}` : null;
}

/** A pattern's plain name, or null for a key that is not one. */
function patternLabel(key: string): string | null {
  if (key === OTHER_PATTERN.key) return OTHER_PATTERN.label;
  return PLAY_PATTERNS.find((p) => p.key === key)?.label ?? null;
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
  /*
   * `pattern:<key>` or `pattern:<key>@<mechanism id>`. The label is resolved
   * from the pattern list, and the mechanism from the run, by the same rule as
   * below: an id that is not a mechanism in this run resolves to nothing.
   */
  if (kind === 'pattern') {
    const at = id.indexOf('@');
    const key = at < 0 ? id : id.slice(0, at);
    const label = patternLabel(key);
    if (!label) return null;
    if (at < 0) return { kind: 'pattern', id: key as PatternKey, label };
    const mechanism = artefacts.find((a) => a.id === id.slice(at + 1) && a.kind === 'mechanism');
    return mechanism ? { kind: 'pattern', id: key as PatternKey, label, mechanism: { id: mechanism.id, label: mechanism.label } } : null;
  }
  if (kind !== 'mechanism' && kind !== 'actor') return null;
  /*
   * THE KIND HAS TO MATCH, not just the id.
   *
   * This was `artefacts.find((a) => a.id === id)` with no check on what was
   * found, so any artefact id at all resolved. Loaded live:
   * `?sel=mechanism:s10_000_exploit_001` — a PLAY's id — and the banner read
   * “Showing what follows from “Selective specialisation with protected
   * breadth””, a play's label presented as a mechanism, over two lists narrowed
   * to nothing because no play cites a play.
   *
   * The rule is already written above: a selection whose id is not in the run
   * resolves to nothing rather than to a label that lies. An id that is in the
   * run but names the wrong kind of thing lies in exactly the same way.
   */
  const found = artefacts.find((a) => a.id === id && a.kind === kind);
  return found ? { kind, id, label: found.label } : null;
}
