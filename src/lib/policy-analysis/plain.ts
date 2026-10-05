import type { Artefact } from './contracts';
import { isCleared } from './cleared';
import { PLAIN_KINDS, PLAIN_SCHEMAS, WHAT_IT_IS, type PlainKind } from './plain-schema';

/**
 * PLAIN WORDS FOR SOMEONE WHO HAS NEVER READ THE POLICY (phase 23).
 *
 * Phase 19's writing rule fixed the sentence — 13.7 words a sentence on the
 * live Best Start run (`44dd5420`), one acronym in 46 plays — and a newcomer
 * still could not follow the threats. The paper's own names ("Best Start
 * Family Service", "the core offer") were never explained, delivery-speak
 * ("referral completion") replaced the old jargon, nobody was ever shown being
 * harmed, and the scenarios printed `s1_023_assumption_001` 76 times. This
 * module is everything about the fix that is not a prompt:
 *
 *   - the plain block a play, a scenario and a key judgement carry, read for
 *     display (`plainRows`) and checked in triage (`plainGap`);
 *   - the corrective ask for a missing block, which KEEPS the item
 *     (`incompleteAsk`, `graftPlain`) — losing a play for a missing summary is
 *     the all-or-nothing failure this codebase has removed a dozen times;
 *   - identifiers in prose: found (`idsInProse`) and, as a backstop at every
 *     root that renders a report, replaced by the item's name (`withoutIds`);
 *   - the quality warnings, all in ONE function (`plainChecks`) so whoever
 *     routes machine warnings routes these by one prefix (`PLAIN_CHECK`).
 *
 * Pure, and imported by the client: no server module, no zod beyond the shapes.
 */

/** The fields of each block, in reading order, with the words the report puts in front of them. */
export const PLAIN_FIELDS: Record<PlainKind, readonly (readonly [field: string, label: string])[]> = {
  exploit: [
    ['who', 'Who'],
    ['does', 'What they do'],
    ['goesWrong', 'What goes wrong'],
    ['likeWhen', 'It is like'],
    ['whyItMatters', 'Why it matters'],
  ],
  scenario: [
    ['what', 'What changes'],
    ['firstMove', 'Who moves first'],
    ['result', 'What happens'],
    ['whyItMatters', 'Why it matters'],
  ],
  key_judgement: [
    ['forWhom', 'Who it happens to'],
    ['whyItMatters', 'Why it matters'],
  ],
};

/**
 * SOFT WORD LIMITS, one short sentence each. Over the limit is a WARNING, never
 * a refusal (P6): a long sentence is still the model's best reading, and the
 * reader is better served by it than by its absence. Twenty-five is the
 * writing rule's "under 20 words where you can" with room for a named body.
 */
export const WORD_LIMITS: Record<string, number> = {
  who: 20, does: 25, goesWrong: 25, likeWhen: 25, whyItMatters: 25,
  what: 25, firstMove: 25, result: 25, forWhom: 15,
  whatItIs: 20,
};

const isPlainKind = (kind: string): kind is PlainKind => (PLAIN_KINDS as string[]).includes(kind);

/** Does this item owe a plain block? A clearance does not: it is a reason, not a play. */
export function needsPlain(a: Artefact): boolean {
  if (!isPlainKind(a.kind)) return false;
  return !(a.kind === 'exploit' && isCleared(a));
}

export type PlainRow = { key: string; label: string; text: string };

/**
 * The block as rows to draw, in order. EMPTY ON AN OLDER ROW, which is every
 * row of both live runs — so every renderer reads "no rows" as "draw what you
 * drew before" and nothing else changes. A `likeWhen` of null is the model
 * saying there is no honest comparison, and is left out rather than printed as
 * "None".
 */
export function plainRows(a: Artefact | null | undefined): PlainRow[] {
  if (!a || !isPlainKind(a.kind)) return [];
  const block = a.data?.plain;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return [];
  return PLAIN_FIELDS[a.kind]
    .map(([key, label]) => ({ key, label, text: typeof (block as Record<string, unknown>)[key] === 'string' ? ((block as Record<string, string>)[key]).trim() : '' }))
    .filter((row) => row.text);
}

/** One plain field, or ''. */
export function plainField(a: Artefact | null | undefined, key: string): string {
  return plainRows(a).find((row) => row.key === key)?.text ?? '';
}

/** What a part of the policy (or, when stage 2 writes one, a body) is in everyday words. '' when unsaid. */
export function whatItIs(a: Artefact | null | undefined): string {
  const value = a?.data?.whatItIs;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A MALFORMED BLOCK COSTS THE BLOCK, NOT THE ITEM.
 *
 * `exploit` and `key_judgement` are strict, so a plain block with one stray key
 * or a field the length of a page would fail the whole artefact's shape — and a
 * play refused for a badly formed SUMMARY of itself is reasoning thrown away to
 * punish the filing. Run before the shape check: the bad block is removed (the
 * shape is then valid without it) and the reason is returned, so triage can ask
 * for a corrected one. Same for a mechanism's `whatItIs`, which is not re-asked.
 */
export function stripMalformedPlain(a: { kind: string; data: Record<string, unknown> }): string | null {
  if (!a?.data || typeof a.data !== 'object') return null;
  if (isPlainKind(a.kind) && a.data.plain !== undefined) {
    const parsed = PLAIN_SCHEMAS[a.kind].safeParse(a.data.plain);
    if (parsed.success) { a.data.plain = parsed.data; return null; }
    delete a.data.plain;
    return parsed.error.issues.slice(0, 2).map((i) => `plain.${i.path.join('.') || '?'}: ${i.message}`).join('; ');
  }
  if (a.kind === 'mechanism' && a.data.whatItIs !== undefined) {
    const parsed = WHAT_IT_IS.safeParse(a.data.whatItIs);
    if (parsed.success) { a.data.whatItIs = parsed.data; return null; }
    delete a.data.whatItIs;
    return `whatItIs: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
  }
  return null;
}

/** Why this item's block is missing, or null when it has one or owes none. */
export function plainGap(a: Artefact): string | null {
  if (!needsPlain(a) || plainRows(a).length) return null;
  return 'missing';
}

/**
 * THE CORRECTIVE ASK FOR A MISSING BLOCK. The item is KEPT; this rides the
 * existing repair round (`provider.ts`) as an ask beside the refusals, and the
 * answer is grafted onto the kept item (`graftPlain`). The reason is what
 * `repairPrompt` prints; `code: 'plain'` is how it knows to ask for the block
 * alone rather than the whole item.
 */
export function incompleteAsk(a: Artefact, issue?: string | null) {
  const fields = isPlainKind(a.kind) ? PLAIN_FIELDS[a.kind].map(([key]) => key).join(', ') : 'plain';
  return {
    id: a.id, kind: a.kind, code: 'plain' as const,
    reason: `Kept, but it has no usable plain-words block${issue ? ` (${issue})` : ''}. Send data.plain with ${fields}.`,
    ...(a.label ? { label: a.label } : {}),
  };
}

/**
 * Take the plain blocks a repair round sent for KEPT items and put them on
 * those items, before the rest of the reply is triaged.
 *
 * Works on a COPY of the reply: the stored reply is the model's own words, and
 * the replay diagnostic depends on that. An answer for an asked-for id is
 * removed from the copy whether or not its block was usable — the item is
 * already kept, and resent whole it would only be refused as a duplicate. The
 * block may come as `data.plain` (asked for) or bare `plain` (a slip).
 */
export function graftPlain(raw: unknown, kept: Artefact[], asked: ReadonlySet<string>): { raw: unknown; grafted: number } {
  const items = (raw as { artefacts?: unknown })?.artefacts;
  if (!asked.size || !Array.isArray(items)) return { raw, grafted: 0 };
  const byId = new Map(kept.map((a) => [a.id, a]));
  let grafted = 0;
  const rest = items.filter((item) => {
    const id = item && typeof item === 'object' ? String((item as { id?: unknown }).id ?? '') : '';
    const target = asked.has(id) ? byId.get(id) : undefined;
    if (!target || !isPlainKind(target.kind)) return true;
    const sent = (item as { data?: { plain?: unknown }; plain?: unknown }).data?.plain ?? (item as { plain?: unknown }).plain;
    const parsed = PLAIN_SCHEMAS[target.kind].safeParse(sent);
    if (parsed.success) { target.data = { ...target.data, plain: parsed.data }; grafted++; }
    return false;
  });
  return { raw: { ...(raw as Record<string, unknown>), artefacts: rest }, grafted };
}

/**
 * THE SCHEMA THE MODEL IS SHOWN says the block is required, though the shape
 * that PARSES says optional. Both are true: every new item is asked for one,
 * and an old row — or one the model forgot — must still parse, so the missing
 * case is handled by an ask, not a refusal. A copy; the input is not touched.
 */
export function promptSchema(kind: string, schema: Record<string, unknown>): Record<string, unknown> {
  const field = isPlainKind(kind) ? 'plain' : kind === 'mechanism' ? 'whatItIs' : null;
  if (!field) return schema;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.includes(field) ? schema : { ...schema, required: [...required, field] };
}

// ── Identifiers in prose ───────────────────────────────────────────────────

/**
 * WHAT AN IDENTIFIER LOOKS LIKE in this pipeline's output: the `s<stage>_…`
 * namespace every model-written item carries, a retrieved source
 * (`source_s9_…`), a passage (`passage_0012`) and a pass's material (`m1_…`).
 * Each has an underscore after a digit, which ordinary prose never does.
 *
 * THE TWELVE COMPUTED CHECKS (`test_veto`) ARE WEAKER: `test_results` is also a
 * report section's name, which a model may well write. So a `test_…` word is
 * replaced only when the run holds an item by that id, and never warned about.
 */
const ID_SOURCE = String.raw`\b(?:source_s\d+_[A-Za-z0-9_]+|s\d{1,4}_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*|passage_\d{2,}|m\d{1,4}_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)\b`;
const CHECK_SOURCE = String.raw`\btest_[a-z]+(?:_[a-z]+)*\b`;
const ID_ONLY = new RegExp(`^\\s*(?:${ID_SOURCE}|${CHECK_SOURCE})\\s*$`);

/** Every identifier written into a piece of prose. */
export function idsInProse(text: string): string[] {
  return String(text ?? '').match(new RegExp(ID_SOURCE, 'g')) ?? [];
}

/**
 * Fields that are not the model's prose: the reader's own words, and the
 * retrieval adapter's. A string that IS an identifier is a reference, wherever
 * it sits, and is never touched (`ID_ONLY`).
 */
const NOT_PROSE = new Set(['wording', 'about', 'note', 'searchStrategy', 'documentHash', 'retrievedAt', 'url']);
/**
 * Fields that HOLD identifiers — the joins every view reads. An entry that is
 * wholly an id anywhere ELSE is the model filing a reference where a reader
 * expects words: on the live run a logic model's "What goes in" was the single
 * string `s1_011_claim_001`. Such an entry is replaced by the item's name when
 * the run holds it (`whole`), and left alone when it does not — an unknown
 * field that is really a join must keep working.
 */
const REFERENCE_KEYS = new Set(['refs', 'parent', 'firstActor', 'players', 'assumptions', 'targets', 'preconditions', 'candidates', 'mentions', 'dependencies', 'affectedOutcomes', 'aliases', 'actors']);
/** A computed check's `inputs` are ids; a logic model's are words. */
const isReferenceKey = (key: string, kind: string) => REFERENCE_KEYS.has(key) || /Ids?$/.test(key) || (kind === 'test' && key === 'inputs');
const NOT_PROSE_KINDS = new Set(['passage', 'research_source']);

type Leaf = (text: string) => string;
function mapProse(value: unknown, leaf: Leaf, depth = 0, key = '', whole?: Leaf, kind = ''): unknown {
  if (typeof value === 'string') {
    if (!ID_ONLY.test(value)) return leaf(value);
    return whole && key && !isReferenceKey(key, kind) ? whole(value) : value;
  }
  if (depth > 4 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => { const next = mapProse(v, leaf, depth + 1, key, whole, kind); if (next !== v) changed = true; return next; });
    return changed ? out : value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
    const next = NOT_PROSE.has(field) ? v : mapProse(v, leaf, depth + 1, field, whole, kind);
    if (next !== v) changed = true;
    out[field] = next;
  }
  return changed ? out : value;
}

/** Every piece of the model's prose an item carries: label, statement and the text in data. */
function proseOf(a: Artefact): string[] {
  if (NOT_PROSE_KINDS.has(a.kind)) return [];
  const texts: string[] = [a.label, a.statement];
  mapProse(a.data, (text) => { texts.push(text); return text; });
  return texts.filter((t) => typeof t === 'string' && t);
}

/**
 * IDS NEVER REACH A READER — the display-time backstop (P5).
 *
 * The prompts now ask for names in words, and validation warns when a model
 * writes an id anyway; neither helps the two runs already stored, whose
 * scenarios say "If s1_023_assumption_001 is true" 76 times. So every root that
 * renders a report — the page and the pack (`Report`), the item page
 * (`Drill`) and the exported documents (the export route) — reads the
 * artefacts through this once, the way it reads them through
 * `markDownJudgements`: an id in prose becomes that item's name in quotes,
 * and one the run does not hold becomes "another item in this assessment".
 *
 * References are untouched — a string that is wholly an id is a reference —
 * as are quotations of the paper (`sourceQuote` is not read at all), passages
 * and sources. Returns the same array, and the same objects, when nothing
 * changed, so a memo keyed on it does not churn.
 */
export function withoutIds(artefacts: Artefact[]): Artefact[] {
  const labels = new Map(artefacts.map((a) => [a.id, a.label]));
  const pattern = new RegExp(ID_SOURCE, 'g');
  const checks = new RegExp(CHECK_SOURCE, 'g');
  const named = (id: string) => {
    const label = labels.get(id)?.trim();
    return label && !idsInProse(label).length ? `“${label}”` : null;
  };
  const leaf: Leaf = (text) => {
    if (!text.includes('_')) return text;
    return text
      .replace(pattern, (id) => named(id) ?? 'another item in this assessment')
      .replace(checks, (word) => named(word) ?? word);
  };
  // An entry that IS an id, in a field of words: the bare name, or as it was.
  const whole: Leaf = (text) => labels.get(text.trim())?.trim() || text;
  let changed = false;
  const out = artefacts.map((a) => {
    if (NOT_PROSE_KINDS.has(a.kind)) return a;
    const label = leaf(a.label);
    const statement = leaf(a.statement);
    const data = mapProse(a.data, leaf, 0, '', whole, a.kind) as Record<string, unknown>;
    if (label === a.label && statement === a.statement && data === a.data) return a;
    changed = true;
    return { ...a, label, statement, data };
  });
  return changed ? out : artefacts;
}

// ── The quality warnings ───────────────────────────────────────────────────

/**
 * HOW EVERY ONE OF THESE WARNINGS BEGINS. They are MACHINE warnings about the
 * run's own writing — not a gap in the paper and not an open question about it
 * — and whoever sorts the warnings channel (phase 23's other stream splits
 * machine warnings from document-gap prose) can route all of them on this.
 */
export const PLAIN_CHECK = 'Plain English check:';
export const isPlainCheck = (warning: string): boolean => warning.startsWith(PLAIN_CHECK);

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const named = (items: Artefact[]) => {
  const list = items.slice(0, 4).map((a) => `“${String(a.label ?? '').replace(/[“”"]/g, '').slice(0, 80)}”`).join(', ');
  return `${list}${items.length > 4 ? `, and ${items.length - 4} more` : ''}`;
};

/**
 * THE PLAIN-ENGLISH CHECKS ON WHAT A STAGE KEPT, as at most four warnings —
 * one per kind of slip, never one per item. Never a refusal (P5, P6): an id in
 * a sentence is replaced at display, a long line is still the model's reading,
 * and a missing block was already asked for once.
 *
 *   1. an identifier written into prose;
 *   2. a play, scenario or key judgement with no plain block after its ask;
 *   3. a part of the policy with no everyday description;
 *   4. a plain line or description over its soft word limit.
 */
export function plainChecks(kept: Artefact[]): string[] {
  const withIds = kept.filter((a) => proseOf(a).some((t) => idsInProse(t).length));
  const missing = kept.filter((a) => plainGap(a));
  const undefinedParts = kept.filter((a) => a.kind === 'mechanism' && !whatItIs(a));
  const long = kept.filter((a) => {
    if (a.kind === 'mechanism' && whatItIs(a)) return words(whatItIs(a)) > WORD_LIMITS.whatItIs;
    return plainRows(a).some((row) => words(row.text) > (WORD_LIMITS[row.key] ?? 25));
  });
  const out: string[] = [];
  const one = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
  if (withIds.length) out.push(`${PLAIN_CHECK} ${one(withIds.length, 'item put', 'items put')} an identifier in a sentence where a reader needs words. The report shows each identifier as the name of the item it points to. ${named(withIds)}.`);
  if (missing.length) out.push(`${PLAIN_CHECK} ${one(missing.length, 'item has', 'items have')} no plain-words summary even after it was asked for; ${missing.length === 1 ? 'it is' : 'they are'} kept and shown with the detail only. ${named(missing)}.`);
  if (undefinedParts.length) out.push(`${PLAIN_CHECK} ${one(undefinedParts.length, 'part of the policy has', 'parts of the policy have')} no everyday description, so ${undefinedParts.length === 1 ? 'its name appears' : 'their names appear'} without a definition. ${named(undefinedParts)}.`);
  if (long.length) out.push(`${PLAIN_CHECK} ${one(long.length, 'item has', 'items have')} a plain-words line longer than its soft limit (about ${WORD_LIMITS.does} words); kept as written. ${named(long)}.`);
  return out.map((w) => w.slice(0, 1000));
}
