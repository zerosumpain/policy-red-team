import { useId, useState } from 'react';
import { Radios } from '../govuk';
import { chooseReadingLevel, useReadingLevel, type ReadingLevel } from './reading';

/**
 * "HOW SHOULD WE EXPLAIN THINGS TO YOU?" (phase 28) — the policy engine's
 * closing question, asked at the end of the guide's first chapter and kept on
 * its front page. GOV.UK radios, applied as soon as one is chosen: there is
 * nothing else on the form to wait for, and a Save button would be one more
 * thing to miss.
 *
 * WHAT CHANGED IS SAID ALOUD, once, politely, so a screen-reader user knows
 * the choice took and what it does — and whether it will be remembered, which
 * it will not be where storage refuses.
 */
const SAID: Record<ReadingLevel, string> = {
  plain: 'Saved: plain English. The workings of each way to beat a policy stay folded away until you open them.',
  detail: 'Saved: with the detail. The guide adds the report’s own terms, and reports open the workings of each way to beat a policy.',
};

export function ReadingChoice({ legendSize = 'm' }: { legendSize?: 's' | 'm' }) {
  const level = useReadingLevel();
  const [said, setSaid] = useState('');
  const id = useId();
  return (
    <div className="prt-readingchoice">
      <Radios
        id={`${id}-level`}
        legend="How should the guide and your reports explain things?"
        legendSize={legendSize}
        hint="You can change this at any time from the guide’s front page."
        value={level}
        onChange={(value) => {
          const next = value === 'detail' ? 'detail' : 'plain';
          const stored = chooseReadingLevel(next);
          setSaid(stored ? SAID[next] : `${SAID[next]} This browser will not keep it after you leave.`);
        }}
        items={[
          { value: 'plain', text: 'In plain English', hint: 'The short version first. Each way to beat a policy shows five plain lines, and its workings stay one press away.' },
          { value: 'detail', text: 'With the detail', hint: 'The plain lines, then the report’s own terms and every way to beat a policy opened to show how it runs, what it costs and what would close it.' },
        ]}
      />
      <p className="govuk-visually-hidden" aria-live="polite">{said}</p>
    </div>
  );
}
