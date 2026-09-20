import { useMemo } from 'react';
import type { ActorView } from '$lib/policy-analysis/view';
import { Details, Table } from '../govuk';
import { Metrics } from './Metrics';
import { funnel } from './pressure';

/**
 * THE FUNNEL THAT DECIDES WHO IS IN THE ROOM, DRAWN AS FIGURES.
 *
 * This was the last thing in the Actors panel: four numbers in a
 * `govuk-body-s prt-meta` paragraph, which is the smallest type on the page, in
 * grey, immediately above the rule that ends the move — "43 further bodies are
 * profiled but run no play. 116 were named and never profiled. 171 candidate
 * records stand for 55 names". `Metrics`'s own header states the rule that
 * breaks: "a number that is the point of a section should not be smaller than
 * the sentence explaining it."
 *
 * THREE TILES, NOT FOUR. The obvious fourth is "55 profiles" beside "55 distinct
 * names", and they are the same 55 bodies — every distinct name the paper names
 * carries a profile on this run — so a fourth tile would print one number twice
 * for two things and invite a reader to subtract them.
 *
 * AND "IDLE" BECOMES A SET YOU CAN READ. A count of 43 answers nothing; the 43
 * include Ofsted, Ofqual, Parliament, the Competition and Markets Authority and
 * the Department for Work and Pensions. A profiled regulator that nobody found
 * a play for is worth a reader's eye, and it is the one place the report
 * distinguishes an idle body from an active one. `<Details>` opens in print
 * (the base forces its contents visible and hides the summary), needs no router
 * and works unchanged in the offline pack.
 */
export function ActorFunnel({ board, onNetwork }: {
  board: ActorView[];
  /**
   * How a reader gets to the resolution finding, where there is somewhere to go.
   *
   * A cross-move mention is a control, not prose: "How they connect" is a
   * section in the Causality panel, and following it changes what is on the
   * page rather than going to a new one. Absent in the offline pack, which is
   * one document with no panels to switch between, where the sentence stands on
   * its own.
   */
  onNetwork?: () => void;
}) {
  const counts = useMemo(() => funnel(board), [board]);
  if (!counts.rows) return null;

  return (
    <>
      <Metrics
        columns={3}
        metrics={[
          {
            label: 'candidate records',
            value: counts.rows,
            note: `${counts.duplicates} are a second record of a name already here`,
          },
          {
            label: 'distinct bodies named',
            value: counts.names,
            note: counts.idleUnprofiled
              ? `${counts.idleUnprofiled} of them were never profiled`
              : 'every one of them profiled',
          },
          {
            label: 'positioned to run a play',
            value: counts.active,
            note: `${counts.idle.length} are profiled and run none`,
          },
        ]}
      />

      <p className="govuk-body-s prt-meta">
        Entity resolution keeps candidates apart rather than merging them, which is why there are
        more records than bodies{onNetwork ? (
          <>
            {' — '}
            <button type="button" className="prt-linkbutton" onClick={onNetwork}>How they connect</button>
            {' '}reports it as a finding
          </>
        ) : null}.
      </p>

      {counts.idle.length ? (
        <Details summary={`The ${counts.idle.length} bodies the paper names and profiles that run no play`}>
          <p className="govuk-body-s">
            Each of these has a profile in this assessment and no play aimed through it. That is a
            reading in itself where the body is a regulator or a department: nothing the paper sets
            up gives it something to do.
          </p>
          <Table
            caption="Profiled, and running nothing"
            captionSize="s"
            scroll
            columns={[{ header: 'Body' }, { header: 'Kind' }]}
            rows={counts.idle.map((body) => [body.label, body.entityType || '—'])}
          />
        </Details>
      ) : null}
    </>
  );
}
