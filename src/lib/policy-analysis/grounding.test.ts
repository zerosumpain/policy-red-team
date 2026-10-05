import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { documentCount, documentSet, partitionSet, setPassagesInOrder, wherePlace } from './document-set';
import { groundingDigests, groundingItems, groundingOf } from './grounding';
import { documentShingles, quotesDocument } from './query-guard';
import { hasSource, triageArtefacts } from './validation';
import { evidenceReadLine, gradeOf } from '$lib/evidence-grade';
import { paperWording, groundingWording } from '$lib/provenance';
import { stageOnePlaces, placeOf } from '$lib/refused';

const long = (words: string) => `${words} `.repeat(12).trim();
const passage = (id: string, statement: string, doc?: { position: number; title: string }, page = 1) =>
  artefact(id, 'passage', `${doc ? `${doc.title} · ` : ''}Page ${page} · passage 1`, statement, { documentHash: 'h', ...(doc ? { documentTitle: doc.title, documentRole: doc.position ? 'part' : 'main', documentPosition: doc.position, documentCount: 2 } : {}) }, { origin: 'extracted_fact', page, section: `Page ${page}` });
const grounding = (id: string, position: number, statement: string) =>
  artefact(id, 'grounding_passage', `Text · passage 1`, statement, { documentHash: 'g', groundingTitle: `Item ${position}`, groundingRole: 'statistics', groundingPosition: position }, { origin: 'external_evidence', page: 3, section: 'Page 3' });

describe('several documents in one assessment', () => {
  const main = [1, 2, 3].map((n) => passage(`passage_000${n}`, long(`The council delivers part ${n} of the programme.`), { position: 0, title: 'White paper' }, n));
  const annex = [1, 2, 3].map((n) => passage(`d1_passage_000${n}`, long(`The annex costs part ${n}.`), { position: 1, title: 'Annex A' }, n));
  const all = [...annex, ...main];

  it('orders the set by document, not by id — d1_ sorts before passage_', () => {
    expect(setPassagesInOrder(all).map((p) => p.id)).toEqual([...main, ...annex].map((p) => p.id));
    expect(documentSet(all).map((d) => d.title)).toEqual(['White paper', 'Annex A']);
    expect(documentCount(all)).toBe(2);
  });

  it('places stage-1 slots on the right document, so an annex finding is not on the paper’s pages', () => {
    const fromAnnex = artefact('s1_004_claim', 'claim', 'A claim', 'x', {}, { sourceId: 'd1_passage_0002', refs: ['d1_passage_0002'] });
    const places = stageOnePlaces([...all, fromAnnex]);
    expect(placeOf('s1_004_claim', places)?.passage?.id).toBe('d1_passage_0002');
    // Slot 0 is the main paper's first passage whatever the ids sort as.
    expect(placeOf('s1_000_x', places)?.passage?.id).toBe('passage_0001');
  });

  it('finds front matter per document', () => {
    const cover = passage('d1_passage_0000', 'Annex A', { position: 1, title: 'Annex A' }, 1);
    const { skipped } = partitionSet([...all, cover]);
    expect(skipped.map((s) => [s.id, s.document])).toEqual([['d1_passage_0000', 'Annex A']]);
  });

  it('names the document in a citation when there are several, and not when there is one', () => {
    const claim = artefact('s1_004_claim', 'claim', 'A claim', 'x', {}, { sourceId: 'd1_passage_0002', page: 2, section: 'Page 2' });
    const byId = new Map(all.map((a) => [a.id, a]));
    expect(wherePlace(claim, byId, 2)).toBe('Annex A · Page 2');
    expect(wherePlace(claim, byId, 1)).toBe('Page 2');
  });
});

describe('grounding material', () => {
  const paper = passage('passage_0001', long('The council delivers the programme with existing staff.'));
  const g1 = grounding('g1_passage_0001', 1, 'Councils reported 1,240 vacancies in advice posts in 2025. Vacancy rates were highest in rural areas.');
  const claim = artefact('s1_000_claim', 'claim', 'Existing staff suffice', 'x', { category: 'claim', notes: 'n' }, { origin: 'extracted_fact', sourceId: paper.id, sourceQuote: 'existing staff', refs: [paper.id] });
  const assumption = artefact('s1_000_assumption', 'assumption', 'Capacity', 'x', { importance: 1, uncertainty: 1, consequence: 1, notes: 'n' }, { refs: [claim.id] });
  const prior = [paper, g1, claim, assumption];
  const row = (quote: string, grade = 'moderate') => artefact('s6_000_evidence', 'evidence', 'Vacancies', 'x',
    { claimId: claim.id, mechanismId: null, actorId: null, assumptionId: null, sourceId: g1.id, evidenceType: 'statistics', result: 'contradicts', sourceQuality: 'Official statistics.', relevance: 'Direct', freshness: '2025', dispute: 'None', grade },
    { origin: 'external_evidence', sourceId: g1.id, sourceQuote: quote, refs: [claim.id, g1.id] });

  it('verifies a quotation against the grounding text, and refuses one it cannot find', () => {
    const good = triageArtefacts({ artefacts: [row('Councils reported 1,240 vacancies in advice posts in 2025.')], warnings: [] }, 6, prior);
    expect(good.artefacts).toHaveLength(1);
    expect(good.artefacts[0].startOffset).not.toBeNull();
    expect(good.artefacts[0].page).toBe(3);
    const bad = triageArtefacts({ artefacts: [row('Councils reported no vacancies at all.')], warnings: [] }, 6, prior);
    expect(bad.artefacts).toHaveLength(0);
    expect(bad.warnings.join(' ')).toContain('grounding material could not be found');
  });

  it('is never the paper: an extracted fact cannot quote it', () => {
    const fake = { ...row('Councils reported 1,240 vacancies in advice posts in 2025.'), origin: 'extracted_fact' as const };
    expect(triageArtefacts({ artefacts: [fake], warnings: [] }, 6, prior).artefacts).toHaveLength(0);
    expect(paperWording(row('Councils reported 1,240 vacancies'))).toBeNull();
    expect(groundingWording(row('Councils reported 1,240 vacancies'))).toBe('Councils reported 1,240 vacancies');
  });

  it('is ground, read in full, and graded on what it is', () => {
    const byId = new Map([...prior.map((a) => [a.id, a] as const)]);
    const r = row('Councils reported 1,240 vacancies in advice posts in 2025.', 'strong');
    byId.set(r.id, r);
    expect(hasSource(r.id, byId)).toBe(true);
    expect(gradeOf(r, byId).grade).toBe('strong');
    expect(groundingOf(r, byId)?.id).toBe(g1.id);
    expect(evidenceReadLine(prior)).toBeNull();
  });

  it('keeps its text out of search queries, as the paper is kept out', () => {
    expect(quotesDocument('councils reported 1 240 vacancies in advice posts', documentShingles(prior))).toBe(true);
  });

  it('reaches the judging stages as one digest per item, citing its first passage', () => {
    const g2 = grounding('g1_passage_0002', 1, 'More text.');
    const items = groundingItems([g2, g1]);
    expect(items).toHaveLength(1);
    expect(items[0].passages.map((p) => p.id)).toEqual(['g1_passage_0001', 'g1_passage_0002']);
    const [digest] = groundingDigests([g1, g2]);
    expect(digest.id).toBe('g1_passage_0001');
    expect(digest.data.digest).toBe(true);
    expect(digest.statement).toContain('GROUNDING DIGEST');
    expect(digest.statement).toContain('g1_passage_0002');
    expect(digest.statement.length).toBeLessThan(1000);
  });
});

describe('document set hash', () => {
  it('is the document’s own digest for one, and order-free for several', async () => {
    const { documentSetHash } = await import('./server/set-hash');
    expect(documentSetHash(['a'.repeat(64)])).toBe('a'.repeat(64));
    expect(documentSetHash(['a', 'b'])).toBe(documentSetHash(['b', 'a']));
    expect(documentSetHash(['a', 'b'])).not.toBe(documentSetHash(['a']));
  });
});

// Keeps the helper's unused-kind import honest under `noUnusedLocals`.
export type _A = Artefact;
