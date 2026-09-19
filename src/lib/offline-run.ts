import type { OfflinePayload } from './policy-analysis/offline/payload';

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
  /** The model the run was made with — `null` only if the row genuinely has none. */
  model: string | null;
  thinkingLevel: string | null;
  depth: string;
  /**
   * The real stage rows: what was attempted, and what became of each one. The
   * pack needs `status` to count honestly and `name` to hang the warnings on.
   */
  stages: { ordinal: number; name: string; status: string; error: string | null }[];
};

/** A payload that has been through `withRun`. */
export type PackPayload = OfflinePayload & { run?: RunFacts };

export function runFacts(input: {
  analysis: { model: string | null; thinkingLevel: string | null; depth: string };
  stages: { ordinal: number; name: string; status: string; error: string | null }[];
}): RunFacts {
  return {
    model: input.analysis.model,
    thinkingLevel: input.analysis.thinkingLevel,
    depth: input.analysis.depth,
    stages: input.stages.map((stage) => ({
      ordinal: stage.ordinal,
      name: stage.name,
      status: stage.status,
      error: stage.error,
    })),
  };
}
