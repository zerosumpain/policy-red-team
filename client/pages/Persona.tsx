import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { dossier, type Sighting } from '$lib/persona-view';
import type { PaperAsks } from '$lib/policy-analysis/intel';
import { api, type BodyFacts, type BodyIntel, type PersonaDossier, type RegisterEntryView } from '../api';
import { Button, ButtonGroup, Details, InsetText, SummaryList, Table, WarningText } from '../govuk';
import { selectionParam } from '../report/selection';
import { BandMark } from '../BandMark';
import { usePageTitle } from '../layout/Template';
import { viewPath } from '../moves';
import { bodyPath, hubPath, seenIn } from '../places';
import { AskGroups, longDate, PublicRecord, WhereItSits } from './PersonaIntel';
import { ListBreadcrumb, ListPlace } from './ListPlace';

/**
 * ONE BODY, ACROSS EVERY PAPER THAT NAMED IT — IN THREE BANDS (phase 24).
 *
 *   WHAT THE REGISTER SAYS      fact      GOV.UK's list: who it officially is, where it sits
 *   WHAT PAPERS ASK OF IT       context   paper by paper, once each, then across them
 *   WHAT PUBLIC RECORDS SHOW    evidence  dated documents, and enquiries you commissioned
 *
 * The page used to interleave the three — register facts, then the public
 * record's capacity, then the library's folded traits, then each paper's asks
 * in one place and each paper's sightings in another — and explain in prose
 * which paragraph was which kind of thing. A reader cannot hold that while
 * reading. Each band now says once what kind of thing it holds, and "what each
 * paper asks of it" and "where it has been seen" are one walk over the papers.
 *
 * A PERSONA IS CONTEXT, NEVER EVIDENCE (AGENTS.md). It was drawn from other
 * papers about other policies, and importing its conclusions into the
 * assessment in front of you is the opposite of a red team — so the warning
 * sits at the head of the band it governs, not at the head of a page that also
 * holds the one band that IS evidence.
 *
 * It is also the most sensitive thing this install holds — cross-assessment
 * intelligence by construction — which is why `persona_link` artefacts are
 * withheld from anything that leaves (docs/phase-10.md) and why this page has
 * no shareable form.
 */
export function Persona() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PersonaDossier | null>(null);
  const [intel, setIntel] = useState<BodyIntel | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);
  /** Its place on the master list (phase 24b). Null until read, or on a server without the list. */
  const [place, setPlace] = useState<RegisterEntryView | null>(null);
  /** The page could not be loaded. This one is allowed to replace the page. */
  const [error, setError] = useState<string | null>(null);
  /**
   * An ACTION failed, which is a different thing: a 429 on "look this body up"
   * must not unmount the record, and a paid-for enquiry followed by a failing
   * refresh must not lose the outcome just earned.
   */
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'research' | 'forget'>(null);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState('');

  const load = useCallback(async () => {
    try {
      setDetail(await api.persona(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);
  const loadIntel = useCallback(async () => {
    setIntel(await api.personaIntel(id));
    setIntelError(null);
  }, [id]);

  useEffect(() => {
    let live = true;
    setError(null);
    setDetail(null);
    setIntel(null);
    setIntelError(null);
    setOutcome('');
    setActionError(null);
    setBusy(null);
    setConfirming(false);
    api.persona(id)
      .then((data) => { if (live) { setDetail(data); setError(null); } })
      .catch((err: Error) => { if (live) setError(err.message); });
    api.personaIntel(id)
      .then((data) => { if (live) setIntel(data); })
      .catch((err: Error) => { if (live) setIntelError(err.message); });
    // A courtesy: the page stands without it, so a failure draws nothing.
    setPlace(null);
    api.registerEntry(id)
      .then((data) => { if (live) setPlace(data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [id]);

  usePageTitle(detail?.persona.name);

  if (error) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full" role="alert">
          <h1 className="govuk-heading-l">There is a problem</h1>
          <p className="govuk-body">{error}</p>
          <p className="govuk-body">
            <Link className="govuk-link" to={hubPath('')}>Go back to bodies across policies</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <h1 className="govuk-heading-l">Loading this body’s record</h1>
          <p className="govuk-body">Gathering every paper that named it.</p>
        </div>
      </div>
    );
  }

  const { persona, analyses, readOnly } = detail;
  const view = dossier(detail.observations);
  const known = (analysisId: string | null) => analyses.some((a) => a.id === analysisId);
  /*
   * WHICH ACTOR THIS BODY IS, IN THE ASSESSMENT IT WAS SEEN IN.
   *
   * `dossier()` drops `actorId` on the way from an observation to a
   * `Sighting`, and it is the one thing that lets a link land on the body the
   * reader came asking about. Read back off the raw observations by id.
   */
  const actorOf = new Map(detail.observations.map((o) => [o.id, o.actorId]));

  /**
   * A link into an assessment, landing on "Who is involved" with this body
   * selected — the phase 21 page, not the `?move=actors` query the report
   * stopped reading in phase 21 and only answers through a redirect.
   * `selectionParam` rather than a hand-written `actor:` prefix, so the
   * producer and `parseSelection` cannot drift.
   */
  const intoAssessment = (analysisId: string, observationId: string) => {
    const actorId = actorOf.get(observationId) ?? null;
    const sel = actorId ? selectionParam({ kind: 'actor', id: actorId, label: '' }) : null;
    return viewPath(analysisId, 'actors', undefined, sel ? new URLSearchParams({ sel }).toString() : undefined);
  };

  async function research() {
    setBusy('research');
    setActionError(null);
    // Announced at the START, into a region already on the page: the button
    // takes `disabled` and loses focus, so this is the only signal it began.
    setOutcome('Reading public sources. This takes a little while.');
    try {
      const result = await api.researchPersona(id);
      setOutcome(
        `Read ${result.sources} public ${result.sources === 1 ? 'source' : 'sources'} and recorded ${result.traits} ${result.traits === 1 ? 'trait' : 'traits'}.`,
      );
      await load();
    } catch (err) {
      setOutcome('');
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function forget() {
    setBusy('forget');
    setActionError(null);
    try {
      await api.forgetPersona(id);
      void navigate(hubPath(''));
    } catch (err) {
      setActionError((err as Error).message);
      setBusy(null);
    }
  }

  /*
   * THE PAPERS, WALKED ONCE. A sighting is one observation; a paper is one
   * document, and two runs of one file are one paper here as everywhere
   * (AGENTS.md). Grouped by `paper` — the document's hash — keeping the order
   * `dossier()` gave, newest first. What the paper's map asks of the body
   * (`intel.papers`, register bodies only) is joined on any of the paper's runs.
   */
  const papers: { key: string; sightings: Sighting[] }[] = [];
  for (const sighting of view.sightings) {
    const held = papers.find((p) => p.key === sighting.paper);
    if (held) held.sightings.push(sighting);
    else papers.push({ key: sighting.paper, sightings: [sighting] });
  }
  const asksFor = (group: Sighting[]): PaperAsks | null =>
    intel?.papers.find((p) => group.some((s) => s.analysisId === p.paper.id)) ?? null;
  const totalAsks = intel?.papers.reduce((n, p) => n + p.asks.filter((a) => a.kind === 'duty').length, 0) ?? 0;
  const clashes = intel?.clashes.length ?? 0;

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <span className="govuk-caption-l">Body</span>
          <h1 className="govuk-heading-l">{persona.name}</h1>
          {place ? <ListBreadcrumb place={place} /> : null}
          <p className="govuk-body-s prt-meta">
            {persona.entityType.replaceAll('_', ' ') || 'kind not recorded'} · {seenIn(persona.sightings)}
            {persona.aliases.length ? ` · also as ${persona.aliases.join(', ')}` : ''}
          </p>
          {/* THE THREE BANDS, NAMED BEFORE THEY START, so a reader looking
              for evidence knows it is the third and not the first. */}
          <nav aria-label="On this page" className="prt-onpage">
            <ol className="govuk-list prt-onpage__list">
              <li><a className="govuk-link" href="#band-register">What the register says</a> <span className="prt-meta">— fact</span></li>
              {place ? <li><a className="govuk-link" href="#band-list">Where it sits on your master list</a> <span className="prt-meta">— your record</span></li> : null}
              <li><a className="govuk-link" href="#band-papers">What papers ask of it</a> <span className="prt-meta">— context</span></li>
              <li><a className="govuk-link" href="#band-record">What public records show</a> <span className="prt-meta">— evidence</span></li>
              <li><a className="govuk-link" href="#band-record-right">Is this the right record?</a></li>
            </ol>
          </nav>
        </div>
      </div>

      {/* ── 1. FACT ─────────────────────────────────────────────────────── */}
      <Band id="band-register" kind="fact" title="What the register says"
            lead="From GOV.UK’s list of organisations: who this body officially is, and where it sits. Not drawn from any paper.">
        {detail.body ? <RegisterFacts body={detail.body} /> : (
          <p className="govuk-body">
            This body has not been matched to GOV.UK’s list. Not every body is on it: councils,
            charities, companies and Parliament’s own offices are not.
          </p>
        )}
        {detail.notBody.length ? (
          <p className="govuk-body-s prt-meta">You said it is not: {detail.notBody.map((b) => b.name).join(', ')}.</p>
        ) : null}
        {!readOnly ? (
          <p className="govuk-body">
            <Link className="govuk-link" to={bodyPath(id, 'register')}>
              {detail.body ? 'This is the wrong body' : 'Find it on the list'}
              <span className="govuk-visually-hidden"> for {persona.name}</span>
            </Link>
          </p>
        ) : null}
        {intel ? <WhereItSits intel={intel} /> : null}
      </Band>

      {/* ── YOUR RECORD: the master list (phase 24b) ─────────────────────── */}
      {place ? <ListPlace place={place} /> : null}

      {/* ── 2. CONTEXT ──────────────────────────────────────────────────── */}
      <Band id="band-papers" kind="context" title={`What papers ask of it — ${papers.length}`}
            lead="What each paper you assessed asked of this body and found it could do, newest first. Read from each paper’s own map of who does what.">
        <WarningText>
          This is context, not evidence. It records how other papers described this body — not
          what is true of it, and not a finding about the assessment you came from.
        </WarningText>
        {persona.summary ? <p className="govuk-body-l">{persona.summary}</p> : null}
        {intelError ? <p className="govuk-body govuk-error-message" role="alert">{intelError}</p> : null}
        {intel && intel.papers.length ? (
          <p className="govuk-body">
            Across {intel.papers.length} {intel.papers.length === 1 ? 'paper' : 'papers'} it is asked
            to do {totalAsks} {totalAsks === 1 ? 'thing' : 'things'}. No paper counts what the others ask.
          </p>
        ) : null}

        {papers.map(({ key, sightings }) => {
          const first = sightings[0];
          const asks = asksFor(sightings);
          const plays = sightings.flatMap((s) => s.plays);
          const worst = [...plays].sort((a, b) => rank(a.band) - rank(b.band) || b.exposure - a.exposure)[0]?.band ?? null;
          return (
            <div key={key} className="prt-paperwalk">
              <h3 className="govuk-heading-m govuk-!-margin-bottom-1">
                {first.analysisId && known(first.analysisId)
                  ? <Link className="govuk-link" to={intoAssessment(first.analysisId, first.id)}>{first.title}</Link>
                  : first.title}
              </h3>
              <p className="govuk-body-s prt-meta">
                {first.observedAt ? `Assessed ${longDate(first.observedAt)}` : 'Date not recorded'}
                {sightings.length > 1 ? ` · ${sightings.length} runs of this paper` : ''}
                {' · '}{plays.length} {plays.length === 1 ? 'way to beat it' : 'ways to beat it'} found
                {worst ? <> · worst <BandMark band={worst.toLowerCase()} /></> : null}
              </p>
              {asks ? <AskGroups paperId={asks.paper.id} asks={asks.asks} /> : null}
              {sightings.map((sighting) => (
                <div key={sighting.id}>
                  {sighting.note ? <p className="govuk-body">{sighting.note}</p> : null}
                  {sighting.traits.length ? (
                    <Details summary={`What ${sightings.length > 1 ? 'this run' : 'this paper'} said about it`}>
                      <SummaryList
                        noBorder
                        rows={sighting.traits.map((trait) => ({ key: trait.label, value: trait.value }))}
                      />
                    </Details>
                  ) : null}
                  {/* THE SPLIT, for a paper that meant a different body. Only
                      where there is something to split it from. */}
                  {!readOnly && view.sightings.length > 1 ? (
                    <p className="govuk-body-s">
                      <Link className="govuk-link" to={bodyPath(id, `sightings/${sighting.id}`)}>
                        This paper meant a different body
                        <span className="govuk-visually-hidden"> ({sighting.title})</span>
                      </Link>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}

        {/* ACROSS THE PAPERS, after each has been read: where they agree or
            disagree, every way to beat a policy found for this body, and what
            is kept when the papers are folded together. */}
        {view.contested.length ? (
          <>
            <h3 className="govuk-heading-m">Where the papers disagree — {view.contested.length}</h3>
            <p className="govuk-body">
              The same thing, described differently in different papers. Compared on the wording, so
              two ways of saying one thing will show up here — an invitation to look, not a
              contradiction found.
            </p>
            {view.contested.map((row) => (
              <div key={row.key} className="govuk-!-margin-bottom-4">
                <h4 className="govuk-heading-s">{row.label}</h4>
                <ul className="govuk-list govuk-list--bullet">
                  {row.readings.map((reading) => (
                    <li key={reading.value}>
                      {reading.value}{' '}
                      <span className="prt-meta">— {reading.where.join(', ')} · {reading.origin.replaceAll('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : view.agreed.length ? (
          /* AGREEMENT IS A POSITIVE CLAIM and needs positive evidence: two
             papers recording disjoint traits is not agreement. */
          <>
            <h3 className="govuk-heading-m">Where the papers agree — {view.agreed.length}</h3>
            <SummaryList
              rows={view.agreed.map((row) => ({
                key: row.label,
                value: <>{row.value}<br /><span className="prt-meta">{row.where.join(', ')}</span></>,
              }))}
            />
          </>
        ) : null}

        {view.plays.length ? (
          <>
            <h3 className="govuk-heading-m">Ways it has been found to beat a policy — {view.plays.length}</h3>
            <p className="govuk-body">
              Across every paper, worst first. A way to beat one policy is not a way to beat another;
              this is what has been attributed to this body, and which paper attributed it.
            </p>
            <Table className="prt-table prt-table--zebra" firstCellIsHeader
              caption="Ranked across every assessment that profiled it"
              captionSize="s"
              scroll
              columns={[{ header: 'Way to beat it' }, { header: 'How exposed' }, { header: 'Score', numeric: true }, { header: 'Legality' }, { header: 'Found in' }]}
              rows={view.plays.slice(0, 20).map((play, i) => [
                play.label,
                <BandMark key={`b${i}`} band={play.band} />,
                play.exposure.toFixed(2),
                play.legality || '—',
                /* THE LINK IS TO THE ASSESSMENT, NEVER TO THE PLAY: an
                   observation's plays carry no id, and inventing one would be
                   a fabricated link. */
                play.analysisId && known(play.analysisId)
                  ? <Link key={`l${i}`} className="govuk-link" to={`/assessments/${play.analysisId}`}>{play.from}</Link>
                  : play.from,
              ])}
            />
            {view.plays.length > 20 ? <p className="govuk-body-s prt-meta">Showing the worst 20 of {view.plays.length}.</p> : null}
          </>
        ) : null}

        {persona.dossier.length ? (
          <>
            <h3 className="govuk-heading-m">What is kept across the papers</h3>
            <p className="govuk-body">
              What the papers said about this body, folded together, keeping only what is true of the
              body whichever paper said it — not one paper’s budget or deadline.
            </p>
            <SummaryList
              rows={persona.dossier.map((trait) => ({
                key: trait.label,
                value: <>{trait.value}<br /><span className="prt-meta">{trait.origin.replaceAll('_', ' ')}</span></>,
              }))}
            />
          </>
        ) : null}

        {/* THE CLASHES ARE DRAWN ON ONE PAGE, the hub's. Here: how many, and
            the way to them, already narrowed to this body. */}
        {intel?.body && clashes ? (
          <p className="govuk-body">
            Two papers pull this body in opposite directions {clashes === 1 ? 'once' : `${clashes} times`}.{' '}
            <Link className="govuk-link" to={hubPath('clashes', new URLSearchParams({ body: intel.body.id }).toString())}>
              See {clashes === 1 ? 'the clash' : 'the clashes'}
            </Link>
          </p>
        ) : null}
      </Band>

      {/* ── 3. EVIDENCE ─────────────────────────────────────────────────── */}
      <Band id="band-record" kind="evidence" title="What public records show"
            lead="Published, dated documents about the body — not about any paper — and public sources read on your instruction.">
        {intelError ? <p className="govuk-body govuk-error-message" role="alert">{intelError}</p>
          : intel ? <PublicRecord personaId={id} name={persona.name} intel={intel} readOnly={readOnly} onChecked={loadIntel} />
            : <p className="govuk-body">Loading the public record…</p>}

        <h3 className="govuk-heading-m" id="persona-research">Enquiries you commissioned — {view.research.length}</h3>
        <p className="govuk-body">
          Public sources, read on your instruction and kept apart from what the assessments said. Not
          part of any run: researching every body of every paper would spend on bodies nobody asked
          about.
        </p>
        {/* IN THE DOM FROM FIRST RENDER. A live region inserted together with
            its content is not reliably announced. */}
        <p className="govuk-body" role="status" aria-live="polite">{outcome}</p>
        {actionError ? <p className="govuk-body govuk-error-message" role="alert">{actionError}</p> : null}
        {view.research.map((note) => (
          <div key={note.id} className="govuk-!-margin-bottom-4">
            <h4 className="govuk-heading-s">{note.observedAt ? longDate(note.observedAt) : 'Date not recorded'}</h4>
            {note.note ? <p className="govuk-body">{note.note}</p> : null}
            {note.traits.length ? <SummaryList noBorder rows={note.traits.map((t) => ({ key: t.label, value: t.value }))} /> : null}
            {note.sources.length ? (
              <ul className="govuk-list govuk-list--bullet">
                {note.sources.map((source) => (
                  <li key={source.url}>
                    <a className="govuk-link" href={source.url} rel="noreferrer noopener external" target="_blank">
                      {source.title || source.url} (opens in a new tab)
                    </a>{' '}
                    <span className="prt-meta">{source.quality}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {!view.research.length ? <p className="govuk-body">None yet.</p> : null}
        {readOnly ? (
          <InsetText>This copy is read-only, so nothing can be commissioned from it.</InsetText>
        ) : (
          <>
            {/* IT SPENDS. Said plainly next to the button. */}
            <p className="govuk-body-s prt-meta" id="persona-research-cost">
              This makes two model calls and a few searches, so it costs a little. It asks about
              statutory powers, capacity and track record — never about individuals. An enquiry is
              refused outright for a body profiled from a sealed or purged paper, because the check
              that stops a query quoting that paper cannot run.
            </p>
            <ButtonGroup>
              <Button disabled={busy !== null} onClick={() => void research()} aria-describedby="persona-research-cost">
                {busy === 'research' ? 'Reading public sources…' : 'Look this body up'}
              </Button>
            </ButtonGroup>
          </>
        )}
      </Band>

      {/* ── WHO IT IS: the reader's own rulings ─────────────────────────── */}
      <section aria-labelledby="band-record-right" className="prt-kindband">
        <h2 className="govuk-heading-l" id="band-record-right">Is this the right record?</h2>
        {detail.suggestions.length ? (
          <>
            <p className="govuk-body">These may be {persona.name} recorded twice:</p>
            <ul className="govuk-list govuk-list--bullet">
              {detail.suggestions.map((s) => (
                <li key={s.id}>
                  {readOnly ? s.name : (
                    <Link className="govuk-link" to={bodyPath(id, `merge/${s.id}`)}>Compare with {s.name}</Link>
                  )}{' '}
                  <span className="prt-meta">— {s.reason}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="govuk-body">No other record looks like this one.</p>
        )}
        {detail.notSameAs.length ? (
          <p className="govuk-body-s prt-meta">You said it is not the same as: {detail.notSameAs.map((n) => n.name).join(', ')}.</p>
        ) : null}
        {!readOnly ? (
          <p className="govuk-body">
            <Link className="govuk-link" to={bodyPath(id, 'merge')}>Combine it with another record</Link>
          </p>
        ) : null}

        {!readOnly ? (
          <>
            <h3 className="govuk-heading-m" id="persona-forget">Forget this body</h3>
            <p className="govuk-body" id="persona-forget-what">
              Removes everything recorded about it here. The assessments themselves are untouched — it
              will be recognised again the next time a paper names it, starting from nothing.
            </p>
            {confirming ? (
              <>
                <WarningText>
                  This cannot be undone. Everything recorded about {persona.name} — across{' '}
                  {persona.sightings} {persona.sightings === 1 ? 'paper' : 'papers'} — goes.
                </WarningText>
                <ButtonGroup>
                  <Button variant="warning" disabled={busy !== null} onClick={() => void forget()}>
                    {busy === 'forget' ? 'Forgetting…' : `Yes, forget ${persona.name}`}
                  </Button>
                  <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </ButtonGroup>
              </>
            ) : (
              /* A CONFIRMATION STEP: one click destroyed a record built
                 across several papers with nothing to bring it back. */
              <ButtonGroup>
                <Button variant="warning" disabled={busy !== null} onClick={() => setConfirming(true)}
                        aria-describedby="persona-forget-what">
                  Forget it
                </Button>
              </ButtonGroup>
            )}
          </>
        ) : null}
      </section>
    </>
  );
}

const BANDS = ['severe', 'significant', 'moderate', 'limited'];
const rank = (band: string) => { const i = BANDS.indexOf(String(band).toLowerCase()); return i < 0 ? BANDS.length : i; };

/**
 * One of the page's three bands: a heading, the kind of thing it holds said in
 * a word (fact, context, evidence) and a sentence, then its contents. The word
 * is text, not a colour, so it survives print, high contrast and a screen reader.
 */
function Band({ id, kind, title, lead, children }: {
  id: string;
  kind: 'fact' | 'context' | 'evidence';
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const word = { fact: 'Fact', context: 'Context', evidence: 'Evidence' }[kind];
  return (
    <section aria-labelledby={id} className={`prt-kindband prt-kindband--${kind}`}>
      <span className="govuk-caption-m">{word}</span>
      <h2 className="govuk-heading-l" id={id}>{title}</h2>
      <p className="govuk-body">{lead}</p>
      {children}
    </section>
  );
}

/**
 * What GOV.UK says about the body, in plain words. "Executive non-departmental
 * public body" is spelled out, a closed body says why and what replaced it, and
 * the parent department is named. The licence line is the attribution the Open
 * Government Licence asks for.
 */
function RegisterFacts({ body }: { body: BodyFacts }) {
  const date = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso))
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null);
  const closed = [
    body.closedBecause,
    date(body.closedOn) ? `Closed on ${date(body.closedOn)}.` : null,
    body.replacedBy.length ? `Replaced by ${body.replacedBy.map((b) => b.name).join(' and ')}.` : null,
  ].filter(Boolean).join(' ');
  return (
    <>
      <SummaryList
        rows={[
          { key: 'Official name', value: `${body.name}${body.acronym ? ` (${body.acronym})` : ''}` },
          { key: 'What kind of body', value: body.kind ? `${body.kind}${body.kindMeans ? ` — ${body.kindMeans}` : ''}` : 'Not given' },
          { key: 'Status', value: body.open ? body.status : <>{body.status}. {closed}</> },
          ...(body.url ? [{
            key: 'GOV.UK page',
            value: (
              <a className="govuk-link" href={body.url} rel="noreferrer noopener external" target="_blank">
                {body.name} on GOV.UK (opens in a new tab)
              </a>
            ),
          }] : []),
        ]}
      />
      <p className="govuk-body-s prt-meta">
        From the GOV.UK list of organisations. Contains public sector information licensed under the
        Open Government Licence v3.0.
      </p>
    </>
  );
}
