import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { dossier } from '$lib/persona-view';
import { api, type PersonaDossier } from '../api';
import { Button, ButtonGroup, Details, InsetText, SummaryList, Table, Tag, WarningText } from '../govuk';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'research' | 'forget'>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.persona(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setError(null);
    setDetail(null);
    setOutcome(null);
    void load();
  }, [id, load]);

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

  async function research() {
    setBusy('research');
    setError(null);
    setOutcome(null);
    try {
      const result = await api.researchPersona(id);
      setOutcome(
        result.sources
          ? `Read ${result.sources} public ${result.sources === 1 ? 'source' : 'sources'} and recorded ${result.traits} ${result.traits === 1 ? 'trait' : 'traits'}.`
          : 'Nothing usable came back. The enquiry is recorded below with what it looked for.',
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function forget() {
    setBusy('forget');
    try {
      await api.forgetPersona(id);
      void navigate('/personas');
    } catch (err) {
      setError((err as Error).message);
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
                        <span className="prt-meta">— {reading.where.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : persona.sightings > 1 ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <InsetText>
              The papers that named this body describe it consistently. That is worth knowing on
              its own — it is the case where a dossier adds confidence rather than a question.
            </InsetText>
          </div>
        </div>
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
              <Tag key={`b${i}`} colour={play.band === 'severe' ? 'red' : play.band === 'significant' ? 'orange' : 'grey'}>{play.band}</Tag>,
              play.exposure.toFixed(2),
              play.legality || '—',
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
              <div key={sighting.analysisId ?? sighting.title} className="govuk-!-margin-bottom-4">
                <h3 className="govuk-heading-s">
                  {titleOf(sighting.analysisId) ? (
                    <Link className="govuk-link" to={`/assessments/${sighting.analysisId}`}>{sighting.title}</Link>
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
            {outcome ? <InsetText><span role="status">{outcome}</span></InsetText> : null}

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
                          {source.title || source.url}
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
                <p className="govuk-body-s prt-meta">
                  This makes two model calls and a few searches, so it costs a little. It asks
                  about statutory powers, capacity and track record — never about individuals.
                </p>
                <ButtonGroup>
                  <Button disabled={busy !== null} onClick={() => void research()}>
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
              <p className="govuk-body">
                Removes the dossier and everything the library has recorded about it. The
                assessments themselves are untouched — it will be recognised again the next time a
                paper names it, starting from nothing.
              </p>
              <ButtonGroup>
                <Button variant="warning" disabled={busy !== null} onClick={() => void forget()}>
                  {busy === 'forget' ? 'Forgetting…' : 'Forget it'}
                </Button>
              </ButtonGroup>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
