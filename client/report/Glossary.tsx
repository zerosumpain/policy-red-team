import { GLOSSARY } from '$lib/plain-words';
import { Details } from '../govuk';

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
 */
export function Glossary() {
  return (
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
  );
}
