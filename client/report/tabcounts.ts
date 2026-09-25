/**
 * HOW BIG EACH MOVE IS, IN THE MOVE'S OWN UNITS.
 *
 * The five tabs were three identical lines each — a step, a name and the
 * question the move answers — over panels measured at 919px to 10,137px on this
 * run. A reader choosing between them was choosing between five boxes that look
 * the same, and the only way to learn that Causality is five screens and Actors
 * is one was to open both and scroll.
 *
 * NOT A SINGLE FIGURE, because the five moves are not counted in one unit: a
 * move is worth 47 plays, or 41 mechanisms, or 270 recorded limits, and a number
 * without its noun says nothing. So each tab gets a short phrase, and the phrase
 * is built here rather than in the component — this is arithmetic with
 * pluralisation in it, and arithmetic inside JSX is arithmetic with no test.
 *
 * A ZERO CLAUSE IS DROPPED, NOT PRINTED. "0 suggestions" on a run that made none
 * is the assessment's own failure printed as furniture in a tab; a move with
 * nothing to count gets no count at all and the tab keeps the three lines it had.
 */

/** Everything the five phrases are made of, each already counted by a view. */
export type MoveSizes = {
  /** Findings the write-up actually renders — `findingsBySection` after the assured filter. */
  findings: number;
  /** Recommendations `recommendations()` keeps: the assured revision, latest generation. */
  suggestions: number;
  /** Mechanisms with at least one play — the bar rows, not the 151 the paper names. */
  mechanisms: number;
  /** Relationships `network()` resolves at both ends. */
  relationships: number;
  /** Plays in the playbook. */
  plays: number;
  /** Of those, the ones in the severe band. */
  severe: number;
  /** Distinct named bodies positioned to run at least one play. */
  bodies: number;
  /** Parts of the policy under pressure, drawn and undrawn. */
  targets: number;
  /** Warnings recorded across every stage. */
  limits: number;
};

export type MoveCounts = {
  verdict?: string;
  causality?: string;
  threats?: string;
  actors?: string;
  provenance?: string;
};

/** "1 play", "47 plays" — the noun is pluralised by adding an s unless told otherwise. */
function clause(n: number, singular: string, plural = `${singular}s`): string | null {
  if (!n) return null;
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

/**
 * The separator is a middot, as it is everywhere else the report puts two
 * figures on one line — `.prt-denom`, the band key, the stage rail. A comma
 * would read as a sentence the tab does not have room to finish.
 */
function phrase(...parts: (string | null)[]): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length ? kept.join(' · ') : undefined;
}

export function moveCounts(sizes: MoveSizes): MoveCounts {
  return {
    verdict: phrase(clause(sizes.findings, 'finding'), clause(sizes.suggestions, 'recommendation')),
    causality: phrase(clause(sizes.mechanisms, 'part', 'parts'), clause(sizes.relationships, 'link')),
    /*
     * "20 severe" CARRIES NO NOUN OF ITS OWN, deliberately: the noun is the
     * clause before it, and "47 plays · 20 severe plays" says plays twice in
     * eleven characters of column.
     */
    threats: phrase(clause(sizes.plays, 'way to beat it', 'ways to beat it'), sizes.severe ? `${sizes.severe} severe` : null),
    actors: phrase(clause(sizes.bodies, 'body', 'bodies'), clause(sizes.targets, 'target')),
    /*
     * ONE CLAUSE, AND THE VERB STAYS IN IT. "270 limits" invites the reading
     * that the run was limited 270 times; what the number counts is the record
     * the run kept of what it could not do, which is the sentence the panel
     * itself opens with.
     */
    provenance: sizes.limits
      ? `${sizes.limits.toLocaleString()} ${sizes.limits === 1 ? 'gap' : 'gaps'} noted`
      : undefined,
  };
}
