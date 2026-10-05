import { PASS_BASE, type Artefact } from '$lib/policy-analysis/contracts';
import { documentOf, partitionSet, setPassagesInOrder } from '$lib/policy-analysis/document-set';

/**
 * WHAT A REFUSED ITEM WAS, IN WORDS A READER CAN USE.
 *
 * A discard warning ends "Affected: s1_014_claim_002 (claim)". The item was
 * refused, so it was never stored, so the id resolves against nothing — and the
 * method page printed a column of them under the note that there was nothing
 * behind them to open. John, reading the Best Start run: "it names claims and
 * assertions by the IDs which mean nothing to the user."
 *
 * THE ID IS NOT NOTHING, THOUGH. Everything a model writes carries the
 * `s<n>_<slot>_` namespace its call was given (`pipeline.ts`, `send`), and in
 * step 1 there is one call per passage of the paper. So `s1_014_…` names the
 * passage that call was reading, and the passage has a page.
 *
 * SLOT 014 IS NOT PASSAGE 14. The slots are handed out over the passages step 1
 * ANALYSED, and `partitionFrontMatter` drops the cover, the contents and the
 * copyright page first. On the live Best Start run (44dd5420) pages 1, 2 and 44
 * were skipped, so slot 000 is page 3 and slot 014 is page 17 — read the slot
 * as a page number and every refused claim lands three pages early. Measured:
 * all 41 slots of that run, by the sibling rule below, sit exactly where the
 * recomputed partition puts them.
 *
 * TWO WAYS TO PLACE A SLOT, best first:
 *   1. its SIBLINGS — the items the same call wrote that WERE kept. Each cites
 *      its passage (`sourceId`, or a ref) and carries the page. This is what
 *      the run actually did, and it is the only rule that survives a shared
 *      copy, which withholds the passages themselves.
 *   2. the PARTITION, recomputed — `partitionFrontMatter` is pure and the
 *      passages are in the report. Only used for a slot whose every item was
 *      refused, and only for a slot inside the partition's length.
 *
 * And since phase 21 the warning records what the item SAID — its label and the
 * quote it gave — which `validation.ts`'s `discardWarning` writes and
 * `parseAffected` reads. Older runs have only the id and kind; they still read
 * by page.
 */

/** One item a discard warning named. Every field may be absent in an older run. */
export type RefusedItem = {
  id: string | null;
  kind: string | null;
  /** The item's own title, as the model wrote it. Phase 21 onward. */
  label: string | null;
  /** The span of the paper it said it rested on. Phase 21 onward. */
  quote: string | null;
};

/**
 * `s1_014_claim_002 (claim: “Families can…”; quoting “every family…”)`, or
 * the older `s1_014_claim_002 (claim)`. The curly quotes are the delimiter;
 * `saidText` takes them out of what goes between them, so a label can hold
 * commas and brackets without ending the entry.
 */
const ENTRY = /(item \d+|[^\s,()“”]+)\s+\(([^():“”]*?)(?::\s*“([^”]*)”(?:;\s*quoting\s*“([^”]*)”)?)?\)/g;
const MORE = /,?\s*and (\d+) more\.?\s*$/i;
const ID_LIKE = /^[A-Za-z]\w*_\w+$/;

/**
 * Everything after "Affected:" in a discard warning, as items.
 *
 * THREE SHAPES ARE IN THE WILD and all three read:
 *   - phase 21: `id (kind: “label”; quoting “quote”)`
 *   - every run before it: `id (kind)`
 *   - older still, and in upstream's tests: a bare comma list, of ids
 *     (`s1_001_edge_001, s1_002_edge_004`) or of labels (`Trust behaviour`).
 * A warning cut at the 1,000-character clamp ends mid-entry; the partial
 * entry simply does not match, and "and N more" is what counts it.
 */
export function parseAffected(tail: string): { items: RefusedItem[]; more: number } {
  const text = tail.trim();
  const moreMatch = MORE.exec(text);
  const more = moreMatch ? Number(moreMatch[1]) : 0;
  const body = moreMatch ? text.slice(0, moreMatch.index) : text.replace(/[.\s]+$/, '');
  const items: RefusedItem[] = [];
  for (const m of body.matchAll(ENTRY)) {
    items.push({
      id: m[1],
      kind: m[2].trim() || null,
      label: m[3]?.trim() || null,
      quote: m[4]?.trim() || null,
    });
  }
  if (items.length) return { items, more };
  for (const raw of body.split(',')) {
    const part = raw.trim().replace(/[.\s]+$/, '');
    if (!part) continue;
    items.push(ID_LIKE.test(part)
      ? { id: part, kind: null, label: null, quote: null }
      : { id: null, kind: null, label: part, quote: null });
  }
  return { items, more };
}

/** Where a step-1 call was reading: the passage, where the report holds it, and its page. */
export type Place = { page: number | null; passage: Artefact | null };

const STAGE_ONE = /^s1_(\d+)_/;

/**
 * Step 1's slots, placed on the paper. See the header for why there are two
 * rules and why the slot is never read as a page number.
 */
export function stageOnePlaces(artefacts: Artefact[]): Map<string, Place> {
  // DOCUMENT ORDER, NOT ID ORDER (phase 25): `d1_passage_0001` sorts before
  // `passage_0001`, and the pipeline numbers its slots main paper first. An
  // addendum's `m<n>_` passages were never stage 1's, and grounding is not a
  // `passage` at all.
  const passages = setPassagesInOrder(artefacts);
  const byId = new Map(passages.map((p) => [p.id, p]));
  const votes = new Map<string, Map<string, { n: number; page: number | null; passage: Artefact | null }>>();
  for (const a of artefacts) {
    const slot = STAGE_ONE.exec(a.id)?.[1];
    if (!slot) continue;
    const cited = [a.sourceId, ...a.refs].find((id): id is string => !!id && (byId.has(id) || /^(?:d\d+_)?passage_/.test(id)));
    const passage = cited ? byId.get(cited) ?? null : null;
    const page = passage?.page ?? a.page ?? null;
    if (!cited && page === null) continue;
    const key = cited ?? `page:${page}`;
    const tally = votes.get(slot) ?? new Map();
    const row = tally.get(key) ?? { n: 0, page, passage };
    row.n++;
    tally.set(key, row);
    votes.set(slot, tally);
  }
  const places = new Map<string, Place>();
  for (const [slot, tally] of votes) {
    const best = [...tally.values()].sort((x, y) => y.n - x.n)[0];
    places.set(slot, { page: best.page, passage: best.passage });
  }
  // The partition, for a slot none of whose items survived to say where it was.
  const { analyse } = partitionSet(passages);
  analyse.forEach((passage, index) => {
    const slot = String(index).padStart(3, '0');
    if (!places.has(slot)) places.set(slot, { page: passage.page ?? null, passage });
  });
  return places;
}

/** A step-1 item's place on the paper, or null for anything else. */
export function placeOf(id: string | null, places: Map<string, Place>): Place | null {
  const slot = id ? STAGE_ONE.exec(id)?.[1] : undefined;
  if (slot === undefined) return null;
  // `s1_14_` and `s1_014_` are the same call; the pipeline pads to three.
  return places.get(slot.padStart(3, '0')) ?? null;
}

/**
 * KIND NAMES A READER WOULD USE, singular and plural.
 *
 * Checked against `plain-words.ts`: "parts of the policy", not mechanisms;
 * "ways to beat the policy", not plays or exploits; "bodies and groups", not
 * actors. A kind not listed reads as its own name with underscores spaced —
 * never as an id.
 */
const NOUNS: Record<string, [string, string]> = {
  claim: ['claim', 'claims'],
  assumption: ['assumption', 'assumptions'],
  mechanism: ['part of the policy', 'parts of the policy'],
  edge: ['link between two things', 'links between two things'],
  actor: ['body or group', 'bodies and groups'],
  alias: ['other name for a body', 'other names for bodies'],
  profile: ['profile of a body', 'profiles of bodies'],
  research_question: ['question to look into', 'questions to look into'],
  research_source: ['source', 'sources'],
  evidence: ['piece of evidence', 'pieces of evidence'],
  exploit: ['way to beat the policy', 'ways to beat the policy'],
  finding: ['finding', 'findings'],
  recommendation: ['recommendation', 'recommendations'],
  persona_link: ['link to a known body', 'links to known bodies'],
  causal_chain: ['step in how it is meant to work', 'steps in how it is meant to work'],
  assurance_response: ['answer to a challenge', 'answers to challenges'],
  assurance_challenge: ['challenge', 'challenges'],
  key_judgement: ['key judgement', 'key judgements'],
  review_summary: ['review summary', 'review summaries'],
};

export function kindNoun(kind: string | null, count: number): string {
  if (!kind || kind === 'unknown') return count === 1 ? 'item' : 'items';
  const known = NOUNS[kind];
  if (known) return count === 1 ? known[0] : known[1];
  const word = kind.replaceAll('_', ' ');
  return count === 1 ? word : `${word}${word.endsWith('s') ? '' : 's'}`;
}

/** "2 claims and 1 assumption"; "8 profiles of bodies". Largest first. */
export function kindPhrase(kinds: { kind: string | null; count: number }[]): string {
  const parts = kinds
    .slice()
    .sort((a, b) => b.count - a.count)
    .map(({ kind, count }) => `${count} ${kindNoun(kind, count)}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A refused item, with the step whose warning named it. */
export type Named = RefusedItem & { ordinal: number | null; stage: string | null };

/**
 * ONE LINE OF THE DETAILS: a page, or a step.
 *
 * `page` groups say "N claims the model said were on page P"; `step` groups say
 * "N items from step S". `unnamed` counts the "and N more" a warning could not
 * fit, which have a step and nothing else — never a page, because the named
 * items of a warning need not share one.
 */
export type RefusedGroup = {
  key: string;
  where: 'page' | 'step';
  page: number | null;
  /** Which document the page is of, when the assessment read several (phase 25). */
  document?: string | null;
  passage: Artefact | null;
  ordinal: number | null;
  stage: string | null;
  kinds: { kind: string | null; count: number }[];
  items: Named[];
  unnamed: number;
};

const stageOfId = (id: string | null) => {
  const m = id ? /^s(\d+)_/.exec(id) : null;
  return m ? Number(m[1]) : null;
};

/**
 * Refused items grouped by where they came from: by page for step 1, where the
 * id names the passage; by step and kind for everything else. Pages in page
 * order, then steps in step order.
 */
export function groupRefused(
  named: Named[],
  unnamed: { ordinal: number | null; stage: string | null; count: number }[],
  places: Map<string, Place>,
): RefusedGroup[] {
  const groups = new Map<string, RefusedGroup>();
  const open = (key: string, seed: Omit<RefusedGroup, 'key' | 'kinds' | 'items' | 'unnamed'>) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, ...seed, kinds: [], items: [], unnamed: 0 };
      groups.set(key, group);
    }
    return group;
  };
  for (const item of named) {
    const place = placeOf(item.id, places);
    const ordinal = item.ordinal ?? stageOfId(item.id);
    // A PAGE OF WHICH DOCUMENT (phase 25): page 3 of the annex is not page 3
    // of the paper, and must not share its line. A passage of a one-document
    // run carries no title, so its lines read exactly as before.
    const doc = place?.passage ? documentOf(place.passage) : null;
    const group = place && place.page !== null
      ? open(`page:${doc?.position ?? 0}:${place.page}`, { where: 'page', page: place.page, document: doc?.title ?? null, passage: place.passage, ordinal: 1, stage: item.stage })
      : open(`step:${ordinal ?? '?'}:${item.kind ?? ''}`, { where: 'step', page: null, passage: null, ordinal, stage: item.stage });
    group.items.push(item);
    const row = group.kinds.find((k) => k.kind === item.kind);
    if (row) row.count++; else group.kinds.push({ kind: item.kind, count: 1 });
  }
  for (const rest of unnamed) {
    if (!rest.count) continue;
    const group = open(`more:${rest.ordinal ?? '?'}`, { where: 'step', page: null, passage: null, ordinal: rest.ordinal, stage: rest.stage });
    group.unnamed += rest.count;
  }
  const order = (g: RefusedGroup) => (g.where === 'page' ? [0, (g.passage ? documentOf(g.passage).position : 0) * 100_000 + (g.page ?? 0), 0] : [1, g.ordinal ?? 999, g.key.startsWith('more:') ? 1 : 0]);
  return [...groups.values()].sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.key.localeCompare(b.key);
  });
}

/**
 * One group as a sentence. The method page links the page to its passage, so
 * it builds the page line itself and takes `pageWords` for the text around it;
 * everywhere that cannot link takes the whole of this.
 */
export function pageWords(group: RefusedGroup): string {
  return `${kindPhrase(group.kinds)} the model said ${group.items.length === 1 ? 'was' : 'were'} on`;
}

/** "page 3", or "Annex A, page 3" when the assessment read several documents. */
export function pageName(group: RefusedGroup): string {
  return `${group.document ? `${group.document}, ` : ''}page ${group.page}`;
}

export function groupWords(group: RefusedGroup): string {
  if (group.where === 'page') return `${pageWords(group)} ${pageName(group)}`;
  if (group.unnamed) return `${group.unnamed} more ${stepPhrase(group.ordinal, group.stage)}, counted but not named by the run`;
  return `${kindPhrase(group.kinds)} ${stepPhrase(group.ordinal, group.stage)}`;
}

/**
 * A warning's "Affected: …" run, said in words — for the places that print a
 * warning's text whole, like "What it could not establish". Whatever comes
 * before "Affected:" is kept as it was; the ids after it never reach the page.
 * The items' own words follow their place in quotes, where the warning has them.
 */
export function affectedInWords(text: string, ordinal: number | null, stage: string | null, places: Map<string, Place>): string {
  const at = text.search(/\bAffected:/i);
  if (at < 0) return text;
  const { items, more } = parseAffected(text.slice(at + 'Affected:'.length));
  const groups = groupRefused(items.map((item) => ({ ...item, ordinal, stage })), [{ ordinal, stage, count: more }], places);
  if (!groups.length) return text;
  const said = (group: RefusedGroup) => {
    const words = group.items.map((item) => item.label).filter((label): label is string => !!label);
    return words.length ? `: ${words.map((w) => `“${w}”`).join(', ')}` : '';
  };
  return `${text.slice(0, at)}Affected: ${groups.map((group) => `${groupWords(group)}${said(group)}`).join('; ')}.`;
}

/**
 * "from step 5, Actor and incentive profiles" — or as much of that as is known.
 *
 * ONE MORE THAN THE ORDINAL, because that is how every other page counts: the
 * run's progress, the stopped-run banner and the ladder all print ordinal 0 —
 * document ingestion — as step 1. An `s4_` id is therefore step 5 here. A pass
 * ordinal (`PASS_BASE * n + k`) is not a step a reader has seen numbered.
 */
export function stepPhrase(ordinal: number | null, stage: string | null): string {
  const step = ordinal !== null && ordinal < PASS_BASE ? ordinal + 1 : null;
  if (step !== null && stage) return `from step ${step}, ${stage}`;
  if (step !== null) return `from step ${step}`;
  if (ordinal !== null && !stage) return 'from a later pass';
  if (stage) return `from ${stage}`;
  return 'from a step the run did not record';
}
