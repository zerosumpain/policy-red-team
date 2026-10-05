import { BandScale } from '../guide/BandScale';
import { CHAPTERS, MINI_POLICY } from '../guide/content';

/**
 * "HOW TO READ THIS REPORT" — THE GUIDE, FOR A PACK THAT CANNOT HAVE ONE
 * (phase 26).
 *
 * The offline pack runs from `file://` with no router and every request
 * blocked, and its real interface is Ctrl-F and paper, so the interactive
 * guide at `/guide` cannot come with it. What comes instead is what each
 * chapter TEACHES — the `takeaway` paragraphs from `client/guide/content.ts`,
 * the same strings the guide prints beside its figures — and one static
 * picture: the band key, with the floors and what each band means.
 *
 * ONE SOURCE, SO THE TWO CANNOT DRIFT. A sentence changed in the content
 * model changes on the guide page and in the next pack together; nothing here
 * is written twice. The interactive halves (the sliders, the switches) are
 * left out rather than described, because the pack's own report has the real
 * ones: "What if we are wrong" runs in the pack.
 *
 * The made-up breakfast-club policy is mentioned once, because chapter 3's
 * and 4's words refer to "a way to beat it" in general and stand on their own.
 */
export function HowToRead() {
  return (
    <div className="prt-howto">
      <p className="govuk-body">
        The service this came from has a guide with something to try on each page, built on a
        made-up policy ({MINI_POLICY.blurb.replace(/\.$/, '')}). This is what each of its chapters
        teaches, in the same words.
      </p>
      {CHAPTERS.map((chapter) => (
        <div key={chapter.n} className="prt-howto__chapter">
          <h3 className="govuk-heading-s">{chapter.n}. {chapter.title}</h3>
          {chapter.takeaway.map((paragraph, i) => <p key={i} className="govuk-body">{paragraph}</p>)}
          {chapter.n === 4 ? <BandScale id="howto-bands" /> : null}
        </div>
      ))}
    </div>
  );
}
