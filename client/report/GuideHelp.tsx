import type { MouseEvent } from 'react';
import { CHAPTERS, HELP_FOR_SECTION } from '../guide/content';
import { guideChapter } from '../places';

/**
 * THE "?" BESIDE A REPORT FIGURE, opening the guide chapter that explains it
 * (phase 26).
 *
 * ONLY WHERE A CHAPTER ANSWERS THE FIGURE — `HELP_FOR_SECTION` names five
 * sections, and anything else gets nothing. A "?" on every heading is furniture
 * a reader learns to ignore.
 *
 * THE SERVICE ONLY. The pack has no guide to open, so `Report` does not render
 * this offline; the pack's own "How to read this report" section is the
 * stand-in. `place` is the report's own `follow`, so the link is routed in the
 * service like every other link on the page.
 */
export function GuideHelp({ section, place }: {
  section: string;
  place: (href: string) => { href: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  const n = HELP_FOR_SECTION[section];
  const chapter = CHAPTERS.find((c) => c.n === n);
  if (!chapter) return null;
  return (
    <p className="prt-guidehelp">
      <a className="govuk-link prt-guidehelp__link" {...place(guideChapter(chapter.n))}>
        <span className="prt-guidehelp__mark" aria-hidden="true">?</span>
        <span className="prt-guidehelp__text">How to read this</span>
        <span className="govuk-visually-hidden">: guide chapter {chapter.n}, {chapter.title}</span>
      </a>
    </p>
  );
}
