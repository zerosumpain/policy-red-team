/**
 * How much searching one assessment did.
 *
 * Upstream this is an AsyncLocalStorage meter feeding the site's research budget
 * and its cost ledger, and it counts Tavily CREDITS rather than calls — a basic
 * search and an advanced one are not the same price, and an extract is priced per
 * URL. The same arithmetic is kept here, because the research stage reads these
 * numbers to stay inside its own caps, and because a standalone user paying their
 * own Tavily bill has more reason to see them, not less.
 *
 * What is dropped is the ambient context: one process, one counter.
 */

export type TavilyDepth = 'basic' | 'advanced';

interface Counts {
  searches: number;
  extracts: number;
  credits: number;
}

const counts: Counts = { searches: 0, extracts: 0, credits: 0 };

/** Tavily prices an advanced search at twice a basic one. */
function searchCredits(depth: TavilyDepth): number {
  return depth === 'advanced' ? 2 : 1;
}

/** Extraction is priced per five URLs, rounded up, and doubled when advanced. */
function extractCredits(urlCount: number, depth: TavilyDepth): number {
  const blocks = Math.max(1, Math.ceil(urlCount / 5));
  return depth === 'advanced' ? blocks * 2 : blocks;
}

export function countTavilySearch(depth: TavilyDepth = 'basic'): void {
  counts.searches += 1;
  counts.credits += searchCredits(depth);
}

export function countTavilyExtract(urlCount: number, depth: TavilyDepth = 'basic'): void {
  counts.extracts += 1;
  counts.credits += extractCredits(urlCount, depth);
}

export function researchCounts(): Counts {
  return { ...counts };
}

export function resetResearchCounts(): void {
  counts.searches = 0;
  counts.extracts = 0;
  counts.credits = 0;
}
