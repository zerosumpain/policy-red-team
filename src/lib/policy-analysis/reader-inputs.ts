import { classifyDomain } from '$lib/deepdive/credibility';
import { artefact, type Artefact } from './contracts';

/**
 * WHAT THE READER BRINGS TO THE RESEARCH STEP (phase 22 part 2).
 *
 * The research step plans its own questions and finds its own sources. A
 * reader who knows the field usually knows two things it does not: the
 * evaluation that settles a question, and the question the paper is quietly
 * avoiding. John's decision, 1 October 2026: they can say both — at
 * submission, on any item page, and on any open research gap — and what they
 * say is DATA the run reads, not an instruction it obeys.
 *
 * Two rules carry the weight, and both are about not tilting the report:
 *
 *   - A SUPPLIED SOURCE IS GRADED LIKE ANY OTHER. It becomes an ordinary
 *     `research_source`, `retrieval` saying how much of it was read, and the
 *     evidence matrix applies part 1's rubric to it exactly as to a search
 *     result. Being chosen by the reader makes it relevant, never strong.
 *   - A LOOK-UP IS ASKED FIRST, NOT ANSWERED DIFFERENTLY. It becomes a
 *     `research_question` that ranks above every model question, so the
 *     existing budget walk spends on it first — within the same source
 *     ceiling, through the same query guard (no quotation of the paper), and
 *     with its query BUILT BY THE SERVER from the reader's words, refused if
 *     those words carry an address, an email or anything shaped like personal
 *     data. A third party's search logs are no place for either.
 *
 * Everything here is pure: the worker fetches and extracts, this mints the
 * artefacts, and `pipeline.ts` puts them in front of the stage.
 */

export const MAX_READER_SOURCES = 10;
export const MAX_LOOK_UPS = 10;
/** One supplied file. A policy paper may be 10 MB; a source the reader names is read in part anyway. */
export const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
/** Every supplied file together, on top of the paper's own 10 MB. */
export const MAX_SOURCE_FILES_BYTES = 6 * 1024 * 1024;
export const MAX_LOOK_UP_CHARACTERS = 300;
export const MAX_ABOUT_CHARACTERS = 200;
export const MAX_NOTE_CHARACTERS = 1000;
/** What one supplied source may put in front of the evidence matrix: `research.ts`'s own cap. */
export const MAX_SUPPLIED_CHARACTERS = 10_000;

/** A source the reader named, as the worker resolved it before the stage ran. */
export type SuppliedSource = {
  form: 'file' | 'page';
  /** The page's address after redirects, or null for a file. */
  url: string | null;
  title: string;
  /** Null when it could not be read: the reason is in `failure`. */
  text: string | null;
  failure: string | null;
  about: string | null;
  note: string | null;
};

export type LookUp = { wording: string; query: string };

/**
 * REFUSED, NOT TIDIED: a look-up that carries any of these is not sent.
 *
 * An address or an email is the obvious one. The others are the shapes of
 * personal data a reader might paste without thinking — a phone number, a UK
 * postcode, a National Insurance number — and none of them belongs in a third
 * party's query log. A refusal is said back to the reader at submission, so
 * they can rephrase, rather than silently dropped at run time.
 */
const PERSONAL: [RegExp, string][] = [
  [/https?:|www\./i, 'It contains a web address. Give it as a source instead, and it will be read rather than searched for.'],
  [/@/, 'It contains an email address, which is not sent to a search service.'],
  [/(?:\+?\d[\s-]?){9,}/, 'It contains a phone number, which is not sent to a search service.'],
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, 'It contains a postcode, which is not sent to a search service.'],
  [/\b[A-Z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-D]\b/i, 'It contains a National Insurance number, which is not sent to a search service.'],
];

/**
 * The search query the server builds from a reader's look-up, or the reason it
 * will not. Quotation marks and other punctuation a search engine reads as
 * syntax are dropped, whitespace collapsed, and the length capped — the query
 * is the reader's words and nothing else.
 */
export function lookUpQuery(wording: string): { query: string } | { refused: string } {
  const text = wording.replace(/[\r\n\t]+/g, ' ').trim();
  if (!text) return { refused: 'It is empty.' };
  if (text.length > MAX_LOOK_UP_CHARACTERS) return { refused: `It is longer than ${MAX_LOOK_UP_CHARACTERS} characters.` };
  for (const [pattern, why] of PERSONAL) if (pattern.test(text)) return { refused: why };
  const query = text.replace(/["“”‘’'`()[\]{}<>|^~*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (query.length < 3) return { refused: 'It is too short to search for.' };
  return { query };
}

/** The kinds a reader's "about" may name: what a reader can see a label for. */
const ABOUT_KINDS = new Set(['actor', 'claim', 'mechanism', 'assumption']);
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * THE ITEMS A READER'S "ABOUT" NAMES, by a plain case-insensitive match on
 * their labels — the simplest thing that is right most of the time.
 *
 * An exact label wins outright (after case and punctuation): "Ofsted" is
 * Ofsted. Failing that, labels that contain the reader's words as whole words,
 * or that the reader's words contain, shortest label first — "family hubs"
 * finds "Family hubs" and "Family hubs funding", "the Department for Education
 * budget" finds "Department for Education". Three at most, and nothing for
 * words of under four letters, which match everything. Unmatched stays the
 * reader's own words, shown as written: a topic or a risk the paper's items
 * do not name is still worth knowing about.
 *
 * Resolved bodies only (`s2_` actors), as everywhere a reader meets a body.
 */
export function matchAbout(about: string | null | undefined, artefacts: Artefact[]): string[] {
  const wanted = normal(about ?? '');
  if (wanted.length < 4) return [];
  const candidates = artefacts.filter((a) => ABOUT_KINDS.has(a.kind) && (a.kind !== 'actor' || a.id.startsWith('s2_')) && a.label.trim());
  const exact = candidates.filter((a) => normal(a.label) === wanted);
  if (exact.length) return exact.slice(0, 3).map((a) => a.id);
  const words = (text: string) => ` ${text} `;
  return candidates
    .filter((a) => {
      const label = normal(a.label);
      return label.length >= 4 && (words(label).includes(words(wanted)) || words(wanted).includes(words(label)));
    })
    .sort((a, b) => a.label.length - b.label.length)
    .slice(0, 3)
    .map((a) => a.id);
}

/**
 * THE ORDER RESEARCH IS ASKED IN: every reader question first, in the order
 * they were given, then the model's by priority. `priority` is a product of
 * three unit scores and stays in [0, 1] — the schema says so — so the reader's
 * place is the `1 +` here rather than a priority nothing else could read.
 */
export function researchRank(question: Artefact): number {
  const priority = Number(question.data.priority);
  return (question.data.asked === 'reader' ? 1 : 0) + (Number.isFinite(priority) ? priority : 0);
}

/**
 * The research step's reader artefacts: one question per look-up, and for
 * each supplied source a question that carries it and the source itself.
 *
 * WHY A SOURCE GETS A QUESTION OF ITS OWN. The evidence matrix reads sources
 * one question at a time — that is its fan-out — and a source with no question
 * would never be read at all. So a supplied source sits under "What does this
 * source show about X?", asked by the reader, NOT searched (it has its
 * answer), and the matrix reads it there like any other.
 *
 * Ids are in the stage's own namespace (`s5_reader_…`), which no model id can
 * take: the model's carry a three-digit call slot.
 */
export function readerArtefacts(stage: number, supplied: SuppliedSource[], lookUps: LookUp[], artefacts: Artefact[], now = new Date()): { questions: Artefact[]; sources: Artefact[]; searched: Artefact[]; warnings: string[] } {
  const questions: Artefact[] = []; const sources: Artefact[] = []; const searched: Artefact[] = []; const warnings: string[] = [];
  /*
   * WHAT A READER QUESTION RESTS ON. Every artefact must cite something it
   * stands on (`validation.ts`), and a reader's question stands on the items
   * their words name — or, when they name none, on the paper itself: it is a
   * question asked OF this paper, so its first passage is the honest anchor.
   * A question that carries a supplied source cites that source too, which is
   * its real ground.
   */
  const paper = artefacts.find((a) => a.kind === 'passage' && !/^m\d+_/.test(a.id));
  const anchor = (words: string | null | undefined) => {
    const named = matchAbout(words, artefacts);
    return named.length ? named : paper ? [paper.id] : [];
  };
  const reader = { importance: 1, uncertainty: 1, consequence: 1, priority: 1, asked: 'reader' as const };
  lookUps.slice(0, MAX_LOOK_UPS).forEach((lookUp, i) => {
    const question = artefact(`s${stage}_reader_lookup_${String(i + 1).padStart(2, '0')}`, 'research_question', clip(lookUp.wording, 160), lookUp.wording, {
      ...reader, wording: lookUp.wording.slice(0, 500),
      rationale: 'You asked for this to be looked up when you submitted the paper.',
      searchStrategy: lookUp.query,
      gap: 'Open until a source answers it.',
    }, { origin: 'structural_inference', refs: anchor(lookUp.wording) });
    questions.push(question); searched.push(question);
  });
  supplied.slice(0, MAX_READER_SOURCES).forEach((source, i) => {
    const n = String(i + 1).padStart(2, '0');
    const aboutIds = matchAbout(source.about, artefacts);
    const subject = source.about?.trim() || 'the paper';
    const question = artefact(`s${stage}_reader_source_${n}`, 'research_question', clip(`What does “${source.title}” show about ${subject}?`, 200), `A source you supplied: ${source.title}.`, {
      ...reader, wording: (source.note ?? source.about ?? source.title).slice(0, 500),
      rationale: `You supplied this source${source.about ? ` about ${source.about}` : ''}.`,
      // Not searched: it carries its own source. Stated so the record says why.
      searchStrategy: 'Not searched: the reader supplied the source.',
      gap: source.text ? 'Read against the paper by the evidence step.' : `It could not be read: ${source.failure ?? 'no text was found'}.`,
    }, { origin: 'structural_inference', refs: [...(source.text ? [`source_s${stage}_reader_source_${n}_0`] : []), ...(aboutIds.length ? aboutIds : anchor(null))] });
    questions.push(question);
    if (!source.text) {
      warnings.push(`A source you supplied (${source.title}) could not be read: ${source.failure ?? 'no text was found'}. It is listed, and nothing was drawn from it.`);
      return;
    }
    sources.push(artefact(`source_${question.id}_0`, 'research_source', clip(source.title, 300), source.text.slice(0, MAX_SUPPLIED_CHARACTERS), {
      questionId: question.id, retrievedAt: now.toISOString(),
      // A page is classed by its domain, like any search result; a file has no
      // domain, and says so rather than borrowing one.
      quality: source.url ? classifyDomain(new URL(source.url).hostname).type : 'reader_file',
      qualityBasis: 'Supplied by the reader. Who supplied a source says nothing about its quality; grade it on what it is.',
      freshness: 'Publication date not verified; retrieval date is recorded.',
      jurisdictionalRelevance: 'Requires evidence-matrix review.',
      // HOW MUCH WAS READ, never who chose it: a file or a fetched page is the
      // whole text up to the cap, so `full_text`, graded like any other.
      retrieval: 'full_text',
      gap: source.text.length > MAX_SUPPLIED_CHARACTERS ? `Only the first ${MAX_SUPPLIED_CHARACTERS.toLocaleString('en-GB')} characters were read.` : 'Read in full; applicability requires review.',
      supplied: 'reader', suppliedAs: source.form,
      ...(source.about ? { about: source.about.slice(0, 300) } : {}),
      ...(aboutIds.length ? { aboutIds } : {}),
      ...(source.note ? { note: source.note.slice(0, 1000) } : {}),
    }, { origin: 'external_evidence', confidence: null, refs: [question.id], url: source.url }));
  });
  return { questions, sources, searched, warnings };
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
