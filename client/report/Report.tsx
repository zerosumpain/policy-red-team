import {
  BAND_LABEL, actorBoard, bandCounts, checks, evidenceMix, findingsBySection,
  headlineSentence, ledger, plays, recommendations, summarise, tiles,
} from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { network } from '$lib/policy-analysis/network';
import { leverage } from '$lib/policy-analysis/stress';
import type { Detail } from '../api';
import { Details, InsetText, SummaryList, Table, Tabs, WarningText } from '../govuk';
import { mechanismIdsOf, narrowExcept, type Selection } from './selection';
import { Bar, Metrics } from './Metrics';
import { WriteUp } from './WriteUp';
import { TestResult } from './TestResult';
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
type Move = 'verdict' | 'causality' | 'threats' | 'actors' | 'provenance' | 'do';

/**
 * `do` IS NOT A TAB, and that is the point.
 *
 * Downloading a copy, attaching what came after, and making a link to send are
 * not answers to "what did it conclude" — they are things you do with the
 * answer. They sat at the foot of the Verdict panel, where between them they
 * added about three thousand pixels of forms and radio buttons to the one view
 * every reader lands on, so the last thing a reader saw of the assessment's
 * conclusion was a file picker. They belong after the report, once, for all
 * five views.
 */
const ACTIONS: Move = 'do';

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

  /*
   * Declared before the shaping, because the board and the leads all narrow by
   * them now. Order matters here in a way it did not when the report was one
   * cascade that honoured no selection at all.
   */
  const [move, setMove] = useState<Move>('verdict');
  const [selection, setSelection] = useState<Selection>(null);
  const mechanismIds = useMemo(() => mechanismIdsOf(artefacts), [artefacts]);

  const list = plays(artefacts);
  /*
   * NARROWED, EXCEPT BY A BODY. The board is how a reader picks a body, so it
   * keeps every row when a body is selected — but a band or mechanism selection
   * must change the counts, or twenty rows sit unchanged under a banner saying
   * the view is filtered. It was built from the raw list and honoured nothing.
   */
  const boardPlays = useMemo(
    () => narrowExcept(list, selection, mechanismIds, 'actor'),
    [list, selection, mechanismIds],
  );
  const board = useMemo(() => actorBoard(artefacts, boardPlays), [artefacts, boardPlays]);
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


  const sections: Section[] = [];
  const section = (id: string, title: string, move: Move, body: React.ReactNode) => {
    if (body) sections.push({ id, title, body, move });
  };

  /*
   * FIGURES, DRAWN AS FIGURES. This was a two-column summary list, so the
   * numbers a reader takes away sat in the right-hand cell at the same weight
   * as the sentence naming them — the least prominent thing in the section they
   * are the point of.
   */
  section('found', 'What it found', 'verdict',
    <Metrics
      metrics={figures.map((figure) => ({
        label: figure.label,
        value: figure.figure,
        note: figure.sub,
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
      {/*
        ONE RAMP, NOT TWO. These were GOV.UK Tags — red, orange, grey — which is
        a THIRD colouring of the same four bands, disagreeing with the card
        borders, the stacked bar, the mechanism segments and the plot, all of
        which use the assessment's own ramp. Four bands cannot be red-orange-grey
        here and purple-to-pink everywhere else and still mean one thing.
      */}
      <p className="prt-bandrow">
        {bands.map((band) => (
          <span key={band.band} className={`prt-band prt-band--${band.band}`}>
            {band.count} {BAND_LABEL[band.band]}
          </span>
        ))}
      </p>
      {/*
        THE PLAYBOOK TABLE IS GONE, and nothing was lost with it.
        Move 3 printed the same forty-seven plays twice: once as the ranked
        cards above, in full, and again here as the worst twenty in five
        columns so narrow that "Department for Education" set as "Departme / nt
        for / Educatio / n" and "compliant" as "compli / ant". The only column
        the cards did not carry was legality, which they now do.
      */}
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
  /*
   * A BODY THAT RUNS NO PLAY IS NOT "THE WORST 20". The board is sorted worst
   * first and then sliced, so on a run where only twelve bodies carry a play the
   * remaining eight rows were 0 plays / 0.00 exposure — padding a table headed
   * "worst play first" with bodies that have no play at all, three of them
   * spelled "Department for Education" one after another. That is a reader's
   * first sight of the Actors move and it reads as a broken table.
   *
   * So the table is the bodies that actually run something, and the rest are
   * counted in a sentence. Nothing is lost: every profile is still reachable
   * from the relationships section and from any play it could run.
   */
  const active = board.filter((a) => a.plays.length);
  const idle = board.length - active.length;
  section('actors', 'Who is involved', 'actors', board.length ? (
    <>
      <p className="govuk-body">
        {active.length} of the {board.length} bodies the paper names are positioned to run at least
        one play. The figure is the worst single play each one could run, on the same 0–1 exposure
        scale as the playbook.
      </p>
      <Table
        caption={`Bodies that could run a play, worst first${active.length > ACTORS_SHOWN ? ` — the worst ${ACTORS_SHOWN} of ${active.length}` : ''}`}
        captionSize="s"
        scroll
        columns={[{ header: 'Body' }, { header: 'Plays', numeric: true }, { header: 'Worst exposure', numeric: true, width: '11rem' }]}
        rows={active.slice(0, ACTORS_SHOWN).map((actor) => [
          name(actor.actor),
          String(actor.plays.length),
          /* The number alone gives a reader nothing to compare: 0.77 against
             0.05 is a fifteen-fold difference that reads as two similar
             decimals. The bar is the comparison and the number stays exact. */
          <Bar value={actor.worst} />,
        ])}
      />
      {active.length > ACTORS_SHOWN ? (
        <p className="govuk-body-s prt-meta">
          {active.length - ACTORS_SHOWN} more bodies run a play. Every one is reachable from the
          relationships section and from any play it could run.
        </p>
      ) : null}
      {idle ? (
        <p className="govuk-body-s prt-meta">
          {idle} further {idle === 1 ? 'body is' : 'bodies are'} profiled but run no play in this
          assessment. Some are the same body resolved twice — entity resolution keeps candidates
          apart rather than merging them, which &ldquo;How they connect&rdquo; reports as a finding.
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

  /*
   * FOUR FIGURES, NOT A TWO-COLUMN LIST. This was a summary list: the label in
   * a 30% key column and the number in the value cell, leaving two thirds of
   * the row empty and the figure at the same weight as the word. The tone tints
   * the rule only, and only in agreement with the label — "contradicts" is not
   * an alarm, it is the thing a red team is looking for.
   */
  const EVIDENCE_TONE: Record<string, 'good' | 'severe' | 'moderate' | 'limited'> = {
    supports: 'good', contradicts: 'severe', mixed: 'moderate', insufficient: 'limited',
  };
  section('evidence', 'What is backed up', 'verdict', mix.length ? (
    <>
      <Metrics
        columns={4}
        metrics={mix.map((entry) => ({
          label: entry.label,
          value: entry.count.toLocaleString(),
          tone: EVIDENCE_TONE[entry.key] ?? 'neutral',
        }))}
      />
      <InsetText>
        A search excerpt is weak evidence and is labelled as one. A retrieval date is not a
        publication date.
      </InsetText>
    </>
  ) : null);

  /*
   * A RESULT IS A WORD, NOT A DATABASE VALUE. This column printed the stored
   * enum: `high_risk`, `moderate_risk`, `indeterminate`, underscores and all,
   * in a report a policy reader is meant to take away. The tag also carries the
   * severity, which the bare string did not — and `indeterminate` is grey
   * rather than green, because "the test could not decide" is not a pass.
   */
  section('checks', 'Structural checks', 'verdict', structural.length ? (
    <Table
      caption="What the policy's own wiring was tested against"
      captionSize="s"
      scroll
      columns={[{ header: 'Check' }, { header: 'Result', width: '11rem' }]}
      rows={structural.slice(0, 20).map((check) => [name(check), <TestResult value={check.data.result} />])}
    />
  ) : null);

  section('writeup', 'The write-up', 'verdict', sectionFindings.length ? (
    <WriteUp groups={sectionFindings} name={name} />
  ) : null);

  /*
   * A RECOMMENDATION IS AN ITEM, NOT A PARAGRAPH IN A RUN-ON LIST.
   *
   * These are 400–900 characters each — a sentence saying what to do, then
   * three or four saying how and against what. Printed whole in a numbered
   * list they became nine grey slabs in which the actual instruction was
   * indistinguishable from the caveats attached to it, and a reader scanning
   * for "what should I do" had to read all nine in full to find out.
   *
   * The lead sentence is the instruction and it is set as one. Everything after
   * it is the working, and it opens on request. `summarise()` does the split —
   * the same one the write-up uses, so the report has one idea of what an
   * opening sentence is.
   */
  section('suggests', 'What it suggests', 'verdict', recs.length ? (
    <ol className="prt-recs">
      {recs.map((rec) => {
        const { lead, rest } = summarise(rec.statement);
        return (
          <li key={rec.id} className="prt-rec">
            {/* The artefact's own name is the card's title, the way a play's is
                — it was set as a grey footnote UNDER the instruction, where a
                shorter restatement of the sentence above it reads as an
                afterthought rather than as the thing it names. */}
            {linkTo ? <p className="prt-rec__title">{linkTo(rec)}</p> : null}
            <p className="prt-rec__lead">{lead}</p>
            {rest ? (
              <Details summary="How, and against what">
                <p className="govuk-body-s">{rest}</p>
              </Details>
            ) : null}
          </li>
        );
      })}
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
  /*
   * A LIMIT LEADS WITH ITS FIRST SENTENCE, and keeps the rest behind a control.
   *
   * These run to six lines each and several open identically — "This call
   * exceeded the model's context window, so its input was reduced…" — followed
   * by a different list of what was withheld. Printed whole and stacked, the
   * page became a wall in which the differences were invisible, which is the
   * opposite of what a record of what a run could not do is for.
   *
   * `summarise()` is the same split the write-up uses, so one definition of
   * "the first sentence" serves the whole report.
   */
  /*
   * `summarise()` IS THE WRONG SPLIT FOR THESE, and the rendered page said so.
   *
   * It trusts one boundary — a full stop followed by a space and a CAPITAL —
   * because policy prose is full of abbreviations and decimals. These sentences
   * are not policy prose, they are the pipeline's own: "…so its input was
   * reduced. 18 long items clipped to 250 characters for this call. 484 items
   * were withheld…". Every boundary is followed by a DIGIT, so it found none and
   * printed all six lines as the lead — which is exactly the wall this section
   * was meant to stop being.
   *
   * A machine-written limit always opens with the fact and continues with the
   * inventory, so the first full stop is the split. The floor keeps a two-word
   * opener from becoming a lead of its own.
   */
  const LIMIT_FLOOR = 24;
  const limitLead = (text: string): { lead: string; rest: string } => {
    const boundary = text.slice(LIMIT_FLOOR).search(/[.!?]\s/);
    if (boundary < 0) return { lead: text, rest: '' };
    const at = LIMIT_FLOOR + boundary + 1;
    return { lead: text.slice(0, at).trim(), rest: text.slice(at).trim() };
  };
  const gapLine = ([text, count]: [string, number]) => {
    const { lead, rest } = limitLead(text);
    return (
      <li key={text} className="prt-gap">
        <p className="prt-gap__lead">
          {lead}
          {count > 1 ? <span className="prt-meta"> — recorded {count} times</span> : null}
        </p>
        {rest ? (
          <Details summary="What it withheld">
            <p className="govuk-body-s">{rest}</p>
          </Details>
        ) : null}
      </li>
    );
  };
  section('gaps', 'What it could not establish', 'provenance', gaps.length ? (
    <>
      <p className="govuk-body">
        {warnings.length} {warnings.length === 1 ? 'limit was' : 'limits were'} recorded across the
        stages{gaps.length !== warnings.length ? `, ${gaps.length} of them distinct` : ''}. Nothing
        here is dropped — this is the record of what the assessment could not do.
      </p>
      <ul className="prt-gaps">{gaps.slice(0, GAPS_SHOWN).map(gapLine)}</ul>
      {gaps.length > GAPS_SHOWN ? (
        <Details summary={`The other ${gaps.length - GAPS_SHOWN}`}>
          <ul className="prt-gaps">{gaps.slice(GAPS_SHOWN).map(gapLine)}</ul>
        </Details>
      ) : null}
    </>
  ) : null);

  section('take', 'Take it away', ACTIONS, offline ? null : (
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
  section('after', 'What came after this was written', ACTIONS, offline ? null : (
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

  section('send', 'Send it to someone', ACTIONS, offline ? null : <Shares analysisId={analysis.id} />);

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
      {/*
        FULL WIDTH, AND THE STANDING CAVEAT DEMOTED.
        The headline is the one sentence the whole assessment exists to produce
        and it was wrapping at 630px inside a 960px column. The red-team caveat
        is permanent, true of every report, and was taking a full warning box
        above the conclusion every time — it is a standing note, not news, so it
        reads as one.
      */}
      <div className="prt-lead">
        <AddendumNotice artefacts={artefacts} passes={detail.passes} />
        {headline ? <p className="prt-lead__headline">{headline}</p> : null}
        <p className="prt-lead__caveat">
          A red-team read, not an assurance review. Every profile is a hypothesis about a
          body&rsquo;s incentives — never a finding about a named person.
        </p>
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
            panel: panel('verdict', <VerdictLead list={list} bands={bands} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={linkTo} />),
          },
          {
            id: 'causality', step: 'Move 2', label: 'Causality',
            panel: panel('causality', <CausalityLead artefacts={artefacts} list={list} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={linkTo} />),
          },
          {
            id: 'threats', step: 'Move 3', label: 'Threats',
            panel: panel('threats', <ThreatsLead list={list} selection={selection} mechanismIds={mechanismIds} linkTo={linkTo} />),
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

      {/*
        AFTER THE REPORT, ONCE. A reader on Threats can still download the Word
        file without going back to Verdict to find it, and a reader on Verdict
        reaches the end of the assessment's conclusions at the end of the
        assessment's conclusions.
      */}
      {inMove(ACTIONS).length ? (
        <div className="prt-actions">
          <h2 className="govuk-heading-m prt-actions__head">What you can do with this</h2>
          {inMove(ACTIONS).map((entry) => (
            <section key={entry.id} aria-labelledby={entry.id}>
              <h3 className="govuk-heading-s" id={entry.id}>{entry.title}</h3>
              {entry.body}
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}
