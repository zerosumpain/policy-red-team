import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { listOpenAICompatible } from './openai-catalogue';
import { tierForCost } from '$lib/server/models/catalogue';

/**
 * The catalogue reader, against the two shapes it actually meets.
 *
 * OpenRouter sends pricing, a context length and a description. A bridge over a
 * subscription sends an id and nothing else. Both have to come back as rows the
 * panel can draw, and the second must not be made to invent a price it does not
 * have — a `$0.00/M` beside a subscription model would read as free.
 */
const client = (data: unknown[]) =>
  ({ models: { list: async () => ({ data }) } }) as unknown as OpenAI;

describe('reading an OpenAI-compatible model list', () => {
  it('converts per-token prices into dollars per million', async () => {
    const [row] = await listOpenAICompatible(
      client([{ id: 'deepseek/deepseek-v4-flash', pricing: { prompt: '0.00000004648', completion: '0.00000009296' } }]),
    );
    // 0.00000004648 * 1e6, to the precision the panel prints.
    expect(row.promptCost).toBeCloseTo(0.04648, 6);
    expect(row.completionCost).toBeCloseTo(0.09296, 6);
  });

  it('leaves an unpriced model null rather than calling it free', async () => {
    const [row] = await listOpenAICompatible(client([{ id: 'gpt-5.6-sol' }]));
    expect(row.promptCost).toBeNull();
    expect(row.completionCost).toBeNull();
    expect(row.contextLength).toBeNull();
    // The id stands in for a name nobody sent.
    expect(row.name).toBe('gpt-5.6-sol');
  });

  it('marks a floating alias, which is a different kind of choice', async () => {
    const rows = await listOpenAICompatible(
      client([{ id: '~deepseek/deepseek-flash-latest' }, { id: 'deepseek/deepseek-v4-flash' }]),
    );
    expect(rows.find((r) => r.id === '~deepseek/deepseek-flash-latest')?.floating).toBe(true);
    expect(rows.find((r) => r.id === 'deepseek/deepseek-v4-flash')?.floating).toBe(false);
  });

  it('drops a row with no id instead of rendering a blank checkbox', async () => {
    const rows = await listOpenAICompatible(client([{ id: '' }, {}, { id: 'real/model' }]));
    expect(rows.map((r) => r.id)).toEqual(['real/model']);
  });

  it('survives a price it cannot parse', async () => {
    const [row] = await listOpenAICompatible(
      client([{ id: 'a/b', pricing: { prompt: 'variable', completion: -1 } }]),
    );
    expect(row.promptCost).toBeNull();
    expect(row.completionCost).toBeNull();
  });
});

describe('what a price means for a run of eighteen stages', () => {
  /*
   * The five built-in models, their real OpenRouter prices on 2026-09-19, and
   * the tiers somebody assigned by hand before `tierForCost` existed.
   *
   * This is the test that matters: a model picked from the live catalogue gets
   * its tier derived, and a derived tier that disagrees with the curated one
   * would put two different warnings on the same model depending on how it got
   * into the menu.
   */
  const BUILT_IN: [string, number, string][] = [
    ['deepseek/deepseek-v4-flash', 0.046, 'economy'],
    ['openai/gpt-oss-120b', 0.15, 'economy'],
    ['google/gemini-2.5-flash', 0.3, 'balanced'],
    ['z-ai/glm-5.2', 0.554, 'balanced'],
    ['anthropic/claude-sonnet-4.5', 3, 'frontier'],
  ];

  it.each(BUILT_IN)('puts %s at $%s/M in the tier it was given by hand', (_id, cost, tier) => {
    expect(tierForCost(cost as number)).toBe(tier);
  });

  it('calls an unpriced model balanced, not free', () => {
    // A subscription bridge quotes nothing per token. That is not the same as
    // costing nothing, and a reader should not be told it is cheap.
    expect(tierForCost(null)).toBe('balanced');
  });
});
