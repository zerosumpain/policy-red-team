import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type AffectedGroup, type DuplicateSuggestion, type PersonaSummary } from '../api';
import { Table, type Column } from '../govuk';
import { BandMark } from '../BandMark';
import { Bar } from '../report/Metrics';
import { usePageTitle } from '../layout/Template';

/**
 * The persona library — bodies this install has met more than once.
 *
 * Its value is cumulative and only shows up on the second assessment: a body
 * profiled in one paper is recognised in the next, and the sightings count is
 * how a reader knows whether a profile is a first impression or a pattern.
 *
 * THE LIST WAS SHOWING THREE OF THE ELEVEN FIELDS IT ASKS FOR. `listPersonas`
 * computes the worst band any paper found for a body, how many plays across all
 * of them, when it was last seen and how many reader-commissioned enquiries it
 * carries — and the page rendered name, kind and a count. The figures that
 * decide which row a reader opens are the ones that were missing.
 */
export function Personas() {
  usePageTitle('Persona library');
  const [rows, setRows] = useState<PersonaSummary[] | null>(null);
  const [groups, setGroups] = useState<AffectedGroup[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateSuggestion[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.personas()
      .then((data) => {
        setRows(data.personas);
        setGroups(data.groups ?? []);
        setDuplicates(data.duplicates ?? []);
        setReadOnly(data.readOnly);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const seenTwice = rows?.filter((r) => r.sightings > 1).length ?? 0;

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Persona library</h1>
          <p className="govuk-body-l">
            Bodies this install has profiled, and how often each has turned up.
          </p>
          <p className="govuk-body">
            A dossier is <strong>context, never evidence</strong>. It was drawn from other papers
            about other policies, and what it says about a body is a record of how that body has
            been described — not a finding about the assessment in front of you.
          </p>
          {error ? <p className="govuk-body govuk-error-message" role="alert">{error}</p> : null}
          {rows === null && !error ? <p className="govuk-body">Loading…</p> : null}
          {rows?.length === 0 ? (
            <p className="govuk-body">
              Nothing yet. The library fills as assessments run, and only starts being useful on
              the second paper that names the same body.
            </p>
          ) : null}
          {rows?.length ? (
            <p className="govuk-body">
              {rows.length} {rows.length === 1 ? 'body' : 'bodies'}.{' '}
              {seenTwice
                ? `${seenTwice} ${seenTwice === 1 ? 'has' : 'have'} turned up in more than one paper, and ${seenTwice === 1 ? 'that is the one' : 'those are the ones'} worth opening: a dossier on a body seen once says what that one paper said.`
                : 'None has turned up in more than one paper yet — until one does, a dossier says what that single paper said and the assessment says it in context.'}
            </p>
          ) : null}
        </div>
      </div>

      {rows?.length ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <Library rows={rows} />
          </div>
        </div>
      ) : null}

      {/* ONE BODY RECORDED TWICE, offered and never acted on. The same GOV.UK
          body is the strong case; a short name and its long form, or two names
          very alike, the weak one. A pair the reader rules different goes. */}
      {duplicates.length ? (
        <section aria-labelledby="library-duplicates" className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <h2 className="govuk-heading-m" id="library-duplicates">These may be the same body — {duplicates.length}</h2>
            <p className="govuk-body">
              Each pair may be one body the library has recorded twice. Check them side by side
              and say whether they are the same.
            </p>
            <ul className="govuk-list govuk-list--bullet">
              {duplicates.map((pair) => (
                <li key={`${pair.a.id}-${pair.b.id}`}>
                  {readOnly ? `${pair.a.name} and ${pair.b.name}` : (
                    <Link className="govuk-link" to={`/personas/${pair.a.id}/merge/${pair.b.id}`}>
                      {pair.a.name} and {pair.b.name}
                    </Link>
                  )}{' '}
                  <span className="prt-meta">— {pair.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* GROUPS OF PEOPLE ARE NOT BODIES. 18 of the 35 personas on the live box
          were groups like "children", and a generic name like that is what split
          the library. They are listed here, for what they are: who the papers
          say a policy affects. */}
      {groups.length ? (
        <section aria-labelledby="library-groups" className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <h2 className="govuk-heading-m" id="library-groups">Groups of people the papers name — {groups.length}</h2>
            <p className="govuk-body">
              The people a policy affects, such as children or parents. They are kept apart from the
              bodies above: a group has no plan of its own to profile.
            </p>
            <Table
              caption="Named in the most papers first"
              captionSize="s"
              columns={[{ header: 'Group' }, { header: 'Papers', numeric: true }]}
              rows={groups.map((g) => [g.name, String(g.papers)])}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}

/** The date a row was last recorded, as the column printed it. */
const recorded = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null);

/**
 * THREE OF SEVEN COLUMNS WERE THE SAME VALUE TWELVE TIMES.
 *
 * Measured on the live library: `Papers` is 1 on every row, `Enquiries` is 0 on
 * every row and `Last recorded` is "19 Sept 2026" on every row — 43% of the
 * table carrying no information, in a table whose whole purpose is telling the
 * rows apart. They are not deleted: a column is rendered where it VARIES and
 * folded into one sentence where it does not, so the moment a second assessment
 * runs, or one enquiry is commissioned, the column comes back on its own.
 *
 * `Plays` GETS A LENGTH. 6 against 1 read as two digits; it is the column that
 * actually orders the table, and Move 4 already draws its "Worst play" column
 * this way. The bar is normalised to the row maximum, which is what `scale`
 * tells a screen-reader user so that this table's lengths are not mistaken for
 * another's.
 */
function Library({ rows }: { rows: PersonaSummary[] }) {
  const varies = <T,>(pick: (row: PersonaSummary) => T) => new Set(rows.map(pick)).size > 1;
  const showPapers = varies((row) => row.sightings);
  const showEnquiries = varies((row) => row.researchNotes);
  const showLastSeen = varies((row) => recorded(row.lastSeen));
  const mostPlays = Math.max(1, ...rows.map((row) => row.plays));

  const showBody = rows.some((row) => row.body);
  const columns: Column[] = [
    { header: 'Body' }, { header: 'Kind' },
    ...(showBody ? [{ header: 'On GOV.UK as' }] : []),
    ...(showPapers ? [{ header: 'Papers', numeric: true }] : []),
    { header: 'Plays', numeric: true },
    { header: 'Worst band' },
    ...(showEnquiries ? [{ header: 'Enquiries', numeric: true }] : []),
    ...(showLastSeen ? [{ header: 'Last recorded' }] : []),
  ];

  /* The constants, said once. Only the ones that are actually constant, so with
     a second assessment or one commissioned enquiry this sentence shortens on
     its own and then disappears. Two sentences rather than one list, because
     "has been seen in one paper, no enquiries, last recorded on 19 Sept" is a
     verb doing three incompatible jobs. */
  const held: string[] = [];
  if (!showPapers) {
    held.push(`been seen in ${rows[0].sightings === 1 ? 'one paper' : `${rows[0].sightings} papers`}`);
  }
  if (!showEnquiries) {
    held.push(rows[0].researchNotes === 0
      ? 'had no commissioned enquiries'
      : `had ${rows[0].researchNotes} commissioned ${rows[0].researchNotes === 1 ? 'enquiry' : 'enquiries'}`);
  }
  const sameDate = !showLastSeen ? recorded(rows[0].lastSeen) : null;

  return (
    <>
      <Table
        caption="Most-seen first"
        captionSize="s"
        scroll
        columns={columns}
        rows={rows.map((row) => [
          <Link key="n" className="govuk-link" to={`/personas/${row.id}`}>{row.name}</Link>,
          row.entityType.replaceAll('_', ' ') || '—',
          ...(showBody ? [row.body?.name ?? <span key="g" className="prt-meta">Not matched</span>] : []),
          ...(showPapers ? [String(row.sightings)] : []),
          <Bar key="p" value={row.plays} max={mostPlays} digits={0} scale={`plays, 0 to ${mostPlays} on this table`} />,
          <BandMark key="b" band={row.worstBand} />,
          ...(showEnquiries ? [String(row.researchNotes)] : []),
          /* "LAST RECORDED", not "last seen in a paper". `listPersonas`
             computes it over every observation including the enquiries a
             reader commissioned, so an enquiry moves this date for a body
             no new paper has named — which the old column heading denied.
             The enquiries column beside it is what makes the difference
             legible. */
          ...(showLastSeen
            ? [recorded(row.lastSeen) ?? <span key="l" className="prt-meta">Not recorded</span>]
            : []),
        ])}
      />
      {held.length || sameDate ? (
        <p className="govuk-body-s prt-meta">
          {held.length ? `Every body here has ${held.join(' and ')}.` : ''}
          {held.length && sameDate ? ' ' : ''}
          {sameDate ? `All ${rows.length} were last recorded on ${sameDate}.` : ''}
        </p>
      ) : null}
    </>
  );
}
