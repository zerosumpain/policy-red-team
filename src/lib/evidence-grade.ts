/**
 * HOW FAR THE EVIDENCE CAN BEAR WEIGHT, AND WHAT THAT DOES TO A JUDGEMENT.
 *
 * Phase 22. Every evidence row carries `sourceQuality`, a sentence — on the real
 * Best Start run (`44dd5420`) all 197 of them, the 97 resting on research
 * reading "Moderate…, but weak because this is a search excerpt" or close to it
 * — and nothing downstream read the sentence. So a finding could be judged
 * "well supported" in a run where nothing outside the paper had been opened,
 * and the Summary's "How far to trust this" counted it that way.
 *
 * THREE THINGS LIVE HERE, framework-free so the page, the pack, the Word file
 * and the item page all say the same:
 *
 *   1. `gradeOf` — a row's grade. A new row states one (`evidence.grade`, asked
 *      for against a rubric in prompt 6 and capped by `validation.ts`). An older
 *      row is DERIVED from its prose, conservatively: the lowest grade word the
 *      sentence uses, capped at weak when the only thing behind it is a search
 *      excerpt or the paper's own word, and weak when the sentence names none.
 *   2. `markDownJudgements` — "well supported" with nothing better than weak
 *      evidence behind it becomes "supported with limits", and the copy carries
 *      the one sentence that says why. Applied ONCE, at the root of each
 *      renderer, so a chip, a tally and an item page cannot disagree.
 *   3. `evidenceReadLine` — the run-level sentence for the trust card: when
 *      nothing outside the paper was read in full, say so.
 */
import { EVIDENCE_GRADES, type Artefact, type EvidenceGrade } from '$lib/policy-analysis/contracts';

export { EVIDENCE_GRADES, type EvidenceGrade };

export const GRADE_LABEL: Record<EvidenceGrade, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  weak: 'Weak',
  none: 'No source',
};

/** The rubric, as the evidence section prints it behind a disclosure. Prompt 6 says the same. */
export const GRADE_RUBRIC: { grade: EvidenceGrade; means: string }[] = [
  { grade: 'strong', means: 'A systematic review, a randomised trial or a robust quasi-experimental study, read in full.' },
  { grade: 'moderate', means: 'Official statistics, or an evaluation that states its method, read in full.' },
  { grade: 'weak', means: 'A single observational study, a stakeholder report, a government’s own assertion — including the paper describing its own evidence — or anything read only as a search snippet.' },
  { grade: 'none', means: 'Nothing supports the link at all.' },
];

const rank = (grade: EvidenceGrade) => EVIDENCE_GRADES.indexOf(grade);
/** The weaker of two grades. */
const weaker = (a: EvidenceGrade, b: EvidenceGrade): EvidenceGrade => (rank(a) >= rank(b) ? a : b);
/** The stronger of two grades. */
const stronger = (a: EvidenceGrade, b: EvidenceGrade): EvidenceGrade => (rank(a) <= rank(b) ? a : b);

/*
 * THE WORDS A QUALITY SENTENCE USES FOR EACH STEP. Read as "the lowest step the
 * sentence names", because the sentences hedge in one direction: "Moderate
 * because it is government modelling, but weak because only a search excerpt
 * was reviewed" is a weak row that started out hoping. "high" is here because
 * models write "high quality" for "strong"; "limited" and "low" for "weak".
 */
/*
 * NO WORD MAPS TO "none": that step means no source at all, which is read off
 * the row's sources, never off a sentence that happens to say "none of".
 */
const WORDS: [EvidenceGrade, RegExp][] = [
  ['weak', /\b(?:weak|low|limited|poor|unverified|anecdotal)\b/i],
  ['moderate', /\b(?:moderate|medium|reasonable)\b/i],
  ['strong', /\b(?:strong|high|robust)\b/i],
];

/** The grade a quality sentence names, lowest first; null where it names none. */
export function gradeFromText(text: string): EvidenceGrade | null {
  for (const [grade, pattern] of WORDS) if (pattern.test(text)) return grade;
  return null;
}

/** The documents a row rests on: its source and any passage or research it cites. */
function sourcesOf(row: Artefact, byId: Map<string, Artefact>): Artefact[] {
  const ids = new Set([row.sourceId, typeof row.data?.sourceId === 'string' ? row.data.sourceId : null, ...(row.refs ?? [])]);
  const out: Artefact[] = [];
  for (const id of ids) {
    const found = id ? byId.get(id) : undefined;
    if (found && (found.kind === 'passage' || found.kind === 'research_source')) out.push(found);
  }
  return out;
}

/** Was this document read in full — a full-text research source? The paper itself is not "outside". */
const readInFull = (source: Artefact) => source.kind === 'research_source' && source.data?.retrieval === 'full_text';

/**
 * THE MOST A ROW'S SOURCES CAN CARRY. Anything read in full: no cap. Only the
 * paper and snippets: weak — the paper is a government's own assertion and a
 * snippet is a paragraph of a document nobody opened. No source: none.
 */
function ceilingOf(sources: Artefact[], named: boolean): EvidenceGrade {
  // A source NAMED but not in hand is a withheld one, not an absent one: a
  // shared copy drops every passage of the paper (`share.ts`), and a row
  // citing the paper must not read as resting on nothing there. Weak, as the
  // paper's own word is.
  if (!sources.length) return named ? 'weak' : 'none';
  return sources.some(readInFull) ? 'strong' : 'weak';
}

export type RowGrade = { grade: EvidenceGrade; derived: boolean };

/**
 * One evidence row's grade.
 *
 * A stated grade is taken as written, except that it is capped by what stands
 * behind it — `validation.ts` does the same at the door for snippets, and this
 * repeats it so a row stored before that rule cannot slip past. A row with no
 * stated grade is derived from its sentence, and a sentence that names no step
 * is read as weak: "unknown" is not evidence of strength.
 */
export function gradeOf(row: Artefact, byId: Map<string, Artefact>): RowGrade {
  const ceiling = ceilingOf(sourcesOf(row, byId), Boolean(row.sourceId || row.data?.sourceId));
  const stated = (EVIDENCE_GRADES as readonly string[]).includes(String(row.data?.grade)) ? (row.data.grade as EvidenceGrade) : null;
  if (stated) return { grade: weaker(stated, ceiling), derived: false };
  const read = gradeFromText(String(row.data?.sourceQuality ?? '')) ?? 'weak';
  return { grade: weaker(read, ceiling), derived: true };
}

export type GradeTally = {
  rows: { grade: EvidenceGrade; label: string; count: number }[];
  total: number;
  /** How many of the grades were worked out from a sentence rather than stated. */
  derived: number;
};

/** Every evidence row, counted by grade, strongest first. Zeros kept: "0 strong" is the reading. */
export function gradeTally(artefacts: Artefact[]): GradeTally {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const counts = new Map<EvidenceGrade, number>(EVIDENCE_GRADES.map((g) => [g, 0]));
  let derived = 0;
  let total = 0;
  for (const row of artefacts) {
    if (row.kind !== 'evidence') continue;
    const { grade, derived: d } = gradeOf(row, byId);
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
    if (d) derived += 1;
    total += 1;
  }
  return { rows: EVIDENCE_GRADES.map((grade) => ({ grade, label: GRADE_LABEL[grade], count: counts.get(grade) ?? 0 })), total, derived };
}

/** What the research step actually opened: sources read in full, and snippets. */
export function researchRead(artefacts: Artefact[]): { fullText: number; excerpts: number } {
  let fullText = 0;
  let excerpts = 0;
  for (const a of artefacts) {
    if (a.kind !== 'research_source') continue;
    if (a.data?.retrieval === 'full_text') fullText += 1; else excerpts += 1;
  }
  return { fullText, excerpts };
}

export const NOTHING_READ_IN_FULL = 'Nothing outside the paper was read in full; these judgements rest on the paper and search snippets.';
export const NOTHING_READ = 'Nothing outside the paper was read; these judgements rest on the paper alone.';

/**
 * THE ONE SENTENCE THE TRUST CARD OWES A READER when the research step opened
 * nothing. Null when something was read in full. The second form is for a run
 * with no outside sources at all — "search snippets" would be false there — and
 * the brief leaves it out when a sealed or search-unavailable line has already
 * said as much.
 */
export function evidenceReadLine(artefacts: Artefact[]): string | null {
  const { fullText, excerpts } = researchRead(artefacts);
  if (fullText) return null;
  return excerpts ? NOTHING_READ_IN_FULL : NOTHING_READ;
}

/** The kinds whose `judgement` claims something about the evidence. */
const JUDGED = new Set(['finding', 'recommendation', 'causal_chain', 'logic_model', 'option_appraisal', 'evaluation_plan']);

/** Everything a judged item names, one hop: what it cites and the ids its fields carry. */
function namedBy(a: Artefact): Set<string> {
  const ids = new Set<string>(a.refs ?? []);
  for (const field of ['resultIds', 'hypothesisIds', 'assumptions', 'mechanismIds', 'findingIds']) {
    const value = a.data?.[field];
    if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') ids.add(id);
  }
  for (const field of ['mechanismId', 'assumptionId']) if (typeof a.data?.[field] === 'string') ids.add(a.data[field] as string);
  return ids;
}

export type MarkedDown = { from: string; reason: string };

/** The note `markDownJudgements` leaves on a copy it changed. */
export function markedDown(a: Artefact): MarkedDown | null {
  const note = a.data?.markedDown as MarkedDown | undefined;
  return note && typeof note.reason === 'string' ? note : null;
}

const WEAK_REASON = 'Marked down from well supported: the best evidence behind it is weak, and well supported needs evidence read in full.';
const NONE_REASON = 'Marked down from supported with limits: no evidence row stands behind it.';

/**
 * THE JUDGEMENT THE EVIDENCE WILL CARRY.
 *
 * The evidence "behind" an item is every evidence row it cites, or that is
 * about something it cites (a claim, mechanism, assumption or body it names) —
 * one hop, because at two hops every row in the run is behind every finding.
 * Where none is, the run's own best grade stands in: a finding that cites no
 * evidence in a run that read nothing in full is no better supported than the
 * run.
 *
 *   - well supported, best evidence weak or none → supported with limits;
 *   - supported with limits, best evidence none   → provisional.
 *
 * Nothing is ever marked UP, and nothing else moves: "contested" and
 * "provisional" already say the evidence is short. Returns the same array when
 * nothing changed, so a memo keyed on it does not churn.
 */
export function markDownJudgements(artefacts: Artefact[]): Artefact[] {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const rows = artefacts.filter((a) => a.kind === 'evidence');
  if (!artefacts.some((a) => JUDGED.has(a.kind) && (a.data?.judgement === 'well_supported' || a.data?.judgement === 'supported_with_limits'))) return artefacts;
  const graded = rows.map((row) => ({ row, grade: gradeOf(row, byId).grade }));
  const runBest = graded.reduce<EvidenceGrade>((best, { grade }) => stronger(best, grade), 'none');
  let changed = false;
  const out = artefacts.map((a) => {
    const judgement = a.data?.judgement;
    if (!JUDGED.has(a.kind) || (judgement !== 'well_supported' && judgement !== 'supported_with_limits')) return a;
    const named = namedBy(a);
    const behind = graded.filter(({ row }) => named.has(row.id)
      || ['claimId', 'mechanismId', 'assumptionId', 'actorId'].some((f) => typeof row.data?.[f] === 'string' && named.has(row.data[f] as string)));
    const best = behind.length ? behind.reduce<EvidenceGrade>((b, { grade }) => stronger(b, grade), 'none') : runBest;
    let next: { judgement: string; reason: string } | null = null;
    if (judgement === 'well_supported' && rank(best) >= rank('weak')) next = { judgement: 'supported_with_limits', reason: best === 'none' ? 'Marked down from well supported: no evidence row stands behind it.' : WEAK_REASON };
    else if (judgement === 'supported_with_limits' && best === 'none') next = { judgement: 'provisional', reason: NONE_REASON };
    if (!next) return a;
    changed = true;
    return { ...a, data: { ...a.data, judgement: next.judgement, markedDown: { from: String(judgement), reason: next.reason } } };
  });
  return changed ? out : artefacts;
}
