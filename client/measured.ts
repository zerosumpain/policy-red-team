/**
 * THE ONE RUN THIS BUILD HAS MEASURED END TO END.
 *
 * Three pages quote it and they were quoting it differently. `/assessments/new`
 * said the last full run "took two and a half hours"; the landing table, one
 * click away, showed the same run at 10h 23m; and `/admin` froze the token
 * figure a third time. Two surfaces in one product disagreeing by four times
 * about the same run, with the SMALLER figure shown to the reader before they
 * spend the money.
 *
 * WHICH ONE WAS WRONG: the commissioning page. Measured off the assessment's own
 * rows — `createdAt` 2026-09-19T13:48:44.078Z to `completedAt`
 * 2026-09-20T00:11:43.247Z — the run is 10h 22m 59s. "Two and a half hours" is
 * stages 1 to 17, which took 2h 04m 36s between them; the missing 8h 18m 23s is
 * Assured synthesis on its own. Both halves are worth stating, because a reader
 * choosing a depth wants to know that one stage is four fifths of the wait.
 *
 * WHY THESE ARE CONSTANTS AND NOT A FETCH. `Landing.analyses` is
 * `AnalysisRow[]`, which carries no `depth` and no token or call totals — depth
 * lives only on the `Detail.analysis` intersection, and the model rows only on
 * a detail read. Computing this properly means a server change and a `depth`
 * field on the row, which is a separate piece of work and should be costed as
 * one. Until then the honest thing is one measurement, written down once, with
 * its provenance beside it — not the same measurement typed into three files.
 *
 * WHAT IS NOT CLAIMED: there is no deep run. `/assessments/new` says so in the
 * Deep hint and that wording stays exactly as it is.
 */
export const MEASURED_RUN = {
  /** Artefacts of kind `passage` in the run's own inventory. */
  passages: 72,
  /** `models[]`: 419 calls on codex/gpt-5.6-luna plus 2 on codex/gpt-5.6-sol. */
  calls: 421,
  /**
   * Read off the run's usage rows, which are not in the report payload — which
   * is exactly why it is written here with that said, rather than rendered as
   * though the page had measured it.
   */
  tokensAbout: '61 million',
  stages: 18,
  ran: '10 hours 23 minutes',
  /** Stages 1 to 17 between them: 2h 04m 36s. */
  firstStages: '2 hours',
  /** Assured synthesis alone: 8h 18m 23s. */
  finalStage: '8 hours',
  when: '19 September 2026',
} as const;

/** The Standard depth hint. One sentence of measurement, and where the time went. */
export const MEASURED_STANDARD_HINT =
  `One pass over every passage. The last full run of a ${MEASURED_RUN.passages}-passage paper made `
  + `${MEASURED_RUN.calls} model calls, used about ${MEASURED_RUN.tokensAbout} tokens, and ran for `
  + `${MEASURED_RUN.ran} — ${MEASURED_RUN.firstStages} of that across the first seventeen stages, `
  + `and ${MEASURED_RUN.finalStage} in the final synthesis.`;

/** The same measurement where a ceiling is being set, which is the other place it is needed. */
export const MEASURED_SCALE =
  `For scale: a complete ${MEASURED_RUN.stages}-stage assessment of a ${MEASURED_RUN.passages}-passage `
  + `paper made ${MEASURED_RUN.calls} model calls and used about ${MEASURED_RUN.tokensAbout} tokens over `
  + `${MEASURED_RUN.ran}.`;
