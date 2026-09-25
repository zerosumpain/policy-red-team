import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerById } from '$lib/llm/providers';

/**
 * RESEARCH WITHOUT A TAVILY ACCOUNT.
 *
 * Measured on 2026-09-19: twelve research questions planned, zero sources
 * retrieved, and twelve "Research unavailable … authority, freshness and
 * jurisdiction remain unverified" warnings carried into every later stage. The
 * bridge had been serving `/v1/grounded/chat/completions` throughout.
 */
afterEach(() => { delete process.env.TAVILY_API_KEY; vi.restoreAllMocks(); });

describe('the Codex bridge offers a grounded client', () => {
  const codex = providerById('codex')!;
  const config = { baseUrl: 'http://127.0.0.1:5207/v1', model: 'gpt-5.6-luna' };

  it('points one path deeper at the same endpoint', () => {
    const g = codex.grounded!(config)!;
    expect(g.client.baseURL).toBe('http://127.0.0.1:5207/v1/grounded');
  });

  it('sends the bare slug, as the endpoint expects', () => {
    expect(codex.grounded!({ ...config, model: 'codex/gpt-5.6-luna' })!.model).toBe('gpt-5.6-luna');
  });

  it('offers nothing without a base URL, rather than a broken client', () => {
    expect(codex.grounded!({ model: 'gpt-5.6-luna' })).toBeNull();
  });
});

describe('a provider with no web search says so', () => {
  it('Azure declares none — inventing sources is worse than an acknowledged gap', () => {
    expect(providerById('azure')!.grounded).toBeUndefined();
  });
});

describe('which engine answers', () => {
  it('prefers Tavily wherever a key exists', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    const tavily = await import('$lib/deepdive/tavily');
    const spy = vi.spyOn(tavily, 'search').mockResolvedValue({ results: [] });
    const { search } = await import('./web-search');
    await search('anything', { maxResults: 2 });
    // Tavily returns ranked results with scores and can fetch full page text; a
    // grounded model returns prose with citations. Where both exist the first is
    // better evidence, so a key keeps its precedence.
    expect(spy).toHaveBeenCalled();
  });
});

describe('a grounded search that is throttled is asked again, within bounds', () => {
  // Research is six-way concurrent now, and one 429 used to drop the question.
  const status = (code: number) => Object.assign(new Error(`HTTP ${code}`), { status: code });
  const noWait = async () => {};

  it('retries a 429 and a 5xx, then answers', async () => {
    const { retrying } = await import('./web-search');
    const seen: number[] = [];
    let n = 0;
    const answer = await retrying(async () => {
      n++;
      if (n === 1) throw status(429);
      if (n === 2) throw status(503);
      return 'ok';
    }, { sleep: async (ms) => { seen.push(ms); } });
    expect(answer).toBe('ok');
    expect(n).toBe(3);
    expect(seen).toHaveLength(2);
  });

  it('does not retry a request the service refused on its merits', async () => {
    const { retrying } = await import('./web-search');
    let n = 0;
    await expect(retrying(async () => { n++; throw status(400); }, { sleep: noWait })).rejects.toThrow('HTTP 400');
    expect(n).toBe(1);
  });

  it('gives up after a bounded number of tries', async () => {
    const { retrying } = await import('./web-search');
    let n = 0;
    await expect(retrying(async () => { n++; throw status(429); }, { sleep: noWait })).rejects.toThrow('HTTP 429');
    expect(n).toBe(3);
  });

  it('gives each try its own deadline', async () => {
    const { retrying } = await import('./web-search');
    let aborted = false;
    await expect(retrying((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    }), { timeoutMs: 20, sleep: noWait })).rejects.toBeTruthy();
    expect(aborted).toBe(true);
  });
});
