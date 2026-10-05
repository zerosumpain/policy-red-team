import type { RegisterNode, RegisterTree } from './api';

/**
 * THE MASTER LIST AS A TREE, arranged for a page (phase 24b). Pure, so the
 * ordering, the search and the paging are tested without a browser.
 *
 * Two hierarchies over one set of rows: `partOf` is structure (who sits
 * inside whom), `kindOf` is category (what sort of thing it is). The server
 * sends both as `{roots, children}`; this decides what a reader sees first.
 */
export type TreeField = 'partOf' | 'kindOf';

/** How many actors sit beneath each one, at any depth. A loop (there should be none) is cut. */
export function descendantCounts(tree: Pick<RegisterTree, TreeField>, field: TreeField): Map<string, number> {
  const children = tree[field].children;
  const memo = new Map<string, number>();
  const count = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const n = (children[id] ?? []).reduce((sum, c) => sum + 1 + count(c, seen), 0);
    memo.set(id, n);
    return n;
  };
  for (const id of Object.keys(children)) count(id, new Set());
  return memo;
}

/**
 * THE TOP OF THE TREE, biggest first.
 *
 * A root with something under it is structure a reader came to see; a lone
 * actor is a line. So roots are ordered by how much sits beneath them, then by
 * how many papers named them, then by name. Things ruled NOT actors that sit
 * under nothing — a programme nobody runs, a place — are set apart as context
 * rather than mixed into the list of who acts.
 */
export function arrangeRoots(tree: RegisterTree, field: TreeField): { roots: string[]; context: string[] } {
  const byId = new Map(tree.entries.map((e) => [e.id, e]));
  const below = descendantCounts(tree, field);
  const roots: string[] = [];
  const context: string[] = [];
  for (const id of tree[field].roots) {
    const entry = byId.get(id);
    if (!entry) continue;
    if (entry.kind === 'not_an_actor' && !(below.get(id) ?? 0)) context.push(id);
    else roots.push(id);
  }
  const rank = (id: string) => byId.get(id)!;
  roots.sort((a, b) => (below.get(b) ?? 0) - (below.get(a) ?? 0) || rank(b).papers - rank(a).papers || rank(a).name.localeCompare(rank(b).name));
  context.sort((a, b) => rank(a).name.localeCompare(rank(b).name));
  return { roots, context };
}

/**
 * FIND AN ACTOR: the rows whose name or another name contains the words, plus
 * every row above them, so a match is always shown where it sits. `open` is
 * the rows to expand so each match is on screen. Null `visible` means no
 * search: everything is shown.
 */
export function searchTree(tree: RegisterTree, field: TreeField, query: string): { visible: Set<string> | null; open: Set<string>; matches: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { visible: null, open: new Set(), matches: new Set() };
  const byId = new Map(tree.entries.map((e) => [e.id, e]));
  const hit = (e: RegisterNode) => [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(q));
  const matches = new Set(tree.entries.filter(hit).map((e) => e.id));
  const visible = new Set<string>();
  const open = new Set<string>();
  for (const id of matches) {
    visible.add(id);
    let at = byId.get(id)?.[field] ?? null;
    const seen = new Set<string>([id]);
    while (at && byId.has(at) && !seen.has(at)) {
      seen.add(at);
      visible.add(at);
      open.add(at);
      at = byId.get(at)![field];
    }
  }
  return { visible, open, matches };
}

/** One page of a list: which items, and how many pages there are. Pages count from 1. */
export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((at - 1) * size, at * size), page: at, pages };
}
