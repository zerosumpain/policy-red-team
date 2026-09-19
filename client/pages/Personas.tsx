import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type PersonaSummary } from '../api';
import { Table, Tag } from '../govuk';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.personas().then((data) => setRows(data.personas)).catch((err: Error) => setError(err.message));
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
            <Table
              caption="Most-seen first"
              captionSize="s"
              scroll
              columns={[
                { header: 'Body' }, { header: 'Kind' },
                { header: 'Papers', numeric: true }, { header: 'Plays', numeric: true },
                { header: 'Worst band' }, { header: 'Last seen' },
              ]}
              rows={rows.map((row) => [
                <Link key="n" className="govuk-link" to={`/personas/${row.id}`}>{row.name}</Link>,
                row.entityType.replaceAll('_', ' ') || '—',
                String(row.sightings),
                String(row.plays),
                row.worstBand
                  ? <Tag colour={row.worstBand === 'severe' ? 'red' : row.worstBand === 'significant' ? 'orange' : 'grey'}>{row.worstBand}</Tag>
                  : <span className="prt-meta">None found</span>,
                row.lastSeen
                  ? new Date(row.lastSeen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : <span className="prt-meta">Not recorded</span>,
              ])}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
