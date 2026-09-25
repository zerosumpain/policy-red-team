/**
 * A STAGE'S WARNINGS, ROLLED UP INTO COUNTED FACTS.
 *
 * Step 00 printed every warning a stage recorded, in full, one under the other.
 * On a real paper that is the wall the page exists to remove: a 72-page white
 * paper's decomposition stage alone records a line per skipped page, a line per
 * discarded group and a line per dropped reference, and "272 things this
 * assessment could not establish" is a number nobody reads.
 *
 * So a stage now says what KIND of thing happened and how many — "14 items were
 * discarded", "4 of 72 pages carried no policy text" — and the specific
 * sentences are one click underneath. Same content, one layer down.
 *
 * TWO RULES MAKE THIS SAFE TO DO ON PROSE.
 *
 * 1. NOTHING IS EVER DROPPED. A warning no pattern recognises falls to `open`
 *    and is printed verbatim, exactly as every warning was before. The rollup
 *    can only ever be wrong about the NAME of a group, never about whether a
 *    reader can see what it holds. A test asserts every fact's `detail` lines
 *    partition the input.
 * 2. THE COUNT IS THE WARNING'S OWN FIGURE, not the number of warnings.
 *    "12 model outputs were discarded" is twelve items in one sentence, and a
 *    rollup that reported it as "1 discarded" would be a smaller number than
 *    the page it replaced. Where a sentence states no figure it counts as one
 *    thing, which is what it is.
 *
 * The patterns are written against the actual producers in `pipeline.ts`,
 * `validation.ts`, `provider.ts`, `ingest.ts`, `research.ts` and
 * `front-matter.ts`. When one of those sentences is reworded, the warning lands
 * in `open` and is still read — it does not disappear.
 *
 * MOST WARNINGS ON A REAL RUN ARE NOT FROM THOSE PRODUCERS AT ALL, and that is
 * not a gap in this module. Measured on the live rail-data assessment: 173
 * warnings, of which 73 are the pipeline's own structural losses — discarded
 * output, dropped references, pages with no policy text, things not covered —
 * and **100 are the MODEL's own caveats carried on individual artefacts**:
 * "Actor names are generic contractual labels and are not legally resolved
 * entities", "Baselines and targets are not specified in the supplied
 * material". Each is unique prose about one artefact in one document.
 *
 * Those are `open` and must stay `open`. Pattern-matching model output would be
 * fitting regexes to how one paper happened to be worded — a rail data contract
 * phrases its gaps differently from a schools white paper — and the first time
 * it mis-grouped one it would be asserting something about the assessment that
 * the assessment never said. "Open question" is also the site's own word for
 * them: it is what the ink ledger's fourth cell counts.
 */

export type StageFactKind =
  | 'discarded'
  | 'reference_dropped'
  | 'no_text'
  | 'not_covered'
  | 'cut_short'
  | 'unavailable'
  | 'sealed'
  | 'open';

export type StageFact = {
  kind: StageFactKind;
  /** Summed from the warnings' own leading figures. */
  count: number;
  /** The denominator where the sentences agreed on one. */
  of: number | null;
  /** The sentences behind it, verbatim and in the order the stage recorded them. */
  detail: string[];
};

type Rule = {
  kind: StageFactKind;
  test: RegExp;
  /** Pulls "12" out of "12 model outputs were discarded…". */
  count?: RegExp;
  /** Pulls the denominator out of "4 of 72 pages carry no policy text". */
  of?: RegExp;
};

/**
 * ORDER MATTERS: the first rule that matches wins.
 *
 * `sealed` leads because a sealed run's omissions are DELIBERATE and reading
 * them as failures would be the opposite of the truth — the whole point of
 * sealing is that those steps did not happen. `discarded` and `cut_short` come
 * before the looser `unavailable`, which would otherwise swallow them on the
 * word "could not".
 */
const RULES: Rule[] = [
  { kind: 'sealed', test: /\bsealed assessment\b/i },

  {
    kind: 'no_text',
    test: /pages? carr(?:y|ied) no policy text|no readable text|looked like front matter/i,
    count: /^(\d+) of \d+ pages/i,
    of: /^\d+ of (\d+) pages/i,
  },

  {
    kind: 'discarded',
    test: /\b(were|was) discarded\b|\bwere quarantined\b|\bwas rejected\b/i,
    count: /^(\d+)\b/,
  },

  {
    kind: 'reference_dropped',
    test: /the reference was dropped/i,
    count: /^(\d+)\b/,
  },

  {
    kind: 'cut_short',
    test: /only the first \d+|reached its output limit|no room left in the model|corrective attempt failed/i,
    count: /^This stage produced \d+ items and only the first (\d+)/i,
  },

  {
    kind: 'not_covered',
    test:
      /\bwere not (?:assessed|red-teamed|searched|analysed)\b|\bwere never resolved\b|\bhave no (?:supporting relationship|theory of change)\b|\bha(?:s|ve) no incentive profile\b|\bhas no \w[\w -]* section\b|\braised no further question\b|\bNo sources found\b/i,
    count: /^(?:The )?(\d+) of \d+\b/i,
    of: /^(?:The )?\d+ of (\d+)\b/i,
  },

  {
    kind: 'unavailable',
    test: /could not be (?:read|assessed|written|examined)|was not available|unavailable|produced no usable sources|Research unavailable|Full text unavailable/i,
  },
];

/** The reader-facing sentence for a group. Plural-aware, and it names the denominator where there is one. */
export function factLabel(fact: StageFact): string {
  const n = fact.count;
  const one = n === 1;
  switch (fact.kind) {
    case 'sealed':
      return `${n} step${one ? '' : 's'} skipped because this run is sealed`;
    case 'no_text':
      return fact.of === null
        ? `${n} page${one ? '' : 's'} carried no policy text`
        : `${n} of ${fact.of} pages carried no policy text`;
    case 'discarded':
      return `${n} item${one ? '' : 's'} discarded`;
    case 'reference_dropped':
      return `${n} reference${one ? '' : 's'} dropped, the item kept`;
    case 'cut_short':
      return `${n} thing${one ? '' : 's'} cut short by a limit`;
    case 'not_covered':
      return fact.of === null
        ? `${n} thing${one ? '' : 's'} not covered`
        : `${n} of ${fact.of} not covered`;
    case 'unavailable':
      return `${n} thing${one ? ' was' : 's were'} not available`;
    default:
      return `${n} open question${one ? '' : 's'}`;
  }
}

/** The order the strip prints them in — the losses first, the open questions last. */
const ORDER: StageFactKind[] = [
  'discarded',
  'no_text',
  'not_covered',
  'cut_short',
  'reference_dropped',
  'unavailable',
  'sealed',
  'open',
];

const figure = (text: string, pattern: RegExp | undefined): number | null => {
  if (!pattern) return null;
  const n = Number(text.match(pattern)?.[1]);
  return Number.isFinite(n) ? n : null;
};

/** Roll a stage's warnings up. Returns [] for a stage that recorded none. */
export function stageFacts(warnings: string[]): StageFact[] {
  const groups = new Map<StageFactKind, StageFact>();

  for (const warning of warnings) {
    const text = (warning ?? '').trim();
    if (!text) continue;
    const rule = RULES.find((r) => r.test.test(text));
    const kind = rule?.kind ?? 'open';
    const group = groups.get(kind) ?? { kind, count: 0, of: null, detail: [] };

    // The sentence's own figure, or one thing where it states none.
    group.count += figure(text, rule?.count) ?? 1;
    const of = figure(text, rule?.of);
    // A denominator only survives while every sentence in the group agrees on
    // it. Two stages of one run can skip pages out of different totals, and
    // "4 of 72" beside a group that also holds "3 of 9" would be arithmetic
    // nobody can check.
    if (of !== null) group.of = group.of === null || group.of === of ? of : null;

    group.detail.push(text);
    groups.set(kind, group);
  }

  return ORDER.filter((k) => groups.has(k)).map((k) => groups.get(k) as StageFact);
}

/** Every warning a stage recorded, whatever kind it was read as. */
export const factTotal = (facts: StageFact[]): number =>
  facts.reduce((n, f) => n + f.detail.length, 0);

/** A stage that reasoned with less than the whole inventory, and by how much. */
export type Truncation = {
  name: string;
  ordinal: number;
  /** How many of the stage's calls were reduced. */
  calls: number;
  /** The largest single call's withholding — the deepest the stage ever cut. */
  withheld: number;
  /** The largest single call's clipping, summed across both clip lengths. */
  clipped: number;
  /** The kinds that call held NONE of, in the contract's own spelling. */
  kinds: string[];
  /** The run said so itself: "Read this stage as partial." */
  partial: boolean;
};

/*
 * TWO PARSING TRAPS, BOTH HIT WHILE MEASURING THIS.
 *
 * The clip sentence occurs TWICE in one warning — "7 long items clipped to 500
 * characters" and "196 long items clipped to 250 characters" — so a non-global
 * pattern silently reads only the first and reports a third of the clipping.
 *
 * And all 44 of these warnings use a STRAIGHT apostrophe in "this call's
 * context" while six other warnings in the same run use a curly one, so the
 * apostrophe is matched as any single character. A rule that looks right and
 * matches nothing after a producer reword is worse than no rule.
 */
const CONTEXT = /context window/i;
const WITHHELD = /([\d,]+) items were withheld from this call entirely/g;
const CLIPPED = /([\d,]+) long items clipped to \d+ characters/g;
const KINDS = /No ([a-z_, ]+?) (?:was|were) left in this call.s context at all/i;
const PARTIAL = /Read this stage as partial\./i;

const whole = (text: string) => Number(text.replace(/,/g, ''));

/**
 * WHERE THE MODEL COULD NOT SEE EVERYTHING.
 *
 * 44 of the run's 270 warnings are context-window truncations across 10 of the
 * 18 stages, and nine of them carry the literal instruction "Read this stage as
 * partial." — seven of those in Independent challenge, the stage whose entire
 * job is to challenge the assessment. On the page they were five near-identical
 * grey rows behind a disclosure nobody opens. Nothing above them said the last
 * three stages were written by a model that could not see most of the
 * inventory.
 *
 * ONE ROW PER STAGE, NOT PER CALL, and the figures are the LARGEST single
 * call's rather than a sum: twelve calls that each withheld 191 items did not
 * withhold 2,292 items, and adding them would invent a number.
 */
export function truncations(stages: { name: string; ordinal: number; warnings: string[] }[]): Truncation[] {
  const rows: Truncation[] = [];
  for (const stage of stages) {
    const hits = (stage.warnings ?? []).filter((text) => CONTEXT.test(text));
    if (!hits.length) continue;
    let withheld = 0;
    let clipped = 0;
    let kinds: string[] = [];
    for (const text of hits) {
      const here = [...text.matchAll(WITHHELD)].reduce((n, m) => Math.max(n, whole(m[1])), 0);
      // The kinds belong to the DEEPEST call, not to the last one read: a stage
      // whose worst call held none of fourteen kinds is not described by a
      // later call that held none of two.
      if (here >= withheld) {
        withheld = here;
        kinds = KINDS.exec(text)?.[1].split(',').map((k) => k.trim()).filter(Boolean) ?? [];
      }
      clipped = Math.max(clipped, [...text.matchAll(CLIPPED)].reduce((n, m) => n + whole(m[1]), 0));
    }
    rows.push({
      name: stage.name,
      ordinal: stage.ordinal,
      calls: hits.length,
      withheld,
      clipped,
      kinds,
      partial: hits.some((text) => PARTIAL.test(text)),
    });
  }
  // Stage order, because the pipeline order is itself the reading: the cutting
  // gets deeper as the inventory grows, and the three stages that write the
  // report's conclusions are the three at the bottom.
  return rows.sort((a, b) => a.ordinal - b.ordinal);
}
