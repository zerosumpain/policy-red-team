import { useMemo, type ReactNode } from 'react';
import { usePrinting } from './usePrinting';
import { actsOf, judgementOf, judgementTally, tallyTotal, unplacedChapters, withoutEcho, type Chapter } from '$lib/writeup-view';
import type { Artefact } from '$lib/policy-analysis/contracts';

/**
 * ALL FINDINGS — THE APPENDIX TO THE MAIN FINDINGS.
 *
 * Phase 19 took the write-up off the front of the Verdict move. It had been
 * nineteen equal cards, each clamped to the same height, so every finding had
 * the same weight — the visual form of "no prioritisation" the review named.
 * The findings that matter now lead the move (`VerdictLead`, ranked by
 * `rankFindings`); this is everything else, still grouped into the five acts
 * the .docx prints, each finding a GOV.UK details that shows its title and how
 * well supported it is while shut.
 *
 * WHY `<details>` AND NOT THE GOV.UK ACCORDION. The accordion needs
 * govuk-frontend's script to hide anything, and an accordion that is all open
 * until a script runs is a wall. A native details discloses with no script,
 * keeps its text findable by Ctrl-F in Chromium, and costs no tab stop beyond
 * its own summary.
 *
 * PRINT AND THE PACK OPEN EVERYTHING. A details prints shut, and a tabbed page
 * prints one panel (`reference_tabbed_page_prints_one_panel`). `_base.scss`
 * forces disclosures open on paper, including through Chromium's
 * `::details-content`, and `beforeprint` opens them here too for a browser
 * that ignores both. The offline pack renders every one open: it is a document
 * whose interface is Ctrl-F.
 */

/**
 * The acts' straps, in plain words.
 *
 * `REPORT_ACTS` is shared with the .docx and still says "plays" and "checks";
 * the page says it the way the rest of the page does.
 */
const STRAP: Record<string, string> = {
  verdict: 'What the assessment concludes, and what it could see.',
  intent: 'What the policy is trying to do, how, and who it names.',
  foundations: 'What the policy assumes, and how much of that is proven.',
  failure: 'How it could be beaten, the conditions that change the answer, and the checks that found problems.',
  response: 'What could be done, who carries the cost, and what is still open.',
};

export function WriteUp({ rest, linkTo, offline = false, echoed, ranked = 0 }: {
  /** The findings not in the main list, from `rankFindings().rest`, in report order. */
  rest: { chapter: Chapter; item: Artefact }[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  offline?: boolean;
  /** The headline sentence, cut from the executive assessment so it is not read twice. */
  echoed?: string;
  /** How many findings lead the move, for the sentence that says what is here. */
  ranked?: number;
}) {
  const printing = usePrinting();
  const open = offline || printing;

  /* Back into chapters, so the grouping is the same `actsOf` the .docx order comes from. */
  const chapters = useMemo(() => {
    const bySection = new Map<string, Chapter>();
    for (const { chapter, item } of rest) {
      const held = bySection.get(chapter.section) ?? { ...chapter, items: [] };
      held.items.push(item);
      bySection.set(chapter.section, held);
    }
    return [...bySection.values()];
  }, [rest]);
  const acts = useMemo(() => actsOf(chapters), [chapters]);
  const unplaced = useMemo(() => unplacedChapters(chapters), [chapters]);
  if (!rest.length) return null;

  const tally = judgementTally(chapters);
  const total = tallyTotal(tally);

  const entry = (item: Artefact, section: string) => {
    const { key, label } = judgementOf(item);
    const text = section === 'executive_assessment' ? withoutEcho(item.statement, echoed) : item.statement;
    return (
      <details key={item.id} className="govuk-details prt-appendix__item" open={open || undefined}>
        <summary className="govuk-details__summary">
          <span className="govuk-details__summary-text">{item.label}</span>
          <span className={`prt-appendix__judgement prt-appendix__judgement--${key || 'none'}`}>
            <span className="govuk-visually-hidden">, </span>{label}
          </span>
        </summary>
        <div className="govuk-details__text">
          <p className="govuk-body">{text}</p>
          {linkTo ? <p className="govuk-body-s govuk-!-margin-bottom-0">{linkTo(item, 'Open the full record')}</p> : null}
        </div>
      </details>
    );
  };

  return (
    <div className="prt-appendix">
      <p className="govuk-body">
        {ranked
          ? `The ${ranked} findings above are the ones that matter most. These are the other ${total}, in the order the report is written.`
          : `All ${total} findings, in the order the report is written.`}
        {' '}Open one to read it.
      </p>
      {total ? (
        <p className="govuk-body-s prt-meta">
          How well supported the final review judged them:{' '}
          {tally.map((row, i) => `${i ? ', ' : ''}${row.count} ${row.label.toLowerCase()}`).join('')}.
        </p>
      ) : null}
      {acts.map((act) => (
        <div key={act.key} className="prt-appendix__act">
          <h3 className="govuk-heading-m govuk-!-margin-bottom-1">{act.title}</h3>
          <p className="govuk-body-s prt-meta">{STRAP[act.key] ?? act.strap}</p>
          {act.chapters.flatMap((chapter) => chapter.items.map((item) => entry(item, chapter.section)))}
        </div>
      ))}
      {unplaced.length ? (
        <div className="prt-appendix__act">
          <h3 className="govuk-heading-m govuk-!-margin-bottom-1">Not placed in a group</h3>
          <p className="govuk-body-s prt-meta">
            The assessment wrote {unplaced.length === 1 ? 'this' : 'these'} and the report&rsquo;s groups do not
            claim {unplaced.length === 1 ? 'it' : 'them'}. Shown so nothing is dropped.
          </p>
          {unplaced.flatMap((chapter) => chapter.items.map((item) => entry(item, chapter.section)))}
        </div>
      ) : null}
    </div>
  );
}
