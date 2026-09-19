import { useState, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';

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
 * THE ORDER IS THE ASSESSMENT'S. `findingsBySection` returns them in
 * `REPORT_SECTIONS` order, which is the order the pipeline writes and the order
 * the docx export prints. Re-sorting here by length or by interest would make
 * three artefacts of one report disagree about what comes first.
 */
const LEAD_SECTION = 'executive_assessment';

export function WriteUp({ groups, name }: {
  groups: { section: string; label: string; items: Artefact[] }[];
  /** Renders a finding's own title — a link into the drill where one is offered. */
  name: (artefact: Artefact) => ReactNode;
}) {
  if (!groups.length) return null;

  const lead = groups.find((g) => g.section === LEAD_SECTION);
  const rest = groups.filter((g) => g !== lead);

  return (
    <div className="prt-writeup">
      {lead ? (
        <div className="prt-writeup__lead">
          <h3 className="prt-writeup__kicker">{lead.label}</h3>
          {lead.items.map((item) => (
            <p key={item.id} className="prt-writeup__standfirst">{item.statement}</p>
          ))}
        </div>
      ) : null}

      <div className="prt-writeup__columns">
        {rest.map((group) => (
          <Section key={group.section} group={group} name={name} />
        ))}
      </div>
    </div>
  );
}

function Section({ group, name }: {
  group: { section: string; label: string; items: Artefact[] };
  name: (artefact: Artefact) => ReactNode;
}) {
  /*
   * ONE CARD, ONE SECTION, whatever it holds. A section with six findings and
   * one with a single finding are different objects and should not look the
   * same — which is exactly what the accordion made them — but they must be the
   * same SHAPE, or the row they sit in stops being a row. So the card always
   * shows the first finding's opening lines, and the control says how much more
   * there is.
   */
  const [open, setOpen] = useState(false);
  const more = group.items.length - 1;

  return (
    <section
      className={`prt-writeup__col${open ? ' is-open' : ''}`}
      aria-labelledby={`writeup-${group.section}`}
    >
      <h3 className="prt-writeup__head" id={`writeup-${group.section}`}>{group.label}</h3>

      <div className="prt-writeup__body">
        {(open ? group.items : group.items.slice(0, 1)).map((item, i) => (
          <div key={item.id} className={i ? 'prt-writeup__item' : undefined}>
            {open && group.items.length > 1 ? (
              <h4 className="prt-writeup__title">{name(item)}</h4>
            ) : null}
            <p className="prt-writeup__text">{item.statement}</p>
          </div>
        ))}
      </div>

      {/*
        ALWAYS PRESENT, so the foot of every card in a row sits at the same
        height whether or not that section has anything more to say. Where there
        is genuinely nothing hidden it is not rendered as a control a reader can
        press and be disappointed by — the card simply ends level.
      */}
      <p className="prt-writeup__foot">
        <button type="button" className="prt-linkbutton" onClick={() => setOpen(!open)}>
          {open
            ? 'Show less'
            : more > 0
              ? `Read it in full, and ${more} more in this section`
              : 'Read it in full'}
        </button>
      </p>
    </section>
  );
}
