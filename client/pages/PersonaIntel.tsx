import { useState } from 'react';
import { Link } from 'react-router';
import { QUESTION_WORDS, SOURCE_WORDS, type BodyEvidenceRecord, type EvidenceQuestion } from '$lib/policy-analysis/body-evidence';
import type { Ask, AskKind } from '$lib/policy-analysis/intel';
import { api, type BodyIntel } from '../api';
import { Button, ButtonGroup, Details, Table } from '../govuk';
import { bodyPath } from '../places';

/**
 * ONE BODY ACROSS PAPERS, AND WHAT THE PUBLIC RECORD SAYS ABOUT IT — the parts
 * of a body's page that read `BodyIntel` (phase 19, workstream X; split into
 * parts in phase 24 so the page can put each in its band):
 *
 *   WhereItSits     the register's parent and child bodies   — fact
 *   AskGroups       what one paper asks of it                 — context
 *   PublicRecord    dated public documents, and its capacity  — evidence
 *
 * THE KINDS ARE DIFFERENT THINGS and the page keeps them apart by band rather
 * than by a paragraph explaining the interleaving. What papers asked is other
 * papers' readings, context and never evidence. The public record is published
 * documents with dates, and a run may cite it as evidence.
 */

/** The delivery chain the register records and papers rarely state. */
export function WhereItSits({ intel }: { intel: BodyIntel }) {
  if (!intel.body) return null;
  return (
    <>
      <h3 className="govuk-heading-s">It is part of</h3>
      {intel.body.parents.length ? (
        <ul className="govuk-list">
          {intel.body.parents.map((p) => (
            <li key={p.id}>{intel.parentPersonas[p.id] ? <Link className="govuk-link" to={bodyPath(intel.parentPersonas[p.id])}>{p.name}</Link> : p.name}</li>
          ))}
        </ul>
      ) : <p className="govuk-body">No other body, on the GOV.UK list.</p>}
      <h3 className="govuk-heading-s">Bodies under it — {intel.children.length}</h3>
      {intel.children.length ? <Children list={intel.children} /> : <p className="govuk-body">None, on the GOV.UK list.</p>}
    </>
  );
}

const KIND_WORDS: Record<AskKind, string> = {
  duty: 'It is asked to',
  power: 'It is allowed to',
  gain: 'It gains',
  oversight: 'Who is over it',
};

/** What one paper asks of this body, grouped by kind, read off that paper's own map of who does what. */
export function AskGroups({ paperId, asks }: { paperId: string; asks: Ask[] }) {
  const groups = (['duty', 'power', 'gain', 'oversight'] as AskKind[])
    .map((kind) => ({ kind, asks: asks.filter((a) => a.kind === kind) }))
    .filter((g) => g.asks.length);
  if (!groups.length) return <p className="govuk-body">The paper’s map records nothing it asks of this body.</p>;
  return (
    <>
      {groups.map((g) => (
        <div key={g.kind}>
          <p className="govuk-body govuk-!-margin-bottom-1">{KIND_WORDS[g.kind]}:</p>
          <ul className="govuk-list govuk-list--bullet">
            {g.asks.slice(0, 8).map((ask) => <AskItem key={ask.artefactId} paperId={paperId} ask={ask} />)}
          </ul>
          {g.asks.length > 8 ? (
            <Details summary={`${g.asks.length - 8} more`}>
              <ul className="govuk-list govuk-list--bullet">
                {g.asks.slice(8).map((ask) => <AskItem key={ask.artefactId} paperId={paperId} ask={ask} />)}
              </ul>
            </Details>
          ) : null}
        </div>
      ))}
    </>
  );
}

function AskItem({ paperId, ask }: { paperId: string; ask: Ask }) {
  return (
    <li>
      <Link className="govuk-link" to={`/assessments/${paperId}/items/${encodeURIComponent(ask.artefactId)}`}>{ask.words}</Link>
    </li>
  );
}

function Children({ list }: { list: BodyIntel['children'] }) {
  const item = (c: BodyIntel['children'][number]) => (
    <li key={c.id}>{c.personaId ? <Link className="govuk-link" to={bodyPath(c.personaId)}>{c.name}</Link> : c.name}</li>
  );
  // Bodies this service has met first: those are the ones a reader can open.
  const sorted = [...list].sort((a, b) => Number(Boolean(b.personaId)) - Number(Boolean(a.personaId)) || a.name.localeCompare(b.name));
  return (
    <>
      <ul className="govuk-list">{sorted.slice(0, 10).map(item)}</ul>
      {sorted.length > 10 ? (
        <Details summary={`${sorted.length - 10} more`}>
          <ul className="govuk-list">{sorted.slice(10).map(item)}</ul>
        </Details>
      ) : null}
    </>
  );
}

export const longDate = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso))
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : null);

const ExternalLink = ({ record }: { record: BodyEvidenceRecord }) => (
  <a className="govuk-link" href={record.url} rel="noreferrer noopener external" target="_blank">
    {record.title}<span className="govuk-visually-hidden"> (opens in a new tab)</span>
  </a>
);

/**
 * The public record: what it says about the body's money and staff, then every
 * dated document, then when each source was last asked — and the free check.
 */
export function PublicRecord({ personaId, name, intel, readOnly, onChecked }: {
  personaId: string;
  name: string;
  intel: BodyIntel;
  readOnly: boolean;
  /** Called after a check, so the page refetches what it draws. */
  onChecked: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function checkAgain() {
    setBusy(true);
    setActionError(null);
    setOutcome('Asking GOV.UK and Parliament. This can take a few seconds.');
    try {
      const result = await api.checkPublicRecord(personaId);
      // Said AFTER the list is redrawn, so "found 2" is never announced over a
      // list that does not show them yet.
      await onChecked();
      setOutcome(`${result.added ? `Found ${result.added} new ${result.added === 1 ? 'document' : 'documents'}.` : 'Nothing new was found.'}${result.failed.length ? ' One or more sources did not answer; try again later.' : ''}`);
    } catch (err) {
      setOutcome('');
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!intel.body) {
    return <p className="govuk-body">Not matched to the GOV.UK list, so there is no public record to show.</p>;
  }
  const capacity = intel.record.records.filter((r) => r.question === 'capacity');
  return (
    <>
      <p className="govuk-body">
        Public documents about {name} from GOV.UK and Parliament. Unlike what the papers said, these
        are evidence: each is a published document with a date. They are about the body, not about
        any one paper, and only the title and summary were read. An assessment shows up to three of
        them to the model for this body.
      </p>
      <h3 className="govuk-heading-s">What it says about its money and staff</h3>
      {capacity.length ? <RecordList records={capacity.slice(0, 5)} /> : (
        <p className="govuk-body">
          Nothing found yet. The papers say what they ask of it; nothing here yet says whether it has
          the money and staff to do it.
        </p>
      )}
      <h3 className="govuk-heading-s" id="persona-record">Track record — {intel.record.records.length}</h3>
      {intel.record.records.length ? <RecordTable records={intel.record.records} /> : (
        <p className="govuk-body">Nothing yet. It is checked when a paper that names it is assessed, or when you check now.</p>
      )}
      <Checks checks={intel.record.checks} />
      <p className="govuk-body" role="status" aria-live="polite">{outcome}</p>
      {actionError ? <p className="govuk-body govuk-error-message" role="alert">{actionError}</p> : null}
      {!readOnly ? (
        <>
          <p className="govuk-body-s prt-meta" id="persona-record-cost">
            Free. It asks GOV.UK and Parliament directly. No model is used and nothing from any paper
            is sent.
          </p>
          <ButtonGroup>
            <Button variant="secondary" disabled={busy} onClick={() => void checkAgain()} aria-describedby="persona-record-cost">
              {busy ? 'Checking…' : 'Check again now'}
            </Button>
          </ButtonGroup>
        </>
      ) : null}
    </>
  );
}

function RecordList({ records }: { records: BodyEvidenceRecord[] }) {
  return (
    <ul className="govuk-list govuk-list--bullet">
      {records.map((r) => (
        <li key={r.url}><ExternalLink record={r} /> <span className="prt-meta">— {longDate(r.publishedAt) ?? 'no date given'}, {r.publisher ?? SOURCE_WORDS[r.source]}</span></li>
      ))}
    </ul>
  );
}

/** The public record as a table: when, what, who published it, and what it tells you. */
function RecordTable({ records }: { records: BodyEvidenceRecord[] }) {
  const shown = records.slice(0, 30);
  return (
    <>
      <Table className="prt-table"
        caption="Newest first"
        captionSize="s"
        scroll
        columns={[{ header: 'Published' }, { header: 'Document' }, { header: 'From' }, { header: 'What it tells you' }]}
        rows={shown.map((r) => [
          longDate(r.publishedAt) ?? <span key="d" className="prt-meta">No date given</span>,
          <ExternalLink key="t" record={r} />,
          r.publisher && r.publisher !== 'GOV.UK' ? r.publisher : SOURCE_WORDS[r.source],
          QUESTION_WORDS[r.question as EvidenceQuestion]?.label ?? r.question,
        ])}
      />
      {records.length > shown.length ? <p className="govuk-body-s prt-meta">Showing the newest {shown.length} of {records.length}.</p> : null}
    </>
  );
}

function Checks({ checks }: { checks: BodyIntel['record']['checks'] }) {
  if (!checks.length) return <p className="govuk-body-s prt-meta">Not checked yet.</p>;
  return (
    <>
      <p className="govuk-body-s prt-meta govuk-!-margin-bottom-1">Last checked:</p>
      <ul className="govuk-list govuk-body-s prt-meta">
        {checks.map((c) => (
          <li key={c.source}>
            {SOURCE_WORDS[c.source].replace(/^a /, 'A ')}: {longDate(c.checkedAt)}.{' '}
            {c.error ?? `${c.found} found.`}
          </li>
        ))}
      </ul>
    </>
  );
}
