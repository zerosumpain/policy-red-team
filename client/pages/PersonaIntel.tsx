import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { QUESTION_WORDS, SOURCE_WORDS, type BodyEvidenceRecord, type EvidenceQuestion } from '$lib/policy-analysis/body-evidence';
import type { Ask, AskKind } from '$lib/policy-analysis/intel';
import { api, type BodyIntel } from '../api';
import { Button, ButtonGroup, Details, Table } from '../govuk';
import { BandMark } from '../BandMark';
import { ClashList } from './ClashList';

/**
 * ONE BODY ACROSS PAPERS, AND WHAT THE PUBLIC RECORD SAYS ABOUT IT — phase 19,
 * workstream X. Four sections on the body's page:
 *
 *   WHERE IT SITS        the register's parent and child bodies — the delivery
 *                        chain a paper almost never states
 *   WHAT EACH PAPER ASKS paper by paper, oldest first, read off each paper's
 *                        own map of who does what
 *   ASKS AND RESOURCES   everything asked of it, next to what the public record
 *                        says it has to work with
 *   TRACK RECORD         dated public documents, with where each came from
 *
 * THE TWO HALVES ARE DIFFERENT KINDS OF THING and the page keeps them apart.
 * What papers asked is the library: other papers' readings, context and never
 * evidence. The public record is published documents with dates, and a run
 * may cite it as evidence. The page says which is which, in words.
 */
export function PersonaIntel({ personaId, name, readOnly }: { personaId: string; name: string; readOnly: boolean }) {
  const [intel, setIntel] = useState<BodyIntel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => api.personaIntel(personaId).then((data) => { setIntel(data); setError(null); }), [personaId]);

  useEffect(() => {
    let live = true;
    setIntel(null);
    api.personaIntel(personaId)
      .then((data) => { if (live) setIntel(data); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [personaId]);

  async function checkAgain() {
    setBusy(true);
    setActionError(null);
    setOutcome('Asking GOV.UK and Parliament. This can take a few seconds.');
    try {
      const result = await api.checkPublicRecord(personaId);
      // Said AFTER the list is redrawn, so "found 2" is never announced over a
      // list that does not show them yet.
      await load();
      setOutcome(`${result.added ? `Found ${result.added} new ${result.added === 1 ? 'document' : 'documents'}.` : 'Nothing new was found.'}${result.failed.length ? ' One or more sources did not answer; try again later.' : ''}`);
    } catch (err) {
      setOutcome('');
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="govuk-body govuk-error-message" role="alert">{error}</p>;
  if (!intel) return <p className="govuk-body">Loading what other papers asked of it…</p>;

  const capacity = intel.record.records.filter((r) => r.question === 'capacity');
  const totalAsks = intel.papers.reduce((n, p) => n + p.asks.filter((a) => a.kind === 'duty').length, 0);

  return (
    <>
      {intel.body ? (
        <section aria-labelledby="persona-sits">
          <h2 className="govuk-heading-m" id="persona-sits">Where it sits</h2>
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <p className="govuk-body">
                From the GOV.UK list. Papers rarely say who a body answers to, or which bodies do the
                work under it.
              </p>
              <h3 className="govuk-heading-s">It is part of</h3>
              {intel.body.parents.length ? (
                <ul className="govuk-list">
                  {intel.body.parents.map((p) => (
                    <li key={p.id}>{intel.parentPersonas[p.id] ? <Link className="govuk-link" to={`/personas/${intel.parentPersonas[p.id]}`}>{p.name}</Link> : p.name}</li>
                  ))}
                </ul>
              ) : <p className="govuk-body">No other body, on the GOV.UK list.</p>}
              <h3 className="govuk-heading-s">Bodies under it — {intel.children.length}</h3>
              {intel.children.length ? <Children list={intel.children} /> : <p className="govuk-body">None, on the GOV.UK list.</p>}
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="persona-asks">
        <h2 className="govuk-heading-m" id="persona-asks">What each paper asks of it — {intel.papers.length}</h2>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            {!intel.body ? (
              <p className="govuk-body">
                This needs the body to be matched to the GOV.UK list, so papers can be compared by who
                the body really is rather than by what each paper called it.
              </p>
            ) : intel.papers.length ? (
              <>
                <p className="govuk-body">
                  Oldest paper first. Read from each paper’s own map of who does what. This is what the
                  papers say, not a check of whether it is true.
                </p>
                {intel.papers.map((entry) => <PaperEntry key={entry.paper.id} entry={entry} />)}
              </>
            ) : <p className="govuk-body">No finished, unsealed paper has named it yet.</p>}
          </div>
        </div>
      </section>

      {intel.body ? (
        <section aria-labelledby="persona-load">
          <h2 className="govuk-heading-m" id="persona-load">What it is asked to do, and what it has</h2>
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <p className="govuk-body">
                Across {intel.papers.length} {intel.papers.length === 1 ? 'paper' : 'papers'}, it is asked to do{' '}
                {totalAsks} {totalAsks === 1 ? 'thing' : 'things'}. No paper counts what the others ask.
              </p>
              {intel.papers.length > 1 ? (
                <Table
                  caption="Asks and plays, paper by paper"
                  captionSize="s"
                  firstCellIsHeader
                  columns={[{ header: 'Paper' }, { header: 'Asks', numeric: true }, { header: 'Plays', numeric: true }]}
                  rows={intel.papers.map((p) => [p.paper.title, String(p.asks.filter((a) => a.kind === 'duty').length), String(p.plays.length)])}
                />
              ) : null}
              <h3 className="govuk-heading-s">What the public record says about its money and staff</h3>
              {capacity.length ? <RecordList records={capacity.slice(0, 5)} /> : (
                <p className="govuk-body">
                  Nothing found yet. The papers say what they ask of it; nothing here yet says whether it
                  has the money and staff to do it.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="persona-record">
        <h2 className="govuk-heading-m" id="persona-record">Track record — {intel.record.records.length}</h2>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <div className="govuk-grid-row">
              <div className="govuk-grid-column-two-thirds">
                <p className="govuk-body">
                  Public documents about {name} from GOV.UK and Parliament, newest first. Unlike the rest
                  of this page, these are evidence: each is a published document with a date. They are
                  about the body, not about any one paper, and only the title and summary were read.
                  An assessment shows up to three of them to the model for this body.
                </p>
              </div>
            </div>
            {!intel.body ? (
              <p className="govuk-body">Not matched to the GOV.UK list, so there is no public record to show.</p>
            ) : (
              <>
                {intel.record.records.length ? <RecordTable records={intel.record.records} /> : (
                  <p className="govuk-body">Nothing yet. It is checked when a paper that names it is assessed, or when you check now.</p>
                )}
                <Checks checks={intel.record.checks} />
                <p className="govuk-body" role="status" aria-live="polite">{outcome}</p>
                {actionError ? <p className="govuk-body govuk-error-message" role="alert">{actionError}</p> : null}
                {!readOnly ? (
                  <>
                    <p className="govuk-body-s prt-meta" id="persona-record-cost">
                      Free. It asks GOV.UK and Parliament directly. No model is used and nothing from
                      any paper is sent.
                    </p>
                    <ButtonGroup>
                      <Button variant="secondary" disabled={busy} onClick={() => void checkAgain()} aria-describedby="persona-record-cost">
                        {busy ? 'Checking…' : 'Check again now'}
                      </Button>
                    </ButtonGroup>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {intel.clashes.length ? (
        <section aria-labelledby="persona-clashes">
          <h2 className="govuk-heading-m" id="persona-clashes">Where two papers pull it in opposite directions — {intel.clashes.length}</h2>
          <ClashList clashes={intel.clashes} />
          <p className="govuk-body"><Link className="govuk-link" to="/bodies">See every body against every paper</Link></p>
        </section>
      ) : null}
    </>
  );
}

const KIND_WORDS: Record<AskKind, string> = {
  duty: 'It is asked to',
  power: 'It is allowed to',
  gain: 'It gains',
  oversight: 'Who is over it',
};

function PaperEntry({ entry }: { entry: BodyIntel['papers'][number] }) {
  const groups = (['duty', 'power', 'gain', 'oversight'] as AskKind[])
    .map((kind) => ({ kind, asks: entry.asks.filter((a) => a.kind === kind) }))
    .filter((g) => g.asks.length);
  const worst = entry.plays[0]?.band ?? null;
  return (
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-1">
        <Link className="govuk-link" to={`/assessments/${entry.paper.id}`}>{entry.paper.title}</Link>
      </h3>
      <p className="govuk-body-s prt-meta">
        {entry.paper.completedAt ? `Assessed ${longDate(entry.paper.completedAt)}` : 'Date not recorded'}
        {' · '}{entry.plays.length} {entry.plays.length === 1 ? 'play' : 'plays'} found
        {worst ? <> · worst <BandMark band={worst.toLowerCase()} /></> : null}
      </p>
      {groups.length ? groups.map((g) => (
        <div key={g.kind}>
          <p className="govuk-body govuk-!-margin-bottom-1">{KIND_WORDS[g.kind]}:</p>
          <ul className="govuk-list govuk-list--bullet">
            {g.asks.slice(0, 8).map((ask) => <AskItem key={ask.artefactId} paperId={entry.paper.id} ask={ask} />)}
          </ul>
          {g.asks.length > 8 ? (
            <Details summary={`${g.asks.length - 8} more`}>
              <ul className="govuk-list govuk-list--bullet">
                {g.asks.slice(8).map((ask) => <AskItem key={ask.artefactId} paperId={entry.paper.id} ask={ask} />)}
              </ul>
            </Details>
          ) : null}
        </div>
      )) : <p className="govuk-body">The paper’s map records nothing it asks of this body.</p>}
    </div>
  );
}

function AskItem({ paperId, ask }: { paperId: string; ask: Ask }) {
  return (
    <li>
      <Link className="govuk-link" to={`/assessments/${paperId}/artefacts/${encodeURIComponent(ask.artefactId)}`}>{ask.words}</Link>
    </li>
  );
}

function Children({ list }: { list: BodyIntel['children'] }) {
  const item = (c: BodyIntel['children'][number]) => (
    <li key={c.id}>{c.personaId ? <Link className="govuk-link" to={`/personas/${c.personaId}`}>{c.name}</Link> : c.name}</li>
  );
  // Bodies this library has met first: those are the ones a reader can open.
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

const longDate = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso))
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : null);

const ExternalLink = ({ record }: { record: BodyEvidenceRecord }) => (
  <a className="govuk-link" href={record.url} rel="noreferrer noopener external" target="_blank">
    {record.title}<span className="govuk-visually-hidden"> (opens in a new tab)</span>
  </a>
);

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
      <Table
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
