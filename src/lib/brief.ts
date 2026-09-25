import type { Artefact } from '$lib/policy-analysis/contracts';
import { keyJudgements } from '$lib/policy-analysis/judgements';
import { patternOf, PLAY_PATTERNS, OTHER_PATTERN } from '$lib/policy-analysis/patterns';
import { stageFacts, truncations } from '$lib/policy-analysis/stage-facts';
import { BAND_LABEL, findingsBySection, headlineSentence, recommendations, type Band } from '$lib/policy-analysis/view';
import { provenance } from '$lib/provenance';
import { rankFindings, withoutEcho, type Severity } from '$lib/writeup-view';

/**
 * THE ONE-PAGE BRIEF — what a busy official reads in two minutes.
 *
 * The review of 25 September measured the report at about seventy screens, and
 * after workstream R restructured it the Verdict alone was still 15,295px at
 * 1280. Nothing on it was wrong; there was simply no page that said "if you
 * read one thing, read this". This module decides what that page holds, in
 * this order and no more:
 *
 *   1. the headline, in one or two sentences;
 *   2. at most five key judgements, each with the paper's own words, the way to
 *      beat it that shows it (its early warning and its fix), what would
 *      change our mind, and who should do what;
 *   3. what we could not check — three lines at most.
 *
 * PURE, AND SHARED BY THREE RENDERERS: the Verdict lead on the service, the
 * same component inside the offline pack, and the Word/Markdown export of the
 * brief alone (`briefMarkdown` in `report-doc.ts`). One decision about what the
 * brief says, three ways of drawing it — the rule `report-doc.ts` already
 * follows for the whole report.
 *
 * AN OLDER ASSESSMENT HAS NO KEY JUDGEMENTS. Stage 17 has written them since
 * prompt generation 3.2 and the one completed real run predates that. Its brief
 * falls back to the top findings `rankFindings` already chooses for the
 * Verdict, mapped into the SAME item shape, so the page has one layout and the
 * reader cannot tell which path produced it except from the heading that says
 * so. What a finding does not carry — "what would change our mind", an owner —
 * is left out rather than invented.
 *
 * A SHARED COPY NEEDS NOTHING HERE. The route hands this module the artefacts
 * `shareableReport` already redacted: a key judgement keeps its quote exactly
 * as a finding does, and a join to a withheld artefact resolves to null and is
 * left out.
 */

/** How many judgements a brief holds. The key-judgement contract's own cap. */
export const BRIEF_ITEMS = 5;
/** How many "could not check" lines. A limit that takes a screen is not a brief. */
export const BRIEF_LIMITS = 3;
/** A quote longer than this is cut at a word and marked, so one clause cannot take the page. */
const QUOTE_MAX = 280;
/**
 * An early warning or a fix longer than this is cut the same way. The model
 * writes these as one long list-sentence — 240 to 330 characters on the real
 * run — and the whole of it is one click away on the play's own page.
 */
const PROSE_MAX = 200;

export type BriefPlay = {
  artefact: Artefact;
  band: Band;
  /** The kind of way to beat it, in the pattern's own plain name. */
  pattern: string;
  /** The first sign it is happening. First sentence only, clipped; the rest is on its page. */
  earlyWarning: string;
  /** What would stop it. First sentence only. */
  fix: string;
};

export type BriefItem = {
  id: string;
  rank: number;
  /** The record the item's title links to. */
  artefact: Artefact;
  /** A short name for it. */
  title: string;
  /** The judgement itself, in a sentence or two. */
  statement: string;
  /** The paper's own words, and where. Null when nothing on the chain quotes the paper. */
  quote: { text: string; page: number | null } | null;
  /** The part of the policy it is about. */
  about: Artefact | null;
  /** The way to beat it the judgement rests on — the sharpest, where it names several. */
  play: BriefPlay | null;
  /** How many other ways to beat it it names. */
  morePlays: number;
  /** What would change our mind. Empty where the item does not say. */
  wouldChangeIf: string;
  /** Who should act, and what they should do. Either may be empty. */
  owner: string;
  action: string;
  /** A recommendation that answers it, where the item is a finding rather than a judgement. */
  answer: Artefact | null;
  /** How serious, for a finding: the reason `rankFindings` ranked it where it is. */
  severity: Severity | null;
  /** The assumption a key judgement rests on. The full document prints it; the brief does not. */
  restsOn: Artefact | null;
  /** The decision a key judgement bears on. The full document prints it; the brief does not. */
  decision: string;
};

export type Brief = {
  /** The one sentence the assessment exists to produce. */
  headline: string;
  /** At most one sentence after it. */
  standfirst: string;
  /** `judgements` when stage 17 wrote key judgements; `findings` for an older assessment. */
  source: 'judgements' | 'findings';
  items: BriefItem[];
  limits: string[];
};

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * The first `n` sentences — the same boundary `headlineSentence` trusts: a full
 * stop, then a space, then a capital or an opening quote. Abbreviations and
 * decimals in policy prose are not followed by one.
 */
export function sentences(text: string, n = 1): string {
  let rest = clean(text);
  let out = '';
  for (let i = 0; i < n && rest; i++) {
    const at = rest.search(/[.!?]\s+[A-Z“"(]/);
    if (at < 0) return (out + rest).trim();
    out += rest.slice(0, at + 1) + ' ';
    rest = rest.slice(at + 1).trim();
  }
  return out.trim();
}

/** A quote cut at a word, with an ellipsis that says it was cut. Never mid-word. */
export function clip(text: string, max = QUOTE_MAX): string {
  const flat = clean(text);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

const patternLabel = (play: Artefact): string => {
  const key = patternOf(play);
  return (PLAY_PATTERNS.find((p) => p.key === key) ?? OTHER_PATTERN).label;
};

const exposure = (a: Artefact) => Number(a.data.exposure) || 0;
const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function briefPlay(play: Artefact): BriefPlay {
  return {
    artefact: play,
    band: (String(play.data.band || 'limited') as Band),
    pattern: patternLabel(play),
    earlyWarning: clip(sentences(String(play.data.earlyWarning ?? '')), PROSE_MAX),
    fix: clip(sentences(String(play.data.counter ?? '')), PROSE_MAX),
  };
}

/** The key judgements, as brief items. */
function fromJudgements(artefacts: Artefact[]): BriefItem[] {
  return keyJudgements(artefacts).slice(0, BRIEF_ITEMS).map((j) => {
    const plays = [...j.plays].sort((a, b) => exposure(b) - exposure(a));
    return {
      id: j.artefact.id,
      rank: j.rank,
      artefact: j.artefact,
      title: clean(j.artefact.label),
      statement: clean(j.judgement),
      quote: j.quote ? { text: clip(j.quote.text), page: j.quote.page } : null,
      about: j.mechanism,
      play: plays[0] ? briefPlay(plays[0]) : null,
      morePlays: Math.max(0, plays.length - 1),
      wouldChangeIf: clean(j.wouldChangeIf),
      owner: clean(j.owner),
      action: clean(j.action),
      answer: null,
      severity: null,
      restsOn: j.assumption,
      decision: clean(j.decision),
    };
  });
}

/**
 * What a FINDING rests on, found by walking its citations.
 *
 * A finding carries no quote of its own — none of the nineteen on the real run
 * does — and cites a play directly only in the exploitation chapter. So the
 * play is looked for up the chain it already cites, shallowest first: a play
 * it cites, or else the worst play aimed at a part of the policy the chain
 * reaches. Three steps, because the ladder is short (finding → check or model
 * → mechanism) and a play found further away is not one this finding rests on.
 *
 * THE QUOTE IS THAT PART OF THE POLICY'S OWN WORDS, and nothing looser. The
 * first cut took the nearest quote anywhere on the chain, and on the real run
 * "Test results are structural signals" arrived quoting a sentence about Skills
 * Bootcamp starts — the paper's words, but not about anything the finding
 * says. A quote under a judgement is read as the thing being judged, so it is
 * the quote of the part of the policy the play is aimed at, or none.
 */
function chainOf(finding: Artefact, artefacts: Artefact[], exploits: Artefact[], used: Set<string>) {
  const walk = provenance(finding.id, artefacts, { maxDepth: 3, maxNodes: 200 });
  const reached = walk.hops.flatMap((hop) => hop.items);
  const mechanisms = reached.filter((a) => a.kind === 'mechanism');
  const reachedIds = new Set(mechanisms.map((a) => a.id));
  const cited = reached.filter((a) => a.kind === 'exploit');
  const aimed = exploits.filter((p) => [...idList(p.data.targets), ...p.refs].some((id) => reachedIds.has(id)));
  const pool = [...(cited.length ? cited : aimed)].sort((a, b) => exposure(b) - exposure(a));
  // Five items that all name the same play say one thing five times; take the
  // worst one not already shown, and repeat only when nothing else is there.
  const play = pool.find((p) => !used.has(p.id)) ?? pool[0] ?? null;
  const targets = play ? new Set([...idList(play.data.targets), ...play.refs]) : new Set<string>();
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const about = mechanisms.find((m) => targets.has(m.id))
    ?? [...targets].map((id) => byId.get(id)).find((a): a is Artefact => a?.kind === 'mechanism')
    ?? null;
  return { play, about };
}

/** The top findings, as brief items — the same shape, so the page has one layout. */
function fromFindings(artefacts: Artefact[]): BriefItem[] {
  const chapters = findingsBySection(artefacts);
  const { top } = rankFindings(chapters, artefacts, BRIEF_ITEMS);
  const exploits = artefacts.filter((a) => a.kind === 'exploit');
  const recs = recommendations(artefacts);
  const used = new Set<string>();
  return top.map((view, i) => {
    const finding = view.artefact as Artefact;
    const { play, about } = chainOf(finding, artefacts, exploits, used);
    if (play) used.add(play.id);
    const answer = recs.find((r) => idList(r.data.findingIds).includes(finding.id) || r.refs.includes(finding.id)) ?? null;
    return {
      id: finding.id,
      rank: i + 1,
      artefact: finding,
      title: clean(view.title),
      statement: sentences(view.statement, 1),
      quote: about && clean(about.sourceQuote) ? { text: clip(String(about.sourceQuote)), page: about.page } : null,
      about,
      play: play ? briefPlay(play) : null,
      // A play reached through a part of the policy is not one the finding
      // NAMES, so only directly cited plays are counted as "more".
      morePlays: 0,
      wouldChangeIf: '',
      owner: '',
      action: answer ? clean(answer.label) : '',
      answer,
      severity: view.severity,
      restsOn: null,
      decision: '',
    };
  });
}

/**
 * WHAT EVERY RENDERER LEADS WITH: the key judgements, or on an older
 * assessment the ranked findings. The page, the pack, the brief's Word file and
 * the full Word document all take their "what matters most" from here, so no
 * two of them can lead with different lists — the review of master found the
 * Word export leading with key judgements while the page led with ranked
 * findings.
 */
export function briefItems(artefacts: Artefact[]): { source: Brief['source']; items: BriefItem[] } {
  const judgements = fromJudgements(artefacts);
  return judgements.length
    ? { source: 'judgements', items: judgements }
    : { source: 'findings', items: fromFindings(artefacts) };
}

type StageWarnings = { name: string; ordinal?: number; warnings: string[] };

const RESEARCH_GAP = /^Research unavailable for\b/i;

/**
 * WHAT WE COULD NOT CHECK, IN THREE LINES AT MOST.
 *
 * The run records every limit it met — 256 of them on the real Post-16 run —
 * and "Where this comes from" prints them all. The brief keeps the three that
 * change how far a reader should trust what is above them, in this order:
 *
 *   1. outside evidence that could not be searched, or a sealed run that did
 *      not search — the judgements then rest on the paper and the model alone;
 *   2. steps where the model could not see the whole assessment at once
 *      (`truncations`, the same parser "Where the model could not see
 *      everything" uses);
 *   3. the biggest thing the run did not cover, or failing that how much of
 *      its own work it threw away for failing its checks.
 *
 * Counted by `stageFacts` and `truncations` — the code that already classifies
 * these sentences — never by a third parser.
 */
export function briefLimits(stages: StageWarnings[]): string[] {
  const all = stages.flatMap((s) => s.warnings ?? []);
  const facts = stages.flatMap((s) => stageFacts(s.warnings ?? []));
  const lines: string[] = [];

  const sealed = facts.filter((f) => f.kind === 'sealed').reduce((n, f) => n + f.count, 0);
  const research = all.filter((w) => RESEARCH_GAP.test(clean(w))).length;
  if (sealed) {
    lines.push('This assessment was sealed, so it did not search for outside evidence. Its judgements rest on the paper and the model alone.');
  } else if (research) {
    lines.push(`${research} ${research === 1 ? 'question' : 'questions'} could not be checked against published evidence, because the search was not available. Those judgements rest on the paper and the model alone.`);
  }

  const cut = truncations(stages.map((s, i) => ({ name: s.name, ordinal: s.ordinal ?? i, warnings: s.warnings ?? [] })));
  if (cut.length) {
    const partial = cut.filter((row) => row.partial).length;
    lines.push(`In ${cut.length} of ${stages.length} steps the assessment was too big to show the model at once, so it worked from part of it${partial ? ` (${partial} of those steps say to read their results as partial)` : ''}.`);
  }

  const notCovered = facts
    .filter((f) => f.kind === 'not_covered' && f.of !== null)
    .sort((a, b) => b.count - a.count)[0];
  const discarded = facts.filter((f) => f.kind === 'discarded').reduce((n, f) => n + f.count, 0);
  if (notCovered) {
    // The pipeline's own sentence, up to the list it introduces: "176 of 398
    // source mentions were never resolved into a named body".
    const lead = clean(notCovered.detail.find((d) => /^(?:The )?\d+ of \d+/i.test(clean(d))) ?? notCovered.detail[0]).split(':')[0].replace(/\.$/, '');
    lines.push(`${lead}.`);
  } else if (discarded) {
    lines.push(`The run threw out ${discarded} pieces of its own work because they failed its checks. They are not in this assessment.`);
  }

  return lines.slice(0, BRIEF_LIMITS);
}

/**
 * The brief for an assessment.
 *
 * `stages` is whatever the caller has: the owner's stage rows, or a shared
 * copy's warnings regrouped by stage — `shareableReport` has already dropped
 * the stages whose commentary does not travel.
 */
export function briefOf(artefacts: Artefact[], stages: StageWarnings[]): Brief {
  const headline = headlineSentence(artefacts);
  const exec = findingsBySection(artefacts).find((g) => g.section === 'executive_assessment')?.items[0]?.statement ?? '';
  const rest = exec ? withoutEcho(clean(exec), headline) : '';
  const { source, items } = briefItems(artefacts);
  return {
    headline,
    standfirst: rest && rest !== headline ? sentences(rest, 1) : '',
    source,
    items,
    limits: briefLimits(stages),
  };
}

/** The band a brief item wears, where it has one. */
export const briefBand = (item: BriefItem): string | null => (item.play ? BAND_LABEL[item.play.band] : null);
