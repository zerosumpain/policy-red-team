import { useId, useMemo, useState } from 'react';
import { termFinder } from '$lib/policy-terms';
import { plays } from '$lib/policy-analysis/view';
import { PlainBlock } from '../report/Plain';
import { PlayList } from '../report/PlayList';
import { TermsContext } from '../report/Term';
import { MINI_ASSESSMENT, LEAD_PLAY_ID } from './content';

/**
 * CHAPTER 3: ONE WAY TO BEAT IT, AS THE REPORT DRAWS IT.
 *
 * THE REPORT'S OWN COMPONENTS, NOT A PICTURE OF THEM. The five plain lines are
 * `PlainBlock` and the detail is `PlayList` with its counters open — the card
 * a reader meets under "Ways to beat it" — fed the guide's one play through
 * the view layer's `plays()`, the same shaping the report does. When the card
 * changes, this chapter changes with it, and nobody has to remember to.
 *
 * The paper's own names are tap-to-define here too ("the Department"), through
 * the same `TermsContext` the report provides from a run's glossary.
 *
 * "SHOW ME THE DETAIL" IS A DISCLOSURE BUTTON, not a GOV.UK details: the
 * summary text has to change to "Hide the detail", and the card it opens holds
 * its own details, which nested inside another would print and read oddly.
 */
const GLOSSARY = termFinder([
  { id: 'guide_term_department', kind: 'mechanism', term: 'The Department', definition: 'In this made-up policy, the government department that pays for the clubs.' },
]);

export function PlainPlay() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const play = useMemo(() => plays([...MINI_ASSESSMENT]).find((p) => p.artefact.id === LEAD_PLAY_ID)!, []);
  return (
    <TermsContext.Provider value={GLOSSARY}>
      <div className="prt-guideplay">
        <p className="prt-guideplay__title">{play.artefact.label}</p>
        <PlainBlock artefact={play.artefact} />
      </div>
      <button
        type="button"
        className="govuk-button govuk-button--secondary govuk-!-margin-top-4"
        data-module="govuk-button"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide the detail' : 'Show me the detail'}
      </button>
      <div id={`${id}-detail`} className="prt-guideplay__detail" hidden={!open}>
        <p className="govuk-body">
          This is the same way to beat it as a card in the report&rsquo;s list: the band on its edge,
          whether it breaks a rule, its score and the five plain lines, then a disclosure (open here)
          with how it would be run, what it would cost the policy, how you would spot it and what would
          close it.
        </p>
        {open ? <PlayList plays={[play]} counters countersOpen /> : null}
      </div>
    </TermsContext.Provider>
  );
}
