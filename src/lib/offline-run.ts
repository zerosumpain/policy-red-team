import { keptByStage, modelsUsed, reportCost } from './detail-views';
import type { OfflinePayload } from './policy-analysis/offline/payload';
import type { RunCost } from './policy-analysis/view';

/**
 * WHAT THE RUN ACTUALLY DID, CARRIED INTO THE PACK.
 *
 * A pack is the artefact that outlives the service, and its "How this was
 * produced" section is the one part of it whose entire job is saying what
 * happened. It was the part that lied.
 *
 * `OfflinePayload` carries the assessment's status and its warnings and nothing
 * about the run itself, so the pack's page invented the rest: `model: null`,
 * `thinkingLevel: null`, `depth: 'standard'`, and one synthetic stage per
 * warning with `status: 'completed'` hard-coded. On the real run that printed
 * Model "the configured default" for a run made by `codex/gpt-5.6-luna`, and
 * "Stages — 256 of 256 completed" for a run that failed at 17 of 18, directly
 * under its own header tag reading Failed. The service, from the same data, read
 * "17 of 18 completed".
 *
 * This is the missing half. It is a FORK-LOCAL addition rather than a field on
 * `OfflinePayload`, because that type is a verbatim copy of upstream's and every
 * edit to one of those is drift somebody has to reconcile later; the pack is this
 * fork's artefact, so the extra facts are this fork's to add. The payload goes
 * into the pack as JSON and comes back out as JSON, so an extra member travels
 * without anything in between needing to know about it.
 *
 * A PACK CARRIES ITS OWN RENDERER. The single `file://` document embeds the
 * script that draws it, so a pack built by this code is always read by this code
 * — there is no version of the page that can meet a payload without this field.
 * It is optional anyway, and its absence means "say nothing", never "assume".
 */
export type RunFacts = {
  /** The model the run was COMMISSIONED with — `null` only if the row has none. */
  model: string | null;
  /**
   * The models it was actually made of, busiest first.
   *
   * A pack outlives the service, so it has to carry the difference: an assessment
   * resumed after the configured default moved was made by two models, and a pack
   * naming one of them is the same lie the service used to tell.
   */
  models: { id: string; calls: number }[];
  thinkingLevel: string | null;
  depth: string;
  /**
   * The real stage rows: what was attempted, and what became of each one. The
   * pack needs `status` to count honestly and `name` to hang the warnings on.
   *
   * AND WHEN EACH ONE RAN, AND WHAT IT MINTED. The report draws the eighteen
   * stages as a ladder now — 8h 18m of a 10h 23m run went into one of them —
   * and both figures come off fields the pack did not carry: the timestamps
   * were hard-nulled on the way in, and `artefactMetadata` is `[]` offline, so
   * a pack would have drawn a ladder with no durations and no counts beside a
   * service that draws both. Two artefacts of one assessment that disagree
   * about how long it took are two reports, which is the whole argument of this
   * file.
   */
  stages: {
    ordinal: number;
    name: string;
    status: string;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    kept: number;
  }[];
  /**
   * What the run spent, where anything reported it.
   *
   * `null` means "nothing said", never "nothing spent" — the same rule the rest
   * of this file follows, and the same distinction `runCost` keeps between a
   * null price and a zero one.
   */
  cost: RunCost | null;
};

/** A payload that has been through `withRun`. */
export type PackPayload = OfflinePayload & { run?: RunFacts };

/**
 * A timestamp as the pack can carry it.
 *
 * The store hands these over as `Date`; the pack is JSON in a `file://`
 * document, where a Date is a string or it is nothing. Converting on the way IN
 * means the pack's reader never has to know which of the two it was handed.
 */
function iso(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const when = at instanceof Date ? at : new Date(at);
  return Number.isFinite(when.getTime()) ? when.toISOString() : null;
}

export function runFacts(input: {
  analysis: { model: string | null; thinkingLevel: string | null; depth: string };
  stages: {
    ordinal: number; name: string; status: string; error: string | null;
    startedAt?: Date | string | null; completedAt?: Date | string | null;
  }[];
  calls?: { provider: string | null; model: string | null; usage?: unknown }[];
  artefactMetadata?: { stage?: number }[];
}): RunFacts {
  const kept = keptByStage(input.artefactMetadata ?? []);
  return {
    model: input.analysis.model,
    models: modelsUsed(input.calls),
    thinkingLevel: input.analysis.thinkingLevel,
    depth: input.analysis.depth,
    stages: input.stages.map((stage) => ({
      ordinal: stage.ordinal,
      name: stage.name,
      status: stage.status,
      error: stage.error,
      startedAt: iso(stage.startedAt),
      completedAt: iso(stage.completedAt),
      kept: kept.get(stage.ordinal) ?? 0,
    })),
    cost: reportCost(input.calls),
  };
}
