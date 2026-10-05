import {
  actorBoard, bandCounts, checks, evidenceMix, findingsBySection,
  headlineSentence, interplay, personaBoard, plays, recommendations,
} from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { network } from '$lib/policy-analysis/network';
import { leverage } from '$lib/policy-analysis/stress';
import { mechanismChart } from '$lib/mechanisms';
import { scenarioViews } from '$lib/scenario-view';
import type { Detail } from '../api';
import { Details, InsetText, Pagination } from '../govuk';
import { MOVES, viewPath } from '../moves';
import {
  filterPlays, mechanismIdsOf, mechanismsOf, narrowExcept, parseSelection, selectionParam, type Selection,
} from './selection';
import { byReason, groupLimits, truncations } from './warnings';
import { Metrics } from './Metrics';
import { WriteUp } from './WriteUp';
import { SelectionBanner } from './moves/SelectionBanner';
import { VerdictLead } from './moves/VerdictLead';
import { Brief } from './Brief';
import { PatternGrid } from './PatternGrid';
import { briefOf } from '$lib/brief';
import { overviewOf } from '$lib/overview';
import { markDownJudgements } from '$lib/evidence-grade';
import { withoutIds } from '$lib/policy-analysis/plain';
import { policyTerms, termFinder } from '$lib/policy-terms';
import { TermsContext } from './Term';
import { Overview } from './Overview';
import { WorstPlays } from './moves/WorstPlays';
import { CausalityLead } from './moves/CausalityLead';
import { ThreatsLead } from './moves/ThreatsLead';
import { ProvenanceLead } from './moves/ProvenanceLead';
import { ActorsLead } from './moves/ActorsLead';
import { ScoresTable } from './ScoresTable';
import { WatchList } from './WatchList';
import { ChangeStrips } from './ChangeStrips';
import { RestsOnWhat } from './RestsOnWhat';
import { Glossary } from './Glossary';
import { rankFindings } from '$lib/writeup-view';
import { changeStrips, programmeStrip } from '$lib/change-strip';
import { NetworkSection } from './Network';
import { StressLab } from './StressLab';
import { Shares } from './Shares';
import { Addenda, AddendumNotice } from './Addenda';
import { ExposureRail } from './ExposureRail';
import { ExposureSpread } from './ExposureSpread';
import { NoneUnder, ScopeNote } from './moves/NoneUnder';
import { Contents, type ContentsEntry, type Place } from './Contents';
import { moveCounts } from './tabcounts';
/* Move 1: the four figures, the legality shape, the challenge round and the
   evaluation plan — every one of them already in the payload and drawn nowhere. */
import { FactorProfile } from './FactorProfile';
import { Legality } from './Legality';
import { EvidenceCoverage } from './EvidenceCoverage';
import { CheckLedger } from './CheckLedger';
import { Assurance } from './Assurance';
import { Rival } from './Rival';
import { CheckedOutside } from './CheckedOutside';
import { ReaderActions } from './ReaderActions';
import { Cleared } from './Cleared';
import { rivalExplanations } from '$lib/assurance-view';
import { clearanceNotes, clearedBodies } from '$lib/policy-analysis/cleared';
import { Options } from './Options';
import { Fragile } from './Fragile';
import { Recommendations } from './Recommendations';
import { BurdenBars } from './BurdenBars';
import { ChallengeNote, DroppedRecs, RecCoverage } from './RecCoverage';
/* Move 2, 3 and 4: what the paper is made of, the conditions it has to survive,
   and the three sections Move 4's one table used to stand in for. */
import { Composition } from './Composition';
import { Scenarios } from './Scenarios';
import { ActorFunnel } from './ActorFunnel';
import { CastGrid } from './CastGrid';
import { Models } from './Models';
import { Resolution } from './Resolution';
/* Provenance: the run itself, what it could not see, and what it could not establish. */
import { RunProfile } from './RunProfile';
import { Withheld } from './Withheld';
import { Limits } from './Limits';
import { DownloadGrid } from './DownloadGrid';

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
type Move = 'overview' | 'verdict' | 'causality' | 'threats' | 'actors' | 'provenance' | 'do';

/**
 * `do` IS NOT A VIEW, and that is the point.
 *
 * Downloading a copy, attaching what came after, and making a link to send are
 * not answers to "what did it conclude" — they are things you do with the
 * answer. They sat at the foot of the Verdict panel, where between them they
 * added about three thousand pixels of forms and radio buttons to the one view
 * every reader lands on, so the last thing a reader saw of the assessment's
 * conclusion was a file picker. Phase 20 moved them after the report, once, as
 * a big block under every view; phase 21 gives them a page of their own,
 * `/assessments/:id/use`, reached from a one-line bar above the footer — a set
 * of actions is not content, and was being laid out as if it were.
 */
const ACTIONS = 'do' satisfies Move;

interface Section extends ContentsEntry {
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
const MOVE_ORDER: Move[] = ['overview', 'verdict', 'causality', 'threats', 'actors', 'provenance', 'do'];

/**
 * WHAT EACH SECTION ANSWERS, in a line, for the "In this section" cards (phase 20).
 *
 * A title like "What makes them work" is a good heading once you are reading
 * the section and a riddle on a card you are choosing from. A section with no
 * entry here simply draws its card without a line.
 */
const SECTION_NOTES: Record<string, string> = {
  'exposure-profile': 'The three most dangerous, ranked.',
  legality: 'Which break a rule, which do not, and each one by name.',
  suggests: 'What to change, what it costs, and who carries it.',
  howyoudknow: 'The measures that would show whether it is working.',
  rests: 'The assumptions the most conclusions depend on.',
  outside: 'What was looked up, what came back, and what is still open.',
  writeup: 'Every finding, grouped by what it is about.',
  checks: 'Twelve fixed tests of how the policy is wired.',
  patterns: 'Which kinds of idea, aimed at which parts.',
  bands: 'How many are severe, significant, moderate or limited.',
  weights: 'Every way to beat it, worst first.',
  watch: 'Early warnings, and what would stop each one.',
  spread: 'Whether the scores bunch together or spread out.',
  factors: 'Incentive, ease, impact and how hard each is to see.',
  scores: 'The four scores behind every way to beat it.',
  scenarios: 'Changes in the world the policy has to survive.',
  stress: 'Switch off an assumption and see what falls.',
  change: 'How each part is meant to work, step by step.',
  network: 'Who the paper says is connected to what.',
  actors: 'How many bodies could act, and which could not.',
  cast: 'What moves each body, and what the paper leaves open.',
  models: 'The games between bodies that the policy sets up.',
  resolution: 'Names the paper leaves ambiguous.',
  machine: 'How much the run produced.',
  discarded: 'What the model wrote that was thrown out, and why.',
  provenance: 'Which model, how long each step took, what it cost.',
  withheld: 'Steps where the model saw only part of the assessment.',
  gaps: 'Every limit a step recorded, each said once.',
  composition: 'The claims and machinery the paper is built from.',
  evidence: 'Which claims have evidence behind them.',
  assurance: 'The challenge round that attacked the findings.',
};

/**
 * The order a view is READ in — and, since phase 21, the order its pages run
 * in: the first bare section is the landing page, and previous/next walks the
 * rest in this order. Module scope since phase 21, because it is a constant
 * and three closures declared before the sections now need it. The argument for
 * each position is the long note above the pack's `return`.
 */
const READING_ORDER: Partial<Record<Move, string[]>> = {
  verdict: [
    'main-findings', 'exposure-profile', 'rival', 'legality',
    'suggests', 'howyoudknow', 'rests', 'outside',
    'writeup', 'checks',
  ],
  threats: [
    'patterns', 'bands', 'weights', 'watch', 'spread', 'factors', 'scores', 'cleared', 'scenarios', 'stress',
  ],
  causality: ['mechanisms', 'change', 'network'],
  provenance: [
    'machine', 'discarded', 'provenance', 'withheld', 'gaps', 'composition', 'evidence', 'assurance', 'paper',
  ],
};

/**
 * What a move is called, for anything that has to say its name rather than use
 * its key. `Contents of causality` is an internal id read aloud to a screen
 * reader; `In Causes` is the name on the navigation that opens it. Read off
 * `MOVES`, so the page and the service navigation cannot name a view twice.
 */
const MOVE_LABEL: Record<Move, string> = {
  ...(Object.fromEntries(MOVES.map((entry) => [entry.id, entry.label])) as Record<Exclude<Move, 'do'>, string>),
  do: 'What you can do with this',
};

/**
 * WHICH PAGE OF THE REPORT IS ON SCREEN (phase 21), handed down by the route.
 *
 * `view` is a move — or `do`, for the page of actions — and `section` one of its
 * sections; absent, the page is the view's landing page. `anchor` is the
 * location's hash, so a link to a heading inside a section lands on it.
 * `navigate` is the router's, passed in rather than imported for the reason
 * `ArtefactLink` gives: this tree renders into a pack with no router at all.
 */
export type ReportRoute = {
  view: Move;
  section?: string;
  anchor?: string;
  navigate: (href: string, options?: { replace?: boolean }) => void;
};

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
/**
 * `at` IS THE READER'S POSITION IN THE REPORT, and it is an opaque query string
 * rather than a route — nothing in this tree learns what a URL looks like. It is
 * a parameter at all because the `replaceState` effect below runs AFTER the
 * render that built a link's closure: a renderer reading `window.location.search`
 * for itself carries the position as it was before the reader's last selection,
 * and sends them back to the wrong place in silence.
 */
export type ArtefactLink = (artefact: Artefact, label?: string, at?: string) => ReactNode;

/**
 * `offline` suppresses the download section.
 *
 * Its links point at `/api/policy-analysis/:id/export`, which in a pack opened
 * from `file://` is a server that is not there — three dead links offering the
 * reader the very file they are already reading. Found by looking at a real pack
 * rather than by any test, which is the argument for looking at real output.
 */
/**
 * THE TWO READINGS EVERY PAGE OF THE REPORT TAKES, ONCE, AT THE ROOT (phase 23).
 *
 * `withoutIds`: an identifier the model wrote into a sentence — the live run's
 * scenarios say "If s1_023_assumption_001 is true" 76 times — is read as the
 * name of the item it points to, so no page, the pack included, ever shows
 * one. The glossary: the paper's own names, defined on tap wherever a sentence
 * uses them (`Term`). Both here, around the report, rather than in each
 * component, for the reason `markDownJudgements` is at the root below.
 */
export function Report(props: Parameters<typeof ReportBody>[0]) {
  const { detail } = props;
  const shown = useMemo(() => withoutIds(detail.artefacts), [detail.artefacts]);
  const readable = useMemo(() => (shown === detail.artefacts ? detail : { ...detail, artefacts: shown }), [detail, shown]);
  const finder = useMemo(() => termFinder(policyTerms(shown)), [shown]);
  return (
    <TermsContext.Provider value={finder}>
      <ReportBody {...props} detail={readable} />
    </TermsContext.Provider>
  );
}

function ReportBody({ detail, offline, linkTo, onChanged, route, onTitle }: {
  detail: Detail;
  offline?: boolean;
  linkTo?: ArtefactLink;
  /** The service only. Absent, the report is the pack's one cascading document. */
  route?: ReportRoute;
  /** What this page is, for the document title — "Ways to beat it — Threats". Null on the Summary. */
  onTitle?: (title: string | null) => void;
  /**
   * Called when something started a pass, so the page that owns the fetch can
   * refetch. A pass changes the assessment's own status, so the report is no
   * longer the thing to show — the progress list is.
   */
  onChanged?: () => void;
}) {
  const { analysis, stages } = detail;
  /*
   * THE JUDGEMENTS THE EVIDENCE WILL CARRY, ONCE, AT THE ROOT (phase 22). A
   * "well supported" with nothing better than weak evidence behind it is read
   * as "supported with limits" by every figure, chip and tally below, and
   * carries the sentence that says why — see `$lib/evidence-grade`. Done here
   * rather than in each component because three components printing a
   * judgement and one of them forgetting to mark it down is the disagreement
   * this report exists to catch in other documents. Same array back when
   * nothing changes, so nothing downstream re-renders for it.
   */
  const artefacts = useMemo(() => markDownJudgements(detail.artefacts), [detail.artefacts]);

  /*
   * Declared before the shaping, because the board and the leads all narrow by
   * them now. Order matters here in a way it did not when the report was one
   * cascade that honoured no selection at all.
   */
  /*
   * THE PAGE COMES FROM THE ROUTE NOW (phase 21). It was state — the tab that
   * was open — written into `?move=`; the view and the section are the path,
   * so there is nothing to hold. The pack has no route and reads everything.
   */
  const move: Move = route?.view ?? 'overview';
  /*
   * READ FROM THE URL BEFORE THE FIRST RENDER, not in an effect after it. The
   * writing effect below runs in the same commit as the reading one, with the
   * state as it was — so a reader effect let the writer strip `sel` from the
   * address on the first commit and the reader put it back on the second, and
   * with the router now doing the writing that was two navigations and a
   * service navigation drawn, for one frame, without the selection in its
   * links. The pack has no URL worth reading and starts empty.
   */
  const fromUrl = (name: string) => (offline ? null : new URLSearchParams(window.location.search).get(name));
  const [selection, setSelection] = useState<Selection>(() => parseSelection(fromUrl('sel'), artefacts));
  /*
   * THE SCENARIO, HELD HERE SO IT CAN GO IN THE URL. It was plain state inside
   * `StressLab` — the only thing on the page you RUN, and the only state a
   * drill-and-back destroyed. `StressLab` keeps its own copy when this is not
   * passed, which is what the offline pack wants.
   */
  const [failed, setFailed] = useState<string[]>(() => (fromUrl('fail') ?? '').split(',').filter(Boolean));

  /**
   * WHAT TRAVELS WITH EVERY LINK BETWEEN THE REPORT'S PAGES.
   *
   * The selection and the scenario. A filter that survives a page change only
   * if the reader arrived by Back is a filter that breaks silently — nothing
   * throws, the next page is simply wider than the banner says — so every link
   * this tree builds carries both, and the router's own location keeps them
   * once it is there.
   *
   * FROM STATE, NEVER FROM THE URL, for the reason `ArtefactLink` records: the
   * effect that writes the URL has not run yet when a link renders.
   */
  const carried = useMemo(() => {
    const params = new URLSearchParams();
    const sel = selectionParam(selection);
    if (sel) params.set('sel', sel);
    if (failed.length) params.set('fail', failed.join(','));
    return params.toString();
  }, [selection, failed]);

  /** A page of this report, as a URL. `sel` overrides the carried selection for a link that sets one. */
  const hrefOf = (view: Move, section?: string, anchor?: string, sel?: Selection): string => {
    let query = carried;
    if (sel !== undefined) {
      const params = new URLSearchParams(carried);
      const param = selectionParam(sel);
      if (param) params.set('sel', param); else params.delete('sel');
      query = params.toString();
    }
    return `${viewPath(analysis.id, view === ACTIONS ? 'use' : view, section, query)}${anchor ? `#${anchor}` : ''}`;
  };

  /**
   * A link to another page that routes rather than reloads.
   *
   * A plain `<a>` with the router's navigation on a plain click, which is the
   * `Overview`'s old `Go` generalised: a modified click is a request for a new
   * tab and the `href` is right for one, so only the plain case is taken.
   * Router-free, because this is the report tree — see `ReportRoute`.
   */
  const follow = (href: string): Place => ({
    href,
    onClick: route ? (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      route.navigate(href);
    } : undefined,
  });

  /**
   * WHERE THE READER IS, HANDED TO EVERY LINK OUT TO AN ITEM.
   *
   * The item page is a separate route and its back link used to reset the view
   * and clear the selection, so following a play out of Threats under a
   * mechanism and pressing the one visible way back landed on the summary
   * showing everything — while the browser's own Back, which nobody is looking
   * at, preserved the position perfectly.
   *
   * SINCE PHASE 21 IT IS A PATH AND QUERY — the page, its section and what is
   * carried — because where a reader is has become a page. `returnTo` in
   * `client/moves.ts` reads it, and still reads the old `move=` shape.
   */
  const at = useMemo(
    () => (offline ? '' : viewPath(analysis.id, move === ACTIONS ? 'use' : move, route?.section, carried)),
    [offline, analysis.id, move, route?.section, carried],
  );

  /*
   * UNDEFINED STAYS UNDEFINED. The pack passes no `linkTo` at all and a dozen
   * components branch on its absence to render a plain label; wrapping it into a
   * function that is always defined would put link machinery into the one bundle
   * that must not have any.
   */
  const link = useMemo<ArtefactLink | undefined>(
    () => (linkTo ? (artefact, label) => linkTo(artefact, label, at) : undefined),
    [linkTo, at],
  );

  /*
   * BACK AND FORWARD RESTORE WHAT WAS CARRIED.
   *
   * A routed link carries the selection, so the state is already right when it
   * lands; the browser's own Back is the one move that changes the address
   * underneath a mounted report, so that is what is listened for. Re-read on a
   * fresh payload too, so a selection naming an item the new payload no longer
   * holds resolves to nothing rather than to a label that lies.
   */
  useEffect(() => {
    if (offline) return;
    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      setSelection(parseSelection(params.get('sel'), artefacts));
      // Validated on the way in by `StressLab`'s existing prune-to-offerable
      // effect, so a pasted id that is no longer a lever is dropped rather
      // than producing a results panel with nothing ticked.
      setFailed((params.get('fail') ?? '').split(',').filter(Boolean));
    };
    apply();
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, [offline, artefacts]);

  /*
   * THE URL IS WHAT IS SELECTED, as well as where you are.
   *
   * THROUGH THE ROUTER, NOT `history.replaceState` (phase 21). The service
   * navigation is drawn from the router's location, and an address the router
   * did not write is one it never sees — so a selection made on a page left
   * every link in the navigation without it. REPLACE, NOT PUSH: ten presses on a
   * band are not ten presses of Back between the reader and the page before.
   */
  useEffect(() => {
    if (offline || !route) return;
    const params = new URLSearchParams(window.location.search);
    const sel = selectionParam(selection);
    if (sel) params.set('sel', sel); else params.delete('sel');
    // Ids are ~28 characters, so a three-lever scenario costs about 90 of
    // query string.
    if (failed.length) params.set('fail', failed.join(',')); else params.delete('fail');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      route.navigate(next, { replace: true });
    }
    // `route` changes identity on every render of the page that owns it; the
    // writer answers the selection, not the page.
  }, [selection, failed, offline]);
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
   * THE FOUR-CELL LEDGER ("What it found") WAS CUT IN PHASE 19. Its figures —
   * ways to beat it, inside the rules, checks that fell short, open questions —
   * each lead a section of their own now, and a row of counts at the foot of
   * the Verdict said nothing those sections do not.
   */
  const headline = headlineSentence(artefacts);
  const sectionFindings = findingsBySection(artefacts);
  const recs = recommendations(artefacts);
  const bands = bandCounts(list);
  /*
   * THE ONE-PAGE BRIEF (phase 19, workstream B). `briefOf` walks at most five
   * findings' citation chains on an older assessment, so it is memoised like
   * the other shaping this component re-runs on every stage event.
   */
  const brief = useMemo(() => briefOf(artefacts, stages), [artefacts, stages]);
  /** The summary's figures — see `$lib/overview` for why they are the tabs' own. */
  const overview = useMemo(() => overviewOf(artefacts), [artefacts]);
  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);
  /** What the report prints as its conclusions — the current generation only, for "what rests on what". */
  const shownConclusions = useMemo(() => new Set([
    ...findingsBySection(artefacts).flatMap((group) => group.items.map((item) => item.id)),
    ...recommendations(artefacts).map((rec) => rec.id),
  ]), [artefacts]);
  /*
   * NARROWED, EXCEPT BY A BAND — the plays the Threats figures actually show.
   *
   * The band row and the scatter under "Ease against impact" read the RAW list.
   * Measured live under `?sel=band:severe`, `?sel=band:limited`, a mechanism and
   * a body: the plot drew 47 circles every time and the row printed 20/18/7/2
   * every time, inside a panel whose banner said it was narrowed, 400px below a
   * ranked list that had correctly dropped to six.
   *
   * `'band'` is the own-kind here because the row is how a reader READS the
   * distribution, not how they pick from it — the rail above the tabs is the
   * picker. That is an honest use of `narrowExcept`; the two the leads used were
   * not, and are gone.
   */
  const shownPlays = useMemo(
    () => narrowExcept(list, selection, mechanismIds, 'band'),
    [list, selection, mechanismIds],
  );
  /*
   * 47 PLAYS IS 47 OF 73. The run refused 26 exploitation plays for resting on
   * something other than an assumption — the largest single row `byReason()`
   * returns, and the same row the Provenance panel states in words. "47 plays"
   * with no denominator is exactly the overclaim that panel exists to prevent.
   */
  const playsWritten = useMemo(() => {
    const refused = byReason(warnings).find((row) => /exploitation play/i.test(row.reason))?.count ?? 0;
    return refused ? list.length + refused : 0;
  }, [warnings, list]);
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
  /*
   * THE THEORY-OF-CHANGE STRIPS, for the parts of the policy the most plays
   * rest on. The ranking is `mechanismChart`'s own rows over the WHOLE list —
   * the strips describe the paper, so a selection does not reshuffle them.
   */
  const strips = useMemo(() => changeStrips(
    artefacts,
    mechanismChart(list, (play) => mechanismsOf(play, mechanismIds)).rows.map((row) => ({ id: row.id, plays: row.plays.length })),
    mechanismIds,
    6,
  ), [artefacts, list, mechanismIds]);
  /** The programme's one logic model (stage 14, prompt 3.2 on), which leads the strips. */
  const programme = useMemo(() => programmeStrip(artefacts), [artefacts]);
  /** The watch list narrows by everything selected, like the ranked list it sits under. */
  const watchPlays = useMemo(() => filterPlays(list, selection, mechanismIds), [list, selection, mechanismIds]);


  const sections: Section[] = [];
  /* Above `goTo`, which calls it — the rule `goTo`'s own note states. */
  const inMove = (move: Move) => {
    const rows = sections.filter((entry) => entry.move === move);
    const order = READING_ORDER[move];
    if (!order) return rows;
    const rank = (id: string) => (order.indexOf(id) === -1 ? order.length : order.indexOf(id));
    return rows
      .map((row, pushed) => ({ row, pushed }))
      .sort((a, b) => rank(a.row.id) - rank(b.row.id) || a.pushed - b.pushed)
      .map((entry) => entry.row);
  };
  /**
   * THE VIEW'S LANDING PAGE IS ITS LEAD (phase 21): the section that draws its
   * own heading because it was written as the head of a view. Where a view has
   * two — Findings opens with the brief and also leads its worst three — the
   * one first in reading order is the landing page and the other is a section.
   */
  const leadOf = (move: Move): Section | undefined => {
    const rows = inMove(move);
    return rows.find((entry) => entry.bare) ?? rows[0];
  };
  /** Where an anchor lives: the landing page, a section's own page, or a heading on one. */
  const placeOf = (next: Move, anchor: string, sel?: Selection): string => {
    const rows = inMove(next);
    if (anchor === leadOf(next)?.id) return hrefOf(next, undefined, undefined, sel);
    if (rows.some((entry) => entry.id === anchor)) return hrefOf(next, anchor, undefined, sel);
    const holder = rows.find((entry) => entry.anchors?.some((inner) => inner.id === anchor));
    return holder ? hrefOf(next, holder.id, anchor, sel) : hrefOf(next, undefined, anchor, sel);
  };

  /**
   * Open another view and land on a section inside it.
   *
   * IN THE SERVICE IT IS A NAVIGATION (phase 21): the section is a page, so
   * "land on it" means route to it — with the selection, or with `sel` when the
   * press that sent the reader also chose something, since the state that
   * carries it has not settled yet when the link is built.
   *
   * IN THE PACK IT IS A SCROLL, as it always was: one document, every section
   * on it. Two frames, because a details opened on the way has only just
   * changed the document's height and the browser clamps the scroll after.
   *
   * DECLARED HERE, ABOVE ITS ONLY CALLER, and that is a fix rather than a tidy-up.
   * It used to sit 460 lines below the `section('actors', …)` body that closes
   * over it, and in the OFFLINE PACK pressing "How they connect" threw
   * `ReferenceError: Cannot access '_e' before initialization` and left the
   * reader on a dead control. The service build was fine, so nothing caught it:
   * the pack is a different bundle — one IIFE, `lib` mode, its own minifier pass
   * — and the two disagreed about a `const` referenced from a closure created
   * before the declaration ran. A reader offline has no console and no reload
   * that would help.
   *
   * The rule this now follows needs no knowledge of any minifier: a function a
   * closure calls is declared before the closure is built.
   */
  const goTo = (next: Move, anchor: string, sel?: Selection) => {
    if (route) {
      route.navigate(placeOf(next, anchor, sel));
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    }));
  };

  /**
   * The last argument is what the CONTENTS says about the section, and it is
   * optional because most sections have nothing to add to their own title.
   *
   * A count passed here must come from the array that already decided the
   * section exists — every call below pushes only `if (body)` — so the index and
   * the section cannot drift apart without the body changing too.
   */
  type Index = Pick<ContentsEntry, 'count' | 'anchors'>;
  const section = (id: string, title: string, move: Move, body: React.ReactNode, index?: Index) => {
    if (body) sections.push({ id, title, body, move, ...index });
  };
  /** A lead: same list, same contents entry, but it draws its own heading. */
  const lead = (id: string, title: string, move: Move, body: React.ReactNode, index?: Index) => {
    if (body) sections.push({ id, title, body, move, bare: true, ...index });
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
  /*
   * THE VERDICT LEADS WITH WHAT IT FOUND. Phase 19: the move opened with the
   * worst three plays and reached the write-up at section 8 of 12, as nineteen
   * equal cards. The findings that matter now come first, ranked; the rest are
   * the appendix at the foot of the move. The executive assessment is the
   * headline above the tabs plus the standfirst here, so it is not repeated in
   * the appendix.
   */
  /*
   * THE BRIEF IS THE LEAD NOW, in the slot R left for it. It carries the ranked
   * findings itself on an older assessment, and key judgements on a newer one,
   * so the lead's own list is not drawn under it: five findings above five
   * judgements is the seventy-screen report again, one screen down.
   *
   * WHAT THE LEAD NO LONGER SHOWS GOES TO THE APPENDIX, so nothing is lost:
   * with key judgements every finding is in "All findings"; without them, the
   * ones the brief carries are left out of it. The executive assessment is in
   * it either way now, because the brief keeps one sentence after the headline
   * and the rest of that paragraph has to be somewhere.
   */
  const inBrief = brief.source === 'findings' ? new Set(brief.items.map((item) => item.id)) : new Set<string>();
  const appendix = rankFindings(sectionFindings, artefacts, 0).rest.filter((entry) => !inBrief.has(entry.item.id));
  lead('main-findings', 'Main findings', 'verdict',
    <VerdictLead
      judgements={[]}
      brief={<Brief brief={brief} linkTo={link}
                    downloadHref={offline ? undefined : `/api/policy-analysis/${analysis.id}/export?format=docx&part=brief`} />}
      remaining={appendix.length}
      linkTo={link}
    />);
  lead('exposure-profile', 'The worst ways to beat it', 'verdict',
    <WorstPlays list={list} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={link} />);
  /*
   * THE SHAPE UNDERNEATH THE FOUR BANDS. The rail says twenty of the forty-seven
   * plays are severe; measured on this run the cut it used has 0.0039 between
   * the plays either side of it while the next cut down has 0.0847, and 38 of
   * the 47 sit inside 23% of the scale. It reads the same `list` and holds no
   * selection of its own — the rail keeps that job.
   */
  /*
   * THE EXPOSURE BAR LEADS THREATS NOW. It sat above the tab strip, which made
   * it the second thing every reader met — before a single finding — on every
   * move. It is the band picker too, and a band chosen here still narrows every
   * move: the selection banner above the tabs says so wherever the reader is.
   */
  /*
   * THE PATTERN GRID LEADS THREATS (phase 19, workstream B): which kind of way
   * to beat it, aimed at which part of the policy. It is a picker for two
   * kinds of selection — a kind (row or square) and a part of the policy
   * (column) — so it keeps every row and column under either, and narrows only
   * by a band or a body, which it cannot set. The plays those leave out are
   * taken out of what it is handed; everything else is the assessment as is.
   */
  const gridArtefacts = useMemo(() => {
    if (selection?.kind !== 'band' && selection?.kind !== 'actor') return artefacts;
    const keep = new Set(filterPlays(list, selection, mechanismIds).map((play) => play.artefact.id));
    return artefacts.filter((a) => a.kind !== 'exploit' || keep.has(a.id));
  }, [artefacts, list, selection, mechanismIds]);
  lead('patterns', 'The same few ideas, aimed at the same parts', 'threats',
    list.length ? <PatternGrid artefacts={gridArtefacts} selection={selection} onSelect={setSelection} linkTo={link} /> : null);
  section('bands', 'How exposed the policy is', 'threats',
    list.length ? <ExposureRail bands={bands} total={list.length} selection={selection} onSelect={setSelection} /> : null);
  section('spread', 'How the scores are spread', 'threats', <ExposureSpread list={list} />);
  /*
   * CHECKED AND CLEARED (phase 22). The rows that said a body had no material
   * way to beat the policy are out of `list` and so out of every figure above;
   * this is the one place they are shown. Gated on there being any, so a run
   * whose every row is a real play has no empty section.
   */
  const cleared = clearedBodies(artefacts);
  const clearedNotes = clearanceNotes(artefacts);
  section('cleared', 'Checked and cleared', 'threats', cleared.length || clearedNotes.length ? (
    <Cleared bodies={cleared} notes={clearedNotes} actors={byId} linkTo={link} />
  ) : null, cleared.length ? { count: { n: cleared.length, noun: cleared.length === 1 ? 'body' : 'bodies' } } : undefined);
  /*
   * ANOTHER EXPLANATION (phase 22): the strongest competing account of the
   * report's most consequential conclusion, what would tell the two apart, and
   * how the assured report disposed of it. On Findings, beside the conclusions
   * it competes with — a rival kept on the method page is a rival nobody
   * deciding anything reads. Nothing on a run before the remit existed.
   */
  const rivals = rivalExplanations(artefacts);
  section('rival', 'Another explanation', 'verdict', rivals.length ? <Rival rivals={rivals} linkTo={link} /> : null);
  /*
   * CHECKED OUTSIDE THE PAPER (phase 22 part 2): every research question, what
   * came back, what it did and what is still open — the work the research step
   * did, which no page showed. Gated on there being a question at all. The
   * two actions ride on each open gap in the service only: the pack has no
   * server, and a read-only copy would answer 403.
   */
  section('outside', 'Checked outside the paper', 'verdict', artefacts.some((a) => a.kind === 'research_question') ? (
    <CheckedOutside
      artefacts={artefacts}
      stages={stages}
      linkTo={link}
      actions={offline || detail.readOnly ? undefined : (question) => (
        <ReaderActions analysisId={analysis.id} target={question} onStarted={onChanged} />
      )}
    />
  ) : null);
  /*
   * EVERY SECTION BELOW IS GATED ON ITS OWN INPUT, and six of tonight's were
   * handed over ungated. `section()` keeps any TRUTHY body and a JSX element is
   * always truthy, so a component that returns `null` for a run it has nothing
   * to say about still registers its heading — and, now, a numbered entry in the
   * contents list pointing at an empty one. Each gate here is a NECESSARY
   * condition of the component's own guard, read off the same field, so it can
   * only drop the empty case and can never hide a section that would have drawn.
   */
  /*
   * WHY THE EXPOSURE IS WHERE IT IS. `factorProfile()` has been in the view
   * layer since the fork was made, documented as a figure the verdict shows
   * beside the headline, and its only caller was its own test.
   */
  section('factors', 'What makes them work', 'threats',
    list.length ? <FactorProfile list={list} linkTo={link} /> : null);
  /*
   * THE SHARPEST CLAIM, WITH A MAGNITUDE ON IT. Band and legality are both on
   * every play and the report drew each of them alone — the bar at the top of
   * the page, the pill 1,400px below it on three cards.
   */
  // The title is a QUESTION since phase 21: "Nothing here breaks a rule" was a
  // claim printed whatever the run found, and the answer is the section's job.
  section('legality', 'Do they break a rule?', 'verdict',
    list.length ? <Legality list={list} linkTo={link} /> : null);
  /*
   * TWO RANKINGS OF THE SAME 444 ASSUMPTIONS THAT DO NOT OVERLAP. `leverage()`
   * is already computed for the stress lab and is passed rather than re-run.
   * `onStress` rather than `goTo` so `Fragile` knows nothing about moves — it
   * renders in the pack, where there is no router and no spine.
   *
   * AFTER `legality`, which is where its own author asked for it: the change
   * said "after the legality section" and there was no legality section to put
   * it after until this merge. The three together read as the claim, the rule it
   * does not break, and what the claim rests on.
   */
  /*
   * WHAT RESTS ON WHAT, FOR THE ASSUMPTIONS THAT CARRY THE MOST. The stress
   * test, run once per assumption before anybody ticks anything, as a short
   * tree each. The two rankings `Fragile` compares are still here, one click
   * down: they explain why these assumptions and not the ones the run itself
   * judged most important.
   */
  section('rests', 'What rests on what', 'verdict', levers.length ? (
    <>
      <RestsOnWhat artefacts={artefacts} levers={levers} shown={shownConclusions} linkTo={link}
                   onStress={() => goTo('threats', 'stress')} />
      <Details summary="Two ways to rank the assumptions, and why they disagree" open={offline}>
        <Fragile artefacts={artefacts} levers={levers} />
      </Details>
    </>
  ) : null);

  lead('mechanisms', 'The parts of the policy most ways to beat it rest on', 'causality',
    <CausalityLead artefacts={artefacts} list={list} selection={selection} onSelect={setSelection} mechanismIds={mechanismIds} linkTo={link} offline={offline} />);
  section('change', 'How each part is meant to work', 'causality',
    strips.length || programme ? <ChangeStrips strips={strips} programme={programme} linkTo={link} /> : null,
    { count: { n: strips.length, noun: 'parts' } });
  lead('weights', 'Ways to beat it', 'threats',
    <ThreatsLead
      list={list}
      selection={selection}
      mechanismIds={mechanismIds}
      linkTo={link}
      onClear={() => setSelection(null)}
      written={playsWritten}
      onProvenance={() => goTo('provenance', 'discarded')}
    />, list.length ? { count: { n: list.length, noun: 'ways to beat it' } } : undefined);
  /*
   * MOVE 4 GETS THE LEAD IT NEVER HAD. The other three each open with one; this
   * one opened with a twelve-row table, which is why its panel measured 919px
   * against Threats' 6,104px. See `ActorsLead` for what was already written and
   * connected to nothing.
   */
  lead('interplay', 'Who is coming for what', 'actors',
    <ActorsLead
      artefacts={artefacts}
      plays={boardPlays}
      interplay={interplayMap}
      personas={personaGroups}
      selection={selection}
      onSelect={setSelection}
      mechanismIds={mechanismIds}
      linkTo={link}
    />);
  /*
   * THE MACHINE'S FIGURES, WHERE A READER ASKING ABOUT THE MACHINE LOOKS. They
   * were the six cells above the headline on every move — "2,296 artefacts
   * held", "10h 23m" — so the first thing anyone read was about the run rather
   * than the paper. How long it ran and what it cost are in "How this was
   * produced" below.
   */
  section('machine', 'What the run made', 'provenance', (
    <Metrics
      columns={3}
      metrics={[
        { label: 'Items the run kept', value: artefacts.length.toLocaleString(), note: 'findings, evidence and everything between' },
        { label: 'Passages of the paper read', value: artefacts.filter((a) => a.kind === 'passage').length.toLocaleString() },
        { label: 'Steps finished', value: `${stages.filter((stage) => stage.status === 'completed').length} of ${stages.length}` },
      ]}
    />
  ));
  lead('discarded', 'What was discarded, and why', 'provenance',
    <>
      {/* The one panel that is about the RUN and not the paper, under a banner
          that says the whole report is narrowed. It wraps rather than edits
          because `ProvenanceLead` belongs to another change tonight. */}
      <ScopeNote selection={selection} subject="the run, not the paper" />
      <ProvenanceLead stages={stages} playsKept={list.length} artefacts={artefacts} linkTo={link} />
    </>);

  /*
   * THE SCATTER IS GONE. "Ease against impact" drew 47 marks and 38 of them sat
   * in one clump, so it said less than a sentence would. Its table stays — the
   * only place each play's four scores are side by side — behind a details,
   * because 47 rows is three screens. The counter-measures grouped by
   * mechanism that sat under it are in the watch list now, one row per play.
   */
  section('scores', 'Every way to beat it, scored', 'threats', shownPlays.length ? (
    <Details summary={`Show all ${shownPlays.length} with their four scores`} open={offline}>
      <ScoresTable plays={shownPlays} linkTo={link} />
    </Details>
  ) : null);

  /*
   * THE WATCH LIST. Every play's early warning, what would stop it, and the
   * recommendation that answers it — one table, and a CSV built in the browser
   * so it works from the pack too. Narrowed by the carried selection like the
   * ranked list above it.
   */
  section('watch', 'What to watch for', 'threats', watchPlays.length ? (
    <WatchList list={watchPlays} recs={recs} artefacts={artefacts} linkTo={link} offline={offline}
               filename={`${(analysis.title || 'assessment').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'assessment'}-watch-list.csv`} />
  ) : null, { count: { n: watchPlays.length, noun: 'rows' } });

  /*
   * MOVE 3'S SECOND SECTION, and the first time anything has called
   * `scenarioBeats()`. The tracked view layer has carried that renderer since it
   * was copied, under a nine-line comment arguing for its own existence, and a
   * grep across client, src, server, tests and packages found exactly one
   * occurrence — its own definition. Measured on this run it holds 8 scenarios,
   * 104 beats and 58 downstream effects that reached the reader as one sentence
   * inside a Verdict write-up card.
   *
   * SHAPED HERE RATHER THAN INSIDE THE COMPONENT, so that a run with no
   * scenarios registers no section at all — `section()` keeps any truthy body,
   * and a component returning null behind a registered heading is an empty
   * heading in the contents list.
   */
  const scenarios = useMemo(() => scenarioViews(artefacts), [artefacts]);
  section('scenarios', 'Conditions the policy has to survive', 'threats',
    scenarios.length ? <Scenarios views={scenarios} linkTo={link} /> : null,
    { count: { n: scenarios.length, noun: 'conditions' } });

  /*
   * A BODY THAT RUNS NO PLAY IS NOT ONE OF "THE WORST". The board is sorted
   * worst first, so on a run where only twelve bodies carry a play the rest are
   * 0 plays / 0.00 exposure — bodies with no play at all under a heading reading
   * "worst play first", three of them spelled "Department for Education" one
   * after another.
   *
   * The twelve that run something are the body table on the lead now; what is
   * left here is the count of them, and the funnel that says which bodies reach
   * a play at all.
   */
  const active = board.filter((a) => a.plays.length);
  /*
   * A BODY IS A NAME. EVERY COUNT HERE IS A COUNT OF NAMES.
   *
   * A board row is a CANDIDATE, not a body: entity resolution deliberately keeps
   * candidates apart rather than merging them, so on this run 171 rows stand for
   * 55 distinct names — "Employers" appears 25 times, "Skills England" 23,
   * "Government" 21. Any sentence beginning "of the bodies the paper names" has
   * to count names, and the candidate figure belongs only in the sentence about
   * resolution, where it means something.
   *
   * THIS IS WHERE THE PAGE WAS LYING. `idleUnprofiled` counted ROWS with a null
   * profile and printed "116 were named and never profiled" — a sentence saying
   * the assessment had skipped two thirds of the cast. It had not: measured on
   * this run, 116 rows carry no profile and ZERO NAMES DO. There are 55 profiles
   * for 55 names, one each. The 116 are the duplicate candidates of a name whose
   * profile is attached to one of its other rows.
   *
   * `profiled` therefore asks whether a NAME has a profile anywhere among its
   * rows, and the arithmetic stays general — a run that really does name a body
   * and never profile it will say so.
   */
  const nameOf = (a: typeof board[number]) => a.actor.label.trim().toLowerCase();
  const names = (rows: typeof board) => new Set(rows.map(nameOf)).size;
  const namedAll = names(board);
  const namedActive = names(active);
  section('actors', 'Who is involved', 'actors', board.length ? (
    <>
      {/*
        DISTINCT BODIES, WHICH IS NOT THE SAME COUNT THE GRAPH USES. This counts
        every body the paper names, deduplicated by label; "How they connect"
        counts only the ones the paper places in a stated relationship, and
        reports a smaller number from the same assessment. Both are right and
        neither used to say which it was.
      */}
      <p className="govuk-body">
        {namedActive} of the {namedAll} different bodies the paper names could use at least one way
        to beat the policy — whether or not the paper connects them to anything. Every one of them
        is in the table under &ldquo;Who is coming for what&rdquo;, with what it can reach, the
        worst thing it could do and whether that breaks a rule.
      </p>
      {/*
        THE TABLE THAT WAS HERE IS THE TABLE IN THE LEAD. Move 4 printed the same
        twelve bodies in three consecutive tables — reach, priors, worst exposure
        — and two of the three carried an identical Body column and an identical
        Plays column. The lead's body table now carries every column all three
        had, plus the kind, the legality split and the selection control, so what
        belongs here is the funnel that decides which bodies reach it at all: the
        four figures that used to close this move in the smallest grey type on
        the page.
      */}
      <ActorFunnel board={board} onNetwork={() => goTo('causality', 'network')} />
    </>
  ) : null);

  /*
   * THE CAST, AS A GRID. `traitGrid`, `TRAIT_COLUMNS` and `traitCoverage` have
   * been in `matrix.ts` since the grid rebuild, arguing this move's case in
   * their own header, and nothing in `client/` has ever called them — 330
   * profile sentences in the payload and a move that showed a play count and an
   * exposure. See `CastGrid` for why the caption cannot use `traitCoverage`.
   */
  section('cast', 'What moves each body', 'actors', board.some((a) => a.profile) ? (
    <CastGrid board={board} personas={detail.personas} linkTo={link} />
  ) : null);

  /*
   * TEN MODELS THE REPORT REASONED FROM AND NEVER SHOWED. Two of the four
   * assured recommendations cite one in their refs.
   */
  section('models', 'The games the policy sets up', 'actors', artefacts.some((a) => a.kind === 'model') ? (
    <Models artefacts={artefacts} linkTo={link} />
  ) : null);

  section('resolution', 'Bodies the paper does not pin down', 'actors',
    artefacts.some((a) => a.kind === 'resolution_candidate') ? (
      <Resolution artefacts={artefacts} linkTo={link} />
    ) : null);

  /*
   * WHAT THE PAPER IS MADE OF, before how they connect. Three things the run
   * computed and the report never showed: the 536 claims sorted into 13
   * categories, how much of the 151-piece machinery has anybody stated to run
   * it, and where the 150 causal chains land. Every figure is derived from
   * `refs` and `data.category`, so nothing is un-stubbed and nothing is added
   * to the payload.
   */
  section('composition', 'What the paper is made of', 'provenance',
    artefacts.some((a) => a.kind === 'claim' || a.kind === 'mechanism') ? (
      <Composition artefacts={artefacts} list={list} mechanismIds={mechanismIds} />
    ) : null);

  section('network', 'How they connect', 'causality', net.edges.length ? (
    <>
      {/*
        A MECHANISM SELECTION IS ANSWERED HERE, so `ScopeNote` must not say it is
        not. The note tells a reader what the panel below ignores; with a
        mechanism chosen, `NetworkSection` now renders the dossier for it, and a
        line reading "the selection does not narrow it" directly above an answer
        to the selection is the only false sentence on the section.
      */}
      <ScopeNote selection={selection?.kind === 'mechanism' ? null : selection} subject="the whole assessment" />
      <NetworkSection
        net={net}
        artefacts={artefacts}
        linkTo={link}
        selection={selection}
        onClearSelection={() => setSelection(null)}
      />
    </>
  ) : null, {
    /*
     * THE FIVE HEADINGS INSIDE THIS ONE SECTION. Causality registers two
     * sections and renders eleven headings across 5,491px, so the index it got
     * named two things for five screens. These ids are on the `h3`s in
     * `Network.tsx` already and have been since it was written. `net-selected`
     * is deliberately not here: it exists only while a mechanism is chosen, and
     * an index entry pointing at nothing is worse than no index at all.
     */
    count: { n: net.edges.length, noun: 'relationships' },
    anchors: [
      { id: 'net-depth', title: 'How deep the wiring goes' },
      { id: 'net-shape', title: 'Where the relationships run' },
      { id: 'net-families', title: 'What kind of relationship' },
      { id: 'net-bodies', title: 'Bodies against bodies' },
      { id: 'net-insights', title: 'What the connections show' },
    ],
  });

  section('stress', 'What if we are wrong', 'threats', levers.length ? (
    <>
      <ScopeNote selection={selection} subject="the whole assessment" />
      <StressLab artefacts={artefacts} levers={levers} linkTo={link}
                 failed={failed} onFailedChange={setFailed} />
    </>
  ) : null);

  section('evidence', 'What is backed up by evidence', 'provenance', mix.length ? (
    <EvidenceCoverage artefacts={artefacts} mix={mix} linkTo={link} />
  ) : null);

  /*
   * A RESULT IS A WORD, NOT A DATABASE VALUE. This column printed the stored
   * enum: `high_risk`, `moderate_risk`, `indeterminate`, underscores and all,
   * in a report a policy reader is meant to take away. The tag also carries the
   * severity, which the bare string did not — and `indeterminate` is grey
   * rather than green, because "the test could not decide" is not a pass.
   */
  section('checks', 'Checks on how the policy is set up', 'verdict', structural.length ? (
    <CheckLedger checks={structural} net={net} linkTo={link} />
  ) : null, { count: { n: structural.length, noun: 'checks' } });

  section('writeup', 'All findings', 'verdict', appendix.length ? (
    <WriteUp rest={appendix} linkTo={link} offline={offline} echoed={headline} ranked={inBrief.size} />
  ) : null, { count: { n: appendix.length, noun: 'more' } });

  /*
   * THE STAGE THAT ATTACKS THE ASSESSMENT, ON A PAGE. Seven challenges, seven
   * responses and a review summary were in the payload and referenced nowhere
   * in the client outside the drill route's kind list.
   */
  section('assurance', 'How the findings were challenged', 'provenance',
    artefacts.some((a) => a.kind === 'assurance_challenge' || a.kind === 'assurance_response' || a.kind === 'review_summary') ? (
      <Assurance artefacts={artefacts} />
    ) : null);

  /*
   * A RECOMMENDATION IS AN ITEM, AND THE ITEM IS THE WHOLE RECORD.
   *
   * This split each statement with `summarise()` and opened the remainder in a
   * disclosure. Measured against the real assessment: the four assured
   * statements are 321, 401, 366 and 452 characters, none holds a paragraph
   * break, and `LEAD_FLOOR = 320` means the boundary search runs only over the
   * tail — so `rest` was empty on all four and the disclosure never rendered.
   * The apparatus was inert, and while it was inert `data.change`,
   * `data.tradeoffs` and `data.validationNeeded` — populated on all four, and
   * printed into the .docx by `report-doc.ts:290-296` — were on the page
   * nowhere. The Word file a reader downloaded from here was a better document
   * than the page it came from, in the one section they are meant to act on.
   *
   * `summarise()` is not wrong, it is just not what these needed; it is still
   * the right split elsewhere. The three blocks under the list are the three
   * readings the assessment had already written and never drew: who each
   * recommendation says gains and who carries it, which of the forty-seven
   * plays the four together answer, and what the challenge round removed.
   */
  section('suggests', 'What it recommends', 'verdict', recs.length ? (
    <>
      <ChallengeNote recs={recs} artefacts={artefacts} />
      <Recommendations recs={recs} linkTo={link} />
      <BurdenBars recs={recs} />
      <RecCoverage recs={recs} artefacts={artefacts} list={list} linkTo={link} />
      <DroppedRecs recs={recs} artefacts={artefacts} linkTo={link} />
    </>
  ) : null, { count: { n: recs.length, noun: 'recommendations' } });

  /*
   * FORTY-THREE STRUCTURED ITEMS THAT PRINTED AS ONE PARAGRAPH. The single
   * `evaluation_plan` carries nine indicators, nine decision rules, ten data
   * gaps, fifteen questions and a counterfactual; none of those keys was
   * matched by any grep in `client/`.
   */
  section('howyoudknow', 'How you would know', 'verdict',
    artefacts.some((a) => a.kind === 'evaluation_plan') ? (
      <Options artefacts={artefacts} onGaps={() => goTo('provenance', 'gaps')} />
    ) : null);

  /*
   * WHERE THE MODEL COULD NOT SEE EVERYTHING, ahead of what it could not
   * establish: 10 of the 18 stages made at least one call the model could not be
   * given the whole assessment for, and three carry the run's own instruction to
   * read them as partial. That was five grey rows behind a disclosure.
   */
  const cutShort = useMemo(() => truncations(stages), [stages]);
  section('withheld', 'Where the model could not see everything', 'provenance',
    cutShort.length ? <Withheld stages={stages} /> : null,
    { count: { n: cutShort.length, noun: 'steps' } });

  /*
   * THE SAME LIMIT, SAID ONCE. The dedupe key was the whole warning while the
   * row rendered only its first sentence, so five of the eight visible rows were
   * one sentence and 223 went behind one disclosure. `Limits` keys on the lead
   * and keeps the stage the flatMap threw away — see its own note.
   *
   * THE CONTENTS COUNT IS `groupLimits`, NOT THE OLD DEDUPE. The section used to
   * collapse identical warning TEXT — 89 groups on this run — and the index was
   * written against that figure while it still existed. `Limits` groups on the
   * lead sentence and reports 181, so the index reads the same function the
   * section does rather than a number that was true of the block it replaced.
   */
  const limitGroups = useMemo(() => groupLimits(stages), [stages]);
  section('gaps', 'What it could not establish', 'provenance',
    limitGroups.length ? <Limits stages={stages} artefacts={artefacts} /> : null,
    { count: { n: limitGroups.length, noun: 'different gaps' } });

  /*
   * ONE SECTION, BECAUSE THE DIFFERENCE BETWEEN SIX DOWNLOADS IS TWO FACTS.
   * "Take it away" and "Send it to someone" opened with 48 and 49 words over
   * three links each, and the only way to learn what separated them was to hold
   * two paragraphs in your head. Three formats by two scopes is a table.
   * What is left in prose is the three blocks that are limits on ACTION rather
   * than descriptions of data — sealed, no-link-to-send, and cannot-be-undone.
   */
  section('take', 'Take it away', ACTIONS, offline ? null : (
    <>
      <DownloadGrid analysisId={analysis.id} artefacts={artefacts} />
      {analysis.sealed ? (
        <InsetText>
          This assessment is sealed. A pack made from it is the paper in the clear, in your
          Downloads folder — handle it like the document it came from.
        </InsetText>
      ) : null}
      <Shares />
    </>
  ));

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
      linkTo={link}
      onChanged={onChanged ?? (() => window.location.reload())}
    />
  ));

  /*
   * HOW THIS WAS PRODUCED — the whole section is `RunProfile` now.
   *
   * It was six summary-list rows ending "Stages — 18 of 18 completed", which was
   * the entire visual account of a 10h 23m run in which one stage took 8h 18m.
   * Those six rows are unchanged and still here, under the ladder, inside the
   * component; `known`, `ranOn` and `stopped` moved with them.
   */
  section('provenance', 'How this was produced', 'provenance',
    <RunProfile
      analysis={analysis}
      stages={stages}
      models={detail.models}
      cost={detail.cost}
      offline={offline}
    />);

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
   * HOW BIG EACH VIEW IS, SAID UNDER ITS NAME ON ITS LANDING PAGE.
   * (It was said in the tab that opened it; the service navigation names the
   * views and nothing else, so the figure moved onto the page — phase 21.)
   *
   * Every figure here is one a panel already prints: the findings the write-up
   * renders, the recommendations the assured filter keeps, the rows the
   * mechanism chart draws, the relationships the network resolves, the playbook
   * and its severe band, the bodies "Who is involved" counts BY NAME, the parts
   * under pressure drawn and hidden, and every stage warning. Nothing is counted
   * a second way, and three of the obvious raw counts are wrong for this: 32
   * finding artefacts against the 19 the write-up shows, 151 mechanisms against
   * the 41 that generate a play, 171 board rows against 12 bodies.
   *
   * THE ROW COUNT IS RE-DERIVED FROM `mechanismChart`, the same function
   * `CausalityLead` builds its bars from, given the same inputs — so the tab and
   * the chart cannot disagree unless the shared function changes under both.
   * Plain, not memoised: it walks 47 plays.
   *
   * Plain `const`s, not hooks: the walk is 47 plays.
   */
  const mechanismRows = mechanismChart(
    narrowExcept(list, selection, mechanismIds, 'mechanism'),
    (play) => mechanismsOf(play, mechanismIds),
  ).rows.length;
  const counts = moveCounts({
    findings: sectionFindings.reduce((n, group) => n + group.items.length, 0),
    suggestions: recs.length,
    mechanisms: mechanismRows,
    relationships: net.edges.length,
    plays: list.length,
    severe: bands.find((band) => band.band === 'severe')?.count ?? 0,
    bodies: namedActive,
    targets: interplayMap.targets.length + interplayMap.hidden,
    limits: warnings.length,
  });
  /*
   * THE "IN THIS SECTION" CARDS COUNT WHAT THE VIEW COUNTS. The parts and bodies
   * leads narrow under a selection, and so does the figure beside the view, so
   * their cards take the same narrowed figures — set here because `namedActive`
   * and `mechanismRows` are settled only now. The Summary alone reads the whole
   * assessment, and says so under a selection.
   */
  for (const entry of sections) {
    if (entry.id === 'mechanisms' && mechanismRows) entry.count = { n: mechanismRows, noun: mechanismRows === 1 ? 'part' : 'parts' };
    if (entry.id === 'interplay' && namedActive) entry.count = { n: namedActive, noun: namedActive === 1 ? 'body' : 'bodies' };
  }

  /*
   * THE SUMMARY (phase 20), registered LAST because it reads the figures every
   * other move has already settled — `counts` above, the brief, the body count
   * by name — and first in reading order because `MOVE_ORDER` puts `overview`
   * first. The pack gets it too, at the head of its cascade, with every way out
   * of it an anchor rather than a page.
   */
  lead('overview', 'The report at a glance', 'overview', (
    <Overview
      view={overview}
      brief={brief}
      stages={stages}
      selection={selection}
      byId={byId}
      linkTo={link}
      onGo={route ? (next, anchor) => follow(placeOf(next, anchor)) : undefined}
      onSelectBand={(band) => {
        setSelection({ kind: 'band', id: band });
        if (route) goTo('threats', 'weights', { kind: 'band', id: band });
      }}
    />
  ));

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
  /**
   * The order a move is READ in, stated rather than implied.
   *
   * Reading order used to be the order the `section(...)` calls happen to appear
   * in this file, which is grouped by what was convenient to compute when. On
   * Verdict that put "What it suggests" — the only section a reader can act on —
   * 5,400px down, behind 2,250px of write-up, and left the panel's opening
   * figure 1,372px below its own heading.
   *
   * Moving the calls would have moved two hundred lines of JSX to express six
   * words. This says the six words. An id not named here keeps its push
   * position, after everything that is named, so adding a section never
   * silently reorders the page.
   */
  /*
   * SEVEN ENTRIES BECAME TWELVE TONIGHT, so the argument for each new one:
   *
   * `factors` and `legality` go straight after `spread`, because the three are
   * one reading — how the exposure is spread, what makes the plays work, and the
   * rule none of them breaks. Each answers the question the one before it
   * raises, and `legality` is the sharpest claim the assessment makes.
   *
   * `suggests` keeps the position it was moved into: it is the only section a
   * reader can act on, and it was 5,400px down the panel every reader lands on.
   * `howyoudknow` follows it, because the evaluation plan is how you would tell
   * whether the advice above it worked — act, then measure.
   *
   * `rests` is the caveat on all of that, and it belongs after the advice rather
   * than before it: what the conclusion rests on is a reason to re-read the
   * advice, not a reason to skip it.
   *
   * `writeup` then `assurance`: the conclusions in full, then the round that
   * attacked them. Reversing them would print the challenge to an argument the
   * reader has not met.
   *
   * `checks` and `evidence` are the supporting apparatus and stay where they
   * were, and `found` stays last — it is the figures, and a reader who has read
   * this far has met every one of them in context.
   */
  /*
   * PHASE 19 REWROTE ALL FIVE, to one rule: conclusions before figures, and
   * figures about the paper before figures about the run.
   *
   * VERDICT: the main findings, the worst three ways to beat it, the rule none
   * of them breaks, what to do, how you would know, what rests on what — then
   * the appendix of every other finding and the checks behind them. Exposure,
   * its spread and its factors went to Threats; evidence, the challenge round
   * and the machine's own figures went to Where this comes from.
   *
   * THREATS opens with the exposure bar (the band picker), then the ranked
   * list, the watch list, and the scores table behind a details.
   *
   * WHERE THIS COMES FROM opens with what the run made, then what it threw
   * away, then how it ran.
   */

  /*
   * THE PAGE THIS ROUTE IS (phase 21), settled before the pack's `return`
   * because the two effects below must run on every render of either.
   *
   * `pages` is the view in the order its pages run: the lead, which is the
   * landing page, then every other section in reading order. `here` is the
   * section on screen, or nothing on the landing page — and a section id this
   * run does not have, or the lead's own id, is the landing page too, rather
   * than an empty page under a heading.
   */
  const landing = move === ACTIONS ? undefined : leadOf(move);
  const pages = landing ? [landing, ...inMove(move).filter((entry) => entry !== landing)] : [];
  const here = route?.section ? pages.slice(1).find((entry) => entry.id === route.section) : undefined;
  const pageTitle = move === 'overview' ? null
    : move === ACTIONS ? MOVE_LABEL[ACTIONS]
    : here ? `${here.title} — ${MOVE_LABEL[move]}`
    : MOVE_LABEL[move];
  useEffect(() => { onTitle?.(pageTitle); }, [onTitle, pageTitle]);

  /*
   * A HASH ON A PAGE IS A PLACE ON IT — and, on a landing page, possibly a
   * whole other page.
   *
   * `?move=verdict#suggests` was how the summary pointed at the
   * recommendations, and it is in browsers' histories; the route turns the
   * `move` into `/findings` and keeps the hash, and this turns a hash naming a
   * section of the view into that section's page. Any other hash is scrolled
   * to after the page has drawn — the router does not, and a `<details>` it
   * names is opened, because "Add something to it" is a link target that would
   * otherwise land on a shut disclosure.
   */
  const anchor = route?.anchor || '';
  const anchorIsPage = Boolean(route && !route.section && anchor && pages.slice(1).some((entry) => entry.id === anchor));
  useEffect(() => {
    if (!route || !anchor) return;
    if (anchorIsPage) {
      route.navigate(hrefOf(move, anchor), { replace: true });
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const target = document.getElementById(anchor);
        if (target instanceof HTMLDetailsElement) target.open = true;
        target?.scrollIntoView({ block: 'start' });
      });
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    // The page and the hash decide; `route` and `hrefOf` are new every render.
  }, [move, route?.section, anchor, anchorIsPage]);

  const ordered = offline
    ? MOVE_ORDER.flatMap((move) => inMove(move))
    : sections;

  if (offline) {
    return (
      /*
        `prt-pack` IS THE PACK'S HALF OF THE REPORT'S STYLING.
        Every density and full-width rule the service gained was scoped to
        `.govuk-tabs__panel` (`.prt-view` since phase 21), which a pack has none of — so the pack kept the
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
          <Glossary />
        </div>
        {/* THE RAIL IS A SECTION OF THREATS NOW, in the pack as in the
            service: the pack reads in move order, so it arrives at the head of
            Move 3 rather than above the first finding. */}
        {/* THE PACK COULD NARROW ITSELF AND NOT SAY SO. Measured on a real pack
            driven from `file://`: 88,333px of document, 26 selection controls, 0
            banners and 0 controls reading "Clear the selection" — press a band
            and the mechanism list drops from 22 rows to 12 with nothing on the
            page saying why and no way back but pressing the same 44px segment
            again. It is markup and a Button: no router, no fetch, no server.

            AFTER THE RAIL, NOT BEFORE IT: the rail is the band picker, and a
            banner directly beneath it is where a press is answered. */}
        <SelectionBanner selection={selection} onClear={() => setSelection(null)} />
        <Contents sections={ordered} />
        {ordered.map((entry, at) => (
          <Fragment key={entry.id}>
            {/* REPEATED AT EACH MOVE, BUT ONLY WHILE SOMETHING IS SELECTED. A
                pack is one document of about 98 screens, so one banner at the
                top is one a reader has scrolled past for good; a copy at each
                move boundary is never more than a move away. "Showing
                everything" repeated five times is furniture, so the repeats are
                the live state only — an unfiltered pack reads exactly as it
                does today. */}
            {selection && at > 0 && ordered[at - 1].move !== entry.move ? (
              <SelectionBanner selection={selection} onClear={() => setSelection(null)} />
            ) : null}
            {entry.bare ? (
              /* It draws its own section and its own heading; a wrapper here
                 would print both titles. The way back to the contents still
                 follows it, because a pack is one very long page and that link
                 is how a reader gets out of the middle of it.

                 FRAGMENTS, NOT DIVS, all the way down — every density rule is
                 written as a pair, `.prt-view > section` and
                 `.prt-pack > section`, and a wrapping div breaks the child
                 combinator on the pack's half. A Fragment emits no element, so
                 each `<section>` below is still a direct child of `.prt-pack`. */
              <>
                {entry.body}
                <p className="govuk-body-s govuk-!-margin-top-2">
                  <a className="govuk-link" href="#contents">Back to contents</a>
                </p>
              </>
            ) : (
              <section aria-labelledby={entry.id}>
                <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
                {entry.body}
                <p className="govuk-body-s govuk-!-margin-top-2">
                  <a className="govuk-link" href="#contents">Back to contents</a>
                </p>
              </section>
            )}
          </Fragment>
        ))}
      </div>
    );
  }

  /*
   * ── THE SERVICE: ONE PAGE AT A TIME (phase 21) ──────────────────────────
   *
   * The section list above is the same list the pack renders; what changed is
   * how much of it one URL draws. A view used to be a tab panel holding every
   * section of it — Threats measured 10,137px, "Where this comes from" 33,493px
   * on the real run — and a tab that long is a document, not a panel. Now:
   *
   *   the Summary         the summary and nothing else
   *   a landing page      the view's lead, then a card per section
   *   a section page      that section, its siblings in a side menu, and
   *                       previous/next through the view and on to the next
   *   /use                the downloads, adding to it, writing it again
   *
   * Every body is still built on every render — they are JSX elements, which
   * cost nothing until mounted — and only the page's own are mounted, which is
   * the whole of the saving and why no section body changed to get it.
   */
  const renderEntry = (entry: Section) => (entry.bare ? (
    <Fragment key={entry.id}>{entry.body}</Fragment>
  ) : (
    <section key={entry.id} aria-labelledby={entry.id}>
      <h2 className="govuk-heading-l" id={entry.id}>{entry.title}</h2>
      {entry.body}
    </section>
  ));

  /*
   * THE SELECTION IS STATED ABOVE THE PAGE, ONLY WHILE THERE IS ONE.
   *
   * "Showing everything. Select a band…" sat above every view as an
   * instruction; on a page with a service navigation over it, it was one more
   * band of furniture between the reader and the first word. A live selection
   * still gets the full banner on every page it narrows.
   *
   * CLEARING MOVES FOCUS TO THE PAGE, because the button that took it goes with
   * the banner — and a keyboard user whose focus was on a removed element is
   * dropped back at the top of the document with nothing announced.
   */
  const banner = selection ? (
    <SelectionBanner
      selection={selection}
      onClear={() => {
        setSelection(null);
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }}
    />
  ) : null;

  /*
   * THE HEADLINE AND THE STANDING CAVEAT, on the two pages that are about the
   * conclusion: the Summary, and the landing page of Findings, which the brief
   * leads and "Print the brief" prints with this headline above it. On every
   * other page they are the same three lines again between the navigation and
   * the thing the reader asked for. The addendum notice is NOT optional
   * anywhere: a report overtaken in part says so on every page of it.
   */
  const leadBlock = (
    <div className="prt-lead">
      <AddendumNotice artefacts={artefacts} passes={detail.passes} />
      {headline ? <p className="prt-lead__headline">{headline}</p> : null}
      <p className="prt-lead__caveat">
        A red-team read, not an assurance review. Every profile is a hypothesis about a
        body&rsquo;s incentives — never a finding about a named person.
      </p>
      <Glossary />
    </div>
  );
  const notice = <AddendumNotice artefacts={artefacts} passes={detail.passes} />;

  /** Pagination's anchors, routed like every other link on the page. */
  const pageAnchor = ({ href, className, rel, children }: { href: string; className: string; rel: string; children: ReactNode }) => (
    <a className={className} rel={rel} {...follow(href)}>{children}</a>
  );

  if (move === 'overview') {
    const summary = leadOf('overview');
    return (
      <>
        {leadBlock}
        {banner}
        <div className="prt-view">{summary ? renderEntry(summary) : null}</div>
      </>
    );
  }

  if (move === ACTIONS) {
    return (
      <>
        {notice}
        {/*
          THE THINGS YOU DO WITH A REPORT, ON A PAGE OF THEIR OWN. They were a
          block of forms under every view; they are what the bar at the foot
          of every page links to now, by anchor — `#take`, `#add`, `#again`.
        */}
        <div className="prt-view prt-use">
          <h2 className="govuk-heading-l">What you can do with this</h2>
          {inMove(ACTIONS).map((entry) => (
            <section key={entry.id} aria-labelledby={entry.id}>
              <h3 className="govuk-heading-m" id={entry.id}>{entry.title}</h3>
              {entry.body}
            </section>
          ))}
        </div>
      </>
    );
  }

  /*
   * PREVIOUS AND NEXT RUN THROUGH THE VIEW AND ON INTO THE NEXT ONE. A reader
   * who has read every page of Threats is at the start of Who is involved, not
   * at a dead end; the first page of a view steps back to the one before it.
   */
  const views = MOVES.map((entry) => entry.id);
  const at_ = here ? pages.indexOf(here) : 0;
  const before = views[views.indexOf(move) - 1];
  const after = views[views.indexOf(move) + 1];
  const previous = at_ > 0
    ? { href: hrefOf(move, at_ > 1 ? pages[at_ - 1].id : undefined), title: 'Previous', label: pages[at_ - 1].title }
    : before ? { href: hrefOf(before), title: 'Previous', label: MOVE_LABEL[before] } : null;
  const next = at_ < pages.length - 1
    ? { href: hrefOf(move, pages[at_ + 1].id), title: 'Next', label: pages[at_ + 1].title }
    : after ? { href: hrefOf(after), title: 'Next', label: MOVE_LABEL[after] } : null;
  const pagination = (
    <Pagination previous={previous} next={next} render={pageAnchor} label={`Previous and next in ${MOVE_LABEL[move]}`} />
  );

  /*
   * THE SIDE MENU IS ON EVERY PAGE OF A VIEW, THE FIRST ONE INCLUDED. It was
   * drawn only once a reader had left the landing page, so on the page every
   * reader arrives at nothing said there was more to a view than its lead —
   * John, after phase 21 went live: "it's not obvious there's more information
   * beyond the summary without it."
   *
   * COMPOSED, NOT A COMPONENT. GOV.UK Frontend ships no side navigation — the
   * pattern lives in the GOV.UK publishing frontends, not the framework — so
   * this is a `<nav>` and a `govuk-list` of `govuk-link`s, with the current page
   * marked by `aria-current="page"`.
   */
  const sideNav = (
    <nav className="prt-sidenav" aria-labelledby="prt-sidenav-title">
      <h2 className="govuk-heading-s prt-sidenav__title" id="prt-sidenav-title">{MOVE_LABEL[move]}</h2>
      <ul className="govuk-list prt-sidenav__list">
        {pages.map((entry, index) => {
          const current = here ? entry === here : index === 0;
          return (
            <li key={entry.id} className={`prt-sidenav__item${current ? ' prt-sidenav__item--current' : ''}`}>
              <a
                className="govuk-link prt-sidenav__link"
                aria-current={current ? 'page' : undefined}
                {...follow(hrefOf(move, index === 0 ? undefined : entry.id))}
              >
                {entry.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  if (!here) {
    /*
     * A VIEW'S LANDING PAGE: what it leads with, and a card for each of its
     * other pages. The view's size — "47 ways to beat it · 20 severe" — is the
     * caption over the lead, which is where a reader deciding whether to read
     * on is looking; the service navigation names the views and nothing more.
     */
    return (
      <>
        {move === 'verdict' ? leadBlock : notice}
        {banner}
        <div className="prt-sectionpage">
        {sideNav}
        <div className="prt-view prt-sectionpage__main">
          <p className="govuk-caption-m prt-viewhead">
            {MOVE_LABEL[move]}
            {counts[move] ? <> <span className="prt-viewhead__count">· {counts[move]}</span></> : null}
          </p>
          {landing ? renderEntry(landing) : null}
          <Contents
            cards
            sections={pages.slice(1).map((entry) => ({ ...entry, note: SECTION_NOTES[entry.id] }))}
            id={`contents-${move}`}
            of={MOVE_LABEL[move]}
            place={(id, inner) => follow(hrefOf(move, id, inner))}
          />
          {pagination}
        </div>
        </div>
      </>
    );
  }

  /*
   * A SECTION'S OWN PAGE: the section, the view's other pages beside it, and
   * previous/next under it.
   *
   * THE SIDE MENU IS COMPOSED, NOT A COMPONENT. GOV.UK Frontend ships no side
   * navigation — the pattern lives in the GOV.UK publishing frontends, not the
   * framework — so this is a `<nav>` and a `govuk-list` of `govuk-link`s, with
   * the current page marked by `aria-current="page"` and drawn the way the
   * service navigation draws its own current item: a rule in the link colour
   * and no underline.
   */
  return (
    <>
      {notice}
      {banner}
      <div className="prt-sectionpage">
        {sideNav}
        <div className="prt-view prt-sectionpage__main">
          {renderEntry(here)}
          {pagination}
        </div>
      </div>
    </>
  );
}
