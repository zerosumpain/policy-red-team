import type { ReactNode } from 'react';

/**
 * WHAT IS IN THIS PANEL, AND HOW MUCH OF IT THERE IS.
 *
 * ITS OWN FILE, because it has three callers now and only ever had one place to
 * live. It was declared inside `Report.tsx` and used by the service's panels and
 * the pack's one long document; the drill — ten sections, over 6,400px measured
 * at 1280, the longest page in the application — could not reach it without
 * importing the report. Nothing here is router-shaped: it renders plain
 * fragment anchors, so it is as correct inside a `file://` pack as it is in the
 * service, which is the constraint that decided the move.
 *
 * A LIST OF TITLES IS NOT AN INDEX OF A TEN-SCREEN PANEL. On Verdict it was six
 * identical blue links over 8,668px of report, and a reader choosing an entry
 * point had nothing to choose on. The two optional fields are what makes it a
 * map rather than a list: `count` says how much is behind a link, and `anchors`
 * opens the one section that carries four headings of its own.
 */
export type ContentsEntry = {
  id: string;
  title: string;
  /**
   * How much is behind this entry — `{ n: 47, noun: 'plays' }`.
   *
   * TAKEN FROM THE ARRAY THAT ALREADY DECIDED THE SECTION EXISTS, never counted
   * again here: every caller pushes a section only `if (body)`, and the length
   * that gated the push is the length the section prints. A second count in the
   * index is a second number to keep in step, and this index has been wrong
   * about the panel before.
   */
  count?: { n: number; noun: string };
  /**
   * Headings inside the section, for a section that is itself several screens.
   *
   * Causality's two sections render eleven headings across 5,491px. The ids are
   * already on the page — the component that draws them has carried them since
   * it was written — so this names them rather than inventing anchors.
   */
  anchors?: { id: string; title: string }[];
};

/**
 * `id` IS A PARAMETER BECAUSE THIS RENDERS MORE THAN ONCE.
 *
 * The pack has one of these at the top of one long document. The service renders
 * one per panel — and every panel is in the DOM at once, `hidden` or not, so a
 * hard-coded `id="contents"` would ship five elements with the same id on a page
 * whose gate is axe-clean.
 *
 * `of` NAMES WHAT IS BEING INDEXED, and below the tablet breakpoint that is not
 * decoration: there every panel is on the page at once, so five
 * `<nav aria-label="Contents">` elements are five landmarks a screen-reader user
 * cannot tell apart — axe's `landmark-unique`, which the walk caught at 320px
 * the moment it started auditing there. Pass the move's LABEL and not its key:
 * "Contents of Move 2, Causality" is a name, "Contents of causality" is an
 * internal id read aloud.
 */
export function Contents({ sections, id = 'contents', of }: {
  sections: ContentsEntry[];
  id?: string;
  of?: string;
}) {
  /*
   * ENTRIES, NOT SECTIONS — the guard counted the wrong things and skipped the
   * two panels that needed it most.
   *
   * It asked how many SECTIONS a panel has, and what a reader needs an index for
   * is how much PAGE there is. Causality and Actors are the two longest panels
   * in the report — 5,491px and 3,990px measured at 1280 — and each registers
   * exactly two top-level sections, so a `< 3` guard denied an index to the only
   * two panels nobody can hold in their head. Counting anchors as well as
   * sections gives Causality five entries for its five screens; a panel with one
   * section and no anchors still gets nothing, which is the case the guard was
   * written for and the only one it should catch.
   */
  const entries = sections.reduce((n, section) => n + 1 + (section.anchors?.length ?? 0), 0);
  if (entries < 2) return null;

  /** "47 plays". The figure is a figure, so it is set as one. */
  const denominator = (count: ContentsEntry['count']): ReactNode => (
    count ? <> <span className="prt-denom">{count.n.toLocaleString()} {count.noun}</span></> : null
  );

  return (
    <nav className="govuk-!-margin-bottom-6 prt-contents" aria-label={of ? `Contents of ${of}` : 'Contents'}>
      <h2 className="govuk-heading-s" id={id}>Contents</h2>
      <ol className="govuk-list govuk-list--number govuk-list--spaced">
        {sections.map((section) => (
          <li key={section.id}>
            <a className="govuk-link" href={`#${section.id}`}>{section.title}</a>
            {denominator(section.count)}
            {section.anchors?.length ? (
              /*
               * A NESTED LIST, NOT A FLATTENED ONE. The four headings under "How
               * they connect" are parts of one section and not four sections;
               * promoting them to the top level would say the panel has six
               * things in it when it has two, and would put "What kind of
               * relationship" at the same rank as the mechanism chart.
               */
              <ol className="govuk-list govuk-list--number prt-contents__sub">
                {section.anchors.map((anchor) => (
                  <li key={anchor.id}>
                    <a className="govuk-link" href={`#${anchor.id}`}>{anchor.title}</a>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
