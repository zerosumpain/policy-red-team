import { useMemo, useState } from 'react';
import { BAND_LABEL, FACTOR_KEYS, type Play } from '$lib/policy-analysis/view';
import { EXPOSURE_FACTORS } from '$lib/policy-analysis/exposure';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Button } from '../../govuk';
import { isEmptyUnder, narrowExcept, type Selection } from '../selection';
import { EQUAL, isEqual, weightedExposure } from '../weighting';
import { PlayList } from '../PlayList';

/**
 * RANK BY WHAT YOU CARE ABOUT.
 *
 * The assessment weighs incentive, ease, impact and concealment equally. A
 * reader may not: somebody deciding where to spend enforcement effort cares
 * about ease, somebody writing a monitoring plan cares about concealment.
 *
 * THIS CHANGES THE READING ORDER AND NOTHING ELSE, and the control says so in
 * its own words. The assessment's own exposure stays printed on every play, so
 * a re-ranked list can always be checked against what the run recorded — which
 * is the guard against the obvious abuse, re-weighting until the answer you
 * came for reaches the top. `weighting.ts` holds the arithmetic and a test
 * proving it reproduces `exposureOf` exactly at equal weights.
 */

export function ThreatsLead({ list, selection, mechanismIds, linkTo }: {
  list: Play[];
  selection: Selection;
  /**
   * Passed in, never rebuilt here.
   *
   * This was `mechanismIdsOf([])` — an empty set — so `filterPlays` resolved
   * every mechanism selection to null and returned NOTHING. Carrying a
   * mechanism from Causality into this list is the stated reason the spine
   * exists, and it silently showed "0 plays" instead.
   */
  mechanismIds: Set<string>;
  /** Optional, exactly as on `Report`: a report rendered without links still renders. */
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
}) {
  const [weights, setWeights] = useState<Record<string, number>>(EQUAL);
  const isDefault = isEqual(weights);
  // The ranked list sets no selection of its own, so it narrows by all three.
  const shown = narrowExcept(list, selection, mechanismIds, 'band' as never);
  const empty = isEmptyUnder(list, selection, mechanismIds);

  /*
   * KEYED ON THE IDS, not on the array. `filterPlays` returns a fresh array
   * whenever a selection is active, so a dependency on `shown` changed identity
   * every render and the sort re-ran every time — the memo worked only in the
   * one case where the sort was already skipped.
   */
  const key = shown.map((p) => p.artefact.id).join(',');
  const ranked = useMemo(
    () => (isDefault ? shown : [...shown].sort((a, b) => weightedExposure(b, weights) - weightedExposure(a, weights))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `shown`
    [key, weights, isDefault],
  );

  if (!list.length) return null;

  return (
    <section aria-labelledby="weights">
      <h2 className="govuk-heading-l" id="weights">Rank by what you care about</h2>
      <p className="govuk-body">
        This changes the order you read in. It does not change the assessment, and the
        assessment&rsquo;s own exposure stays on every play.
      </p>

      <div className="prt-weights">
        {EXPOSURE_FACTORS.map(([key, description]) => (
          <div key={key} className="govuk-form-group">
            <label className="govuk-label" htmlFor={`weight-${key}`}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </label>
            <div className="govuk-hint">{description}</div>
            <input
              className="prt-range"
              id={`weight-${key}`}
              type="range"
              min={0}
              max={3}
              step={0.5}
              value={weights[key] ?? 1}
              onChange={(e) => setWeights({ ...weights, [key]: Number(e.currentTarget.value) })}
            />
            <output htmlFor={`weight-${key}`}>
              {weights[key] === 1 ? 'As the assessment weighs it' : `×${weights[key]}`}
            </output>
          </div>
        ))}
      </div>

      <Button variant="secondary" disabled={isDefault} onClick={() => setWeights(EQUAL)}>
        Reset to the assessment&rsquo;s ranking
      </Button>

      <h3 className="govuk-heading-m govuk-!-margin-top-6" id="ranked">
        {isDefault ? 'In the assessment’s own order' : 'In your order'}
      </h3>
      <p className="govuk-body-s prt-meta" role="status">
        {isDefault
          ? `${ranked.length} plays, ranked by the assessment’s exposure.`
          : `${ranked.length} plays, re-ranked. The assessment’s own exposure is printed on each one.`}
      </p>
      {empty ? <p className="govuk-body">Nothing under this selection.</p> : null}
      <PlayList
        plays={ranked}
        linkTo={linkTo}
        rank
        trailing={isDefault ? undefined : (play) => (
          <span className="prt-play__yours">
            <span className="govuk-visually-hidden">Your ranking </span>
            {weightedExposure(play, weights).toFixed(2)}
          </span>
        )}
      />
    </section>
  );
}
