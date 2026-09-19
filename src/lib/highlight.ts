/**
 * FINDING THE SENTENCE A FINDING CAME FROM, inside the passage it came from.
 *
 * The drill already shows the paper's own wording at the bottom of the chain —
 * and on a real paper those passages run to two thousand words each. A reader
 * who has followed a play back four steps to "Back at the paper — 7 passages"
 * then has to find, in seven walls of text, the clause the assessment actually
 * drew on. The assessment knows exactly which clause: every artefact downstream
 * of a passage carries the span it quoted in `sourceQuote`. It simply never
 * said so on the page.
 *
 * SO THE MARKS ARE THE ASSESSMENT'S OWN QUOTES, not a keyword search. Nothing
 * here decides what is relevant; it locates text the pipeline already recorded
 * as the source of something. That distinction is the whole reason this is
 * worth doing — a term-frequency highlighter would be the tool inventing
 * emphasis, which is the one thing a provenance view must not do.
 *
 * PURE, AND TESTED, because it is exactly the kind of code that is wrong in a
 * way no screenshot reveals: an off-by-one in the offset map moves every
 * highlight one character left and the page still looks plausible.
 */

/**
 * THE DOCUMENT'S LINE BREAKS ARE THE EXTRACTOR'S, NOT THE DOCUMENT'S.
 *
 * A passage comes out of a PDF hard-wrapped at whatever width the page was, so
 * rendered with `pre-wrap` it sets to the longest extracted line and leaves a
 * third of its box empty — and every few lines a word is broken across two of
 * them with a hyphen that is not in the word. Neither is a fact about the
 * paper; both are facts about the column it was printed in.
 *
 * So a single newline becomes a space and the hyphen before it disappears,
 * while a BLANK line stays: that one is a paragraph, which is the document's.
 *
 * DONE BEFORE MATCHING, NEVER AFTER. `highlight()` returns runs of the string
 * it was given, so reflowing afterwards would move every mark. The caller
 * reflows first and highlights the result.
 */
export function reflow(text: string): string {
  return text
    // A word broken across a line: drop the hyphen and the break with it.
    .replace(/([\p{L}])[-‐­][ \t]*\r?\n[ \t]*(?=[\p{L}])/gu, '$1')
    // A single line break is a wrap; two or more is a paragraph.
    .replace(/([^\n])[ \t]*\r?\n(?!\s*\n)[ \t]*/g, '$1 ');
}

/** A half-open range of the ORIGINAL string. */
export type Span = { start: number; end: number };

/**
 * The text, cut into runs, each either marked or not.
 *
 * A list rather than a string of HTML: the caller renders it, so nothing here
 * has to think about escaping and nothing downstream has to trust it.
 */
export type Run = { text: string; mark: boolean };

/**
 * Normalise for matching, keeping a map back to the original offsets.
 *
 * THREE THINGS DIFFER between a stored quote and the passage it was taken from,
 * and all three are the extractor's doing rather than the model's:
 *  - line breaks land in different places, because the quote was re-wrapped;
 *  - a word broken across a line in the PDF carries a hyphen the quote does not;
 *  - runs of whitespace collapse differently.
 * Case is folded too, because a quote that starts mid-sentence is sometimes
 * capitalised on its way into a field.
 *
 * `map[i]` is the index in the original of the character emitted at `i`.
 */
function normalise(text: string): { norm: string; map: number[] } {
  const norm: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    // A hyphen at a line break is the extractor breaking a word, not a hyphen in
    // the word: "sustain-\nable" and "sustainable" are the same word and have to
    // match each other.
    if ((ch === '-' || ch === '‐' || ch === '­') && /\s/.test(text[i + 1] ?? '')) {
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      // Leading whitespace is dropped entirely; internal runs collapse to one
      // space, so a re-wrapped quote lines up with the passage it came from.
      if (!norm.length || norm[norm.length - 1] === ' ') continue;
      norm.push(' ');
      map.push(i);
      continue;
    }
    norm.push(ch.toLowerCase());
    map.push(i);
  }
  return { norm: norm.join(''), map };
}

/**
 * The shortest quote worth locating.
 *
 * Below this a match is as likely to be a coincidence as a citation — "the
 * department" appears forty times in a policy paper, and marking all forty
 * would be the highlighter asserting a relevance the data does not carry.
 */
const FLOOR = 24;

/**
 * Where one quote sits in the text, or null.
 *
 * A STORED QUOTE IS OFTEN TRUNCATED, mid-word, by whatever wrote it — so an
 * exact search finds nothing and the honest fallback is to shorten the NEEDLE
 * from the right, at word boundaries, and take the longest prefix that does
 * occur. Shortening from the left would move the start of the highlight, which
 * is the part a reader is looking for.
 */
export function locate(text: string, quote: string): Span | null {
  return locateIn(normalise(text), text, quote);
}

/**
 * The same search, against a haystack somebody else has already normalised.
 *
 * `locate` normalises the whole passage every time it is called, and `highlight`
 * calls it once per quote — so a drill that carries 301 marks normalised the
 * same 3,400-character passage 301 times, in a per-character loop building two
 * arrays, synchronously inside the React render. Measured across all 271
 * drillable artefacts of a real run: 13.5s of highlighting, 50ms a drill on
 * average and 246ms on the worst, on a desktop.
 *
 * Hoisting that one call out of the loop is 6.7x on the real data and produces
 * byte-identical output. `locate` stays as it was because it is the surface the
 * unit tests drive, and because a single-quote caller should not have to know
 * about any of this.
 */
export function locateIn(hay: { norm: string; map: number[] }, text: string, quote: string): Span | null {
  const needle = normalise(quote).norm.trim();
  if (needle.length < FLOOR) return null;

  for (let candidate = needle; candidate.length >= FLOOR; ) {
    const at = hay.norm.indexOf(candidate);
    if (at >= 0) {
      return { start: hay.map[at], end: toWordEnd(text, hay.map[at + candidate.length - 1] + 1) };
    }
    const cut = candidate.lastIndexOf(' ');
    if (cut < 0) break;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

/**
 * A MARK NEVER ENDS MID-WORD.
 *
 * A truncated quote ending "…alternative business mod" matches inside
 * "…alternative business models", which locates the right sentence and then
 * draws the highlight three letters into a word. That reads as a rendering
 * fault rather than as a citation, so the span runs on to the end of whatever
 * word it landed in.
 */
function toWordEnd(text: string, end: number): number {
  let at = end;
  while (at < text.length && /[\p{L}\p{N}'’-]/u.test(text[at])) at += 1;
  return at;
}

/** Overlapping and touching spans merged, in order. A reader sees one mark. */
export function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else out.push({ ...span });
  }
  return out;
}

/**
 * The text cut into marked and unmarked runs.
 *
 * Returns a single unmarked run when nothing matched, so a caller never has to
 * branch: the passage renders identically to how it did before this existed.
 */
export function highlight(text: string, quotes: (string | null | undefined)[]): Run[] {
  // ONCE FOR THE PASSAGE, not once per quote — see `locateIn`.
  const hay = normalise(text);
  const found = merge(
    quotes
      .map((quote) => (quote ? locateIn(hay, text, quote) : null))
      .filter((span): span is Span => span !== null),
  );
  if (!found.length) return [{ text, mark: false }];

  const runs: Run[] = [];
  let at = 0;
  for (const span of found) {
    if (span.start > at) runs.push({ text: text.slice(at, span.start), mark: false });
    runs.push({ text: text.slice(span.start, span.end), mark: true });
    at = span.end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), mark: false });
  return runs;
}
