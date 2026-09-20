/**
 * WHAT THE WRITE-UP CAN SAY ABOUT ITSELF.
 *
 * The write-up is the assessment's own prose, and the page rendered it as
 * eighteen equal cards: same height, same weight, same colour, in the order the
 * storage contract lists its sections. Nothing on it distinguished a conclusion
 * the review called well supported from one it called provisional, although
 * every finding carries `data.judgement` and has done since the assured
 * synthesis was added.
 *
 * MEASURED ON THE POST-16 RUN: nineteen assured findings across nineteen
 * sections, one each — four well supported, eleven supported with limits, four
 * provisional, none contested. A fifth of the write-up is flagged provisional by
 * the report itself. That is a sentence the page can print, and it is arithmetic
 * over a prop, which is why it is here with a test rather than inline in a
 * component: `WriteUp` decides presentation and this decides the figure.
 *
 * THE OTHER FUNCTION IS AN ALARM RATHER THAN A FIGURE. `REPORT_ACTS` claims
 * nineteen sections by name, and a contract change that adds a twentieth would
 * silently drop it out of an act-grouped page — the section would simply not be
 * drawn, and no test would notice because the sections that ARE claimed still
 * render. `unplacedChapters` is the difference between what the acts claim and
 * what the assessment wrote, so a drift surfaces as a band on the page. It
 * returns nothing on this run, which is the point: it costs nothing to honour.
 */
import { JUDGEMENT_LABELS, REPORT_ACTS, confidenceJudgement } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';

/** One section of the write-up: the shape `findingsBySection` and `reportActs` both deal in. */
export type Chapter = { section: string; label: string; items: Artefact[] };

/**
 * The judgement order, strongest claim first.
 *
 * `JUDGEMENT_LABELS` is a record and its key order is not a contract, so the
 * ramp the page counts along is written down here. `unknown` is last because it
 * is the absence of a judgement rather than a weak one.
 */
const JUDGEMENT_ORDER = ['well_supported', 'supported_with_limits', 'provisional', 'contested', 'unknown'] as const;

export type JudgementCount = { key: string; label: string; count: number };

/** Reverse of `JUDGEMENT_LABELS`, so one word maps back to the one key that styles it. */
const LABEL_TO_KEY = new Map(Object.entries(JUDGEMENT_LABELS).map(([key, label]) => [label, key]));

/**
 * The word a finding's judgement reads as, and the key that draws it.
 *
 * `confidenceJudgement` returns the LABEL — it is what `Drill` prints — and one
 * of its branches, "Documented in the paper", is not in `JUDGEMENT_LABELS` at
 * all. A label with no key gets an empty key rather than a wrong one, so the
 * chip falls back to its plain treatment and the tally counts it under its own
 * word instead of dropping a finding out of the count.
 */
export function judgementOf(artefact: Artefact): { key: string; label: string } {
  const label = confidenceJudgement(artefact);
  return { key: LABEL_TO_KEY.get(label) ?? '', label };
}

/**
 * How many findings carry each judgement, in ramp order, zeros dropped.
 *
 * Counted over FINDINGS, not sections: a section holding three findings that
 * disagree about their own confidence is three counts, and on a run where every
 * section holds one the two readings coincide. Zeros are dropped because "0
 * contested" is a sentence about a category the assessment did not use, and the
 * line this feeds is a summary of what it did.
 *
 * `confidenceJudgement` rather than `data.judgement` directly, so the write-up
 * and the drill — the only other caller — say the same word about the same
 * artefact, including for the older findings that carry a confidence and no
 * explicit judgement at all.
 */
export function judgementTally(chapters: Chapter[]): JudgementCount[] {
  const seen = new Map<string, number>();
  for (const chapter of chapters) {
    for (const item of chapter.items) {
      const { key, label } = judgementOf(item);
      // A finding the page cannot classify is still a finding in the write-up,
      // so it is counted under its own word rather than dropped.
      seen.set(key || label, (seen.get(key || label) ?? 0) + 1);
    }
  }
  const known = JUDGEMENT_ORDER.filter((key) => seen.has(key)).map((key) => ({
    key: String(key), label: JUDGEMENT_LABELS[key] ?? String(key), count: seen.get(key) ?? 0,
  }));
  const other = [...seen.keys()]
    .filter((key) => !(JUDGEMENT_ORDER as readonly string[]).includes(key))
    .sort()
    .map((key) => ({ key, label: key, count: seen.get(key) ?? 0 }));
  return [...known, ...other];
}

/** Total findings behind a tally — the denominator the sentence needs. */
export function tallyTotal(tally: JudgementCount[]): number {
  return tally.reduce((n, entry) => n + entry.count, 0);
}

/** An act with the chapters this assessment actually wrote for it. */
export type ActView = { key: string; title: string; strap: string; chapters: Chapter[] };

/**
 * The write-up's sections, grouped into the five acts the .docx already prints.
 *
 * `REPORT_ACTS` rather than `reportActs()` — the constant, not the function —
 * because the function takes the whole artefact array and re-runs
 * `findingsBySection()` to get back the sections the caller has already
 * computed and is already holding. Same grouping, same order, same straps, one
 * derivation instead of two, and it takes the shape a component actually has.
 *
 * An act with no chapter is dropped: an empty band is a heading and a strap
 * promising something the assessment did not write.
 */
export function actsOf(chapters: Chapter[]): ActView[] {
  const bySection = new Map(chapters.map((chapter) => [chapter.section, chapter]));
  return REPORT_ACTS.map((act) => ({
    key: act.key,
    title: act.title,
    strap: act.strap,
    chapters: act.sections
      .map((section) => bySection.get(section))
      .filter((chapter): chapter is Chapter => Boolean(chapter)),
  })).filter((act) => act.chapters.length);
}

/**
 * Sections the assessment wrote that no act claims.
 *
 * Set difference by section id, in the order the assessment's own section list
 * returned them, so a drift band reads in contract order like the rest of the
 * report.
 */
export function unplacedChapters(chapters: Chapter[]): Chapter[] {
  const claimed = new Set<string>(REPORT_ACTS.flatMap((act) => act.sections as readonly string[]));
  return chapters.filter((chapter) => !claimed.has(chapter.section));
}

/**
 * The lead statement with the sentence the page has already printed removed.
 *
 * The Verdict panel opens with `headlineSentence()` — the first sentence of the
 * executive assessment — and the write-up's standfirst is the whole of that same
 * statement, so on the real run the reader meets the identical 199 characters
 * twice, about 2,500px apart. An editor cuts the repeat from the standfirst, not
 * from the headline, because the headline is the one line the assessment exists
 * to produce.
 *
 * Nothing is lost from the document: the removed sentence is still on the page,
 * higher up, and still in the offline pack for Ctrl-F. The match is EXACT and
 * the whole statement is kept whenever it is not — a headline that has been
 * rewritten, trimmed or re-cased must never silently delete prose.
 */
export function withoutEcho(statement: string, echoed?: string): string {
  const text = statement.trim();
  const head = (echoed ?? '').trim();
  if (!head || !text.startsWith(head)) return text;
  const rest = text.slice(head.length).trim();
  // A standfirst that is ONLY the headline has nothing left to say, and an empty
  // paragraph under a kicker reads as a rendering fault. Keep the statement.
  return rest.length ? rest : text;
}
