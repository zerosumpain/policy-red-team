import type { Artefact } from '$lib/policy-analysis/contracts';
import { whatItIs } from '$lib/policy-analysis/plain';

/**
 * THE PAPER'S OWN NAMES, DEFINED — a glossary per assessment (phase 23, P4).
 *
 * "Best Start Family Service", "Family Hubs", "the core offer": a reader who
 * has never read the paper meets these in every play and is never told what
 * they are. Stage 1 now writes `whatItIs` on every part of the policy, and
 * stage 2 may write one on a resolved body (another stream of this phase adds
 * it; read here as optional, so its absence costs only the definition). This
 * folds them into one list the report can define a term from on tap.
 *
 * Nothing is invented: a term with no `whatItIs` is not in the glossary, so an
 * older run has an empty one and every page reads exactly as before.
 */
export type PolicyTerm = { term: string; definition: string; id: string; kind: string };

/** The most terms one assessment defines — a cap on a model-produced list. */
export const MAX_TERMS = 200;

/**
 * A name worth defining: long enough not to match inside ordinary words, short
 * enough to be a name rather than a sentence the model used as a label.
 */
const usable = (label: string) => label.length >= 4 && label.length <= 70 && label.split(/\s+/).length <= 8;

export function policyTerms(artefacts: Artefact[]): PolicyTerm[] {
  const seen = new Set<string>();
  const out: PolicyTerm[] = [];
  // Parts of the policy first, then resolved bodies (`s2_`): a mention from
  // stage 1 is the same body seen once, and would define it twice.
  const sources = [
    ...artefacts.filter((a) => a.kind === 'mechanism'),
    ...artefacts.filter((a) => a.kind === 'actor' && a.id.startsWith('s2_')),
  ];
  for (const a of sources) {
    const term = String(a.label ?? '').trim();
    const definition = whatItIs(a);
    const key = term.toLowerCase();
    if (!definition || !usable(term) || seen.has(key)) continue;
    // A definition that only restates the name defines nothing.
    if (definition.toLowerCase() === key) continue;
    seen.add(key);
    out.push({ term, definition, id: a.id, kind: a.kind });
    if (out.length >= MAX_TERMS) break;
  }
  return out.sort((x, y) => x.term.localeCompare(y.term));
}

export type TermPiece = string | { text: string; term: PolicyTerm };

/**
 * A FINDER over the glossary: one regular expression, longest name first, so
 * "Family Hubs network" wins over "Family Hubs". Whole words, any case.
 */
export type TermFinder = { terms: PolicyTerm[]; byKey: Map<string, PolicyTerm>; pattern: RegExp | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function termFinder(terms: PolicyTerm[]): TermFinder {
  const byKey = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
  const names = [...byKey.keys()].sort((a, b) => b.length - a.length).map(escape);
  return { terms, byKey, pattern: names.length ? new RegExp(`(?<![\\w-])(${names.join('|')})(?![\\w-])`, 'gi') : null };
}

/**
 * Split a sentence into text and defined terms: the FIRST mention of each term
 * only, and at most `max` per sentence, because a sentence that is half
 * buttons is harder to read than the one it replaced.
 */
export function splitTerms(text: string, finder: TermFinder | null, max = 3): TermPiece[] {
  if (!finder?.pattern || !text) return [text];
  const pieces: TermPiece[] = [];
  const used = new Set<string>();
  let at = 0;
  for (const match of text.matchAll(finder.pattern)) {
    const key = match[0].toLowerCase();
    const term = finder.byKey.get(key);
    if (!term || used.has(key) || used.size >= max) continue;
    used.add(key);
    if (match.index! > at) pieces.push(text.slice(at, match.index));
    pieces.push({ text: match[0], term });
    at = match.index! + match[0].length;
  }
  if (at < text.length) pieces.push(text.slice(at));
  return pieces.length ? pieces : [text];
}
