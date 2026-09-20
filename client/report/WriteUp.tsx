import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { actsOf, judgementTally, tallyTotal, unplacedChapters, withoutEcho, type Chapter } from '$lib/writeup-view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Button } from '../govuk';
import { Judgement } from './Judgement';

/**
 * THE WRITE-UP, AS THE FRONT PAGE OF A REPORT RATHER THAN A FILING CABINET.
 *
 * It was an accordion: nineteen collapsed rows reading "Executive assessment —
 * 1 finding — Show", then "Scope methodology — 1 finding — Show", down the page.
 * Every one of them shut, every one of them identical, and the actual writing —
 * the nineteen sections the assessment spent its whole run producing — behind
 * nineteen separate clicks. A reader could not tell from the page whether the
 * report said anything at all.
 *
 * WHAT AN EDITORIAL FRONT PAGE DOES INSTEAD: it leads with the piece that
 * matters, sets it wider and larger than the rest, and lets the eye fall
 * through the others by weight. The hierarchy is the navigation. So the
 * executive assessment runs full width as a standfirst, and the remaining
 * sections run as columns beneath it, each showing its opening lines rather
 * than a count of how many sentences it is hiding.
 *
 * THE COLUMNS ARE A GRID OF EQUAL CARDS, and getting there took two wrong
 * answers first. A plain grid gave every cell the height of the tallest in its
 * row, so a six-line section left a 400px hole beneath it. Multicol balanced
 * the whole flow and fixed the holes, but then nothing lined up at all: each
 * column ran at its own rhythm, so the headings sat at nineteen different
 * heights down the page and the eye had no row to follow across.
 *
 * WHAT MAKES BOTH TRUE AT ONCE is a fixed body height. Every card clamps its
 * text to the same number of lines, so every card is the same height, so every
 * heading in a row starts level and every control ends level — with no hole,
 * because there is no tallest cell to leave one. The clamp is visual only:
 * "Read it in full" opens the whole statement, and the text under the fold is
 * the same text, not a second copy of it.
 *
 * ── THE FOUR THINGS THAT CHANGED, AND WHAT EACH WAS MEASURED AGAINST ────────
 *
 * THE CARD NOW CARRIES THE TITLE THE ASSESSMENT WROTE. The heading was
 * `group.label`, which `findingsBySection` derives by replacing the underscores
 * in a storage key: "Scope methodology", "Objectives", "Actors" — eighteen
 * category nouns over eighteen blocks of grey. Every finding also has an
 * authored one-line claim in `artefact.label` — "High-risk assumptions are
 * concentrated in implementation and measurement" — and this file rendered it
 * only under `open && group.items.length > 1`. On the real run all nineteen
 * sections hold exactly ONE finding, so that branch never fired: not one of the
 * nineteen titles was ever on the page, and because the title is also the only
 * drill link in the card, nothing in the write-up was reachable at all. The
 * de-slugged label is still here, as the kicker above the claim, where it is
 * doing the job it is good at — saying which part of the report this is.
 *
 * THE ORDER IS NOW THE ARGUMENT'S, AND IT ALREADY EXISTED. This file used to
 * defend contract order on the ground that re-sorting "would make three
 * artefacts of one report disagree about what comes first". The disagreement was
 * already there and in the other direction: `report-doc.ts` groups the .docx and
 * the .md into the five acts of `REPORT_ACTS`, each under its own title and
 * strap, so the Word file a reader downloads from this page reads as an argument
 * and the page it was downloaded from was eighteen tiles in schema order —
 * "Scope methodology / Objectives / Actors" as a row, one section from the
 * verdict and two from intent. `REPORT_ACTS` had been sitting in the view layer
 * with a fifteen-line comment making exactly this case, and `reportActs()` and
 * `unplacedSections()` — the two functions written to serve it — had no call
 * site anywhere in the repo. The grouping is `actsOf()` in `$lib/writeup-view`,
 * which is those two functions taking the sections this component already has
 * instead of re-deriving them from the artefact array.
 *
 * ONE CONTROL, NOT EIGHTEEN. Every card carried "Read it in full", and three of
 * them — assurance at 316 characters, test results at 314, high-risk assumptions
 * at 332 — finished inside the old nine-line clamp, so pressing it changed
 * nothing a reader could see. Eighteen of them is also eighteen `aria-expanded`
 * stops in the tab order for a screen-reader user, between the standfirst and
 * the next section. The clamp is four lines now, which makes every card a
 * genuine opening rather than most of a section, and the disclosure is one
 * button for the whole write-up.
 *
 * AND THE STANDFIRST NO LONGER OPENS WITH THE SENTENCE THE PAGE ALREADY SAID.
 * See `withoutEcho` for the measurement and for why the cut is here rather than
 * at the headline.
 */
const LEAD_SECTION = 'executive_assessment';

/**
 * TRUE WHILE THE BROWSER IS MAKING A PAGE OF THIS.
 *
 * The clamp is the disclosure's successor and inherited its worst property: a
 * shut card renders only the FIRST of its findings, so the rest are not in the
 * document at all and no print stylesheet can reach them. Measured on the real
 * run in print emulation, the paper copy lost 1,701px of the assessment's own
 * prose — about 74 lines — across all twelve sections, four of them cut mid-word.
 *
 * `beforeprint` is the same hook the report's own print helper uses to open
 * disclosures, for the same reason, and it restores afterwards so the screen is
 * unchanged. The `@media print` rule that releases the clamp stays as well: this
 * handles the text that is missing from the DOM, that handles the text that is
 * merely clipped, and a browser that fires neither is not one this has to serve.
 */
function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return printing;
}

export function WriteUp({ groups, name, offline = false, echoed }: {
  /**
   * Every section the assessment wrote, from `findingsBySection()` — unchanged.
   *
   * The acts are derived from this rather than taken as a second prop, and that
   * is `actsOf()`'s whole argument: `reportActs()` would re-run
   * `findingsBySection()` over the artefact array to hand back the sections the
   * caller already computed and is already passing in. Same constant, same
   * grouping, same straps, one derivation — and the grouping stays in a tested
   * module rather than moving into a component.
   */
  groups: Chapter[];
  /** Renders a finding's own title — a link into the drill where one is offered. */
  name: (artefact: Artefact) => ReactNode;
  /**
   * THE PACK HAS NO FOLD. A clamp is `overflow: hidden`, which takes the clipped
   * text out of Ctrl-F as well as out of sight — and Ctrl-F is the offline pack's
   * whole interface, a single `file://` document with no server to ask. So the
   * pack renders every section open: there is nothing there to click.
   */
  offline?: boolean;
  /**
   * The sentence the panel has already printed as its headline, if any.
   *
   * Optional, and the write-up is correct without it — see `withoutEcho`.
   */
  echoed?: string;
}) {
  /*
   * ONE CONTROL FOR THE WHOLE WRITE-UP, holding the state the eighteen cards
   * used to hold one each. It is the same boolean `offline` and `beforeprint`
   * already force, so this is not new machinery: it is the existing forced-open
   * path with a reader attached to it.
   */
  const [asked, setAsked] = useState(false);
  const printing = usePrinting();
  const open = asked || offline || printing;

  const acts = useMemo(() => actsOf(groups), [groups]);
  if (!groups.length) return null;

  const chapters = acts.flatMap((act) => act.chapters);

  /*
   * THE LEAD IS LIFTED OUT OF ITS ACT, not grouped with it. Act 1 claims
   * `executive_assessment` and `scope_methodology`, and the executive assessment
   * is the standfirst — the one thing on this page set at 27px. Grouping the
   * acts naively demotes the report's conclusion into a card in a three-column
   * grid, which is the opposite of what the standfirst exists to do.
   */
  const lead = chapters.find((chapter) => chapter.section === LEAD_SECTION) ?? null;
  const bands = acts
    .map((act) => ({
      key: act.key,
      title: act.title,
      strap: act.strap,
      /** True where the standfirst came out of THIS act, so its strap can say so. */
      lifted: Boolean(lead) && act.chapters.includes(lead as Chapter),
      chapters: act.chapters.filter((chapter) => chapter !== lead),
    }))
    .filter((act) => act.chapters.length);
  const unplaced = unplacedChapters(groups);

  /*
   * THE COUNT LINE IS COUNTED, not written. Four of the nineteen conclusions on
   * this run are provisional and four are well supported, and the page said
   * neither — a fifth of the write-up is flagged by the report itself and every
   * card looked the same. Over every section the write-up shows, the standfirst
   * and any unplaced section included, because the sentence says "this write-up".
   */
  const tally = judgementTally([...chapters, ...unplaced]);
  const total = tallyTotal(tally);
  const cards = bands.reduce((n, act) => n + act.chapters.length, 0) + unplaced.length;

  return (
    <div className={`prt-writeup${open ? ' is-open' : ''}`}>
      {lead ? (
        <div className="prt-writeup__lead">
          <p className="prt-writeup__kicker">{lead.label}</p>
          {lead.items.map((item, i) => (
            <div key={item.id}>
              {/* The authored claim, as the lead's own heading. It is also the
                  way into the drill, which the standfirst had no link to at all. */}
              <h3 className="prt-writeup__leadhead">{name(item)}</h3>
              <p className="prt-writeup__standfirst">{i ? item.statement : withoutEcho(item.statement, echoed)}</p>
              <Judgement artefact={item} className="prt-judgement--lead" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="prt-writeup__bar">
        {total ? (
          <p className="govuk-body-s prt-meta prt-writeup__tally">
            {total} {total === 1 ? 'conclusion' : 'conclusions'}:{' '}
            {tally.map((entry, i) => (
              <span key={entry.key}>
                {i ? ', ' : ''}{entry.count} {entry.label.toLowerCase()}
              </span>
            ))}.
          </p>
        ) : null}
        {/*
          Not rendered where there is no fold: a pack renders every section open
          and print forces the same, so a control offering to open one would do
          nothing and `@media print` hides `.govuk-button` in any case.
        */}
        {offline ? null : (
          <Button
            variant="secondary"
            aria-expanded={open}
            aria-controls="writeup-chapters"
            onClick={() => setAsked(!asked)}
          >
            {open ? 'Show the openings only' : `Read all ${cards} sections in full`}
          </Button>
        )}
      </div>

      <div id="writeup-chapters">
        {bands.map((act) => (
          <div key={act.key} className="prt-act">
            <h3 className="prt-act__title">{act.title}</h3>
            <p className="govuk-body-s prt-meta prt-act__strap">
              {act.strap}
              {/* Only where it is true: act 1 is the only one the standfirst
                  comes out of, and a reader who sees "The verdict" over a single
                  card about scope is owed the reason. */}
              {act.lifted ? ' The conclusion itself is the standfirst above.' : ''}
            </p>
            <div className="prt-writeup__columns">
              {act.chapters.map((chapter) => (
                <Chapter key={chapter.section} chapter={chapter} name={name} open={open} />
              ))}
            </div>
          </div>
        ))}

        {/*
          THE CONTRACT-DRIFT ALARM, and it draws nothing today. A section the
          assessment wrote that no act claims would otherwise vanish from an
          act-grouped page — with its prose, which is what makes it worth a band
          rather than a warning.
        */}
        {unplaced.length ? (
          <div className="prt-act prt-act--unplaced">
            <h3 className="prt-act__title">Not placed in an act</h3>
            <p className="govuk-body-s prt-meta prt-act__strap">
              The assessment wrote {unplaced.length === 1 ? 'this section' : `these ${unplaced.length} sections`} and the
              report's five acts do not claim {unplaced.length === 1 ? 'it' : 'them'}. Shown here so nothing is dropped.
            </p>
            <div className="prt-writeup__columns">
              {unplaced.map((chapter) => (
                <Chapter key={chapter.section} chapter={chapter} name={name} open={open} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chapter({ chapter, name, open }: {
  chapter: Chapter;
  name: (artefact: Artefact) => ReactNode;
  /** Held by the write-up, not the card: one disclosure serves the whole section. */
  open: boolean;
}) {
  /*
   * ONE CARD, ONE SECTION, whatever it holds. A section with six findings and
   * one with a single finding are different objects and should not look the
   * same — which is exactly what the accordion made them — but they must be the
   * same SHAPE, or the row they sit in stops being a row. So the card leads with
   * the first finding's claim and its opening lines, and says how much more the
   * section holds.
   */
  const item = chapter.items[0];
  const more = chapter.items.length - 1;
  if (!item) return null;

  return (
    <section className="prt-writeup__col" aria-labelledby={`writeup-${chapter.section}`}>
      <div className="prt-writeup__top">
        <p className="prt-writeup__kicker">{chapter.label}</p>
        <h4 className="prt-writeup__head" id={`writeup-${chapter.section}`}>{name(item)}</h4>
        <Judgement artefact={item} />
      </div>

      <div className="prt-writeup__body">
        {(open ? chapter.items : chapter.items.slice(0, 1)).map((entry, i) => (
          <div key={entry.id} className={i ? 'prt-writeup__item' : undefined}>
            {/* The first item's claim is the card's heading already; only the
                siblings need naming, and only when they are on the page. */}
            {i ? <h5 className="prt-writeup__title">{name(entry)}</h5> : null}
            <p className="prt-writeup__text">{entry.statement}</p>
          </div>
        ))}
      </div>

      {/* Nothing where the section holds one finding, which on this run is every
          one of them — the old control said "and 0 more" by arithmetic and the
          branch could not fire. A run that writes three findings into one
          section says so here, in the shut state, where it matters. */}
      {more > 0 && !open ? (
        <p className="govuk-body-s prt-meta prt-writeup__foot">
          {more} more {more === 1 ? 'finding' : 'findings'} in this section.
        </p>
      ) : null}
    </section>
  );
}
