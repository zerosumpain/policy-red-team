import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, watchRun, type Detail } from '../api';
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
  usePageTitle(detail?.analysis.title);

  const load = useCallback(async () => {
    try {
      setDetail(await api.detail(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Follow the run while it is going. The stream closes itself on `done`; this
  // only has to stop listening when the reader leaves.
  useEffect(() => {
    if (!detail || isTerminal(detail.analysis.status)) return;
    return watchRun(id, { stage: () => void load(), done: () => void load(), error: setError });
  }, [id, detail, load]);

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
  const running = !isTerminal(analysis.status);

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
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <span className="govuk-caption-l">Assessment</span>
          <h1 className="govuk-heading-xl">{analysis.title}</h1>
          <p className="govuk-body">
            <Tag colour={statusColour(analysis.status) as TagColour}>{statusLabel(analysis.status)}</Tag>{' '}
            <span className="prt-meta">{done} of {stages.length} stages</span>
          </p>
        </div>
      </div>

      {analysis.status === 'failed' && analysis.error ? (
        <WarningText>{analysis.error}</WarningText>
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
          <TaskList items={tasks} idPrefix="stages" />
          {/* A control that would only 403 is not drawn. The landing page has
              made this argument since phase 4; the flag needed to make it here
              only arrived with the share panel. */}
          {detail.readOnly ? null : (
            <ButtonGroup>
              <Button variant="warning" disabled={busy} onClick={() => void act('cancel')}>Cancel this run</Button>
            </ButtonGroup>
          )}
        </>
      ) : (
        <>
          {isFinished(analysis.status) ? (
            <Report
              detail={detail}
              linkTo={(artefact, label) => (
                <Link className="govuk-link" to={`/assessments/${id}/artefacts/${encodeURIComponent(artefact.id)}`}>
                  {label ?? artefact.label}
                </Link>
              )}
            />
          ) : null}
          {!isFinished(analysis.status) ? <TaskList items={tasks} idPrefix="stages" /> : null}
          <ButtonGroup>
            {(analysis.status === 'failed' || analysis.status === 'cancelled') && !detail.readOnly ? (
              <Button disabled={busy} onClick={() => void act('resume')}>Resume the incomplete stages</Button>
            ) : null}
            <Link className="govuk-link" to="/">Back to all assessments</Link>
          </ButtonGroup>
        </>
      )}
    </>
  );
}
