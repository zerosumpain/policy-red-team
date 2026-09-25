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

/**
 * ─── THE FINDINGS THAT MATTER FIRST ──────────────────────────────────────
 *
 * The Verdict move printed the write-up as nineteen equal cards, section 8 of
 * 12 — the visual form of "no prioritisation", about 3,000px of grey on the
 * Post-16 run that a reader had to rank for themselves. The assessment already
 * carries what a ranking needs, on every assured finding:
 *
 *   - `data.resultIds` — the checks, plays and scenarios it cites as results.
 *     A check that came back HIGH RISK or a SEVERE play is a serious result;
 *     an indeterminate check or a model is not a severity at all.
 *   - `data.judgement` — how well the final review thought it was supported.
 *   - how much it cites — results plus the assumptions (`hypothesisIds`) it
 *     names — which is the only honest reading of "support" without a model.
 *
 * So a finding ranks by how serious the worst thing it cites is, then by how
 * well supported the review judged it, then by how much it cites, then in the
 * report's own section order. Every step is a field the page can print, and the
 * card prints the reason for its severity, so the order can be argued with.
 *
 * THE SHAPE IS A JUDGEMENT, NOT A FINDING. Phase 19's analysis workstream adds a
 * "key judgements" artefact — at most five, each naming a mechanism, a quote, a
 * play, an assumption, what would prove it wrong and an action with an owner.
 * `KeyJudgement` is what the Verdict lead draws, and `details` is where those
 * extra fields will go as labelled rows, so wiring the new artefact in is a
 * mapping function and no change to the component.
 */

/** How serious the worst thing a finding cites is. `level` 0 means nothing it cites carries a severity. */
export type Severity = { level: 0 | 1 | 2 | 3; label: string; reason: string };

export type KeyJudgement = {
  id: string;
  /** The record to link to. Null for a judgement that has no drill page. */
  artefact: Artefact | null;
  title: string;
  statement: string;
  /** Which part of the report it came from, in words — "Test results". */
  sectionLabel?: string;
  judgement: { key: string; label: string };
  severity: Severity;
  /** How many results and assumptions it cites. */
  support: number;
  /** Extra labelled facts, for the key-judgements artefact to come. */
  details?: { label: string; value: string }[];
};

/**
 * Sections that are about the ASSESSMENT rather than the policy.
 *
 * The executive assessment is the headline and the standfirst already; scope
 * and methodology says what the run could see. Neither is a finding about the
 * paper, so neither competes for a place in the ranked list — both are still
 * in the appendix.
 */
export const NOT_RANKED = new Set(['executive_assessment', 'scope_methodology']);

const SEVERITY_WORD: Record<Severity['level'], string> = { 3: 'High', 2: 'Medium', 1: 'Low', 0: 'Not rated' };

/** The severity one cited result carries, 0 where it carries none. */
function resultLevel(result: Artefact | undefined): Severity['level'] {
  if (!result) return 0;
  if (result.kind === 'test') {
    const outcome = String(result.data.result ?? '');
    return outcome === 'high_risk' ? 3 : outcome === 'moderate_risk' ? 2 : 0;
  }
  if (result.kind === 'exploit') {
    const band = String(result.data.band ?? '');
    return band === 'severe' ? 3 : band === 'significant' ? 2 : band === 'moderate' ? 1 : 0;
  }
  return 0;
}

const idsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The worst thing a finding cites, and the sentence that says so. */
export function severityOf(finding: Artefact, byId: Map<string, Artefact>): Severity {
  const results = idsOf(finding.data.resultIds).map((id) => byId.get(id));
  const levels = results.map(resultLevel);
  const level = Math.max(0, ...levels) as Severity['level'];
  if (!level) return { level, label: SEVERITY_WORD[0], reason: 'Nothing it cites carries a risk rating.' };
  const at = results.filter((_, i) => levels[i] === level);
  const checks = at.filter((r) => r?.kind === 'test').length;
  const plays = at.length - checks;
  const word = level === 3 ? 'high' : level === 2 ? 'medium' : 'low';
  const parts = [
    checks ? `${checks} ${checks === 1 ? 'check' : 'checks'} that found ${word} risk` : '',
    plays ? `${plays} ${plays === 1 ? 'way' : 'ways'} to beat the policy rated ${word}` : '',
  ].filter(Boolean);
  return { level, label: SEVERITY_WORD[level], reason: `It cites ${parts.join(' and ')}.` };
}

/** Strongest first. `unknown` and anything unrecognised rank with `contested`, below provisional. */
const STRENGTH: Record<string, number> = { well_supported: 3, supported_with_limits: 2, provisional: 1 };

/** A finding, as the Verdict lead draws it. */
export function asJudgement(finding: Artefact, byId: Map<string, Artefact>, sectionLabel?: string): KeyJudgement {
  return {
    id: finding.id,
    artefact: finding,
    title: finding.label,
    statement: finding.statement,
    sectionLabel,
    judgement: judgementOf(finding),
    severity: severityOf(finding, byId),
    support: idsOf(finding.data.resultIds).length + idsOf(finding.data.hypothesisIds).length,
  };
}

/**
 * Every finding the write-up shows, ranked, split into the ones that lead and
 * the rest. `NOT_RANKED` sections are never in `top`; the rest keep report
 * order, because the appendix is where a reader goes for the whole.
 */
export function rankFindings(chapters: Chapter[], artefacts: Artefact[], lead = 5): {
  top: KeyJudgement[];
  rest: { chapter: Chapter; item: Artefact }[];
} {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const entries = chapters.flatMap((chapter, c) => chapter.items.map((item, i) => ({ chapter, item, order: c * 1000 + i })));
  const scored = entries
    .filter((entry) => !NOT_RANKED.has(entry.chapter.section))
    .map((entry) => ({ ...entry, view: asJudgement(entry.item, byId, entry.chapter.label) }));
  scored.sort((a, b) => b.view.severity.level - a.view.severity.level
    || (STRENGTH[b.view.judgement.key] ?? 0) - (STRENGTH[a.view.judgement.key] ?? 0)
    || b.view.support - a.view.support
    || a.order - b.order);
  const top = scored.slice(0, lead);
  const chosen = new Set(top.map((entry) => entry.item.id));
  return {
    top: top.map((entry) => entry.view),
    rest: entries.filter((entry) => !chosen.has(entry.item.id)).map(({ chapter, item }) => ({ chapter, item })),
  };
}
