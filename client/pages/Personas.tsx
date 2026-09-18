import { useEffect, useState } from 'react';
import { api } from '../api';
import { Table } from '../govuk';

/**
 * The persona library — bodies this install has met more than once.
 *
 * Its value is cumulative and only shows up on the second assessment: a body
 * profiled in one paper is recognised in the next, and the sightings count is how
 * a reader knows whether a profile is a first impression or a pattern.
 */
export function Personas() {
  const [rows, setRows] = useState<{ id: string; name: string; sightings: number; kind: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.personas().then((data) => setRows(data.personas)).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Persona library</h1>
        <p className="govuk-body-l">
          Bodies this install has profiled, and how often each has turned up.
        </p>
        {error ? <p className="govuk-body govuk-error-message">{error}</p> : null}
        {rows === null && !error ? <p className="govuk-body">Loading…</p> : null}
        {rows?.length === 0 ? (
          <p className="govuk-body">
            Nothing yet. The library fills as assessments run, and only starts being useful on
            the second paper that names the same body.
          </p>
        ) : null}
        {rows?.length ? (
          <Table
            columns={[{ header: 'Body' }, { header: 'Kind' }, { header: 'Sightings', numeric: true }]}
            rows={rows.map((row) => [row.name, row.kind ?? '—', String(row.sightings)])}
          />
        ) : null}
      </div>
    </div>
  );
}
