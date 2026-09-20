/**
 * HOW LONG SOMETHING TOOK, IN THE VOCABULARY THE PRODUCT ALREADY USES.
 *
 * The landing page has said "Ran for — 10h 23m" for this assessment since the
 * column that discriminates was added, computed by a `spent()` declared inside
 * `Home.tsx`'s `Assessments` component. The REPORT, one click away, said nothing
 * at all about duration — not the ten hours, and not that one of its eighteen
 * stages took eight of them. Writing a third formatter for the report would have
 * put two vocabularies for one quantity in one product, so this is the first
 * one, lifted out and given a name.
 *
 * THREE SHAPES, BECAUSE A DURATION IS READ IN THREE PLACES. A table cell wants
 * "8h 18m" and a sentence wants "8 hours 18 minutes"; a floor of "under a
 * minute" belongs to both, because the run has stages that finished in under a
 * second and "0 min" beside them reads as a bug rather than as a fact.
 */

/** Milliseconds between two instants, or null where either is missing or unusable. */
export function elapsed(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  // A negative or non-finite span is a clock that moved, not a duration. Saying
  // nothing is the honest answer; `Home.tsx` prints an em dash for the same case.
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * "under a minute", "25 min", "10h 23m" — the landing table's own wording.
 *
 * The ninety-minute threshold is `Home.tsx`'s: below it, minutes are the unit a
 * reader compares in, and above it an hour count is.
 */
export function spent(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * The same duration as a sentence would say it: "8 hours 18 minutes".
 *
 * A sentence reading "Ran for 10h 23m" is a table cell that has escaped into
 * prose. The compact form stays for the column it was written for.
 */
export function inWords(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '';
  const m = rest ? `${rest} ${rest === 1 ? 'minute' : 'minutes'}` : '';
  return [h, m].filter(Boolean).join(' ') || `${minutes} minutes`;
}

/**
 * "19 September 13:48 UTC" — the date, the clock, and which clock it is.
 *
 * NOT THE READER'S TIMEZONE, deliberately. Every other instant in this product
 * is rendered locally, and that is right for "you started this at 14:48"; it is
 * wrong for the provenance record of a finished run, which is read by whoever
 * the report was sent to, in whatever timezone they are in, against timestamps
 * their colleague quoted from somewhere else. A bare clock time on a report that
 * travels is a lie that costs an hour to find.
 */
export function utcInstant(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
  return `${date} ${clock}`;
}
