import { artefact, GROUNDING_DIGEST_CHARACTERS, GROUNDING_ROLE_LABELS, type Artefact } from './contracts';

/**
 * GROUNDING MATERIAL IN A RUN (phase 25) — pure, so the pipeline, the report
 * and the offline pack read it the same way.
 *
 * A grounding item is what the reader TRUSTS TO JUDGE THE POLICY BY: an impact
 * assessment, consultation responses, statistics, guidance, an evaluation. It
 * is ingested at stage 0 into its own kind, `grounding_passage`, under the id
 * prefix `g<n>_` — never `passage`, so nothing that asks "what did the paper
 * say" can be answered from it, and every check that a quote is the paper's
 * own words stays honest.
 *
 * Two shapes reach the model:
 *
 *   - IN FULL, at stage 6: one call per item, its passages as the call's own
 *     block beside the shared inventory, exactly as a research question is read
 *     with its sources. Quotes from it are verified against its text.
 *   - AS A DIGEST everywhere else it is declared (`STAGE_CONTEXT` 5, 10, 14, 15
 *     and 16): one short artefact per item — what it is, who published it, when,
 *     and how it opens — carrying the id of its first passage, so a later stage
 *     can cite it. Constant for the whole run, so it never moves a stage's
 *     cached prefix between calls.
 */

export type GroundingItem = {
  position: number;
  title: string;
  role: string;
  roleLabel: string;
  publisher: string | null;
  publishedOn: string | null;
  url: string | null;
  libraryId: string | null;
  truncated: boolean;
  passages: Artefact[];
  characters: number;
};

/** The grounding items this run read, in the order they were given. */
export function groundingItems(artefacts: Artefact[]): GroundingItem[] {
  const byPosition = new Map<number, GroundingItem>();
  for (const a of artefacts) {
    if (a.kind !== 'grounding_passage') continue;
    const d = a.data ?? {};
    const position = Number(d.groundingPosition) || 1;
    let item = byPosition.get(position);
    if (!item) {
      const role = String(d.groundingRole ?? 'other');
      item = {
        position, title: String(d.groundingTitle ?? 'Grounding material'), role, roleLabel: GROUNDING_ROLE_LABELS[role] ?? 'Something else',
        publisher: typeof d.publisher === 'string' && d.publisher ? d.publisher : null,
        publishedOn: typeof d.publishedOn === 'string' && d.publishedOn ? d.publishedOn : null,
        url: a.url ?? null, libraryId: typeof d.libraryId === 'string' ? d.libraryId : null,
        truncated: false, passages: [], characters: 0,
      };
      byPosition.set(position, item);
    }
    item.passages.push(a);
    item.characters += a.statement.length;
    if (d.truncated) item.truncated = true;
  }
  for (const item of byPosition.values()) item.passages.sort((a, b) => a.id.localeCompare(b.id));
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * ONE DIGEST PER ITEM, as the judging stages are given it. Kind and id are the
 * item's FIRST passage's, so the fitter ranks it as grounding and a stage that
 * cites it cites a real passage — `refs` resolve against the whole inventory,
 * which holds every grounding passage whether or not this call was shown it.
 */
export function groundingDigests(artefacts: Artefact[]): Artefact[] {
  return groundingItems(artefacts).map((item) => {
    const first = item.passages[0];
    const said = [item.roleLabel, item.publisher ? `published by ${item.publisher}` : null, item.publishedOn ? `dated ${item.publishedOn}` : null].filter(Boolean).join(', ');
    const opening = flat(item.passages.map((p) => p.statement).join(' '));
    const room = Math.max(200, GROUNDING_DIGEST_CHARACTERS - said.length - 120);
    const excerpt = opening.length > room ? `${opening.slice(0, room).replace(/\s+\S*$/, '')}…` : opening;
    const last = item.passages[item.passages.length - 1];
    return artefact(first.id, 'grounding_passage', item.title,
      `GROUNDING DIGEST — ${said}. ${item.passages.length} passage${item.passages.length === 1 ? '' : 's'} (${first.id}${last !== first ? ` to ${last.id}` : ''}), read in full by the evidence step. It opens: ${excerpt}`,
      { ...first.data, digest: true },
      { origin: 'external_evidence', confidence: null, url: first.url ?? null });
  });
}

/** Whether this run was given any grounding material at all. */
export function hasGrounding(artefacts: Artefact[]): boolean {
  return artefacts.some((a) => a.kind === 'grounding_passage');
}

/** The grounding item a passage, or a row that quotes one, belongs to. */
export function groundingOf(a: Artefact | undefined, byId: Map<string, Artefact>): Artefact | null {
  if (!a) return null;
  if (a.kind === 'grounding_passage') return a;
  for (const id of [a.sourceId, typeof a.data?.sourceId === 'string' ? a.data.sourceId : null, ...(a.refs ?? [])]) {
    const found = id ? byId.get(id) : undefined;
    if (found?.kind === 'grounding_passage') return found;
  }
  return null;
}

/** How many evidence rows lean on each grounding item, by item position. */
export function groundingUse(artefacts: Artefact[]): Map<number, number> {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const out = new Map<number, number>();
  for (const row of artefacts) {
    if (row.kind !== 'evidence') continue;
    const g = groundingOf(row, byId);
    if (!g) continue;
    const position = Number(g.data?.groundingPosition) || 1;
    out.set(position, (out.get(position) ?? 0) + 1);
  }
  return out;
}
