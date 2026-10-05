import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { splitTerms, type PolicyTerm, type TermFinder } from '$lib/policy-terms';

/**
 * A POLICY TERM, DEFINED ON TAP (phase 23, P4).
 *
 * The paper's own names — "Family Hubs", "the core offer" — explained where a
 * reader meets them, from the assessment's own glossary (`$lib/policy-terms`).
 *
 * A BUTTON THAT DISCLOSES, NEVER A HOVER. The accessibility statement promises
 * that nothing here appears on hover: content that appears on hover and cannot
 * be reached from a keyboard is not available to everyone. So the name is a
 * `<button aria-expanded>` and the definition is the element straight after it
 * in the reading order, shown until the reader presses again. No JavaScript
 * beyond React's own state — the offline pack renders it the same from
 * `file://`. GOV.UK has no inline-definition component; this is its details
 * pattern made inline, with the design system's own focus state.
 */
export const TermsContext = createContext<TermFinder | null>(null);

export function Term({ term, children }: { term: PolicyTerm; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="prt-term">
      <button type="button" className="prt-term__name" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {children ?? term.term}
        <span className="govuk-visually-hidden"> (what is this?)</span>
      </button>
      <span id={id} className="prt-term__definition" hidden={!open}>
        <span className="govuk-visually-hidden">{term.term}: </span>
        {term.definition}
      </span>
    </span>
  );
}

/**
 * A sentence with the glossary's terms made definable: the first mention of
 * each, at most three, from the context's finder. Without a glossary — an
 * older run, or a page with no provider — it is the sentence, unchanged.
 */
export function TermText({ text, max }: { text: string; max?: number }) {
  const finder = useContext(TermsContext);
  const pieces = splitTerms(text, finder, max);
  if (pieces.length === 1 && typeof pieces[0] === 'string') return <>{text}</>;
  return (
    <>
      {pieces.map((piece, i) => (typeof piece === 'string' ? piece : <Term key={i} term={piece.term}>{piece.text}</Term>))}
    </>
  );
}

/** One name, defined if the glossary has it — for a body or a part of the policy named on its own. */
export function TermName({ name }: { name: string }) {
  const finder = useContext(TermsContext);
  const term = finder?.byKey.get(name.trim().toLowerCase());
  return term ? <Term term={term}>{name}</Term> : <>{name}</>;
}
