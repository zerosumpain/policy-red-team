import { afterEach, describe, expect, it, vi } from 'vitest';
import { chosenEngine, clearSearchConfig, searchIsPinned, searchPlan, tavilyKey } from './search';

afterEach(() => {
  clearSearchConfig();
  vi.unstubAllEnvs();
});

/**
 * "NO SEARCH" IS AN ANSWER, NOT A FAULT.
 *
 * An Azure-only install has no Tavily account and Azure declares no grounded
 * endpoint, so every run plans its research questions, answers none of them,
 * and finishes `completed_with_gaps` with a warning per question. That is the
 * correct outcome, it reads like a failure, and it costs a model call per
 * question to arrive at.
 *
 * Every case below is really about the sentence: `kind` decides what happens,
 * and `why` decides what a reader is told happened. "No sources were found"
 * describes a search that failed; "this install does not look things up"
 * describes a decision. Only one of them is true here.
 */
describe('what a run will do about sources', () => {
  it('uses Tavily where a key exists, because it is better evidence', () => {
    // Ranked results with scores, and it can fetch a page's full text. A
    // grounded model returns prose with citations.
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    expect(searchPlan(true)).toEqual({ kind: 'tavily', why: expect.stringContaining('Tavily') });
  });

  it('falls back to the model’s own search when there is no key', () => {
    expect(searchPlan(true).kind).toBe('grounded');
  });

  it('says WHY when there is nothing, rather than reporting a failed search', () => {
    const plan = searchPlan(false);
    expect(plan.kind).toBe('none');
    expect(plan.why).toMatch(/rests on the paper itself/);
    // The distinction the whole module exists for: this is a limit on the
    // assessment, stated, and not a fault in it.
    expect(plan.why).toMatch(/not a fault/);
  });

  it('refuses to silently substitute when an engine was named', () => {
    // A reader who chose Tavily and has no key must be TOLD that, not quietly
    // given the model's own search instead — the two are different evidence and
    // the report cites them differently.
    vi.stubEnv('POLICY_SEARCH', 'tavily');
    const plan = searchPlan(true);
    expect(plan.kind).toBe('none');
    expect(plan.why).toMatch(/set to use Tavily/);

    vi.stubEnv('POLICY_SEARCH', 'grounded');
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    const grounded = searchPlan(false);
    expect(grounded.kind).toBe('none');
    expect(grounded.why).toMatch(/does not offer one/);
  });

  it('does not look anything up when told not to, whatever is configured', () => {
    // The point of the setting: an install behind a closed network skips the
    // asking rather than discovering the answer once per question.
    vi.stubEnv('POLICY_SEARCH', 'none');
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    expect(searchPlan(true).kind).toBe('none');
  });
});

describe('where the configuration comes from', () => {
  it('reads the environment LIVE, with no refresh', () => {
    // `TAVILY_API_KEY` has been honoured live since phase 0. Putting it behind
    // the module cache would mean a variable that quietly stopped taking effect
    // until something refreshed — which happens at boot, so it would work
    // everywhere except where anybody would notice.
    expect(tavilyKey()).toBeNull();
    vi.stubEnv('TAVILY_API_KEY', 'tvly-live');
    expect(tavilyKey()).toBe('tvly-live');
  });

  it('lets the environment pin the engine, and says so', () => {
    expect(searchIsPinned()).toBe(false);
    expect(chosenEngine()).toBe('auto');
    vi.stubEnv('POLICY_SEARCH', 'none');
    expect(searchIsPinned()).toBe(true);
    expect(chosenEngine()).toBe('none');
  });

  it('ignores an engine name it does not know rather than failing', () => {
    // A typo in a deployment variable should not leave a service that cannot
    // decide how to search. Same rule as POLICY_PROVIDERS.
    vi.stubEnv('POLICY_SEARCH', 'bing');
    expect(searchIsPinned()).toBe(false);
    expect(chosenEngine()).toBe('auto');
  });
});
