/**
 * WHAT WAS CHECKED OUTSIDE THE PAPER, PER QUESTION AND PER ITEM (phase 22 part 2).
 *
 * The research step on the real Best Start run (`44dd5420`) asked 43 questions
 * and kept 116 sources, and NO PAGE showed it: a source was reachable only as
 * an item page if something happened to link to it, and the question it
 * answered — who asked it, why, what came back, what it did, what is still open
 * — was on no page at all. That is the work a reader most needs to judge how
 * far the report reached beyond the paper, and the place a reader who knows a
 * better source would want to say so.
 *
 * Two joins, framework-free so the page, the pack and the item page say the
 * same:
 *
 *   `researchChecks` — every research question with its sources, their grade
 *     and how much of each was read, what the evidence matrix did with them,
 *     and the gap still open. Reader questions first, then by priority.
 *   `itemChecks` — the evidence rows touching ONE item: those naming it in
 *     `claimId` / `mechanismId` / `actorId` / `assumptionId`, and those citing
 *     a source the reader supplied about it (`aboutIds`).
 *
 * A source's grade is the grade the evidence matrix gave the links drawn from
 * it (`gradeOf`, so a snippet is never more than weak) — a source no link
 * cites has no grade, and says so rather than borrowing one.
 */
import type { Artefact, EvidenceGrade } from '$lib/policy-analysis/contracts';
import { GRADE_LABEL, gradeOf, EVIDENCE_GRADES } from '$lib/evidence-grade';
import { researchRank } from '$lib/policy-analysis/reader-inputs';

export const RESULT_WORDS: Record<string, string> = {
  supports: 'Supports the paper',
  contradicts: 'Contradicts the paper',
  mixed: 'Mixed',
  insufficient: 'Cannot settle it',
};

export type SourceView = {
  source: Artefact;
  title: string;
  url: string | null;
  /** Read in full, or only a search snippet. */
  fullText: boolean;
  /** The strongest grade any evidence link drawn from it carries; null when none cites it. */
  grade: EvidenceGrade | null;
  gradeLabel: string;
  publisher: string | null;
  publishedAt: string | null;
  /** The reader named it. */
  supplied: boolean;
  /** What the evidence links drawn from it said, in words, most common first. */
  results: string[];
};

export type Outcome = 'supports' | 'contradicts' | 'mixed' | 'insufficient' | 'unused' | 'nothing' | 'unasked';
export const OUTCOME_WORDS: Record<Outcome, string> = {
  supports: 'Supports the paper',
  contradicts: 'Contradicts the paper',
  mixed: 'Mixed: some for, some against',
  insufficient: 'Cannot settle it',
  unused: 'Found, but not used as evidence',
  nothing: 'Nothing came back',
  unasked: 'Not searched',
};

export type QuestionView = {
  question: Artefact;
  /** Who asked: the reader, or the model. */
  askedBy: 'you' | 'the model';
  why: string;
  /** What it targets: the assumptions, claims, bodies or parts it cites. */
  targets: Artefact[];
  /** 1-based rank among the model's questions by priority; null for a reader's. */
  rank: number | null;
  sources: SourceView[];
  outcome: Outcome;
  /** Evidence links drawn from its sources, by result. */
  tally: Record<'supports' | 'contradicts' | 'mixed' | 'insufficient', number>;
  gap: string;
  /** Nothing came back, or nothing that settles it. */
  open: boolean;
  /**
   * Why a question with nothing behind it has nothing, when the run said:
   * not followed up, the source ceiling, or the search unavailable. Read off
   * the stage warnings that name the question; null when none does.
   */
  nothingBecause: string | null;
};

export type ResearchChecks = {
  questions: QuestionView[];
  /** How many questions the model ranked, for "ranked 3 of 40". */
  ranked: number;
  counts: { questions: number; asked: number; answered: number; sources: number; fullText: number; supplied: number; open: number; unasked: number };
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const TARGET_KINDS = new Set(['assumption', 'claim', 'mechanism', 'actor']);

/** The evidence rows drawn from each source, by source id. */
function evidenceBySource(artefacts: Artefact[]): Map<string, Artefact[]> {
  const out = new Map<string, Artefact[]>();
  for (const row of artefacts) {
    if (row.kind !== 'evidence') continue;
    const id = str(row.data.sourceId) || row.sourceId || '';
    if (!id) continue;
    out.set(id, [...(out.get(id) ?? []), row]);
  }
  return out;
}

function sourceView(source: Artefact, rows: Artefact[], byId: Map<string, Artefact>): SourceView {
  const grades = rows.map((row) => gradeOf(row, byId).grade);
  const grade = grades.length ? EVIDENCE_GRADES.find((g) => grades.includes(g)) ?? null : null;
  const results = [...new Set(rows.map((row) => str(row.data.result)).filter(Boolean))].map((r) => RESULT_WORDS[r] ?? r);
  return {
    source,
    title: source.label,
    url: source.url,
    fullText: source.data.retrieval === 'full_text',
    grade,
    gradeLabel: grade ? GRADE_LABEL[grade] : 'Not graded: nothing cites it',
    publisher: str(source.data.publisher) || null,
    publishedAt: str(source.data.publishedAt) || null,
    supplied: source.data.supplied === 'reader',
    results,
  };
}

/** One word for what a question's evidence did. */
function outcomeOf(sources: SourceView[], tally: QuestionView['tally']): Outcome {
  if (!sources.length) return 'nothing';
  const total = tally.supports + tally.contradicts + tally.mixed + tally.insufficient;
  if (!total) return 'unused';
  if (tally.mixed || (tally.supports && tally.contradicts)) return 'mixed';
  if (tally.contradicts) return 'contradicts';
  if (tally.supports) return 'supports';
  return 'insufficient';
}

/*
 * WHY NOTHING CAME BACK, in the run's own words. Measured on the real run: the
 * ten highest-priority questions had no source, and not because a search
 * found nothing — they were raised by later steps that may follow up only two
 * at a time ("Not pursued: …"). "Nothing came back" would have said the
 * opposite of what happened. The sentences are `pipeline.ts`'s and
 * `research.ts`'s; a question is matched by its label inside one.
 */
const NOT_ASKED: [RegExp, string][] = [
  [/Not pursued: /, 'Not searched: the step that raised it may follow up only a few questions at a time, and this was not one of them.'],
  [/could not be researched: this assessment holds/, 'Not searched: the run had reached its ceiling on sources.'],
];
const SEARCHED: [RegExp, string][] = [
  [/^(?:Enquiry round \d+: )?No sources found for /, 'Searched, and the search found nothing.'],
  [/^(?:Enquiry round \d+: )?Research unavailable for /, 'The search was not available when it was asked.'],
];

function whyNothing(label: string, warnings: string[]): { asked: boolean; why: string } | null {
  for (const w of warnings) {
    if (!w.includes(label)) continue;
    for (const [pattern, why] of NOT_ASKED) if (pattern.test(w)) return { asked: false, why };
    for (const [pattern, why] of SEARCHED) if (pattern.test(w)) return { asked: true, why };
  }
  return null;
}

/** `warnings` are the run's stage warnings, flattened; they say why a question has nothing. */
export function researchChecks(artefacts: Artefact[], warnings: string[] = []): ResearchChecks {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const drawn = evidenceBySource(artefacts);
  const questions = artefacts.filter((a) => a.kind === 'research_question');
  const sourcesOf = new Map<string, Artefact[]>();
  for (const s of artefacts) {
    if (s.kind !== 'research_source') continue;
    const q = str(s.data.questionId);
    sourcesOf.set(q, [...(sourcesOf.get(q) ?? []), s]);
  }
  // The model's own ranking, for "ranked 3 of 40" — the reader's are first
  // whatever their score, so they are not ranked against it.
  const modelOrder = questions.filter((q) => q.data.asked !== 'reader')
    .sort((a, b) => researchRank(b) - researchRank(a));
  const rankOf = new Map(modelOrder.map((q, i) => [q.id, i + 1]));

  const views: QuestionView[] = questions.map((question) => {
    const sources = (sourcesOf.get(question.id) ?? []).map((s) => sourceView(s, drawn.get(s.id) ?? [], byId));
    const tally = { supports: 0, contradicts: 0, mixed: 0, insufficient: 0 };
    for (const s of sources) for (const row of drawn.get(s.source.id) ?? []) {
      const r = str(row.data.result) as keyof typeof tally;
      if (r in tally) tally[r] += 1;
    }
    const said = sources.length ? null : whyNothing(question.label, warnings);
    const outcome = said && !said.asked ? 'unasked' : outcomeOf(sources, tally);
    const reader = question.data.asked === 'reader';
    return {
      question,
      askedBy: reader ? 'you' : 'the model',
      why: str(question.data.rationale),
      targets: question.refs.map((id) => byId.get(id)).filter((a): a is Artefact => Boolean(a) && TARGET_KINDS.has(a!.kind)),
      rank: reader ? null : rankOf.get(question.id) ?? null,
      sources,
      outcome,
      tally,
      gap: str(question.data.gap),
      open: outcome === 'nothing' || outcome === 'unasked' || outcome === 'unused' || outcome === 'insufficient',
      nothingBecause: said?.why ?? null,
    };
  });
  // The reader's first, in the order they gave them; then the model's by priority.
  views.sort((a, b) => researchRank(b.question) - researchRank(a.question));
  const all = views.flatMap((v) => v.sources);
  return {
    questions: views,
    ranked: modelOrder.length,
    counts: {
      questions: views.length,
      asked: views.filter((v) => v.askedBy === 'you').length,
      answered: views.filter((v) => v.sources.length).length,
      sources: all.length,
      fullText: all.filter((s) => s.fullText).length,
      supplied: all.filter((s) => s.supplied).length,
      open: views.filter((v) => v.open).length,
      unasked: views.filter((v) => v.outcome === 'unasked').length,
    },
  };
}

export type ItemCheck = {
  evidence: Artefact;
  result: string;
  grade: EvidenceGrade;
  gradeLabel: string;
  source: Artefact | null;
  supplied: boolean;
  fullText: boolean;
};

/**
 * THE EVIDENCE FROM OUTSIDE THE PAPER THAT TOUCHES ONE ITEM.
 *
 * Only links drawn from a `research_source` — the paper citing itself is not a
 * check outside the paper, and the item page already quotes the paper. A
 * research source opened as an item lists the links drawn from it; a research
 * question, the links drawn from its sources. Strongest first, then by result.
 */
export function itemChecks(artefacts: Artefact[], itemId: string): ItemCheck[] {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const item = byId.get(itemId);
  if (!item) return [];
  const sourceOf = (row: Artefact) => byId.get(str(row.data.sourceId) || row.sourceId || '') ?? null;
  const own = item.kind === 'research_question'
    ? new Set(artefacts.filter((s) => s.kind === 'research_source' && s.data.questionId === itemId).map((s) => s.id))
    : null;
  const rows = artefacts.filter((row) => {
    if (row.kind !== 'evidence') return false;
    const source = sourceOf(row);
    if (source?.kind !== 'research_source') return false;
    if (item.kind === 'research_source') return source.id === itemId;
    if (own) return own.has(source.id);
    if (['claimId', 'mechanismId', 'actorId', 'assumptionId'].some((field) => row.data[field] === itemId)) return true;
    const about = source.data.aboutIds;
    return Array.isArray(about) && about.includes(itemId);
  });
  return rows
    .map((row) => {
      const source = sourceOf(row);
      const grade = gradeOf(row, byId).grade;
      return {
        evidence: row, result: RESULT_WORDS[str(row.data.result)] ?? str(row.data.result), grade, gradeLabel: GRADE_LABEL[grade],
        source, supplied: source?.data.supplied === 'reader', fullText: source?.data.retrieval === 'full_text',
      };
    })
    .sort((a, b) => EVIDENCE_GRADES.indexOf(a.grade) - EVIDENCE_GRADES.indexOf(b.grade));
}

/** Whether an item is a source the reader supplied — for the tag on its page. */
export const isSupplied = (a: Artefact | null | undefined): boolean => a?.kind === 'research_source' && a.data.supplied === 'reader';
