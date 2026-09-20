import { BAND_FILL, BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import type { Band } from '$lib/policy-analysis/exposure';
import {
  BAND_RADIUS, BAND_SHAPE, BAND_STROKE, PLOT_BOX, plotFrame, plotPlays,
  type MarkShape, type PlotPoint,
} from '$lib/exposure-plot';
import { Table } from '../govuk';
import type { ArtefactLink } from './Report';
import { Figure } from './Figure';

/**
 * Ease against impact, as a picture and as a table.
 *
 * THE TABLE IS NOT A FALLBACK. The accessibility statement commits to this:
 * both are ways of reading one thing, and the toggle is offered to everyone
 * rather than hidden behind assistive technology. A scatter plot answers "is
 * anything up in the top right" in a glance and answers "what exactly is play
 * four" not at all; the table is the other way round. The TABLE also carries
 * the way into each play and the diagram does not, which makes the accessible
 * reading of this figure the more capable of the two rather than the lesser.
 * Links inside an SVG are reachable but poorly announced, and the toggle is one
 * keystroke away.
 *
 * THE GEOMETRY MOVED OUT, to `$lib/exposure-plot`, and it is no longer
 * `plotPoints` from the copied core. Four things were wrong with the drawing at
 * once and all four were arithmetic — a 360-unit box rendered at 600px so every
 * mark was 20px and every caption 21.7px; a fixed [0,1] domain on data that
 * runs 0.20–0.90 and 0.01–0.72; no ticks; and three pairs of plays sitting on
 * one coordinate. The fork-own module has a test for each of them. `plotPoints`
 * is untouched and still correct for anything that wants the cross-run domain.
 *
 * SIZE IS NOT AN EXPOSURE ENCODING HERE, and that is a decision rather than an
 * omission. `plotPoints` returns `r = 8 + play.exposure * 16` and the core's
 * `BAND_INK` docstring claims every mark is "sized by band"; measured on this
 * run, passing that `r` through takes the overlapping pairs from 53 to 413, and
 * `corr(exposure, impact) = 0.957` — mark area would be a 96%-faithful
 * restatement of the mark's own height. The size channel is spent on the band
 * instead, in four steps, where it agrees with the shape.
 */
export function ExposurePlot({ plays, linkTo, selected }: {
  plays: Play[];
  linkTo?: ArtefactLink;
  /**
   * The plays under the reader's current selection, where the caller has one.
   *
   * THE SELECTION IS DRAWN IN CONTEXT RATHER THAN CUTTING THE DATA. A mechanism
   * selection that filters the array leaves a six-mark cloud with no sense of
   * where those six sit among the forty-seven, which is the only thing a
   * scatter is for. Excluded plays stay on the page as small grey rings behind
   * everything else. Absent, every play is selected and nothing is greyed.
   */
  selected?: Set<string>;
}) {
  if (!plays.length) return null;
  const frame = plotFrame(plotPlays(plays));
  const inScope = (id: string) => !selected || selected.has(id);
  const chosen = frame.points.filter((point) => inScope(point.play.id));
  const narrowed = Boolean(selected) && chosen.length !== frame.points.length;

  /*
   * THE COUNT THE PICTURE WAS DRAWN TO GIVE, IN THE CAPTION AND IN THE LABEL.
   *
   * The docstring said the figure "answers 'is anything up in the top right' in
   * a glance" and the caption said only that colour was band and position was
   * ease against cost. Computed on this run the answer is 32 of 47 — two thirds
   * of the playbook is both easy and damaging, which is the most alarming
   * single fact in Move 3 and appeared nowhere on the page. Computed, never
   * written down, so it stays true under a narrowed selection.
   */
  const shifted = frame.points.filter((point) => point.shifted !== 0).length;
  const quadrant = `${frame.quadrant.both} of the ${frame.quadrant.total} plays are both easy and damaging — above halfway on each axis. ${frame.quadrant.hard} are above 0.7 for ease and 0.6 for impact.`;

  const extremes = frame.extremes;
  const ringed = extremes ? [extremes.ease, extremes.impact] : [];

  const axis = (v: number) => v.toFixed(1);
  const value = (v: number) => v.toFixed(2);

  return (
    <Figure
      label="ease against impact"
      diagram={(
        <figure className="govuk-!-margin-0 prt-plot">
          {/*
            720 UNITS DRAWN AT 720px, so a user unit is a CSS pixel and a font
            size means what it says. It was 360 units pinned to `maxWidth: 600`
            — a scale of 1.667 — which is the whole of the old overlap problem:
            `r="6"` painted a 20px circle and `fontSize="13"` painted 21.7px
            type, larger than the 19px body text around it. The old comment
            blamed the rendered width for the overlap and was wrong, because an
            SVG scales uniformly and cannot change relative overlap at all.
          */}
          <svg viewBox={`0 0 ${PLOT_BOX} ${PLOT_BOX}`} width="100%" style={{ maxWidth: PLOT_BOX }} role="img"
               aria-label={[
                 `Scatter plot of ${frame.quadrant.total} plays, how easy each is against how much damage it does.`,
                 quadrant,
                 narrowed ? `${chosen.length} of them are under the current selection; the rest are drawn as small grey rings.` : '',
                 'The same figures are available as a table, with a way into every play.',
               ].filter(Boolean).join(' ')}>
            <rect x="0" y="0" width={PLOT_BOX} height={PLOT_BOX} fill="#f3f2f1" />

            {/* A POSITION IS A VALUE, AND UNTIL NOW NOTHING SAID SO. Two bare
                axis lines with two words on them: a mark three quarters of the
                way across could not be read as 0.72 by anybody. The gridlines
                come off the same arithmetic the marks do, so a tick and a mark
                cannot disagree. */}
            {frame.ticks.x.map((tick) => (
              <line key={`gx${tick.value}`} x1={tick.at} y1={frame.area.top} x2={tick.at} y2={frame.area.top + frame.area.height}
                    stroke="#b1b4b6" strokeWidth="1" />
            ))}
            {frame.ticks.y.map((tick) => (
              <line key={`gy${tick.value}`} x1={frame.area.left} y1={tick.at} x2={frame.area.left + frame.area.width} y2={tick.at}
                    stroke="#b1b4b6" strokeWidth="1" />
            ))}

            {/* HALFWAY ON EACH AXIS, DASHED, at the value 0.5 and not at the
                middle of the canvas — which is where a cross drawn at
                `PLOT_SIZE / 2` lands the moment the domain is fitted. Dashed so
                it reads as a threshold rather than as one more gridline. */}
            {frame.cross.x !== null ? (
              <line x1={frame.cross.x} y1={frame.area.top} x2={frame.cross.x} y2={frame.area.top + frame.area.height}
                    stroke="#505a5f" strokeWidth="2" strokeDasharray="6 5" />
            ) : null}
            {frame.cross.y !== null ? (
              <line x1={frame.area.left} y1={frame.cross.y} x2={frame.area.left + frame.area.width} y2={frame.cross.y}
                    stroke="#505a5f" strokeWidth="2" strokeDasharray="6 5" />
            ) : null}

            {/* ONE QUADRANT IS LABELLED, NOT FOUR. Two of the four corners are
                where the cloud is, so a label there lands on the marks; and
                three of the four are not a question anybody brought to this
                page. The domain's 5% padding is what guarantees the strip of
                clear plot this sits in — measured on this run the nearest mark
                is 53 units below it. */}
            {frame.cross.x !== null && frame.cross.y !== null ? (
              <text x={frame.area.left + frame.area.width - 4} y={frame.area.top + 16} textAnchor="end"
                    fontSize="13" fontWeight="700" fill="#0b0c0c">
                Easy and damaging — {frame.quadrant.both} of {frame.quadrant.total}
              </text>
            ) : null}

            <line x1={frame.area.left} y1={frame.area.top + frame.area.height}
                  x2={frame.area.left + frame.area.width} y2={frame.area.top + frame.area.height}
                  stroke="#505a5f" strokeWidth="1" />
            <line x1={frame.area.left} y1={frame.area.top} x2={frame.area.left} y2={frame.area.top + frame.area.height}
                  stroke="#505a5f" strokeWidth="1" />

            {frame.ticks.x.map((tick) => (
              <text key={`tx${tick.value}`} x={tick.at} y={frame.area.top + frame.area.height + 22} textAnchor="middle"
                    fontSize="12" fill="#505a5f">{axis(tick.value)}</text>
            ))}
            {frame.ticks.y.map((tick) => (
              <text key={`ty${tick.value}`} x={frame.area.left - 8} y={tick.at + 4} textAnchor="end"
                    fontSize="12" fill="#505a5f">{axis(tick.value)}</text>
            ))}

            <text x={frame.area.left + frame.area.width / 2} y={PLOT_BOX - 16} textAnchor="middle" fontSize="15" fill="#0b0c0c">
              Easier to do →
            </text>
            <text x="18" y={frame.area.top + frame.area.height / 2} textAnchor="middle" fontSize="15" fill="#0b0c0c"
                  transform={`rotate(-90 18 ${frame.area.top + frame.area.height / 2})`}>
              More damage →
            </text>

            {/* OUT OF SCOPE, STILL ON THE PAGE. Drawn first and in one flat
                grey, so the selection is read against the whole run rather than
                instead of it. */}
            {narrowed ? frame.points.filter((point) => !inScope(point.play.id)).map((point) => (
              <circle key={`out-${point.play.id}`} cx={point.x} cy={point.y} r="4" fill="none" stroke="#b1b4b6" strokeWidth="1" />
            )) : null}

            {/*
              PAINTED ASCENDING BY EXPOSURE, which is the single most important
              line in this component. `plays()` sorts DESCENDING and the old
              code mapped it straight into the DOM, so the severe marks were
              drawn first and every lighter mark landed on top of them: 16 of
              the 20 severe marks were painted over. `plotFrame` returns the
              points already in paint order.
            */}
            {chosen.map((point) => (
              <Mark key={point.play.id} point={point}>
                <title>
                  {point.play.label} — {BAND_LABEL[point.play.band]}, ease {value(point.play.ease)}, impact {value(point.play.impact)}
                  {point.shifted ? ' (drawn half a mark off a shared position)' : ''}
                </title>
              </Mark>
            ))}

            {/* THE TWO EXTREMES ARE RINGED, NOT LABELLED. A leader line to a
                text label needs to know how wide the text is, and SVG will not
                say — measured on this run, a 46-character label hung off the
                furthest-right mark runs straight back through the densest part
                of the cloud. The halo is geometry, the names are in the caption
                below in HTML where they wrap and scale with the reader, and
                every mark carries its own name in a `<title>` anyway. */}
            {ringed.filter((point) => inScope(point.play.id)).map((point) => (
              <circle key={`ring-${point.play.id}`} cx={point.x} cy={point.y} r={point.r + 6}
                      fill="none" stroke="#0b0c0c" strokeWidth="1" strokeDasharray="3 3" />
            ))}
          </svg>

          <MarkKey />

          <figcaption className="govuk-body-s prt-meta">
            {quadrant}{' '}
            {extremes ? (
              <>
                The two ringed marks are the furthest right, “{extremes.ease.play.label}”, and the
                highest, “{extremes.impact.play.label}”.{' '}
              </>
            ) : null}
            Each mark is one play: its shape and size are the band, its position is how easy the play
            is against how much damage it does.{' '}
            {shifted ? `${shifted} marks share a position exactly with another play and are drawn half a mark either side of the value they share; ` : ''}
            {frame.overlap.marks} of the marks touch another.{' '}
            {narrowed ? `${chosen.length} are under the current selection; the rest are small grey rings. ` : ''}
            Switch to the table for every figure, and for the way into each play.
          </figcaption>
        </figure>
      )}
      table={(
        <Table
          caption="Every play, by the four judgements"
          captionSize="s"
          scroll
          defaultOrder="the assessment's own ranking, worst first"
          /*
           * FOUR JUDGEMENTS, NOT TWO. The weights panel above invites a reader
           * to triple the weight on concealment, and until now the report
           * printed no play's concealment anywhere — `incentive` and
           * `concealment` appeared at exactly three places in the whole report
           * and all three were prose. On this run the four are nowhere near
           * interchangeable: incentive 0.02–0.82, ease 0.20–0.90, impact
           * 0.01–0.72, concealment 0.05–0.86.
           *
           * Full words as headers, because Incentive and Impact share an
           * initial.
           */
          columns={[
            /* AN EXPLICIT WIDTH FOR PAPER. The print block sets `table-layout:
               fixed` on a scrolling table, because there is no scrollbar on a
               sheet and `overflow-x: auto` simply clips — so seven columns
               divided the page into sevenths and set a 46-character play title
               in a 123px column, one word per line. Fixed layout honours a
               stated width and divides what is left; on screen, where the
               layout is automatic, it is a hint the browser is free to beat. */
            { header: 'Play', width: '26%', sortable: true, order: { asc: 'A to Z', desc: 'Z to A' } },
            { header: 'Band' },
            { header: 'Incentive', numeric: true, sortable: true, order: { asc: 'weakest first', desc: 'strongest first' } },
            { header: 'Ease', numeric: true, sortable: true, order: { asc: 'hardest first', desc: 'easiest first' } },
            { header: 'Impact', numeric: true, sortable: true, order: { asc: 'least damaging first', desc: 'most damaging first' } },
            { header: 'Concealment', numeric: true, sortable: true, order: { asc: 'most visible first', desc: 'hardest to see first' } },
            { header: 'Exposure', numeric: true, sortable: true, order: { asc: 'lowest first', desc: 'worst first' } },
            ...(narrowed ? [{ header: 'Under this selection' as const }] : []),
          ]}
          rows={plays.map((play) => [
            linkTo ? linkTo(play.artefact) : play.artefact.label,
            BAND_LABEL[play.band],
            value(factor(play, 'incentive')),
            value(factor(play, 'ease')),
            value(factor(play, 'impact')),
            value(factor(play, 'concealment')),
            value(play.exposure),
            ...(narrowed ? [inScope(play.artefact.id) ? 'Yes' : '—'] : []),
          ])}
          /*
           * THE SORT KEYS ARE THE NUMBERS, NOT THE PRINTED STRINGS. "0.9" sorts
           * above "0.72" as text, and the first cell is a link element with no
           * text to read at all.
           */
          sortKeys={plays.map((play) => [
            play.artefact.label,
            play.band,
            factor(play, 'incentive'),
            factor(play, 'ease'),
            factor(play, 'impact'),
            factor(play, 'concealment'),
            play.exposure,
            ...(narrowed ? [inScope(play.artefact.id) ? 1 : 0] : []),
          ])}
        />
      )}
    />
  );
}

const factor = (play: Play, key: string) => play.factors.find((f) => f.key === key)?.value ?? 0;

/**
 * ONE MARK, WHOSE SHAPE IS ITS BAND.
 *
 * Hard constraint 5 says colour is never the only signal, and on this figure it
 * was: every mark was `r="6"` in `BAND_FILL` with the same hairline, and the
 * key beside it used the same four colours as squares. Measured against the
 * plot's own `#f3f2f1` ground the ramp is 12.02:1, 5.55:1, 2.30:1 and 1.23:1,
 * and moderate against limited — the discrimination actually being asked of the
 * reader — is 1.87:1. That is not a four-way call at any mark size.
 *
 * So band is shape first, size second, outline weight third, fill fourth. The
 * limited mark is drawn hollow because its fill is the 1.23:1 one: there is
 * nothing to lose by leaving it out and a mark underneath to be gained by it.
 *
 * FILLS ARE FULLY OPAQUE. The sibling proposal was `fill-opacity: 0.7` so that
 * stacked marks read as stacked rings, and measured on this run there is
 * nothing for it to fix — with the fitted domain and these radii, ZERO marks
 * are entirely inside another, so every overlap already shows both outlines.
 * Dropping the fill to 70% would have cost the ramp real contrast to solve a
 * case that does not occur.
 */
const MARK_FILL: Record<Band, string> = { ...BAND_FILL, limited: 'none' };

function shapeAt(shape: MarkShape, x: number, y: number, r: number) {
  switch (shape) {
    // Equal-ish area to the circle of the same radius, so the four steps read
    // as four sizes rather than as four shapes of accidentally different bulk.
    case 'square': {
      const half = r * 0.886;
      return <rect x={x - half} y={y - half} width={half * 2} height={half * 2} />;
    }
    case 'diamond': {
      const arm = r * 1.253;
      return <polygon points={`${x},${y - arm} ${x + arm},${y} ${x},${y + arm} ${x - arm},${y}`} />;
    }
    default:
      return <circle cx={x} cy={y} r={r} />;
  }
}

function Mark({ point, children }: { point: PlotPoint; children?: React.ReactNode }) {
  return (
    <g fill={MARK_FILL[point.play.band]} stroke="#0b0c0c" strokeWidth={point.stroke}>
      {/* FIRST CHILD, because that is where SVG says a `<title>` goes and
          where every browser looks for the tooltip. It is not the accessible
          reading and must not be claimed as one: the parent `<svg
          role="img">` prunes its descendants from the accessibility tree, so
          the `aria-label` and the table stay the announced versions. */}
      {children}
      {shapeAt(point.shape, point.x, point.y, point.r)}
    </g>
  );
}

/**
 * The key, drawn in the marks the plot actually uses.
 *
 * `BandKey` draws four coloured squares and is right for the stacked bars,
 * where colour IS the only thing distinguishing a segment and the segment is
 * always a rectangle. Here a key in four colours and one shape would teach the
 * reader the wrong vocabulary for the figure beside it.
 */
function MarkKey() {
  const bands: Band[] = ['severe', 'significant', 'moderate', 'limited'];
  return (
    <p className="prt-bandkey prt-plot__key">
      {bands.map((band) => (
        <span key={band} className="prt-bandkey__item">
          <svg className="prt-plot__swatch" viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" focusable="false">
            <g fill={MARK_FILL[band]} stroke="#0b0c0c" strokeWidth={BAND_STROKE[band]}>
              {shapeAt(BAND_SHAPE[band], 11, 11, BAND_RADIUS[band])}
            </g>
          </svg>
          {BAND_LABEL[band]}
        </span>
      ))}
    </p>
  );
}
