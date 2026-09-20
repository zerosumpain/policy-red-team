import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { dossier } from '$lib/persona-view';
import { api, type PersonaDossier } from '../api';
import { Button, ButtonGroup, Details, InsetText, SummaryList, Table, WarningText } from '../govuk';
import { selectionParam } from '../report/selection';
import { BandMark } from '../BandMark';
import { usePageTitle } from '../layout/Template';

/**
 * ONE BODY, ACROSS EVERY PAPER THAT NAMED IT.
 *
 * A PERSONA IS CONTEXT, NEVER EVIDENCE. It was drawn from other papers about
 * other policies, and importing its conclusions into the assessment in front of
 * you is the opposite of a red team — the rule `personas.ts` is built on, and
 * the reason nothing on this page is allowed to read like a finding.
 *
 * WHAT ONLY THIS PAGE CAN ANSWER is what changed. A dossier on a body met once
 * is a profile with extra steps; the assessment it came from says the same
 * thing and says it in context. A body met twice, described differently, is a
 * finding about the PAPERS — and that is what leads.
 *
 * It is also the most sensitive thing this install holds. A dossier is
 * cross-assessment intelligence by construction, which is why `persona_link`
 * artefacts are withheld from anything that leaves (see docs/phase-10.md) and
 * why this page has no shareable form.
 */
export function Persona() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PersonaDossier | null>(null);
  /** The page could not be loaded. This one is allowed to replace the page. */
  const [error, setError] = useState<string | null>(null);
  /**
   * An ACTION failed, which is a different thing and used to share the state
   * above — so a 429 on "look this body up" unmounted the dossier, the play
   * table and the research section, leaving the reader with nothing but a link
   * back to the library. Worse, a successful paid-for enquiry followed by a
   * failing refresh showed the error page and lost the outcome just earned.
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

  useEffect(() => {
    let live = true;
    setError(null);
    setDetail(null);
    setOutcome('');
    setActionError(null);
    setBusy(null);
    setConfirming(false);
    api.persona(id)
      .then((data) => { if (live) { setDetail(data); setError(null); } })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [id]);

  usePageTitle(detail?.persona.name);

  if (error) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds" role="alert">
          <h1 className="govuk-heading-l">There is a problem</h1>
          <p className="govuk-body">{error}</p>
          <p className="govuk-body">
            <Link className="govuk-link" to="/personas">Go back to the library</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">Loading this body's record</h1>
          <p className="govuk-body">Gathering every paper that named it.</p>
        </div>
      </div>
    );
  }

  const { persona, analyses, readOnly } = detail;
  const view = dossier(detail.observations);
  const titleOf = (analysisId: string | null) => analyses.find((a) => a.id === analysisId);
  /*
   * WHICH ACTOR THIS BODY IS, IN THE ASSESSMENT IT WAS SEEN IN.
   *
   * `dossier()` drops `actorId` on the way from an observation to a `Sighting`,
   * and that is the one thing the library uniquely knows: the reader arrived
   * asking about one body. Read back off the raw observations by id rather than
   * by widening the view module, which is a change of its own.
   */
  const actorOf = new Map(detail.observations.map((o) => [o.id, o.actorId]));

  /**
   * A link into an assessment, landing on the body the reader came in asking
   * about.
   *
   * Both links out of this page were bare `/assessments/:id`, so a reader who
   * had just read that Universities is credited with a severe play in the
   * Post-16 paper arrived at the top of Move 1, showing everything, with 47
   * plays and 12 bodies in front of them and no trace of the body they came for.
   *
   * `selectionParam` rather than a hand-written `actor:` prefix, so the producer
   * and `parseSelection` cannot drift — and `parseSelection` checks the KIND as
   * well as the id, so an id that is no longer an actor in that run resolves to
   * nothing rather than to a label that lies.
   */
  const intoAssessment = (analysisId: string | null, observationId: string) => {
    const actorId = actorOf.get(observationId) ?? null;
    if (!actorId) return `/assessments/${analysisId}`;
    const sel = selectionParam({ kind: 'actor', id: actorId, label: '' });
    return `/assessments/${analysisId}?move=actors${sel ? `&sel=${encodeURIComponent(sel)}` : ''}`;
  };

  async function research() {
    setBusy('research');
    setActionError(null);
    // Announced at the START, into a region that was already on the page. The
    // button takes `disabled` and therefore loses focus, so for a half-minute
    // action this is the only thing that tells a screen-reader user it began.
    setOutcome('Reading public sources. This takes a little while.');
    try {
      const result = await api.researchPersona(id);
      // NO "nothing came back" BRANCH: `researchPersona` throws when it
      // retrieves nothing, so that branch was unreachable — and it promised a
      // record of the enquiry that is never written.
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
      void navigate('/personas');
    } catch (err) {
      setActionError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <span className="govuk-caption-l">Persona</span>
          <h1 className="govuk-heading-l">{persona.name}</h1>
          <p className="govuk-body-s prt-meta">
            {persona.entityType.replaceAll('_', ' ') || 'kind not recorded'} · seen in {persona.sightings}{' '}
            {persona.sightings === 1 ? 'paper' : 'papers'}
            {persona.aliases.length ? ` · also as ${persona.aliases.join(', ')}` : ''}
          </p>
          {persona.summary ? <p className="govuk-body-l">{persona.summary}</p> : null}

          <WarningText>
            This is context, not evidence. It records how other papers described this body — not
            what is true of it, and not a finding about the assessment you came from.
          </WarningText>
        </div>
      </div>

      {/* WHAT ONLY A LIBRARY CAN SAY, and therefore what leads. */}
      {view.contested.length ? (
        <section aria-labelledby="persona-contested">
          <h2 className="govuk-heading-m" id="persona-contested">
            Where the papers disagree — {view.contested.length}
          </h2>
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <p className="govuk-body">
                The same thing, described differently in different papers. Compared on the wording,
                so two ways of saying one thing will show up here — this is an invitation to look,
                not a contradiction found.
              </p>
              {view.contested.map((row) => (
                <div key={row.key} className="govuk-!-margin-bottom-4">
                  <h3 className="govuk-heading-s">{row.label}</h3>
                  <ul className="govuk-list govuk-list--bullet">
                    {row.readings.map((reading) => (
                      <li key={reading.value}>
                        {reading.value}{' '}
                        <span className="prt-meta">
                          — {reading.where.join(', ')} · {reading.origin.replaceAll('_', ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : view.agreed.length ? (
        /* AGREEMENT IS A POSITIVE CLAIM and needs positive evidence. This used
           to show whenever nothing was contested — which covers papers that
           recorded DISJOINT traits and papers that recorded none, neither of
           which is agreement. */
        <section aria-labelledby="persona-agreed">
          <h2 className="govuk-heading-m" id="persona-agreed">
            Where the papers agree — {view.agreed.length}
          </h2>
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <p className="govuk-body">
                Recorded by more than one paper, described the same way in each. The case where a
                dossier adds confidence rather than a question.
              </p>
              <SummaryList
                rows={view.agreed.map((row) => ({
                  key: row.label,
                  value: (
                    <>
                      {row.value}
                      <br />
                      <span className="prt-meta">{row.where.join(', ')}</span>
                    </>
                  ),
                }))}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="persona-dossier">
        <h2 className="govuk-heading-m" id="persona-dossier">What the library holds</h2>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            {persona.dossier.length ? (
              <SummaryList
                rows={persona.dossier.map((trait) => ({
                  key: trait.label,
                  value: (
                    <>
                      {trait.value}
                      <br />
                      <span className="prt-meta">{trait.origin.replaceAll('_', ' ')}</span>
                    </>
                  ),
                }))}
              />
            ) : (
              <p className="govuk-body">
                Nothing folded yet. Traits accumulate as assessments profile this body.
              </p>
            )}
          </div>
        </div>
      </section>

      {view.plays.length ? (
        <section aria-labelledby="persona-plays">
          <h2 className="govuk-heading-m" id="persona-plays">
            What it has been found able to run — {view.plays.length}
          </h2>
          <p className="govuk-body">
            Across every paper, worst first. A play found in one policy is not a play available in
            another; this is a record of what has been attributed to this body, and the paper that
            attributed it.
          </p>
          <Table
            caption="Ranked across every assessment that profiled it"
            captionSize="s"
            scroll
            columns={[{ header: 'Play' }, { header: 'Band' }, { header: 'Exposure', numeric: true }, { header: 'Legality' }, { header: 'Found in' }]}
            rows={view.plays.slice(0, 20).map((play, i) => [
              play.label,
              <BandMark key={`b${i}`} band={play.band} />,
              play.exposure.toFixed(2),
              play.legality || '—',
              /* THE LINK IS TO THE ASSESSMENT, NEVER TO THE PLAY.
                 `PersonaObservation.plays[]` is `{ label, band, exposure,
                 legality }` and carries no id, so a play-level URL cannot be
                 built from this payload and inventing one would be a fabricated
                 link. And it is a bare assessment URL here rather than a deep
                 one: `view.plays` is flattened across every sighting, so the
                 row does not know which observation contributed it. */
              titleOf(play.analysisId)
                ? <Link key={`l${i}`} className="govuk-link" to={`/assessments/${play.analysisId}`}>{play.from}</Link>
                : play.from,
            ])}
          />
          {view.plays.length > 20 ? (
            <p className="govuk-body-s prt-meta">Showing the worst 20 of {view.plays.length}.</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="persona-sightings">
        <h2 className="govuk-heading-m" id="persona-sightings">
          Where it has been seen — {view.sightings.length}
        </h2>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            {view.sightings.map((sighting) => (
              <div key={sighting.id} className="govuk-!-margin-bottom-4">
                <h3 className="govuk-heading-s">
                  {titleOf(sighting.analysisId) ? (
                    <Link className="govuk-link" to={intoAssessment(sighting.analysisId, sighting.id)}>
                      {sighting.title}
                    </Link>
                  ) : (
                    sighting.title
                  )}
                </h3>
                <p className="govuk-body-s prt-meta">
                  {sighting.observedAt
                    ? new Date(sighting.observedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Date not recorded'}
                  {sighting.traits.length ? ` · ${sighting.traits.length} ${sighting.traits.length === 1 ? 'trait' : 'traits'}` : ''}
                  {sighting.plays.length ? ` · ${sighting.plays.length} ${sighting.plays.length === 1 ? 'play' : 'plays'}` : ''}
                </p>
                {sighting.note ? <p className="govuk-body">{sighting.note}</p> : null}
                {sighting.traits.length ? (
                  <Details summary="What this paper said about it">
                    <SummaryList
                      noBorder
                      rows={sighting.traits.map((trait) => ({ key: trait.label, value: trait.value }))}
                    />
                  </Details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="persona-research">
        <h2 className="govuk-heading-m" id="persona-research">Enquiries you commissioned — {view.research.length}</h2>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <p className="govuk-body">
              Public sources, read on your instruction and kept apart from what the assessments
              said. Not part of any run: researching every body of every paper would spend on
              bodies nobody asked about.
            </p>
            {/* IN THE DOM FROM FIRST RENDER. A live region inserted together
                with its content is not reliably announced — the thing that has
                to change is the text inside a region that was already there. */}
            <p className="govuk-body" role="status" aria-live="polite">{outcome}</p>
            {actionError ? (
              <p className="govuk-body govuk-error-message" role="alert">{actionError}</p>
            ) : null}

            {view.research.map((note) => (
              <div key={note.id} className="govuk-!-margin-bottom-4">
                <h3 className="govuk-heading-s">
                  {note.observedAt
                    ? new Date(note.observedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Date not recorded'}
                </h3>
                {note.note ? <p className="govuk-body">{note.note}</p> : null}
                {note.traits.length ? (
                  <SummaryList noBorder rows={note.traits.map((t) => ({ key: t.label, value: t.value }))} />
                ) : null}
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
              <InsetText>
                This copy is read-only, so nothing can be commissioned from it.
              </InsetText>
            ) : (
              <>
                {/* IT SPENDS. Said plainly next to the button rather than in a
                    tooltip: two model calls and a handful of retrievals, on a
                    body the reader chose. */}
                <p className="govuk-body-s prt-meta" id="persona-research-cost">
                  This makes two model calls and a few searches, so it costs a little. It asks
                  about statutory powers, capacity and track record — never about individuals.
                  An enquiry is refused outright for a body profiled from a sealed or purged
                  paper, because the check that stops a query quoting that paper cannot run.
                </p>
                <ButtonGroup>
                  <Button disabled={busy !== null} onClick={() => void research()}
                          aria-describedby="persona-research-cost">
                    {busy === 'research' ? 'Reading public sources…' : 'Look this body up'}
                  </Button>
                </ButtonGroup>
              </>
            )}
          </div>
        </div>
      </section>

      {!readOnly ? (
        <section aria-labelledby="persona-forget">
          <h2 className="govuk-heading-m" id="persona-forget">Forget this body</h2>
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <p className="govuk-body" id="persona-forget-what">
                Removes the dossier and everything the library has recorded about it. The
                assessments themselves are untouched — it will be recognised again the next time a
                paper names it, starting from nothing.
              </p>
              {confirming ? (
                <>
                  <WarningText>
                    This cannot be undone. Everything the library has recorded about {persona.name}{' '}
                    — across {persona.sightings} {persona.sightings === 1 ? 'paper' : 'papers'} — goes.
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
                /* A CONFIRMATION STEP, because one click destroyed a record
                   built across several papers with nothing to bring it back. */
                <ButtonGroup>
                  <Button variant="warning" disabled={busy !== null} onClick={() => setConfirming(true)}
                          aria-describedby="persona-forget-what">
                    Forget it
                  </Button>
                </ButtonGroup>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
