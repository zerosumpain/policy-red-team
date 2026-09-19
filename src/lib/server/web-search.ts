import { providerById } from '$lib/llm/providers';
import { resolveProvider } from '$lib/llm/client';
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

function haveTavily(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
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

  const reply = await grounded.client.chat.completions.create(
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
            'than an acknowledged gap.',
        },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4_000,
    },
    { signal, maxRetries: 0 },
  );

  const content = reply.choices[0]?.message?.content ?? '';
  try {
    const parsed = JSON.parse(content) as TavilySearchResponse;
    const results = (parsed.results ?? [])
      .filter((r) => r && typeof r.url === 'string' && r.url.startsWith('http'))
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

/** Drop-in for `$lib/deepdive/tavily`'s `search`. Tavily where configured, grounded otherwise. */
export async function search(
  query: string,
  options?: Parameters<typeof tavilySearch>[1],
): Promise<TavilySearchResponse> {
  if (haveTavily()) return tavilySearch(query, options);
  return groundedSearch(query, options?.maxResults ?? 3, options?.signal);
}

/**
 * Drop-in for `extract`. A grounded model has already read the pages it cites,
 * so there is nothing further to fetch: every URL comes back as a failed
 * extraction with a reason, which is what `research.ts` already knows how to
 * record. Pretending otherwise would mean inventing page text.
 */
export async function extract(urls: string[], signal?: AbortSignal): Promise<TavilyExtractResponse> {
  if (haveTavily()) return tavilyExtract(urls, signal);
  return {
    results: [],
    failed_results: urls.map((url) => ({
      url,
      error: 'No extraction service configured; the grounded search excerpt is all this source has.',
    })),
  };
}
