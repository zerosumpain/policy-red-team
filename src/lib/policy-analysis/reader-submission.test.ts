// Phase 22 part 2 — the submission form's "Sources it should use" and "Things
// to look up", and material aimed at one item after the run. No network: the
// page reader and the search are stubs passed in.
import { describe, expect, it, vi } from 'vitest';
import { readMaterial, readSubmission } from './server/ingest';
import { resolveMaterial } from './server/material-sources';
import { resolveReaderInputs } from './server/reader-brought';

function submit(fields: Record<string, string>, files: Record<string, File> = {}) {
  const form = new FormData();
  form.set('title', 'A paper');
  form.set('text', 'The Council is accountable for delivery.');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const [k, v] of Object.entries(files)) form.set(k, v);
  return readSubmission(new Request('http://localhost', { method: 'POST', body: form }));
}

describe('sources and look-ups at submission', () => {
  it('reads a page, a file and a look-up, skipping the spare blank rows', async () => {
    const got = await submit({
      'sourceUrl.0': 'https://www.gov.uk/review', 'sourceAbout.0': 'Ofsted', 'sourceNote.0': 'The 2025 review.',
      'sourceUrl.1': '', 'sourceAbout.1': '',
      'lookUp.0': 'family hubs evaluation', 'lookUp.1': '',
    }, { 'sourceFile.2': new File(['A review of capacity.'], 'review.txt', { type: 'text/plain' }) });
    expect(got.readerSources).toMatchObject([
      { kind: 'page', url: 'https://www.gov.uk/review', about: 'Ofsted', note: 'The 2025 review.' },
      { kind: 'file', filename: 'review.txt', mimeType: 'text/plain', about: null, note: null },
    ]);
    expect(got.lookUps).toEqual(['family hubs evaluation']);
  });

  it('refuses, by number, what the reader would not want silently dropped', async () => {
    await expect(submit({ 'sourceAbout.0': 'Ofsted' })).rejects.toThrow(/Source 1: attach a file or give its web address/);
    await expect(submit({ 'sourceUrl.0': 'http://127.0.0.1/admin' })).rejects.toThrow(/Source 1: give a public web address/);
    await expect(submit({ 'lookUp.0': 'fine', 'lookUp.1': 'email jane@example.com' })).rejects.toThrow(/Thing to look up 2: It contains an email address/);
    await expect(submit({ 'sourceUrl.0': 'https://a.example/' }, { 'sourceFile.0': new File(['x'], 'x.txt', { type: 'text/plain' }) })).rejects.toThrow(/not both/);
  });

  it('caps how many and how big', async () => {
    const eleven = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`lookUp.${i}`, `question ${i}`]));
    await expect(submit(eleven)).rejects.toThrow(/at most 10 things/);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1).fill(97)], 'big.txt', { type: 'text/plain' });
    await expect(submit({}, { 'sourceFile.0': big })).rejects.toThrow(/at most 2 MB/);
  });

  it('is optional: a submission with neither has none', async () => {
    const got = await submit({});
    expect(got.readerSources).toEqual([]);
    expect(got.lookUps).toEqual([]);
  });
});

describe('what stage 5 is handed', () => {
  const rows = [
    { kind: 'page', url: 'https://www.gov.uk/review', filename: null, mimeType: null, content: null, about: 'Ofsted', note: null, wording: null },
    { kind: 'file', url: null, filename: 'memo.txt', mimeType: 'text/plain', content: Buffer.from('An internal memo about capacity.').toString('base64'), about: null, note: 'From the council.', wording: null },
    { kind: 'look_up', url: null, filename: null, mimeType: null, content: null, about: null, note: null, wording: '"family hubs" evaluation' },
  ];

  it('fetches a page, extracts a file and builds a look-up’s query', async () => {
    const fetch = vi.fn(async (url: string) => ({ url, finalUrl: url, title: 'Capacity review', text: 'Vacancies.', kind: 'html' as const, truncated: false }));
    const brought = await resolveReaderInputs(rows, { mayFetch: true, why: 'n/a', fetch });
    expect(fetch).toHaveBeenCalledOnce();
    expect(brought.supplied).toMatchObject([
      { form: 'page', url: 'https://www.gov.uk/review', title: 'Capacity review', text: 'Vacancies.', about: 'Ofsted' },
      { form: 'file', url: null, title: 'memo.txt', text: 'An internal memo about capacity.', note: 'From the council.' },
    ]);
    expect(brought.lookUps).toEqual([{ wording: '"family hubs" evaluation', query: 'family hubs evaluation' }]);
  });

  it('fetches nothing on a run that may not, and says why', async () => {
    const fetch = vi.fn();
    const brought = await resolveReaderInputs(rows, { mayFetch: false, why: 'this assessment is sealed, so no page is fetched for it', fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(brought.supplied[0]).toMatchObject({ text: null, failure: 'this assessment is sealed, so no page is fetched for it' });
  });
});

describe('material aimed at one item, after the run', () => {
  const asMaterial = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return readMaterial(new Request('http://localhost', { method: 'POST', body: form }));
  };

  it('carries the target, and an address in place of a file', async () => {
    const material = await asMaterial({ role: 'supporting_evidence', url: 'https://www.gov.uk/review', targetId: 's1_000_claim_1', note: 'n' });
    expect(material).toMatchObject({ role: 'supporting_evidence', url: 'https://www.gov.uk/review', targetId: 's1_000_claim_1', lookUp: null });
  });

  it('turns a page into a plain-text document, and refuses one for a sealed run', async () => {
    const material = await asMaterial({ role: 'critique', url: 'https://www.gov.uk/review' });
    const fetch = vi.fn(async (url: string) => ({ url, finalUrl: url, title: 'Capacity review', text: 'Vacancies were high.', kind: 'html' as const, truncated: false }));
    const resolved = await resolveMaterial(material, { sealed: false, sealedResearch: false }, { fetch });
    expect(resolved).toMatchObject({ filename: 'capacity-review.txt', mimeType: 'text/plain' });
    expect(resolved.bytes.toString()).toContain('Vacancies were high.');
    await expect(resolveMaterial(material, { sealed: true, sealedResearch: true }, { fetch })).rejects.toThrow(/sealed/);
  });

  it('turns a look-up into its search results, labelled as excerpts, and refuses personal data', async () => {
    const material = await asMaterial({ lookUp: 'family hubs evaluation', targetId: 's1_000_claim_1' });
    expect(material.role).toBe('other');
    const search = vi.fn(async () => ({ results: [{ title: 'Evaluation', url: 'https://www.gov.uk/eval', content: 'Use rose by a tenth.', score: 0.9 }] }));
    const resolved = await resolveMaterial(material, { sealed: false, sealedResearch: false }, { search });
    expect(search).toHaveBeenCalledWith('family hubs evaluation', expect.objectContaining({ maxResults: 5 }));
    expect(resolved.bytes.toString()).toMatch(/search excerpt, not the full source[\s\S]*https:\/\/www.gov.uk\/eval[\s\S]*Use rose by a tenth/);
    await expect(asMaterial({ lookUp: 'ring 020 7946 0000' })).rejects.toThrow(/phone number/);
    await expect(resolveMaterial(material, { sealed: true, sealedResearch: false }, { search })).rejects.toThrow(/not allowed to search/);
  });
});
