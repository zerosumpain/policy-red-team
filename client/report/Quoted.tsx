import { useMemo } from 'react';
import { highlight, reflow } from '$lib/highlight';

/**
 * THE PAPER'S OWN WORDING, WITH THE PART THIS RESTS ON MARKED.
 *
 * A passage of a real white paper runs to two thousand words. The drill puts
 * seven of them at the foot of a play and says "everything above was built from
 * these" — which is true and, as a thing to read, useless: the reader has to
 * find the clause themselves in seven walls of text.
 *
 * The assessment already knows the clause. Every artefact between the play and
 * the passage carries the span it quoted, so the marks here are the pipeline's
 * own citations rather than a search for words that look important. Nothing in
 * this component decides what is relevant.
 *
 * `<mark>` IS NOT ENOUGH ON ITS OWN. It carries no meaning to a screen reader in
 * most browsers and its yellow is a colour-only signal, so the styling adds a
 * rule under the mark and the section that uses it says in words what the marks
 * are. A reader who cannot see the colour is told the same thing.
 */
export function Quoted({ text, quotes }: {
  text: string;
  /** What to mark: `sourceQuote` from every artefact on the way here. */
  quotes: (string | null | undefined)[];
}) {
  /*
   * REFLOWED FIRST. A passage comes out of a PDF hard-wrapped at the page's own
   * column width, so set as it arrives it fills two thirds of its box and
   * breaks a word across a line every few lines. Neither is a fact about the
   * paper. `reflow` joins the wraps and repairs the hyphens; the marks are
   * placed on the result, because a mark is an offset into whatever string it
   * was given and reflowing afterwards would move every one of them.
   */
  // MEMOISED, because a drill renders six of these and the report re-renders on
  // every selection change. `highlight` is the page's one measurable piece of
  // synchronous work — 50ms a drill on the real run before the normalisation was
  // hoisted out of its inner loop.
  const runs = useMemo(() => highlight(reflow(text), quotes), [text, quotes]);
  const marked = runs.filter((run) => run.mark).length;

  return (
    <>
      {marked ? (
        <p className="govuk-body-s prt-meta prt-quoted__key">
          <span className="prt-mark prt-mark--key" aria-hidden="true" />
          {marked === 1 ? 'The marked clause is' : `The ${marked} marked clauses are`} what the
          assessment quoted from this passage.
        </p>
      ) : (
        /*
         * AND THE SILENT CASE SAYS SO TOO.
         *
         * A passage with no marks rendered as a bare wall of text under a heading
         * promising "everything above was built from these" — on one profile drill
         * of the real run, one marked passage followed by four unexplained walls of
         * 3,439, 3,808, 3,684 and 2,831 characters. It happens for two different
         * reasons and the reader cannot tell them apart: either nothing in the
         * chain recorded a quote from this passage at all, or what it recorded was
         * under the 24-character floor `locate` refuses to match on, because
         * "Skills England" appears forty times in a paper and marking all forty
         * would be the highlighter claiming a relevance the data does not carry.
         *
         * The sentence is written about the outcome, which is true either way.
         */
        <p className="govuk-body-s prt-meta prt-quoted__key">
          Nothing in this passage matched a quote the assessment stored. It is here because
          something in the chain above cites it.
        </p>
      )}
      {/*
        * FOCUSABLE, BECAUSE IT SCROLLS. `.prt-quoted` caps at 28rem and scrolls,
        * and everything inside it is text, `<mark>` and `<span>` — nothing a
        * keyboard can land on. So a reader who does not use a mouse could not get
        * past about line 22 of a passage whose median length on a real run is
        * 3,618 characters, in the one section the drill exists for. axe reports
        * it `serious`; the gates never saw it, because the walk drills into a
        * 672-byte fixture that never overflows the box.
        */}
      <div className="prt-quoted" tabIndex={0} role="group" aria-label="The paper’s own wording, scrollable">
        {runs.map((run, i) => (run.mark
          ? <mark key={i} className="prt-mark">{run.text}</mark>
          : <span key={i}>{run.text}</span>))}
      </div>
    </>
  );
}
