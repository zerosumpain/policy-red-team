import {
  BAND_LABEL, actorBoard, bandCounts, checks, evidenceMix, findingsBySection,
  headlineSentence, ledger, plays, recommendations, summarise, tiles,
} from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { useMemo, type ReactNode } from 'react';
import { network } from '$lib/policy-analysis/network';
import type { Detail } from '../api';
import { Accordion, Details, InsetText, SummaryList, Table, Tag, WarningText } from '../govuk';
import { ExposurePlot } from './ExposurePlot';
import { NetworkSection } from './Network';

/**
 * The report.
 *
 * Everything here is shaped by `$lib/policy-analysis/view` — the copied,
 * framework-free view layer — so this file decides PRESENTATION and nothing else.
 * `plays()`, `actorBoard()`, `ledger()` and the rest are the same functions the
 * site version renders from, which is the whole point of having copied them: a
 * change to what counts as a severe play lands in both without being reimplemented
 * in React.
 *
 * The shape is GOV.UK's, not the dashboard's. A report is a document: a
 * conclusion, then the figures behind it, then the detail on request. The site
 * version opens with a wall of tiles because it is a dashboard; this opens with
 * the sentence the assessment actually concluded.
 */
/**
 * A report section: a heading with an id, so the contents list can reach it.
 *
 * Built as data rather than written inline because the contents list has to
 * agree with what actually rendered. A hand-kept list of anchors goes stale the
 * first time a section is added, and a contents entry pointing at nothing is
 * worse than no contents at all.
 */
interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

function Contents({ sections }: { sections: Section[] }) {
  if (sections.length < 3) return null;
  return (
    <nav className="govuk-!-margin-bottom-6" aria-label="Contents">
      <h2 className="govuk-heading-s" id="contents">Contents</h2>
      <ol className="govuk-list govuk-list--number govuk-list--spaced">
        {sections.map((section) => (
          <li key={section.id}>
            <a className="govuk-link" href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * How an artefact's name is rendered.
 *
 * A FUNCTION FROM THE CALLER, not an href, and not react-router imported here.
 * This component renders twice: once in the app, where every name is a link into
 * the drill, and once inside the offline pack, where there is no router, no
 * server and nothing behind a link at all. Taking the renderer as a prop means
 * the pack cannot render a link even by accident — the machinery to do it is
 * not in the bundle — rather than relying on a flag being read correctly in
 * eight places.
 *
 * `label` OVERRIDES THE ARTEFACT'S OWN NAME, and it is not optional dressing.
 * Two of the network insights are about a RELATIONSHIP rather than a body, so
 * `network()` composes their subject label as "A → B" while the subject id is
 * the edge's. A renderer reading only `artefact.label` threw that away and
 * printed the model's name for the edge — the one thing on the row that does
 * not say which direction the insight is about. The offline pack, which has no
 * renderer at all, was printing it correctly the whole time.
 */
export type ArtefactLink = (artefact: Artefact, label?: string) => ReactNode;

/**
 * `offline` suppresses the download section.
 *
 * Its links point at `/api/policy-analysis/:id/export`, which in a pack opened
 * from `file://` is a server that is not there — three dead links offering the
 * reader the very file they are already reading. Found by looking at a real pack
 * rather than by any test, which is the argument for looking at real output.
 */
export function Report({ detail, offline, linkTo }: { detail: Detail; offline?: boolean; linkTo?: ArtefactLink }) {
  const { artefacts, analysis, stages } = detail;
  /** The name of a thing, and — where the caller can offer one — the way into it. */
  const name = (artefact: Artefact): ReactNode => (linkTo ? linkTo(artefact) : artefact.label);

  const list = plays(artefacts);
  const board = actorBoard(artefacts, list);
  const warnings = stages.flatMap((s) => s.warnings);
  const figures = ledger(artefacts, list, warnings.length);
  const headline = headlineSentence(artefacts);
  const sectionFindings = findingsBySection(artefacts);
  const recs = recommendations(artefacts);
  const bands = bandCounts(list);
  const mix = evidenceMix(artefacts);
  const structural = checks(artefacts);
  /**
   * MEMOISED, and not for tidiness. `network()` is 145ms on a 3,100-artefact
   * assessment — it resolves duplicate bodies across every actor in the
   * inventory — and this component re-renders on every stage event while a run
   * is in flight. The rest of the shaping above is a few milliseconds and does
   * not need it.
   */
  const net = useMemo(() => network(artefacts), [artefacts]);

  const sections: Section[] = [];
  const section = (id: string, title: string, body: React.ReactNode) => {
    if (body) sections.push({ id, title, body });
  };

  section('found', 'What it found',
    <SummaryList
      rows={figures.map((figure) => ({
        key: figure.label,
        value: <><strong className="govuk-!-font-size-24">{figure.figure}</strong> <span className="prt-meta">{figure.sub}</span></>,
      }))}
    />
  );

  section('plays', 'Ways to beat it', list.length ? (
    <>
      <p className="govuk-body">
        Ranked by the geometric mean of four judgements — incentive, ease, impact and
        concealment. A mean rather than an average because a play that scores high on three
        and near zero on one is not a threat, and an average would hide that.
      </p>
      <p className="govuk-body">
        {bands.map((band) => (
          <span key={band.band}>
            <Tag colour={band.band === 'severe' ? 'red' : band.band === 'significant' ? 'orange' : 'grey'}>
              {band.count} {BAND_LABEL[band.band]}
            </Tag>{' '}
          </span>
        ))}
      </p>
      <Table
        caption="The exploitation playbook"
        captionSize="s"
        scroll
        columns={[
          { header: 'Play' }, { header: 'Body' }, { header: 'Band' },
          { header: 'Exposure', numeric: true }, { header: 'Legality' },
        ]}
        rows={list.slice(0, 20).map((play) => [
          name(play.artefact),
          play.actor ? name(play.actor) : '—',
          BAND_LABEL[play.band],
          play.exposure.toFixed(2),
          String(play.artefact.data.legality ?? '—'),
        ])}
      />
      <h3 className="govuk-heading-m">Ease against impact</h3>
      <ExposurePlot plays={list} linkTo={linkTo} />
    </>
  ) : null);

  section('actors', 'Who is involved', board.length ? (
    <Table
      caption="Bodies profiled, worst play first"
      captionSize="s"
      scroll
      columns={[{ header: 'Body' }, { header: 'Plays', numeric: true }, { header: 'Worst exposure', numeric: true }]}
      rows={board.map((actor) => [name(actor.actor), String(actor.plays.length), actor.worst.toFixed(2)])}
    />
  ) : null);

  section('network', 'How they connect', net.edges.length ? (
    <NetworkSection net={net} artefacts={artefacts} linkTo={linkTo} />
  ) : null);

  section('evidence', 'What is backed up', mix.length ? (
    <>
      <SummaryList noBorder rows={mix.map((entry) => ({ key: entry.label, value: String(entry.count) }))} />
      <InsetText>
        A search excerpt is weak evidence and is labelled as one. A retrieval date is not a
        publication date.
      </InsetText>
    </>
  ) : null);

  section('checks', 'Structural checks', structural.length ? (
    <Table
      caption="What the policy's own wiring was tested against"
      captionSize="s"
      scroll
      columns={[{ header: 'Check' }, { header: 'Result' }]}
      rows={structural.slice(0, 20).map((check) => [name(check), String(check.data.result ?? '—')])}
    />
  ) : null);

  section('writeup', 'The write-up', sectionFindings.length ? (
    <Accordion
      id="findings"
      sections={sectionFindings.map((group) => ({
        heading: group.label,
        summary: `${group.items.length} ${group.items.length === 1 ? 'finding' : 'findings'}`,
        content: (
          <>
            {group.items.map((item) => {
              const { lead, rest } = summarise(item.statement);
              return (
                <div key={item.id} className="govuk-!-margin-bottom-4">
                  <h3 className="govuk-heading-s">{name(item)}</h3>
                  <p className="govuk-body">{lead}</p>
                  {rest ? <Details summary="Read the rest"><p className="govuk-body">{rest}</p></Details> : null}
                </div>
              );
            })}
          </>
        ),
      }))}
    />
  ) : null);

  section('suggests', 'What it suggests', recs.length ? (
    <ol className="govuk-list govuk-list--number">
      {recs.map((rec) => (
        <li key={rec.id}>
          {rec.statement}
          {linkTo ? <> <span className="prt-meta">— {linkTo(rec)}</span></> : null}
        </li>
      ))}
    </ol>
  ) : null);

  section('gaps', 'What it could not establish', warnings.length ? (
    <ul className="govuk-list govuk-list--bullet">
      {warnings.map((warning, i) => <li key={i}>{warning}</li>)}
    </ul>
  ) : null);

  section('take', 'Take it away', offline ? null : (
    <>
      <p className="govuk-body">
        Three copies, and they are not the same thing. The Word file is the one
        somebody marks up. The markdown is the same text, for pasting into your own
        template. The pack is this page — everything on it — in a folder that needs
        no network at all.
      </p>
      <ul className="govuk-list govuk-list--spaced">
        <li>
          <a className="govuk-link" href={`/api/policy-analysis/${analysis.id}/export?format=docx`} download>
            Download the report as Word
          </a>{' '}
          <span className="prt-meta">.docx</span>
        </li>
        <li>
          <a className="govuk-link" href={`/api/policy-analysis/${analysis.id}/export?format=md`} download>
            Download the report as markdown
          </a>{' '}
          <span className="prt-meta">.md</span>
        </li>
        <li>
          <a className="govuk-link" href={`/api/policy-analysis/${analysis.id}/export?format=bundle`} download>
            Download the offline pack
          </a>{' '}
          <span className="prt-meta">.zip — open index.html by double-clicking it</span>
        </li>
      </ul>
      {analysis.sealed ? (
        <InsetText>
          This assessment is sealed. A pack made from it is the paper in the clear, in your
          Downloads folder — handle it like the document it came from.
        </InsetText>
      ) : null}
    </>
  ));

  section('provenance', 'How this was produced',
    <SummaryList
      rows={[
        { key: 'Model', value: analysis.model ?? 'the configured default' },
        { key: 'Reasoning effort', value: analysis.thinkingLevel ?? 'the provider default' },
        { key: 'Depth', value: analysis.depth },
        { key: 'Sealed', value: analysis.sealed ? 'Yes — none of the paper is stored in the clear' : 'No' },
        { key: 'Stages', value: `${stages.filter((s) => s.status === 'completed').length} of ${stages.length} completed` },
      ]}
    />
  );

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {headline ? <p className="govuk-body-l">{headline}</p> : null}
          <WarningText>
            This is a red-team read, not an assurance review. Every profile is a hypothesis about
            a body's incentives, never a finding about a named person.
          </WarningText>
          <Contents sections={sections} />
        </div>
      </div>

      {sections.map((entry) => (
        <section key={entry.id} aria-labelledby={entry.id}>
          <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
          {entry.body}
          <p className="govuk-body-s govuk-!-margin-top-2">
            <a className="govuk-link" href="#contents">Back to contents</a>
          </p>
        </section>
      ))}
    </>
  );
}
