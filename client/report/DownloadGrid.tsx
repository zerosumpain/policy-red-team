import type { Artefact } from '$lib/policy-analysis/contracts';
import { WITHHELD_KINDS } from '$lib/policy-analysis/share';
import { Table } from '../govuk';
import { fieldLabel } from './ArtefactValue';

/**
 * SIX DOWNLOADS, AND THE DIFFERENCE BETWEEN THEM IS TWO FACTS.
 *
 * "Take it away" opened with 48 words over three links — "Three copies, and
 * they are not the same thing. The Word file is the one somebody marks up…" —
 * and "Send it to someone" opened with 49 more over three more. Six links in
 * two groups, and the only way to learn what separated them was to hold two
 * paragraphs in your head at once. In code the difference is exactly one query
 * parameter: the routes are `format=docx|md|bundle`, and the same three again
 * with `&scope=shared`.
 *
 * THREE FORMATS BY TWO SCOPES IS A TABLE, so it is drawn as one. `firstCellIsHeader`
 * makes the format a `<th scope="row">` and the two scopes `<th scope="col">`,
 * which is what lets a screen reader announce "Word, Without the paper" as one
 * cell's context — better than the two unrelated lists it replaces.
 *
 * WHY THE LINK TEXT CARRIES A HIDDEN QUALIFIER ANYWAY. Header association is
 * announced when a reader moves between cells; it is NOT announced when they
 * pull up a list of the page's links, which is how a screen-reader user usually
 * finds a download. Six links all reading "Download" in that list is the failure
 * this table would otherwise introduce. The cost is one repeated phrase when
 * arrowing through cells, which is the cheaper of the two.
 *
 * FOUR COLUMNS WERE KILLED FROM THE FIRST DESIGN. A tick-and-cross grid over
 * "the assessment / the paper's passages / persona priors / cross-policy
 * comparison" reads as four differences, and `WITHHELD_KINDS` is
 * `['passage', 'cross_policy', 'persona_link']` — of which this run holds 72,
 * 0 and 12. A cross-policy column would be blank in BOTH scopes and read as a
 * difference that is not there. So the sentence above the table names only the
 * kinds this assessment actually holds, counted off its own inventory.
 */
const FORMATS: { format: string; row: string; note: string }[] = [
  { format: 'docx', row: 'Word', note: 'the one somebody marks up' },
  { format: 'md', row: 'Markdown', note: 'the same text, for pasting into your own template' },
  { format: 'bundle', row: 'The whole page, as a folder', note: 'a .zip that needs no network at all' },
];

const SCOPES: { scope: string | null; column: string }[] = [
  { scope: null, column: 'Everything' },
  { scope: 'shared', column: 'Without the paper' },
];

export function DownloadGrid({ analysisId, artefacts }: { analysisId: string; artefacts: Artefact[] }) {
  const at = (format: string, scope: string | null) =>
    `/api/policy-analysis/${analysisId}/export?format=${format}${scope ? `&scope=${scope}` : ''}`;

  /*
   * WHAT "WITHOUT THE PAPER" ACTUALLY LEAVES OUT, ON THIS RUN.
   *
   * Read off the inventory in hand rather than written as a generic sentence,
   * and a kind the assessment holds none of is not mentioned: saying a copy
   * withholds cross-policy comparisons, on a run that made none, describes a
   * difference the two files do not have.
   */
  const withheld = WITHHELD_KINDS
    .map((kind) => ({ kind, count: artefacts.filter((a) => a.kind === kind).length }))
    .filter((row) => row.count > 0);
  const phrase = (row: { kind: string; count: number }) => {
    const label = fieldLabel(row.kind).toLowerCase();
    if (row.kind === 'passage') return `the ${row.count} passages of the policy document`;
    if (row.kind === 'persona_link') return `the ${row.count} persona records drawn from your other assessments`;
    return `${row.count} ${label} ${row.count === 1 ? 'record' : 'records'}`;
  };
  const list = withheld.map(phrase);
  const leaves = list.length > 1
    ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
    : list[0] ?? '';

  return (
    <>
      <p className="govuk-body">
        Two scopes and three formats.
        {leaves ? <> &ldquo;Without the paper&rdquo; leaves out {leaves}; everything else is identical.</> : null}
      </p>
      <Table
        caption="Every copy this assessment can produce"
        captionSize="s"
        firstCellIsHeader
        scroll
        columns={[{ header: 'Format' }, ...SCOPES.map((s) => ({ header: s.column }))]}
        rows={FORMATS.map((entry) => [
          <span key="f">
            {entry.row}
            <br />
            <span className="prt-meta">{entry.note}</span>
          </span>,
          ...SCOPES.map((scope) => (
            <a
              key={`${entry.format}-${scope.column}`}
              className="govuk-link"
              href={at(entry.format, scope.scope)}
              download
            >
              Download
              <span className="govuk-visually-hidden">
                {' '}— {entry.row.toLowerCase()}, {scope.column.toLowerCase()}
              </span>
            </a>
          )),
        ])}
      />
    </>
  );
}
