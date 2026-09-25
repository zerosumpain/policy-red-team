import { instrument, resolveProvider } from '$lib/llm/client';
import { searchDomains, searchPlan } from '$lib/server/search';
import {
  search as tavilySearch,
  extract as tavilyExtract,
  type TavilyExtractResponse,
  type TavilySearchResponse,
} from '$lib/deepdive/tavily';

/**
 * WHERE RESEARCH GETS ITS SOURCES, when there is no Tavily account.
 *
 * `research.ts` imports `search` and `extract` straight from `$lib/deepdive/tavily`,
 * so an install without `TAVILY_API_KEY` plans its research questions, answers
 * NONE of them, and writes "Research unavailable … authority, freshness and
 * jurisdiction remain unverified" twelve times. Measured on the run of
 * 2026-09-19: twelve questions, zero sources. Every later stage that would cite
 * external evidence — the evidence matrix, the assurance review — then has
 * nothing to weigh, which is the difference between "this claim is unverified"
 * and "this claim contradicts the published outcome data".
 *
 * Meanwhile the Codex bridge has served `/v1/grounded/chat/completions` all
 * along: the same chat call with web search switched on, billed to a
 * subscription the reader is already paying for.
 *
 * THIS MODULE IS THE SWITCH, and it exists so the divergence in `research.ts` is
 * ONE LINE — its import. Everything decided here is fork-written: upstream's
 * file keeps its shape, `sync-core.mjs` re-applies a single substitution, and a
 * future upstream change to the research stage does not collide with our choice
 * of search engine.
 *
 * TAVILY STILL WINS WHERE IT IS CONFIGURED. It returns ranked results with
 * scores and can fetch a page's full text; a grounded model returns prose with
 * citations. The first is better evidence when it is available, so a key keeps
 * its precedence and nothing changes for an install that has one.
 */

/**
 * WHAT THIS RUN WILL ACTUALLY DO ABOUT SOURCES.
 *
 * `search.ts` holds the decision and the sentence that explains it; this asks it
 * whether the active provider has a grounded endpoint, which is the one fact it
 * cannot know. The result is used to SHORT-CIRCUIT: an install that has said it
 * does not look things up should skip the asking, not discover the answer once
 * per question at the cost of a model call each time.
 */
async function plan(): Promise<{ kind: 'tavily' | 'grounded' | 'none'; why: string }> {
  const { definition, config, problem } = await resolveProvider();
  const grounded = !problem && Boolean(definition.grounded?.(config));
  return searchPlan(grounded);
}

/**
 * One grounded question, answered by whichever provider is serving this run.
 *
 * The prompt asks for JSON so the reply can be turned into result rows. A
 * grounded model is not a search index and will not always comply; anything
 * unparseable comes back as a single result carrying the prose, because a
 * source with a citation the reader can follow beats a warning saying nothing
 * was found.
 */
async function groundedSearch(query: string, maxResults: number, signal?: AbortSignal): Promise<TavilySearchResponse> {
  const { definition, config, problem } = await resolveProvider();
  if (problem) return { results: [] };
  const grounded = definition.grounded?.(config);
  if (!grounded) return { results: [] };

  /*
   * COUNTED AND CHARGED LIKE ANY OTHER CALL.
   *
   * These go through the provider's own client, built by `grounded()`, which
   * never passed through `instrument()` — so up to twenty-four research calls a
   * run reached neither the token ledger nor the spend ceiling. On a
   * subscription that bills nothing per call, a budget that cannot see a
   * quarter of the traffic is a budget that does not exist, which is exactly
   * what 2026-09-19 demonstrated for the run as a whole.
   */
  const client = instrument(definition.id, grounded.client);

  const allowed = searchDomains();
  const reply = await retrying((attempt) => client.chat.completions.create(
    {
      model: grounded.model,
      messages: [
        {
          role: 'system',
          content:
            'Search the web and answer with JSON only: {"results":[{"title","url","content","score"}],"answer":""}. ' +
            `Return at most ${maxResults} results, each a real page you actually consulted, with its URL exactly as ` +
            'you retrieved it and `content` a faithful extract of what that page says about the question — not a ' +
            'paraphrase of your own view. `score` is 0–1 for how directly the page bears on the question. If you ' +
            'cannot search, return {"results":[]} rather than answering from memory: an invented source is worse ' +
            'than an acknowledged gap.' +
            // THE SAME RESTRICTION BOTH WAYS. A reader who has said "only these
            // domains" means it whichever engine answers, and a model that is
            // not told will cheerfully cite anything. It is a prompt and not a
            // guarantee, which is why the filter below also drops what comes
            // back — belt and braces, because only one of them is enforceable.
            (allowed.length ? ` Only use pages on these domains: ${allowed.join(', ')}.` : ''),
        },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4_000,
    },
    { signal: attempt, maxRetries: 0 },
  ), { signal });

  const content = reply.choices[0]?.message?.content ?? '';
  try {
    const parsed = JSON.parse(content) as TavilySearchResponse;
    const results = (parsed.results ?? [])
      .filter((r) => r && typeof r.url === 'string' && r.url.startsWith('http'))
      // ASKED IN THE PROMPT, ENFORCED HERE. A model told to stay on a list of
      // domains mostly will; "mostly" is not a restriction an institution can
      // rely on, and dropping the rest costs nothing.
      .filter((r) => onAllowedDomain(String(r.url), allowed))
      .slice(0, maxResults)
      .map((r) => ({
        title: String(r.title ?? r.url),
        url: String(r.url),
        content: String(r.content ?? ''),
        score: typeof r.score === 'number' ? r.score : 0.5,
      }));
    return { results, answer: typeof parsed.answer === 'string' ? parsed.answer : undefined };
  } catch {
    return { results: [] };
  }
}

/**
 * A GROUNDED SEARCH IS ASKED AGAIN WHEN THE SERVICE SAID "NOT NOW", within bounds.
 *
 * Research runs the run's own lanes — six by default — so a grounded endpoint
 * that rate-limits is now met six requests at a time, and a single 429 used to
 * cost its question for good: "Research unavailable" for something that would
 * have answered two seconds later. And a call with no deadline of its own could
 * hold a lane for as long as the service cared to take.
 *
 * So each try gets its own deadline, and a 429 or a 5xx is tried again after a
 * short wait, at most twice. Nothing else is: a 4xx is the service refusing the
 * request on its merits, and a try that ran out of time is the deadline doing
 * its job. The run's own signal still ends everything at once.
 */
export const GROUNDED_TIMEOUT_MS = 120_000;
const GROUNDED_BACKOFF_MS = [2_000, 8_000] as const;
const retryable = (err: unknown) => {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' && (status === 429 || status >= 500);
};
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
export async function retrying<T>(
  call: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> } = {},
): Promise<T> {
  const sleep = options.sleep ?? pause;
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(options.timeoutMs ?? GROUNDED_TIMEOUT_MS);
    try {
      return await call(options.signal ? AbortSignal.any([options.signal, deadline]) : deadline);
    } catch (err) {
      const wait = GROUNDED_BACKOFF_MS[attempt];
      if (wait === undefined || !retryable(err) || options.signal?.aborted) throw err;
      await sleep(wait, options.signal);
    }
  }
}

/** Whether a URL is on the configured allow-list. An empty list allows everything. */
function onAllowedDomain(url: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  // A suffix match on a DOT boundary, so `gov.uk` admits `www.gov.uk` and
  // `data.gov.uk` and refuses `notgov.uk` — which a bare `endsWith` would let
  // through, and which is the whole point of an allow-list.
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Drop-in for `$lib/deepdive/tavily`'s `search`. Whatever the reader configured. */
export async function search(
  query: string,
  options?: Parameters<typeof tavilySearch>[1],
): Promise<TavilySearchResponse> {
  const { kind } = await plan();
  // NOT ASKED AT ALL. The stage records it could not search, exactly as it
  // already does when a search comes back empty — but it does so without
  // spending a model call per question to find out.
  if (kind === 'none') return { results: [] };
  if (kind === 'tavily') {
    const allowed = searchDomains();
    return tavilySearch(query, allowed.length ? { ...options, includeDomains: allowed } : options);
  }
  return groundedSearch(query, options?.maxResults ?? 3, options?.signal);
}

/**
 * Drop-in for `extract`. A grounded model has already read the pages it cites,
 * so there is nothing further to fetch: every URL comes back as a failed
 * extraction with a reason, which is what `research.ts` already knows how to
 * record. Pretending otherwise would mean inventing page text.
 */
export async function extract(urls: string[], signal?: AbortSignal): Promise<TavilyExtractResponse> {
  const { kind } = await plan();
  if (kind === 'tavily') return tavilyExtract(urls, signal);
  return {
    results: [],
    failed_results: urls.map((url) => ({
      url,
      error: 'No extraction service configured; the grounded search excerpt is all this source has.',
    })),
  };
}
