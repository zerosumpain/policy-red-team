import { useMemo, useState } from 'react';
import type { RunCost } from '$lib/policy-analysis/view';
import { costSegments } from '$lib/detail-views';
import { formatGbp, formatTokens } from '$lib/canvas/stats/costFormat';
import { factLabel, stageFacts } from '$lib/policy-analysis/stage-facts';
import { InsetText, SummaryList } from '../govuk';
import { Metrics } from './Metrics';
import { StageLadder, type LadderRow } from './StageLadder';
import { groupLimits } from './warnings';
import { elapsed, inWords, spent, utcInstant } from '../duration';

/**
 * HOW THIS WAS PRODUCED — the section that existed to answer it and did not.
 *
 * It was six summary-list rows: Commissioned, Ran on, Reasoning effort, Depth,
 * Sealed, and "Stages — 18 of 18 completed". That last row is the entire visual
 * account of a run that took 10 hours 23 minutes, made 421 model calls and spent
 * 61.8M tokens, and in which a single stage — Assured synthesis — took 8h 18m,
 * 80% of the whole thing, to produce 31 artefacts.
 *
 * EVERY FIGURE HERE WAS ALREADY ON THE WIRE AND READ BY NOTHING. `startedAt` and
 * `completedAt` are declared on `StageRow` and appear in `client/` in exactly two
 * places: that declaration, and `OfflineApp` writing them to null. `runCost()`
 * is defined in the copied view layer under forty lines of doc-comment about
 * null-versus-zero pricing and had zero call sites anywhere in the repo. Nothing
 * here is new arithmetic; it is arithmetic that was being thrown away.
 *
 * THE WINDOW COMES FROM THE STAGES, NOT FROM `analysis.createdAt`. In the
 * offline pack `createdAt` is the date the PACK was made — `OfflineApp` says so
 * in its own comment — so a run window computed from it would have been right on
 * the service and quietly wrong in the artefact that outlives it. Taking the
 * first start and the last finish off the ladder means the sentence and the
 * eighteen rows under it can never disagree, and on the live run it lands within
 * a second of `analysis`: 13:48:44 to 00:11:43.
 */
export function RunProfile({ analysis, stages, models, cost, offline }: {
  analysis: { model: string | null; thinkingLevel: string | null; depth: string; sealed: boolean };
  stages: {
    ordinal: number; name: string; status: string; warnings: string[];
    startedAt: string | null; completedAt: string | null; error: string | null; kept?: number;
  }[];
  /** The models the run was actually made of. Absent on an unfiltered read. */
  models?: { id: string; calls: number }[];
  /** Null means nothing reported usage — never a run that spent nothing. */
  cost?: RunCost | null;
  offline?: boolean;
}) {
  const [stage, setStage] = useState<number | null>(null);

  const rows: LadderRow[] = useMemo(() => stages.map((row) => ({
    ordinal: row.ordinal,
    name: row.name,
    status: row.status,
    ms: elapsed(row.startedAt, row.completedAt),
    kept: typeof row.kept === 'number' ? row.kept : null,
    limits: (row.warnings ?? []).length,
  })), [stages]);

  /*
   * THE RUN'S OWN WINDOW, and a guard against reading a partial one as a whole.
   *
   * A run still in flight has stages with a start and no finish, so the last
   * finish is not the end of the run. The window is drawn only when every stage
   * that started has also stopped — otherwise the two sentences below would
   * describe a run that is still going as though it had ended.
   */
  const started = rows.map((row) => row.ms).some((ms) => ms !== null);
  const opens = stages.map((row) => row.startedAt).filter((at): at is string => !!at).sort();
  const closes = stages.map((row) => row.completedAt).filter((at): at is string => !!at).sort();
  const running = stages.some((row) => row.startedAt && !row.completedAt);
  const from = opens[0] ?? null;
  const to = running ? null : closes[closes.length - 1] ?? null;
  const runMs = elapsed(from, to);

  const longest = [...rows].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))[0];
  /*
   * A RULE, NOT A DIAGNOSIS. "One stage took 80% of the run" is worth a sentence
   * of its own because it is abnormal; on a run whose stages are evenly matched
   * the same sentence would be noise dressed as a finding. Half the run in one
   * stage is the threshold, so the sentence appears when the fact does.
   */
  const dominant = runMs && longest?.ms && longest.ms > runMs / 2 ? longest : null;

  const limits = rows.reduce((n, row) => n + row.limits, 0);
  const worst = [...rows].sort((a, b) => b.limits - a.limits).slice(0, 2);
  const concentrated = worst.reduce((n, row) => n + row.limits, 0);
  /*
   * The same argument as above, in the other axis: two of eighteen stages
   * holding 42% of the limits is the shape of the run, and two holding 12% is
   * arithmetic. A third of everything in two stages is the line.
   */
  const lopsided = limits && rows.length >= 6 && concentrated / limits >= 0.33 ? worst : null;

  /*
   * DID THEY RUN ONE AFTER ANOTHER? The eighteen elapsed times sum to 37,379
   * seconds against a wall clock of 37,379 — so on this run they did, there was
   * no resume and no pause, and the 8h 18m stage really did take 8h 18m. That is
   * a fact about THIS run and is stated only when it holds: a run whose stages
   * overlap, or which was resumed hours later, must not inherit the sentence.
   */
  const summed = rows.reduce((n, row) => n + (row.ms ?? 0), 0);
  const inSeries = Boolean(runMs && summed && Math.abs(summed - runMs) / runMs < 0.01);

  const selected = stage === null ? null : stages.find((row) => row.ordinal === stage) ?? null;
  const selectedRow = stage === null ? null : rows.find((row) => row.ordinal === stage) ?? null;

  const stopped = stages.filter((row) => row.status === 'failed');
  const known = stages.some((row) => row.status !== 'unknown');
  const ranOn = models ?? [];

  return (
    <>
      {/*
        WHAT STOPPED, kept exactly where it was. `stage.error` was in the payload
        and read by nothing — the assessment page suppressed its own task list
        once a report existed — so a failed stage left no trace anywhere a reader
        could find it. A run that stopped is a fact about the report's
        completeness, which is the one thing this section is for.
      */}
      {stopped.length ? (
        <InsetText>
          <p className="govuk-body">
            {stopped.length === 1 ? 'One stage did not finish' : `${stopped.length} stages did not finish`}
            {': '}
            {stopped.map((row) => `${row.name.toLowerCase()} (stage ${row.ordinal + 1})`).join(', ')}.
            {' '}Everything below is what the run produced before that, and the work those stages
            would have written is absent rather than filled in.
          </p>
          {stopped.map((row) => (row.error ? (
            <p className="govuk-body" key={row.ordinal}>{row.error}</p>
          ) : null))}
        </InsetText>
      ) : null}

      {runMs && from && to ? (
        <p className="govuk-body">
          Ran for <strong>{inWords(runMs)}</strong>, {utcInstant(from)} to {utcInstant(to)} UTC.
          {dominant ? (
            <>
              {' '}The longest stage was <strong>{dominant.name}</strong> at {inWords(dominant.ms!)} —{' '}
              {Math.round((dominant.ms! / runMs) * 100)}% of the whole run.
            </>
          ) : null}
        </p>
      ) : null}

      {lopsided ? (
        <p className="govuk-body">
          Two of the {rows.length} stages recorded {Math.round((concentrated / limits) * 100)}% of the{' '}
          {limits.toLocaleString()} limits between them: {lopsided[0].name} ({lopsided[0].limits}) and{' '}
          {lopsided[1].name} ({lopsided[1].limits}). The rest are spread across the run.
        </p>
      ) : null}

      <RunSpend cost={cost ?? null} />

      <StageLadder rows={rows} runMs={runMs} selected={stage} onSelect={setStage} />

      {/* The caption says what is true of THIS reading. A pack made before the
          timings travelled has no duration column, and a caption explaining one
          would be describing a column that is not there. */}
      <p className="govuk-body-s prt-meta">
        {started
          ? `Each stage is timed on its own wall clock, and the figure beside it is its share of the run.${
            inSeries ? ' The elapsed times sum to the whole run, so the stages ran one after another.' : ''}`
          : 'This copy carries no stage timings, so the ladder shows what each stage produced and what it recorded.'}
      </p>

      {selected && selectedRow ? (
        <StageDetail stage={selected} row={selectedRow} runMs={runMs} onClear={() => setStage(null)} />
      ) : null}

      <SummaryList
        rows={[
          ...(analysis.model || !offline ? [{ key: 'Commissioned', value: analysis.model ?? 'the configured default' }] : []),
          /*
           * WHAT ACTUALLY RAN, WHERE IT IS NOT WHAT WAS ASKED FOR. On 2026-09-20
           * a stage of the real run was resumed after a restart and went out on
           * `gpt-5.6-sol` while the other 419 calls had been `gpt-5.6-luna`, so
           * one assessment had been made by two models and the report named one.
           * Shown only when the two disagree; otherwise it repeats the row above.
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
                value: `${stages.filter((row) => row.status === 'completed').length} of ${stages.length} completed`,
              }]
            : []),
        ]}
      />
    </>
  );
}

/**
 * WHAT THE RUN SPENT.
 *
 * FOUR CARDS AND ONE BAR, and the bar is NESTED rather than four-way. `cached`
 * is the part of the input served from cache and `reasoning` is the part of the
 * output spent thinking — `runCost` says so in its own arithmetic, where
 * `total = input + output` and neither of the other two is added — so a
 * four-segment bar of input, cached, output and reasoning would sum to about
 * 108M on a 61.8M run. `costSegments` partitions it instead, which also gives
 * the reading worth having: how much of a very large number is context being
 * re-sent rather than the model thinking.
 *
 * A NEUTRAL GREY RAMP, deliberately not `.prt-stack` with `prt-band--*`. That
 * ramp is four steps of ONE hue defined as a MAGNITUDE encoding for exposure and
 * taught to the reader across four moves; four token categories are a nominal
 * set, and painting them on it would make lightness falsely assert that reasoning
 * is more severe than cache.
 *
 * "NO CASH" IS NOT "£0.00". Codex prices as null because it is subscription
 * quota, and `runCost`'s own comment exists to stop a run served entirely by the
 * bridge reporting free money. This run is that case.
 */
function RunSpend({ cost }: { cost: RunCost | null }) {
  if (!cost || !cost.total) return null;
  const segments = costSegments(cost);
  const cached = cost.input ? Math.round((Math.min(cost.cached, cost.input) / cost.input) * 100) : null;

  return (
    <>
      <Metrics
        columns={4}
        metrics={[
          { label: 'tokens in and out', value: formatTokens(cost.total), note: `${cost.input.toLocaleString()} in, ${cost.output.toLocaleString()} out` },
          { label: 'model calls reported usage', value: cost.calls.toLocaleString() },
          ...(cached === null ? [] : [{ label: 'of the input was served from cache', value: `${cached}%` }]),
          cost.cash === null
            ? { label: 'subscription quota, not cash', value: 'No cash' }
            : { label: 'at the stored rate', value: formatGbp(cost.cash) },
        ]}
      />

      <div className="prt-spend">
        <div className="prt-spend__bar" aria-hidden="true">
          {segments.map((segment) => (
            <span
              key={segment.key}
              className={`prt-spend__seg prt-spend__seg--${segment.key}`}
              style={{ width: `${(segment.tokens / cost.total) * 100}%` }}
            />
          ))}
        </div>
        {/* THE KEY IS THE READING, and it is the only copy of it: the bar above
            carries no text, because a label written inside a segment is
            unreadable on the short ones and has to pass contrast against a fill
            that changes. Every segment therefore states its word, its count and
            its share here, which is also what a screen reader gets. */}
        <ul className="prt-spend__key">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className={`prt-spend__swatch prt-spend__seg--${segment.key}`} aria-hidden="true" />
              <strong>{segment.label}</strong>
              <span className="prt-denom">
                {formatTokens(segment.tokens)} · {Math.round((segment.tokens / cost.total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * ONE STAGE, ON ITS OWN.
 *
 * The panel had no narrowing gesture at all: the selection banner above the tab
 * strip says the whole report is filtered, and this move genuinely cannot be
 * filtered by a band or a mechanism, because the warnings are about the RUN and
 * not about the paper. The axis it CAN be filtered on is the stage — which is
 * the axis `stages.flatMap(s => s.warnings)` threw away before anything could
 * read it.
 *
 * THE FILTER IS PANEL-LOCAL AND NEVER THE CROSS-REPORT `Selection`. Selecting
 * "Document decomposition" must not narrow the playbook three moves away: a
 * stage is a fact about how the report was made, and the other four moves are
 * about what it says.
 *
 * AND THE TWO STAGES THAT RECORDED NOTHING GET A SENTENCE, not a blank. An
 * empty block under a pressed row reads as a control that failed.
 */
function StageDetail({ stage, row, runMs, onClear }: {
  stage: { ordinal: number; name: string; status: string; warnings: string[] };
  row: LadderRow;
  runMs: number | null;
  onClear: () => void;
}) {
  const facts = useMemo(() => stageFacts(stage.warnings ?? []), [stage.warnings]);
  const groups = useMemo(() => groupLimits([{ name: stage.name, warnings: stage.warnings ?? [] }]), [stage]);

  return (
    <div className="prt-stagedetail">
      <h3 className="govuk-heading-s">
        Stage {stage.ordinal + 1} of the pipeline — {stage.name}
      </h3>
      {/* ONE SENTENCE PER FACT THIS READING ACTUALLY HAS. A pack made before the
          timings travelled has no duration and no artefact count, and a
          sentence assembled from optional clauses either reads as English or
          reads as "Ran for . It minted ." — so each clause is composed and the
          absent ones are simply not in the list. */}
      <p className="govuk-body">
        {[
          row.ms === null
            ? null
            : `Ran for ${spent(row.ms)}${runMs ? `, ${Math.round((row.ms / runMs) * 100)}% of the run` : ''}`,
          row.kept === null
            ? null
            : `minted ${row.kept.toLocaleString()} ${row.kept === 1 ? 'artefact' : 'artefacts'}`,
          `recorded ${row.limits} ${row.limits === 1 ? 'limit' : 'limits'}`,
        ].filter(Boolean).join(', ')}.
      </p>

      {facts.length ? (
        <ul className="govuk-list govuk-list--bullet">
          {facts.map((fact) => <li key={fact.kind}>{factLabel(fact)}</li>)}
        </ul>
      ) : (
        <p className="govuk-body">{stage.name} recorded nothing — no discards, no dropped references, and no open questions.</p>
      )}

      {groups.length ? (
        <ul className="prt-gaps">
          {groups.slice(0, 5).map((group) => (
            <li key={group.lead} className="prt-gap">
              <p className="prt-gap__lead">
                {group.lead}
                {group.total > 1 ? <span className="prt-meta"> — {group.total} times</span> : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {groups.length > 5 ? (
        <p className="govuk-body-s prt-meta">
          and {groups.length - 5} more, in “What it could not establish”.
        </p>
      ) : null}

      <button type="button" className="prt-linkbutton" onClick={onClear}>
        Show every stage again
      </button>
    </div>
  );
}
