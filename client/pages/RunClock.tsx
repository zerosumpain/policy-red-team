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
 *
 * IT HAD NO GEOMETRY AND NEVER ANNOUNCED, which is what the two blocks below
 * fix. On the live run this was the only surface a reader had for 10 hours 23
 * minutes, and it was four paragraphs of prose in which every quantity was an
 * inline percentage — on the one page whose entire job is "how much longer".
 * Separately: a grep for `aria-live` and `role="status"` across `client/`
 * finds ten live regions — Admin, ModelMenu, New, StressLab, Persona,
 * SelectionBanner, Addenda, ThreatsLead — and none here. The one surface that
 * updates on a timer was the one surface that never said so.
 */
/** 4_664_123 → "4.7M". A reader comparing a run against an allowance needs magnitude, not digits. */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const pct = (share: number) => `${Math.max(0, Math.min(1, share)) * 100}%`;

/**
 * HOW FAR THROUGH THE STAGES, AS A LENGTH.
 *
 * A NEUTRAL THREE-STEP BAR, deliberately not `.prt-stack` with `prt-band--*`.
 * That ramp is the exposure ramp: four steps from severe to limited, taught to
 * the reader across five moves of the report and meaning MAGNITUDE OF HARM.
 * Run progress is not exposure, and borrowing the ramp here would teach a
 * reader that a run two stages in is "limited" and a run nearly done is
 * "severe".
 *
 * THE TRACK IS `aria-hidden` AND THE KEY IS NOT. The three numbers are the
 * content; the lengths are a second reading of them for anyone who can see
 * them. Announcing both means hearing each figure twice.
 */
function StageBar({ progress }: { progress: RunProgress }) {
  const total = progress.stagesTotal;
  if (!total) return null;
  const done = Math.min(Math.max(progress.stagesDone, 0), total);
  // A stage is "running" only where the server named one AND there is room for
  // it: at 18 of 18 with a current stage still set, a fourth segment would push
  // the bar past its own track.
  const running = progress.currentStage && done < total ? 1 : 0;
  const waiting = Math.max(0, total - done - running);

  return (
    <div className="prt-runbar">
      <div className="prt-runbar__track" aria-hidden="true">
        {done ? (
          <span className="prt-runbar__seg prt-runbar__seg--done" style={{ width: pct(done / total) }}>
            <span className="prt-runbar__n">{done}</span>
          </span>
        ) : null}
        {running ? (
          <span className="prt-runbar__seg prt-runbar__seg--running" style={{ width: pct(running / total) }} />
        ) : null}
        {waiting ? (
          <span className="prt-runbar__seg prt-runbar__seg--waiting" style={{ width: pct(waiting / total) }}>
            <span className="prt-runbar__n">{waiting}</span>
          </span>
        ) : null}
      </div>
      <ul className="prt-runbar__key">
        <li>
          <span className="prt-runbar__swatch prt-runbar__swatch--done" aria-hidden="true" />
          <strong>{done}</strong> finished
        </li>
        {running ? (
          <li>
            <span className="prt-runbar__swatch prt-runbar__swatch--running" aria-hidden="true" />
            <strong>1</strong> running{progress.currentStage ? <> — {progress.currentStage}</> : null}
          </li>
        ) : null}
        <li>
          <span className="prt-runbar__swatch prt-runbar__swatch--waiting" aria-hidden="true" />
          <strong>{waiting}</strong> not started
        </li>
      </ul>
    </div>
  );
}

/**
 * WHAT IT HAS SPENT, AGAINST WHERE IT IS HEADING.
 *
 * One track, three things on it: the tokens spent so far as a solid fill, the
 * projection as the pale remainder, and the weekly allowance as a tick. The
 * tick is the only one of the three that can fall outside the axis — an
 * allowance smaller than the projection, which is exactly the case worth
 * seeing — so it is drawn only where it lands on the track and the sentence
 * below states the share either way.
 *
 * THE CACHED SHARE IS A SECOND, THINNER BAR rather than a segment of the
 * first. It is a proportion of INPUT, not a slice of the total spend, and
 * stacking it inside the same track would say it was.
 */
function TokenMeter({ progress }: { progress: RunProgress }) {
  const { tokens, allowance } = progress;
  if (!tokens) return null;
  // The axis is whichever is larger: before a projection exists it is the spend
  // itself, and the bar is then full — which is the truth, not a bug.
  const axis = Math.max(tokens.total, tokens.projectedTotal ?? 0);
  if (!axis) return null;
  const weekly = allowance?.weeklyTokens ?? 0;
  const tick = weekly > 0 && weekly <= axis ? weekly / axis : null;

  return (
    <div className="prt-meter">
      <div className="prt-meter__track" aria-hidden="true">
        <span className="prt-meter__fill" style={{ width: pct(tokens.total / axis) }} />
        {tick === null ? null : <span className="prt-meter__tick" style={{ left: pct(tick) }} />}
      </div>
      <p className="govuk-body-s prt-meter__key">
        <strong>{fmt(tokens.total)}</strong> tokens spent
        {tokens.projectedTotal ? <> of about {fmt(tokens.projectedTotal)} projected</> : null}
        {tick === null ? null : <> · the tick is your {fmt(weekly)} weekly allowance</>}
      </p>

      {tokens.cachedShare === null ? null : (
        <>
          <div className="prt-meter__track prt-meter__track--thin" aria-hidden="true">
            <span className="prt-meter__fill prt-meter__fill--cached" style={{ width: pct(tokens.cachedShare) }} />
          </div>
          <p className="govuk-body-s prt-meter__key">
            <strong>{Math.round(tokens.cachedShare * 100)}%</strong> of input served from cache
          </p>
        </>
      )}
    </div>
  );
}

export function RunClock({ progress }: { progress: RunProgress | null }) {
  if (!progress) return null;

  const { estimate, calls, finishBy } = progress;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <InsetText>
      <StageBar progress={progress} />

      {/*
        THE LIVE REGION IS THESE TWO SENTENCES AND NOTHING ELSE.

        Wrapping the whole inset re-announces four sentences, a bar key and the
        estimate's basis line on every thirty-second poll — twelve hundred
        announcements over a ten-hour run, which is worse than silence.
        `aria-atomic` defaults to false, so what matters here is not an
        attribute but where the region's boundary is drawn: it goes round the
        answer to "how much longer" and stops.
      */}
      <div role="status" aria-live="polite">
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
      </div>

      <TokenMeter progress={progress} />

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
