import { BAND_FILL, BAND_LABEL, PLOT_SIZE, plotPoints, type Play } from '$lib/policy-analysis/view';
import { Table } from '../govuk';
import type { ArtefactLink } from './Report';
import { Figure } from './Figure';
import { BandKey } from './Metrics';

/**
 * Ease against impact, as a picture and as a table.
 *
 * THE TABLE IS NOT A FALLBACK. The accessibility statement commits to this: both
 * are ways of reading one thing, and the toggle is offered to everyone rather
 * than hidden behind assistive technology. A scatter plot answers "is anything up
 * in the top right" in a glance and answers "what exactly is play four" not at
 * all; the table is the other way round.
 *
 * The geometry comes from `plotPoints` in the copied core, so the picture and the
 * server agree about where a play sits without this file doing arithmetic.
 *
 * The TABLE carries the way into each play and the diagram does not, which makes
 * the accessible reading of this figure the more capable of the two rather than
 * the lesser. Links inside an SVG are reachable but poorly announced, and the
 * toggle is one keystroke away.
 */
export function ExposurePlot({ plays, linkTo }: { plays: Play[]; linkTo?: ArtefactLink }) {
  if (!plays.length) return null;
  const points = plotPoints(plays);

  return (
    <Figure
      label="ease against impact"
      diagram={(
        <figure className="govuk-!-margin-0">
          {/* 600 rather than 480: the plot is square, so it can only grow so far
              before it is taller than a screen — but at 480 in a 900px column
              forty-seven marks sat on top of each other in a third of the
              available room, which is the one thing a scatter plot must not do. */}
          <svg viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`} width="100%" style={{ maxWidth: 600 }} role="img"
               aria-label={`Scatter plot of ${plays.length} plays: how easy each is against how much damage it does. ${plays.filter((p) => p.band === 'severe').length} are in the severe band. The same figures are available as a table.`}>
            <rect x="0" y="0" width={PLOT_SIZE} height={PLOT_SIZE} fill="#f3f2f1" />
            <line x1="44" y1={PLOT_SIZE - 44} x2={PLOT_SIZE - 44} y2={PLOT_SIZE - 44} stroke="#505a5f" strokeWidth="1" />
            <line x1="44" y1="44" x2="44" y2={PLOT_SIZE - 44} stroke="#505a5f" strokeWidth="1" />
            <text x={PLOT_SIZE / 2} y={PLOT_SIZE - 12} textAnchor="middle" fontSize="13" fill="#0b0c0c">Easier to do →</text>
            <text x="14" y={PLOT_SIZE / 2} textAnchor="middle" fontSize="13" fill="#0b0c0c"
                  transform={`rotate(-90 14 ${PLOT_SIZE / 2})`}>More damage →</text>
            {points.map((point, i) => (
              <circle key={i} cx={point.x} cy={point.y} r="6"
                      fill={BAND_FILL[plays[i].band]} stroke="#0b0c0c" strokeWidth="1" />
            ))}
          </svg>
          {/* "Colour is its band" without saying which colour is which band is
              not a key. The table beside it carries the band as a word, so this
              is the reading for anyone looking at the picture. */}
          <BandKey />
          <figcaption className="govuk-body-s prt-meta">
            Each mark is one play. Colour is its band; position is how easy it is against how much
            it costs. Switch to the table for the figures.
          </figcaption>
        </figure>
      )}
      table={(
        <Table
          caption="Every play, by ease and impact"
          captionSize="s"
          scroll
          columns={[{ header: 'Play' }, { header: 'Band' }, { header: 'Ease', numeric: true }, { header: 'Impact', numeric: true }, { header: 'Exposure', numeric: true }]}
          rows={plays.map((play) => [
            linkTo ? linkTo(play.artefact) : play.artefact.label,
            BAND_LABEL[play.band],
            (play.factors.find((f) => f.key === 'ease')?.value ?? 0).toFixed(2),
            (play.factors.find((f) => f.key === 'impact')?.value ?? 0).toFixed(2),
            play.exposure.toFixed(2),
          ])}
        />
      )}
    />
  );
}
