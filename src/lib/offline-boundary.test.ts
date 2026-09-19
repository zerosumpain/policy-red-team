// THE OFFLINE PACK MUST NOT BE ABLE TO REACH THE ROUTER.
//
// `<Report>` renders twice: in the app, where every artefact name is a link into
// the drill, and inside the pack, where there is no router, no server and
// nothing behind a link. Rendering a react-router `<Link>` in the pack throws
// `useHref() may be used only in the context of a <Router>`, which takes the
// whole page down — the thing a reader opened precisely because they had no
// network to go and fix it with.
//
// The design already prevents it: `Report` takes a `linkTo` RENDER FUNCTION from
// its caller rather than an href and a flag, so the pack's bundle does not
// contain the machinery. That is a property of the import graph, and this test
// asserts it there — statically, in milliseconds — rather than leaving it to
// `npm run offline`, which is a real browser, a real build and forty seconds.
//
// Reading the built bundle instead would prove nothing: a minifier renames
// `useHref` and drops the message, so a grep can come back clean from a bundle
// that has the router in it.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ENTRY = path.join(ROOT, 'client/offline/entry.tsx');

/** Anything that only works with a router behind it. */
const FORBIDDEN = ['react-router', 'react-router-dom'];

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const isFile = (file: string) => {
  try { return statSync(file).isFile(); } catch { return false; }
};

function resolve(specifier: string, from: string): string | null {
  const base = specifier.startsWith('$lib/')
    ? path.join(ROOT, 'src/lib', specifier.slice('$lib/'.length))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) return null; // a package, not a file in this repo
  // A FILE, not merely something that exists. `'../govuk'` resolves to a
  // directory before it resolves to `../govuk/index.ts`, and reading it throws
  // EISDIR rather than returning nothing.
  return CANDIDATES.map((ext) => base + ext).find(isFile) ?? null;
}

/** Every `from '…'` in a module: static imports, re-exports and `import type`. */
function specifiersOf(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function reachable(entry: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    const specifiers = specifiersOf(readFileSync(file, 'utf8'));
    files.set(file, specifiers);
    for (const specifier of specifiers) {
      const next = resolve(specifier, file);
      if (next) queue.push(next);
    }
  }
  return files;
}

describe('the offline pack', () => {
  it('cannot reach react-router from anything it renders', () => {
    const graph = reachable(ENTRY);
    const offenders = [...graph]
      .filter(([, specifiers]) => specifiers.some((s) => FORBIDDEN.some((f) => s === f || s.startsWith(`${f}/`))))
      .map(([file]) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('is actually walking the graph, not passing because it found nothing', () => {
    // A guard that silently resolves no files passes for ever. The pack reaches
    // the report, the design system and the copied view layer; if it stops
    // doing so, this test has stopped meaning anything.
    const graph = [...reachable(ENTRY).keys()].map((f) => path.relative(ROOT, f));
    expect(graph).toContain('client/offline/entry.tsx');
    expect(graph).toContain('client/report/Report.tsx');
    expect(graph).toContain('client/govuk/Table.tsx');
    expect(graph).toContain('src/lib/policy-analysis/view.ts');
    expect(graph.length).toBeGreaterThan(15);
  });

  // The app half of the same boundary: the drill is where the links come from,
  // so if it ever stopped importing the router the report would quietly render
  // eighty names that are not links and nothing would fail.
  it('is not the whole app — the drill does use the router', () => {
    const drill = readFileSync(path.join(ROOT, 'client/pages/Drill.tsx'), 'utf8');
    expect(specifiersOf(drill)).toContain('react-router');
  });
});
