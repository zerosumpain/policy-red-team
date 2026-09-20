import type { Play } from '$lib/policy-analysis/view';
import { Table } from '../govuk';
import { Figure } from './Figure';
import { Strip } from './Strip';
import { exposureSpread } from './spread';

/**
 * HOW THE EXPOSURE IS SPREAD — the figure the stacked bar cannot be.
 *
 * The bar above this says twenty of forty-seven plays are severe, which is the
 * right first answer and hides the second one. Measured on the run: the lowest
 * severe play and the highest significant one are 0.0039 apart, the next cut
 * down is a 0.0847 break, and 38 of the 47 sit inside 23% of the scale. Four
 * bands drawn as four equal tiers say none of that, and the report then ranks
 * forty-seven plays on a figure printed to two decimals in which 0.70 appears
 * five times and 0.74, 0.75, 0.73 and 0.68 four times each.
 *
 * ONE INK, AND THE BANDS NAMED UNDER THE AXIS. The ramp is not used here: a
 * limited play drawn in #f0d5e3 on the track measures 1.23:1, so the two
 * lightest bands would be the two the reader cannot see, and this figure exists
 * to show where the sparse end of the distribution is. The cuts are drawn, so
 * position already says which band a tick is in, and the stretch between two
 * cuts is labelled with the band's word and its count.
 *
 * NOT A SECOND SELECTOR. The bar keeps that job. Adding a selection here would
 * put two controls for one state in the same section, and this figure's answer
 * to "which play is that" is the table twin and the ranked list below it.
 *
 * THE TABLE TWIN IS THE FOUR BANDS, NOT THE FORTY-SEVEN PLAYS. Every play with
 * its own exposure is already on this page twice — the ranked list under this
 * section, and Move 3's playbook — so a third copy would be the longest table in
 * the report saying nothing new. What the strip shows and no existing table does
 * is where each band starts and stops, which is four rows.
 */
export function ExposureSpread({ list }: { list: Play[] }) {
  if (!list.length) return null;

  const spread = exposureSpread(
    list.map((play) => ({
      id: play.artefact.id,
      label: play.artefact.label,
      exposure: play.exposure,
      band: play.band,
    })),
  );

  return (
    <Figure
      label="how the exposure is spread"
      diagram={(
        <figure className="govuk-!-margin-0">
          <Strip
            values={spread.values}
            cuts={spread.cuts}
            regions={spread.regions}
            label={`Every one of the ${list.length} plays at its exposure on a scale of 0 to 1, with the ${spread.cuts.length} band cuts marked. ${spread.caption} The same figures are available as a table.`}
          />
          <figcaption className="prt-caption">{spread.caption}</figcaption>
        </figure>
      )}
      table={(
        <Table
          caption="Where each band starts and stops"
          captionSize="s"
          scroll
          firstCellIsHeader
          columns={[
            { header: 'Band' },
            { header: 'Plays', numeric: true },
            { header: 'Lowest', numeric: true },
            { header: 'Highest', numeric: true },
          ]}
          rows={spread.spans.map((span) => [
            span.label,
            String(span.count),
            // A band nothing fell into has no lowest play, and printing "0.00"
            // would put a play at the bottom of the scale that does not exist.
            span.low === null ? <span className="prt-meta">none</span> : span.low.toFixed(2),
            span.high === null ? <span className="prt-meta">none</span> : span.high.toFixed(2),
          ])}
        />
      )}
    />
  );
}
