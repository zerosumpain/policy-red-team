/**
 * THE SIX VIEWS, NAMED ONCE — AND, SINCE PHASE 21, WHERE EACH ONE LIVES.
 *
 * The report's tab strip carried a step, a label and the question each move
 * answered — "Move 1 / Verdict / What did it conclude" — and those triples were
 * written down in exactly one place, so the landing page could show the same
 * five without a second hand-typed copy to drift.
 *
 * PAGES, NOT TABS (phase 21). A 33,000px tab is a document, not a panel, so
 * every view is a route of its own and every section a page under it:
 *
 *   /assessments/:id                    Summary        (move `overview`)
 *   /assessments/:id/findings[/:part]   Findings       (move `verdict`)
 *   /assessments/:id/causes[/:part]     Causes         (move `causality`)
 *   /assessments/:id/threats[/:part]    Threats        (move `threats`)
 *   /assessments/:id/who[/:part]        Who is involved (move `actors`)
 *   /assessments/:id/method[/:part]     How it was made (move `provenance`)
 *   /assessments/:id/use                what you can do with it
 *
 * THE MOVE IDS DO NOT CHANGE, only what the reader sees and types. Every
 * section, anchor, `?sel=` resolution and stylesheet hook is keyed on the old
 * ids, and a rename there is three hundred edits to say nothing new. The slug is
 * the reader's word; the id is the program's.
 *
 * THE "MOVE 1 / MOVE 2" STEPS ARE GONE from everything that renders. A reader
 * chose them by question, never by number, and on a page of its own a number
 * says "there is an order you are failing to follow". `step` survives on the
 * type for one reason — see its note.
 *
 * IT IS A LEAF MODULE AT THE CLIENT ROOT, not an export from `Report.tsx`, and
 * that is a bundling decision rather than a tidy-up. `Home` is the one page
 * `App.tsx` imports eagerly — every other route is `lazy()` precisely so that
 * `contracts.ts` and its eighty zod schemas stay out of the entry chunk, which
 * the comment at the head of `App.tsx` measures at 91,380 bytes. Importing
 * anything from `Report.tsx` into `Home.tsx` would pull the whole report tree,
 * and zod behind it, straight back into the first paint of `/`. This file
 * imports nothing at all — `URLSearchParams` is a global — so the router, the
 * report, the drill and the landing page can all have it for free, and the
 * report can build its own links without learning anything from a router.
 */
export type MoveId = 'overview' | 'verdict' | 'causality' | 'threats' | 'actors' | 'provenance';

export type MoveEntry = {
  id: MoveId;
  /** The path segment under `/assessments/:id`. Empty for the Summary, which is the bare URL. */
  slug: string;
  label: string;
  /** The question the view answers, in the reader's words rather than an analyst's. */
  hint: string;
  /**
   * @deprecated Rendered by nothing this module's callers own. `Drill.tsx`
   * still prints it for a `from=` in the pre-phase-21 `move=` shape while it is
   * being restructured, as "Back to {step} · {label}" — so it holds the view's
   * question, and that sentence reads "Back to How could it be beaten ·
   * Threats" rather than "Back to Move 3 · Threats". Delete once the drill
   * reads `returnLabel` below.
   */
  step: string;
};

export const MOVES: readonly MoveEntry[] = [
  /*
   * THE SUMMARY, FIRST AND THE DEFAULT (phase 20). Not a view of the argument
   * but the front door to all five: the figures, the judgements and one box per
   * question, each ending in a link to the page that answers it.
   */
  { id: 'overview', slug: '', label: 'Summary', hint: 'The report at a glance', step: 'The report at a glance' },
  { id: 'verdict', slug: 'findings', label: 'Findings', hint: 'What did it find', step: 'What did it find' },
  { id: 'causality', slug: 'causes', label: 'Causes', hint: 'Why could it happen', step: 'Why could it happen' },
  { id: 'threats', slug: 'threats', label: 'Threats', hint: 'How could it be beaten', step: 'How could it be beaten' },
  { id: 'actors', slug: 'who', label: 'Who is involved', hint: 'Who would do it', step: 'Who would do it' },
  { id: 'provenance', slug: 'method', label: 'How it was made', hint: 'Where it came from, and what it threw away', step: 'Where it came from' },
];

/** The page of things to do with a report — downloads, adding to it, writing it again. Not a view. */
export const USE_SLUG = 'use';

/** The move a path segment names, or null for a segment that is not a view. */
export function moveOfSlug(slug: string | undefined): MoveId | null {
  if (!slug) return null;
  return MOVES.find((entry) => entry.slug === slug && entry.slug !== '')?.id ?? null;
}

/** The move behind an old `?move=` value, which named ids rather than slugs. */
export function moveOfId(id: string | null | undefined): MoveId | null {
  return MOVES.find((entry) => entry.id === id)?.id ?? null;
}

/**
 * The page for a view, or one section of it, with whatever query rides along.
 *
 * `query` is a query string without its `?` — the carried selection and the
 * stress-test scenario — and is passed on every link between these pages,
 * because a filter that drops on a page change breaks silently.
 */
export function viewPath(id: string, move: MoveId | 'use', section?: string, query?: string): string {
  const slug = move === 'use' ? USE_SLUG : MOVES.find((entry) => entry.id === move)?.slug ?? '';
  return `/assessments/${id}${slug ? `/${slug}` : ''}${slug && section ? `/${encodeURIComponent(section)}` : ''}${query ? `?${query}` : ''}`;
}

/**
 * WHERE AN ITEM PAGE'S BACK LINK GOES, from whatever `?from=` carried.
 *
 * Since phase 21 `from` is the PATH AND QUERY of the page the reader left —
 * `/assessments/:id/threats/weights?sel=band:severe` — because "where you were"
 * is now a page, not a tab inside one. Before it, `from` was the report's own
 * query, `move=threats&sel=…`, and a link opened yesterday still carries that,
 * so the old shape is read too and turned into the page it meant.
 *
 * ONLY A PATH INSIDE THIS ASSESSMENT IS FOLLOWED. `from` is a query parameter
 * anybody can write, and a back link that obeys `//elsewhere.example` is an
 * open redirect wearing the service's own styling. Anything else degrades to
 * the summary, which is the page a stale `from` deserves.
 */
export function returnTo(id: string, from: string | null | undefined): string {
  const base = `/assessments/${id}`;
  if (!from) return base;
  if (from === base || from.startsWith(`${base}/`) || from.startsWith(`${base}?`)) return from;
  if (from.startsWith('/')) return base;
  const params = new URLSearchParams(from);
  const move = moveOfId(params.get('move'));
  params.delete('move');
  return viewPath(id, move ?? 'overview', undefined, params.toString());
}

/** "Back to Threats" — the view a `from` returns to, named. */
export function returnLabel(id: string, from: string | null | undefined): string {
  const path = returnTo(id, from).split(/[?#]/)[0];
  const slug = path.slice(`/assessments/${id}`.length).split('/')[1];
  if (!slug) return from ? 'Back to the summary' : 'Back to the assessment';
  if (slug === USE_SLUG) return 'Back to what you can do with this';
  const move = MOVES.find((entry) => entry.id === moveOfSlug(slug));
  return move ? `Back to ${move.label}` : 'Back to the assessment';
}
