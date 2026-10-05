import { createContext, useContext } from 'react';

/**
 * WHAT THE PAGE SHELL NEEDS TO KNOW ABOUT THE INSTALL, and nothing else.
 *
 * `ReaderGate` already asks the server one question per document load —
 * `/api/reader/status` — before it draws anything, so the answer to "is this
 * copy read-only" rides on that request rather than costing the shell a fetch
 * of its own on every page. Its own leaf module because `ReaderGate` imports
 * `Template` and `Template` reads this; a context in either would be a cycle.
 *
 * `readOnly` IS NULL UNTIL KNOWN. The navigation draws "Assess a paper" unless
 * the answer is a definite yes — the read-only copy is the rare install, and a
 * link that appears a moment after the page is a smaller harm than one that
 * flickers away on every load of every ordinary one.
 */
export type Site = { readOnly: boolean | null };

export const SiteContext = createContext<Site>({ readOnly: null });

export function useSite(): Site {
  return useContext(SiteContext);
}
