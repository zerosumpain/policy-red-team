// Phase 19, workstream X: the public record about a register body — read from
// recorded answers of the three free APIs (fetched 25 September 2026 and
// trimmed), classified by rule, and turned into a run's retrieved sources.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyCommittee, classifyGovuk, committeeRecords, evidenceArtefacts, EVIDENCE_TTL_MS, govukRecords, hansardRecords,
  isBodyEvidence, pickEvidence, publicLink, searchTerm, uncheckedWarning, type BodyEvidenceRecord,
} from './body-evidence';
import { artefact, STAGE_KINDS, MODEL_KINDS } from './contracts';
import { triageArtefacts } from './validation';
import { documentShingles } from './query-guard';
import { fetchBodySources, sourceUrls } from './server/body-sources';

const recorded = (name: string) => JSON.parse(readFileSync(`tests/fixtures/body-evidence/${name}.json`, 'utf8'));
const now = new Date('2026-09-25T12:00:00Z');
const at = { bodyId: 'govuk:ofsted', now };

describe('reading what each API answered', () => {
  it('GOV.UK search: one dated record per publication, linked on www.gov.uk', () => {
    const records = govukRecords(recorded('govuk-ofsted'), at);
    expect(records).toHaveLength(8);
    const annual = records.find((r) => r.title.startsWith('Ofsted corporate annual report'))!;
    expect(annual).toMatchObject({
      source: 'govuk', sourceKind: 'corporate_report', question: 'capacity',
      url: 'https://www.gov.uk/government/publications/ofsted-corporate-annual-report-and-accounts-2025-to-2026',
      publishedAt: '2026-08-11T10:03:49.000Z', retrievedAt: now.toISOString(),
    });
    // The date in-run research never recorded, and a TTL from the fetch.
    expect(Date.parse(annual.expiresAt) - now.getTime()).toBe(EVIDENCE_TTL_MS);
    expect(annual.excerpt).toMatch(/annual report and accounts/);
  });

  it('committees: reports are track record, responses are what the body said back', () => {
    const records = committeeRecords(recorded('committees-ofsted'), at);
    expect(records).toHaveLength(6);
    const report = records.find((r) => r.title === 'First Report - Ofsted’s work with schools')!;
    expect(report).toMatchObject({ source: 'committees', sourceKind: 'Report', question: 'track_record', url: 'https://committees.parliament.uk/publications/43079/', publishedAt: '2024-01-29T00:01:00.000Z' });
    expect(report.publisher).toMatch(/Education Committee \(House of Commons\)/);
    // Filed as a Special Report, titled as a response: it is the body's stance.
    expect(records.find((r) => r.title.startsWith('Second Special Report'))!.question).toBe('stance');
    expect(records.find((r) => r.sourceKind === 'Government Response')!.question).toBe('stance');
  });

  it('Hansard: debates titled with the body, linked to the sitting', () => {
    const records = hansardRecords(recorded('hansard-ofsted'), at);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toMatchObject({ source: 'hansard', sourceKind: 'debate', question: 'track_record', title: 'Debate: Ofsted', publishedAt: '2024-09-05T00:00:00.000Z' });
    expect(records[0].url).toBe('https://hansard.parliament.uk/Lords/2024-09-05/debates/4BFB17F1-E7F2-462E-8338-6E553EAEAC42/Ofsted');
  });

  it('builds every link from a fixed host, so nothing an answer says can point elsewhere', () => {
    expect(govukRecords({ results: [{ title: 'x', link: '//evil.example/x' }, { title: 'y', link: 'https://evil.example/' }] }, at)).toEqual([]);
    expect(committeeRecords({ items: [{ id: '1; drop', description: 'x' }, { id: -4, description: 'y' }] }, at)).toEqual([]);
    expect(hansardRecords({ Results: [{ Title: 'x', House: 'Commons', SittingDate: '2024-01-01', DebateSectionExtId: '../../x' }] }, at)).toEqual([]);
    expect(publicLink('https://evil.example/')).toBeNull();
    expect(publicLink('http://www.gov.uk/x')).toBeNull();
    // A malformed answer costs its records, not the check.
    expect(govukRecords(null, at)).toEqual([]);
    expect(committeeRecords({ items: 'nope' }, at)).toEqual([]);
  });
});

describe('what a record answers is a rule, not a model', () => {
  it.each([
    ['corporate_report', 'Ofsted corporate annual report and accounts 2025 to 2026', 'capacity'],
    ['corporate_report', 'Skills England: framework document', 'powers'],
    ['corporate_report', 'DfE outcome delivery plan 2025 to 2026', 'incentives'],
    ['corporate_report', 'Big Listen action monitoring reports', 'track_record'],
    ['statutory_guidance', 'Working together: a review', 'powers'],
    ['consultation_outcome', 'School Food Standards: updating the legislative framework', 'stance'],
    ['independent_report', 'Review of early deaths of care leavers', 'track_record'],
  ])('GOV.UK %s “%s” is %s', (kind, title, question) => {
    expect(classifyGovuk(kind, title)).toBe(question);
  });
  it('a committee report about money is capacity, not track record', () => {
    expect(classifyCommittee('Report', 'Department for Education: Capital funding for new school places')).toBe('capacity');
  });
});

describe('the query comes from the register and is still guarded', () => {
  it('quotes the official name, and sends a slug to GOV.UK rather than any words', () => {
    const urls = sourceUrls({ id: 'govuk:skills-england', slug: 'skills-england', name: 'Skills England' });
    expect(urls.govuk).toMatch(/^https:\/\/www\.gov\.uk\/api\/search\.json\?filter_organisations=skills-england&/);
    expect(urls.govuk).not.toMatch(/Skills/);
    expect(new URL(String(urls.committees)).searchParams.get('SearchTerm')).toBe('"Skills England"');
    expect(new URL(String(urls.hansard)).searchParams.get('queryParameters.searchTerm')).toBe('"Skills England"');
  });

  it('refuses a name that quotes the paper being assessed — the in-run guard, reused', () => {
    const passage = artefact('passage_0001', 'passage', 'p', 'The Office for Standards in Education, Children’s Services and Skills will inspect every provider.', {});
    const corpus = documentShingles([passage]);
    expect(searchTerm('Office for Standards in Education, Children’s Services and Skills', corpus)).toBeNull();
    expect(searchTerm('Ofsted', corpus)).toBe('"Ofsted"');
    const urls = sourceUrls({ id: 'govuk:x', slug: 'x', name: 'Office for Standards in Education, Children’s Services and Skills' }, corpus);
    expect(urls.committees).toMatchObject({ skipped: expect.stringMatching(/not sent/) });
    // The slug is not words from anybody's paper, so GOV.UK is still asked.
    expect(typeof urls.govuk).toBe('string');
  });

  it('does not guard the register\'s own name against the paper: it came from the register, not the paper', () => {
    // 96 live register bodies have a name of six words or more. A paper that
    // names one in full — as papers about DSIT, DESNZ or MHCLG do — used to
    // block that body's record for every owner, for thirty days.
    const name = 'Department for Science, Innovation and Technology';
    const passage = artefact('passage_0001', 'passage', 'p', `The ${name} will publish guidance.`, {});
    const corpus = documentShingles([passage]);
    const urls = sourceUrls({ id: 'govuk:dsit', slug: 'department-for-science-innovation-and-technology', name, registered: true }, corpus);
    expect(new URL(String(urls.committees)).searchParams.get('SearchTerm')).toBe(`"${name}"`);
    expect(typeof urls.hansard).toBe('string');
  });

  it('marks a skip the guard caused, so it is never stored as an answer', () => {
    const name = 'Office for Standards in Education, Children’s Services and Skills';
    const corpus = documentShingles([artefact('passage_0001', 'passage', 'p', `The ${name} will inspect.`, {})]);
    expect(sourceUrls({ id: 'govuk:x', slug: 'x', name }, corpus).committees).toMatchObject({ guarded: true });
    // A name too short to search is not the guard's doing.
    expect(sourceUrls({ id: 'govuk:x', slug: 'x', name: 'X' }, corpus).committees).toMatchObject({ guarded: false });
  });
});

describe('fetching', () => {
  const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const allow = async () => {};

  it('asks each source once, and one failure costs only its own records', async () => {
    const asked: string[] = [];
    const answers = await fetchBodySources({ id: 'govuk:ofsted', slug: 'ofsted', name: 'Ofsted' }, {
      now, guard: allow,
      fetch: async (url) => {
        asked.push(new URL(url).hostname);
        if (url.includes('hansard')) return answer({}, 503);
        return answer(url.includes('committees') ? recorded('committees-ofsted') : recorded('govuk-ofsted'));
      },
    });
    expect(asked.sort()).toEqual(['committees-api.parliament.uk', 'hansard-api.parliament.uk', 'www.gov.uk']);
    expect(answers.find((a) => a.source === 'govuk')!.records).toHaveLength(8);
    expect(answers.find((a) => a.source === 'committees')!.records).toHaveLength(6);
    expect(answers.find((a) => a.source === 'hansard')).toMatchObject({ records: [], error: 'answered 503' });
  });

  it('goes through the URL guard, and a refused URL is an error, not a request', async () => {
    let fetched = 0;
    const answers = await fetchBodySources({ id: 'govuk:ofsted', slug: 'ofsted', name: 'Ofsted' }, {
      now, guard: async () => { throw new Error('ssrf_blocked'); }, fetch: async () => { fetched++; return answer({}); },
    });
    expect(fetched).toBe(0);
    expect(answers.every((a) => a.error === 'could not be reached')).toBe(true);
  });

  it('never tells the reader what the service said', async () => {
    const answers = await fetchBodySources({ id: 'govuk:ofsted', slug: 'ofsted', name: 'Ofsted' }, {
      now, guard: allow, sources: ['govuk'], fetch: async () => { throw new Error('ECONNRESET at 10.0.0.1 with secret'); },
    });
    expect(answers[0].error).toBe('could not be reached');
  });
});

describe('what could not be checked is said the same way every time', () => {
  it('names the bodies in a fixed order, not the order the network answered in', () => {
    // The warning rides into the stage's cached calls: two orders are two
    // different questions, and a resumed stage would miss its cache.
    const one = uncheckedWarning(['Ofsted', 'Department for Education', 'Skills England']);
    const two = uncheckedWarning(['Skills England', 'Ofsted', 'Department for Education']);
    expect(one).toBe(two);
    expect(one).toContain('(Department for Education, Ofsted, Skills England)');
    expect(uncheckedWarning([])).toBeNull();
  });
});

describe('into a run', () => {
  const record = (over: Partial<BodyEvidenceRecord>): BodyEvidenceRecord => ({
    bodyId: 'govuk:ofsted', source: 'govuk', sourceKind: 'corporate_report', question: 'track_record', title: 't', url: 'https://www.gov.uk/x',
    publisher: 'GOV.UK', publishedAt: '2026-01-01T00:00:00.000Z', retrievedAt: now.toISOString(), expiresAt: now.toISOString(), excerpt: null, ...over,
  });

  it('picks different things to know before more of the same, newest first', () => {
    const records = [
      record({ url: 'https://www.gov.uk/a', question: 'capacity', publishedAt: '2026-08-01T00:00:00.000Z' }),
      record({ url: 'https://www.gov.uk/b', question: 'capacity', publishedAt: '2026-09-01T00:00:00.000Z' }),
      record({ url: 'https://www.gov.uk/c', question: 'capacity', publishedAt: '2026-07-01T00:00:00.000Z' }),
      record({ url: 'https://www.gov.uk/d', question: 'track_record', publishedAt: '2019-01-01T00:00:00.000Z' }),
      record({ url: 'https://www.gov.uk/e', question: 'powers', publishedAt: null }),
    ];
    expect(pickEvidence(records).map((r) => r.url)).toEqual(['https://www.gov.uk/b', 'https://www.gov.uk/d', 'https://www.gov.uk/e']);
    expect(pickEvidence(records, 4).map((r) => r.url)).toEqual(['https://www.gov.uk/b', 'https://www.gov.uk/a', 'https://www.gov.uk/d', 'https://www.gov.uk/e']);
  });

  it('becomes a dated retrieved source that survives stage 4 triage and counts as evidence', () => {
    const actor = artefact('s2_000_actor', 'actor', 'Ofsted', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null }, { refs: ['passage_0001'] });
    const passage = artefact('passage_0001', 'passage', 'p', 'Ofsted will inspect.', {}, { origin: 'extracted_fact', confidence: 1 });
    const [source] = evidenceArtefacts(0, actor.id, 'Ofsted', [record({ title: 'Ofsted corporate annual report and accounts 2025 to 2026', question: 'capacity', publishedAt: '2026-08-11T10:03:49.000Z' })]);
    expect(source).toMatchObject({ id: 's4_body_0', kind: 'research_source', origin: 'external_evidence', refs: [actor.id], url: 'https://www.gov.uk/x' });
    expect(isBodyEvidence(source)).toBe(true);
    expect(source.statement).toMatch(/Published 11 August 2026 by GOV\.UK/);
    expect(source.data.freshness).toMatch(/^Published 11 August 2026/);
    const triaged = triageArtefacts({ artefacts: [source], warnings: [] }, 4, [passage, actor]);
    expect(triaged.rejected).toEqual([]);
    // The fields the pages and later stages read survive the contract.
    expect(triaged.artefacts[0].data).toMatchObject({ bodyId: 'govuk:ofsted', question: 'capacity', publishedAt: '2026-08-11T10:03:49.000Z', questionId: actor.id });
  });

  it('may exist in stage 4, and may still never be written by a model', () => {
    expect(STAGE_KINDS[4]).toContain('research_source');
    expect(MODEL_KINDS[4]).not.toContain('research_source');
  });
});
