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
