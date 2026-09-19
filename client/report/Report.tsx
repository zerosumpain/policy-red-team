import {
  BAND_LABEL, actorBoard, bandCounts, checks, evidenceMix, findingsBySection,
  headlineSentence, ledger, plays, recommendations, summarise, tiles,
} from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { network } from '$lib/policy-analysis/network';
import { leverage } from '$lib/policy-analysis/stress';
import type { Detail } from '../api';
import { Accordion, Details, InsetText, SummaryList, Table, Tabs, Tag, WarningText } from '../govuk';
import { mechanismIdsOf, type Selection } from './selection';
import { SelectionBanner } from './moves/SelectionBanner';
import { VerdictLead } from './moves/VerdictLead';
import { CausalityLead } from './moves/CausalityLead';
import { ThreatsLead } from './moves/ThreatsLead';
import { ProvenanceLead } from './moves/ProvenanceLead';
import { ExposurePlot } from './ExposurePlot';
import { NetworkSection } from './Network';
import { StressLab } from './StressLab';
import { Shares } from './Shares';
import { Addenda, AddendumNotice } from './Addenda';

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
type Move = 'verdict' | 'causality' | 'threats' | 'actors' | 'provenance';

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
  /**
   * Which of the four questions this section answers.
   *
   * A reader arrives with one of four — what did it conclude, why does it
   * happen, what could be done, who would do it — and a single cascade answers
   * whichever is uppermost by making them scroll past the other three. Every
   * section that existed before this phase kept its body unchanged and gained
   * only this field; nothing was rewritten in order to be re-arranged.
   */
  move: Move;
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
export function Report({ detail, offline, linkTo, onChanged }: {
  detail: Detail;
  offline?: boolean;
  linkTo?: ArtefactLink;
  /**
   * Called when something started a pass, so the page that owns the fetch can
   * refetch. A pass changes the assessment's own status, so the report is no
   * longer the thing to show — the progress list is.
   */
  onChanged?: () => void;
}) {
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
  /** Run here rather than inside the panel, so the section can decide whether to exist. */
  const levers = useMemo(() => leverage(artefacts), [artefacts]);

  const [move, setMove] = useState<Move>('verdict');
  const [selection, setSelection] = useState<Selection>(null);
  const mechanismIds = useMemo(() => mechanismIdsOf(artefacts), [artefacts]);

  const sections: Section[] = [];
  const section = (id: string, title: string, move: Move, body: React.ReactNode) => {
    if (body) sections.push({ id, title, body, move });
  };

  section('found', 'What it found', 'verdict',
    <SummaryList
      rows={figures.map((figure) => ({
        key: figure.label,
        value: <><strong className="govuk-!-font-size-24">{figure.figure}</strong> <span className="prt-meta">{figure.sub}</span></>,
      }))}
    />
  );

  section('plays', 'Ways to beat it', 'threats', list.length ? (
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

  /*
   * CAPPED, like the playbook beside it.
   *
   * MEASURED on a real assessment: this table rendered 511 rows and stood
   * 23,717 pixels tall — twenty-six screens for one section of a report that
   * came to seventy-nine. `actorBoard` is already sorted worst-play-first, so
   * the cap keeps the bodies a reader came for; the rest are counted, and the
   * drill holds every one of them either way.
   *
   * 511 is also inflated: entity resolution splits an ambiguous body into
   * candidate rows rather than merging them, which is a deliberate choice and is
   * reported as a finding by "How they connect" two sections above.
   */
  const ACTORS_SHOWN = 20;
  section('actors', 'Who is involved', 'actors', board.length ? (
    <>
      <Table
        caption={`Bodies profiled, worst play first${board.length > ACTORS_SHOWN ? ` — the worst ${ACTORS_SHOWN} of ${board.length}` : ''}`}
        captionSize="s"
        scroll
        columns={[{ header: 'Body' }, { header: 'Plays', numeric: true }, { header: 'Worst exposure', numeric: true }]}
        rows={board.slice(0, ACTORS_SHOWN).map((actor) => [name(actor.actor), String(actor.plays.length), actor.worst.toFixed(2)])}
      />
      {board.length > ACTORS_SHOWN ? (
        <p className="govuk-body-s prt-meta">
          {board.length - ACTORS_SHOWN} more bodies are profiled. Every one is reachable from the
          relationships section and from any play it could run.
        </p>
      ) : null}
    </>
  ) : null);

  section('network', 'How they connect', 'causality', net.edges.length ? (
    <NetworkSection net={net} artefacts={artefacts} linkTo={linkTo} />
  ) : null);

  section('stress', 'What if we are wrong', 'threats', levers.length ? (
    <StressLab artefacts={artefacts} levers={levers} linkTo={linkTo} />
  ) : null);

  section('evidence', 'What is backed up', 'verdict', mix.length ? (
    <>
      <SummaryList noBorder rows={mix.map((entry) => ({ key: entry.label, value: String(entry.count) }))} />
      <InsetText>
        A search excerpt is weak evidence and is labelled as one. A retrieval date is not a
        publication date.
      </InsetText>
    </>
  ) : null);

  section('checks', 'Structural checks', 'verdict', structural.length ? (
    <Table
      caption="What the policy's own wiring was tested against"
      captionSize="s"
      scroll
      columns={[{ header: 'Check' }, { header: 'Result' }]}
      rows={structural.slice(0, 20).map((check) => [name(check), String(check.data.result ?? '—')])}
    />
  ) : null);

  section('writeup', 'The write-up', 'verdict', sectionFindings.length ? (
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

  section('suggests', 'What it suggests', 'verdict', recs.length ? (
    <ol className="govuk-list govuk-list--number">
      {recs.map((rec) => (
        <li key={rec.id}>
          {rec.statement}
          {linkTo ? <> <span className="prt-meta">— {linkTo(rec)}</span></> : null}
        </li>
      ))}
    </ol>
  ) : null);

  /*
   * THE SAME WARNING, SAID ONCE, AND THE TAIL ON REQUEST.
   *
   * MEASURED on a real assessment: 376 warnings across fourteen stages, 356 of
   * them distinct, the longest 6,387 characters — 30,010 pixels, which was 42%
   * of the whole report. Most of the repetition is one stage reporting the same
   * clipped-context message once per call.
   *
   * Identical text is collapsed with a count, the first handful stay in the
   * flow, and the rest go behind a disclosure. Nothing is dropped: this is the
   * section that records what the assessment could NOT do, and quietly
   * truncating it would be the worst possible place to save room.
   */
  const GAPS_SHOWN = 8;
  const gaps = [...warnings.reduce((seen, warning) => seen.set(warning, (seen.get(warning) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const gapLine = ([text, count]: [string, number]) => (
    <li key={text}>
      {text}
      {count > 1 ? <span className="prt-meta"> — recorded {count} times</span> : null}
    </li>
  );
  section('gaps', 'What it could not establish', 'provenance', gaps.length ? (
    <>
      <p className="govuk-body">
        {warnings.length} {warnings.length === 1 ? 'limit was' : 'limits were'} recorded across the
        stages{gaps.length !== warnings.length ? `, ${gaps.length} of them distinct` : ''}. Nothing
        here is dropped — this is the record of what the assessment could not do.
      </p>
      <ul className="govuk-list govuk-list--bullet">{gaps.slice(0, GAPS_SHOWN).map(gapLine)}</ul>
      {gaps.length > GAPS_SHOWN ? (
        <Details summary={`The other ${gaps.length - GAPS_SHOWN}`}>
          <ul className="govuk-list govuk-list--bullet">{gaps.slice(GAPS_SHOWN).map(gapLine)}</ul>
        </Details>
      ) : null}
    </>
  ) : null);

  section('take', 'Take it away', 'verdict', offline ? null : (
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

  /*
   * Beside "take it away", because it is the same act with one thing left out.
   * `offline` suppresses both: a pack's own links would point at a server that
   * is not there.
   */
  /*
   * After the report and before the downloads: what came after it was written
   * is part of reading it, and the copy you send should carry whatever this
   * says. Suppressed offline for the usual reason — a pack has no server to
   * attach anything to, and the addenda it does carry are already in its
   * artefacts.
   */
  section('after', 'What came after this was written', 'verdict', offline ? null : (
    <Addenda
      analysisId={analysis.id}
      status={analysis.status}
      artefacts={artefacts}
      passes={detail.passes}
      readOnly={detail.readOnly}
      linkTo={linkTo}
      onChanged={onChanged ?? (() => window.location.reload())}
    />
  ));

  section('send', 'Send it to someone', 'verdict', offline ? null : <Shares analysisId={analysis.id} />);

  section('provenance', 'How this was produced', 'provenance',
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

  /*
   * THE OFFLINE PACK KEEPS THE CASCADE, and that is not a shortcut.
   *
   * The pack is one file opened from `file://` with every request blocked, and
   * a tabbed spine hides five sixths of a report behind JavaScript. A reader who
   * opens the pack to find what an assessment said should not need script to
   * read it — and `Ctrl-F` across a whole document is the pack's real interface.
   * So the moves are for the service, and the pack stays a document.
   */
  if (offline) {
    return (
      <>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <AddendumNotice artefacts={artefacts} passes={detail.passes} />
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

  const inMove = (move: Move) => sections.filter((entry) => entry.move === move);
  const panel = (move: Move, lead: ReactNode) => (
    <>
      {lead}
      {inMove(move).map((entry) => (
        <section key={entry.id} aria-labelledby={entry.id}>
          <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
          {entry.body}
        </section>
      ))}
    </>
  );

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {/* ABOVE THE VERDICT, because a reader who meets the conclusion first
              has already formed a view of a report that has been overtaken. */}
          <AddendumNotice artefacts={artefacts} passes={detail.passes} />
          {headline ? <p className="govuk-body-l">{headline}</p> : null}
          <WarningText>
            This is a red-team read, not an assurance review. Every profile is a hypothesis about
            a body's incentives, never a finding about a named person.
          </WarningText>
        </div>
      </div>

      <SelectionBanner selection={selection} onClear={() => setSelection(null)} />

      <Tabs
        id="report"
        label="Report sections"
        current={move}
        onSelect={(id) => setMove(id as Move)}
        tabs={[
          {
            id: 'verdict', step: 'Move 1', label: 'Verdict',
            panel: panel('verdict', <VerdictLead list={list} bands={bands} selection={selection} onSelect={setSelection} linkTo={linkTo} />),
          },
          {
            id: 'causality', step: 'Move 2', label: 'Causality',
            panel: panel('causality', <CausalityLead artefacts={artefacts} list={list} selection={selection} onSelect={setSelection} linkTo={linkTo} />),
          },
          {
            id: 'threats', step: 'Move 3', label: 'Threats',
            panel: panel('threats', <ThreatsLead list={list} selection={selection} linkTo={linkTo} />),
          },
          {
            id: 'actors', step: 'Move 4', label: 'Actors',
            panel: panel('actors', null),
          },
          {
            id: 'provenance', step: 'Provenance', label: 'What was discarded',
            panel: panel('provenance', <ProvenanceLead stages={stages} />),
          },
        ]}
      />
    </>
  );
}
