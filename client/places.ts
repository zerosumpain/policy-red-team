/**
 * WHERE THE SERVICE'S OWN PAGES LIVE, NAMED ONCE (phase 24).
 *
 * A leaf module at the client root for the reason `moves.ts` is one: `Home` is
 * the one eagerly loaded route and links into the bodies hub, and anything it
 * imports is in the first paint of `/`. This file imports nothing.
 *
 * THE BODIES ARE AT `/bodies`, and `/personas` redirects there. "Persona" was
 * the pipeline's word and "body" is the reader's — phase 24's one-word rule —
 * and `/bodies` already existed as the grid, so the hub took the address a
 * reader was most likely to have bookmarked rather than minting a third. A
 * body's own page is `/bodies/:id` with the same id it had under `/personas`,
 * so every old link has exactly one new one to land on. API paths keep
 * `personas`: they are the program's names, and other builders read them.
 */

/** The hub: every body this install has profiled. */
export const HUB = '/bodies';

/** One body's page, or one of the pages where a reader rules on who it is. */
export function bodyPath(id: string, part?: string): string {
  return `${HUB}/${encodeURIComponent(id)}${part ? `/${part}` : ''}`;
}

export type HubView = {
  /** The path under `/bodies`. Empty for the list, which is the bare URL. */
  slug: string;
  label: string;
  /** The question the view answers, for its heading's lead paragraph. */
  hint: string;
};

/**
 * THE HUB'S VIEWS, one question per page as the report's are (phase 21).
 *
 * THE REGISTER GOES BETWEEN CLASHES AND GROUPS. Phase 24b turns the list into
 * a master register with a part-of / kind-of tree and a queue of proposals to
 * review; it is a view of the same bodies, so it is an entry in this table and
 * a route under `/bodies`, not a page of its own elsewhere. Nothing is drawn
 * for it until it exists: a navigation item that leads to "coming soon" is a
 * dead end with a better label.
 *
 * GROUPS OF PEOPLE ARE A VIEW, not a link under the list. They were a table at
 * the foot of the old library that went nowhere; a page that is not in the
 * navigation is a page a reader finds by luck, which is the defect this fixes.
 */
export const HUB_VIEWS: readonly HubView[] = [
  { slug: '', label: 'List', hint: 'Every body your papers have named, and how often each has turned up' },
  { slug: 'across', label: 'Across papers', hint: 'Which public bodies your papers ask things of, paper by paper' },
  { slug: 'clashes', label: 'Clashes', hint: 'Where two papers pull the same bodies in opposite directions' },
  // { slug: 'register', label: 'Register', hint: '…' } — phase 24b, see above.
  { slug: 'groups', label: 'Groups of people', hint: 'The people the papers say a policy affects' },
];

export function hubPath(slug: string, query?: string): string {
  return `${HUB}${slug ? `/${slug}` : ''}${query ? `?${query}` : ''}`;
}

/**
 * "How to read a report": the guide's front page, with a chapter at
 * `/guide/1` … `/guide/6` (phase 26). Phase 24 put a short page here first so
 * the navigation item never had to move.
 */
export const GUIDE = '/guide';

/** One chapter of the guide. Kept here, beside `GUIDE`, so the report's "?" links need no guide module. */
export const guideChapter = (n: number) => `${GUIDE}/${n}`;

/** "seen in 3 policies" — the figure a link to a body's page carries. */
export function seenIn(papers: number): string {
  return `seen in ${papers} ${papers === 1 ? 'policy' : 'policies'}`;
}
