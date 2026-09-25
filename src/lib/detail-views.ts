import type { Artefact } from './policy-analysis/contracts';
import { runCost, type RunCost } from './policy-analysis/view';
import { stepFlags } from './change-strip';

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

/**
 * WHAT A CAUSAL CHAIN KEEPS, beyond its citations: the five steps of its theory
 * of change and the mechanism it is written for.
 *
 * Phase 19 draws a strip per busy mechanism — what goes in, what is done, what
 * it produces, what changes, the end result — and marks the weakest step. The
 * five lists are the whole of that figure and were stubbed out with the rest.
 * Measured on the Post-16 run they are 331 KiB of the chains' 1,128 KiB, so
 * each entry is clipped to `STEP_CLIP` characters: the strip shows an entry's
 * opening and says how weak it is, and the full wording is one click away in
 * the drill, which still reads the unstubbed record.
 */
const CHAIN_STEPS = ['inputs', 'activities', 'outputs', 'outcomes', 'impacts'];
export const STEP_CLIP = 240;

export function stubForReport(artefact: Artefact): Artefact {
  if (!STUBBED_IN_REPORT.has(artefact.kind)) return artefact;
  const data: Record<string, unknown> = {};
  for (const key of CITATION_KEYS) {
    if (artefact.data?.[key] !== undefined) data[key] = artefact.data[key];
  }
  if (artefact.kind === 'causal_chain') {
    if (typeof artefact.data?.mechanismId === 'string') data.mechanismId = artefact.data.mechanismId;
    // The chain's own reading of where it breaks (stage 14 since prompt 3.2),
    // drawn on its strip; and how each entry reads, from the UNCLIPPED text,
    // so the clipped copy below is classified exactly as the pack's full one.
    if (typeof artefact.data?.weakestLink === 'string') data.weakestLink = artefact.data.weakestLink;
    data.stepFlags = stepFlags(artefact);
    for (const key of CHAIN_STEPS) {
      const steps = artefact.data?.[key];
      if (!Array.isArray(steps)) continue;
      data[key] = steps.map((step) => {
        const text = String(step);
        return text.length > STEP_CLIP ? `${text.slice(0, STEP_CLIP - 1).trimEnd()}…` : text;
      });
    }
  }
  return { ...artefact, statement: '', sourceQuote: null, section: null, url: null, data };
}

/**
 * `usage` IS DECLARED HERE OR THE COST IS SILENTLY ZERO.
 *
 * `runCost`'s parameter is `{ model?; usage?: unknown }[]`, so an array of calls
 * WITHOUT a `usage` member typechecks against it perfectly and returns all
 * zeros — the one failure shape a compiler cannot catch for you. It is `unknown`
 * rather than a row type on purpose: the column is jsonb and an ARRAY of usage
 * rows, because a call that needed a corrective round-trip appends its second
 * attempt rather than replacing the first, and `runCost` is the only thing that
 * should know that.
 */
type Call = { provider: string | null; model: string | null; usage?: unknown };

/**
 * A STAGE ROW, AS FAR AS THIS FILE NEEDS ONE.
 *
 * `stages` was `unknown`, which was true when this file only passed it through.
 * The report now needs the artefact count PER STAGE and the pack has no
 * `artefactMetadata` to derive one from, so the count is attached here, once,
 * where both readings get the same number.
 */
type Stage = { ordinal: number };

type Full = {
  analysis: unknown;
  stages: Stage[];
  passes: unknown;
  personas: unknown;
  heartbeat: unknown;
  artefactMetadata: { id: string; stage?: number }[];
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
  /*
   * GROUPED BY MODEL, AND THE PROVIDER IS FOUND RATHER THAN KEYED ON.
   *
   * A call that failed before it reached anything records its model and a NULL
   * provider — six of the real run's 421. Keying on `provider/model` split one
   * model into "codex/gpt-5.6-luna (413 calls)" and "gpt-5.6-luna (6 calls)" and
   * printed a run made by two models as though it were made by three. Found by
   * reading the row on the live service, which is the only thing that would have.
   */
  const counts = new Map<string, number>();
  const providers = new Map<string, string>();
  for (const call of calls) {
    if (!call.model) continue;
    counts.set(call.model, (counts.get(call.model) ?? 0) + 1);
    if (call.provider && !providers.has(call.model)) providers.set(call.model, call.provider);
  }
  // Busiest first: the model that made most of the assessment leads.
  return [...counts]
    .map(([model, n]) => {
      const provider = providers.get(model);
      return { id: provider ? `${provider}/${model}` : model, calls: n };
    })
    .sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id));
}

/**
 * `?view=report` — everything the report draws, and nothing else.
 *
 * THE DRILL STILL ASKS FOR EVERYTHING: it renders any artefact generically,
 * including the stubbed kinds, so it calls the endpoint without a view. This adds
 * an answer; it takes nothing away from the one that was there.
 */
export function forTheReport<T extends Full>(result: T) {
  const kept = keptByStage(result.artefactMetadata);
  return {
    analysis: result.analysis,
    // `kept` RATHER THAN A SECOND TALLY IN THE BROWSER. The report draws it, the
    // pack draws it, and the pack carries no `artefactMetadata` at all — so
    // deriving it in the component would have given the service a figure the
    // pack could not have, which is the disagreement `offline-run.ts` exists to
    // end. Attached here, both readings are the same arithmetic.
    stages: result.stages.map((stage) => ({ ...stage, kept: kept.get(stage.ordinal) ?? 0 })),
    passes: result.passes,
    personas: result.personas,
    heartbeat: result.heartbeat,
    artefactMetadata: result.artefactMetadata,
    artefacts: result.artefacts.map(stubForReport),
    models: modelsUsed(result.calls),
    cost: reportCost(result.calls),
  };
}

/**
 * How many artefacts each stage actually minted.
 *
 * Read off the metadata rows rather than off `stages[].output.rejected`, which
 * is the number 0 on all eighteen rows of the live run and is not a source for
 * anything. The distribution is the reason the report wants it: stage 2 minted
 * 1,275 of the run's 2,296 artefacts, stage 15 minted 409, and stage 12 minted
 * none at all — which no six flat cards can show, because the stage axis was
 * not on the page.
 */
export function keptByStage(metadata: { stage?: number }[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of metadata) {
    if (typeof row.stage !== 'number') continue;
    counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
  }
  return counts;
}

/**
 * WHAT THE RUN COST, AS EIGHT NUMBERS INSTEAD OF 241 KiB OF CALL LOG.
 *
 * `runCost` has existed in the copied view layer, under forty lines of
 * doc-comment about null-versus-zero pricing, with ZERO call sites anywhere in
 * the repo. The figure it computes — 61.8M tokens on the live run — was
 * rendered once, by `RunClock`, while the run was in flight, and unmounted with
 * it the moment the run ended. A reader asking "what did this cost" after the
 * fact had no answer anywhere in the product.
 *
 * NULL RATHER THAN A ROW OF ZEROS. A report view is asked for on runs whose
 * calls were never loaded and on runs that made none, and `{ total: 0, cash:
 * null }` drawn as four cards asserts a run that spent nothing. `cost.calls`
 * counts calls that actually REPORTED usage, which is the only population these
 * figures are true of.
 */
export function reportCost(calls: Call[] | undefined): RunCost | null {
  if (!calls?.length) return null;
  const cost = runCost(calls);
  return cost.calls ? cost : null;
}

/** One share of a run's tokens, as a word and a length. */
export type CostSegment = { key: string; label: string; tokens: number };

/**
 * THE FOUR TOKEN FIGURES ARE NOT FOUR CATEGORIES — two of them are inside the
 * other two.
 *
 * `cached` is the part of `input` served from cache and `reasoning` is the part
 * of `output` spent thinking; `runCost` says so in its own arithmetic, where
 * `total = input + output` and neither of the other two is added. So a
 * four-segment bar of input, cached, output and reasoning would sum to more
 * than the run and invent about 46M tokens on this assessment.
 *
 * Nested instead, which IS a partition: re-sent context, fresh input, reasoning
 * and answer sum to exactly `total`. That also gives the reading the figure is
 * worth having — that a 61.8M-token run is mostly context being re-sent rather
 * than the model thinking.
 *
 * CLAMPED, because the arithmetic is a provider's and not ours: a `cached`
 * larger than `input` would otherwise draw a negative segment, and a bar with a
 * negative part in it is a bar that lies quietly.
 */
export function costSegments(cost: RunCost): CostSegment[] {
  const cached = Math.max(0, Math.min(cost.cached, cost.input));
  const reasoning = Math.max(0, Math.min(cost.reasoning, cost.output));
  return [
    { key: 'cached', label: 'Input served from cache', tokens: cached },
    { key: 'fresh', label: 'Input sent fresh', tokens: Math.max(0, cost.input - cached) },
    { key: 'reasoning', label: 'Output spent reasoning', tokens: reasoning },
    { key: 'answer', label: 'Output kept as answer', tokens: Math.max(0, cost.output - reasoning) },
  ].filter((segment) => segment.tokens > 0);
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
