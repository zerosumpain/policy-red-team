import {
  BAND_LABEL, actorBoard, bandCounts, checks, evidenceMix, findingsBySection,
  headlineSentence, interplay, ledger, personaBoard, plays, recommendations, summarise, tiles,
} from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { network } from '$lib/policy-analysis/network';
import { leverage } from '$lib/policy-analysis/stress';
import { stageFacts } from '$lib/policy-analysis/stage-facts';
import type { Detail } from '../api';
import { Details, InsetText, SummaryList, Table, Tabs } from '../govuk';
import { mechanismIdsOf, narrowExcept, parseSelection, selectionParam, type Selection } from './selection';
import { readable } from './warnings';
import { Bar, Metrics } from './Metrics';
import { WriteUp } from './WriteUp';
import { TestResult } from './TestResult';
import { SelectionBanner } from './moves/SelectionBanner';
import { VerdictLead } from './moves/VerdictLead';
import { CausalityLead } from './moves/CausalityLead';
import { ThreatsLead } from './moves/ThreatsLead';
import { ProvenanceLead } from './moves/ProvenanceLead';
import { ActorsLead } from './moves/ActorsLead';
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
  /**
   * The body renders its own `<section>` and its own heading.
   *
   * The four move leads do — they were written as the head of a tab panel, not
   * as an entry in a cascade — and wrapping them in a second section with a
   * second `h2` would print every one of their titles twice. Being in the list
   * at all is what matters: the offline pack renders the list, and for three
   * phases it did not render these, so a pack carried neither the exposure
   * bands, nor the mechanisms, nor the ranked playbook, nor the record of what
   * the run discarded.
   */
  bare?: boolean;
}

/**
 * The order a document reads the moves in, which is the order of the spine.
 *
 * The service groups by move because a reader arrives with one of four
 * questions. A pack has no spine to click, so it makes the same grouping the
 * order of the page — and then the two artefacts agree about the shape of the
 * report as well as about its contents.
 */
const MOVE_ORDER: Move[] = ['verdict', 'causality', 'threats', 'actors', 'provenance', 'do'];

/**
 * `id` IS A PARAMETER BECAUSE THIS RENDERS MORE THAN ONCE NOW.
 *
 * The pack has one of these at the top of one long document. The service renders
 * one per panel — and every panel is in the DOM at once, `hidden` or not, so a
 * hard-coded `id="contents"` would ship five elements with the same id on a page
 * whose gate is axe-clean.
 *
 * The `< 3` guard stays deliberately: at two sections in Causality and one in
 * Actors, a contents list is longer than the thing it indexes.
 */
function Contents({ sections, id = 'contents', of }: { sections: Section[]; id?: string; of?: string }) {
  if (sections.length < 3) return null;
  return (
    /*
     * NAMED BY WHAT IT INDEXES. Below the tablet breakpoint every panel is on the
     * page at once, so five `<nav aria-label="Contents">` elements are five
     * landmarks a screen-reader user cannot tell apart — axe's `landmark-unique`,
     * which the walk caught at 320px the moment it started auditing there.
     */
    <nav className="govuk-!-margin-bottom-6" aria-label={of ? `Contents of ${of}` : 'Contents'}>
      <h2 className="govuk-heading-s" id={id}>Contents</h2>
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

  /*
   * THE URL IS WHERE YOU ARE IN THE REPORT.
   *
   * `move` and `selection` were plain component state, and the drill is a
   * separate route — so reading Threats under a mechanism, following a play, and
   * pressing Back returned the reader to Move 1 with the banner reset to
   * "Showing everything". The URL was identical in every state, so a reload lost
   * the same thing and nobody could send anyone "look at Threats under this
   * mechanism".
   *
   * THE HISTORY API DIRECTLY, NOT `useSearchParams`. This component also renders
   * inside the offline pack, which is one `file://` document with no router in
   * its bundle at all — that is why `linkTo` is a prop rather than an import.
   * `history.replaceState` degrades to nothing there, and is guarded anyway.
   *
   * REPLACE, NOT PUSH. Four tab changes must not become four presses of Back
   * between the reader and the page they came from; what Back is for here is
   * leaving the report, and the entry it returns to carries whatever was last
   * written into it.
   *
   * The hash is still honoured, and wins, because it is the more explicit
   * gesture: `#report-tab-provenance` is what the failed-run banner points at and
   * what the tab strip becomes on a phone.
   */
  useEffect(() => {
    if (offline) return;
    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      const named = params.get('move') as Move | null;
      if (named && MOVE_ORDER.includes(named)) setMove(named);
      setSelection(parseSelection(params.get('sel'), artefacts));

      const hash = /^#report-(?:tab|panel)-([a-z]+)$/.exec(window.location.hash);
      const fromHash = hash?.[1] as Move | undefined;
      if (fromHash && MOVE_ORDER.includes(fromHash)) setMove(fromHash);
    };
    apply();
    window.addEventListener('popstate', apply);
    window.addEventListener('hashchange', apply);
    return () => {
      window.removeEventListener('popstate', apply);
      window.removeEventListener('hashchange', apply);
    };
  }, [offline, artefacts]);

  useEffect(() => {
    if (offline) return;
    const params = new URLSearchParams(window.location.search);
    // `verdict` is the default, so it is left out — a reader who has not chosen
    // anything gets the URL they arrived on.
    if (move === 'verdict') params.delete('move'); else params.set('move', move);
    const sel = selectionParam(selection);
    if (sel) params.set('sel', sel); else params.delete('sel');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [move, selection, offline]);
  const mechanismIds = useMemo(() => mechanismIdsOf(artefacts), [artefacts]);

  /*
   * MEMOISED AT THE ROOT, so the two memos below can actually hit.
   *
   * `plays()` maps a fresh array, so a bare call changed identity on every
   * render — which made `boardPlays` recompute, which changed ITS identity, which
   * made `board` recompute. Two memos documented as protecting the shaping,
   * protecting nothing. `ThreatsLead` carries a comment about this exact failure
   * ("a dependency on `shown` changed identity every render and the sort re-ran
   * every time"); this file had the same bug unfixed.
   *
   * `artefacts` is a stable prop between fetches, so all three are now stable.
   * The shaping is milliseconds either way — what was wrong was claiming it was
   * guarded.
   */
  const list = useMemo(() => plays(artefacts), [artefacts]);
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
  /*
   * The join between the board and the playbook, and the library's view of the
   * bodies on it — both narrowed by the same plays the board is, so Move 4 is one
   * answer rather than three that disagree about what is selected.
   */
  const interplayMap = useMemo(() => interplay(artefacts, boardPlays), [artefacts, boardPlays]);
  const personaGroups = useMemo(() => personaBoard(board, detail.personas), [board, detail.personas]);
  const warnings = useMemo(() => stages.flatMap((s) => s.warnings), [stages]);
  /*
   * ONE REPORT, ONE NUMBER FOR ONE WORD.
   *
   * The ledger's fourth cell is labelled "Open questions" and was handed the raw
   * count of every stage warning — 256 on the real run. Three tabs later the
   * Provenance move runs the repo's own classifier over the identical array and
   * prints 156 open questions, because 100 of those sentences are discards,
   * dropped references, pages never reached and things the paper did not cover.
   * `stage-facts.ts` says so itself: "'Open question' is also the site's own word
   * for them: it is what the ink ledger's fourth cell counts." It did not.
   *
   * So the cell reads the same classifier the Provenance panel does. The raw 256
   * is still on the page, in the gaps section, where it is labelled "limits
   * recorded" and is the right number for that sentence.
   */
  const openQuestions = useMemo(
    () => stageFacts(warnings).find((fact) => fact.kind === 'open')?.count ?? 0,
    [warnings],
  );
  const figures = ledger(artefacts, list, openQuestions);
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
  /** A lead: same list, same contents entry, but it draws its own heading. */
  const lead = (id: string, title: string, move: Move, body: React.ReactNode) => {
    if (body) sections.push({ id, title, body, move, bare: true });
  };

  /*
   * THE FOUR MOVE LEADS ARE SECTIONS NOW, and that is a fix rather than a
   * refactor. They were passed straight into `panel()`, so they existed only
   * where there were panels — which meant the offline pack, which renders the
   * section list, carried none of them: no exposure bands, no "read these three
   * first", no mechanism chart, and no record of what the run discarded. The
   * regression got worse when the duplicate playbook table was deleted from
   * "Ways to beat it", because the ranked list that replaced it lives in the
   * Threats lead — so a pack lost all forty-seven plays outright.
   *
   * Pushed FIRST, in move order, because `inMove()` preserves push order and
   * the lead is the head of its panel.
   */
  lead('exposure-profile', 'Where the exposure sits', 'verdict',
    <VerdictLead list={list} bands={bands} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={linkTo} />);
  lead('mechanisms', 'The mechanisms that generate the most plays', 'causality',
    <CausalityLead artefacts={artefacts} list={list} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={linkTo} />);
  lead('weights', 'Rank by what you care about', 'threats',
    <ThreatsLead list={list} selection={selection} mechanismIds={mechanismIds} linkTo={linkTo} />);
  /*
   * MOVE 4 GETS THE LEAD IT NEVER HAD. The other three each open with one; this
   * one opened with a twelve-row table, which is why its panel measured 919px
   * against Threats' 6,104px. See `ActorsLead` for what was already written and
   * connected to nothing.
   */
  lead('interplay', 'Who is coming for what', 'actors',
    <ActorsLead interplay={interplayMap} personas={personaGroups} linkTo={linkTo} />);
  lead('discarded', 'What was discarded, and why', 'provenance',
    <ProvenanceLead stages={stages} />);

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
  /*
   * COUNTED FROM WHAT IS THERE, not from the length of the board.
   *
   * A board row survives with a null profile — `actorBoard` maps every actor
   * artefact and attaches `profiles.find(...) ?? null` — so "N further bodies are
   * profiled but run no play" was counting rows, not profiles. On the real run
   * that claimed 159 profiles where 43 exist: 116 of those bodies were named and
   * never profiled at all.
   *
   * And a row is a CANDIDATE, not a body. The 171 rows resolve to 56 distinct
   * names — "Employers" appears 25 times, "Skills England" 23 — because entity
   * resolution deliberately keeps candidates apart rather than merging them. So
   * "of the bodies the paper names" has to count names; the candidate figure
   * belongs in the sentence about resolution, where it means something.
   */
  const names = (rows: typeof board) => new Set(rows.map((a) => a.actor.label.trim().toLowerCase())).size;
  const namedAll = names(board);
  const namedActive = names(active);
  const idleProfiled = board.filter((a) => !a.plays.length && a.profile).length;
  const idleUnprofiled = board.filter((a) => !a.plays.length && !a.profile).length;
  section('actors', 'Who is involved', 'actors', board.length ? (
    <>
      <p className="govuk-body">
        {namedActive} of the {namedAll} bodies the paper names are positioned to run at least
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
      {idleProfiled || idleUnprofiled ? (
        <p className="govuk-body-s prt-meta">
          {idleProfiled ? `${idleProfiled} further ${idleProfiled === 1 ? 'body is' : 'bodies are'} profiled but run no play in this assessment. ` : ''}
          {idleUnprofiled ? `${idleUnprofiled} ${idleUnprofiled === 1 ? 'was' : 'were'} named and never profiled. ` : ''}
          {board.length} candidate records stand for {namedAll} names — entity resolution keeps
          candidates apart rather than merging them, which{' '}
          {/*
            A CROSS-MOVE MENTION IS A CONTROL, NOT PROSE. "How they connect" is a
            section in the Causality panel: one click sideways, named in a
            sentence, with nothing to click and no hint that it was anywhere at
            all. A button rather than an anchor, because following it changes what
            is on the page rather than going to a new one — and a bare `href`
            would be a full reload of a single-page app.
          */}
          <button type="button" className="prt-linkbutton" onClick={() => goTo('causality', 'network')}>
            How they connect
          </button>{' '}
          reports as a finding.
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
    <WriteUp groups={sectionFindings} name={name} offline={offline} />
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
   * it is the working, and it opens on request, and `summarise()` does the split.
   *
   * (It used to say "the same one the write-up uses". That stopped being true
   * when the write-up became a grid of fixed-height cards: it clamps in CSS and
   * splits nothing. Measured on the real run, `summarise()` declines to split ten
   * of its twelve sections, which is why it is not used there.)
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
   * `summarise()` is the split the recommendations use, so one definition of
   * "the first sentence" serves both.
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
    // `readable` repairs one ungrammatical template on its way to the page; see
    // the note on it for why it is not repaired where it is written.
    const { lead, rest } = limitLead(readable(text));
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

  /*
   * A ROW IS DROPPED RATHER THAN GUESSED AT.
   *
   * "the configured default" and "the provider default" are true statements on
   * the service, where a null column means the run took whatever was configured.
   * In a pack made before the run's own facts travelled with it they were
   * guesses, printed with the same confidence as a fact — and the stage row was
   * worse than a guess, because a pack that knows no statuses counts none of them
   * completed. A pack that cannot say stays quiet; the service is unchanged.
   */
  const known = stages.some((stage) => stage.status !== 'unknown');
  /** The models the run was made of. Absent on an unfiltered read; see `detail-views`. */
  const ranOn = detail.models ?? [];
  /*
   * WHAT STOPPED, IN THE MOVE THAT EXISTS FOR WHAT THE RUN DID TO ITSELF.
   *
   * `stage.error` was in the payload and read by nothing: the assessment page
   * suppressed its own task list once a report existed, and `ProvenanceLead`
   * takes `{ warnings }` alone, so a failed stage left no trace anywhere a reader
   * could find it. A run that stopped is a fact about the report's completeness,
   * which is the one thing this section is for.
   */
  const stopped = stages.filter((stage) => stage.status === 'failed');
  section('provenance', 'How this was produced', 'provenance', <>
    {stopped.length ? (
      <InsetText>
        <p className="govuk-body">
          {stopped.length === 1 ? 'One stage did not finish' : `${stopped.length} stages did not finish`}
          {': '}
          {stopped.map((stage) => `${stage.name.toLowerCase()} (stage ${stage.ordinal + 1})`).join(', ')}.
          {' '}Everything below is what the run produced before that, and the work those stages
          would have written is absent rather than filled in.
        </p>
        {stopped.map((stage) => (stage.error ? (
          <p className="govuk-body" key={stage.ordinal}>{stage.error}</p>
        ) : null))}
      </InsetText>
    ) : null}
    <SummaryList
      rows={[
        ...(analysis.model || !offline ? [{ key: 'Commissioned', value: analysis.model ?? 'the configured default' }] : []),
        /*
         * WHAT ACTUALLY RAN, WHERE IT IS NOT WHAT WAS ASKED FOR.
         *
         * `analysis.model` is the model the submission commissioned, and this
         * section presented it as the model the assessment was made with. On
         * 2026-09-20 a stage of the real run was resumed after a restart and went
         * out on `gpt-5.6-sol`, while the other 419 calls had been
         * `gpt-5.6-luna` — so one assessment had been made by two models and the
         * report named one of them.
         *
         * Shown only when the two disagree. On the ordinary run they say the same
         * thing, and a row repeating the row above it is noise.
         */
        ...(ranOn.length && !(ranOn.length === 1 && ranOn[0].id === analysis.model)
          ? [{
              key: 'Ran on',
              value: ranOn
                .map((use) => `${use.id} (${use.calls.toLocaleString()} ${use.calls === 1 ? 'call' : 'calls'})`)
                .join(', '),
            }]
          : []),
        ...(analysis.thinkingLevel || !offline
          ? [{ key: 'Reasoning effort', value: analysis.thinkingLevel ?? 'the provider default' }]
          : []),
        { key: 'Depth', value: analysis.depth },
        { key: 'Sealed', value: analysis.sealed ? 'Yes — none of the paper is stored in the clear' : 'No' },
        ...(known
          ? [{
              key: 'Stages',
              value: `${stages.filter((s) => s.status === 'completed').length} of ${stages.length} completed`,
            }]
          : []),
      ]}
    />
  </>);

  /*
   * THE PAPER ITSELF, IN THE PACK, WHERE A READER CAN FIND IT.
   *
   * A pack carries every `passage` artefact — 264 KiB of the white paper's own
   * wording on the real run — and rendered none of them: passages are drawn by
   * the drill, and a pack has no drill. So they rode inside the JSON island, and
   * Ctrl-F, which this file calls the pack's real interface, cannot see inside a
   * script blob. The README promised "the policy document in full"; the payload's
   * own header says "a report you cannot check against its source is half a
   * report". Both were describing bytes rather than a page.
   *
   * SERVICE-SIDE THIS STAYS ABSENT, deliberately: there the drill renders a
   * passage with the assessment's own quotes marked in it, which is a better
   * reading of the same text than a wall of it, and the passages are one fetch
   * away. The pack has neither.
   *
   * A shared pack has no passages at all — `shareableReport` withholds the
   * document — so this renders nothing there and says nothing about it, because
   * the handling note already does.
   */
  if (offline) {
    const passages = artefacts.filter((a) => a.kind === 'passage');
    if (passages.length) {
      section('paper', 'The paper itself', 'provenance', (
        <>
          <p className="govuk-body">
            Every passage the assessment read, in the order it appears in the document. This is
            here so the report can be checked against its source with no network and nothing to
            open — searching this page searches the paper.
          </p>
          {passages.map((passage) => (
            <div key={passage.id} className="prt-source">
              <p className="govuk-body-s prt-source__cite">
                <strong>{passage.label}</strong>
                {passage.page ? <span className="prt-meta"> · page {passage.page}</span> : null}
              </p>
              <div className="prt-quoted prt-quoted--full">{passage.statement}</div>
            </div>
          ))}
        </>
      ));
    }
  }

  /*
   * THE OFFLINE PACK KEEPS THE CASCADE, and that is not a shortcut.
   *
   * The pack is one file opened from `file://` with every request blocked, and
   * a tabbed spine hides five sixths of a report behind JavaScript. A reader who
   * opens the pack to find what an assessment said should not need script to
   * read it — and `Ctrl-F` across a whole document is the pack's real interface.
   * So the moves are for the service, and the pack stays a document.
   */
  /*
   * THE PACK READS IN MOVE ORDER. The service groups by move because a reader
   * arrives with one of four questions; a pack has no spine to click, so it
   * makes the same grouping the order of the page. `sort` on a copy, and stable,
   * so within a move the order is the order the sections were written in.
   */
  const ordered = offline
    ? [...sections].sort((a, b) => MOVE_ORDER.indexOf(a.move) - MOVE_ORDER.indexOf(b.move))
    : sections;

  if (offline) {
    return (
      /*
        `prt-pack` IS THE PACK'S HALF OF THE REPORT'S STYLING.
        Every density and full-width rule the service gained was scoped to
        `.govuk-tabs__panel`, which a pack has none of — so the pack kept the
        framework's 30em measure, tables that sized to their content, and
        summary lists with a 50% value column. Two artefacts of one assessment
        that disagree about how wide a table is are two reports.
      */
      <div className="prt-pack">
        {/* THE SAME LEAD AS THE SERVICE, and for the same reasons: the headline
            is the one sentence the assessment exists to produce and ran at two
            thirds of the page, and the red-team caveat is true of every report
            ever produced, which makes it a standing note rather than the
            warning box it was given on every one of them. */}
        <div className="prt-lead">
          <AddendumNotice artefacts={artefacts} passes={detail.passes} />
          {headline ? <p className="prt-lead__headline">{headline}</p> : null}
          <p className="prt-lead__caveat">
            A red-team read, not an assurance review. Every profile is a hypothesis about a
            body&rsquo;s incentives — never a finding about a named person.
          </p>
        </div>
        <Contents sections={ordered} />
        {ordered.map((entry) => (entry.bare ? (
          /* It draws its own section and its own heading; a wrapper here would
             print both titles. The way back to the contents still follows it,
             because a pack is one very long page and that link is how a reader
             gets out of the middle of it.

             A FRAGMENT, NOT A DIV — the service branch below has always used one,
             and the difference was invisible until it wasn't. Every density rule
             is written as a pair, `.govuk-tabs__panel > section` and
             `.prt-pack > section`, and a wrapping div breaks the child combinator
             on the pack's half. Measured on a real pack: the eleven sections that
             are direct children get their bottom margin and the rule under their
             heading; these four — where the exposure sits, the mechanisms, the
             weighting, what was discarded, the heads of all four moves — got
             none, and read as a different level of heading than the same heading
             on the service. */
          <Fragment key={entry.id}>
            {entry.body}
            <p className="govuk-body-s govuk-!-margin-top-2">
              <a className="govuk-link" href="#contents">Back to contents</a>
            </p>
          </Fragment>
        ) : (
          <section key={entry.id} aria-labelledby={entry.id}>
            <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
            {entry.body}
            <p className="govuk-body-s govuk-!-margin-top-2">
              <a className="govuk-link" href="#contents">Back to contents</a>
            </p>
          </section>
        )))}
      </div>
    );
  }

  /**
   * Open another move and land on a section inside it.
   *
   * The scroll waits two frames for the same reason `Tabs` does: the panel it is
   * scrolling into has only just been rendered, and the browser clamps the scroll
   * position after the document's height changes.
   */
  const goTo = (next: Move, anchor: string) => {
    setMove(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    }));
  };

  const inMove = (move: Move) => sections.filter((entry) => entry.move === move);
  const panel = (move: Move) => (
    <>
      {/*
        WHAT IS IN THIS PANEL, AT THE TOP OF IT. The Verdict panel is 4,481px with
        six headings, and "What it suggests" — the recommendations, the most
        actionable thing in the report — sits 3,441px down the first view every
        reader lands on, with nothing naming it. The component and every anchor
        already existed; only the pack was getting them.
      */}
      <Contents sections={inMove(move)} id={`contents-${move}`} of={move} />
      {inMove(move).map((entry) => (entry.bare ? (
        <Fragment key={entry.id}>{entry.body}</Fragment>
      ) : (
        <section key={entry.id} aria-labelledby={entry.id}>
          <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
          {entry.body}
        </section>
      )))}
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
        /*
         * THE QUESTION EACH MOVE ANSWERS, ON THE SCREEN.
         *
         * The four questions are what the whole structure is for and they were
         * written down twice — in the comment at the head of this file and in
         * each lead's own prose — and rendered nowhere: scanning the live page
         * for "what did it conclude", "why does it happen", "what could be done"
         * and "who would do it" found none of them. So the spine read
         * "Verdict / Causality / Threats / Actors", which are an analyst's words
         * for four things a reader has not been told the shape of yet.
         *
         * The fifth entry also used to put a noun in the step slot and a sentence
         * in the label slot, which broke the one cue that says the first four are
         * an order. It is "Last" now, and it is a hint like the others.
         */
        tabs={[
          {
            id: 'verdict', step: 'Move 1', label: 'Verdict',
            hint: 'What did it conclude',
            panel: panel('verdict'),
          },
          {
            id: 'causality', step: 'Move 2', label: 'Causality',
            hint: 'Why is any of it possible',
            panel: panel('causality'),
          },
          {
            id: 'threats', step: 'Move 3', label: 'Threats',
            hint: 'What could be done to it',
            panel: panel('threats'),
          },
          {
            id: 'actors', step: 'Move 4', label: 'Actors',
            hint: 'Who would do it',
            panel: panel('actors'),
          },
          {
            id: 'provenance', step: 'Last', label: 'Provenance',
            hint: 'What the run discarded',
            panel: panel('provenance'),
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
