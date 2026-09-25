import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, type BodyFacts, type PersonaDossier, type PersonaSummary } from '../api';
import { Button, ButtonGroup, ErrorSummary, InsetText, Input, Radios, SummaryList, WarningText } from '../govuk';
import { usePageTitle } from '../layout/Template';

/**
 * WHO A BODY IS — the reader's four rulings, one question per page.
 *
 * The library matches bodies by itself: the GOV.UK register first, then the
 * name. It cannot always tell, and until phase 19 there was nothing a reader
 * could do about it — a tie opened a second record and nothing could close it.
 * These pages are how a person puts it right:
 *
 *   /personas/:id/register                which GOV.UK body this is (or is not)
 *   /personas/:id/merge                   which other record is the same body
 *   /personas/:id/merge/:other            are these two the same? yes / no
 *   /personas/:id/sightings/:observation  this paper meant a different body
 *
 * ROUTES, NOT DIALOGS. GDS has no modal component on purpose: a layer over a
 * page needs its own focus trap, Escape handling and back stack. A page has all
 * three already. See `Drill.tsx` for the same argument.
 *
 * Every answer here is a mutation, so a read-only copy draws none of the forms,
 * and the server refuses them anyway.
 */

/** Load one record, with a page-level error the reader can act on. */
function useDossier(id: string) {
  const [detail, setDetail] = useState<PersonaDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setDetail(null);
    setError(null);
    api.persona(id)
      .then((data) => { if (live) setDetail(data); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [id]);
  return { detail, error };
}

function Problem({ message }: { message: string }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds" role="alert">
        <h1 className="govuk-heading-l">There is a problem</h1>
        <p className="govuk-body">{message}</p>
        <p className="govuk-body"><Link className="govuk-link" to="/personas">Go back to the library</Link></p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Loading</h1>
        <p className="govuk-body" aria-live="polite">Getting this record.</p>
      </div>
    </div>
  );
}

function ReadOnly({ id }: { id: string }) {
  return (
    <InsetText>
      This copy is read-only, so nothing can be changed from it.{' '}
      <Link className="govuk-link" to={`/personas/${id}`}>Go back to the record</Link>.
    </InsetText>
  );
}

/** "Department for Education (DfE) — ministerial department, open". The figure in the label, never a radio hint. */
const bodyLabel = (b: BodyFacts) =>
  `${b.name}${b.acronym ? ` (${b.acronym})` : ''} — ${(b.kind ?? 'kind not given').toLowerCase()}, ${b.open ? 'open' : 'closed'}`;

// ---------------------------------------------------------------------------
// Which GOV.UK body is this?
// ---------------------------------------------------------------------------

export function PersonaRegister() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { detail, error } = useDossier(id);
  const [results, setResults] = useState<BodyFacts[] | null>(null);
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [busy, setBusy] = useState(false);
  usePageTitle(detail ? `Which public body is ${detail.persona.name}?` : undefined);

  const query = params.get('q') ?? detail?.persona.name ?? '';
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let live = true;
    setResults(null);
    api.searchRegister(query)
      .then((data) => { if (live) setResults(data.results); })
      .catch((err: Error) => { if (live) setErrors([{ text: err.message, href: '#register-q' }]); });
    return () => { live = false; };
  }, [query]);

  if (error) return <Problem message={error} />;
  if (!detail) return <Loading />;
  const { persona, body, notBody, readOnly } = detail;

  async function answer(bodyId: string, verdict: 'same' | 'different') {
    setBusy(true);
    setErrors([]);
    try {
      const result = await api.linkBody(id, bodyId, verdict);
      // Another record is already this body: ask, rather than merging behind the reader's back.
      if (verdict === 'same' && result.sameBodyAs.length) void navigate(`/personas/${id}/merge/${result.sameBodyAs[0].id}`);
      else void navigate(`/personas/${id}`);
    } catch (err) {
      setErrors([{ text: (err as Error).message, href: '#register-body' }]);
      setBusy(false);
    }
  }

  function choose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const chosen = String(new FormData(e.currentTarget).get('bodyId') ?? '');
    if (!chosen) { setErrors([{ text: 'Choose an organisation from the list, or search again', href: '#register-body' }]); return; }
    void answer(chosen, 'same');
  }

  const shown = (results ?? []).filter((r) => !notBody.some((n) => n.id === r.id));

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {errors.length ? <ErrorSummary errors={errors} /> : null}
        <span className="govuk-caption-l">{persona.name}</span>
        <h1 className="govuk-heading-l">Which public body is this?</h1>
        <p className="govuk-body">
          GOV.UK keeps a list of about 1,200 public bodies: departments, agencies and the bodies
          under them. When the library knows which one a record is, it links every paper that names
          that body, whatever each paper called it.
        </p>
        <p className="govuk-body">
          Not every body is on the list. Councils, charities, companies and Parliament’s own offices
          are not.
        </p>
        {readOnly ? <ReadOnly id={id} /> : (
          <>
            {body ? (
              <>
                <h2 className="govuk-heading-m">It is linked to {body.name}</h2>
                <p className="govuk-body">
                  If that is wrong, say so. The library will unlink it and will not link it to{' '}
                  {body.name} again.
                </p>
                <ButtonGroup>
                  <Button variant="warning" disabled={busy} onClick={() => void answer(body.id, 'different')}>
                    It is not {body.name}
                  </Button>
                </ButtonGroup>
              </>
            ) : null}

            <h2 className="govuk-heading-m">{body ? 'Choose a different body' : 'Find it on the list'}</h2>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ q: String(new FormData(e.currentTarget).get('q') ?? '') });
              }}
            >
              <Input id="register-q" name="q" label="Search by name or short name" hint="For example, Department for Education or DfE" defaultValue={query} key={query} spellCheck={false} />
              <ButtonGroup>
                <Button variant="secondary" type="submit">Search</Button>
              </ButtonGroup>
            </form>

            {results === null ? <p className="govuk-body" aria-live="polite">Searching.</p> : shown.length ? (
              <form onSubmit={choose} noValidate>
                <Radios
                  id="register-body"
                  name="bodyId"
                  legend={`Which of these is ${persona.name}?`}
                  legendSize="s"
                  error={errors.find((e) => e.href === '#register-body')?.text}
                  items={shown.map((r) => ({ value: r.id, text: bodyLabel(r) }))}
                />
                <ButtonGroup>
                  <Button type="submit" disabled={busy}>Confirm</Button>
                  <Link className="govuk-link" to={`/personas/${id}`}>Cancel</Link>
                </ButtonGroup>
              </form>
            ) : (
              <p className="govuk-body">Nothing on the list matches “{query}”. Try a shorter name.</p>
            )}
            {notBody.length ? (
              <p className="govuk-body-s prt-meta">You said it is not: {notBody.map((b) => b.name).join(', ')}.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Which other record is the same body?
// ---------------------------------------------------------------------------

export function PersonaMerge() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { detail, error } = useDossier(id);
  const [others, setOthers] = useState<PersonaSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  usePageTitle(detail ? `Which body is the same as ${detail.persona.name}?` : undefined);

  useEffect(() => {
    api.personas().then((data) => setOthers(data.personas)).catch((err: Error) => setProblem(err.message));
  }, []);

  if (error || problem) return <Problem message={(error ?? problem)!} />;
  if (!detail || !others) return <Loading />;
  const { persona, suggestions, notSameAs, readOnly } = detail;
  const ruledOut = new Set(notSameAs.map((n) => n.id));
  const suggested = suggestions.filter((s) => !ruledOut.has(s.id));
  const rest = others
    .filter((o) => o.id !== id && !ruledOut.has(o.id) && !suggested.some((s) => s.id === o.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const other = String(new FormData(e.currentTarget).get('other') ?? '');
    if (!other) { setChoiceError('Choose the record that is the same body'); return; }
    void navigate(`/personas/${id}/merge/${other}`);
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {choiceError ? <ErrorSummary errors={[{ text: choiceError, href: '#merge-other' }]} /> : null}
        <span className="govuk-caption-l">{persona.name}</span>
        {readOnly ? (
          <>
            <h1 className="govuk-heading-l">Combine two records</h1>
            <ReadOnly id={id} />
          </>
        ) : !suggested.length && !rest.length ? (
          <>
            <h1 className="govuk-heading-l">Combine two records</h1>
            <p className="govuk-body">There is no other record to combine it with.</p>
            <p className="govuk-body"><Link className="govuk-link" to={`/personas/${id}`}>Go back to the record</Link></p>
          </>
        ) : (
          <form onSubmit={next} noValidate>
            <Radios
              id="merge-other"
              name="other"
              isPageHeading
              legendSize="l"
              legend={`Which record is the same body as ${persona.name}?`}
              hint="You will see both side by side before anything changes."
              error={choiceError ?? undefined}
              items={[
                ...suggested.map((s) => ({ value: s.id, text: `${s.name} — likely: ${s.reason.replace(/\.$/, '').toLowerCase()}` })),
                ...rest.map((o) => ({ value: o.id, text: o.name })),
              ]}
            />
            <ButtonGroup>
              <Button type="submit">Continue</Button>
              <Link className="govuk-link" to={`/personas/${id}`}>Cancel</Link>
            </ButtonGroup>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Are these two the same body?
// ---------------------------------------------------------------------------

export function PersonaMergeConfirm() {
  const { id = '', other = '' } = useParams();
  const navigate = useNavigate();
  const one = useDossier(id);
  const two = useDossier(other);
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [busy, setBusy] = useState(false);
  usePageTitle('Are these the same body?');

  if (one.error || two.error) return <Problem message={(one.error ?? two.error)!} />;
  if (!one.detail || !two.detail) return <Loading />;
  const a = one.detail, b = two.detail;
  const clash = a.body && b.body && a.body.id !== b.body.id;

  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const answer = String(new FormData(e.currentTarget).get('answer') ?? '');
    if (answer !== 'same' && answer !== 'different') {
      setErrors([{ text: 'Say whether they are the same body', href: '#merge-answer' }]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      if (answer === 'same') await api.mergePersonas(id, other);
      else await api.notSamePersona(id, other);
      void navigate(`/personas/${id}`);
    } catch (err) {
      setErrors([{ text: (err as Error).message, href: '#merge-answer' }]);
      setBusy(false);
    }
  }

  const papers = (d: PersonaDossier) => {
    const titles = [...new Set(d.observations.filter((o) => o.kind === 'assessment').map((o) => o.analysisTitle ?? 'A paper no longer here'))];
    return titles.length ? titles.join('; ') : 'None';
  };
  const column = (d: PersonaDossier) => [
    { key: 'Name', value: d.persona.name },
    { key: 'Also called', value: d.persona.aliases.length ? d.persona.aliases.join(', ') : 'Nothing else' },
    { key: 'GOV.UK body', value: d.body ? d.body.name : 'Not matched' },
    { key: 'Kind', value: d.persona.entityType.replaceAll('_', ' ') || 'Not recorded' },
    { key: 'Papers', value: papers(d) },
  ];

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {errors.length ? <ErrorSummary errors={errors} /> : null}
        <span className="govuk-caption-l">Combine two records</span>
        <h1 className="govuk-heading-l">Are these the same body?</h1>
        <h2 className="govuk-heading-m">{a.persona.name}</h2>
        <SummaryList rows={column(a)} />
        <h2 className="govuk-heading-m">{b.persona.name}</h2>
        <SummaryList rows={column(b)} />
        {a.readOnly ? <ReadOnly id={id} /> : clash ? (
          <WarningText>
            These are two different bodies on GOV.UK, so they cannot be combined. If one of them is
            linked to the wrong body, <Link className="govuk-link" to={`/personas/${other}/register`}>change that first</Link>.
          </WarningText>
        ) : (
          <form onSubmit={(e) => void decide(e)} noValidate>
            <Radios
              id="merge-answer"
              name="answer"
              legend="Are they the same body?"
              legendSize="m"
              error={errors[0]?.text}
              items={[
                { value: 'same', text: `Yes — combine them into one record called ${a.persona.name}` },
                { value: 'different', text: 'No — they are different bodies, stop suggesting them' },
              ]}
            />
            <p className="govuk-body">
              Combining moves everything recorded about {b.persona.name} to {a.persona.name}, and the
              library rebuilds what it holds from both. It cannot be undone, but one paper can be
              separated again later.
            </p>
            <ButtonGroup>
              <Button type="submit" disabled={busy}>Save</Button>
              <Link className="govuk-link" to={`/personas/${id}`}>Cancel</Link>
            </ButtonGroup>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// This paper meant a different body
// ---------------------------------------------------------------------------

export function PersonaSplit() {
  const { id = '', observationId = '' } = useParams();
  const navigate = useNavigate();
  const { detail, error } = useDossier(id);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePageTitle('Did this paper mean a different body?');

  if (error) return <Problem message={error} />;
  if (!detail) return <Loading />;
  const sighting = detail.observations.find((o) => o.id === observationId && o.kind === 'assessment');
  if (!sighting) return <Problem message="That paper is no longer part of this record." />;
  const title = sighting.analysisTitle ?? 'This paper';

  async function split() {
    setBusy(true);
    setProblem(null);
    try {
      const { id: created } = await api.splitSighting(id, observationId);
      void navigate(`/personas/${created}`);
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {problem ? <ErrorSummary errors={[{ text: problem, href: '#split-confirm' }]} /> : null}
        <span className="govuk-caption-l">{detail.persona.name}</span>
        <h1 className="govuk-heading-l">Did this paper mean a different body?</h1>
        <p className="govuk-body">
          The library linked what <strong>{title}</strong> said to {detail.persona.name}. If that
          paper meant a different body, the library will move it to a record of its own.
        </p>
        {sighting.traits.length ? (
          <SummaryList rows={sighting.traits.map((t) => ({ key: t.label, value: t.value }))} />
        ) : null}
        <p className="govuk-body">
          After this, the library will not link that paper’s name for the body to{' '}
          {detail.persona.name} again.
        </p>
        {detail.readOnly ? <ReadOnly id={id} /> : (
          <ButtonGroup>
            <Button id="split-confirm" disabled={busy} onClick={() => void split()}>
              Yes, move it to its own record
            </Button>
            <Link className="govuk-link" to={`/personas/${id}`}>No, go back</Link>
          </ButtonGroup>
        )}
      </div>
    </div>
  );
}
