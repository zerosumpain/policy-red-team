import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { explain } from '$lib/policy-analysis/glossary';
import { BAND_LABEL, confidenceJudgement, plays, precedentOf, stageOfId } from '$lib/policy-analysis/view';
import { STAGES, isPassStage } from '$lib/policy-analysis/contracts';
import { edgesOf, nodesOf } from '$lib/policy-analysis/network';
import { citedBy, paperWording, provenance, type StageOf } from '$lib/provenance';
import { linkRecommendation, TIER_LABEL, TIER_RULE, type Tier } from '$lib/recommendation';
import { egoOf, labelIndex } from '$lib/relationships';
import { api, type Detail } from '../api';
import { cx } from '../govuk/cx';
import { Details, InsetText, Pagination, SummaryList, Table, Tag, WarningText, type TagColour } from '../govuk';
import { statusColour, statusLabel } from '../status';
import { usePageTitle } from '../layout/Template';
import { ArtefactValue, fieldLabel } from '../report/ArtefactValue';
import { EgoMap } from '../report/EgoMap';
import { Bar } from '../report/Metrics';
import { PlayFlow } from '../report/PlayFlow';
import { describeSelection, parseSelection } from '../report/selection';
import { MOVES } from '../moves';
import { stageMarks } from '$lib/stage-rail';
import { Quoted } from '../report/Quoted';
import { TestResult } from '../report/TestResult';

/**
 * ONE ITEM, AS FOUR PAGES — and the chain back to the paper.
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
 * AND NOW FOUR PAGES, NOT ONE (phase 21). The item page was 8,016px on the real
 * Best Start run — a way to beat it, then where it stands, then a 38-item
 * ladder, then nine two-thousand-word passages, then what cites it, then every
 * field — under a numbered contents list, a strip of eighteen numbers and a
 * chart of black bars with no legend. John: "less information per page". The
 * same record answers four different questions, and each is a part with its own
 * URL now:
 *
 *   /items/:id            what it is — its own content, and where it stands
 *   /items/:id/rests-on   what it rests on, back to the paper
 *   /items/:id/used-by    what rests on it
 *   /items/:id/record     every field the assessment recorded
 *
 * They are one component because they are one fetch and one set of derived
 * values: the strip of parts under the title shows a count for each, so every
 * part needs the chain and the citing set anyway. A part is a `:part` route
 * parameter, so moving between them is a route change — focus, scroll and the
 * tab title move with it, and Back undoes it.
 *
 * WHY IT RE-FETCHES THE WHOLE ASSESSMENT. `api.detail()` already returns every
 * artefact and the page needs the whole list anyway: what cites this item is a
 * question about all of them, and the chain walks refs across the set. Adding
 * a per-item endpoint would mean a second shape of the same data and a second
 * thing to keep in step, for a database that is a file on this disk.
 *
 * IT RUNS TO THE PAGE. Nothing here sits in a two-thirds column or under a
 * `max-width` measure, including the prose: John asked for every page's text to
 * be full width, and on this page the prose sits between full-width tables and
 * figures, where a 68ch paragraph reads as a column left over from a layout the
 * page no longer has.
 *
 * ITS WORDS ARE THE READER'S. "Item", not artefact; "step", not stage; "way to
 * beat it", not play or exploit — the list is `$lib/plain-words`. Ids, routes
 * and CSS classes keep the old names.
 */
export function Drill() {
  const { id = '', artefactId = '', part: rawPart } = useParams();
  const part = partOf(rawPart);
  /*
   * WHERE THE READER WAS IN THE REPORT, carried in as one opaque string.
   *
   * `Report` owns its own reading position; the link into this page appends it
   * as `?from=<encoded>`. Nothing here parses a route out of it — `parseSelection`
   * resolves the selection against this assessment's own items, and an id that
   * is no longer in the run comes back as null rather than as a label that lies.
   *
   * IT TRAVELS WITH EVERY LINK THIS PAGE BUILDS — to another item, to another
   * part of this one, to the next way to beat it — so the back link at the top
   * still returns to the report page the reader came from after any number of
   * steps sideways.
   */
  const [search] = useSearchParams();
  const from = search.get('from') ?? '';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // CLEARED FIRST. One component instance serves every item of every
    // assessment, so without this a failed load on assessment A leaves its error
    // paragraph on assessment B for good, and a successful one renders B's
    // item id against A's item list for a paint — a flash of "that is not in
    // this assessment" on a page that is about to load fine.
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
  // "Policy Red Team" is that argument not actually working. A part names
  // itself after the item, so two parts of one item in two tabs differ.
  const artefact = detail?.artefacts.find((a) => a.id === artefactId) ?? null;
  usePageTitle(artefact ? (part && part !== 'item' ? `${artefact.label} — ${PART_TITLE[part]}` : artefact.label) : undefined);
  /*
   * ONLY WHEN THERE IS SOMETHING TO DRAW.
   *
   * `network()` resolves duplicate bodies across the whole inventory, and the
   * section it feeds appears only for an item that is an end of a stated
   * relationship — which most are not: a finding, a way to beat it, a passage
   * and every profile have none. A scan for "is this id an edge endpoint" is a
   * fraction of the cost and answers the question the memo was being paid for.
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
   * nothing else. Timed against the real 2,265-item run: `network()` is
   * 43.5ms on the first call where `edgesOf` + `nodesOf` are 0.78ms.
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
      <div role="alert">
        <h1 className="govuk-heading-l">There is a problem</h1>
        <p className="govuk-body">{error}</p>
        <p className="govuk-body">
          <Link className="govuk-link" to={backHref}>Go back to the assessment</Link>
        </p>
      </div>
    );
  }
  // A HEADING WHILE IT LOADS. Returning only a paragraph left the page with no
  // h1 at all until the fetch resolved, so a reader who followed a link and
  // pressed "next heading" found nothing to tell them where they had arrived.
  if (!detail) {
    return (
      <div>
        <h1 className="govuk-heading-l">Loading this item</h1>
        <p className="govuk-body">Fetching the assessment it belongs to.</p>
      </div>
    );
  }

  const all = detail.artefacts;

  if (!artefact || !part) {
    return (
      <div>
        <h1 className="govuk-heading-l">
          {artefact ? 'That is not a part of this item' : 'That is not in this assessment'}
        </h1>
        <p className="govuk-body">
          {artefact
            ? <>An item has four parts: what it is, what it rests on, what rests on it, and everything recorded about it. There is no part called <code>{rawPart}</code>.</>
            : <>Nothing here is identified as <code>{artefactId}</code>. It may belong to a different assessment, or to a step this one did not reach.</>}
        </p>
        <p className="govuk-body">
          {artefact
            ? <Link className="govuk-link" to={itemHref(id, artefact.id, 'item', from)}>Go to {artefact.label}</Link>
            : <Link className="govuk-link" to={backHref}>Go back to the assessment</Link>}
        </p>
      </div>
    );
  }

  const to = (target: Artefact) => itemHref(id, target.id, 'item', from);
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

  // The step off the ROW, not off the id. The twelve structural checks are
  // minted as `test_adaptability` with no `s<n>_` prefix, so an id-derived step
  // reads 0 and the page would tell a reader that a check was produced while
  // the paper was being read in. `detail()` has always sent the true figure.
  const rows = new Map(detail.artefactMetadata.map((row) => [row.id, row]));
  const stageOf: StageOf = (target) => rows.get(target)?.stage ?? stageOfId(target);

  /** The step that actually stopped — read, not assumed to be the last one. */
  const stoppedAt = detail.stages.find((row) => row.status === 'failed') ?? null;

  const stage = stageOf(artefact.id);
  const producedAt = rows.get(artefact.id)?.updatedAt ?? null;
  const chain = provenance(artefact.id, all, { stageOf });
  // UNCAPPED ON ITS OWN PART. `citedBy` caps its list at twelve for a section
  // of a long page; "What rests on this" is a page of its own now, and a page
  // titled "37" that lists twelve is a page that lies by omission.
  const cites = citedBy(artefact.id, all, part === 'used-by' ? Number.MAX_SAFE_INTEGER : undefined, stageOf);
  const list = plays(all);
  const noun = kindNoun(artefact.kind);

  /*
   * WHERE IT CAME FROM, IN ONE SENTENCE.
   *
   * This was a strip of eighteen numbered cells with one filled, some
   * underlined and some overlined — which step made this item, which steps its
   * chain reaches, and which cite it — and a caption that said the same in
   * stage numbers. John: "a set of numbers that makes no obvious sense". The
   * facts are worth keeping and the picture was not, so they are a sentence
   * that says what the step was DOING, which is the half a number cannot.
   * `stageMarks` is the tested arithmetic that drew the strip.
   */
  const marksOnScale = stageMarks({
    artefactId: artefact.id,
    all,
    hops: chain.hops,
    chainSources: chain.sources,
    stageOf,
    stageCount: STAGES.length,
  });
  const play = list.find((p) => p.artefact.id === artefact.id) ?? null;

  /*
   * THE MARKS ON THE PAPER'S OWN WORDING.
   *
   * Every item between here and a passage carries the span it quoted.
   * Collected, they are exactly the clauses this item was built from — which is
   * what a reader is hunting for in a two-thousand-word passage and had no way
   * to find. The item's own quote leads the list because where it has one it
   * is the closest thing to the point.
   */
  const marks = [
    artefact.sourceQuote,
    ...chain.hops.flatMap((hop) => hop.items.map((item) => item.sourceQuote)),
  ];

  // A profile describes a body; a body is described by a profile. Either way
  // the reader wants both, so whichever they opened, find the other.
  const profile = artefact.kind === 'profile'
    ? artefact
    : all.find((a) => a.kind === 'profile' && a.data.actorId === artefact.id) ?? null;
  const actorId = artefact.kind === 'profile' ? String(artefact.data.actorId ?? '') : artefact.id;
  const couldRun = artefact.kind === 'actor' || artefact.kind === 'profile'
    ? list.filter((p) => p.actor?.id === actorId)
    : [];
  // Rank over the WHOLE list, never within this body's handful — "third worst
  // of everything" and "this body's third" are different claims.
  const rankOf = (playId: string) => list.findIndex((p) => p.artefact.id === playId) + 1;

  const origin = explain(artefact.origin);
  // Most items are not in the graph at all — a finding, a way to beat it and a
  // passage have no stated relationships — so this section simply does not
  // appear for them.
  const ego = net ? egoOf(net, artefact.id) : { node: null, out: [], in: [] };
  // A passage IS the document's text; everything downstream quotes a span of
  // one. The section reads differently depending on which of those this is.
  const wording = paperWording(artefact);

  /*
   * THE NEXT WAY TO BEAT IT, WITHOUT A ROUND TRIP THROUGH THE REPORT.
   *
   * FOR A WAY TO BEAT IT ONLY. A recommendation has four assured entries on
   * this run, all of them on one screen in the report, so a control to step
   * between them is chrome; and a body, a passage or an assumption sits in no
   * order the assessment asserts, so numbering them would be inventing one.
   *
   * IT STAYS ON THE PART YOU ARE READING. Stepping from "what this rests on" to
   * the next one's "what it rests on" is reading the list one question at a
   * time, which is what the parts are for.
   */
  const rank = play ? list.findIndex((p) => p.artefact.id === artefact.id) : -1;
  const previousPlay = rank > 0 ? list[rank - 1] : null;
  const nextPlay = rank >= 0 && rank < list.length - 1 ? list[rank + 1] : null;

  /*
   * WHAT THE READER IS GOING BACK TO, IN THE BANNER'S OWN WORDS.
   *
   * The back link at the top of the page names the report page; only this page
   * holds the items, so only this page can resolve `sel=actor:<id>` into
   * "showing what “Department for Education” is positioned to run".
   * `describeSelection` is the sentence the report's own selection banner
   * prints, so the reader meets the same relationship worded the same way at
   * both ends of the trip.
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

  /*
   * THE PARTS, WITH WHAT EACH HOLDS.
   *
   * A count beside a part is the reason to open it or not: "What rests on this
   * 0" is a page a reader need not visit, and "What it rests on 38" says how
   * long the trail is before they set off. The record's count is its fields.
   * Every part is always listed, so the strip does not change shape from one
   * item to the next.
   */
  const fields = Object.keys(artefact.data ?? {}).length;
  const parts: { part: Part; count: number | null }[] = [
    { part: 'item', count: null },
    { part: 'rests-on', count: chain.reached },
    { part: 'used-by', count: cites.total },
    { part: 'record', count: fields },
  ];

  return (
    <div className="prt-drill">
      {/*
        THE CAPTION NAMES THE PAPER *AND* SAYS WHAT STATE THE RUN IS IN.

        A reader can open three findings in three tabs and send someone a URL,
        which makes arriving here with no memory of the assessment page the
        common case rather than the odd one. Quoting an item out of a run that
        finished with gaps, without knowing it finished with gaps, is the thing
        that qualification exists to prevent.

        `statusLabel`/`statusColour` are the same two functions the landing
        table and the assessment header use, so there is no third opinion about
        what a status is called.
      */}
      <p className="prt-pagehead__status govuk-!-margin-bottom-2">
        <Link className="govuk-link" to={`/assessments/${id}`}>{detail.analysis.title}</Link>
        <Tag colour={statusColour(detail.analysis.status) as TagColour}>
          {statusLabel(detail.analysis.status)}
        </Tag>
        {stoppedAt ? (
          <span className="prt-meta">
            It stopped at step {stoppedAt.ordinal + 1} of {detail.stages.length},{' '}
            {stoppedAt.name.toLowerCase()}
          </span>
        ) : null}
      </p>
      {/*
        MATERIAL ATTACHED AFTER THE REPORT WAS WRITTEN. `AddendumNotice` is
        deliberately NOT reused: its last sentence points at a section on the
        assessment page, not on this one. `passes` is empty on the live run, so
        this costs a clean report nothing.
      */}
      {detail.passes.length ? (
        <WarningText>
          This assessment has been added to since this was written — {detail.passes.length}{' '}
          {detail.passes.length === 1 ? 'later pass' : 'later passes'} over it. The assessment
          records what was attached and which conclusions it moved.
        </WarningText>
      ) : null}
      <h1 className="govuk-heading-l govuk-!-margin-bottom-3">{artefact.label}</h1>
      <p className="prt-item__where">
        <Tag colour="grey">{noun}</Tag>
        {whereFrom(stage, marksOnScale.sources)}
      </p>

      <ItemParts
        parts={parts}
        current={part}
        hrefOf={(p) => itemHref(id, artefact.id, p, from)}
        of={artefact.label}
      />

      {part === 'item' ? (
        <ItemPart
          artefact={artefact}
          all={all}
          play={play}
          profile={profile}
          couldRun={couldRun}
          rankOf={rankOf}
          list={list}
          ego={ego}
          kindOf={nodeKind}
          linkById={linkById}
          link={link}
          byId={byId}
          origin={origin}
          producedAt={producedAt}
          wording={wording}
        />
      ) : null}

      {part === 'rests-on' ? (
        <Chain chain={chain} link={link} stageOf={stageOf} marks={marks} noun={noun} />
      ) : null}

      {part === 'used-by' ? (
        <section aria-labelledby="used-by">
          <h2 className="govuk-heading-m" id="used-by">What rests on this — {cites.total}</h2>
          {cites.total ? (
            <>
              <p className="govuk-body">
                Everything in the assessment that cites this {noun.toLowerCase()} — what the
                assessment would have to revisit if it turned out to be wrong.
              </p>
              <ItemList items={cites.items} link={link} stageOf={stageOf} />
            </>
          ) : (
            <p className="govuk-body">
              Nothing else in the assessment cites this {noun.toLowerCase()}. If it turned out to
              be wrong, no other conclusion here would move with it.
            </p>
          )}
        </section>
      ) : null}

      {part === 'record' ? (
        <section aria-labelledby="record">
          <h2 className="govuk-heading-m" id="record">Everything recorded about it</h2>
          {/* OPEN, NOT BEHIND A DISCLOSURE. It was a shut "Every structured
              field" at the foot of an 8,000px page; on a page of its own the
              disclosure is a click that answers nothing. */}
          {fields
            ? <ArtefactValue value={artefact.data} byId={byId} linkTo={link} />
            : <p className="govuk-body">No fields beyond its name and statement were recorded.</p>}
          <p className="govuk-body-s prt-meta">Identified in this assessment as {artefact.id}.</p>
        </section>
      ) : null}

      {/* The neighbours in the list's own ranking, labelled with their rank and
          their name, so the reader knows what they are stepping to rather than
          only that there is something there.

          `label` is set because this page has several navigation landmarks: the
          back link, the parts, and this. Two landmarks a screen reader cannot
          tell apart is axe's `landmark-unique`. */}
      <Pagination
        label="Ways to beat it, by rank"
        previous={previousPlay ? {
          href: itemHref(id, previousPlay.artefact.id, part, from),
          title: 'Previous',
          label: `${rank}. ${previousPlay.artefact.label}`,
        } : null}
        next={nextPlay ? {
          href: itemHref(id, nextPlay.artefact.id, part, from),
          title: 'Next',
          label: `${rank + 2}. ${nextPlay.artefact.label}`,
        } : null}
        render={({ href, className, rel, children }) => (
          <Link to={href} className={className} rel={rel}>{children}</Link>
        )}
      />

      {/* THE WAY BACK, NAMED. The back link at the top names the report page;
          this one names the page AND the selection, which only this page can
          resolve. */}
      <p className="govuk-body govuk-!-margin-top-6">
        <Link className="govuk-link" to={backHref}>{returnLabel}</Link>
      </p>
    </div>
  );
}

// ── The parts ───────────────────────────────────────────────────────────────

type Part = 'item' | 'rests-on' | 'used-by' | 'record';

const PART_TITLE: Record<Part, string> = {
  item: 'Overview',
  'rests-on': 'What it rests on',
  'used-by': 'What rests on this',
  record: 'Everything recorded',
};

/** The route segment, or null for one that is not a part. No segment is the item itself. */
function partOf(raw: string | undefined): Part | null {
  if (raw === undefined || raw === '') return 'item';
  return raw === 'rests-on' || raw === 'used-by' || raw === 'record' ? raw : null;
}

/**
 * The address of an item, or of one of its parts, with the reading position on it.
 *
 * ONE BUILDER FOR EVERY LINK THIS PAGE MAKES, so `?from=` cannot be dropped by
 * one of them — which is how a back link silently starts returning to the top
 * of the report after the reader has stepped sideways once.
 */
function itemHref(assessment: string, item: string, part: Part, from: string): string {
  return `/assessments/${assessment}/items/${encodeURIComponent(item)}`
    + (part === 'item' ? '' : `/${part}`)
    + (from ? `?from=${encodeURIComponent(from)}` : '');
}

/**
 * THE PARTS OF THIS ITEM, AS A STRIP OF LINKS UNDER THE TITLE.
 *
 * It replaced a numbered "Contents" list of in-page anchors, which was right
 * for one long page and is wrong for four short ones. A list of links with the
 * current one marked by `aria-current="page"`: the MoJ sub-navigation shape,
 * because GOV.UK has none and tabs would promise the other parts were on this
 * page. Styles in `parts/_item.scss`.
 */
function ItemParts({ parts, current, hrefOf, of }: {
  parts: { part: Part; count: number | null }[];
  current: Part;
  hrefOf: (part: Part) => string;
  of: string;
}) {
  return (
    <nav className="prt-subnav" aria-label={`Parts of ${of}`}>
      <ul className="prt-subnav__list">
        {parts.map(({ part, count }) => (
          <li key={part} className={cx('prt-subnav__item', part === current && 'prt-subnav__item--current')}>
            <Link
              className="govuk-link govuk-link--no-visited-state prt-subnav__link"
              to={hrefOf(part)}
              aria-current={part === current ? 'page' : undefined}
            >
              {PART_TITLE[part]}
              {count === null ? null : <span className="prt-subnav__count">{count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * THE ITEM ITSELF — the default part.
 *
 * Its own sentence, its own sections (how a way to beat it would be run, what a
 * recommendation would tackle, what a body is playing for and could run, the
 * relationships the paper states about it), the paper's wording where it has
 * one, and where it stands. Everything about its neighbours is on the other
 * three parts.
 */
function ItemPart({
  artefact, all, play, profile, couldRun, rankOf, list, ego, kindOf, linkById, link, byId, origin, producedAt, wording,
}: {
  artefact: Artefact;
  all: Artefact[];
  play: ReturnType<typeof plays>[number] | null;
  profile: Artefact | null;
  couldRun: ReturnType<typeof plays>;
  rankOf: (id: string) => number;
  list: ReturnType<typeof plays>;
  ego: ReturnType<typeof egoOf>;
  kindOf: (id: string) => string;
  linkById: (id: string) => ReactNode;
  link: (a: Artefact) => ReactNode;
  byId: Map<string, Artefact>;
  origin: ReturnType<typeof explain>;
  producedAt: string | null;
  wording: string | null;
}) {
  /*
   * "UNKNOWN" IS NOT A FACT ABOUT THE ITEM, so it is not printed.
   *
   * A way to beat it carries no confidence figure — its standing is its four
   * judgements — so "Evidence standing: Unknown" sat on every one of the 46 on
   * the real run, reading as a gap in the assessment rather than as a field
   * that does not apply. A row with nothing to say is left out.
   */
  const standing = confidenceJudgement(artefact);
  const time = artefact.temporal ? fieldLabel(artefact.temporal) : null;
  const standingRows = [
    {
      key: 'How it was arrived at',
      value: (
        <>
          {/* The glossary's plain name — "Worked out from how the paper fits
              together", not "Structural inference" — from the one place that
              defines it. */}
          {origin?.plain ?? fieldLabel(artefact.origin)}
          {origin ? <><br /><span className="prt-meta">{origin.read}</span></> : null}
        </>
      ),
    },
    ...(standing && standing !== 'Unknown'
      ? [{
          key: 'Evidence standing',
          value: (
            <>
              {standing}
              <br />
              <span className="prt-meta">A qualitative judgement, not a probability.</span>
            </>
          ),
        }]
      : []),
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
    ...(time ? [{ key: 'Time', value: time }] : []),
  ];

  return (
    <>
      {/* A PASSAGE'S STATEMENT IS ITS WORDING, and the section below sets it as
          the quotation it is. Printing both put the same text on the page
          twice. */}
      {artefact.kind === 'passage' ? null : <p className="prt-drill__lead">{artefact.statement}</p>}
      {artefact.origin === 'behavioural_hypothesis' || artefact.kind === 'profile' ? (
        <WarningText>
          This is a hypothesis about what a body's position rewards. It is not a finding about
          any named person.
        </WarningText>
      ) : null}

      {play ? <PlaySection play={play} resolve={(rid) => byId.get(rid) ?? null} linkTo={link} /> : null}

      {artefact.kind === 'recommendation' ? (
        <RecommendationSection artefact={artefact} all={all} plays={list} link={link} rankOf={rankOf} />
      ) : null}

      {profile ? <ProfileSection profile={profile} /> : null}

      {couldRun.length ? (
        <section aria-labelledby="could-run">
          <h2 className="govuk-heading-m" id="could-run">
            What it could do — {couldRun.length} {couldRun.length === 1 ? 'way' : 'ways'} to beat the policy
          </h2>
          {/* THE BAND IS A BAND, NOT A WORD IN A CELL — the report's own
              ranking, drawn so a reader can tell four severe ones from one
              severe and three limited at a glance. */}
          <Table
            className="prt-table prt-table--zebra"
            caption="Ranked against every way to beat the policy, not against each other"
            captionSize="s"
            scroll
            columns={[
              { header: 'Rank', numeric: true, width: '5rem' },
              { header: 'Way to beat it' },
              { header: 'How exposed', width: '10rem' },
              { header: 'Score', numeric: true, className: 'prt-table__num' },
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
          <EgoMap node={ego.node} incoming={ego.in} outgoing={ego.out} kindOf={kindOf} linkFor={linkById} />
        </section>
      ) : null}

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

      <section aria-labelledby="standing">
        <h2 className="govuk-heading-m" id="standing">Where this stands</h2>
        <SummaryList rows={standingRows} />
      </section>
    </>
  );
}

/**
 * What kind of thing an item is, in the reader's words.
 *
 * `fieldLabel(kind)` printed the pipeline's names — "Exploit", "Edge",
 * "Research source" — in the line under every item's title and beside every
 * entry in every list. These are the words `$lib/plain-words` settled on; a
 * kind not listed falls back to its tidied name rather than to nothing.
 */
const KIND_NOUN: Record<string, string> = {
  exploit: 'Way to beat it',
  finding: 'Finding',
  recommendation: 'Recommendation',
  key_judgement: 'Key judgement',
  actor: 'Body or group',
  profile: 'Profile of a body',
  persona_link: 'Match to a body met before',
  resolution_candidate: 'Possible body',
  alias: 'Another name for a body',
  passage: 'Passage of the paper',
  claim: 'Claim',
  mechanism: 'Part of the policy',
  assumption: 'Assumption',
  edge: 'Relationship',
  research_question: 'Research question',
  research_source: 'Source from outside the paper',
  evidence: 'Evidence',
  model: 'Interaction model',
  test: 'Check on how the policy is set up',
  scenario: 'Scenario',
  cross_policy: 'Clash with another policy',
  causal_chain: 'Causal chain',
  option_appraisal: 'Option',
  evaluation_plan: 'Evaluation plan',
  assurance_challenge: 'Challenge in the final review',
  assurance_response: 'Answer to a challenge',
  review_summary: 'Summary of the final review',
};

function kindNoun(kind: string): string {
  return KIND_NOUN[kind] ?? fieldLabel(kind);
}

/**
 * WHAT EACH STEP OF THE RUN WAS DOING, as the tail of "Found at step N of 18,
 * while …".
 *
 * The step's own name — "Exploitation playbook", "Adversarial scenarios and
 * sensitivity" — is the pipeline's; the reader wants to know what the
 * assessment was doing when it wrote this. Indexed by the same ordinal as
 * `STAGES`, which `stages.guard.test.ts` pins.
 */
const STEP_DOING: readonly string[] = [
  'reading the paper into passages',
  'picking out what the paper claims, sets up and assumes',
  'working out which names are the same body',
  'mapping the relationships the paper states',
  'profiling the bodies involved',
  'looking for evidence outside the paper',
  "weighing that evidence against the paper's claims",
  'working out how the bodies would respond to each other',
  'running the checks on how the policy is set up',
  'testing the policy against hard conditions',
  'listing ways to beat the policy',
  'comparing it with your other policies',
  'writing the first draft of the report',
  'matching bodies to ones met before',
  'setting out how the policy is meant to work',
  'comparing the options and planning how to evaluate them',
  'challenging the first draft',
  'writing the final report',
];

/**
 * The sentence under the title: which step found it, doing what, and from what.
 *
 * A pass — material attached after the report, or a restatement — owns ordinals
 * `PASS_BASE * n + k`, so the arithmetic that prints "step 11" prints
 * "step 101" for an addendum. Which step of which pass needs the pass row,
 * which this page does not have, so it says the true and useful half.
 */
function whereFrom(ordinal: number, sources: ReadonlySet<number>): string {
  if (isPassStage(ordinal)) return 'Added by a later pass over the assessment.';
  const doing = STEP_DOING[ordinal];
  const found = doing
    ? `Found at step ${ordinal + 1} of ${STAGES.length}, while ${doing}.`
    : `Found at step ${ordinal + 1} of ${STAGES.length}.`;
  const on = [...sources].filter((n) => Number.isFinite(n) && !isPassStage(n));
  if (!on.length) return found;
  const low = Math.min(...on) + 1;
  const high = Math.max(...on) + 1;
  return `${found} Built from what ${low === high ? `step ${low}` : `steps ${low} to ${high}`} found.`;
}

/** The step an item was written at, short enough to sit beside a link in a list. */
function stepTag(ordinal: number): string {
  return isPassStage(ordinal) ? 'a later pass' : `step ${ordinal + 1}`;
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
 * A list of items as links, each labelled with what kind of thing it is.
 *
 * THE SAME NAME FOUR TIMES IS THE DATA, AND STILL READS AS A FAULT. Entity
 * resolution keeps ambiguous candidates apart rather than merging them, so a
 * list printed "Universities · Body or group, step 2" four times in a row and
 * looked like a rendering bug. Collapsing them with the count says the same
 * thing truthfully and in one line; the first is the way in and every candidate
 * is reachable from it.
 */
function ItemList({ items, link, stageOf }: { items: Artefact[]; link: (a: Artefact) => ReactNode; stageOf: StageOf }) {
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
            {kindNoun(group[0].kind)}, {stepTag(stageOf(group[0].id))}
            {group.length > 1
              ? ` · ${group.length} candidates the assessment kept apart`
              : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const inWords = (n: number) => NUMBER_WORDS[n] ?? String(n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The list a box on the trail points at. */
const rungIdOf = (depth: number) => `rung-${depth}`;

/**
 * WHAT IT RESTS ON — the part this whole page exists for.
 *
 * The report says a body could do something. This says the assessment reached
 * that through these items, and the end of the trail is passages of the paper
 * you can go and read. A reader who disagrees with a finding can argue with a
 * specific item rather than with the tool.
 *
 * A STEP BACK IS A CITATION, NOT A STEP OF THE RUN, and since phase 21 the page
 * calls a step of the run a "step", so the trail counts citations: "followed
 * back 3 citations". On the real run 74% of a way to beat it's direct
 * citations were written nine steps earlier and 2% one step earlier, so each
 * list says where its own items were written rather than the page asserting a
 * distance.
 */
function Chain({ chain, link, stageOf, marks, noun }: {
  chain: ReturnType<typeof provenance>;
  link: (a: Artefact) => ReactNode;
  stageOf: StageOf;
  /** Quotes to mark in the passages at the end of the trail. */
  marks: (string | null | undefined)[];
  /** What this item is, in the reader's words — "Way to beat it". */
  noun: string;
}) {
  const steps = chain.hops.length;
  const thing = `this ${noun.toLowerCase()}`;
  /*
   * ONLY CLAIMED WHERE IT IS TRUE. A recommendation's lists print 10 → 200 → 90
   * on the real run: the third is smaller because the walk hit its 300-item cap
   * mid-list, which is a fact about the cap and not about the assessment.
   */
  const growing = chain.stoppedBy !== 'nodes'
    && chain.hops.every((hop, i) => i === 0 || hop.items.length >= chain.hops[i - 1].items.length);

  return (
    <section aria-labelledby="chain">
      <h2 className="govuk-heading-m" id="chain">What it rests on</h2>

      {steps === 0 && chain.unresolved ? (
        /* Every ref resolved to nothing. Saying "it cites nothing" here would be
           a false statement about the assessment: it cites things this copy
           does not contain. */
        <p className="govuk-body">
          It rests on {plural(chain.unresolved, 'thing')} that {chain.unresolved === 1 ? 'is' : 'are'} not
          in this copy of the assessment. A shared copy withholds the paper itself and anything
          read directly off it.
        </p>
      ) : steps === 0 ? (
        <p className="govuk-body">
          {noun === 'Passage of the paper'
            ? 'This is the paper itself. Nothing in the assessment sits behind it.'
            : 'This cites nothing else in the assessment. It is either read straight off the paper or worked out by a step that reads the document rather than earlier findings.'}
        </p>
      ) : (
        <>
          <p className="govuk-body">
            Each list below is what the one before it cites, working back from {thing} to the
            paper. What {thing} cites directly was often written several steps earlier in the
            assessment, not the step before.
            {growing
              ? ' The lists get longer going back, because each step reads several things from the work before it.'
              : ''}
          </p>
          <p className="govuk-body">
            Followed back {plural(steps, 'citation')}, through{' '}
            {plural(chain.reached, 'item the assessment established', 'items the assessment established')}
            {chain.sources.length
              ? `, ending at ${plural(chain.sources.length, 'passage')} of the paper itself.`
              : '. None of them quotes the paper directly.'}
            {chain.unresolved
              ? ` ${chain.unresolved} further ${chain.unresolved === 1 ? 'reference is' : 'references are'} not in this copy.`
              : ''}
          </p>
        </>
      )}

      {/* Two different reasons to stop, and they are not the same sentence. */}
      {chain.stoppedBy === 'nodes' ? (
        <InsetText>
          The trail goes further than this. It was followed to {chain.reached} items and
          stopped — not because there was nothing else, but because a list longer than this
          answers nothing.
        </InsetText>
      ) : chain.stoppedBy === 'depth' ? (
        <InsetText>
          The trail goes further back than this. It was followed back {plural(steps, 'citation')} and
          stopped there; what those rest on in turn is reachable by opening any of them.
        </InsetText>
      ) : null}

      {steps ? <Trail noun={noun} hops={chain.hops} sources={chain.sources} /> : null}

      {chain.hops.map((hop) => (
        <div key={hop.depth} className="prt-rung">
          <h3 className="govuk-heading-s prt-rung__head" id={rungIdOf(hop.depth)}>
            {hop.depth === 1
              ? 'What it cites directly'
              : `Behind those, ${inWords(hop.depth)} citations back`}
            {' — '}{hop.items.length}
          </h3>
          <p className="govuk-body-s prt-meta prt-rung__gloss">
            {listGloss(hop.depth, thing, hop.items, stageOf)}
          </p>
          <ItemList items={hop.items} link={link} stageOf={stageOf} />
        </div>
      ))}

      {chain.sources.length ? <Paper sources={chain.sources} link={link} stageOf={stageOf} marks={marks} /> : null}
    </section>
  );
}

/**
 * THE TRAIL, AS BOXES — and every box carries its words.
 *
 * It replaced `ChainRail`: dark bands on an eighteen-step axis, sized by count
 * and placed by step, whose labels printed only when a band was 55% of its row
 * and were then clipped sideways inside it ("21 items, stages"). No legend,
 * some bands with text and some without, and every figure in it was already in
 * the headings of the lists below. John: "the text not rendering is
 * confusing".
 *
 * So the picture keeps the one thing it was for — the SHAPE of the walk, from
 * this item back to the paper, in order — and drops the axis. Each box is a
 * link to its list. No step numbers: the lists below carry those, for the
 * reader who wants them.
 */
function Trail({ noun, hops, sources }: {
  noun: string;
  hops: ReturnType<typeof provenance>['hops'];
  sources: Artefact[];
}) {
  const passages = sources.filter((s) => s.kind === 'passage').length;
  const quotations = sources.length - passages;
  return (
    <ol className="prt-trail" aria-label="The trail from this item back to the paper">
      <li className="prt-trail__step">
        <span className="prt-trail__box prt-trail__box--self">
          <span className="prt-trail__n">This</span>
          <span className="prt-trail__words">{noun.toLowerCase()}</span>
        </span>
      </li>
      {hops.map((hop) => (
        <li key={hop.depth} className="prt-trail__step">
          <a className="prt-trail__box" href={`#${rungIdOf(hop.depth)}`}>
            <span className="prt-trail__n">{hop.items.length}</span>
            <span className="prt-trail__words">
              {hop.depth === 1
                ? `${hop.items.length === 1 ? 'thing' : 'things'} it cites directly`
                : 'behind those'}
            </span>
          </a>
        </li>
      ))}
      {sources.length ? (
        <li className="prt-trail__step">
          <a className="prt-trail__box prt-trail__box--paper" href="#paper">
            <span className="prt-trail__n">{passages || quotations}</span>
            <span className="prt-trail__words">
              {passages
                ? `${passages === 1 ? 'passage' : 'passages'} of the paper${quotations ? `, and ${plural(quotations, 'quotation')}` : ''}`
                : `${quotations === 1 ? 'quotation' : 'quotations'} from the paper`}
            </span>
          </a>
        </li>
      ) : null}
    </ol>
  );
}

/**
 * THE END OF THE TRAIL — and it is not all passages.
 *
 * `provenance()` collects a source from every ancestor that has any paper
 * wording, which for anything but a passage is its own `sourceQuote` — the clause
 * that item pulled out, not the passage it came from. Both belong here: the
 * trail really did end at the paper through them. What was wrong was calling
 * all of them passages and then ordering the whole set by page alone.
 *
 * So passages lead, quotations follow, page order holds within each, and the
 * heading counts the two separately. Nothing is dropped and nothing is reordered
 * that a reader was relying on.
 */
function Paper({ sources, link, stageOf, marks }: {
  sources: Artefact[];
  link: (a: Artefact) => ReactNode;
  stageOf: StageOf;
  marks: (string | null | undefined)[];
}) {
  const passages = sources.filter((s) => s.kind === 'passage');
  const quotations = sources.filter((s) => s.kind !== 'passage');
  const ordered = [...passages, ...quotations];
  const shown = ordered.slice(0, 6);
  const rest = ordered.slice(6);

  return (
    <>
      <h3 className="govuk-heading-s" id="paper">
        Back at the paper — {passages.length && quotations.length
          ? `${plural(passages.length, 'passage')} and ${plural(quotations.length, 'quotation')}`
          : passages.length
            ? plural(passages.length, 'passage')
            : plural(quotations.length, 'quotation')}
      </h3>
      <p className="govuk-body">
        The document&rsquo;s own wording. Everything above was built from these.
        {quotations.length ? (
          <> A <em>quotation</em> is the clause one of the items above recorded; the passage it
          was taken from is not itself in this trail. Passages come first, then quotations, each
          in the order they appear in the paper.</>
        ) : (
          <> They are in the order they appear there.</>
        )}
      </p>
      {shown.map((source) => (
        <div key={source.id} className="prt-source">
          {/* Attribution above the quotation, the way a citation reads — and
              nothing at all where the document has no pages. */}
          <p className="govuk-body-s prt-source__cite">
            {link(source)}
            {source.kind === 'passage' ? null : (
              <span className="prt-meta"> · quoted by this {kindNoun(source.kind).toLowerCase()}</span>
            )}
            {source.page ? <span className="prt-meta"> · page {source.page}</span> : null}
          </p>
          {/* MARKED, because otherwise this is two thousand words and the
              reader is looking for one clause. The marks are the quotes the
              trail's own items recorded, not a keyword search. */}
          <Quoted text={paperWording(source) ?? ''} quotes={marks} />
        </div>
      ))}
      {rest.length ? (
        <Details summary={`The other ${rest.length} ${rest.length === 1 ? 'one' : 'of them'}`}>
          <ItemList items={rest} link={link} stageOf={stageOf} />
        </Details>
      ) : null}
    </>
  );
}

/**
 * What a given list actually is, read off the list.
 *
 * IT HAS TO BE MEASURED, NOT ASSERTED. This used to hard-code the distance —
 * the first list was "one stage of the run away", the third "mostly read off
 * the document" — and both were wrong on the real run, above lists whose own
 * tags said so on the same line. So the sentence is built from the items the
 * list is about to show, and the page cannot contradict itself.
 */
function listGloss(depth: number, thing: string, items: Artefact[], stageOf: StageOf): string {
  const what = depth === 1
    ? `What ${thing} was written from.`
    : depth === 2
      ? 'What those in turn were written from.'
      : 'What the list above was written from.';

  // A pass owns ordinals in the hundreds — `PASS_BASE * n + k` — which are not
  // on the run's scale, so they are left out of the range rather than printed as
  // a step number nobody can place.
  const ordinals = items.map((item) => stageOf(item.id)).filter((n) => Number.isFinite(n) && !isPassStage(n));
  if (!ordinals.length) return what;

  const low = Math.min(...ordinals);
  const high = Math.max(...ordinals);
  return low === high
    ? `${what} All of it was written at step ${low + 1}.`
    : `${what} Written at steps ${low + 1} to ${high + 1}.`;
}

/**
 * Where the item sits in the document.
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

/**
 * A way to beat it: its own numbers and its narrative.
 *
 * The report's list carries the rank, the band and the score and nothing else.
 * This is the rest: what the four judgements actually scored, and the fields
 * the model writes about how the thing would run. It opens with a picture —
 * who is positioned to run it, what has to be true for it to work, and what
 * gives way when it does — because those three fields make a sentence.
 */
function PlaySection({ play, resolve, linkTo }: {
  play: ReturnType<typeof plays>[number];
  resolve: (id: string) => Artefact | null;
  linkTo: (a: Artefact) => ReactNode;
}) {
  // `counter` is drawn by the flow as "what would stop it", and `legality` rides
  // on the cards in the report, so neither is repeated here.
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
      <p className="govuk-body">
        The score is the geometric mean of the four below, so one low judgement pulls it down hard.
      </p>
      {/*
        A TABLE THAT LOOKS LIKE ONE (phase 21). The factor names are row headers
        and bold; what a high score means is a gloss, in the secondary colour;
        the score is right-aligned with a slim bar of one fixed length, so four
        bars are four comparable lengths. The score is drawn as well as printed
        because four numbers between 66 and 82 read as four similar numbers,
        and the bars say which judgement is carrying the rank.
      */}
      <Table
        className="prt-table prt-table--zebra"
        caption="Each judgement, scored from nought to a hundred"
        captionSize="s"
        scroll
        firstCellIsHeader
        columns={[
          { header: 'Judgement', width: '12rem' },
          { header: 'What a high score means', className: 'prt-table__secondary' },
          { header: 'Score', numeric: true, className: 'prt-table__num' },
        ]}
        rows={play.factors.map((factor) => {
          const term = explain(factor.key);
          return [
            term?.label ?? fieldLabel(factor.key),
            term?.read ?? '—',
            <Bar value={Math.round(factor.value * 100)} max={100} />,
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
              {/* A precedent from the model's own recall is worth reading and
                  is not evidence; the label is what stops it passing for one. */}
              {key === 'precedent' && precedentOf(play.artefact).label ? (
                <p className="govuk-body-s">{precedentOf(play.artefact).label}.</p>
              ) : null}
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
  link: (a: Artefact) => ReactNode;
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
            className="prt-table"
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
            className="prt-table"
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

      <h3 className="govuk-heading-s">
        The ways to beat it that this bears on — {links.plays.length} of {list.length}
      </h3>
      <p className="govuk-body">
        Grouped by how the link was made, strongest first, because they are not the same kind of
        claim. A walk out from a recommendation reaches nearly every way to beat the policy in the
        assessment — so distance on its own means nothing here, and each group states the rule it
        used.
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
              className="prt-table prt-table--zebra"
              caption={`${TIER_LABEL[tier]} — ${inTier.length}`}
              captionSize="s"
              scroll
              columns={[
                { header: 'Rank', numeric: true, width: '5rem' },
                { header: 'Way to beat it' },
                { header: 'Body or group' },
                { header: 'How exposed', width: '10rem' },
                { header: 'Score', numeric: true, className: 'prt-table__num' },
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
