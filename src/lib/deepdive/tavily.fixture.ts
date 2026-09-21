import type { TavilyExtractResponse, TavilySearchResponse } from './tavily';

/**
 * A SEARCH SERVICE THE FIXTURE BUILD CANNOT REACH.
 *
 * The fixture build's guarantee is that the bundle cannot spend anybody's money
 * or send anybody's paper anywhere, and `build.mjs` enforces it by asserting
 * that no service endpoint survives in the output. Until phase 18 that
 * assertion named the MODEL providers and not Tavily — which was an accurate
 * description of what had been thought about rather than of what the bundle
 * could do.
 *
 * Tavily is metered and it is an external service that receives the text of the
 * reader's research questions. A fixture run that could call it would be a
 * fixture run that spends money and leaks a query, and the only reason the
 * browser walk never did is that it happens not to configure a key — an
 * incidental property of a test, standing in for a structural guarantee.
 *
 * So `api.tavily.com` is on the forbidden list now, and this is what takes its
 * place: the same two functions, returning what the research stage already
 * knows how to record for a source it could not retrieve. The pipeline runs
 * unchanged and finishes "with gaps", which is exactly what an install with no
 * search does for real.
 */

const unreachable = 'This build was compiled with the fixture search service and cannot reach one.';

export async function search(): Promise<TavilySearchResponse> {
  return { results: [] };
}

export async function extract(urls: string[]): Promise<TavilyExtractResponse> {
  return {
    results: [],
    failed_results: urls.map((url) => ({ url, error: unreachable })),
  };
}

export type { TavilyExtractResponse, TavilySearchResponse, TavilySearchResult, TavilyExtractResult } from './tavily';
