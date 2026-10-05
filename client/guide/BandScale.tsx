import { BAND_FILL, BAND_LABEL } from '$lib/policy-analysis/view';
import { bandStretches } from './content';

/** "from 0.5", or "below 0.3" for the bottom band, whose floor of 0 says nothing. */
const reach = (s: { from: number; to: number }) => (s.from === 0 ? `below ${s.to.toFixed(1)}` : `from ${s.from.toFixed(1)}`);


/**
 * THE FOUR BANDS AS STRETCHES OF ONE 0–1 SCALE — the key the guide's chapter 4
 * moves a marker along, and the static key the offline pack prints.
 *
 * ONE SVG FOR THE RAMP, AND HTML FOR EVERY WORD. The ramp is drawn with
 * `preserveAspectRatio="none"` so it fills any width, which would squash any
 * text inside it; the tick values and the band names are HTML positioned by
 * percentage, so they stay at the page's type size from 320px to 1280px. The
 * fills are `BAND_FILL` literals, not custom properties, for the reason that
 * table gives: an SVG `fill` attribute in the pack is not resolved against the
 * stylesheet's variables by every reader.
 *
 * THE WORDS ARE THE KEY, NOT THE COLOURS. The two light steps sit below 3:1
 * against the page (see `BAND_FILL`), so every stretch is outlined and the
 * legend under it names each band with its floor and what it means.
 */
export function BandScale({ score, legend = true, id }: {
  /** Where the marker sits, or none for a plain key. */
  score?: number;
  legend?: boolean;
  id: string;
}) {
  const stretches = bandStretches();
  const ticks = [0, ...stretches.slice(1).map((s) => s.from), 1];
  return (
    <div className="prt-bandscale">
      <div className="prt-bandscale__track">
        <svg className="prt-bandscale__ramp" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title`} focusable="false">
          <title id={`${id}-title`}>
            {`The four bands on a scale from 0 to 1: ${stretches.map((s) => `${BAND_LABEL[s.band].toLowerCase()} ${reach(s)}`).join(', ')}.`}
          </title>
          {stretches.map((s) => (
            <rect key={s.band} x={s.from * 100} y={0} width={(s.to - s.from) * 100} height={10} fill={BAND_FILL[s.band]} stroke="#0b0c0c" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {score === undefined ? null : (
          <span className="prt-bandscale__marker" style={{ left: `${Math.min(1, Math.max(0, score)) * 100}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="prt-bandscale__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="prt-bandscale__tick" style={{ left: `${t * 100}%` }}>{t === 0 || t === 1 ? t : t.toFixed(1)}</span>
        ))}
      </div>
      {legend ? (
        <dl className="prt-bandscale__legend">
          {[...stretches].reverse().map((s) => (
            <div key={s.band} className="prt-bandscale__row">
              <dt><span className={`prt-band prt-band--${s.band}`}>{BAND_LABEL[s.band]}</span> <span className="prt-meta">{reach(s)}</span></dt>
              <dd>{s.note}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
