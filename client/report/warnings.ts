/**
 * WHAT THE RUN THREW AWAY, read out of its own warnings.
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
 * THIS PARSES PROSE, AND THAT IS A STOPGAP. The warnings are free text written
 * for a human, and four shapes carry counts. The durable version emits these
 * from the stage writer as structured output; this parser exists to prove the
 * view earns that schema change. It is deliberately conservative: anything it
 * does not recognise is kept whole as a note rather than guessed at, because a
 * miscounted discard is worse than an uncounted one — it would understate what
 * the run threw away, in a view whose entire purpose is not to.
 */

export type Discard =
  /** "49 groups of model output were discarded in this stage." */
  | { kind: 'groups'; count: number; text: string }
  /** "2 model outputs were discarded … — <reason>. Affected: <ids>" */
  | { kind: 'artefacts'; count: number; reason: string; affected: string; text: string }
  /** "4 items referred to something that is not in this assessment…" */
  | { kind: 'references'; count: number; text: string }
  /** "4 of 72 pages carry no policy text and were not analysed: …" */
  | { kind: 'pages'; count: number; total: number; detail: string; text: string }
  /** Everything else: a note about what the paper does not say. */
  | { kind: 'note'; text: string };

export type StageWarnings = { stage: number; label: string; discards: Discard[] };

export type DiscardTotals = {
  groups: number;
  artefacts: number;
  references: number;
  pagesUnread: number;
  pagesTotal: number;
  notes: number;
};

const GROUPS = /^(\d+)\s+groups?\s+of\s+model\s+output\s+(?:was|were)\s+discarded/i;
const ARTEFACTS = /^(\d+)\s+model\s+outputs?\s+(?:was|were)\s+discarded[^—-]*[—-]\s*(.*)$/i;
const REFERENCES = /^(\d+)\s+items?\s+referred\s+to\s+something\s+that\s+is\s+not\s+in\s+this\s+assessment/i;
const PAGES = /^(\d+)\s+of\s+(\d+)\s+pages?\s+carry\s+no\s+policy\s+text[^:]*:?\s*(.*)$/i;

export function parseWarning(text: string): Discard {
  const trimmed = text.trim();

  const pages = PAGES.exec(trimmed);
  if (pages) {
    return { kind: 'pages', count: Number(pages[1]), total: Number(pages[2]), detail: pages[3] ?? '', text: trimmed };
  }

  const groups = GROUPS.exec(trimmed);
  if (groups) return { kind: 'groups', count: Number(groups[1]), text: trimmed };

  const artefacts = ARTEFACTS.exec(trimmed);
  if (artefacts) {
    // The tail is "<reason>. Affected: <ids>". The reason is what a reader needs;
    // the ids are what an author needs, so both are kept and shown separately.
    const tail = artefacts[2] ?? '';
    const split = tail.search(/\bAffected:/i);
    return {
      kind: 'artefacts',
      count: Number(artefacts[1]),
      reason: (split >= 0 ? tail.slice(0, split) : tail).trim().replace(/[.\s]+$/, ''),
      affected: split >= 0 ? tail.slice(split + 'Affected:'.length).trim() : '',
      text: trimmed,
    };
  }

  const references = REFERENCES.exec(trimmed);
  if (references) return { kind: 'references', count: Number(references[1]), text: trimmed };

  return { kind: 'note', text: trimmed };
}

export function parseStage(stage: number, label: string, warnings: string[]): StageWarnings {
  return { stage, label, discards: warnings.map(parseWarning) };
}

export function totals(stages: StageWarnings[]): DiscardTotals {
  const out: DiscardTotals = { groups: 0, artefacts: 0, references: 0, pagesUnread: 0, pagesTotal: 0, notes: 0 };
  for (const stage of stages) {
    for (const d of stage.discards) {
      if (d.kind === 'groups') out.groups += d.count;
      else if (d.kind === 'artefacts') out.artefacts += d.count;
      else if (d.kind === 'references') out.references += d.count;
      else if (d.kind === 'pages') {
        // A page is unread once, whatever how many stages mention it — so the
        // largest single report wins rather than the sum.
        out.pagesUnread = Math.max(out.pagesUnread, d.count);
        out.pagesTotal = Math.max(out.pagesTotal, d.total);
      } else out.notes += 1;
    }
  }
  return out;
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
  const enumMatch = /^(\w+)\s+data\.(\w+):\s*Invalid option: expected one of (.+)$/i.exec(reason);
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
export function byReason(stages: StageWarnings[]): { reason: string; human: string; count: number; affected: string[] }[] {
  const seen = new Map<string, { reason: string; human: string; count: number; affected: string[] }>();
  for (const stage of stages) {
    for (const d of stage.discards) {
      if (d.kind !== 'artefacts') continue;
      const existing = seen.get(d.reason);
      if (existing) {
        existing.count += d.count;
        if (d.affected) existing.affected.push(d.affected);
      } else {
        seen.set(d.reason, { reason: d.reason, human: humaniseReason(d.reason), count: d.count, affected: d.affected ? [d.affected] : [] });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count);
}
