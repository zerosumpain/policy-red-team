import { search, extract } from '$lib/server/web-search';
import { classifyDomain } from '$lib/deepdive/credibility';
import { assertPublicUrl } from '$lib/server/ssrf-guard';
import { artefact, safeSourceUrl, type Artefact, type StageOutput } from '../contracts';

/**
 * RETRIEVAL IS INSTANT BY DEFAULT AND ESCALATES ON WHAT IT FINDS.
 *
 * This ran `searchDepth: 'advanced'` AND `extract()` on every URL — the most
 * expensive configuration Tavily offers, on every source, of every question, of
 * every assessment, whether or not anything needed it. Tavily bills an advanced
 * search at two credits against basic's one, and extract per five URLs, so the
 * shipped policy paid roughly double for the search and then paid again to read
 * every result in full.
 *
 * What replaces it is three tiers, and every escalation is triggered by what the
 * pipeline already knows rather than by a new judgement:
 *
 *   INSTANT       basic search, excerpt only            always
 *   RICHER SEARCH re-search at advanced                 the instant pass came
 *                                                       back empty or thin
 *   FULL TEXT     extract() that one URL                the excerpt cannot carry
 *                                                       an answer, or the source
 *                                                       is authoritative — and
 *                                                       the budget is not spent
 *
 * The budget, not a priority threshold, is the control. Measured on production
 * 2026-09-17, the model scores its own questions between 0.540 and 0.941 with a
 * median of 0.729 — a compressed band near the top, so any absolute floor either
 * admits everything or is arbitrary. Ranking by priority and spending a fixed
 * number of full reads is self-calibrating: the questions the stage thought
 * mattered most get read properly, and a model that scores everything 0.9 cannot
 * defeat it.
 */

/**
 * Below this, an excerpt is a search snippet rather than an answer.
 *
 * Measured on production 2026-09-17 across the sources that were never read in
 * full: mean 661 characters, MEDIAN 154. Most search excerpts are a sentence and
 * an ellipsis, which is enough to judge whether a source is worth reading and not
 * enough to draw evidence from.
 */
const EXCERPT_FLOOR = 1_200;

/**
 * How much of one retrieval pass may be read in full.
 *
 * Half. Low enough that the default really is instant — a call that finds twelve
 * usable sources reads six of them properly — and high enough that a question
 * whose every result is a snippet still comes back with something to reason
 * from. Whatever is left unread says so in a warning, because "we found this and
 * only skimmed it" is a limit of the assessment, not an implementation detail.
 */
const EXTRACT_SHARE = 0.5;

/** Domain classes worth reading whole even when the excerpt would have done. */
const AUTHORITATIVE = new Set(['government', 'academic']);

const MAX_SOURCE_CHARACTERS = 10_000;

/**
 * `lanes` is how many questions, and how many full reads, are in flight at once.
 * The run's own agent count is what `pipeline.ts` passes; absent, one at a time.
 */
export type Research = (questions: Artefact[], signal: AbortSignal, maxResults?: number, lanes?: number) => Promise<StageOutput>;

/** A search result that survived the URL checks, before anyone decides whether to read it. */
type Candidate = { url: string; title: string; excerpt: string; quality: ReturnType<typeof classifyDomain>; wantsFullText: boolean; read: boolean; body: string | null; failed: boolean };
/** What one question's search produced, in the order it produced it. */
type Found = { question: Artefact; steps: ({ warning: string } | { candidate: Candidate })[] };

/** `fn` over `items`, at most `lanes` at a time, results in item order. */
async function pooled<T, R>(items: T[], lanes: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const k = next++;
      results[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, lane));
  return results;
}

/**
 * CONCURRENT, AND STILL DETERMINISTIC ABOUT WHAT IS READ IN FULL.
 *
 * This was one question at a time: search, maybe search again, then one
 * extract at a time for each result. Measured on the review of 25 September
 * 2026: 11.7 to 15.6 minutes of wall clock per research round for about 1.5
 * minutes of model time — the whole enquiry was waiting on the network, one
 * request after another.
 *
 * Three phases now, and the middle one is why the answer does not change:
 *
 *   SEARCH     every question, `lanes` at a time
 *   ALLOCATE   the full-read budget, spent in priority order over the results
 *              — the same walk the serial loop made, question by question and
 *              result by result, so the same sources are chosen
 *   READ       the chosen extracts, `lanes` at a time
 *
 * Allocating AFTER the searches and BEFORE any extract is what keeps it
 * deterministic: under a free-for-all the budget would go to whichever
 * question's search came back first, and which sources the evidence matrix
 * reads in full would depend on network timing. The artefacts, their ids and
 * the warnings are then assembled in question order, exactly as before.
 */
export const research: Research = async (questions, signal, maxResults = 3, lanes = 1) => {
  const artefacts: Artefact[] = []; const warnings: string[] = [];
  // Priority order, so the budget below is spent on the questions this stage
  // thought mattered most. `pursue` has already stamped `priority`; a question
  // that somehow arrives without one sorts last rather than throwing.
  const ranked = [...questions].sort((a, b) => (Number(b.data.priority) || 0) - (Number(a.data.priority) || 0));

  const found = await pooled(ranked, lanes, async (question): Promise<Found> => {
    const steps: Found['steps'] = [];
    if (signal.aborted) return { question, steps };
    const query = String(question.data.searchStrategy).slice(0, 350);
    try {
      if (/@|https?:|[\r\n]/.test(query)) throw new Error('unsafe query');
      let found = await search(query, { maxResults, searchDepth: 'basic', signal });
      let results = Array.isArray(found.results) ? found.results : [];
      // A thin instant pass is the one signal that the query itself needed more
      // work, and it is worth exactly one more credit to find out. Half of what
      // was asked for is the line: fewer than that and the evidence matrix is
      // reasoning from one source about a question it was told mattered.
      if (results.length < Math.ceil(maxResults / 2)) {
        signal.throwIfAborted();
        found = await search(query, { maxResults, searchDepth: 'advanced', signal });
        // KEEP WHICHEVER PASS FOUND MORE. Replacing unconditionally means an
        // escalation can LOSE sources: a narrow policy query that returns one
        // result at basic depth and none at advanced would end with zero and a
        // "no sources found" warning, having thrown away the one it had.
        const richer = Array.isArray(found.results) ? found.results : [];
        if (richer.length > results.length) results = richer;
      }
      if (!results.length) steps.push({ warning: `No sources found for ${question.label}.` });
      for (const result of results.slice(0, maxResults)) {
        if (typeof result.url !== 'string') continue;
        const url = safeSourceUrl(result.url);
        if (!url) continue;
        try { await assertPublicUrl(url); } catch { steps.push({ warning: 'A non-public research source was rejected.' }); continue; }
        const excerpt = typeof result.content === 'string' ? result.content.slice(0, MAX_SOURCE_CHARACTERS) : '';
        const quality = classifyDomain(new URL(url).hostname);
        const wantsFullText = excerpt.trim().length < EXCERPT_FLOOR || AUTHORITATIVE.has(quality.type);
        steps.push({ candidate: { url, title: String(result.title || new URL(url).hostname).slice(0, 300), excerpt, quality, wantsFullText, read: false, body: null, failed: false } });
      }
    } catch {
      // A search that failed leaves nothing behind but its warning, and the
      // warning never carries the provider's own message.
      return { question, steps: [{ warning: `Research unavailable for ${question.label}. Authority, freshness and jurisdiction remain unverified.` }] };
    }
    return { question, steps };
  });
  signal.throwIfAborted();

  // The budget, walked in the order the serial loop walked it.
  let fullReads = Math.max(1, Math.ceil(ranked.length * maxResults * EXTRACT_SHARE));
  let skimmed = 0;
  const toRead: Candidate[] = [];
  for (const { steps } of found) {
    for (const step of steps) {
      if (!('candidate' in step) || !step.candidate.wantsFullText) continue;
      // Spent on the ATTEMPT, not on the success: the credit is billed either
      // way, and a provider that is failing would otherwise let one question
      // burn the whole budget retrying.
      if (fullReads > 0) { fullReads--; step.candidate.read = true; toRead.push(step.candidate); }
      else skimmed++;
    }
  }

  await pooled(toRead, lanes, async (candidate) => {
    if (signal.aborted) { candidate.failed = true; return; }
    try {
      const retrieved = await extract([candidate.url], signal);
      const body = retrieved.results.find((r) => r.url === candidate.url)?.raw_content;
      if (typeof body === 'string' && body.length > 100) candidate.body = body.slice(0, MAX_SOURCE_CHARACTERS);
    } catch { candidate.failed = true; }
  });
  signal.throwIfAborted();

  // Assembled in question order and result order, so the ids — which count the
  // artefacts minted so far — and the warnings are the ones a serial run wrote.
  for (const { question, steps } of found) {
    for (const step of steps) {
      if (!('candidate' in step)) { warnings.push(step.warning); continue; }
      const candidate = step.candidate;
      if (candidate.failed) warnings.push(`Full text unavailable for ${new URL(candidate.url).hostname}; only its search excerpt is retained.`);
      const retrieval: 'full_text' | 'search_excerpt' = candidate.body !== null ? 'full_text' : 'search_excerpt';
      const content = candidate.body ?? candidate.excerpt;
      if (!content.trim()) continue;
      artefacts.push(artefact(`source_${question.id}_${artefacts.length}`, 'research_source', candidate.title, content, {
        questionId: question.id, retrievedAt: new Date().toISOString(), quality: candidate.quality.type,
        qualityBasis: 'Existing site domain classification is a heuristic, not verification of this source’s claims.',
        freshness: 'Publication date not verified; retrieval date is recorded.', jurisdictionalRelevance: 'Requires evidence-matrix review.', retrieval,
        gap: retrieval === 'search_excerpt' ? 'Full text unavailable; conclusions must remain provisional.' : 'Extracted text may be incomplete; applicability requires review.',
      }, { origin: 'external_evidence', confidence: null, refs: [question.id], url: candidate.url }));
    }
  }
  // Naming what was left skimmed is the point of having a budget: the reader can
  // see that a source was found, judged worth reading in full, and was not.
  if (skimmed) warnings.push(`${skimmed} source${skimmed === 1 ? '' : 's'} could have been read in full and ${skimmed === 1 ? 'was' : 'were'} kept as a search excerpt instead, because this pass had already read its limit in full. Evidence drawn from ${skimmed === 1 ? 'it' : 'them'} rests on a summary.`);
  if (!artefacts.length) warnings.push('External research produced no usable sources. This assessment is based on the policy and explicitly labelled inferences only.');
  return { artefacts, warnings };
};
