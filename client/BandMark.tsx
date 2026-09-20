import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';

/**
 * A BAND WORN AS THE REPORT WEARS IT.
 *
 * These were GOV.UK Tags — red, orange, grey — which `Report.tsx` rejects in
 * capitals: "a THIRD colouring of the same four bands, disagreeing with the
 * card borders, the stacked bar, the mechanism segments and the plot, all of
 * which use the assessment's own ramp. Four bands cannot be red-orange-grey
 * here and purple-to-pink everywhere else and still mean one thing." The fix
 * was applied inside the report and never ported to the library.
 *
 * WORSE THAN INCONSISTENT: the ternary had three branches for four bands, so
 * moderate and limited both rendered grey and were indistinguishable. That is
 * invisible on the library index, where every row happens to be severe,
 * significant or limited, and live on a dossier, whose play table runs across
 * every assessment that profiled the body.
 *
 * `.prt-band` is a top-level class on `:root` custom properties, so it is
 * already correct outside a tab panel and outside the pack.
 *
 * ITS OWN LEAF MODULE, not an export from either page. Both the library index
 * and a dossier need it, they are separate lazy chunks, and having the index
 * import the detail page to borrow one span would drag `persona-view` and the
 * selection module into the first thing a reader opens.
 *
 * THE UNKNOWN CASE IS GUARDED RATHER THAN DEFAULTED. `worstBand` is
 * `string | null` and `plays[].band` is a bare `string`, so a value outside the
 * four would take a `prt-band--*` rule the stylesheet has never heard of and
 * render as unstyled text. It falls to plain meta instead, which is how
 * `ActorsLead` renders a group with no worst play.
 */
export function BandMark({ band }: { band: string | null }) {
  if (!band) return <span className="prt-meta">None found</span>;
  if (!(band in BAND_LABEL)) return <span className="prt-meta">{band}</span>;
  // BAND_LABEL, so the library capitalises the way the report does instead of
  // printing the raw lowercase enum the pages have been printing.
  return <span className={`prt-band prt-band--${band}`}>{BAND_LABEL[band as Band]}</span>;
}
