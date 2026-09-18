/**
 * Cutting a passage into citable sentences, deterministically.
 *
 * WHY THIS EXISTS. Decomposition is the assessment's largest producer of OUTPUT
 * tokens and almost none of it is reasoning. Measured on the deep Post-16 run
 * (2026-09-17, 72 passages, gpt-5.6-luna): 3,878 output tokens per call of which
 * 372 were reasoning tokens. The other ninety per cent is the model TYPING —
 * re-keying the paper's own words into `statement` and `sourceQuote` for every
 * claim and mechanism it finds. A claim row averages 580 characters of JSON and
 * 278 of them are text the document already contains.
 *
 * So the indexed extraction path stops asking for them. The model is shown the
 * passage with its sentences numbered and answers with a NUMBER; the server
 * slices the statement, the quote and the offsets out of the passage itself.
 *
 * The second gain is correctness, and it is the larger one. The first production
 * run died six times on the span check because the model re-typed a quote across
 * a PDF line break — `"what landlords achieve"` against a document that says
 * `"what\nlandlords achieve"`. `quotes.ts` folds that for LOCATING, but a quote
 * the model never types cannot be mistyped at all: an index either names a
 * sentence or it does not. Eleven of the deep run's 82 stage-1 calls were
 * corrective round-trips, and this is what they were correcting.
 */

/**
 * A sentence of a passage, with offsets into that passage's own text.
 *
 * `n` is ONE-BASED because it is shown to the model, and a model given a list
 * that starts at zero returns one-based indices anyway often enough to matter.
 * Numbering from one makes the contract and the intuition agree.
 */
export type Sentence = { n: number; start: number; end: number; text: string };

/**
 * Abbreviations `Intl.Segmenter` breaks a sentence on.
 *
 * The built-in English rules know `Mr.` and `Fig.` and do not know the register
 * a UK policy paper is written in. Measured against a realistic passage, the
 * segmenter cuts `The Rt Hon. J. Smith M.P. said` into four "sentences" and
 * `See para. 4.2.` into two.
 *
 * Every entry is narrow and lowercase, matched against the last word before the
 * full stop. Over-merging costs a longer quote; under-merging costs a claim
 * whose quote is the fragment `See para.` — so where the list is unsure it
 * merges, exactly as `front-matter.ts` keeps a page it is unsure about.
 */
const ABBREVIATIONS = new Set([
  // Honorifics and names
  'mr', 'mrs', 'ms', 'dr', 'prof', 'rt', 'hon', 'sir', 'st', 'jr', 'sr',
  // Document furniture, which is what a policy paper is full of
  'para', 'paras', 'fig', 'figs', 'no', 'nos', 'vol', 'ch', 'chap', 'sec', 'art',
  'pp', 'p', 'cl', 'sch', 'reg', 'regs', 's', 'ss', 'ibid', 'op', 'cit', 'ed', 'eds',
  // Latin and general
  'e.g', 'i.e', 'eg', 'ie', 'cf', 'etc', 'viz', 'al', 'approx', 'est', 'inc',
  // Bodies and corporate forms
  'ltd', 'plc', 'llp', 'co', 'dept', 'govt', 'univ',
]);

/**
 * The word immediately before a trailing full stop, in its own case.
 *
 * Anchored on a word boundary rather than `[A-Za-z.]+$`, which is greedy across
 * the space and answered `Hon. J` for `The Rt Hon. J.` — neither an abbreviation
 * nor a single initial, so the merge did not happen. The internal dot is still
 * allowed inside the word so `e.g.` and `i.e.` match as themselves.
 *
 * Returned WITH its case: the abbreviation test wants it lowercased and the
 * initial test wants to know it was a capital, and lowercasing here made the
 * second one permanently false.
 */
function trailingWord(text: string): string | null {
  const match = /(?:^|\s)([A-Za-z][A-Za-z.]*)\.\s*$/.exec(text);
  return match ? match[1] : null;
}

/**
 * True when `text` ends in something that is not the end of a sentence.
 *
 * Two rules, both conservative. A known abbreviation, and a lone initial — `J.`
 * in `J. Smith` — which no list can enumerate but which is always a single
 * letter followed by a stop.
 */
function endsMidSentence(text: string): boolean {
  const word = trailingWord(text);
  if (!word) return false;
  if (ABBREVIATIONS.has(word.toLowerCase())) return true;
  return word.length === 1 && word === word.toUpperCase();
}

/**
 * True when `text` cannot START a sentence, so it belongs to the one before it.
 *
 * A fragment opening lowercase is a continuation the segmenter mis-split. A
 * fragment opening with a digit is the other half of a reference like
 * `para. 4.2` — but a numbered paragraph (`1.1 The Department will…`) opens with
 * a digit too and IS a new sentence, so the digit rule only applies when what
 * follows the number is not a capital letter.
 */
function cannotStart(text: string): boolean {
  const first = text.trimStart();
  if (!first) return true;
  if (/^[a-z]/.test(first)) return true;
  return /^\d/.test(first) && !/^[\d.]+\s+[A-Z“"(]/.test(first);
}

/**
 * The sentences of a passage, in order, with offsets into the passage text.
 *
 * Whitespace-only segments are dropped — a blank line between paragraphs is not
 * a citable unit — and `start`/`end` are trimmed to the sentence's own first and
 * last non-space character, so a quote sliced from them carries no leading
 * newline. The offsets are relative to `text`; the caller adds the passage's own
 * `startOffset` to reach the document, exactly as `validation.ts` already does
 * with a located quote.
 */
export function sentences(text: string): Sentence[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const raw: { start: number; end: number }[] = [];
  for (const piece of segmenter.segment(text)) {
    const body = piece.segment;
    const lead = body.length - body.trimStart().length;
    const start = piece.index + lead;
    const end = piece.index + body.trimEnd().length;
    if (end <= start) continue;
    const previous = raw.at(-1);
    // Merge rather than push when the segmenter cut inside a sentence. The two
    // tests are asymmetric on purpose: one looks back at what the previous
    // segment ended with, the other looks at what this one begins with, and
    // either is enough.
    if (previous && (endsMidSentence(text.slice(previous.start, previous.end)) || cannotStart(text.slice(start, end)))) {
      previous.end = end;
      continue;
    }
    raw.push({ start, end });
  }
  return raw.map((s, i) => ({ n: i + 1, start: s.start, end: s.end, text: text.slice(s.start, s.end) }));
}

/**
 * The passage as the model is shown it: every sentence prefixed with its number.
 *
 * `[12]` rather than `12.` because a policy paper is already full of numbered
 * paragraphs, and a marker the document itself could have written is a marker
 * the model will eventually confuse with one. Square brackets appear nowhere in
 * the numbering conventions of a white paper.
 */
export function numbered(list: Sentence[]): string {
  return list.map((s) => `[${s.n}] ${s.text}`).join('\n');
}

/**
 * What a model's sentence reference resolves to, or null if it resolves to
 * nothing.
 *
 * A reference is one number or an inclusive pair. THE PAIR IS NOT A LUXURY: the
 * segmenter cuts a bulleted list into one sentence per bullet, so
 * `By 2028, we will:` and the three commitments under it are four sentences, and
 * a claim that cited only the third would quote `- publish an annual report;`
 * with the lead-in that gives it meaning left behind. A span lets the claim
 * carry its own context.
 *
 * Out-of-range, reversed and non-integer references all answer null rather than
 * clamping. A model that names sentence 40 of a 12-sentence passage has not
 * read the passage, and quietly handing it sentence 12 would turn a fabrication
 * into a citation — the same reason `locateQuote` refuses a quote it cannot find
 * instead of returning the nearest match.
 */
/**
 * Everything the expansion needs about the passage one stage-1 call was given.
 *
 * Carried to `provider.ts` on the call's `extra` and destructured out of the
 * payload there, exactly as `protect` already is — so it is neither hashed into
 * the response-cache key nor sent to the model. That matters twice over: the
 * model must not be handed offsets it could copy instead of counting, and a new
 * field inside the hashed payload would miss the cache for every completed call
 * of an in-flight assessment. See `PipelineDeps` in `pipeline.ts` for the rule.
 */
export type IndexedPassage = { id: string; text: string; list: Sentence[] };

/**
 * Turn the model's sentence references into ordinary extracted-fact artefacts.
 *
 * Runs on the RAW envelope, before `triageOutput` — which is the only seam
 * available, because triage drops what it cannot recognise and an artefact whose
 * statement has not been filled in yet is exactly that. After this function the
 * response has the shape every other stage produces, so validation, the
 * provenance rules and the span check are all untouched by the indexed path.
 *
 * An unresolvable reference is left ALONE rather than dropped here. Triage is
 * where an artefact dies, and it names its casualties in a warning the reader
 * sees; silently deleting one in a pre-pass would hide it from that accounting
 * and from the corrective round-trip that could fix it.
 */
export function expandIndexed(raw: unknown, passage: IndexedPassage): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const envelope = raw as { artefacts?: unknown };
  if (!Array.isArray(envelope.artefacts)) return raw;
  const artefacts = envelope.artefacts.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const a = entry as Record<string, unknown>;
    /**
     * THE KEY COMES OFF WHATEVER ITS VALUE, and this is the bug that cost the
     * first indexed run its assumptions.
     *
     * `artefactSchema` is strict, so an unrecognised key fails the whole
     * artefact before triage can say anything useful about it. The prompt tells
     * the model an assumption "carries no `sentence` field" and the schema it is
     * shown declares that field nullable — so the model did the obedient thing
     * and sent `"sentence": null`. The old early return left the key in place,
     * and every assumption that followed the instruction was discarded FOR
     * following it: 189 assumptions on the prose run, 10 on the indexed one.
     */
    if (!('sentence' in a)) return withStatement(a);
    const { sentence, ...rest } = a;
    if (sentence === null || sentence === undefined) return withStatement(rest);
    const span = spanOf(passage.text, passage.list, sentence);
    /**
     * An unresolvable reference has to stay PARSEABLE so it can be rejected for
     * the right reason.
     *
     * It used to come back carrying `badSentence`, so the repair round could
     * name the number — but that key is unrecognised by the same strict schema,
     * so the artefact died at the parse instead of at the span check, and the
     * reader was told a statement was missing rather than that a citation was
     * wrong. It now keeps a statement and no quote, which lands it on the span
     * rule: "An extracted assertion could not be located in the policy text."
     */
    if (!span) return { ...withStatement(rest), origin: 'extracted_fact', sourceId: passage.id };
    return {
      ...rest,
      // The model may still write its own `statement` — a mechanism's is a
      // paraphrase worth having. Where it does not, the sentence IS the
      // statement, which is better provenance than a re-typed one.
      statement: text(rest.statement) ?? span.text,
      origin: 'extracted_fact',
      sourceId: passage.id,
      sourceQuote: span.text,
      refs: Array.isArray(rest.refs) && rest.refs.length ? rest.refs : [passage.id],
    };
  });
  return { ...envelope, artefacts };
}

/** A non-empty string, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Guarantee the one field the strict schema will not do without.
 *
 * `statement` is required and the indexed prompt asks the model to OMIT it on a
 * claim or an actor mention, because the sentence supplies it. When the sentence
 * does not — no reference, or one that does not resolve — there is nothing to
 * fill it with and the artefact failed to parse at all, which took it out of the
 * assessment before any rule could explain why. Falling back to the model's own
 * label keeps it alive as far as triage, where the provenance rules judge it on
 * what it can actually show.
 */
function withStatement(a: Record<string, unknown>): Record<string, unknown> {
  if (text(a.statement)) return a;
  const label = text(a.label);
  return label ? { ...a, statement: label } : a;
}

export function spanOf(text: string, list: Sentence[], ref: unknown): { start: number; end: number; text: string } | null {
  const bounds = Array.isArray(ref) ? ref : [ref, ref];
  if (bounds.length !== 2) return null;
  const [from, to] = bounds.map((v) => (typeof v === 'number' ? v : Number.parseInt(String(v), 10)));
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 1 || to < from || to > list.length) return null;
  const start = list[from - 1].start;
  const end = list[to - 1].end;
  // SLICED FROM THE PASSAGE, never re-joined from the list. A join would insert
  // separators the document does not contain, and the result would no longer be
  // a verbatim substring — so `locateQuote` would be asked, downstream, to find
  // text the paper never had. Slicing keeps the passage's own punctuation and
  // line breaks between the sentences of a span.
  return { start, end, text: text.slice(start, end) };
}
