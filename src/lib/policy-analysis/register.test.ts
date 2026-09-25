// The register of public bodies: resolution against the COMMITTED snapshot, so
// every case here is the real GOV.UK list rather than a fixture that agrees with
// the code by construction.
import { describe, expect, it } from 'vitest';
import snapshotJson from '../../../register/govuk-organisations.json';
import {
  bodyFacts, bodyFromOrganisation, buildRegisterIndex, nameKey, organisationsFromPage, resolveBody, searchRegister, serialiseSnapshot,
  type RegisterSnapshot,
} from './register';
import { fetchRegister, MIN_ORGANISATIONS, REGISTER_PAGE_URL } from './server/register-fetch';

const snapshot = snapshotJson as unknown as RegisterSnapshot;
const index = buildRegisterIndex(snapshot.organisations.map(bodyFromOrganisation));
const resolve = (label: string, aliases: string[] = [], entityType = 'department') => resolveBody({ label, aliases, entityType }, index)?.body.id ?? null;

describe('the committed snapshot', () => {
  it('holds the whole register, sorted, with the fields the matcher needs', () => {
    expect(snapshot.count).toBe(snapshot.organisations.length);
    expect(snapshot.organisations.length).toBeGreaterThanOrEqual(MIN_ORGANISATIONS);
    const slugs = snapshot.organisations.map((o) => o.slug);
    expect(slugs).toEqual([...slugs].sort((a, b) => a.localeCompare(b)));
    expect(snapshot.licence).toContain('Open Government Licence');
  });

  it('round-trips through the one-organisation-per-line form it is committed in', () => {
    expect(JSON.parse(serialiseSnapshot(snapshot))).toEqual(snapshot);
  });
});

describe('who a paper means', () => {
  it('resolves the Department for Education by title, by "DfE", and by the wrong preposition', () => {
    // DfE was in both real papers and never linked. These are the forms the papers used.
    expect(resolve('Department for Education')).toBe('govuk:department-for-education');
    expect(resolve('the Department for Education')).toBe('govuk:department-for-education');
    expect(resolve('DfE', [], 'agency')).toBe('govuk:department-for-education');
    expect(resolve('Department of Education')).toBe('govuk:department-for-education');
    expect(resolve('Department for Education (DfE)')).toBe('govuk:department-for-education');
  });

  it('ignores the entity type a model chose, except where it cannot be a body at all', () => {
    expect(resolve('HM Treasury', [], 'concept')).toBe('govuk:hm-treasury');
    expect(resolve('Treasury', [], 'agency')).toBe('govuk:hm-treasury');
    expect(resolve('Department for Education', [], 'person')).toBeNull();
    expect(resolve('Children', [], 'user_group')).toBeNull();
  });

  it('prefers the open body when a closed one shared its letters', () => {
    // "ORR" is both the closed Office of Rail Regulation and the open Office of Rail and Road.
    expect(resolve('ORR', [], 'agency')).toBe('govuk:office-of-rail-and-road');
  });

  it('declines when two open bodies share an abbreviation', () => {
    // GPF: the Government People Function and the Government Property Function.
    expect(resolve('GPF', [], 'agency')).toBeNull();
  });

  it('declines when the label and an alias name different bodies', () => {
    expect(resolve('Department for Education', ['HM Treasury'])).toBeNull();
  });

  it('never reads an ordinary word as an abbreviation', () => {
    expect(resolve('Education', [], 'concept')).toBeNull();
    expect(resolve('Council', [], 'local_authority')).toBeNull();
  });

  it('folds case, punctuation, "the" and "HM" before comparing', () => {
    expect(nameKey('The Department for Education')).toBe(nameKey('department of education'));
    expect(nameKey('HM Treasury')).toBe('treasury');
  });
});

describe('what a reader is told about a body', () => {
  it('names the parent department and spells out the kind of body', () => {
    const ofsted = index.bodies.get('govuk:ofsted')!;
    const facts = bodyFacts(ofsted, index);
    expect(facts.parents.map((p) => p.name)).toContain('Department for Education');
    expect(facts.kind).toBe('Non-ministerial department');
    expect(facts.kindMeans).toMatch(/not led by a minister/);
    expect(facts.url).toBe('https://www.gov.uk/government/organisations/ofsted');
  });

  it('says a closed body is closed, why, and what replaced it', () => {
    const facts = bodyFacts(index.bodies.get('govuk:education-funding-agency')!, index);
    expect(facts.open).toBe(false);
    expect(facts.status).toBe('Closed');
    expect(facts.closedBecause).toBe('It was replaced.');
    expect(facts.replacedBy.map((b) => b.name)).toContain('Education and Skills Funding Agency');
  });

  it('finds bodies by the start of each word, open ones first', () => {
    expect(searchRegister('DfE', index)[0].id).toBe('govuk:department-for-education');
    expect(searchRegister('education', index).length).toBeGreaterThan(3);
    expect(searchRegister('depart educ', index)[0].id).toBe('govuk:department-for-education');
  });
});

describe('the refresh', () => {
  const page = (n: number, pages: number, results: unknown[]) => ({ current_page: n, pages, total: 900, results });
  const org = (slug: string) => ({ title: slug.toUpperCase(), format: 'Other', details: { slug, abbreviation: null, govuk_status: 'live' }, parent_organisations: [], child_organisations: [], superseded_organisations: [], superseding_organisations: [] });

  it('reads every page, one at a time, through the fetch it is given', async () => {
    const asked: string[] = [];
    const fetch = async (url: string) => {
      asked.push(url);
      const n = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify(page(n, 3, Array.from({ length: 300 }, (_, i) => org(`org-${n}-${i}`)))));
    };
    const result = await fetchRegister({ fetch, now: () => new Date('2026-09-25T00:00:00Z') });
    expect(asked).toEqual([1, 2, 3].map((n) => `${REGISTER_PAGE_URL}${n}`));
    expect(result.count).toBe(900);
    expect(result.fetchedAt).toBe('2026-09-25T00:00:00.000Z');
  });

  it('refuses to replace a good snapshot with a short answer', async () => {
    const fetch = async () => new Response(JSON.stringify(page(1, 1, [org('only-one')])));
    await expect(fetchRegister({ fetch })).rejects.toThrow(/Nothing was written/);
  });

  it('backs off on a 429 and gives up on a 404', async () => {
    let calls = 0;
    const waits: number[] = [];
    const flaky = async () => (++calls === 1 ? new Response('slow down', { status: 429 }) : new Response(JSON.stringify(page(1, 1, Array.from({ length: 900 }, (_, i) => org(`o-${i}`))))));
    await fetchRegister({ fetch: flaky, wait: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([1000]);
    await expect(fetchRegister({ fetch: async () => new Response('', { status: 404 }) })).rejects.toThrow(/404/);
  });

  it('keeps a row without a slug out rather than inventing one', () => {
    const { organisations } = organisationsFromPage({ results: [{ title: 'No slug' }, org('has-one')] });
    expect(organisations.map((o) => o.slug)).toEqual(['has-one']);
  });
});
