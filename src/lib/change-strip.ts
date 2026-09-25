/**
 * HOW EACH PART OF THE POLICY IS MEANT TO WORK, ONE STRIP PER PART.
 *
 * Stage 14 writes a theory of change for every mechanism — 150 on the Post-16
 * run — as five lists: inputs, activities, outputs, outcomes and impacts. The
 * report drew none of them: the causal chain under a selected mechanism shows
 * what it ASSUMES, never what it is meant to DO. And the phase 19 review found
 * the thing a reader most needs from them: all 150 are "provisional", and they
 * are thick with "if", "may" and "not specified" — measured on the Post-16
 * run, 451 of the 1,003 input and output entries name something and then say
 * a detail of it (the amount, the eligibility, who is responsible) is not
 * specified.
 *
 * So each strip is the five steps side by side, and says where the chain is
 * weakest. That is a reading of the words the run wrote, done by a rule the page
 * states rather than a judgement it hides:
 *
 *   - an entry LEAVES A DETAIL UNSPECIFIED when it says so — "not specified",
 *     "does not specify", "unknown", "no baseline". Nearly always it is
 *     "X; the amount and eligibility are not specified": X is stated, its
 *     detail is not;
 *   - an entry is BLANK when there is nothing before the admission — "Not
 *     specified", or "Timetable, funding and monitoring: not specified";
 *   - an entry is HEDGED when it only might happen — "if", "may", "could",
 *     "possible", "potentially", "uncertain", "subject to";
 *   - a step is MISSING when it has no entries or every entry is blank; it has
 *     GAPS when half or more of its entries leave a detail unspecified; it is
 *     HEDGED when half or more only might happen;
 *   - the WEAKEST LINK is the first missing step, else the step with the largest
 *     share of weak entries (a gap or a hedge), else nothing.
 *
 * MEASURED BEFORE IT WAS DRAWN. A first cut called a step missing when every
 * entry said "not specified" anywhere, which marked the inputs of whole chains
 * as absent when each entry named its input and qualified a detail. Under the
 * rule above one step in 750 on the real run is missing outright (an empty
 * impacts list); the gaps are the finding, and are drawn as gaps.
 *
 * The chain fields travel in the report view because `stubForReport` keeps them
 * for this; everything else a chain carries is still stubbed.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { chainsFor } from '$lib/mechanisms';

export const STEPS = [
  { key: 'inputs', label: 'What goes in' },
  { key: 'activities', label: 'What is done' },
  { key: 'outputs', label: 'What it produces' },
  { key: 'outcomes', label: 'What changes' },
  { key: 'impacts', label: 'The end result' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];
export type StepState = 'stated' | 'hedged' | 'gaps' | 'missing';

export type StripStep = {
  key: StepKey;
  label: string;
  items: string[];
  state: StepState;
  /** Entries that leave a detail unspecified. */
  unspecified: number;
  /** Entries that are unspecified or only might happen. */
  weak: number;
};

export type ChangeStrip = {
  mechanism: Artefact;
  chain: Artefact;
  /** How many ways to beat the policy rest on this mechanism. */
  plays: number;
  steps: StripStep[];
  /** Index into `steps`, or null where no step is weak. The page's own reading, from the words. */
  weakest: number | null;
  /**
   * THE CHAIN'S OWN WEAKEST LINK, where stage 14 wrote one (prompt 3.2 on):
   * the model's judgement of the step most likely to break, and why. Drawn as
   * "Weakest link"; the page's reading above is then labelled "Least
   * specified", because the two are different claims made by different means.
   */
  stated: string | null;
  /** The step `stated` names, when it names exactly one; null otherwise. */
  statedStep: number | null;
  /** The assumptions the chain rests on, resolved. */
  assumptions: Artefact[];
};

/** The words that name each step, for finding the one a weakest link is about. */
const STEP_WORDS: RegExp[] = [
  /\binputs?\b|what goes in/i,
  /\bactivit(?:y|ies)\b|what is done/i,
  /\boutputs?\b|what it produces/i,
  /\boutcomes?\b|what changes/i,
  /\bimpacts?\b|the end result/i,
];

/**
 * The step a written weakest link is about — when it names exactly one.
 *
 * "The step from outputs to outcomes" names two and is left unmarked rather
 * than guessed at: the sentence is printed whole under the strip either way.
 */
export function stepNamed(text: string): number | null {
  const hits = STEP_WORDS.map((re, i) => (re.test(text) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : null;
}

const statedOf = (artefact: Artefact) => {
  const text = typeof artefact.data?.weakestLink === 'string' ? artefact.data.weakestLink.trim() : '';
  return { stated: text || null, statedStep: text ? stepNamed(text) : null };
};

export type ProgrammeStrip = Omit<ChangeStrip, 'mechanism' | 'chain' | 'plays'> & { model: Artefact };

/**
 * THE PROGRAMME AS A WHOLE — stage 14's one `logic_model` (prompt 3.2 on).
 *
 * The same five steps and the same reading as a part's strip, for the policy
 * as a whole, so it can lead the section as one more strip of the same shape.
 * The newest one when a restatement wrote a second. Null on an assessment
 * written before the kind existed.
 */
export function programmeStrip(artefacts: Artefact[]): ProgrammeStrip | null {
  const models = artefacts.filter((a) => a.kind === 'logic_model');
  const model = models[models.length - 1];
  if (!model || !hasSteps(model)) return null;
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const cited = Array.isArray(model.data?.assumptions) ? model.data.assumptions.filter((x): x is string => typeof x === 'string') : [];
  return {
    model,
    ...stripOf(model),
    ...statedOf(model),
    assumptions: cited.map((id) => byId.get(id)).filter((a): a is Artefact => a?.kind === 'assumption'),
  };
}

const UNSPECIFIED = /\bnot (?:been )?(?:specified|stated|described|established|known|identified|confirmed)\b|\bdoes not (?:specify|state|describe|say)\b|\bunspecified\b|\bunknown\b|\bno (?:baseline|target|confirmed)\b/i;
const HEDGED = /\b(?:if|may|might|could|possibl[ey]|potential(?:ly)?|uncertain|unclear|subject to|conditional|depends? on)\b/i;

const BLANK = /^\W*(?:not (?:specified|stated|described|known)|unspecified|unknown|none (?:stated|specified))\b|:\s*(?:not specified|unspecified|unknown)\W*$/i;

/** The entry admits a detail is not specified. */
export function isUnspecified(entry: string): boolean {
  return UNSPECIFIED.test(entry);
}

/** The entry says nothing but the admission. */
export function isBlank(entry: string): boolean {
  if (BLANK.test(entry)) return true;
  const at = UNSPECIFIED.exec(entry);
  return Boolean(at && at.index < 15);
}

/** A step's entries as the strip reads them: strings, trimmed, empties dropped. */
const entriesOf = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : []);

/**
 * HOW ONE ENTRY READS, as letters: `u` leaves a detail unspecified, `b` says
 * nothing but that, `h` only might happen.
 *
 * WORKED OUT ON THE WHOLE ENTRY, ONCE. The service's report view clips each
 * entry to `STEP_CLIP` characters to keep the payload small, and "X; the amount
 * and eligibility are not specified" puts the admission at the END — so a
 * clipped entry read as stated on the service and as a gap in the pack, which
 * carries the whole text. `stubForReport` now stores these letters from the
 * unclipped entry and `stripOf` prefers them, so both renderers classify the
 * same words the same way.
 */
export function entryFlags(entry: string): string {
  return `${isUnspecified(entry) ? 'u' : ''}${isBlank(entry) ? 'b' : ''}${HEDGED.test(entry) ? 'h' : ''}`;
}

/** The letters for every entry of each step, for `stubForReport` to carry. */
export function stepFlags(chain: Pick<Artefact, 'data'>): Partial<Record<StepKey, string[]>> {
  const flags: Partial<Record<StepKey, string[]>> = {};
  for (const step of STEPS) {
    if (Array.isArray(chain.data?.[step.key])) flags[step.key] = entriesOf(chain.data[step.key]).map(entryFlags);
  }
  return flags;
}

function stepOf(key: StepKey, label: string, value: unknown, carried?: unknown): StripStep {
  const items = entriesOf(value);
  const flags = Array.isArray(carried) && carried.length === items.length ? carried.map(String) : items.map(entryFlags);
  const unspecified = flags.filter((f) => f.includes('u')).length;
  const hedged = flags.filter((f) => f.includes('h')).length;
  const weak = flags.filter((f) => f.includes('u') || f.includes('h')).length;
  const state: StepState = !items.length || flags.every((f) => f.includes('b'))
    ? 'missing'
    : unspecified / items.length >= 0.5 ? 'gaps'
      : hedged / items.length >= 0.5 ? 'hedged' : 'stated';
  return { key, label, items, state, unspecified, weak };
}

/** The five steps of one chain, and where it is weakest. */
export function stripOf(chain: Artefact): { steps: StripStep[]; weakest: number | null } {
  const carried = chain.data?.stepFlags as Record<string, unknown> | undefined;
  const steps = STEPS.map((step) => stepOf(step.key, step.label, chain.data?.[step.key], carried?.[step.key]));
  const missing = steps.findIndex((step) => step.state === 'missing');
  if (missing >= 0) return { steps, weakest: missing };
  let weakest: number | null = null;
  let worst = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const share = steps[i].items.length ? steps[i].weak / steps[i].items.length : 0;
    if (share > worst) { worst = share; weakest = i; }
  }
  return { steps, weakest };
}

/** Whether a chain carries any of the five steps at all — a stubbed or older copy may not. */
const hasSteps = (chain: Artefact) => STEPS.some((step) => Array.isArray(chain.data?.[step.key]));

/**
 * One strip for each of the first `k` mechanisms in `ranked`.
 *
 * `ranked` is the mechanism chart's own rows — id and play count, busiest first
 * — passed in rather than recounted, so the strips and the bars above them can
 * never disagree about which parts of the policy generate the most plays.
 *
 * The chain drawn is the mechanism's OWN (`data.mechanismId`) where there is
 * one, else the chain that names it and assumes the most — the same choice the
 * mechanism panel makes. A mechanism with no chain carrying steps is skipped.
 */
export function changeStrips(
  artefacts: Artefact[],
  ranked: { id: string; plays: number }[],
  mechanismIds: Set<string>,
  k = 6,
): ChangeStrip[] {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const chains = chainsFor(artefacts, mechanismIds);
  const strips: ChangeStrip[] = [];
  for (const row of ranked) {
    if (strips.length >= k) break;
    const mechanism = byId.get(row.id);
    const views = (chains.get(row.id) ?? []).filter((view) => hasSteps(view.artefact));
    if (!mechanism || !views.length) continue;
    const view = views.find((v) => v.artefact.data?.mechanismId === row.id) ?? views[0];
    const { steps, weakest } = stripOf(view.artefact);
    strips.push({
      mechanism,
      chain: view.artefact,
      plays: row.plays,
      steps,
      weakest,
      ...statedOf(view.artefact),
      assumptions: view.assumptions.map((id) => byId.get(id)).filter((a): a is Artefact => Boolean(a)),
    });
  }
  return strips;
}
