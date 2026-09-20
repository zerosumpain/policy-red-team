/**
 * How a status is shown.
 *
 * Two things worth knowing. `completed_with_gaps` is a FINISHED run, not a failed
 * one — `store.ts` picks it purely on whether any stage recorded a warning, and a
 * run without a Tavily key always warns — so it is green-adjacent, not red.
 *
 * And the label is "With gaps", not "Completed with gaps": a status column is
 * narrow, GOV.UK's own statuses are two words, and the longer phrase wrapped onto
 * two lines at every width, which reads as a fault in the row rather than a
 * description of it.
 */
const LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  completed_with_gaps: 'With gaps',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const COLOURS: Record<string, string> = {
  queued: 'grey',
  running: 'blue',
  completed: 'green',
  completed_with_gaps: 'yellow',
  failed: 'red',
  cancelled: 'purple',
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function statusColour(status: string): string {
  return COLOURS[status] ?? 'grey';
}

export function isFinished(status: string): boolean {
  return status === 'completed' || status === 'completed_with_gaps';
}

export function isTerminal(status: string): boolean {
  return isFinished(status) || status === 'failed' || status === 'cancelled';
}

/**
 * HOW LONG A RUN TOOK, in one ladder used by every surface that says so.
 *
 * This was private to the landing table, where its own comment argues that
 * "Ran for" is the only column that separates a ten-hour assessment from a
 * fourteen-minute stub. The assessment header then had to state the same span
 * and the commissioning page quotes it as prose, and three copies of a
 * duration ladder is three chances to round the same run differently — the
 * defect the page already carried, where `/assessments/new` said the run took
 * two and a half hours and the landing table said 10h 23m of the same run.
 *
 * NEGATIVE AND NON-FINITE COME BACK AS AN EM DASH rather than as "0 min": a
 * row whose `updatedAt` precedes its `createdAt` is a clock problem, and
 * printing a duration for it would launder it into a measurement.
 */
export function spent(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
