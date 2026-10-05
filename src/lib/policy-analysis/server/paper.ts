import { and, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '$lib/db';
import { policyAnalyses, policyDocuments } from '$lib/db/schema';

/**
 * Every analysis that is the SAME PAPER as this one (phase 25), itself
 * included: the same `paper_key`, or any document of the set in common. The
 * one rule behind "seen in N papers", the neighbours' exclusion and the
 * persona library's `sameDocument`.
 */
export async function samePaper(analysisId: string, tx: DbExecutor = db): Promise<Set<string>> {
  const out = new Set([analysisId]);
  const [mine] = await tx.select({ owner: policyAnalyses.owner, key: policyAnalyses.paperKey }).from(policyAnalyses).where(eq(policyAnalyses.id, analysisId)).limit(1);
  if (!mine) return out;
  if (mine.key) for (const row of await tx.select({ id: policyAnalyses.id }).from(policyAnalyses).where(and(eq(policyAnalyses.owner, mine.owner), eq(policyAnalyses.paperKey, mine.key)))) out.add(row.id);
  const shas = (await tx.select({ sha256: policyDocuments.sha256 }).from(policyDocuments).where(eq(policyDocuments.analysisId, analysisId))).map((r) => r.sha256);
  if (shas.length) {
    const rows = await tx.select({ analysisId: policyDocuments.analysisId }).from(policyDocuments)
      .innerJoin(policyAnalyses, eq(policyAnalyses.id, policyDocuments.analysisId))
      .where(and(eq(policyAnalyses.owner, mine.owner), inArray(policyDocuments.sha256, shas)));
    for (const row of rows) out.add(row.analysisId);
  }
  return out;
}

/**
 * One key per analysis for counting PAPERS (phase 25): its `paper_key`, else
 * its own id. Replaces a join on `policy_documents`, which returns one row per
 * DOCUMENT now that a run may have several, and so would have counted an
 * assessment of a paper and its annex as two papers.
 */
export async function paperKeys(analysisIds: string[], tx: DbExecutor = db): Promise<Map<string, string>> {
  if (!analysisIds.length) return new Map();
  const rows = await tx.select({ id: policyAnalyses.id, key: policyAnalyses.paperKey }).from(policyAnalyses).where(inArray(policyAnalyses.id, analysisIds));
  return new Map(rows.map((r) => [r.id, r.key ?? r.id]));
}
