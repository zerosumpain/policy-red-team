import { useEffect, useId, useRef, useState } from 'react';
import { BAND_LABEL } from '$lib/policy-analysis/view';
import { BandScale } from './BandScale';
import { bandFor, FACTORS, factorWords, leadFactors, type FactorKey, type Factors } from './content';

/**
 * CHAPTER 4: FOUR SLIDERS, THE REPORT'S OWN ARITHMETIC.
 *
 * Every number on this screen comes from `exposureOf` and `bandOf` in the
 * pipeline (`$lib/policy-analysis/exposure`), through `bandFor` in the
 * content model. The sliders start on chapter 3's play, so the reader begins
 * from a card they have just read and can see why it was severe — and what
 * would have made it moderate.
 *
 * GOV.UK HAS NO SLIDER, so this is a NATIVE `input type=range` — the browser's
 * own keyboard (arrows, Page Up/Down, Home/End), its own screen-reader role —
 * with a visible label and hint as GOV.UK form fields have, an
 * `aria-valuetext` that says the value in words, and a NUMBER BOX beside each
 * one carrying the same value. The box is the value text a sighted reader
 * reads, and the way in for anyone who cannot drag: type 0.35 and press Tab.
 *
 * THE BAND CHANGE IS ANNOUNCED POLITELY AND ONLY WHEN IT CHANGES. Reading the
 * score out on every arrow press would talk over the slider's own value; the
 * band moving is the news, so the live region speaks then and only then.
 */
export function BuildBand() {
  const [factors, setFactors] = useState<Factors>(leadFactors);
  const [said, setSaid] = useState('');
  const result = bandFor(factors);
  const last = useRef(result.band);
  const id = useId();

  useEffect(() => {
    if (last.current === result.band) return;
    last.current = result.band;
    setSaid(`The band is now ${BAND_LABEL[result.band].toLowerCase()}. Score ${result.exposure.toFixed(2)}.`);
  }, [result.band, result.exposure]);

  const set = (key: FactorKey, value: number) => {
    if (!Number.isFinite(value)) return;
    setFactors((f) => ({ ...f, [key]: Math.min(1, Math.max(0, Math.round(value * 100) / 100)) }));
  };

  return (
    <div className="prt-buildband">
      <div className="prt-buildband__controls">
        {FACTORS.map((factor) => {
          const fieldId = `${id}-${factor.key}`;
          return (
            <div key={factor.key} className="govuk-form-group prt-factor">
              <label className="govuk-label govuk-label--s" htmlFor={fieldId}>{factor.label}</label>
              <div className="govuk-hint" id={`${fieldId}-hint`}>{factor.hint}</div>
              <div className="prt-factor__row">
                <input
                  className="prt-range"
                  type="range"
                  id={fieldId}
                  min={0}
                  max={1}
                  step={0.05}
                  value={factors[factor.key]}
                  aria-describedby={`${fieldId}-hint`}
                  aria-valuetext={factorWords(factors[factor.key], factor)}
                  onChange={(e) => set(factor.key, Number(e.target.value))}
                />
                <label className="govuk-visually-hidden" htmlFor={`${fieldId}-n`}>{factor.label} — as a number from 0 to 1</label>
                <NumberBox id={`${fieldId}-n`} value={factors[factor.key]} onCommit={(v) => set(factor.key, v)} />
              </div>
              <p className="prt-factor__ends" aria-hidden="true">
                <span>0 · {factor.low}</span>
                <span>{factor.high} · 1</span>
              </p>
            </div>
          );
        })}
        <button type="button" className="prt-linkbutton" onClick={() => setFactors(leadFactors())}>
          Put the sliders back on the breakfast-club example
        </button>
      </div>

      <div className="prt-buildband__result">
        <p className="govuk-body govuk-!-margin-bottom-1">This way to beat it would be</p>
        <p className="prt-buildband__band">
          <span className={`prt-band prt-band--${result.band} prt-buildband__mark`}>{BAND_LABEL[result.band]}</span>{' '}
          <span className="prt-buildband__score">score {result.exposure.toFixed(2)}</span>
        </p>
        <BandScale id={`${id}-scale`} score={result.exposure} legend={false} />
        <p className="govuk-body-s govuk-!-margin-top-3">{result.note}</p>
        <p className="govuk-body-s prt-meta">
          The score is the geometric mean of the four: multiply them, then take the fourth root. A
          zero anywhere but &ldquo;how hard to spot&rdquo; makes it zero.
        </p>
      </div>

      <p className="govuk-visually-hidden" aria-live="polite">{said}</p>
    </div>
  );
}

/**
 * THE NUMBER BOX, WHICH LETS A READER TYPE A HALF-FINISHED VALUE.
 *
 * Bound straight to the factor, typing "0." would be parsed as 0 and rewritten
 * under the cursor. So it holds its own text while it has focus and commits on
 * every change that parses inside 0–1, and on blur puts back the value the
 * score is actually using — which is always the one the slider shows.
 */
function NumberBox({ id, value, onCommit }: { id: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="govuk-input govuk-input--width-3 prt-factor__number"
      type="number"
      id={id}
      min={0}
      max={1}
      step={0.05}
      inputMode="decimal"
      value={text ?? value.toFixed(2)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 1) onCommit(v);
      }}
      onBlur={() => setText(null)}
    />
  );
}
