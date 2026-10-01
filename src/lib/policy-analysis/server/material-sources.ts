import { fetchPage, PageError } from '$lib/server/fetch-page';
import { search } from '$lib/server/web-search';
import { chosenEngine } from '$lib/server/search';
import { safeSourceUrl } from '../contracts';
import { lookUpQuery } from '../reader-inputs';
import { PolicyError } from '../validation';
import type { Material } from './ingest';

/**
 * "I HAVE A SOURCE FOR THIS" AND "LOOK THIS UP", AFTER THE RUN (phase 22 part 2).
 *
 * Both go through the EXISTING material pass — phase 12's four stages that read
 * something against the conclusions already reached — because nothing is ever
 * re-run. What this adds is the step before: an address becomes the page's
 * text, and a look-up becomes what a search returned for it. Either way the
 * pass receives an ordinary plain-text document, and is told how it arrived
 * (`arrived` on the brief) so search excerpts are never read as a paper.
 *
 * SEALED RUNS: no page is fetched for one, and a look-up only if the reader
 * allowed that run to search — the rule the run itself was held to. An install
 * set to `none` fetches and searches nothing. Each refusal is said in words.
 */
export async function resolveMaterial(material: Material, analysis: { sealed: boolean; sealedResearch: boolean }, options: { signal?: AbortSignal; fetch?: typeof fetchPage; search?: typeof search } = {}): Promise<Material> {
  if (material.url) {
    if (analysis.sealed) throw new PolicyError('input', 'This assessment is sealed, so no page is fetched for it. Download the page and attach it as a file instead.');
    if (chosenEngine() === 'none') throw new PolicyError('input', 'This install is set not to reach the open web, so no page is fetched. Attach the page as a file instead.');
    let page;
    try { page = await (options.fetch ?? fetchPage)(material.url, { signal: options.signal, maxCharacters: 200_000 }); }
    catch (err) {
      options.signal?.throwIfAborted();
      throw new PolicyError('input', err instanceof PageError ? `${err.message} Attach it as a file instead.` : 'The page could not be read. Attach it as a file instead.');
    }
    const url = safeSourceUrl(page.finalUrl) ?? material.url;
    const text = `${page.title}\n${url}\n\n${page.text}`;
    return { ...material, url, filename: `${slug(page.title || new URL(url).hostname)}.txt`, mimeType: 'text/plain', bytes: Buffer.from(text) };
  }
  if (material.lookUp) {
    if (analysis.sealed && !analysis.sealedResearch) throw new PolicyError('input', 'This assessment is sealed and was not allowed to search, so nothing is looked up for it.');
    if (chosenEngine() === 'none') throw new PolicyError('input', 'This install is set not to look anything up.');
    const built = lookUpQuery(material.lookUp);
    if ('refused' in built) throw new PolicyError('input', built.refused);
    const found = await (options.search ?? search)(built.query, { maxResults: 5, searchDepth: 'basic', signal: options.signal });
    const results = (found.results ?? []).filter((r) => typeof r.url === 'string' && safeSourceUrl(r.url) && String(r.content ?? '').trim());
    if (!results.length) throw new PolicyError('input', 'The search found nothing for that. Try different words, or attach a source you already have.');
    // Plain text, one result to a block, each with its address: what the pass
    // reads, and what the reader can follow up. Labelled as excerpts, because
    // that is all a search result is.
    const text = [
      `Search results for: ${material.lookUp}`,
      'Each block below is a search excerpt, not the full source.',
      ...results.map((r) => `${String(r.title ?? r.url).trim()}\n${r.url}\n${String(r.content).trim().slice(0, 4_000)}`),
    ].join('\n\n');
    return { ...material, filename: `${slug(material.lookUp)}.txt`, mimeType: 'text/plain', bytes: Buffer.from(text) };
  }
  return material;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'source';
}
