import { GLOSSARY } from '$lib/plain-words';
import type { PolicyTerm } from '$lib/policy-terms';
import { useContext } from 'react';
import { Details } from '../govuk';
import { TermsContext } from './Term';

/**
 * "WHAT THESE WORDS MEAN" — the few words the report could not replace.
 *
 * Phase 19 rewrote the report's labels in plain English (the choices are in
 * `$lib/plain-words`). A handful of words stay because nothing shorter says the
 * same thing — assumption, finding, final review, how exposed — and each is
 * explained here once, under the headline, on every tab and in the pack.
 *
 * A GOV.UK details, so it costs one line until a reader wants it. It prints
 * open, like every details in the report.
 *
 * THE PAPER'S OWN NAMES FOLLOW (phase 23): every part of the policy, and every
 * body, the run defined in everyday words (`$lib/policy-terms`). Defined on tap
 * where a reader meets them; listed here as well, because the offline pack's
 * real interface is Ctrl-F and a printed copy has no buttons. A second
 * disclosure, so the report's own five words stay one line from the top.
 */
export function Glossary({ terms: given }: { terms?: PolicyTerm[] }) {
  // From the report's glossary when the caller passes none — `Report` provides it.
  const provided = useContext(TermsContext);
  const terms = given ?? provided?.terms ?? [];
  return (
    <>
      <Details summary="What these words mean">
        <dl className="prt-glossary">
          {GLOSSARY.map((entry) => (
            <div key={entry.term} className="prt-glossary__row">
              <dt className="prt-glossary__term">{entry.term}</dt>
              <dd className="prt-glossary__meaning">{entry.meaning}</dd>
            </div>
          ))}
        </dl>
      </Details>
      {terms.length ? (
        <Details summary={`What the paper's own names mean (${terms.length})`}>
          <dl className="prt-glossary prt-glossary--terms">
            {terms.map((entry) => (
              <div key={entry.id} className="prt-glossary__row">
                <dt className="prt-glossary__term">{entry.term}</dt>
                <dd className="prt-glossary__meaning">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </Details>
      ) : null}
    </>
  );
}
