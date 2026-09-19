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
  const flowed = reflow(text);
  const runs = highlight(flowed, quotes);
  const marked = runs.filter((run) => run.mark).length;

  return (
    <>
      {marked ? (
        <p className="govuk-body-s prt-meta prt-quoted__key">
          <span className="prt-mark prt-mark--key" aria-hidden="true" />
          {marked === 1 ? 'The marked clause is' : `The ${marked} marked clauses are`} what the
          assessment quoted from this passage.
        </p>
      ) : null}
      <div className="prt-quoted">
        {runs.map((run, i) => (run.mark
          ? <mark key={i} className="prt-mark">{run.text}</mark>
          : <span key={i}>{run.text}</span>))}
      </div>
    </>
  );
}
