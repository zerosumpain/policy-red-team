import { search, extract } from '$lib/deepdive/tavily';
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

export type Research = (questions: Artefact[], signal: AbortSignal, maxResults?: number) => Promise<StageOutput>;
export const research: Research = async (questions, signal, maxResults = 3) => {
  const artefacts: Artefact[] = []; const warnings: string[] = [];
  // Priority order, so the budget below is spent on the questions this stage
  // thought mattered most. `pursue` has already stamped `priority`; a question
  // that somehow arrives without one sorts last rather than throwing.
  const ranked = [...questions].sort((a, b) => (Number(b.data.priority) || 0) - (Number(a.data.priority) || 0));
  let fullReads = Math.max(1, Math.ceil(ranked.length * maxResults * EXTRACT_SHARE));
  let skimmed = 0;
  for (const question of ranked) {
    signal.throwIfAborted();
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
      if (!results.length) warnings.push(`No sources found for ${question.label}.`);
      for (const result of results.slice(0, maxResults)) {
        if (typeof result.url !== 'string') continue;
        const url = safeSourceUrl(result.url);
        if (!url) continue;
        try { await assertPublicUrl(url); } catch { warnings.push('A non-public research source was rejected.'); continue; }
        let content = typeof result.content === 'string' ? result.content.slice(0, MAX_SOURCE_CHARACTERS) : '';
        let retrieval: 'full_text' | 'search_excerpt' = 'search_excerpt';
        const quality = classifyDomain(new URL(url).hostname);
        const wantsFullText = content.trim().length < EXCERPT_FLOOR || AUTHORITATIVE.has(quality.type);
        if (wantsFullText && fullReads > 0) {
          // Spent on the ATTEMPT, not on the success: the credit is billed either
          // way, and a provider that is failing would otherwise let one question
          // burn the whole budget retrying.
          fullReads--;
          try {
            const retrieved = await extract([url], signal);
            const body = retrieved.results.find((r) => r.url === url)?.raw_content;
            if (typeof body === 'string' && body.length > 100) { content = body.slice(0, MAX_SOURCE_CHARACTERS); retrieval = 'full_text'; }
          } catch { warnings.push(`Full text unavailable for ${new URL(url).hostname}; only its search excerpt is retained.`); }
        } else if (wantsFullText) {
          skimmed++;
        }
        if (!content.trim()) continue;
        artefacts.push(artefact(`source_${question.id}_${artefacts.length}`, 'research_source', String(result.title || new URL(url).hostname).slice(0, 300), content, {
          questionId: question.id, retrievedAt: new Date().toISOString(), quality: quality.type,
          qualityBasis: 'Existing site domain classification is a heuristic, not verification of this source’s claims.',
          freshness: 'Publication date not verified; retrieval date is recorded.', jurisdictionalRelevance: 'Requires evidence-matrix review.', retrieval,
          gap: retrieval === 'search_excerpt' ? 'Full text unavailable; conclusions must remain provisional.' : 'Extracted text may be incomplete; applicability requires review.',
        }, { origin: 'external_evidence', confidence: null, refs: [question.id], url }));
      }
    } catch {
      signal.throwIfAborted();
      warnings.push(`Research unavailable for ${question.label}. Authority, freshness and jurisdiction remain unverified.`);
    }
  }
  // Naming what was left skimmed is the point of having a budget: the reader can
  // see that a source was found, judged worth reading in full, and was not.
  if (skimmed) warnings.push(`${skimmed} source${skimmed === 1 ? '' : 's'} could have been read in full and ${skimmed === 1 ? 'was' : 'were'} kept as a search excerpt instead, because this pass had already read its limit in full. Evidence drawn from ${skimmed === 1 ? 'it' : 'them'} rests on a summary.`);
  if (!artefacts.length) warnings.push('External research produced no usable sources. This assessment is based on the policy and explicitly labelled inferences only.');
  return { artefacts, warnings };
};
