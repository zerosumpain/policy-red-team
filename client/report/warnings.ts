/**
 * THE REASONS OUTPUT WAS REFUSED — the part `stage-facts.ts` does not do.
 *
 * An assessment is what survived. Nothing in this client rendered stage
 * warnings at all, and on the Post-16 run there were 256 of them holding the
 * numbers that decide whether the report is overclaiming: 68 groups of model
 * output discarded, 80 artefacts refused by a stage contract, 113 references
 * dropped, 4 pages never analysed.
 *
 * The largest single reason is 26 plays rejected for resting on something other
 * than an assumption — so forty-seven plays survived out of seventy-three
 * written. A report that says "47 plays" without that number is overclaiming,
 * which is why this is a view rather than a footnote.
 *
 * COUNTING IS NOT DONE HERE. `$lib/policy-analysis/stage-facts` already parses
 * this prose, is copied from upstream, and was wired to nothing — so the first
 * cut of this file grew a second parser of the same sentences and promptly
 * disagreed with it, recognising four shapes where the copied one recognises
 * eight. Measured on the Post-16 run, that cost 227 "not covered" and 22
 * "unavailable" items, filed instead under "notes about what the paper does not
 * say" — including "176 of 398 source mentions were never resolved into a named
 * body", which is not a thing the paper failed to say but a thing the run
 * failed to do, in a view whose whole premise is that distinction.
 *
 * So `stageFacts()` counts. What is left here is the roll-up by REASON, which
 * it does not do: one line saying "26 plays rejected for resting on something
 * other than an assumption" changes what the report claims about itself, and
 * forty-one separate warnings saying the same thing do not.
 *
 * It parses prose, and that is still a stopgap. The durable version emits these
 * reasons from the stage writer as structured output.
 */

/** One discarded group: the count, the reason, and the ids it names. */
export type Refusal = { count: number; reason: string; affected: string };

const REFUSAL = /^(\d+)\s+model\s+outputs?\s+(?:was|were)\s+discarded[^—-]*[—-]\s*(.*)$/i;

/** Reads a discard warning, or null when the sentence is a different shape. */
export function parseRefusal(text: string): Refusal | null {
  const m = REFUSAL.exec(text.trim());
  if (!m) return null;
  const tail = m[2] ?? '';
  // The tail is "<reason>. Affected: <ids>" — the reason is what a reader needs,
  // the ids are what an author needs, so both are kept and shown apart.
  const split = tail.search(/\bAffected:/i);
  return {
    count: Number(m[1]),
    reason: (split >= 0 ? tail.slice(0, split) : tail).trim().replace(/[.\s]+$/, ''),
    affected: split >= 0 ? tail.slice(split + 'Affected:'.length).trim() : '',
  };
}

/**
 * The contract errors are zod's, and unreadable as they stand:
 * `claim data.category: Invalid option: expected one of "objective"|"problem"|…`
 *
 * A reader needs to know what was thrown away and roughly why; the enum is
 * noise at thirteen options. This leads with a human sentence and keeps the
 * contract's own words for anyone who needs them — it never replaces them,
 * because the exact reason is the only thing that makes a discard checkable.
 */
export function humaniseReason(reason: string): string {
  // NOT ANCHORED. The real sentence is `An artefact did not match its stage
  // contract (claim data.category: Invalid option: expected one of …)`, so an
  // anchored pattern matched nothing the pipeline actually writes — 66 of the
  // Post-16 run's 80 refusals printed their raw zod dump, which is the exact
  // output this function exists to replace.
  const enumMatch = /(\w+)\s+data\.(\w+):\s*Invalid option: expected one of ([^)]+)/i.exec(reason);
  if (enumMatch) {
    const [, kind, field, options] = enumMatch;
    const count = options.split('|').length;
    return `${plural(kind)} filed under a ${field} the contract does not define — not one of the ${count} values it allows`;
  }
  /*
   * THE SAME ENUM, WITH NO `data.` IN FRONT OF IT.
   *
   * One refusal on the live run is the shape `An artefact did not match the
   * contract (id: Invalid input: expected string, received undefined; kind:
   * Invalid option: expected one of "passage"|…|"persona_link"; label: Invalid
   * input: expected string, received undefined)` — the artefact failed before it
   * had a kind to name, so the fields are bare and the branch above, which
   * requires a `data.` segment, matched nothing. It printed its raw 29-option
   * zod dump over six lines in the OUTER table cell, which is the exact output
   * this function exists to replace, and visibly the worst block in the panel.
   *
   * The missing fields are read off the reason rather than asserted, so a future
   * refusal missing only its label says so. Options are counted by splitting on
   * `|` exactly as the branch above does, and the enum is cut at the first `;`
   * so the fields listed after it are not counted as a thirtieth value.
   */
  const bareEnum = /(?:^|[(;]\s*)(\w+):\s*Invalid option: expected one of ([^);]+)/i.exec(reason);
  if (/did not match the contract/i.test(reason) && bareEnum) {
    const [, field, options] = bareEnum;
    const count = options.split('|').length;
    const absent = [...reason.matchAll(/(\w+):\s*Invalid input: expected string, received undefined/gi)]
      .map((m) => m[1])
      .filter((name) => name !== field);
    const missing = absent.length
      ? `An artefact arrived with ${list(absent.map((name) => `no ${name}`))}, and a ${field}`
      : `An artefact arrived with a ${field}`;
    return `${missing} the contract does not define — not one of the ${count} values it allows`;
  }
  if (/does not belong to this stage/i.test(reason)) {
    const kind = /kind “([^”]+)”/.exec(reason)?.[1];
    return `${kind ? plural(kind) : 'Artefacts'} produced by a stage that does not write them`;
  }
  if (/required/i.test(reason) && /data\./.test(reason)) {
    const field = /data\.(\w+)/.exec(reason)?.[1];
    return `Output missing ${field ? `its ${field}` : 'a required field'}`;
  }
  return reason;
}

function plural(kind: string): string {
  const word = kind.replaceAll('_', ' ');
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}${word.endsWith('s') ? '' : 's'}`;
}

/** "no id and no label"; "a, b and c". A comma-spliced list is not English. */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Discards rolled up by reason, largest first.
 *
 * The roll-up is the finding. One line saying "26 plays rejected for resting on
 * something other than an assumption" changes what the report claims about
 * itself; forty-one separate warnings saying the same thing do not.
 */
export function byReason(warnings: string[]): { reason: string; human: string; count: number; affected: string[] }[] {
  const seen = new Map<string, { reason: string; human: string; count: number; affected: string[] }>();
  for (const text of warnings) {
    const refusal = parseRefusal(text);
    if (!refusal) continue;
    const existing = seen.get(refusal.reason);
    if (existing) {
      existing.count += refusal.count;
      if (refusal.affected) existing.affected.push(refusal.affected);
    } else {
      seen.set(refusal.reason, {
        reason: refusal.reason,
        human: humaniseReason(refusal.reason),
        count: refusal.count,
        affected: refusal.affected ? [refusal.affected] : [],
      });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count);
}

/**
 * A WARNING AS ENGLISH, WITHOUT TOUCHING THE STORED TEXT.
 *
 * `validation.ts` builds "${n} model output${n === 1 ? ' was' : 's were'}
 * discarded and are not part of this assessment" — the first verb is inflected
 * for number and the trailing `are` is written in. On the real run 26 of the 256
 * warnings take the singular branch and print, in front of a reader, "1 model
 * output was discarded and are not part of this assessment". The project's own
 * test expects the correct wording, so the generator and the test already
 * disagree.
 *
 * FIXED HERE AND NOT AT THE SOURCE, deliberately. `pipeline.ts` counts discarded
 * groups by matching the literal substring "discarded and are not part of this
 * assessment", and that count is the figure at the top of the Provenance panel —
 * so repairing the sentence where it is written would silently zero part of it,
 * and `validation.ts` is a verbatim copy besides. The stored string stays
 * byte-identical to upstream's and the reader gets English.
 */
export function readable(text: string): string {
  return text
    .replace(
      /\b(1 model output was discarded and) are (not part of this assessment)/g,
      '$1 is $2',
    )
    /*
     * A SECOND TEMPLATE WITH THE SAME DEFECT, PRINTED SIX TIMES.
     *
     * "1 group of model output were discarded in this stage." is a different
     * string from the one above, so the repair above never touched it, and it
     * was on the live page as row four of the eight visible limits — recorded
     * six times, in Entity resolution, Policy knowledge graph, Actor and
     * incentive profiles, Adversarial scenarios, Synthesis and Options and
     * evaluation.
     *
     * VERIFIED SAFE AGAINST EVERY READER OF THE STRING, which is the only
     * reason this can be done here at all: the substring `pipeline.ts` counts
     * on is "discarded and are not part of this assessment" and lives in the
     * OTHER template; `stageFacts`'s discard rule tests /\b(were|was)
     * discarded\b/ and matches either way; and `byReason`'s REFUSAL pattern
     * requires "model output(s) (was|were) discarded" and matches the "group
     * of" shape neither before nor after, so the 90-of-162 split is unmoved.
     */
    .replace(
      /\b(1 group of model output) were (discarded)\b/g,
      '$1 was $2',
    );
}

/**
 * A LIMIT LEADS WITH ITS FIRST SENTENCE, and keeps the inventory behind it.
 *
 * `summarise()` is the wrong split for these and the rendered page said so: it
 * trusts a full stop followed by a space and a CAPITAL, because policy prose is
 * full of abbreviations, and every boundary in a machine-written limit is
 * followed by a DIGIT — "…so its input was reduced. 18 long items clipped to
 * 250 characters…". It found none and printed all six lines as the lead.
 *
 * A machine-written limit always opens with the fact and continues with the
 * inventory, so the first full stop is the split. The floor keeps a two-word
 * opener from becoming a lead of its own.
 *
 * MOVED HERE FROM `Report.tsx`, where it was declared inside the render and
 * applied only at DRAW time — after the grouping above it had already keyed on
 * the whole warning, which is why five of the eight visible rows were the same
 * sentence. A key and the thing it renders have to be the same function.
 */
export const LIMIT_FLOOR = 24;

export function limitLead(text: string): { lead: string; rest: string } {
  const boundary = text.slice(LIMIT_FLOOR).search(/[.!?]\s/);
  if (boundary < 0) return { lead: text, rest: '' };
  const at = LIMIT_FLOOR + boundary + 1;
  return { lead: text.slice(0, at).trim(), rest: text.slice(at).trim() };
}

/** Whatever a caller has of a stage: enough to say which one recorded what. */
export type StageWarnings = { name: string; warnings: string[] };

/** One fact the run recorded, the stages that recorded it, and what each withheld. */
export type LimitGroup = {
  lead: string;
  total: number;
  stages: { name: string; count: number; tails: string[] }[];
};

/**
 * THE 270 LIMITS, GROUPED ON THE SENTENCE THE PAGE ACTUALLY PRINTS.
 *
 * Measured on the live run: 270 warnings, 231 distinct texts, 181 distinct
 * leads. Keying on the whole text — which is what `Report.tsx` did — put FIVE
 * copies of "This call exceeded the model's context window, so its input was
 * reduced." in the eight rows a reader is shown, differing only by a trailing
 * count, and pushed 223 rows behind one disclosure. On the lead those five are
 * one row reading 43 across 9 stages, the eight slots carry eight different
 * facts, and the tail falls to 173.
 *
 * `readable()` RUNS BEFORE THE KEY, not after it. Its two template repairs
 * change the first sentence, so grouping on the raw text and rendering the
 * repaired one would split a group down the middle of one fact.
 *
 * THE STAGE IS KEPT. `stages.flatMap((s) => s.warnings)` threw away the one
 * dimension that makes this list navigable — the losses are not spread evenly,
 * two stages hold 42% of them — and nothing downstream could get it back.
 */
export function groupLimits(stages: StageWarnings[]): LimitGroup[] {
  const groups = new Map<string, { lead: string; total: number; stages: Map<string, { count: number; tails: string[] }> }>();
  for (const stage of stages) {
    for (const raw of stage.warnings ?? []) {
      const { lead, rest } = limitLead(readable(raw));
      let group = groups.get(lead);
      if (!group) {
        group = { lead, total: 0, stages: new Map() };
        groups.set(lead, group);
      }
      group.total++;
      const here = group.stages.get(stage.name) ?? { count: 0, tails: [] };
      here.count++;
      // Distinct inventories only: ten calls that withheld the same 484 items
      // are one line, and the count beside the stage says how many times.
      if (rest && !here.tails.includes(rest)) here.tails.push(rest);
      group.stages.set(stage.name, here);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      lead: group.lead,
      total: group.total,
      stages: [...group.stages].map(([name, row]) => ({ name, ...row })).sort((a, b) => b.count - a.count),
    }))
    // Largest first, then alphabetical: a stable order matters because this
    // list is sliced, and a tie that reorders between renders moves a row in
    // and out of the eight a reader is shown.
    .sort((a, b) => b.total - a.total || a.lead.localeCompare(b.lead));
}

/** The whole discard arithmetic, from one pass over the same warnings. */
export type Discards = {
  /** The refusals that named a reason, largest first — `byReason`'s rows. */
  rows: ReturnType<typeof byReason>;
  /** Their sum: 90 on the live run. */
  explained: number;
  /** Discarded in bulk by a stage that recorded no reason: 72 on the live run. */
  unexplained: number;
  /** 162 — and the figure `stageFacts` puts on the headline card. */
  total: number;
  /** Where the unexplained residue was discarded, largest first. */
  byStage: { name: string; count: number }[];
};

const BULK = /^(\d+) groups? of model output (?:was|were) discarded/;

/**
 * 90 AND 162 FROM ONE FUNCTION, SO THEY CANNOT DRIFT APART AGAIN.
 *
 * The headline card read "162 items discarded" and the table under it accounted
 * for 90, with nothing on the page explaining the other 72. They reconcile
 * exactly: ten warnings of the shape "N groups of model output were discarded
 * in this stage" sum to 72, and `parseRefusal`'s pattern requires "model
 * output(s) (was|were) discarded", which "49 groups of model output were
 * discarded" is not. So 44% of what the run threw away was unaccounted for on
 * the one page whose stated premise is that an undercount is the serious
 * direction.
 *
 * `total` is computed here rather than read off `stageFacts` so the two halves
 * and the sum are produced by one pass. It agrees with `stageFacts`'s
 * `discarded` count on the live run — 162 — and a future divergence is a
 * disagreement between two parsers rather than between a card and a table.
 */
export function discards(stages: StageWarnings[]): Discards {
  const rows = byReason(stages.flatMap((s) => (s.warnings ?? []).map(readable)));
  const explained = rows.reduce((n, row) => n + row.count, 0);
  const byStage = new Map<string, number>();
  let unexplained = 0;
  for (const stage of stages) {
    for (const raw of stage.warnings ?? []) {
      const m = BULK.exec(readable(raw));
      if (!m) continue;
      const n = Number(m[1]);
      unexplained += n;
      byStage.set(stage.name, (byStage.get(stage.name) ?? 0) + n);
    }
  }
  return {
    rows,
    explained,
    unexplained,
    total: explained + unexplained,
    byStage: [...byStage]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/**
 * `truncations` MOVED TO `$lib/policy-analysis/stage-facts` in phase 19, so the
 * one-page brief — which the server renders into Word as well as the page draws
 * — reads the context-window sentences through the same parser as "Where the
 * model could not see everything". Re-exported so nothing that imports it here
 * changes.
 */
export { truncations, type Truncation } from '$lib/policy-analysis/stage-facts';
