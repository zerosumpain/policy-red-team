import { Tag, type TagColour } from '../govuk';

/**
 * A structural test's verdict, as a word.
 *
 * The column printed the stored enum — `high_risk`, `moderate_risk`,
 * `indeterminate` — underscores and all, in a report a policy reader takes
 * away. The tag carries the severity too, which the bare string did not.
 *
 * `indeterminate` IS GREY, NOT GREEN. The test could not decide, and colouring
 * that as a pass would be the report telling a reader something it does not
 * know. It is the most common result on a real run — seven of twelve on the
 * Post-16 assessment — so getting it wrong would mislead more often than not.
 */
const RESULTS: Record<string, { label: string; colour: TagColour }> = {
  high_risk: { label: 'High risk', colour: 'red' },
  moderate_risk: { label: 'Moderate risk', colour: 'yellow' },
  low_risk: { label: 'Low risk', colour: 'green' },
  passed: { label: 'Passed', colour: 'green' },
  indeterminate: { label: 'Could not decide', colour: 'grey' },
};

export function TestResult({ value }: { value: unknown }) {
  const raw = typeof value === 'string' ? value : '';
  const known = RESULTS[raw];
  if (known) return <Tag colour={known.colour}>{known.label}</Tag>;
  // An unknown value is shown, not swallowed — but tidied, because an
  // underscore in a report is a leak from the database either way.
  if (raw) return <Tag colour="grey">{raw.replaceAll('_', ' ')}</Tag>;
  return <span className="prt-meta">—</span>;
}
