import { assertPublicUrl } from '$lib/server/ssrf-guard';
import {
  committeeRecords, govukRecords, GOVUK_KINDS, hansardRecords, PER_SOURCE, searchTerm,
  type BodyEvidenceRecord, type EvidenceSource,
} from '../body-evidence';

/**
 * THREE FREE, KEYLESS SOURCES OF PUBLIC RECORD ABOUT A BODY.
 *
 * Each verified by fetching it on 25 September 2026 (see docs/phase-19.md):
 *
 *   govuk       GOV.UK search, filtered to the body's organisation slug and to
 *               the kinds of document that say something about it — corporate
 *               and independent reports, research, policy papers, consultation
 *               outcomes, impact assessments, statutory guidance. Newest first.
 *   committees  Parliament's committees API: reports, special reports and
 *               responses whose title names the body. Newest first.
 *   hansard     Hansard: debates whose title names the body. Newest first.
 *
 * legislation.gov.uk was tried and left out: its search is by an Act's title,
 * and a body's name is rarely in the title of the Act that set it up, so it
 * returned nothing for most bodies and the wrong Act for some.
 *
 * NO MODEL, NO KEY, NO MONEY. The query is the register's slug or the
 * register's official name — never anything from a paper — and `searchTerm`
 * runs the document guard over the name anyway.
 *
 * THROUGH THE PROCESS'S OWN `fetch`, never a client of its own: phase 18
 * measured that importing `undici` replaces the proxy-aware dispatcher with
 * one that goes straight to the origin. The server and `npm run research:bodies`
 * both import `$lib/llm/providers/transport` first, which installs the
 * proxy-aware one.
 *
 * NOT IN EITHER FIXTURE BUNDLE. `build.mjs` swaps this module for
 * `body-sources.fixture.ts` and then asserts that none of the three API
 * addresses below survives in the fixture bytes — which is why each is ONE
 * literal: built from pieces it would never appear in the bundle, and the
 * check would pass whatever was bundled.
 */
export const GOVUK_SEARCH_API = 'https://www.gov.uk/api/search.json?';
export const COMMITTEES_API = 'https://committees-api.parliament.uk/api/Publications?';
export const HANSARD_API = 'https://hansard-api.parliament.uk/search/debates.json?';

/** The only hosts this module will ask, whatever a caller passes. */
const API_HOSTS = new Set(['www.gov.uk', 'committees-api.parliament.uk', 'hansard-api.parliament.uk']);

/**
 * A body as the sources need it: its register id, its GOV.UK slug and its
 * official name. `registered` says the name IS the register's own, checked
 * against the register by the caller — see `sourceUrls`.
 */
export type SourceBody = { id: string; slug: string | null; name: string; registered?: boolean };

/**
 * What one source said about one body. `records` is empty on an error or a
 * skip. `guarded` marks a skip the paper guard caused: a fact about the paper a
 * run was reading, never about the body, so it must not be stored as an answer.
 */
export type SourceAnswer = { source: EvidenceSource; records: BodyEvidenceRecord[]; error: string | null; skipped: string | null; guarded?: boolean };

export type SourceFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type SourceOptions = {
  fetch?: SourceFetch;
  /** The URL guard. The SSRF guard by default; a test passes its own rather than resolve DNS. */
  guard?: (url: string) => Promise<unknown>;
  signal?: AbortSignal;
  /** Shingles of the document a run is reading, so a name that quotes it is not sent. Empty outside a run. */
  corpus?: Set<string>;
  now?: Date;
  sources?: readonly EvidenceSource[];
};

/**
 * Each source's address for one body, or why it is not asked.
 *
 * THE REGISTER'S OWN NAME IS NOT PAPER TEXT. The document guard exists so a
 * paper's distinctive wording never reaches somebody else's query log — but a
 * register body's official name came from GOV.UK, and a paper that names the
 * Department for Science, Innovation and Technology in full is quoting the
 * register, not the other way round. 96 live register bodies have names of six
 * words or more, and each was blocked for every owner for thirty days whenever
 * a paper spelt it out. So a `registered` name is sent as it is; anything else
 * is still guarded.
 */
export function sourceUrls(body: SourceBody, corpus: Set<string> = new Set()): Record<EvidenceSource, string | { skipped: string; guarded: boolean }> {
  const term = searchTerm(body.name, body.registered ? new Set() : corpus);
  // Whether it was the GUARD that refused the name, rather than the name being unusable.
  const guarded = !term && searchTerm(body.name) !== null;
  const govuk = new URLSearchParams();
  if (body.slug) {
    govuk.set('filter_organisations', body.slug);
    for (const kind of GOVUK_KINDS) govuk.append('filter_content_store_document_type[]', kind);
    govuk.set('order', '-public_timestamp');
    govuk.set('count', String(PER_SOURCE));
    for (const field of ['title', 'link', 'public_timestamp', 'description', 'content_store_document_type']) govuk.append('fields[]', field);
  }
  const committees = new URLSearchParams();
  const hansard = new URLSearchParams();
  if (term) {
    committees.set('SearchTerm', term);
    // Report, Government Response, Special Report. Correspondence, minutes and
    // agendas are left out: they are most of what the API holds and say least.
    for (const type of ['1', '2', '12']) committees.append('PublicationTypeIds', type);
    committees.set('SortOrder', 'PublicationDateDescending');
    committees.set('Take', String(PER_SOURCE));
    hansard.set('queryParameters.searchTerm', term);
    hansard.set('queryParameters.orderBy', 'SittingDateDesc');
    hansard.set('queryParameters.take', String(PER_SOURCE));
  }
  const noTerm = guarded
    ? { skipped: 'Its name reads like a phrase from the paper being assessed, so it was not sent.', guarded: true }
    : { skipped: 'Its name is too short to search for.', guarded: false };
  return {
    govuk: body.slug ? `${GOVUK_SEARCH_API}${govuk}` : { skipped: 'It has no GOV.UK organisation page to search by.', guarded: false },
    committees: term ? `${COMMITTEES_API}${committees}` : noTerm,
    hansard: term ? `${HANSARD_API}${hansard}` : noTerm,
  };
}

const READERS: Record<EvidenceSource, typeof govukRecords> = { govuk: govukRecords, committees: committeeRecords, hansard: hansardRecords };

/**
 * Ask each source about one body. Never throws for a source: a failed source
 * is an answer with an error, so one slow API costs its own records and not
 * the other two's. The error is OUR sentence, never the service's body.
 */
export async function fetchBodySources(body: SourceBody, options: SourceOptions = {}): Promise<SourceAnswer[]> {
  const get = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const guard = options.guard ?? ((url: string) => assertPublicUrl(url));
  const now = options.now ?? new Date();
  const urls = sourceUrls(body, options.corpus);
  const wanted = options.sources ?? (Object.keys(urls) as EvidenceSource[]);
  return Promise.all(wanted.map(async (source): Promise<SourceAnswer> => {
    const url = urls[source];
    if (typeof url !== 'string') return { source, records: [], error: null, skipped: url.skipped, guarded: url.guarded };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !API_HOSTS.has(parsed.hostname)) throw new Error('not an allowed host');
      await guard(url);
      options.signal?.throwIfAborted();
      const response = await get(url, {
        headers: { accept: 'application/json', 'user-agent': 'policy-red-team public record check' },
        // A redirect is refused rather than followed: the host was checked, the
        // place it redirects to was not.
        redirect: 'error',
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      });
      if (!response.ok) return { source, records: [], error: `answered ${response.status}`, skipped: null };
      const records = READERS[source](await response.json(), { bodyId: body.id, now });
      return { source, records, error: null, skipped: null };
    } catch (err) {
      options.signal?.throwIfAborted();
      const reason = (err as Error)?.name === 'TimeoutError' ? 'did not answer in time' : 'could not be reached';
      return { source, records: [], error: reason, skipped: null };
    }
  }));
}
