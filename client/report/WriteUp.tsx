import { useState, type ReactNode } from 'react';
import { summarise } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';

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
 * sections run as columns beneath it, each showing its opening sentence rather
 * than a count of how many sentences it is hiding.
 *
 * NOTHING IS HIDDEN THAT WAS NOT HIDDEN BEFORE. `summarise()` already splits a
 * finding into its lead and its remainder — the same split the accordion used
 * — and "read the rest" stays a disclosure. What changed is that the lead is on
 * the page, because a heading plus a count is not a summary of anything.
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
          {lead.items.map((item) => {
            const { lead: opening, rest: remainder } = summarise(item.statement);
            return (
              <div key={item.id}>
                <p className="prt-writeup__standfirst">{opening}</p>
                {remainder ? (
                  <Details summary="Read the rest">
                    <p className="govuk-body">{remainder}</p>
                  </Details>
                ) : null}
              </div>
            );
          })}
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
   * One finding shows its opening sentence outright. Several collapse to the
   * first, with the count as the control — because a section holding six
   * findings and one holding one are different objects and should not look the
   * same, which is exactly what the accordion made them.
   */
  const [open, setOpen] = useState(false);
  const shown = open ? group.items : group.items.slice(0, 1);

  return (
    <section className="prt-writeup__col" aria-labelledby={`writeup-${group.section}`}>
      <h3 className="prt-writeup__head" id={`writeup-${group.section}`}>{group.label}</h3>
      {shown.map((item) => {
        const { lead: opening, rest: remainder } = summarise(item.statement);
        return (
          <div key={item.id} className="prt-writeup__item">
            {group.items.length > 1 ? <h4 className="prt-writeup__title">{name(item)}</h4> : null}
            <p className="prt-writeup__body">{opening}</p>
            {remainder ? (
              <Details summary="Read the rest">
                <p className="govuk-body">{remainder}</p>
              </Details>
            ) : null}
          </div>
        );
      })}
      {group.items.length > 1 ? (
        <button type="button" className="prt-linkbutton prt-writeup__more" onClick={() => setOpen(!open)}>
          {open ? 'Show fewer' : `Show all ${group.items.length} in this section`}
        </button>
      ) : null}
    </section>
  );
}
