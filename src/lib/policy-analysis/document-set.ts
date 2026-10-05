import type { Artefact } from './contracts';
import { partitionFrontMatter, type SkippedPage } from './front-matter';

/**
 * SEVERAL DOCUMENTS IN ONE ASSESSMENT (phase 25) — which document a passage,
 * or a quotation of one, belongs to.
 *
 * Pure, and imported by the pipeline, the report and the offline pack alike,
 * so "which document" has one answer everywhere it is asked.
 *
 * THE ID IS THE FALLBACK, NOT THE SOURCE. A passage of a run made since this
 * phase carries `documentPosition`, `documentTitle` and `documentRole` in its
 * data. Document 0 keeps the empty id prefix — so every passage stored before
 * this phase still reads `passage_0001` and is document 0 by default — and the
 * others are minted under `d<n>_`, which is what this falls back to for a
 * quotation whose passage is not in hand (a shared copy withholds them).
 *
 * `m<n>_` passages are material attached AFTER the report (an addendum), and
 * `g<n>_` is grounding material (`grounding_passage`, never `passage`). Neither
 * is part of the document set and neither is "the paper".
 */

const SET_PREFIX = /^d(\d+)_passage_/;
const MATERIAL_PREFIX = /^m\d+_/;
const GROUNDING_PREFIX = /^g(\d+)_passage_/;

export type DocumentRef = { position: number; title: string | null; role: string | null };

/** A passage id that belongs to grounding material rather than to the paper. */
export function isGroundingId(id: string | null | undefined): boolean {
  return !!id && GROUNDING_PREFIX.test(id);
}

/** A passage of the documents under assessment: not an addendum's, not grounding. */
export function isSetPassage(a: Artefact): boolean {
  return a.kind === 'passage' && !MATERIAL_PREFIX.test(a.id);
}

/** Which document of the set a passage id belongs to, read off the id alone. */
export function positionOfId(id: string): number {
  const m = SET_PREFIX.exec(id);
  return m ? Number(m[1]) : 0;
}

/** Which document of the set this passage belongs to. Document 0 is the main paper. */
export function documentOf(passage: Artefact): DocumentRef {
  const d = passage.data ?? {};
  const position = Number.isInteger(d.documentPosition) ? Number(d.documentPosition) : positionOfId(passage.id);
  return {
    position,
    title: typeof d.documentTitle === 'string' && d.documentTitle.trim() ? d.documentTitle.trim() : null,
    role: typeof d.documentRole === 'string' ? d.documentRole : null,
  };
}

/**
 * The documents this assessment read, in order, from its passages. A run from
 * before this phase has one, untitled. Only what the passages say — a shared
 * copy, which has none, has an empty set.
 */
export function documentSet(artefacts: Artefact[]): DocumentRef[] {
  const byPosition = new Map<number, DocumentRef>();
  for (const a of artefacts) {
    if (!isSetPassage(a)) continue;
    const doc = documentOf(a);
    if (!byPosition.has(doc.position) || (!byPosition.get(doc.position)!.title && doc.title)) byPosition.set(doc.position, doc);
  }
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

/**
 * How many documents the set holds. A passage records the count it was ingested
 * with, so a SHARED copy — which has no passages, only quotations — can still
 * tell a multi-document run from a single paper: the `d<n>_` source ids say so.
 */
export function documentCount(artefacts: Artefact[]): number {
  let most = 0;
  for (const a of artefacts) {
    if (isSetPassage(a)) {
      const stated = Number(a.data?.documentCount);
      most = Math.max(most, Number.isFinite(stated) ? stated : 0, documentOf(a).position + 1);
    } else if (a.sourceId && SET_PREFIX.test(a.sourceId)) {
      most = Math.max(most, positionOfId(a.sourceId) + 1);
    }
  }
  return Math.max(1, most);
}

/**
 * The passages the paper's decomposition reads, IN DOCUMENT ORDER: the main
 * paper first, then each further document, each in its own passage order.
 *
 * Sorting by id put `d1_passage_0001` before `passage_0001` — "d" sorts before
 * "p" — and stage 1's call slots are numbered in THIS order, so a report that
 * placed a slot by sorting ids would have put every annex finding on the main
 * paper's pages. Both the pipeline and `stageOnePlaces` read it from here.
 */
export function setPassagesInOrder(artefacts: Artefact[]): Artefact[] {
  return artefacts.filter(isSetPassage)
    .map((a) => ({ a, position: documentOf(a).position }))
    .sort((x, y) => x.position - y.position || x.a.id.localeCompare(y.a.id))
    .map(({ a }) => a);
}

/**
 * FRONT MATTER IS FOUND PER DOCUMENT. An annex has a cover and a contents list
 * of its own, and the "almost everything looked like front matter" safety net
 * must not be tripped — or masked — by another document's pages.
 */
export function partitionSet(artefacts: Artefact[]): { analyse: Artefact[]; skipped: (SkippedPage & { document: string | null })[]; distrusted: string[]; total: number } {
  const ordered = setPassagesInOrder(artefacts);
  const groups = new Map<number, Artefact[]>();
  for (const p of ordered) {
    const position = documentOf(p).position;
    groups.set(position, [...(groups.get(position) ?? []), p]);
  }
  const multi = groups.size > 1;
  const analyse: Artefact[] = [];
  const skipped: (SkippedPage & { document: string | null })[] = [];
  const distrusted: string[] = [];
  for (const [position, passages] of [...groups].sort((a, b) => a[0] - b[0])) {
    const part = partitionFrontMatter(passages);
    analyse.push(...part.analyse);
    const title = documentOf(passages[0]).title ?? (position === 0 ? 'the main paper' : `document ${position + 1}`);
    skipped.push(...part.skipped.map((s) => ({ ...s, document: multi ? title : null })));
    if (part.distrusted) distrusted.push(title);
  }
  return { analyse, skipped, distrusted, total: ordered.length };
}

/** The passage a quotation names, and so the document it is from. */
export function sourceDocument(a: Artefact, byId: Map<string, Artefact>): DocumentRef | null {
  if (isSetPassage(a)) return documentOf(a);
  const id = a.sourceId;
  if (!id || MATERIAL_PREFIX.test(id) || isGroundingId(id)) return null;
  const passage = byId.get(id);
  if (passage && isSetPassage(passage)) return documentOf(passage);
  return { position: positionOfId(id), title: null, role: null };
}

/** A document's name for a reader: its title, else "the main paper" or "document N". */
export function documentName(doc: DocumentRef): string {
  return doc.title ?? (doc.position === 0 ? 'Main paper' : `Document ${doc.position + 1}`);
}

/**
 * WHERE IN THE PAPER, NAMING THE DOCUMENT WHEN THERE IS MORE THAN ONE.
 *
 * "Page 12" means nothing in a set of three PDFs whose pages each start at 1.
 * One document: exactly the old wording, so every report of a single paper
 * reads as it did. Several: "Annex A: costings · Page 12 · Funding".
 *
 * The section is dropped when it only repeats the page, which a PDF makes the
 * common case: an extractor with no headings names each section after its page.
 */
export function wherePlace(a: Artefact, byId: Map<string, Artefact>, count: number): string {
  const page = a.page ? `Page ${a.page}` : null;
  const section = a.section?.trim() || null;
  const parts = [page, page && section && section.toLowerCase() === page.toLowerCase() ? null : section];
  if (count > 1) {
    const doc = sourceDocument(a, byId);
    if (doc) parts.unshift(documentName(doc));
  }
  return parts.filter(Boolean).join(' · ');
}

/** "Annex A, page 12" or "page 12": the short form a quotation's caption uses. */
export function pageCaption(a: Pick<Artefact, 'page' | 'sourceId' | 'kind' | 'id' | 'data'>, byId: Map<string, Artefact>, count: number): string {
  const doc = count > 1 ? sourceDocument(a as Artefact, byId) : null;
  return [doc ? documentName(doc) : null, a.page ? `page ${a.page}` : null].filter(Boolean).join(', ');
}

/** Document order, then page: how a reader checking the paper reads it front to back. */
export function documentOrder(a: Artefact, byId: Map<string, Artefact>): number {
  return sourceDocument(a, byId)?.position ?? 0;
}
