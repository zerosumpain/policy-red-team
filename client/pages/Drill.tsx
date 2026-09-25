import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { explain } from '$lib/policy-analysis/glossary';
import { BAND_LABEL, confidenceJudgement, plays, stageOfId } from '$lib/policy-analysis/view';
import { STAGES, isPassStage } from '$lib/policy-analysis/contracts';
import { edgesOf, nodesOf } from '$lib/policy-analysis/network';
import { citedBy, paperWording, provenance, type StageOf } from '$lib/provenance';
import { linkRecommendation, TIER_LABEL, TIER_RULE, type Tier } from '$lib/recommendation';
import { egoOf, labelIndex } from '$lib/relationships';
import { api, type Detail } from '../api';
import { Details, InsetText, Pagination, SummaryList, Table, Tag, WarningText, type TagColour } from '../govuk';
import { statusColour, statusLabel } from '../status';
import { usePageTitle } from '../layout/Template';
import { ArtefactValue, fieldLabel } from '../report/ArtefactValue';
import { EgoMap } from '../report/EgoMap';
import { Bar } from '../report/Metrics';
import { PlayFlow } from '../report/PlayFlow';
import { describeSelection, parseSelection } from '../report/selection';
import { MOVES } from '../moves';
import { ChainRail, StageRail } from '../report/StageRail';
import { stageMarks, stageSpan, type Rung } from '$lib/stage-rail';
import { Quoted } from '../report/Quoted';
import { TestResult } from '../report/TestResult';

/**
 * THE DRILL — one artefact, opened out, with the chain back to the paper.
 *
 * A PAGE, NOT A DRAWER. The site version is a modal drawer over the dashboard,
 * because that design system has one and the dashboard is a thing you stay on.
 * The GOV.UK Design System has no modal component, deliberately: the pattern is
 * one thing per page, and a layer that traps focus, needs its own Escape
 * handling and keeps a bespoke back stack is three accessibility problems
 * bought to save a page load. A page gets all of that from the browser — the
 * back button IS the trail, the URL is shareable, and the reader can open three
 * findings in three tabs, which no drawer allows.
 *
 * WHY IT RE-FETCHES THE WHOLE ASSESSMENT. `api.detail()` already returns every
 * artefact and the drill needs the whole list anyway: what cites this artefact
 * is a question about all of them, and the chain walks refs across the set.
 * Adding a per-artefact endpoint would mean a second shape of the same data and
 * a second thing to keep in step, for a database that is a file on this disk.
 *
 * IT RUNS TO THE PAGE. Every section here used to sit in a
 * `govuk-grid-column-two-thirds` — the framework's measure for a document — so
 * a 960px row carried 630px of prose with a third of every line empty beside
 * it, and the tables inside those columns were narrower still. The measure is
 * right for the three-line error states, which are prose on an otherwise empty
 * page, and wrong for everything below: this is a record, read in columns and
 * tables and diagrams, not an essay.
 */
export function Drill() {
  const { id = '', artefactId = '' } = useParams();
  /*
   * WHERE THE READER WAS IN THE REPORT, carried in as one opaque string.
   *
   * `Report` owns `?move=…&sel=…`; the link into this page appends it as
   * `?from=<encoded>`. Nothing here parses a route out of it — `parseSelection`
   * resolves the selection against this assessment's own artefacts, and an id
   * that is no longer in the run comes back as null rather than as a label that
   * lies.
   */
  const [search] = useSearchParams();
  const from = search.get('from') ?? '';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // CLEARED FIRST. One component instance serves every artefact of every
    // assessment, so without this a failed load on assessment A leaves its error
    // paragraph on assessment B for good, and a successful one renders B's
    // artefact id against A's artefact list for a paint — a flash of "that is
    // not in this assessment" on a page that is about to load fine.
    setError(null);
    setDetail(null);
    api.detail(id)
      .then((data) => { if (live) setDetail(data); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [id]);

  // Derived above the early returns because `usePageTitle` is a hook and a hook
  // cannot sit behind one. Opening three findings in three tabs was the argument
  // for this being a page rather than a drawer, and three tabs all reading
  // "Policy Red Team" is that argument not actually working.
  const artefact = detail?.artefacts.find((a) => a.id === artefactId) ?? null;
  usePageTitle(artefact?.label);
  /*
   * ONLY WHEN THERE IS SOMETHING TO DRAW.
   *
   * `network()` resolves duplicate bodies across the whole inventory, and the
   * section it feeds appears only for an artefact that is an end of a stated
   * relationship — which most are not: a finding, a play, a passage and every
   * profile have none. A scan for "is this id an edge endpoint" is a fraction
   * of the cost and answers the question the memo was being paid for.
   */
  const inGraph = useMemo(
    () => !!detail?.artefacts.some((a) => a.kind === 'edge' && (a.fromId === artefactId || a.toId === artefactId)),
    [detail, artefactId],
  );
  /*
   * ONLY THE GRAPH, NOT THE WHOLE NETWORK.
   *
   * `network()` returns nodes and edges plus the family panels and the eight
   * structural insights — seven `edges.filter` passes, an `ends()` walk over
   * every edge five times, and a duplicate-body union-find — and the two things
   * this page asks it for, `labelIndex` and `egoOf`, read nodes and edges and
   * nothing else. Timed against the real 2,265-artefact run: `network()` is
   * 43.5ms on the first call where `edgesOf` + `nodesOf` are 0.78ms.
   *
   * The two cannot disagree, because `network()` is itself these two plus the
   * parts nobody here wanted. And it stays in this file rather than becoming a
   * `graphOf()` in `network.ts`, which is a verbatim upstream copy where a hand
   * edit is reverted by the next sync.
   */
  const net = useMemo(() => {
    if (!detail || !inGraph) return null;
    const edges = edgesOf(detail.artefacts);
    return { edges, nodes: nodesOf(detail.artefacts, edges) };
  }, [detail, inGraph]);

  /** The way back, with the reading position on it where there is one. */
  const backHref = from ? `/assessments/${id}?${from}` : `/assessments/${id}`;

  // A PAGE, not a red sentence. `govuk-error-message` is the field-level class;
  // used alone it left <main> with no h1 at all, nothing announced, and a
  // screen-reader user following a link into a purged assessment heard silence.
  if (error) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds" role="alert">
          <h1 className="govuk-heading-l">There is a problem</h1>
          <p className="govuk-body">{error}</p>
          <p className="govuk-body">
            <Link className="govuk-link" to={backHref}>Go back to the assessment</Link>
          </p>
        </div>
      </div>
    );
  }
  // A HEADING WHILE IT LOADS. Returning only a paragraph left the page with no
  // h1 at all until the fetch resolved, so a reader who followed a link and
  // pressed "next heading" found nothing to tell them where they had arrived.
  if (!detail) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">Loading this record</h1>
          <p className="govuk-body">Fetching the assessment it belongs to.</p>
        </div>
      </div>
    );
  }

  const all = detail.artefacts;

  if (!artefact) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">That is not in this assessment</h1>
          <p className="govuk-body">
            Nothing here is identified as <code>{artefactId}</code>. It may belong to a different
            assessment, or to a stage this one did not reach.
          </p>
          <p className="govuk-body">
            <Link className="govuk-link" to={backHref}>Go back to the assessment</Link>
          </p>
        </div>
      </div>
    );
  }

  // The position travels with every step sideways too: following four plays in
  // a row through the pagination below and then pressing Back should return to
  // the move and the selection the first one was opened from, not to Move 1.
  const to = (target: Artefact) => `/assessments/${id}/artefacts/${encodeURIComponent(target.id)}`
    + (from ? `?from=${encodeURIComponent(from)}` : '');
  const link = (target: Artefact) => <Link className="govuk-link" to={to(target)}>{target.label}</Link>;
  const byId = new Map(all.map((a) => [a.id, a]));
  // Indexed once. `net.nodes.find(...)` is a scan of four hundred entities, and
  // the ego map asks for a label per spoke.
  const nodes = net ? labelIndex(net) : null;
  const nodeLabel = (target: string) => nodes?.get(target)?.label ?? byId.get(target)?.label ?? target;
  const nodeKind = (target: string) => nodes?.get(target)?.kind ?? byId.get(target)?.kind ?? '';
  const linkById = (target: string) => {
    const found = byId.get(target);
    return found ? link(found) : nodeLabel(target);
  };

  // The stage off the ROW, not off the id. The twelve structural checks are
  // minted as `test_adaptability` with no `s<n>_` prefix, so an id-derived stage
  // reads 0 and the page would tell a reader that a check was produced during
  // document ingestion. `detail()` has always sent the true figure.
  const rows = new Map(detail.artefactMetadata.map((row) => [row.id, row]));
  const stageOf: StageOf = (target) => rows.get(target)?.stage ?? stageOfId(target);

  /** The stage that actually stopped — read, not assumed to be the last one. */
  const stoppedAt = detail.stages.find((row) => row.status === 'failed') ?? null;

  const stage = stageOf(artefact.id);
  const producedAt = rows.get(artefact.id)?.updatedAt ?? null;
  const chain = provenance(artefact.id, all, { stageOf });
  const cites = citedBy(artefact.id, all, undefined, stageOf);
  const list = plays(all);

  /*
   * THE EIGHTEEN-STAGE SCALE THIS PAGE CITES 33 TIMES AND NEVER DREW.
   *
   * The meta line says "produced at stage 11" and the provenance ladder prints
   * a stage tag beside every one of the 32 items below it. `StageRail` is that
   * axis; `stageMarks` is what goes on it. The arithmetic is in `$lib` with a
   * test because three of its four rules — the uncapped citing set, the pass
   * ordinals, the rung with nothing on the scale — are wrong in a way no
   * screenshot reveals, and one of them only when a figure exceeds a cap.
   */
  const rail = stageMarks({
    artefactId: artefact.id,
    all,
    hops: chain.hops,
    chainSources: chain.sources,
    stageOf,
    stageCount: STAGES.length,
  });
  const sourceStages = rail.sources;
  const citingStages = rail.citing;
  const rungs: Rung[] = rail.rungs;
  const play = list.find((p) => p.artefact.id === artefact.id) ?? null;

  /*
   * THE MARKS ON THE PAPER'S OWN WORDING.
   *
   * Every artefact between here and a passage carries the span it quoted.
   * Collected, they are exactly the clauses this artefact was built from —
   * which is what a reader is hunting for in a two-thousand-word passage and
   * had no way to find. The artefact's own quote leads the list because where
   * it has one it is the closest thing to the point.
   */
  const marks = [
    artefact.sourceQuote,
    ...chain.hops.flatMap((hop) => hop.items.map((item) => item.sourceQuote)),
  ];

  // A profile describes an actor; an actor is described by a profile. Either way
  // the reader wants both, so whichever they opened, find the other.
  const profile = artefact.kind === 'profile'
    ? artefact
    : all.find((a) => a.kind === 'profile' && a.data.actorId === artefact.id) ?? null;
  const actorId = artefact.kind === 'profile' ? String(artefact.data.actorId ?? '') : artefact.id;
  const couldRun = artefact.kind === 'actor' || artefact.kind === 'profile'
    ? list.filter((p) => p.actor?.id === actorId)
    : [];
  // Rank over the WHOLE playbook, never within this actor's handful — "third
  // worst of everything" and "this body's third" are different claims.
  const rankOf = (playId: string) => list.findIndex((p) => p.artefact.id === playId) + 1;

  const origin = explain(artefact.origin);
  // Most artefacts are not in the graph at all — a finding, a play and a passage
  // have no stated relationships — so this section simply does not appear for them.
  const ego = net ? egoOf(net, artefact.id) : { node: null, out: [], in: [] };
  // A passage IS the document's text; everything downstream quotes a span of
  // one. The section reads differently depending on which of those this is.
  const wording = paperWording(artefact);

  /*
   * THE INDEX, BUILT FROM THE SAME EXPRESSIONS THE SECTIONS ARE.
   *
   * This is the longest page in the application — four 1,600px slices at 1280
   * and the content is still running at the foot of the fourth — and it was the
   * only long one with no contents. The report gives its 2-to-6-section panels
   * one and the offline pack gives its fifteen sections one. The cost is
   * concrete: "Where this stands" — how it was arrived at, evidence standing,
   * when it was produced — sits at y≈2,276px, below seven paragraphs of
   * model-written narrative, and "What rests on this" is past 6,400px with
   * nothing naming it.
   *
   * IN RENDER ORDER AND UNDER THE SAME CONDITIONS, so the index can never name
   * a section that did not draw: a profile, a play, a recommendation and a
   * passage each produce a different subset of the ten. The ids are the
   * `aria-labelledby` values already on the page, and the titles are built from
   * the same expressions as the headings rather than retyped — several are
   * dynamic, and a retyped "What rests on this — 37" is a number that goes
   * stale on the next assessment.
   */
  const contents: { id: string; title: string }[] = [];
  const entry = (when: unknown, id: string, title: string) => { if (when) contents.push({ id, title }); };
  entry(play, 'play', 'How this would be run');
  entry(artefact.kind === 'recommendation', 'tackles', 'What this would tackle');
  entry(profile && profileLead(profile).length, 'profile', 'What this body is playing for');
  entry(couldRun.length, 'could-run',
    `What it could run — ${couldRun.length} ${couldRun.length === 1 ? 'way' : 'ways'} to beat the policy`);
  entry(ego.node && (ego.in.length || ego.out.length), 'connects',
    `What connects to this — ${ego.in.length + ego.out.length} ${ego.in.length + ego.out.length === 1 ? 'relationship' : 'relationships'} the paper states`);
  entry(true, 'standing', 'Where this stands');
  entry(wording, 'quoted',
    artefact.kind === 'passage' ? 'The passage, as the paper has it' : "The paper's own wording");
  entry(true, 'chain', 'What it rests on');
  entry(cites.total, 'cited-by', `What rests on this — ${cites.total}`);
  entry(true, 'fields', 'Everything recorded about it');

  /*
   * THE NEXT PLAY, WITHOUT A ROUND TRIP THROUGH THE REPORT.
   *
   * The page says a play is rank 3 of 47 and offered no way to read rank 4;
   * reading the playbook one play at a time — which is what Move 3's ranked
   * list invites — cost a back link, finding your place in a 47-row table, a
   * click and a fetch for every step.
   *
   * FOR A PLAY ONLY. A recommendation has four assured entries on this run, all
   * of them on one screen in Move 1, so a control to step between them is
   * chrome; and an actor, a passage or an assumption sits in no order the
   * assessment asserts, so numbering them would be inventing one.
   */
  const rank = play ? list.findIndex((p) => p.artefact.id === artefact.id) : -1;
  const previousPlay = rank > 0 ? list[rank - 1] : null;
  const nextPlay = rank >= 0 && rank < list.length - 1 ? list[rank + 1] : null;

  /*
   * WHAT THE READER IS GOING BACK TO, IN THE BANNER'S OWN WORDS.
   *
   * The back link at the top of the page names the move; only this page holds
   * the artefacts, so only this page can resolve `sel=actor:<id>` into "showing
   * what “Department for Education” is positioned to run". `describeSelection`
   * is the sentence the report's own selection banner prints, so the reader
   * meets the same relationship worded the same way at both ends of the trip.
   */
  const fromParams = new URLSearchParams(from);
  const fromSelection = parseSelection(fromParams.get('sel'), all);
  const fromMove = MOVES.find((move) => move.id === fromParams.get('move'));
  const returnLabel = [
    fromMove ? `Back to ${fromMove.step} · ${fromMove.label}` : 'Back to the assessment',
    // `describeSelection` writes a standalone sentence; here it is the tail of
    // one, so the capital and the full stop come off rather than being written
    // twice in two files that could then disagree.
    fromSelection
      ? `${describeSelection(fromSelection).charAt(0).toLowerCase()}${describeSelection(fromSelection).slice(1).replace(/\.$/, '')}`
      : '',
  ].filter(Boolean).join(' — ');

  return (
    <div className="prt-drill">
      {/*
        THE CAPTION NAMES THE PAPER *AND* SAYS WHAT STATE THE RUN IS IN.

        It named the paper alone — "Education" over the artefact's title — and
        this page's own header comment argues it exists so a reader can open
        three findings in three tabs and send someone a URL, which makes
        arriving here with no memory of the assessment page the common case
        rather than the odd one. The assessment page carries a status tag above
        the same data; quoting an artefact out of a run that finished with gaps,
        without knowing it finished with gaps, is the thing that qualification
        exists to prevent.

        `statusLabel`/`statusColour` are the same two functions the landing
        table and the assessment header use, so there is no third opinion about
        what a status is called. `.prt-pagehead__status` is the row those two
        already sit in, and it draws the separators.

        THE TITLE IS A LINK. It is the one noun on the page that names something
        a reader would want to open and was not clickable.
      */}
      <p className="prt-pagehead__status govuk-!-margin-bottom-2">
        {/* A plain link at body size, not `govuk-caption-l`: the two classes
            disagree about colour and about size, and which of them won would be
            decided by their order in the stylesheet rather than by anybody. */}
        <Link className="govuk-link" to={`/assessments/${id}`}>{detail.analysis.title}</Link>
        <Tag colour={statusColour(detail.analysis.status) as TagColour}>
          {statusLabel(detail.analysis.status)}
        </Tag>
        {/* Dead on a clean run, and on this one: the live assessment is
            `completed_with_gaps`. The stage is READ off the rows rather than
            assumed to be the last, exactly as the assessment page does it. */}
        {stoppedAt ? (
          <span className="prt-meta">
            It stopped in {stoppedAt.name.toLowerCase()} — stage {stoppedAt.ordinal + 1} of{' '}
            {detail.stages.length}
          </span>
        ) : null}
      </p>
      {/*
        MATERIAL ATTACHED AFTER THE REPORT WAS WRITTEN.

        `AddendumNotice` is the component that says this inside the report, and
        it is deliberately NOT reused here: its last sentence is "What came
        after this was written, below, says which", and that section is on the
        assessment page, not on this one. A notice that points at something the
        page does not have is worse than a shorter one that points at the page
        that does. `passes` is empty on the live run, so this costs a clean
        report nothing.
      */}
      {detail.passes.length ? (
        <WarningText>
          This assessment has been added to since this was written — {detail.passes.length}{' '}
          {detail.passes.length === 1 ? 'later pass' : 'later passes'} over it. The assessment
          records what was attached and which conclusions it moved.
        </WarningText>
      ) : null}
      <h1 className="govuk-heading-l">{artefact.label}</h1>
      {/*
        THE CAPTION CARRIES THE RAIL IN WORDS, and it comes first.

        The rail below is `aria-hidden` and is hidden outright below tablet, so
        this sentence is what print, a phone and a screen reader get — which
        means it has to say the same three things the picture does rather than
        being a label on it. "of {STAGES.length}" is the half that was missing:
        "produced at stage 11" was a number on a scale the page never stated.
      */}
      <p className="govuk-body-s prt-meta">
        {fieldLabel(artefact.kind)} · {producedIn(stage)}
        {stageSpan(sourceStages) ? <>. Built from work at {stageSpan(sourceStages)}</> : null}
        {citingStages.size
          ? <>. Cited from {citingStages.size} {citingStages.size === 1 ? 'stage' : 'stages'}</>
          : null}
        .
      </p>
      {/* No rail for a pass artefact: its ordinal is off the end of the scale,
          and a rail with nothing marked on it reads as "stage 1". */}
      {isPassStage(stage) ? null : (
        <StageRail stages={STAGES} own={stage} sources={sourceStages} citing={citingStages} />
      )}
      {/* A PASSAGE'S STATEMENT IS ITS WORDING, and the section below sets
          it as the quotation it is. Printing both put the same text on the
          page twice — invisible against the fixture, obvious the moment a
          real paper was ingested. */}
      {artefact.kind === 'passage' ? null : <p className="prt-drill__lead">{artefact.statement}</p>}
      {artefact.origin === 'behavioural_hypothesis' || artefact.kind === 'profile' ? (
        <WarningText>
          This is a hypothesis about what a body's position rewards. It is not a finding about
          any named person.
        </WarningText>
      ) : null}

      <DrillContents sections={contents} of={artefact.label} />

      {play ? <PlaySection play={play} resolve={(rid) => byId.get(rid) ?? null} linkTo={link} /> : null}

      {artefact.kind === 'recommendation' ? (
        <RecommendationSection artefact={artefact} all={all} plays={list} link={link} rankOf={rankOf} />
      ) : null}

      {profile ? <ProfileSection profile={profile} /> : null}

      {couldRun.length ? (
        <section aria-labelledby="could-run">
          <h2 className="govuk-heading-m" id="could-run">
            What it could run — {couldRun.length} {couldRun.length === 1 ? 'way' : 'ways'} to beat the policy
          </h2>
          {/*
            THE BAND IS A BAND, NOT A WORD IN A CELL. This table printed
            "Severe" as plain text beside "0.73" as plain text, which is the
            report's own ranking rendered as the least legible thing on the
            page — a reader could not tell at a glance whether a body's four
            plays were four severe ones or one severe and three limited.
          */}
          <Table
            caption="Ranked against every way to beat the policy, not against each other"
            captionSize="s"
            scroll
            columns={[
              { header: 'Rank', numeric: true, width: '5rem' },
              { header: 'Play' },
              { header: 'Band', width: '9rem' },
              { header: 'Exposure', numeric: true, width: '11rem' },
            ]}
            rows={couldRun.map((p) => [
              String(rankOf(p.artefact.id)),
              link(p.artefact),
              <span className={`prt-band prt-band--${p.band}`}>{BAND_LABEL[p.band]}</span>,
              <Bar value={p.exposure} />,
            ])}
          />
        </section>
      ) : null}

      {ego.node && (ego.in.length || ego.out.length) ? (
        <section aria-labelledby="connects">
          <h2 className="govuk-heading-m" id="connects">
            What connects to this — {ego.in.length + ego.out.length}{' '}
            {ego.in.length + ego.out.length === 1 ? 'relationship' : 'relationships'} the paper states
          </h2>
          {!ego.in.length && ego.out.length > 2 ? (
            <WarningText>
              The paper gives this {ego.out.length} things to do and points nothing back at it. A
              duty nobody is wired to is a duty nobody is holding.
            </WarningText>
          ) : null}
          <EgoMap node={ego.node} incoming={ego.in} outgoing={ego.out} kindOf={nodeKind} linkFor={linkById} />
        </section>
      ) : null}

      <section aria-labelledby="standing">
        <h2 className="govuk-heading-m" id="standing">Where this stands</h2>
        <SummaryList
          rows={[
            {
              key: 'How it was arrived at',
              value: (
                <>
                  {fieldLabel(artefact.origin)}
                  {origin ? <><br /><span className="prt-meta">{origin.read}</span></> : null}
                </>
              ),
            },
            {
              key: 'Evidence standing',
              value: (
                <>
                  {confidenceJudgement(artefact)}
                  <br />
                  <span className="prt-meta">A qualitative judgement, not a probability.</span>
                </>
              ),
            },
            ...(producedAt
              ? [{
                  key: 'Produced',
                  value: new Date(producedAt).toLocaleString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  }),
                }]
              : []),
            ...(artefact.page || artefact.section
              ? [{ key: 'Where in the paper', value: whereInThePaper(artefact) }]
              : []),
            ...(artefact.relation ? [{ key: 'Relation', value: fieldLabel(artefact.relation) }] : []),
            ...(artefact.temporal ? [{ key: 'Time', value: fieldLabel(artefact.temporal) }] : []),
          ]}
        />
      </section>

      {wording ? (
        <section aria-labelledby="quoted">
          <h2 className="govuk-heading-m" id="quoted">
            {artefact.kind === 'passage' ? 'The passage, as the paper has it' : "The paper's own wording"}
          </h2>
          {/* A PASSAGE opened directly is marked with everything downstream of
              it quoted; anything else IS the quote and needs no marking. */}
          {artefact.kind === 'passage'
            ? <Quoted text={wording} quotes={quotesInto(artefact.id, all)} />
            : <InsetText>{wording}</InsetText>}
          <p className="govuk-body-s prt-meta">
            Located by normalising line breaks and hyphenation, so it reads as the document has
            it rather than as it was typed back.
          </p>
        </section>
      ) : null}

      {artefact.url ? (
        <p className="govuk-body">
          <a className="govuk-link" href={artefact.url} rel="noreferrer noopener external" target="_blank">
            Open the source this cites (opens in a new tab)
          </a>
        </p>
      ) : null}

      <Chain chain={chain} link={link} stageOf={stageOf} marks={marks} kind={artefact.kind} own={stage} rungs={rungs} />

      {cites.total ? (
        <section aria-labelledby="cited-by">
          <h2 className="govuk-heading-m" id="cited-by">What rests on this — {cites.total}</h2>
          <p className="govuk-body">
            What the assessment would have to revisit if this turned out to be wrong.
          </p>
          <ArtefactList items={cites.items} link={link} stageOf={stageOf} />
          {cites.total > cites.items.length ? (
            <p className="govuk-body-s">Showing the first {cites.items.length} of {cites.total}.</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="fields">
        <h2 className="govuk-heading-m" id="fields">Everything recorded about it</h2>
        <Details summary="Every structured field">
          <ArtefactValue value={artefact.data} byId={byId} linkTo={link} />
        </Details>
        <p className="govuk-body-s prt-meta">Identified in this assessment as {artefact.id}.</p>
      </section>

      {/* The neighbours in the playbook's own ranking, labelled with their rank
          and their name — "Previous: 2. Visible collaboration with minimal
          substantive change" — so the reader knows what they are stepping to
          rather than only that there is something there.

          `label` is set because this page has two navigation landmarks: the
          back link at the top is `<nav aria-label="Back">`, and two landmarks
          a screen reader cannot tell apart is axe's `landmark-unique`. */}
      <Pagination
        label="Ways to beat it, by rank"
        previous={previousPlay ? {
          href: to(previousPlay.artefact),
          title: 'Previous',
          label: `${rank}. ${previousPlay.artefact.label}`,
        } : null}
        next={nextPlay ? {
          href: to(nextPlay.artefact),
          title: 'Next',
          label: `${rank + 2}. ${nextPlay.artefact.label}`,
        } : null}
        render={({ href, className, rel, children }) => (
          <Link to={href} className={className} rel={rel}>{children}</Link>
        )}
      />

      {/* THE WAY BACK, NAMED, at the end of a 6,400px page. The back link at the
          top names the move; this one names the move AND the selection, which
          only this page can resolve. */}
      <p className="govuk-body govuk-!-margin-top-6">
        <Link className="govuk-link" to={backHref}>{returnLabel}</Link>
      </p>
    </div>
  );
}

/**
 * THE INDEX FOR THE LONGEST PAGE IN THE APPLICATION.
 *
 * Markup, classes and the `aria-label` are deliberately identical to the
 * report's own `Contents` — same `<nav>`, same `govuk-list--number`, same
 * "Contents of {what}" naming, which exists because below the tablet breakpoint
 * every panel is on the page at once and five `<nav aria-label="Contents">`
 * elements are five landmarks a screen-reader user cannot tell apart.
 *
 * IT IS A LOCAL COPY ON PURPOSE, FOR NOW. That component still lives inside
 * `Report.tsx`, which this page must not import: `Report.tsx` is the report
 * spine and pulls the whole report tree behind it. When `Contents` is extracted
 * to `client/report/Contents.tsx` — which is a change of its own — this
 * function goes and the import takes its place.
 *
 * THE `< 3` GUARD STAYS HERE, unlike in the report's panels. A passage renders
 * three sections in about 2,000px, and a three-item index over that is chrome.
 */
function DrillContents({ sections, of }: { sections: { id: string; title: string }[]; of: string }) {
  if (sections.length < 3) return null;
  return (
    <nav className="govuk-!-margin-bottom-6" aria-label={`Contents of ${of}`}>
      <h2 className="govuk-heading-s" id="contents-drill">Contents</h2>
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
 * Every quote taken OUT of this passage, by anything in the assessment.
 *
 * The inverse of the chain's marks: opened on a passage, the interesting
 * question is which parts of it the run actually used — and the answer is the
 * `sourceQuote` of everything that cites it.
 */
function quotesInto(passageId: string, all: Artefact[]): (string | null | undefined)[] {
  return all.filter((a) => (a.refs ?? []).includes(passageId)).map((a) => a.sourceQuote);
}

/**
 * A list of artefacts as links, each labelled with what kind of thing it is.
 *
 * THE SAME NAME FOUR TIMES IS THE DATA, AND STILL READS AS A FAULT. Entity
 * resolution keeps ambiguous candidates apart rather than merging them — which
 * is a deliberate choice the network section reports as a finding — so a rung
 * of the ladder printed "Universities · Actor, stage 2" four times in a row and
 * looked like a rendering bug. Collapsing them with the count says the same
 * thing truthfully and in one line; the first is the way in and every candidate
 * is reachable from it.
 */
function ArtefactList({ items, link, stageOf }: { items: Artefact[]; link: (a: Artefact) => React.ReactNode; stageOf: StageOf }) {
  const grouped = new Map<string, Artefact[]>();
  for (const item of items) {
    const key = `${item.kind}\u0000${item.label}\u0000${stageOf(item.id)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return (
    <ul className="govuk-list govuk-list--bullet">
      {[...grouped.values()].map((group) => (
        <li key={group[0].id}>
          {link(group[0])}{' '}
          <span className="prt-meta">
            {fieldLabel(group[0].kind)}, {stageTag(stageOf(group[0].id))}
            {group.length > 1
              ? ` · ${group.length} candidates the assessment kept apart`
              : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * THE CHAIN — the section this whole page exists for.
 *
 * The report says a body could do something. This says the assessment reached
 * that through these eleven things, and the bottom of the ladder is three
 * sentences of the paper you can go and read. A reader who disagrees with a
 * finding can now argue with a specific step rather than with the tool.
 *
 * A STEP IS EXPLAINED, NOT NUMBERED. It said "What it cites directly — 7",
 * "Second step back — 31", "Third step back — 44", with no statement anywhere
 * of what a step IS — so a reader could not tell whether the lists were getting
 * more fundamental or less, nor why one should get LONGER the further back it
 * goes. Each rung now says what that distance means, and the section opens by
 * saying what the ladder is: the stages of the run, walked in reverse, ending
 * at the document.
 */
function Chain({ chain, link, stageOf, marks, kind, own, rungs }: {
  chain: ReturnType<typeof provenance>;
  link: (a: Artefact) => React.ReactNode;
  stageOf: StageOf;
  /** Quotes to mark in the passages at the foot of the ladder. */
  marks: (string | null | undefined)[];
  kind: string;
  /** The stage this page's own artefact was produced at — the rungs are measured from it. */
  own: number;
  /** The same rungs, reduced to the stage span and item count the rail draws. */
  rungs: Rung[];
}) {
  const steps = chain.hops.length;
  const thing = kind === 'exploit' ? 'play' : kind === 'recommendation' ? 'recommendation' : 'finding';
  /*
   * ONLY CLAIMED WHERE IT IS TRUE. A recommendation's rungs print 10 → 200 → 90
   * on the real run: the third is smaller because the walk hit its 300-node cap
   * mid-rung, which is a fact about the cap and not about the pipeline. The
   * InsetText below already says the chain was cut; the sentence promising growth
   * was contradicting it two paragraphs earlier.
   */
  const growing = chain.stoppedBy !== 'nodes'
    && chain.hops.every((hop, i) => i === 0 || hop.items.length >= chain.hops[i - 1].items.length);

  return (
    <section aria-labelledby="chain">
      <h2 className="govuk-heading-m" id="chain">What it rests on</h2>

      {steps === 0 && chain.unresolved ? (
        /* Every ref resolved to nothing. Saying "it cites nothing" here
           would be a false statement about the assessment: it cites things
           this copy does not contain. */
        <p className="govuk-body">
          It rests on {chain.unresolved} {chain.unresolved === 1 ? 'thing' : 'things'} that are
          not in this copy of the assessment. A shared copy withholds the paper itself and
          anything read directly off it.
        </p>
      ) : steps === 0 ? (
        <p className="govuk-body">
          This cites nothing else in the assessment. It is either read straight off the paper or
          established by a stage that works from the document rather than from earlier findings.
        </p>
      ) : (
        <>
          {/*
            WHAT A STEP IS. Without this the rungs below are three numbers with
            no scale: a reader cannot tell whether "third step back" is closer
            to the paper or further from it, and the counts rising with distance
            looks like a fault rather than the shape of a pipeline where every
            stage reads several things from the stage below it.
          */}
          {/*
            A STEP IS A CITATION, NOT A STAGE — which is what the walk actually
            follows, and saying otherwise put the page at odds with itself. The
            rung headed "one stage of the run away" listed items the tags beside
            them called stage 2, nine stages back, on a play produced at stage 11;
            on the real run 74% of a play's direct citations are nine stages back
            and 2% are one. Each rung now reads its own items and says where they
            were written, so the gloss and the tags cannot disagree.
          */}
          <p className="govuk-body">
            Each step back follows what the last one cited. What this {thing} cites directly was
            written by whichever stage established it — often several stages earlier, not the one
            before — and what <em>those</em> cite was written earlier still, down to the paper
            itself.
            {growing
              ? ' The lists get longer going back, because a stage reads several things from the work below it.'
              : ''}
          </p>
          <p className="govuk-body">
            Followed back {steps} {steps === 1 ? 'step' : 'steps'}, through {chain.reached}{' '}
            {chain.reached === 1 ? 'thing the assessment established' : 'things the assessment established'}
            {chain.sources.length
              ? `, ending at ${chain.sources.length} ${chain.sources.length === 1 ? 'passage' : 'passages'} of the paper itself.`
              : '. None of them quotes the paper directly.'}
            {chain.unresolved
              ? ` ${chain.unresolved} further ${chain.unresolved === 1 ? 'reference is' : 'references are'} not in this copy.`
              : ''}
          </p>
        </>
      )}

      {/* Two different reasons to stop, and they are not the same sentence.
          One boolean meant telling a reader the list would have been too
          long when in fact the ladder was deeper than we followed it. */}
      {chain.stoppedBy === 'nodes' ? (
        <InsetText>
          The chain goes further than this. It was followed to {chain.reached} things and
          stopped — not because there was nothing else, but because a list longer than this
          answers nothing.
        </InsetText>
      ) : chain.stoppedBy === 'depth' ? (
        <InsetText>
          The chain goes deeper than this. It was followed back {steps} steps and stopped there;
          what those rest on in turn is reachable by opening any of them.
        </InsetText>
      ) : null}

      {/* THE WALK, ON THE AXIS THE ITEMS' OWN TAGS ARE MEASURED IN. Drawn only
          where the artefact has a place on that axis: a pass artefact's ordinal
          is off the end of it. */}
      {isPassStage(own) ? null : (
        <ChainRail stages={STAGES} own={own} rungs={rungs} rungId={rungIdOf} />
      )}

      <div className="prt-ladder">
        {chain.hops.map((hop) => (
          <div key={hop.depth} className="prt-ladder__rung">
            {/* The id is what a band on the rail above points at. */}
            <h3 className="govuk-heading-s prt-ladder__head" id={rungIdOf(hop.depth)}>
              {hop.depth === 1 ? 'What it cites directly' : `${ordinal(hop.depth)} step back`}
              {' — '}{hop.items.length}
            </h3>
            <p className="govuk-body-s prt-meta prt-ladder__gloss">
              {stepGloss(hop.depth, thing, hop.items, stageOf, own)}
            </p>
            <ArtefactList items={hop.items} link={link} stageOf={stageOf} />
          </div>
        ))}
      </div>

      {chain.sources.length ? <Paper sources={chain.sources} link={link} stageOf={stageOf} marks={marks} /> : null}
    </section>
  );
}

/**
 * THE BOTTOM OF THE LADDER — and it is not all passages.
 *
 * `provenance()` collects a source from every ancestor that has any paper
 * wording, which for anything but a passage is its own `sourceQuote` — the clause
 * that artefact pulled out, not the passage it came from. Both belong here: the
 * chain really did end at the paper through them. What was wrong was calling all
 * of them passages and then ordering the whole set by page alone.
 *
 * Measured on one recommendation of the real run: 85 "passages", of which 3 were
 * passages and the rest were 40 edges, 17 claims, 15 mechanisms and 10 actors.
 * The six shown were 251, 63, 130, 24, 247 and 38 characters — one of them a
 * body's name quoted inside its own highlight — while the 1,196- and
 * 3,616-character passages the chain actually reached sat below a shut
 * disclosure, because page order put short fragments from page 5 above them.
 *
 * So passages lead, quotations follow, page order holds within each, and the
 * heading counts the two separately. Nothing is dropped and nothing is reordered
 * that a reader was relying on.
 */
function Paper({ sources, link, stageOf, marks }: {
  sources: Artefact[];
  link: (a: Artefact) => React.ReactNode;
  stageOf: StageOf;
  marks: (string | null | undefined)[];
}) {
  const passages = sources.filter((s) => s.kind === 'passage');
  const quotations = sources.filter((s) => s.kind !== 'passage');
  const ordered = [...passages, ...quotations];
  const shown = ordered.slice(0, 6);
  const rest = ordered.slice(6);
  const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

  return (
    <>
      <h3 className="govuk-heading-s">
        Back at the paper — {passages.length && quotations.length
          ? `${count(passages.length, 'passage')} and ${count(quotations.length, 'quotation')}`
          : passages.length
            ? count(passages.length, 'passage')
            : count(quotations.length, 'quotation')}
      </h3>
      <p className="govuk-body">
        The document&rsquo;s own wording. Everything above was built from these.
        {quotations.length ? (
          <> A <em>quotation</em> is the clause one of the things above recorded; the passage it
          was taken from is not itself in this chain. Passages come first, then quotations, each
          in the order they appear in the paper.</>
        ) : (
          <> They are in the order they appear there.</>
        )}
      </p>
      {shown.map((source) => (
        <div key={source.id} className="prt-source">
          {/* Attribution above the quotation, the way a citation reads —
              and nothing at all where the document has no pages, because
              "page not recorded" is noise on every passage of a .txt. */}
          <p className="govuk-body-s prt-source__cite">
            {link(source)}
            {source.kind === 'passage' ? null : (
              <span className="prt-meta"> · quoted by this {fieldLabel(source.kind).toLowerCase()}</span>
            )}
            {source.page ? <span className="prt-meta"> · page {source.page}</span> : null}
          </p>
          {/* MARKED, because otherwise this is two thousand words and the
              reader is looking for one clause. The marks are the quotes the
              chain's own artefacts recorded, not a keyword search. */}
          <Quoted text={paperWording(source) ?? ''} quotes={marks} />
        </div>
      ))}
      {rest.length ? (
        <Details summary={`The other ${rest.length} ${rest.length === 1 ? 'one' : 'of them'}`}>
          <ArtefactList items={rest} link={link} stageOf={stageOf} />
        </Details>
      ) : null}
    </>
  );
}

/** The rung a band on the stage rail points at. */
const rungIdOf = (depth: number) => `rung-${depth}`;

/**
 * What a given rung actually is, read off the rung.
 *
 * Deliberately concrete rather than generic: "one stage earlier" tells a reader
 * nothing they could not read off the number. What they want to know is how far
 * from the document they now are, because that is what decides how much of what
 * they are reading is the paper and how much is the tool.
 *
 * IT HAS TO BE MEASURED, NOT ASSERTED. This used to hard-code the distance —
 * depth 1 was "one stage of the run away", depth 3 was "most of what is listed
 * was read off the document" — and both were wrong on the real run, above lists
 * whose own stage tags said so on the same line. Depth 1 is nine stages back 74%
 * of the time for a play; depth 3 is a direct reading of the paper 53–64% of the
 * time, and on one recommendation the whole rung is deterministic structural
 * checks that were never read off anything. So the sentence is built from the
 * items the rung is about to list, and the page cannot contradict itself.
 *
 * THE DISTANCE CLAUSE IS GONE, AND ONLY THAT. These four sentences read "It was
 * written at stages 2 to 5 — from 9 stages earlier to 6 stages earlier", which
 * states one fact twice: the second half is the first half subtracted from the
 * artefact's own stage, and the reader has just been told that stage in the
 * caption. `ChainRail` draws the span and the distance together, on the axis the
 * items' own tags are in. What is kept is the half a picture cannot carry — what
 * a rung IS — plus the span itself, because the rail is hidden on a phone and in
 * print and a rung with no stated stages there would be a bare count.
 */
function stepGloss(depth: number, thing: string, items: Artefact[], stageOf: StageOf, own: number): string {
  const what = depth === 1
    ? `What this ${thing} was written from.`
    : depth === 2
      ? 'What those in turn were written from.'
      : `${depth} citations back.`;

  // A pass owns ordinals in the hundreds — `PASS_BASE * n + k` — which are not
  // on the run's scale, so they are left out of the range rather than printed as
  // a stage number nobody can place.
  const ordinals = items.map((item) => stageOf(item.id)).filter((n) => Number.isFinite(n) && !isPassStage(n));
  if (!ordinals.length || !Number.isFinite(own) || isPassStage(own)) return what;

  const low = Math.min(...ordinals);
  const high = Math.max(...ordinals);
  return low === high
    ? `${what} All of it was written at stage ${low + 1}.`
    : `${what} Written at stages ${low + 1} to ${high + 1}.`;
}

/**
 * Which stage produced it, in words.
 *
 * A pass — material attached after the report, or a restatement — owns ordinals
 * `PASS_BASE * n + k`, so the arithmetic that prints "stage 11" prints
 * "stage 101" for an addendum. Which step of which pass needs the pass row,
 * which this page does not have, so it says the true and useful half.
 */
function producedIn(ordinal: number): string {
  if (isPassStage(ordinal)) return 'added by a later pass over the assessment';
  const name = STAGES[ordinal];
  // "of 18" is the half the sentence was missing. "Produced at stage 11" is a
  // number on a scale the page had never stated, and it then printed the same
  // scale beside all 32 items of the provenance ladder.
  return name
    ? `produced at stage ${ordinal + 1} of ${STAGES.length}, ${name.toLowerCase()}`
    : `produced at stage ${ordinal + 1} of ${STAGES.length}`;
}

/** The same fact, short enough to sit beside a link in a list. */
function stageTag(ordinal: number): string {
  return isPassStage(ordinal) ? 'a later pass' : `stage ${ordinal + 1}`;
}

/**
 * Where the artefact sits in the document.
 *
 * The section is dropped when it only repeats the page, which a PDF makes the
 * common case rather than the odd one: an extractor with no headings names each
 * section after the page it came from, and the row then read "Page 1 · Page 1".
 */
function whereInThePaper(artefact: Artefact): string {
  const page = artefact.page ? `Page ${artefact.page}` : null;
  const section = artefact.section?.trim() || null;
  if (page && section && section.toLowerCase() === page.toLowerCase()) return page;
  return [page, section].filter(Boolean).join(' · ');
}

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
const ordinal = (n: number) => ORDINALS[n] ?? `Step ${n}`;

/**
 * A play's own numbers and its narrative.
 *
 * The report's table carries the rank, the band and the exposure and nothing
 * else, because a table of twenty plays holding seven paragraphs each is not a
 * table. This is the rest: what the four factors actually scored, and the
 * fields the model writes about how the thing would run.
 *
 * IT OPENS WITH A PICTURE NOW. Everything a reader wants at a glance was in the
 * record already and none of it was drawn: who is positioned to run this, what
 * has to be true for it to work, and what gives way when it does. Those are
 * three fields — `actorId`, `preconditions`, `targets` — and they make a
 * sentence, so they are laid out as one.
 */
function PlaySection({ play, resolve, linkTo }: {
  play: ReturnType<typeof plays>[number];
  resolve: (id: string) => Artefact | null;
  linkTo: (a: Artefact) => React.ReactNode;
}) {
  // `counter` is drawn by the flow as "what would close it", and `legality` now
  // rides on the play cards in the report, so neither is repeated here.
  const narrative: [string, string][] = [
    ['motivation', 'Why they would'],
    ['play', 'How it runs'],
    ['payoff', 'What they get'],
    ['costToPolicy', 'What it costs the policy'],
    ['earlyWarning', 'The first sign of it'],
    ['precedent', 'Where this has happened before'],
  ];

  return (
    <section aria-labelledby="play">
      <h2 className="govuk-heading-m" id="play">How this would be run</h2>

      <PlayFlow play={play} resolve={resolve} linkTo={linkTo} />

      <h3 className="govuk-heading-s">The four judgements behind the rank</h3>
      {/* THE ARGUMENT IS MADE ONCE, IN THE REPORT, ON THE FIGURE THAT SHOWS IT.
          "A mean rather than an average because a play that scores high on three
          and near zero on one is not a threat" was printed in four places a
          reader passes through in one session — the Verdict lead, the Threats
          panel, here, and the design system page — so going Verdict → Threats →
          a play met it three times. What is left is the phrase, which is what
          the table underneath needs to be read. */}
      <p className="govuk-body">
        The score is the geometric mean of the four below, so one low factor pulls it down hard.
      </p>
      {/*
        THE SCORE IS DRAWN AS WELL AS PRINTED. Four numbers between 66 and 82
        read as four similar numbers; the bars say at a glance which judgement
        is carrying the rank — and which one, if it were wrong, would drop it.
      */}
      <Table
        caption="Each on nought to a hundred, as the assessment scored it"
        captionSize="s"
        scroll
        columns={[
          { header: 'Factor', width: '11rem' },
          { header: 'Score', numeric: true, width: '11rem' },
          { header: 'What a high score means' },
        ]}
        rows={play.factors.map((factor) => {
          const term = explain(factor.key);
          return [
            term?.label ?? fieldLabel(factor.key),
            <Bar value={Math.round(factor.value * 100)} max={100} />,
            term?.read ?? '—',
          ];
        })}
      />

      <div className="prt-drill__narrative">
        {narrative.map(([key, label]) => {
          const value = play.artefact.data[key];
          return typeof value === 'string' && value ? (
            <div key={key} className="prt-drill__field">
              <h3 className="govuk-heading-s">{label}</h3>
              <p className="govuk-body">{value}</p>
            </div>
          ) : null;
        })}
      </div>
    </section>
  );
}

/**
 * WHAT A RECOMMENDATION WOULD ACTUALLY BEAR ON.
 *
 * The page said what to do and stopped there. The obvious next question —
 * which of the forty-seven plays does this close, and whose behaviour changes —
 * is answerable from the record, but only partly, and saying so honestly is the
 * whole design. `$lib/recommendation` carries the argument and the measurement
 * that killed the obvious join; this renders its three tiers with their rules
 * on the page, so a reader can see which links the assessment made itself and
 * which are leads this view drew.
 */
function RecommendationSection({ artefact, all, plays: list, link, rankOf }: {
  artefact: Artefact;
  all: Artefact[];
  plays: ReturnType<typeof plays>;
  link: (a: Artefact) => React.ReactNode;
  rankOf: (id: string) => number;
}) {
  const links = linkRecommendation(artefact, all);
  const byId = new Map(list.map((p) => [p.artefact.id, p]));
  const gains = strings(artefact.data.beneficiaries);
  const carries = strings(artefact.data.burdenBearers);
  const tradeoffs = typeof artefact.data.tradeoffs === 'string' ? artefact.data.tradeoffs : '';
  const validation = typeof artefact.data.validationNeeded === 'string' ? artefact.data.validationNeeded : '';
  const tiers: Tier[] = ['named', 'assumption', 'mechanism'];

  return (
    <section aria-labelledby="tackles">
      <h2 className="govuk-heading-m" id="tackles">What this would tackle</h2>

      {links.checks.length ? (
        <>
          <h3 className="govuk-heading-s">The checks it answers</h3>
          <Table
            caption="Each check, and how the assessment scored it before this was recommended"
            captionSize="s"
            scroll
            columns={[{ header: 'Check' }, { header: 'Result', width: '11rem' }]}
            rows={links.checks.map((check) => [link(check), <TestResult value={check.data.result} />])}
          />
        </>
      ) : null}

      {links.findings.length ? (
        <>
          <h3 className="govuk-heading-s">The findings it answers</h3>
          <ul className="govuk-list govuk-list--bullet">
            {links.findings.map((finding) => <li key={finding.id}>{link(finding)}</li>)}
          </ul>
        </>
      ) : null}

      {gains.length || carries.length ? (
        <>
          <h3 className="govuk-heading-s">Who gains, and who carries it</h3>
          {/*
            TWO COLUMNS, because the interesting thing about a recommendation is
            usually that those are different lists. These are the recommendation's
            own words rather than resolved bodies — the field is free text, and
            matching it to the inventory would be inventing an identity the
            record does not assert.
          */}
          <Table
            caption="As the recommendation itself names them"
            captionSize="s"
            scroll
            columns={[{ header: 'Gains from it' }, { header: 'Carries the cost of it' }]}
            rows={[[
              gains.length ? <PlainList items={gains} /> : <span className="prt-meta">Not named</span>,
              carries.length ? <PlainList items={carries} /> : <span className="prt-meta">Not named</span>,
            ]]}
          />
        </>
      ) : null}

      <h3 className="govuk-heading-s">The plays it bears on — {links.plays.length} of {list.length}</h3>
      <p className="govuk-body">
        Grouped by how the link was made, strongest first, because they are not the same kind of
        claim. A walk out from a recommendation reaches nearly every play in the assessment — so
        distance on its own means nothing here, and each group states the rule it used.
      </p>

      {links.plays.length ? tiers.map((tier, _i, all) => {
        // The first tier in `tiers` order — strongest first — that has members.
        const strongest = all.find((t) => links.plays.some((p) => p.tier === t));
        /*
         * SORTED, BECAUSE THE TABLE SAYS IT IS. `linkRecommendation` walks the
         * artefacts in storage order and then sorts by tier only; `Array.sort` is
         * stable, so within a tier the order was whatever the database returned.
         * The table prints a Rank column and captions itself "the worst 12 of 28"
         * — and on the real run that 12 read 10, 17, 4, 19, 7, 2, 28, 24, 44, 12,
         * 23, 16, omitting the two worst plays the tier contained and including
         * the forty-fourth. The one column on the page that is meant to be
         * ordered was noise.
         */
        const rank = (id: string) => {
          // `rankOf` is a `findIndex` + 1, so a play that is not in the ranked
          // list at all comes back as 0 — which would sort it to the TOP of a
          // table headed "worst first". It goes last.
          const found = rankOf(id);
          return found > 0 ? found : Number.MAX_SAFE_INTEGER;
        };
        const inTier = links.plays
          .filter((p) => p.tier === tier)
          .slice()
          .sort((a, b) => rank(a.id) - rank(b.id));
        if (!inTier.length) return null;
        const body = (
          <>
            <p className="govuk-body-s prt-meta">{TIER_RULE[tier]}</p>
            <Table
              caption={`${TIER_LABEL[tier]} — ${inTier.length}`}
              captionSize="s"
              scroll
              columns={[
                { header: 'Rank', numeric: true, width: '5rem' },
                { header: 'Play' },
                { header: 'Body' },
                { header: 'Band', width: '9rem' },
                { header: 'Exposure', numeric: true, width: '11rem' },
              ]}
              rows={inTier.slice(0, 12).map((entry) => {
                const found = byId.get(entry.id);
                if (!found) return ['—', entry.id, '—', '—', '—'];
                return [
                  String(rankOf(found.artefact.id)),
                  link(found.artefact),
                  found.actor ? link(found.actor) : '—',
                  <span className={`prt-band prt-band--${found.band}`}>{BAND_LABEL[found.band]}</span>,
                  <Bar value={found.exposure} />,
                ];
              })}
            />
            {inTier.length > 12 ? (
              <p className="govuk-body-s prt-meta">
                The worst 12 of {inTier.length}. Every one is in the list on the Threats tab.
              </p>
            ) : null}
          </>
        );
        /*
         * THE STRONGEST TIER THAT HAS ANYTHING IN IT OPENS.
         *
         * The rule was "named opens, the other two are leads and do not get to be
         * the first thing a reader meets", which is right when there is a named
         * tier. Four of the six recommendations on the real run have none — and
         * there the rule shut everything: under "The plays it bears on — 28 of 47"
         * the only element on the page was one closed toggle reading "Rests on the
         * same assumption — 28". A section promising 28 plays and showing none
         * reads as empty rather than as weak, which is the opposite of what the
         * tiers are for.
         */
        return tier === strongest
          ? <div key={tier}>{body}</div>
          : <Details key={tier} summary={`${TIER_LABEL[tier]} — ${inTier.length}`}>{body}</Details>;
      }) : (
        <p className="govuk-body">
          No way to beat the policy is linked to this by any of the three rules. That is a fact
          about the record rather than about the recommendation: the findings it answers name no
          way to beat it, no shared assumption and no shared part of the policy.
        </p>
      )}

      {tradeoffs || validation ? (
        <>
          <h3 className="govuk-heading-s">What it costs, and what would prove it</h3>
          <SummaryList
            rows={[
              ...(tradeoffs ? [{ key: 'The trade-off', value: tradeoffs }] : []),
              ...(validation ? [{ key: 'What would have to be validated', value: validation }] : []),
            ]}
          />
        </>
      ) : null}
    </section>
  );
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];

function PlainList({ items }: { items: string[] }) {
  return (
    <ul className="govuk-list prt-tightlist">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

/**
 * The four fields a reader asks in order, and the rest one disclosure below.
 *
 * A profile carries twenty-one evidenced fields. Opening on all of them is the
 * wall this page exists to avoid: what it says it wants, what its position
 * actually rewards, who can hold it to account, and the question no assurance
 * review asks.
 */
const LEAD_FIELDS: { key: string; label: string }[] = [
  { key: 'statedObjectives', label: 'Says it wants' },
  { key: 'operationalObjectives', label: 'Its position rewards' },
  { key: 'accountableTo', label: 'Answers to' },
  { key: 'gainFromFailure', label: 'Better off if this fails' },
];

/**
 * The four lead fields, or none.
 *
 * Hoisted out of the component because the contents list has to know whether
 * this section renders BEFORE it renders: an index that names a section the
 * page did not draw is worse than no index, and a profile carrying none of the
 * four evidenced fields draws nothing.
 */
function profileLead(profile: Artefact): { key: string; value: string }[] {
  return LEAD_FIELDS.map((field) => {
    const raw = profile.data[field.key];
    const value = raw && typeof raw === 'object' ? String((raw as { value?: string }).value ?? '') : '';
    return { key: field.label, value };
  }).filter((row) => row.value);
}

function ProfileSection({ profile }: { profile: Artefact }) {
  const rows = profileLead(profile);

  if (!rows.length) return null;

  return (
    <section aria-labelledby="profile">
      <h2 className="govuk-heading-m" id="profile">What this body is playing for</h2>
      <SummaryList rows={rows} />
    </section>
  );
}
