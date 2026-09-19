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
  return text.replace(
    /\b(1 model output was discarded and) are (not part of this assessment)/g,
    '$1 is $2',
  );
}
