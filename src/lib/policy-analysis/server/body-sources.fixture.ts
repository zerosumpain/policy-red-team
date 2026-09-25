import { EVIDENCE_TTL_MS, type BodyEvidenceRecord } from '../body-evidence';
import type { SourceAnswer, SourceBody, SourceOptions } from './body-sources';

/**
 * PUBLIC RECORDS THE FIXTURE BUILD CANNOT FETCH.
 *
 * The same shape as `body-sources.ts`, with no address in it. `build.mjs`
 * redirects the real module here in both fixture bundles and then asserts that
 * none of the three API addresses survives — exactly as `tavily.fixture.ts`
 * stands in for the search service. The sources are free, so this is not about
 * money: a fixture run must not depend on a network it cannot promise.
 *
 * It answers with two records per body rather than none, so the browser walk
 * exercises the whole path — the store, the run, the body's page — and each
 * says in its own title that it is a fixture. The links go to the body's own
 * GOV.UK page, which is the one address the register already holds.
 */
export async function fetchBodySources(body: SourceBody, options: SourceOptions = {}): Promise<SourceAnswer[]> {
  const now = options.now ?? new Date();
  const page = body.slug ? `https://www.gov.uk/government/organisations/${body.slug}` : 'https://www.gov.uk/government/organisations';
  const stamp = { retrievedAt: now.toISOString(), expiresAt: new Date(now.getTime() + EVIDENCE_TTL_MS).toISOString() };
  const record = (over: Partial<BodyEvidenceRecord> & Pick<BodyEvidenceRecord, 'source' | 'question' | 'title' | 'url'>): BodyEvidenceRecord => ({
    bodyId: body.id, sourceKind: 'fixture', publisher: 'Fixture', publishedAt: '2026-03-31T00:00:00.000Z', excerpt: null, ...stamp, ...over,
  });
  const wanted = options.sources ?? ['govuk', 'committees', 'hansard'];
  return wanted.map((source) => ({
    source,
    error: null,
    skipped: source === 'hansard' ? 'This build cannot reach Parliament.' : null,
    records: source === 'govuk'
      ? [record({ source, question: 'capacity', title: `${body.name}: annual report and accounts (fixture record)`, url: `${page}#fixture-annual-report`, sourceKind: 'corporate_report', excerpt: 'A fixture record. This build cannot reach GOV.UK.' })]
      : source === 'committees'
        ? [record({ source, question: 'track_record', title: `${body.name}: a committee report on its work (fixture record)`, url: `${page}#fixture-committee-report`, sourceKind: 'Report', publishedAt: '2025-11-12T00:00:00.000Z' })]
        : [],
  }));
}
