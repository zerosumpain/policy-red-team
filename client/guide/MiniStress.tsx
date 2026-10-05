import { useMemo, useState } from 'react';
import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';
import { STANDING_LABEL } from '$lib/stress-view';
import { Checkboxes } from '../govuk/Form';
import { ASSUMPTIONS, FINDINGS, PLAYS } from './content';
import { miniStress } from './stress-mini';

/**
 * CHAPTER 5: THE STRESS LAB IN MINIATURE.
 *
 * The same switches as "What if we are wrong" in a report — GOV.UK checkboxes,
 * small, one per assumption — run through the same two pure functions,
 * `stress` and `reading`, over the guide's four ways to beat it and one
 * conclusion. `miniStress` (tested) is the wiring; this is the drawing.
 *
 * THE TWO DIRECTIONS ARE DRAWN APART, as the report draws them. A way to beat
 * it that needed a switched-off assumption greys out, slides down and is
 * tagged "Taken off the table" in green — good news. The conclusion resting
 * on one is tagged "Nothing left supporting it" in red — not wrong, just no
 * longer supported. The motion is a single short transition, nothing loops,
 * and the tag says in words what the fade shows.
 */
export function MiniStress() {
  const [failed, setFailed] = useState<string[]>([]);
  const result = useMemo(() => miniStress(failed), [failed]);
  const name = (id: string) => ASSUMPTIONS.find((a) => a.id === id)?.label ?? id;

  return (
    <div className="prt-ministress">
      <div className="prt-ministress__switches">
        <Checkboxes
          id="guide-stress"
          name="guide-stress"
          small
          legend="Suppose this turns out to be false"
          legendSize="s"
          hint="Tick one or more."
          items={ASSUMPTIONS.map((a) => ({ value: a.id, text: a.label }))}
          values={failed}
          onChange={setFailed}
        />
      </div>

      <div className="prt-ministress__answer">
        <h2 className="govuk-heading-s">Ways to beat it</h2>
        <ul className="prt-ministress__list">
          {PLAYS.map((play) => {
            const off = result.disarmed.includes(play.id);
            const needs = (play.data.preconditions as string[]).map(name);
            return (
              <li key={play.id} className={`prt-ministress__item prt-ministress__item--${String(play.data.band)}${off ? ' is-off' : ''}`}>
                <p className="prt-ministress__title">{play.label}</p>
                <p className="govuk-body-s prt-ministress__meta">
                  <span className={`prt-band prt-band--${String(play.data.band)}`}>{BAND_LABEL[play.data.band as Band]}</span>{' '}
                  Needs: {needs.join('; ')}
                </p>
                {off ? <strong className="govuk-tag govuk-tag--green prt-ministress__tag">{STANDING_LABEL.disarmed}</strong> : null}
              </li>
            );
          })}
        </ul>

        <h2 className="govuk-heading-s">Conclusions</h2>
        <ul className="prt-ministress__list">
          {FINDINGS.map((finding) => {
            const standing = result.findings[finding.id] ?? 'holds';
            return (
              <li key={finding.id} className={`prt-ministress__item prt-ministress__item--finding${standing !== 'holds' ? ' is-lost' : ''}`}>
                <p className="prt-ministress__title">{finding.label}</p>
                <p className="govuk-body-s prt-ministress__meta">
                  Rests on: {(finding.data.hypothesisIds as string[]).map(name).join('; ')}
                </p>
                {standing !== 'holds' ? (
                  <strong className="govuk-tag govuk-tag--red prt-ministress__tag">{STANDING_LABEL[standing]}</strong>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="govuk-body prt-ministress__sum" aria-live="polite">{result.summary}</p>
    </div>
  );
}
