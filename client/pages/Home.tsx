import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type AnalysisRow } from '../api';
import { NotificationBanner, Table, Tag, type TagColour } from '../govuk';
import { statusLabel, statusColour } from '../status';
import { usePageTitle } from '../layout/Template';

/**
 * Everything assessed so far.
 *
 * A table rather than the site version's card grid: these rows are compared —
 * which paper, when, did it finish — and comparing is what a table is for. The
 * card grid looked better and answered none of those questions at a glance.
 */
export function Home() {
  const [rows, setRows] = useState<AnalysisRow[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No page name: the landing page IS the service, and "Policy Red Team —
  // Policy Red Team" is what a title built by rote looks like.
  usePageTitle();

  useEffect(() => {
    api.landing()
      .then((data) => { setRows(data.analyses); setReadOnly(data.readOnly); })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Policy Red Team</h1>
        <p className="govuk-body-l">
          It reads a policy paper as an adversary would: who gains if it fails, and what they can
          do about it while staying compliant.
        </p>
        <p className="govuk-body">
          It is not an assurance review. It will not tell you a policy is fine — a clean report
          means it found nothing, which is not the same thing.
        </p>
        {/* Read-only: say it once, plainly, and do not render a button that
            would 403. A disabled control the reader cannot explain is worse than
            no control at all. */}
        {readOnly ? (
          <NotificationBanner title="Read-only">
            <p className="govuk-body">
              You can open, drill into and download every assessment here. Nothing new can be
              started from this copy.
            </p>
          </NotificationBanner>
        ) : (
          /* The router's Link wearing the button class, rather than our Button
             with an href. Both render the same markup GOV.UK specifies — an <a>
             with role="button" — but an anchor with a plain href reloads the
             whole app to move one page, which in a single-page app is a
             regression nobody would choose deliberately. */
          <Link to="/new" className="govuk-button" role="button" draggable={false} data-module="govuk-button">
            Assess a paper
          </Link>
        )}
      </div>

      <div className="govuk-grid-column-full govuk-!-margin-top-6">
        <h2 className="govuk-heading-l">Assessments</h2>
        {error ? <p className="govuk-body govuk-error-message">{error}</p> : null}
        {rows === null && !error ? <p className="govuk-body">Loading…</p> : null}
        {rows?.length === 0 ? (
          <p className="govuk-body">Nothing assessed yet. Start with a paper you already know well — it is the fastest way to judge whether the thing is any good.</p>
        ) : null}
        {rows?.length ? (
          <Table
            columns={[{ header: 'Paper' }, { header: 'Area' }, { header: 'Started' }, { header: 'Status' }]}
            rows={rows.map((row) => [
              <Link key="t" className="govuk-link" to={`/assessments/${row.id}`}>{row.title}</Link>,
              row.policyArea ?? row.jurisdiction ?? '—',
              new Date(row.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
              <Tag key="s" colour={statusColour(row.status) as TagColour}>{statusLabel(row.status)}</Tag>,
            ])}
          />
        ) : null}
      </div>
    </div>
  );
}
