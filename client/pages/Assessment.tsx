import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, watchRun, type Detail, type DetailView, type RunProgress } from '../api';
import { RunClock } from './RunClock';
import { RunFindings } from './RunFindings';
import { Button, ButtonGroup, NotificationBanner, Tag, TaskList, WarningText, type Task, type TagColour } from '../govuk';
import { isFinished, isTerminal, statusColour, statusLabel } from '../status';
import { Report } from '../report/Report';
import { usePageTitle } from '../layout/Template';

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

  // Follow the run while it is going. The stream closes itself on `done`; this
  // only has to stop listening when the reader leaves.
  useEffect(() => {
    if (!detail || isTerminal(detail.analysis.status)) return;
    /*
     * A STAGE BOUNDARY ASKS THE SMALL QUESTION. Eighteen of these fire over a
     * run and the page is drawing a stage list and an index of links; `done`
     * asks the big one, because that is the moment the report appears.
     */
    return watchRun(id, { stage: () => void load('progress'), done: () => void load('report'), error: setError });
  }, [id, detail, load]);

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
    if (!detail || isTerminal(detail.analysis.status)) return;
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
  }, [id, detail]);

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
  const running = !isTerminal(analysis.status);
  /** A run that stopped short still has a report; a run still going does not. */
  const showReport = isFinished(analysis.status) || analysis.status === 'failed' || analysis.status === 'cancelled';

  const tasks: Task[] = stages.map((stage) => ({
    title: stage.name,
    hint: stage.error ?? (stage.warnings.length ? stage.warnings[0] : undefined),
    status: stage.status === 'completed' && stage.warnings.length
      ? { tag: { text: 'With gaps', colour: 'yellow' } }
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
          <p className="govuk-body">
            Some stages recorded warnings — most often that a source could not be retrieved. The
            report is complete and the gaps are marked where they fall.
          </p>
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
              linkTo={(artefact, label) => (
                <Link className="govuk-link" to={`/assessments/${id}/artefacts/${encodeURIComponent(artefact.id)}`}>
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
