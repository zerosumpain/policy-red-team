/**
 * THE MODEL'S NOTES ABOUT THE PAPER, APART FROM THE RUN'S OWN STATE (phase 23).
 *
 * A stage records two different things and used to keep them in one list:
 *
 * - the RUN's state — context clipped, output refused, references dropped,
 *   pages not read. The pipeline writes these sentences and the later stages
 *   need them, so the worker carries them into every later prompt under
 *   `WARNING_BUDGET`;
 * - the MODEL's remarks, from the `warnings` field of its reply — "the passage
 *   does not specify funding amounts". About the paper, never about the run.
 *
 * Since phase 23 the second kind is stored in `policy_stages.notes` and never
 * carried forward. This module is the one place that knows how to read the two
 * apart, for a stage written either side of that change.
 *
 * NOT A PATTERN MATCH. An older stage's notes are told apart by PROVENANCE:
 * the server lists every string the model actually wrote in its stored replies
 * (`legacyNotes` in `store.ts`) and a warning that is one of them is a note.
 * Matching the prose instead would be fitting regexes to how one paper
 * happened to be worded — the reason `stage-facts.ts` refuses to. A sealed run
 * stores no reply, so its older stages have no notes to find and read exactly
 * as they always did.
 */

/** A stage row as the store hands it over: `notes` absent on a reader older than the column. */
export type NotedStage = { ordinal: number; warnings: string[]; notes?: string[] | null; output?: unknown };

/** The split was made at write time from `contractVersion` 2 on (`worker.ts`). */
function splitAtSource(stage: NotedStage): boolean {
  const version = (stage.output as { contractVersion?: unknown } | null | undefined)?.contractVersion;
  return typeof version === 'number' && version >= 2;
}

/**
 * Every stage with `warnings` holding EVERYTHING the run noted and `notes` the
 * model's part of it.
 *
 * `warnings` stays the whole list on purpose: every existing reader — the Word
 * export, the pack, the brief, the step list's "N gaps" — counts what the
 * stage recorded, and a note about the paper is still a gap in the
 * assessment. Only the report's "What it could not establish" draws the two
 * apart, through `splitNotes`.
 *
 * `fromReplies` is what the model wrote, by stage ordinal, for stages written
 * before the split; it is ignored for any stage that already has its own.
 */
export function withNotes<T extends NotedStage>(stages: T[], fromReplies: Map<number, Set<string>> = new Map()): (T & { warnings: string[]; notes: string[] })[] {
  return stages.map((stage) => {
    const own = Array.isArray(stage.notes) ? stage.notes : [];
    if (own.length || splitAtSource(stage)) {
      return { ...stage, warnings: [...(stage.warnings ?? []), ...own], notes: own };
    }
    const written = fromReplies.get(stage.ordinal);
    const notes = written ? (stage.warnings ?? []).filter((w) => written.has(w.trim())) : [];
    return { ...stage, warnings: stage.warnings ?? [], notes };
  });
}

/**
 * One stage's record, parted: what the run could not do, and what the model
 * said the paper does not.
 *
 * A MULTISET, not a set difference: the same sentence can be both a note
 * twice and — vanishingly rarely — a machine line once, and taking every copy
 * out would lose the third.
 */
export function splitNotes(stage: { warnings?: string[] | null; notes?: string[] | null }): { limits: string[]; notes: string[] } {
  const owed = new Map<string, number>();
  for (const note of stage.notes ?? []) owed.set(note, (owed.get(note) ?? 0) + 1);
  const limits: string[] = [];
  for (const warning of stage.warnings ?? []) {
    const due = owed.get(warning) ?? 0;
    if (due > 0) { owed.set(warning, due - 1); continue; }
    limits.push(warning);
  }
  return { limits, notes: [...(stage.notes ?? [])] };
}

/**
 * A stage's record as a flat list, each line marked if it is the model's note.
 *
 * For the two places that flatten a run's record into `{ stage, text }` rows —
 * the pack and a shared copy — so the reader at the far end can still tell the
 * two apart. The order is the stage's own, and nothing is dropped.
 */
export function flagNotes(stage: { warnings?: string[] | null; notes?: string[] | null }): { text: string; note?: true }[] {
  const owed = new Map<string, number>();
  for (const note of stage.notes ?? []) owed.set(note, (owed.get(note) ?? 0) + 1);
  return (stage.warnings ?? []).map((text) => {
    const due = owed.get(text) ?? 0;
    if (due > 0) { owed.set(text, due - 1); return { text, note: true as const }; }
    return { text };
  });
}
