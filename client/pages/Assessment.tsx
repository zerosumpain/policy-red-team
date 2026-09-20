import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { api, watchRun, type Detail, type DetailView, type RunProgress, type StageRow } from '../api';
import { RunClock } from './RunClock';
import { RunFindings } from './RunFindings';
import { Button, ButtonGroup, NotificationBanner, Tag, TaskList, WarningText, type Task, type TagColour } from '../govuk';
import { isFinished, isTerminal, spent, statusColour, statusLabel } from '../status';
import { Report } from '../report/Report';
import { Metrics, type Metric } from '../report/Metrics';
import { ProvenanceLead } from '../report/moves/ProvenanceLead';
import { usePageTitle } from '../layout/Template';
import { bandCounts, interplay, plays } from '$lib/policy-analysis/view';
import { stageFacts } from '$lib/policy-analysis/stage-facts';

/**
 * One assessment: its progress while it runs, its report when it is done.
 *
 * ONE URL for both, because they are one thing to the reader — "the paper I am
 * having assessed" — and a run that finishes while you are looking at it should
 * become the report without you going anywhere. The progress view is not a
 * loading screen for the report; it is the honest state of a process that takes
 * minutes, which is why it names every stage rather than showing a spinner.
 */
export function Assessment() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  usePageTitle(detail?.analysis.title);

  /*
   * `view=report` — the narrow answer, which is what this page renders.
   *
   * It draws the stage list, the findings-so-far index and, once the run is
   * over, the report. None of those reads a causal chain, a research question,
   * a persona link, an assurance challenge or an option appraisal, and on the
   * real run those five kinds are about 1.4 MB of a 4.5 MB response. See
   * `forTheReport` in `server/api.ts` for what a stub keeps and why it is a stub.
   *
   * `fresh` DROPS WHAT IS HELD FIRST. The stream below fires on every stage
   * boundary and the whole point of re-reading then is that the run has moved;
   * serving that from a cache would freeze the page at the first stage.
   */
  const load = useCallback(async (view: DetailView = 'report') => {
    try {
      // A re-read is a re-read: the run has moved, which is the whole reason the
      // stream fired. Serving it from what is held would freeze the page.
      api.forget(id);
      setDetail(await api.detail(id, view));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => { void load('report'); }, [load]);

  /*
   * KEYED ON WHETHER IT IS RUNNING, NOT ON THE WHOLE `detail`.
   *
   * `load()` assigns a freshly parsed object, so the reference changed on every
   * stage event and both effects below tore themselves down and rebuilt: one
   * EventSource per stage rather than one per visit — nineteen connections held
   * open through Cloudflare over an hours-long run — and a progress interval that
   * was cleared, fired an extra immediate poll, and restarted eighteen times.
   *
   * `running` is a boolean, so it changes exactly once: when the run ends.
   */
  const running = detail ? !isTerminal(detail.analysis.status) : false;

  // Follow the run while it is going. The stream closes itself on `done`; this
  // only has to stop listening when the reader leaves.
  useEffect(() => {
    if (!running) return;
    /*
     * A STAGE BOUNDARY ASKS THE SMALL QUESTION. Eighteen of these fire over a
     * run and the page is drawing a stage list and an index of links; `done`
     * asks the big one, because that is the moment the report appears.
     */
    return watchRun(id, { stage: () => void load('progress'), done: () => void load('report'), error: setError });
  }, [id, running, load]);

  /*
   * HOW MUCH LONGER, asked on a timer because nothing else will say.
   *
   * The stream above fires when a STAGE ends, and a stage can run for forty
   * minutes — so for most of a run the page had nothing new to show and no way
   * to answer the only question a reader watching it actually has. This polls a
   * small endpoint for the arithmetic; it is not the detail, which is thousands
   * of artefacts.
   *
   * THIRTY SECONDS, not one. The estimate moves when a call finishes, and calls
   * take minutes — a faster poll would redraw the same sentence and spend the
   * reader's battery to do it.
   */
  useEffect(() => {
    if (!running) return;
    let live = true;
    const ask = async () => {
      try {
        const next = await api.progress(id);
        if (live) setProgress(next);
      } catch {
        // A poll that fails is not worth an error banner over a run that is
        // fine: the next one is thirty seconds away.
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), 30_000);
    return () => { live = false; clearInterval(timer); };
  }, [id, running]);

  /*
   * THE SIZE AND SHAPE OF WHAT YOU ARE ABOUT TO READ.
   *
   * The header said "18 of 18 stages · codex/gpt-5.6-luna" and nothing else.
   * Measured off the live page at 1280px: the h1 sits at y≈268 and the first
   * figure on the page — the stacked exposure bar — at y≈1393, so a reader met
   * about 1,125px of chrome and prose before one number about the assessment
   * itself. Every figure below was already in the payload: 2,296 artefacts, 47
   * plays over four bands, 12 bodies, 99 parts of the policy under pressure, 72
   * passages and 10h 23m of running.
   *
   * NO CELL IS A LINK. The obvious next step is to make each label jump to the
   * move that expands it, and the tab strip is 200px below — a reader can make
   * that jump by eye, and `Metrics` has no link slot, so buying it means a new
   * prop on a component used in seven places.
   *
   * MEMOISED because `plays()`, `interplay()` and `bandCounts()` walk the whole
   * inventory and this component re-renders on every stage event of a live run.
   */
  const overview = useMemo<Metric[]>(() => {
    if (!detail) return [];
    const list = plays(detail.artefacts);
    const bands = bandCounts(list);
    const worst = bands[0];
    const pressure = interplay(detail.artefacts, list);
    const bodies = new Set(list.map((p) => p.actor?.id).filter(Boolean)).size;
    const passages = detail.artefacts.filter((a) => a.kind === 'passage').length;
    return [
      { label: 'Artefacts held', value: detail.artefacts.length.toLocaleString() },
      {
        label: 'Ways to beat it',
        value: list.length.toLocaleString(),
        // The tone agrees with the note and never carries it alone — the note
        // says the word "severe" whatever the border does.
        note: worst?.count ? `${worst.count} severe` : undefined,
        tone: worst?.count ? 'severe' : undefined,
      },
      { label: 'Bodies positioned to run one', value: String(bodies) },
      {
        label: 'Parts under pressure',
        // `interplay` draws the worst twelve and reports the rest as `hidden`;
        // the header wants the whole count, which is the sum of the two. The
        // Actors move states the same 99 in words ("the worst 12 of 99").
        value: String(pressure.targets.length + pressure.hidden),
      },
      { label: 'Passages of the paper', value: String(passages) },
      { label: 'Ran for', value: spent(detail.analysis.createdAt, detail.analysis.updatedAt) },
    ];
  }, [detail]);

  async function act(action: 'cancel' | 'resume' | 'restate') {
    setBusy(true);
    try {
      await api.act(id, action);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="govuk-body govuk-error-message">{error}</p>;
  if (!detail) return <p className="govuk-body">Loading…</p>;

  const { analysis, stages } = detail;
  const done = stages.filter((s) => s.status === 'completed').length;
  /** The stage that actually stopped — read, not assumed to be the last one. */
  const failed = stages.find((s) => s.status === 'failed');
  /** A run that stopped short still has a report; a run still going does not. */
  const showReport = isFinished(analysis.status) || analysis.status === 'failed' || analysis.status === 'cancelled';

  /*
   * THE TAG COUNTS THE GAPS, AND THE HINT SAYS IT IS A SAMPLE.
   *
   * A stage row showed one warning and no sign that there were others. On the
   * real run stage 2 holds 60, stage 5 holds 53 and stage 11 holds 33 — 256 in
   * total, 77 KiB of text — and a reader watching the run had no route to any of
   * it, because the view that rolls them all up lives inside the report and the
   * report is not rendered until the run is over.
   */
  const tasks: Task[] = stages.map((stage) => ({
    title: stage.name,
    hint: stage.error ?? (stage.warnings.length
      ? `${stage.warnings[0]}${stage.warnings.length > 1 ? ` And ${stage.warnings.length - 1} more like it.` : ''}`
      : undefined),
    status: stage.status === 'completed' && stage.warnings.length
      ? { tag: { text: `${stage.warnings.length} ${stage.warnings.length === 1 ? 'gap' : 'gaps'}`, colour: 'yellow' } }
      : stage.status === 'completed' ? { tag: { text: 'Completed', colour: 'green' } }
      : stage.status === 'running' ? { tag: { text: 'Running', colour: 'blue' } }
      : stage.status === 'failed' ? { tag: { text: 'Failed', colour: 'red' } }
      : { text: 'Not started yet' },
  }));

  return (
    <>
      {/*
        ONE HEADER, FULL WIDTH, STATUS STATED ONCE.
        It was a two-thirds column holding a caption, a title, a tag and a stage
        count, followed by a separate full-width warning box repeating the
        failure — so a reader opening a report met the run's own troubles twice
        before meeting a single finding. The status belongs beside the title,
        where it qualifies it; the failure's DETAIL belongs in Provenance, which
        is the move that exists for what the run did to itself.
      */}
      <header className="prt-pagehead">
        <span className="govuk-caption-l">Assessment</span>
        <h1 className="govuk-heading-xl">{analysis.title}</h1>
        <p className="prt-pagehead__status">
          <Tag colour={statusColour(analysis.status) as TagColour}>{statusLabel(analysis.status)}</Tag>
          <span className="prt-meta">{done} of {stages.length} stages</span>
          {analysis.model ? <span className="prt-meta">{analysis.model}</span> : null}
        </p>
      </header>

      {/*
        THE FIGURES, DIRECTLY UNDER THE STATUS LINE AND ONLY ONCE THERE IS A
        REPORT TO DESCRIBE.

        A run still going has `RunClock` immediately below, which answers the
        one question a reader watching has — how much longer — and a six-cell
        strip of counts that are still being written would compete with it and
        be wrong within the minute. When the run is terminal the clock is gone
        and these are the figures the page has always had and never shown.

        `.prt-metrics` is a TOP-LEVEL rule, unlike the density rules scoped to
        `.govuk-tabs__panel`, so it is correct here outside a tab panel; six
        cells is a shipped configuration and falls to 3×2 at 960px and 2×3 on a
        phone without anything being said here.
      */}
      {showReport ? <Metrics metrics={overview} /> : null}

      {/*
        A FAILED RUN SAYS WHY IT FAILED.
        `analysis.error` — "1 independent challenge has no response in the revised
        assessment." — was in the payload and rendered nowhere: the page used it
        as a CONDITION and then printed a fixed sentence, "Stopped at the last
        stage", which is a guess that happens to be right for a run that dies at
        eighteen of eighteen and wrong for one that dies at three. So the reason
        is printed as written and the stage is read off the rows.

        The link works now too. It used to point at `#report-tab-provenance`,
        which is the tab BUTTON — but which panel is open is React state, and
        nothing in the client listened to the hash, so above the tablet
        breakpoint the click scrolled to the strip, focused a button and left
        Verdict open. `Report` reads the hash now; see the note there.
      */}
      {analysis.status === 'failed' ? (
        <NotificationBanner title="Stopped before the end">
          <p className="govuk-body">{analysis.error ?? 'It recorded no reason.'}</p>
          <p className="govuk-body">
            {failed
              ? `It stopped in ${failed.name.toLowerCase()} — stage ${failed.ordinal + 1} of ${stages.length}. `
              : ''}
            {done} {done === 1 ? 'stage' : 'stages'} finished and{' '}
            {detail.artefacts.length.toLocaleString()} artefacts were kept.{' '}
            <a className="govuk-link" href="#report-tab-provenance">
              What it kept and what it lost
            </a>
          </p>
        </NotificationBanner>
      ) : null}

      {analysis.status === 'completed_with_gaps' ? (
        <NotificationBanner title="Finished, with gaps">
          <GapsBanner stages={stages} />
        </NotificationBanner>
      ) : null}

      {running ? (
        <>
          <p className="govuk-body">
            This runs to the end on its own. You can close the page — it does not stop.
          </p>
          <RunClock progress={progress} />
          <TaskList items={tasks} idPrefix="stages" />
          {/*
            THE INTELLIGENCE IS READABLE BEFORE THE REPORT IS.
            The drill route never required a finished run, but nothing linked to
            it until the end — so a reader waiting four hours could not open work
            that had been stored for three of them.
          */}
          <RunFindings detail={detail} id={id} />
          {/*
            WHAT IT IS THROWING AWAY, WHILE IT IS THROWING IT AWAY.
            `ProvenanceLead` is the view whose stated premise is that an
            undercount is the serious direction — and it lived only inside the
            report, which is not rendered until the run is terminal. So for the
            whole of a several-hour run the one place the discards are counted
            honestly was unreachable. It takes `stages` and nothing else, and
            renders nothing at all until there is something parseable in them.
          */}
          <ProvenanceLead stages={stages} />
          {/* A control that would only 403 is not drawn. The landing page has
              made this argument since phase 4; the flag needed to make it here
              only arrived with the share panel. */}
          {detail.readOnly ? null : (
            <>
              {/*
                STOPPING IS NOT LOSING, AND THE BUTTON HAS TO SAY SO.
                `control(…, 'cancel')` marks the CURRENT STAGE cancelled and
                leaves every completed stage completed; `resume` re-queues from
                the first unfinished one. So the cost of stopping is the stage in
                flight, not the run.
                Nothing on this page said that, so "Cancel this run" read as
                destructive and the resume control only appeared AFTER you had
                taken the risk — which is the wrong way round. A reader deciding
                whether to stop a four-hour job needs to know what it costs
                BEFORE they decide, not afterwards.
              */}
              <p className="govuk-body">
                Stopping keeps everything finished so far. You can resume from the stage it was on —
                only that stage is repeated, and repeating it produces the same artefacts.
              </p>
              <ButtonGroup>
                <Button variant="warning" disabled={busy} onClick={() => void act('cancel')}>
                  Stop this run
                </Button>
              </ButtonGroup>
            </>
          )}
        </>
      ) : (
        <>
          {/*
            A RUN THAT STOPPED SHORT STILL HAS A REPORT, and refusing to draw it
            is the more misleading choice.

            The Post-16 run failed at stage 18 of 18 holding 2,265 artefacts —
            every actor, every mechanism, the whole exploitation playbook and the
            independent challenge. Only the final revision is missing. Refusing to
            render meant a reader had no path to seventeen stages of finished
            work, and the failure notice above says plainly what is absent.

            What is NOT done: nothing is silently completed. The status tag reads
            failed, the error is printed, and the assurance response the last
            stage never produced is simply not there — an absent section rather
            than an invented one.
          */}
          {showReport ? (
            <Report
              detail={detail}
              onChanged={() => void load()}
              /*
                THE READING POSITION TRAVELS WITH THE LINK, AND IT COMES FROM
                `Report` RATHER THAN FROM THE URL.

                `Report` keeps `?move=…&sel=…` up to date with
                `history.replaceState` in an effect — and an effect runs AFTER
                the render in which this closure was built, so reading
                `window.location.search` here returns the position as it was
                before the reader's last selection. Select a mechanism, click a
                play, and the href would carry the previous state: worse than
                dropping it, because it sends the reader back to the wrong
                place in silence.

                So `at` is handed in as the third argument, from the state
                `Report` is holding at the moment it renders the link. It is an
                opaque query string, never a route — nothing in the report tree
                learns what a URL looks like.

                THE THIRD PARAMETER IS OPTIONAL, which is what lets this compile
                against an `ArtefactLink` that has not been widened yet: a
                function with extra optional parameters is assignable to one
                without them, and the link simply carries no position until
                `Report` starts passing one.
              */
              linkTo={(artefact: Artefact, label?: string, at?: string) => (
                <Link
                  className="govuk-link"
                  to={`/assessments/${id}/artefacts/${encodeURIComponent(artefact.id)}${at ? `?from=${encodeURIComponent(at)}` : ''}`}
                >
                  {label ?? artefact.label}
                </Link>
              )}
            />
          ) : null}
          {/*
            THE STAGE LIST BELONGS TO A RUN THAT IS NOT A REPORT.
            Rendering a report for a failed run put both on the page: eighteen
            stages of prose repeated under every one of the five moves, longer
            than the report itself. Where a report is drawn, the stages live in
            Provenance, which is what that move is for.
          */}
          {showReport ? null : <TaskList items={tasks} idPrefix="stages" />}
          <ButtonGroup>
            {(analysis.status === 'failed' || analysis.status === 'cancelled') && !detail.readOnly ? (
              <Button disabled={busy} onClick={() => void act('resume')}>
                {analysis.status === 'cancelled' ? 'Resume from where it stopped' : 'Resume the incomplete stages'}
              </Button>
            ) : null}
            <Link className="govuk-link" to="/">Back to all assessments</Link>
          </ButtonGroup>
        </>
      )}
    </>
  );
}

/**
 * WHAT THE WARNINGS ACTUALLY WERE, not what somebody assumed they would be.
 *
 * This banner read "Some stages recorded warnings — most often that a source
 * could not be retrieved" on every `completed_with_gaps` run ever produced. It
 * was a string literal, and on the live run it is wrong by an order of
 * magnitude: `stageFacts()` over the 270 warnings returns not_covered 227,
 * open 164, discarded 162, reference_dropped 144, unavailable 22, no_text 4 —
 * so "a source could not be retrieved" is 22 items, 8% of the total and fifth
 * of six groups, and the sentence pointed every reader away from the two
 * things that did happen.
 *
 * It also had no figure and nowhere to go, while the `failed` banner sixteen
 * lines above prints the error verbatim, names the stage, counts the artefacts
 * and links into Provenance. This gives it the same shape as its sibling.
 *
 * THE FALLBACK REMOVES THE CHARACTERISATION RATHER THAN GUESSING IT. A shared
 * copy or a pack with no stage rows classifies nothing, and the honest
 * sentence there is the short one.
 */
function GapsBanner({ stages }: { stages: StageRow[] }) {
  const facts = stageFacts(stages.flatMap((stage) => stage.warnings ?? []));
  /*
   * Largest two by the warnings' OWN figures — "49 groups were discarded" is
   * forty-nine items in one sentence, which is what `count` sums and what a
   * reader means by "how much".
   *
   * `open` IS EXCLUDED FROM THE PAIR, and it would otherwise win second place
   * on this run at 164 against discarded's 162. It is the classifier's
   * residual: `stage-facts.ts` says so in writing — most of it is the model's
   * own caveats carried on individual artefacts, each unique prose about one
   * artefact in one document. "Most often, an open question" characterises
   * nothing, which is the failure this banner is being fixed for. The count
   * still appears, in the sentence below, where it is a figure rather than a
   * description.
   */
  const ranked = facts.filter((fact) => fact.kind !== 'open').sort((a, b) => b.count - a.count);
  const open = facts.find((fact) => fact.kind === 'open');
  const discarded = facts.find((fact) => fact.kind === 'discarded');
  const done = stages.filter((stage) => stage.status === 'completed').length;

  const describe = (kind: string, count: number) => {
    const n = count.toLocaleString();
    switch (kind) {
      case 'not_covered': return `something was not covered (${n} items)`;
      case 'discarded': return `model output was discarded (${n})`;
      case 'reference_dropped': return `a reference was dropped and the item kept (${n})`;
      case 'unavailable': return `something was not available (${n})`;
      case 'no_text': return `a page carried no policy text (${n})`;
      case 'cut_short': return `something was cut short by a limit (${n})`;
      case 'sealed': return `a step was skipped because the run is sealed (${n})`;
      default: return `the run recorded an open question (${n})`;
    }
  };

  const top = ranked.slice(0, 2).map((fact) => describe(fact.kind, fact.count));

  return (
    <>
      <p className="govuk-body">
        {top.length
          ? <>Some stages recorded warnings — most often that {top.join(' or that ')}.</>
          : 'Some stages recorded warnings.'}
      </p>
      <p className="govuk-body">
        {/* "All 18 stages finished" is read off the rows, not asserted: a run
            can reach `completed_with_gaps` with a cancelled stage behind it. */}
        {done === stages.length
          ? `All ${stages.length} stages finished.`
          : `${done} of ${stages.length} stages finished.`}
        {open ? ` ${open.count.toLocaleString()} open ${open.count === 1 ? 'question' : 'questions'}` : ''}
        {open && discarded ? ' and' : ''}
        {discarded ? ` ${discarded.count.toLocaleString()} discarded ${discarded.count === 1 ? 'item' : 'items'}` : ''}
        {open || discarded ? ` ${open && discarded ? 'are' : 'is'} recorded where they fall. ` : ' The gaps are marked where they fall. '}
        <a className="govuk-link" href="#report-tab-provenance">
          What it kept and what it lost
        </a>
      </p>
    </>
  );
}
