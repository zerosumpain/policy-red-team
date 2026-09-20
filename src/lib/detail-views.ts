import type { Artefact } from './policy-analysis/contracts';

/**
 * TWO NARROWER ANSWERS TO "GIVE ME THIS ASSESSMENT".
 *
 * `detail()` returns the whole run, and the two pages that ask for it draw a
 * fraction of it. Measured on the live assessment, 4,489,881 bytes:
 *
 *   - `causal_chain` is 1,209 KiB over 150 rows, thirteen nested data keys each,
 *     and no code on the report path reads the kind at all. Nor `persona_link`,
 *     `research_question`, `assurance_challenge` or `option_appraisal`.
 *   - `calls` is 241 KiB of model-call records, and `executions`, `documents`
 *     and `inbound` are not even declared on the client's `Detail` type, so
 *     nothing in the browser could read them if it tried.
 *   - While a run is in flight the page re-read ALL of it on every stage
 *     boundary — eighteen times, growing as the run grows, 48.5 MB down one
 *     watching tab to render about 23 KiB of links and a stage list.
 *
 * HERE RATHER THAN IN THE ROUTE so the rules can be tested rather than trusted.
 * The stub in particular is a claim about what other code needs, and the cost of
 * getting it wrong is a section that quietly renders less — see the test.
 */

/**
 * Kinds the report never renders, so they travel as a stub.
 *
 * STUBBED, NOT DROPPED. `leverage()` — the stress lab's list of which assumptions
 * the assessment turns on — walks EVERY artefact counting `data.assumptions`,
 * `data.preconditions` and `data.hypothesisIds`, whatever its kind, and
 * `causal_chain` supplies 635 of those citations on the real run. Removing the
 * kind outright takes the lever list from 414 assumptions to 95: a 77% loss in a
 * section whose whole claim is "pull this and see what falls".
 */
export const STUBBED_IN_REPORT = new Set([
  'causal_chain', 'persona_link', 'research_question', 'assurance_challenge', 'option_appraisal',
]);

/** The three keys `leverage()` counts, on any artefact, whatever its kind. */
export const CITATION_KEYS = ['assumptions', 'preconditions', 'hypothesisIds'];

/** What the run index shows per kind, and therefore what a progress read sends. */
export const RUN_INDEX_CAP = 25;

export function stubForReport(artefact: Artefact): Artefact {
  if (!STUBBED_IN_REPORT.has(artefact.kind)) return artefact;
  const data: Record<string, unknown> = {};
  for (const key of CITATION_KEYS) {
    if (artefact.data?.[key] !== undefined) data[key] = artefact.data[key];
  }
  return { ...artefact, statement: '', sourceQuote: null, section: null, url: null, data };
}

type Call = { provider: string | null; model: string | null };

type Full = {
  analysis: unknown;
  stages: unknown;
  passes: unknown;
  personas: unknown;
  heartbeat: unknown;
  artefactMetadata: { id: string }[];
  artefacts: Artefact[];
  calls?: Call[];
};

/** What a run was actually made of, one entry per distinct provider and model. */
export type ModelUse = { id: string; calls: number };

/**
 * WHICH MODELS ACTUALLY RAN, AS A SUMMARY RATHER THAN AS THE CALL LOG.
 *
 * The provenance section named `analysis.model` — the model that was
 * COMMISSIONED — and presented it as the model the assessment was made with.
 * Those are the same thing until they are not: on 2026-09-20 a resumed stage of
 * the real run went out on `gpt-5.6-sol` while the other 419 calls had been
 * `gpt-5.6-luna`, because the configured default had moved in between. The
 * report went on naming one model for a run made by two, which is the exact
 * shape of defect the rest of this section exists to prevent.
 *
 * A SUMMARY, because the report view drops `calls` on purpose — 241 KiB of
 * model-call records that nothing in the browser reads. Two or three entries of
 * an id and a count answer the question those records were being carried for.
 *
 * `provider/model` is the spelling `analysis.model` uses, so the two are
 * comparable without anyone parsing anything.
 */
export function modelsUsed(calls: Call[] | undefined): ModelUse[] {
  if (!calls?.length) return [];
  const counts = new Map<string, number>();
  for (const call of calls) {
    if (!call.model) continue;
    const id = call.provider ? `${call.provider}/${call.model}` : call.model;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Busiest first: the model that made most of the assessment leads.
  return [...counts].map(([id, n]) => ({ id, calls: n })).sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id));
}

/**
 * `?view=report` — everything the report draws, and nothing else.
 *
 * THE DRILL STILL ASKS FOR EVERYTHING: it renders any artefact generically,
 * including the stubbed kinds, so it calls the endpoint without a view. This adds
 * an answer; it takes nothing away from the one that was there.
 */
export function forTheReport<T extends Full>(result: T) {
  return {
    analysis: result.analysis,
    stages: result.stages,
    passes: result.passes,
    personas: result.personas,
    heartbeat: result.heartbeat,
    artefactMetadata: result.artefactMetadata,
    artefacts: result.artefacts.map(stubForReport),
    models: modelsUsed(result.calls),
  };
}

/**
 * `?view=progress` — what a run in flight needs.
 *
 * TWENTY-FIVE PER KIND, WHICH IS WHAT THE INDEX SHOWS. `RunFindings` slices to 25
 * and then says "and N more", so the rows are capped and the true totals ride
 * along in `artefactCounts` — a cap that silently changed the count beside the
 * heading would be a worse answer than the big payload was.
 *
 * NOT A SHORTER LIST OF KINDS. The index picks its own kinds and that list lives
 * with the component; capping by kind without naming any of them means the two
 * cannot drift apart.
 */
export function forProgress<T extends Full>(result: T) {
  const counts: Record<string, number> = {};
  const shown: Artefact[] = [];
  for (const artefact of result.artefacts) {
    counts[artefact.kind] = (counts[artefact.kind] ?? 0) + 1;
    if (counts[artefact.kind] <= RUN_INDEX_CAP) {
      shown.push({ ...artefact, statement: '', sourceQuote: null, section: null, url: null, refs: [], data: {} });
    }
  }
  const ids = new Set(shown.map((artefact) => artefact.id));
  return {
    analysis: result.analysis,
    stages: result.stages,
    heartbeat: result.heartbeat,
    passes: [],
    personas: [],
    artefacts: shown,
    artefactCounts: counts,
    artefactMetadata: result.artefactMetadata.filter((row) => ids.has(row.id)),
  };
}
