import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyDocuments } from '$lib/db/schema';
import { MAX_CHARACTERS, MAX_PAGES, type Artefact } from '../contracts';
import { PolicyError } from '../validation';
import { ingest } from './ingest';
import { unsealRow, type Seal } from './seal';

/**
 * STAGE 0 FOR A SET OF DOCUMENTS (phase 25).
 *
 * Each document is extracted by the same `ingest()` the one paper always went
 * through, under its own id prefix — '' for document 0, so a one-document run
 * mints exactly the ids it always did — with its title, role and position on
 * every passage, which is how prompt 1 is told which document a passage is
 * from without the cached system prompt changing by a byte.
 *
 * THE CAPS ARE TOTALS. `MAX_CHARACTERS` and `MAX_PAGES` were per document,
 * and every budget downstream — stage 1's one call per passage, the stage
 * clock, the call ceiling — was sized on one document that large. A set of
 * six documents each just under the cap would have been six times what any of
 * those were sized for, so the set is held to what one document was.
 */
export async function ingestDocumentSet(analysisId: string, seal: Seal): Promise<{ artefacts: Artefact[]; warnings: string[]; documents: { id: string; text: string; metadata: unknown }[] }> {
  const rows = (await db.select({ id: policyDocuments.id, content: policyDocuments.content, filename: policyDocuments.filename, mimeType: policyDocuments.mimeType, title: policyDocuments.title, position: policyDocuments.position, role: policyDocuments.role, idPrefix: policyDocuments.idPrefix })
    .from(policyDocuments).where(eq(policyDocuments.analysisId, analysisId)).orderBy(asc(policyDocuments.position)))
    .map((row) => unsealRow(seal, 'document', row));
  if (!rows.length) throw new PolicyError('extraction', 'This assessment has no document to read.');
  const multi = rows.length > 1;
  const artefacts: Artefact[] = [];
  const warnings: string[] = [];
  const documents: { id: string; text: string; metadata: unknown }[] = [];
  let characters = 0;
  let pages = 0;
  for (const row of rows) {
    const title = row.title?.trim() || row.filename;
    // A ONE-DOCUMENT RUN IS LEFT EXACTLY AS IT WAS: no title at the head of
    // its labels and nothing new in its passages' data, so it reads, caches
    // and hashes as every run before this phase did.
    const extracted = await ingest(Buffer.from(row.content, 'base64'), row.filename, row.mimeType, row.idPrefix, multi
      ? { labelPrefix: title, data: { documentTitle: title.slice(0, 300), documentRole: row.role, documentPosition: row.position, documentCount: rows.length } }
      : {});
    characters += extracted.text.length;
    const meta = extracted.metadata as { kind?: string; pages?: unknown[] } | null;
    pages += Array.isArray(meta?.pages) ? meta!.pages!.length : 0;
    if (characters > MAX_CHARACTERS) throw new PolicyError('extraction', `These documents hold more than ${MAX_CHARACTERS / 1000},000 characters of text between them, which is the limit for one assessment — roughly ${Math.round(MAX_CHARACTERS / 3000)} pages. Assess them in parts; the cross-policy stage will compare them against each other.`);
    if (pages > MAX_PAGES) throw new PolicyError('extraction', `These documents have more than ${MAX_PAGES} pages between them, which is the limit for one assessment. Assess them in parts; the cross-policy stage will compare them against each other.`);
    artefacts.push(...extracted.artefacts);
    warnings.push(...extracted.warnings.map((w) => (multi ? `${title}: ${w}` : w)));
    documents.push({ id: row.id, text: extracted.text, metadata: extracted.metadata });
  }
  return { artefacts, warnings, documents };
}
