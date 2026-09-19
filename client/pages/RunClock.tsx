import type { RunProgress } from '../api';
import { InsetText, Tag } from '../govuk';

/**
 * HOW MUCH LONGER, AND WHAT THAT ANSWER IS MADE OF.
 *
 * A reader watching a run has one question and the page could not answer it: an
 * eighteen-stage assessment spends forty minutes inside a single stage, so the
 * progress list sat still and said nothing while the thing ran for hours.
 *
 * IT SHOWS ITS WORKING, and that is not decoration. The estimate is part
 * arithmetic and part guess — decomposition's fan-out is exactly the passage
 * count, patterns and scenarios are constants, actors and questions are capped
 * by the depth, and entity groups and mechanisms are frankly extrapolated. A
 * bare "about 90 minutes" invites a trust it has not earned; "149–213 calls
 * left, 6 at a time, 204s median over 12 completed" lets a reader decide for
 * themselves how much to believe, and notice when it is wrong.
 *
 * THE FINISH TIME COMES FROM THE SERVER. Rendering `now + seconds` in the
 * browser would put a client with a skewed clock three minutes out with no way
 * for the reader to tell which of the two was lying.
 *
 * FAILURES ARE SHOWN, NOT HIDDEN. A run quietly dropping a third of its calls is
 * still "in progress", and the reader deciding whether to wait another hour
 * deserves to know they are waiting for a worse answer.
 */
/** 4_664_123 → "4.7M". A reader comparing a run against an allowance needs magnitude, not digits. */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function RunClock({ progress }: { progress: RunProgress | null }) {
  if (!progress) return null;

  const { estimate, calls, finishBy } = progress;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <InsetText>
      <p className="govuk-body">
        <strong>
          {progress.stagesDone} of {progress.stagesTotal} stages done
          {progress.currentStage ? <> — {progress.currentStage}</> : null}
        </strong>
      </p>

      {estimate?.seconds && finishBy ? (
        <p className="govuk-body">
          {progress.says}, so it should finish between{' '}
          <strong>{clock(finishBy.earliest)}</strong> and <strong>{clock(finishBy.latest)}</strong>.
        </p>
      ) : (
        <p className="govuk-body">
          {estimate
            ? progress.says
            : 'Working out how long this will take — the first call has to finish first.'}
        </p>
      )}

      {progress.tokens ? (
        <p className="govuk-body">
          {/* THE SCALE FIRST. A run that has spent four million tokens is a
              different object from one that has spent forty thousand, and the
              reader deciding whether to let it continue needs that before any
              percentage. */}
          <strong>{fmt(progress.tokens.total)} tokens</strong> so far
          {progress.tokens.projectedTotal ? <> — on course for about {fmt(progress.tokens.projectedTotal)}</> : null}.
          {progress.tokens.cachedShare !== null ? (
            <>
              {' '}
              {Math.round(progress.tokens.cachedShare * 100)}% of input served from cache
              {progress.tokens.cachedShare < 0.2 ? (
                <> — <strong>low</strong>, which means the shared context is being re-sent rather than reused</>
              ) : null}
              .
            </>
          ) : null}
          {progress.allowance ? (
            <>
              {' '}
              That is {Math.round((progress.allowance.usedByThisRun / progress.allowance.weeklyTokens) * 100)}% of
              your weekly allowance
              {progress.allowance.projectedShare ? (
                <>, heading for {Math.round(progress.allowance.projectedShare * 100)}%</>
              ) : null}
              .
            </>
          ) : null}
        </p>
      ) : null}

      <p className="govuk-body-s prt-meta">
        {calls.completed} calls done
        {calls.running ? `, ${calls.running} in flight` : ''}
        {calls.failed ? (
          <>
            {', '}
            <Tag colour="red">{calls.failed} failed</Tag>{' '}
            — each one is a gap in the finished assessment.
          </>
        ) : null}
        {estimate ? <><br />{estimate.basis}.</> : null}
      </p>
    </InsetText>
  );
}
