import type { ReactNode } from 'react';
import { CROSS_PATTERNS, LEGALITY, ORIGINS, PATTERNS, RELATIONS, SCENARIOS, type Artefact } from '$lib/policy-analysis/contracts';
import { SummaryList } from '../govuk';

/**
 * The structured fields behind an artefact, rendered for a reader rather than
 * for a debugger.
 *
 * Two things the site version got wrong before it looked like this, and both
 * traps are still live. KEYS were prettified and VALUES were not, so a policy
 * professional opening the detail met a wall of `metric_gaming`,
 * `minimum_compliance` and `0.65`. And every string was checked against the
 * artefact list, so an identifier that happened not to resolve was printed raw.
 *
 * A value is only reworded when it is a KNOWN vocabulary term — one of the enums
 * the contracts define — because `s10_3_exploit` is a perfectly good string
 * containing underscores and must not be turned into prose. A number is only
 * shown as a percentage under a key the contracts define on [0,1].
 *
 * NO STYLESHEET OF ITS OWN. Nested data is the thing most likely to grow a
 * bespoke layer, and GOV.UK already has the two patterns it needs: a summary
 * list for an object and a bulleted list for an array, at any depth.
 */
const VOCABULARY = new Set<string>([
  ...ORIGINS, ...RELATIONS, ...PATTERNS, ...SCENARIOS, ...LEGALITY, ...CROSS_PATTERNS,
  'objective', 'problem', 'responsibility', 'decision_right', 'funding', 'dependency', 'data_flow', 'measure', 'constraint', 'risk', 'benefit', 'claim', 'cited_evidence',
  'person', 'department', 'agency', 'local_authority', 'provider', 'contractor', 'programme', 'dataset', 'legislation', 'committee', 'user_group', 'geography', 'concept',
  'supports', 'contradicts', 'mixed', 'insufficient', 'low_risk', 'moderate_risk', 'high_risk', 'indeterminate',
  'low', 'moderate', 'high', 'unknown', 'proposed', 'current', 'historical', 'inferred', 'full_text', 'search_excerpt',
  'severe', 'significant', 'limited', 'compliant', 'grey', 'breach',
]);

/** The fields the contracts define on [0,1] — the only numbers that are shares. */
const SHARES = new Set([
  'importance', 'uncertainty', 'consequence', 'priority', 'severity', 'incentive',
  'ease', 'impact', 'concealment', 'exposure', 'confidence', 'difficulty', 'likelihood',
]);

/** `costToPolicy` → `cost to policy`, `early_warning` → `early warning`. */
export function fieldLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const sentence = (value: string) => {
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * A READING ORDER, because jsonb does not keep the author's.
 *
 * Postgres stores a jsonb object with its keys sorted by length and then
 * bytewise. The evidenced-field shape the contracts define as
 * `{ value, origin, confidence, refs }` therefore comes back as
 * `refs, value, origin, confidence`, and the disclosure opened on a list of
 * identifiers sitting above the sentence they support.
 *
 * Only these keys are placed. Everything else keeps the order it arrived in —
 * `sort` is stable — because an object the contracts do not define is one whose
 * order this module has no business having an opinion about.
 */
const READING_ORDER = ['value', 'label', 'name', 'statement', 'result', 'origin', 'confidence', 'refs'];
const rank = (key: string) => {
  const at = READING_ORDER.indexOf(key);
  return at === -1 ? READING_ORDER.length : at;
};

const Nothing = ({ text }: { text: string }) => <span className="prt-meta">{text}</span>;

export function ArtefactValue({ value, byId, linkTo, fieldKey = '' }: {
  value: unknown;
  /**
   * Every artefact of the run, by id.
   *
   * A MAP RATHER THAN THE ARRAY, because this runs on every string leaf at every
   * depth: the worst target on the real run is a profile with 175 of them, and
   * scanning 2,265 rows for each — most of them prose that never matches, so the
   * scan never short-circuits — is 396,375 comparisons and 2.3ms to render one
   * disclosure, whether or not the reader opens it. `Drill` already builds this
   * map two hundred lines above the call site and was passing the array.
   */
  byId: Map<string, Artefact>;
  /** How an id that resolves to another artefact is rendered. Omitted — in the offline pack — it is its label. */
  linkTo?: (artefact: Artefact) => ReactNode;
  fieldKey?: string;
}): ReactNode {
  if (value === null || value === undefined) return <Nothing text="Not established" />;

  if (typeof value === 'string') {
    if (!value) return <Nothing text="Not established" />;
    const ref = byId.get(value);
    if (ref) return linkTo ? linkTo(ref) : ref.label;
    return VOCABULARY.has(value) ? sentence(value) : value;
  }

  if (typeof value === 'number') {
    const share = SHARES.has(fieldKey) && value >= 0 && value <= 1;
    return share ? `${Math.round(value * 100)}%` : String(value);
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (Array.isArray(value)) {
    if (!value.length) return <Nothing text="None recorded" />;
    return (
      <ul className="govuk-list govuk-list--bullet">
        {value.map((item, i) => (
          <li key={i}><ArtefactValue value={item} byId={byId} linkTo={linkTo} fieldKey={fieldKey} /></li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => rank(a) - rank(b));
    if (!entries.length) return <Nothing text="None recorded" />;
    return (
      <SummaryList
        noBorder
        rows={entries.map(([key, item]) => ({
          key: fieldLabel(key),
          value: <ArtefactValue value={item} byId={byId} linkTo={linkTo} fieldKey={key} />,
        }))}
      />
    );
  }

  return String(value);
}
