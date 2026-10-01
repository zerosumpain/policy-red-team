// Phase 22 — the door's cap on a snippet's grade: a row whose only source is
// a search excerpt is narrowed to weak and kept, never refused.
import { describe, expect, it } from 'vitest';
import { artefact } from './contracts';
import { triageArtefacts } from './validation';

const passage = artefact('passage_0001', 'passage', 'Page 3', 'Hubs will widen access in every council.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });

describe('a search excerpt cannot carry more than weak', () => {
  const excerpt = artefact('source_s5_000_rq_001_1', 'research_source', 'A council evaluation', 's', { questionId: 'q', retrievedAt: 'now', quality: 'q', qualityBasis: 'b', freshness: 'f', jurisdictionalRelevance: 'j', retrieval: 'search_excerpt', gap: 'g' });
  const full = artefact('source_s5_000_rq_001_2', 'research_source', 'The same, read', 's', { questionId: 'q', retrievedAt: 'now', quality: 'q', qualityBasis: 'b', freshness: 'f', jurisdictionalRelevance: 'j', retrieval: 'full_text', gap: 'g' });
  const claim = artefact('s1_000_claim', 'claim', 'Hubs widen access', 'c', { category: 'claim', notes: 'n' }, { refs: [passage.id] });
  const evidence = (id: string, sourceId: string, grade: string) => artefact(id, 'evidence', `Evidence ${id}`, 'e', {
    claimId: claim.id, mechanismId: null, actorId: null, assumptionId: null, sourceId, evidenceType: 't', result: 'supports', sourceQuality: 'q', relevance: 'r', freshness: 'f', dispute: 'd', grade,
  }, { refs: [sourceId, claim.id], sourceId, origin: 'external_evidence' });
  const before = [passage, claim, excerpt, full];

  it('narrows a snippet graded moderate or strong to weak, keeps the row and says so', () => {
    const triaged = triageArtefacts({ artefacts: [evidence('s6_000_evidence_001', excerpt.id, 'strong'), evidence('s6_000_evidence_002', excerpt.id, 'moderate')], warnings: [] }, 6, before);
    expect(triaged.rejected).toHaveLength(0);
    expect(triaged.artefacts.map((a) => a.data.grade)).toEqual(['weak', 'weak']);
    expect(triaged.warnings.find((w) => /lowered to weak/.test(w))).toMatch(/^2 evidence rows graded themselves above weak on a search excerpt alone/);
  });

  it('leaves a row read in full, or one already weak, as it was', () => {
    const triaged = triageArtefacts({ artefacts: [evidence('s6_000_evidence_001', full.id, 'strong'), evidence('s6_000_evidence_002', excerpt.id, 'weak')], warnings: [] }, 6, before);
    expect(triaged.artefacts.map((a) => a.data.grade)).toEqual(['strong', 'weak']);
    expect(triaged.warnings.join(' ')).not.toMatch(/lowered to weak/);
  });

  it('refuses a grade that is not on the ladder', () => {
    const triaged = triageArtefacts({ artefacts: [evidence('s6_000_evidence_001', full.id, 'excellent')], warnings: [] }, 6, before);
    expect(triaged.rejected[0]).toMatchObject({ code: 'contract', reason: expect.stringContaining('data.grade') });
  });
});

