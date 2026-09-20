import type { Artefact } from '$lib/policy-analysis/contracts';
import { SummaryList, type SummaryRow } from '../govuk';
import { Judgement } from './Judgement';
import type { ArtefactLink } from './Report';

/**
 * THE ADVICE, WITH THE THREE FIELDS THE WORD FILE ALREADY PRINTED.
 *
 * "What it suggests" is the one section of this report a policy reader is meant
 * to act on, and it rendered four title-and-paragraph blocks — 183 words in
 * total. Each recommendation also carries `data.change`, `data.tradeoffs` and
 * `data.validationNeeded`, populated on all four, and `report-doc.ts:290-296`
 * prints all three into the .docx and the .md under "The change", "What it
 * costs" and "Before adopting it". The Word file a reader downloaded from this
 * page was a better document than the page it came from.
 *
 * AND THE SPLITTING APPARATUS THAT HID THEM WAS INERT ANYWAY. The section ran
 * `summarise(rec.statement)` and opened `rest` in a disclosure. Measured against
 * the payload: the four assured statements are 321, 401, 366 and 452 characters,
 * none contains a paragraph break, and `LEAD_FLOOR = 320` means the boundary
 * search runs only over the tail — so `rest` is empty on all four and no
 * disclosure ever rendered. `summarise()` is untouched and still used for the
 * provenance limits, where the split is the right one; it is simply not what
 * these needed. The full statement is three to five lines and is set as one.
 *
 * WHO GAINS AND WHO PAYS IS TWO MORE ROWS, not a second block. `beneficiaries`
 * and `burdenBearers` are on all four recommendations — 47 mentions over 26
 * distinct groups — and reach neither the page nor the .docx. Named here per
 * recommendation, which is the detail; the aggregate shape, where providers and
 * employers turn out to be the top of both lists, is `BurdenBars`.
 *
 * A SUMMARY LIST RATHER THAN ANYTHING NEW: GDS has the pattern, the report has
 * already paired its key column at 14rem for the panel and for the pack, and a
 * key/value block degrades to two stacked lines at 320px and prints as itself.
 */

/** A `data` field is `unknown`; a field of whitespace is an absent field. */
const text = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

/** A named group list, as the assessment wrote it. Empty is omitted, never drawn as "None". */
const groups = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map((v) => text(v)) : []).filter(Boolean);

export function Recommendations({ recs, linkTo }: {
  recs: Artefact[];
  /**
   * Absent in the offline pack, where there is no server to drill into, so the
   * title renders as the plain label — the rule every component in this tree
   * follows. See `Report`'s note on the pack for why.
   */
  linkTo?: ArtefactLink;
}) {
  if (!recs.length) return null;
  return (
    <ol className="prt-recs">
      {recs.map((rec) => {
        const rows: SummaryRow[] = [];
        const add = (key: string, value: string) => { if (value) rows.push({ key, value }); };
        // The .docx's own three labels and the .docx's own order, so a reader
        // holding both documents is reading one report.
        add('The change', text(rec.data.change));
        add('What it costs', text(rec.data.tradeoffs));
        add('Before adopting it', text(rec.data.validationNeeded));
        const gains = groups(rec.data.beneficiaries);
        const bears = groups(rec.data.burdenBearers);
        add('Who gains', gains.join(', '));
        add('Who carries it', bears.join(', '));

        return (
          <li key={rec.id} className="prt-rec">
            {/* The artefact's own name is the card's title, the way a play's is
                — it was set as a grey footnote UNDER the instruction, where a
                shorter restatement of the sentence above it reads as an
                afterthought rather than as the thing it names. */}
            {/*
              THE JUDGEMENT SITS ON THE TITLE'S OWN LINE, in the same ink chip
              the write-up's cards carry. Three of these four are supported with
              limits and one is well supported, and a reader deciding which
              advice to act on first was told neither. It is drawn through
              `Judgement` so one definition of the word serves the write-up, the
              drill and this.
            */}
            <div className="prt-rec__head">
              <p className="prt-rec__title">{linkTo ? linkTo(rec) : rec.label}</p>
              <Judgement artefact={rec} />
            </div>
            <p className="prt-rec__lead">{rec.statement}</p>
            {rows.length ? <SummaryList rows={rows} className="prt-rec__fields" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
