/**
 * THE FIVE MOVES, NAMED ONCE.
 *
 * The report's tab strip carries a step, a label and the question each move
 * answers — "Move 1 / Verdict / What did it conclude" — and those five triples
 * were written down in exactly one place: the `tabs` array inside `Report.tsx`.
 * The landing page now shows what the tool produces, which means saying the
 * same five things, and a second hand-typed copy is a pair of surfaces that
 * drift the first time a move is renamed.
 *
 * IT IS A LEAF MODULE AT THE CLIENT ROOT, not an export from `Report.tsx`, and
 * that is a bundling decision rather than a tidy-up. `Home` is the one page
 * `App.tsx` imports eagerly — every other route is `lazy()` precisely so that
 * `contracts.ts` and its eighty zod schemas stay out of the entry chunk, which
 * the comment at the head of `App.tsx` measures at 91,380 bytes. Importing
 * anything from `Report.tsx` into `Home.tsx` would pull the whole report tree,
 * and zod behind it, straight back into the first paint of `/`. This file
 * imports nothing at all, so both sides can have it for free.
 */
export type MoveId = 'verdict' | 'causality' | 'threats' | 'actors' | 'provenance';

export type MoveEntry = {
  id: MoveId;
  /** "Move 1" … "Last". The fifth is a hint like the others, not a noun — see `Report.tsx`. */
  step: string;
  label: string;
  /** The question the move answers, in the reader's words rather than an analyst's. */
  hint: string;
};

export const MOVES: readonly MoveEntry[] = [
  { id: 'verdict', step: 'Move 1', label: 'Verdict', hint: 'What did it conclude' },
  { id: 'causality', step: 'Move 2', label: 'Causality', hint: 'Why is any of it possible' },
  { id: 'threats', step: 'Move 3', label: 'Threats', hint: 'What could be done to it' },
  { id: 'actors', step: 'Move 4', label: 'Actors', hint: 'Who would do it' },
  { id: 'provenance', step: 'Last', label: 'Provenance', hint: 'What the run discarded' },
];
