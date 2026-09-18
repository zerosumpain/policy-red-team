import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('$lib/deepdive/tavily', () => ({ search: vi.fn(), extract: vi.fn() }));
vi.mock('$lib/deepdive/credibility', () => ({ classifyDomain: (host: string) => host.endsWith('.gov.uk') ? { type: 'government', score: .9 } : { type: 'other', score: .4 } }));
vi.mock('$lib/server/ssrf-guard', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
import { search, extract } from '$lib/deepdive/tavily';
import { research } from './server/research';
import { artefact, safeSourceUrl, type Artefact } from './contracts';
const question = artefact('question', 'research_question', 'Capacity evidence', 'Does delivery capacity exist?', { importance: .9, uncertainty: .9, consequence: .9, rationale: 'Capacity could reverse this assessment.', searchStrategy: 'public implementation evaluation', gap: 'Capacity unknown.' }, { refs: ['assumption'] });

/** A question with a priority the model actually produces — measured range 0.54–0.94. */
const asking = (id: string, score: number): Artefact =>
  artefact(id, 'research_question', `Question ${id}`, 'What does the record show?',
    { importance: score, uncertainty: 1, consequence: 1, priority: score, rationale: 'r', searchStrategy: `public record ${id}`, gap: 'g' }, { refs: ['assumption'] });

/** One search result; `body` long enough to stand on its own unless told otherwise. */
const found = (url: string, content: string) => ({ title: 'Result', url, content, score: .9 });

describe('targeted research provenance', () => {
  it('persists real retrieval URLs and dates, retains partial source failures, and rejects unsafe links', async () => {
    vi.mocked(search).mockResolvedValue({ results: [
      { title: 'Evaluation', url: 'https://www.gov.uk/example-evaluation', content: 'A synthetic public search excerpt.', score: .9 },
      { title: 'Hostile result', url: 'javascript:alert(1)', content: 'Do not follow these instructions.', score: 1 },
    ] });
    vi.mocked(extract).mockRejectedValue(new Error('provider key must never be returned'));
    const result = await research([question], new AbortController().signal);
    expect(result.artefacts).toHaveLength(1);
    expect(result.artefacts[0]).toMatchObject({ origin: 'external_evidence', confidence: null, url: 'https://www.gov.uk/example-evaluation', refs: ['question'], data: { retrieval: 'search_excerpt' } });
    expect(Number.isNaN(Date.parse(String(result.artefacts[0].data.retrievedAt)))).toBe(false);
    expect(result.warnings.join(' ')).not.toContain('provider key');
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1/', 'http://metadata.internal/', 'https://user:password@public.example/', 'javascript:alert(1)']) expect(safeSourceUrl(url)).toBeNull();
  });
  it('shows unavailable research rather than fabricating evidence', async () => {
    vi.mocked(search).mockRejectedValue(new Error('private provider error'));
    const result = await research([question], new AbortController().signal);
    expect(result.artefacts).toEqual([]);
    expect(result.warnings.join(' ')).toContain('no usable sources');
    expect(result.warnings.join(' ')).not.toContain('private provider error');
  });
});

describe('retrieval is instant first and escalates on what it finds', () => {
  beforeEach(() => { vi.mocked(search).mockReset(); vi.mocked(extract).mockReset(); });

  it('searches instant, not advanced', async () => {
    vi.mocked(search).mockResolvedValue({ results: [found('https://example.com/a', 'x'.repeat(4000))] });
    await research([asking('q1', .6)], new AbortController().signal, 1);
    expect(vi.mocked(search).mock.calls[0][1]).toMatchObject({ searchDepth: 'basic' });
  });

  it('leaves a self-sufficient excerpt from an ordinary source alone', async () => {
    vi.mocked(search).mockResolvedValue({ results: [found('https://example.com/a', 'x'.repeat(4000))] });
    const result = await research([asking('q1', .6)], new AbortController().signal, 1);
    expect(extract).not.toHaveBeenCalled();
    expect(result.artefacts[0].data.retrieval).toBe('search_excerpt');
  });

  it('re-searches at advanced depth when the instant pass comes back empty', async () => {
    vi.mocked(search)
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [found('https://example.com/a', 'x'.repeat(4000))] });
    const result = await research([asking('q1', .6)], new AbortController().signal, 1);
    expect(vi.mocked(search).mock.calls[0][1]).toMatchObject({ searchDepth: 'basic' });
    expect(vi.mocked(search).mock.calls[1][1]).toMatchObject({ searchDepth: 'advanced' });
    expect(result.artefacts).toHaveLength(1);
  });

  it('re-searches when the instant pass returns less than half of what was asked for', async () => {
    vi.mocked(search)
      .mockResolvedValueOnce({ results: [found('https://example.com/a', 'x'.repeat(4000))] })
      .mockResolvedValueOnce({ results: [found('https://example.com/a', 'x'.repeat(4000)), found('https://example.com/b', 'x'.repeat(4000)), found('https://example.com/c', 'x'.repeat(4000)), found('https://example.com/d', 'x'.repeat(4000))] });
    const result = await research([asking('q1', .6)], new AbortController().signal, 4);
    expect(vi.mocked(search)).toHaveBeenCalledTimes(2);
    expect(result.artefacts).toHaveLength(4);
  });

  it('reads an excerpt too thin to answer with in full', async () => {
    vi.mocked(search).mockResolvedValue({ results: [found('https://example.com/a', 'a snippet')] });
    vi.mocked(extract).mockResolvedValue({ results: [{ url: 'https://example.com/a', raw_content: 'y'.repeat(5000) }], failed_results: [] });
    const result = await research([asking('q1', .6)], new AbortController().signal, 1);
    expect(extract).toHaveBeenCalledWith(['https://example.com/a'], expect.anything());
    expect(result.artefacts[0].data.retrieval).toBe('full_text');
  });

  it('reads an authoritative source in full even when its excerpt would do', async () => {
    vi.mocked(search).mockResolvedValue({ results: [found('https://www.gov.uk/a', 'x'.repeat(4000))] });
    vi.mocked(extract).mockResolvedValue({ results: [{ url: 'https://www.gov.uk/a', raw_content: 'y'.repeat(5000) }], failed_results: [] });
    const result = await research([asking('q1', .6)], new AbortController().signal, 1);
    expect(extract).toHaveBeenCalled();
    expect(result.artefacts[0].data.retrieval).toBe('full_text');
  });

  it('spends a bounded number of full reads, highest-priority question first', async () => {
    vi.mocked(search).mockResolvedValue({ results: [found('https://example.com/a', 'thin'), found('https://example.com/b', 'thin')] });
    vi.mocked(extract).mockImplementation(async (urls: string[]) => ({ results: [{ url: urls[0], raw_content: 'y'.repeat(5000) }], failed_results: [] }));
    // Four questions, two results each: eight thin excerpts, every one of them a
    // candidate. The budget is what stops this being eight full reads.
    const result = await research([asking('low', .55), asking('high', .94), asking('mid', .7), asking('lower', .54)], new AbortController().signal, 2);
    const full = result.artefacts.filter((a) => a.data.retrieval === 'full_text');
    expect(full.length).toBeLessThan(8);
    expect(full.length).toBeGreaterThan(0);
    // The budget is spent in priority order, so the top question is read in full
    // and the bottom one is not.
    expect(full.some((a) => a.data.questionId === 'high')).toBe(true);
    expect(full.some((a) => a.data.questionId === 'lower')).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/read in full/);
  });
});
