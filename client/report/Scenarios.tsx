import { scenarioTotals, type ScenarioView } from '$lib/scenario-view';
import { fieldLabel } from './ArtefactValue';
import type { ArtefactLink } from './Report';

/**
 * THE CONDITIONS THE POLICY HAS TO SURVIVE — Move 3, between the plays and the
 * stress lab.
 *
 * The run wrote eight `scenario` artefacts and the tracked view layer has
 * carried a renderer for them since it was copied: `scenarioBeats()` at
 * view.ts:450, under a nine-line comment arguing that a scenario rendered as a
 * paragraph "reads as an observation" while stepped through it "reads as the
 * thing it is". Grepped across client, src, server, tests and packages, the name
 * occurs exactly once — its own definition. Nothing has ever called it. What a
 * reader got instead is one write-up card headed "Scenarios" whose prose names
 * all eight in a single sentence, in the Verdict panel, nineteen cards down.
 *
 * Measured on assessment 36ebca37 that sentence stands in for 8 scenarios, 104
 * beats, 58 downstream effects and 100 references landing on 44 distinct pieces
 * of machinery and claims.
 *
 * EIGHT DISCLOSURES, NOT A GOV.UK ACCORDION. The accordion is the Design
 * System's pattern for exactly this shape and it is the wrong one here on two
 * counts: it sets `hidden="until-found"` on a closed section, which no
 * stylesheet can override, and it only collapses once its JavaScript has run —
 * and the offline pack is one `file://` document that has to be right before
 * anything runs. A native `<details>` needs neither. It does not print open by
 * itself either: `_beats.scss` carries the rule that opens it, because the one
 * in the base layer stopped working when Chromium moved the closed state into
 * `::details-content`. See the print block there for the measurement.
 *
 * HTML AND CSS, NO SVG, for the reason `EgoMap` and `PlayFlow` set out at
 * length: every beat here is a body of prose between 98 and 2,709 characters on
 * the real run, SVG cannot wrap text, and half the beats want to be links into
 * the drill. The step rail is a border and a ring drawn with `::before`, so it
 * reflows at 320px, prints, and scales with the reader's type size.
 */
export function Scenarios({ views, linkTo }: {
  /** Already shaped and ordered by `scenarioViews`; see `src/lib/scenario-view.ts`. */
  views: ScenarioView[];
  /**
   * Optional, exactly as on `Report`: the offline pack has no router in its
   * bundle, so a report rendered without links still renders every name.
   */
  linkTo?: ArtefactLink;
}) {
  if (!views.length) return null;
  const totals = scenarioTotals(views);

  return (
    <div className="prt-scenarios">
      <p className="govuk-body">
        The assessment did not pick one future. It wrote {totals.scenarios} conditions the
        policy would have to survive and followed each one through — {totals.effects} downstream
        effects between them, landing on {totals.outcomes} distinct pieces of the machinery and
        of what is claimed for it. Open one to read the sequence the record holds: what changes,
        who moves first, what follows, what it lands on, whether anyone would see it, and what
        would correct it.
      </p>

      <ul className="prt-scenarios__list">
        {views.map((view) => (
          <li key={view.artefact.id}>
            <details className="prt-scenario">
              {/*
                THE HEADING IS INSIDE THE SUMMARY, which is the accordion's own
                markup and is what the spec allows — summary takes heading
                content. It matters for two readers at once: a screen-reader user
                gets eight h3s to jump between rather than a row of buttons with
                no place in the outline, and the print rule that opens a
                disclosure hides its summary, so a name written anywhere else in
                here would vanish from the paper copy. `_beats.scss` puts the
                summary back for print; the heading is what makes that worth doing.
              */}
              <summary className="prt-scenario__summary">
                <h3 className="prt-scenario__name">{fieldLabel(view.key)}</h3>
                <span className="prt-scenario__gist">{view.gist}</span>
                <span className="prt-scenario__meta prt-meta">
                  {view.effects} downstream effect{view.effects === 1 ? '' : 's'}
                  {/*
                    "FIRST MOVER", NOT "MOVES FIRST". Three of the eight bodies
                    are plural — "Higher education providers moves first" is what
                    the tracked beat label says and is a wart this line does not
                    have to repeat, because a colon takes no verb.
                  */}
                  {view.firstActor ? ` · first mover: ${view.firstActor.label}` : ''}
                </span>
              </summary>

              <ol className="prt-beats">
                {view.segments.map((segment) => (
                  <li key={segment.key} className="prt-beat">
                    <p className="prt-beat__label">{segment.label}</p>

                    {segment.kind === 'effects' ? (
                      <>
                        <ol className="prt-beat__chain">
                          {segment.beats.map((beat) => <li key={beat.key}>{beat.body}</li>)}
                        </ol>
                        {/*
                          THE CAP IS SAID OUT LOUD. `scenarioBeats` slices the
                          effects at six, and on this run the chains are 7, 7, 7,
                          8, 8, 7, 7, 7 long — so EVERY one of the eight overruns
                          and ten of the 58 effects never reach the page. Losing
                          them silently under a heading that promises a sequence
                          is the defect; the count is fork-owned and said here
                          rather than fixed in the tracked view layer, which is a
                          verbatim copy of upstream.
                        */}
                        {view.hidden ? (
                          <p className="prt-beat__more prt-meta">
                            …and {view.hidden} more effect{view.hidden === 1 ? '' : 's'} the
                            record names.{' '}
                            {linkTo
                              ? <>They are on {linkTo(view.artefact, 'the scenario’s own record')}.</>
                              : 'The sequence draws six.'}
                          </p>
                        ) : null}
                      </>
                    ) : segment.key === 'outcomes' ? (
                      /*
                        THE REFERENCES, NOT THE JOINED STRING. `scenarioBeats`
                        builds this beat's body by joining the resolved labels
                        with " · " and hands the ids back on `refs` — so rendered
                        as prose it is a run of nine to eighteen names with
                        nothing to press. These are the machinery and the claims
                        the chain lands on and they are the reader's way from a
                        scenario into the rest of the report.
                      */
                      <ul className="prt-beat__refs">
                        {view.outcomes.map((outcome) => (
                          <li key={outcome.id}>{linkTo ? linkTo(outcome) : outcome.label}</li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        <p className="prt-beat__body">{segment.beat.body}</p>
                        {/*
                          Only where a link is on offer. Without one the chip
                          would repeat the name the beat's own label already
                          carries — "Government moves first" — which is what the
                          pack would have shown.
                        */}
                        {segment.key === 'first' && view.firstActor && linkTo ? (
                          <ul className="prt-beat__refs">
                            <li>{linkTo(view.firstActor)}</li>
                          </ul>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
