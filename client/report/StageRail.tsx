import type { Rung } from '$lib/stage-rail';

/**
 * THE SCALE THE DRILL PRINTS THIRTY-THREE TIMES AND NEVER DRAWS.
 *
 * `Drill.tsx` says "produced at stage 11, exploitation playbook" under the h1,
 * and then prints a stage number beside every one of the 32 items in the
 * provenance ladder — "Universities actor profile — Profile, stage 5" — on a
 * scale the page has never shown. Eleven of what? The page never states that
 * there are eighteen.
 *
 * The structure was in the payload the whole time: `STAGES` has eighteen names
 * and `artefactMetadata` gives every one of the 2,296 artefacts a stage.
 *
 * NO ROUTER IMPORT, so this stays eligible for the offline pack later. It takes
 * stage numbers and set membership and renders spans; it knows nothing about
 * where an artefact lives.
 *
 * THREE THINGS THIS GETS RIGHT THAT THE OBVIOUS VERSION DOES NOT:
 *
 * 1. THE CITING SET IS UNCAPPED. `citedBy()` caps its `items` at
 *    `MAX_CITED_BY = 12` and returns `total` separately, so a set built from
 *    `cites.items` under-reports every time more than twelve things cite the
 *    artefact. The caller passes the stages of `all.filter(a => a.refs
 *    .includes(id))` instead — one pass over the inventory it already holds.
 * 2. A CELL IS A STAGE, NOT A STAGE THAT PRODUCED SOMETHING. Ordinal 11
 *    ("Cross-policy exposure") produced zero artefacts on the live run, and a
 *    rail that skipped it would renumber every stage after it.
 * 3. A PASS ARTEFACT HAS NO CELL. An addendum owns `PASS_BASE * n + k`, an
 *    ordinal in the hundreds, which is off the end of the rail — so the caller
 *    renders no rail at all there. A rail with nothing marked on it is worse
 *    than none, because the reader reads the absence as "stage 1".
 *
 * IT IS `aria-hidden`, AND THE CAPTION BESIDE IT CARRIES THE SAME THREE FACTS
 * IN WORDS. The alternative — eighteen list items, each with a visually-hidden
 * name and state — announces a wall before the artefact's own statement on a
 * page that already runs past 6,400px, and says nothing the sentence "Produced
 * at stage 11 of 18, exploitation playbook. Built from work at stages 2 to 5.
 * Nine stages cite it." does not. The picture is the second reading, not the
 * only one; that is also what print and a 320px screen get, where the rail is
 * hidden outright because eighteen cells across a phone is seventeen pixels
 * each.
 */
export function StageRail({ stages, own, sources, citing }: {
  /** The run's stage names, in order. `STAGES` from the contracts. */
  stages: readonly string[];
  /** The ordinal this page's artefact was produced at. */
  own: number;
  /** Ordinals the chain back from it reaches. */
  sources: ReadonlySet<number>;
  /** Ordinals of everything that cites it — uncapped. */
  citing: ReadonlySet<number>;
}) {
  if (!stages.length || own < 0 || own >= stages.length) return null;

  return (
    <ol className="prt-rail" aria-hidden="true">
      {stages.map((name, i) => {
        const marks = [
          i === own ? 'prt-rail__cell--own' : '',
          sources.has(i) ? 'prt-rail__cell--source' : '',
          citing.has(i) ? 'prt-rail__cell--citing' : '',
        ].filter(Boolean).join(' ');
        return (
          <li key={name} className={`prt-rail__cell${marks ? ` ${marks}` : ''}`}>
            {i + 1}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * THE WALK BACK, DRAWN ON THE SAME AXIS.
 *
 * "What it rests on" answered the question its own header comment says readers
 * could not answer — whether the lists were getting more fundamental or less —
 * with four sentences whose entire content was a stage range and a distance:
 * "It was written at stages 2 to 5 — from 9 stages earlier to 6 stages
 * earlier", then "stages 1 to 3", then "stages 1 to 2", then "stage 1". Four
 * restatements of an axis the page did not show.
 *
 * Drawn, the walk jumps backwards from the artefact's own stage and then
 * compresses onto the document, which is the shape a reader was being asked to
 * assemble from prose.
 *
 * SIZED ON A SHARED MAXIMUM, AND THAT IS THE CAPPED CASE TALKING. A play whose
 * walk hits `MAX_NODES` returns rungs of 9 / 118 / 173; scaling each band to
 * its own row would draw all three the same and hide the only interesting
 * thing about them. One maximum across the rungs keeps 9 visibly small.
 *
 * A BAND IS AN ANCHOR, not a button: the rung it points at is a heading on the
 * same page, so the browser's own `#fragment` does the work, survives a
 * keyboard, and leaves a place in the history the reader can come back from.
 */
export function ChainRail({ stages, own, rungs, rungId }: {
  stages: readonly string[];
  own: number;
  rungs: Rung[];
  /** The element id of a rung's heading, so a band can point at it. */
  rungId: (depth: number) => string;
}) {
  const drawable = rungs.filter((rung) => rung.low !== null && rung.high !== null);
  // One band is not a comparison, and the rung's own heading already says how
  // many items it holds. 89 of the exploit, finding and recommendation
  // artefacts on the live run have two or more rungs.
  if (!stages.length || drawable.length < 2) return null;
  const biggest = Math.max(...drawable.map((rung) => rung.count));

  return (
    <div className="prt-chainwalk">
      {/* The axis is labelled at both ends and at the artefact's own stage,
          because three labels is what fits and the ends are what a reader needs
          to place the middle. */}
      <p className="govuk-body-s prt-meta prt-chainwalk__axis">
        Step 1 on the left, step {stages.length} on the right. This was written at step{' '}
        {own + 1}.
      </p>
      <div className="prt-chainwalk__plot">
        <ol className="prt-chainwalk__rungs" style={{ ['--rail-cells' as string]: String(stages.length) }}>
          {drawable.map((rung) => {
            const low = rung.low as number;
            const high = rung.high as number;
            // A floor of a fifth, so a rung of nine against a rung of 173 is
            // still a band a reader can see and click rather than a hairline.
            const share = Math.max(0.2, rung.count / biggest);
            const words = `${rung.count} ${rung.count === 1 ? 'item' : 'items'}, stage${low === high ? ` ${low + 1}` : `s ${low + 1}–${high + 1}`}`;
            /*
             * A BAND SHORTER THAN ITS OWN LABEL CANNOT CARRY IT.
             *
             * The row is 2.75rem and the floor is a fifth of it, so the smallest
             * band is about 9px holding a 20px line — the label escapes its own
             * background and sets over the track. (That is NOT what produced the
             * contrast failure this was written next to; that was a specificity
             * defect in `_stagerail.scss`, measured and fixed there. This is the
             * separate problem visible in the same place.)
             *
             * Raising the floor would fix it by flattening the figure — a 5:1
             * spread compressed to under 2:1 — which is the encoding the rail
             * exists to draw. So the same answer `StackedBar` already gives: the
             * word shows where there is room for it, and the sentence is always
             * there for anyone not looking at the picture. 0.55 of 2.75rem is
             * 24px, which holds a 16px line.
             */
            const roomy = share >= 0.55;
            return (
              <li key={rung.depth} className="prt-chainwalk__row">
                <a
                  className="prt-chainwalk__band"
                  href={`#${rungId(rung.depth)}`}
                  style={{ gridColumn: `${low + 1} / ${high + 2}`, height: `${share * 100}%` }}
                >
                  {roomy ? <span className="prt-chainwalk__label" aria-hidden="true">{words}</span> : null}
                  <span className="govuk-visually-hidden">{words}</span>
                </a>
              </li>
            );
          })}
        </ol>
        {/* The artefact's own stage, as a rule down the whole stack — it is
            what every band is measured backwards from. */}
        <div className="prt-chainwalk__own" style={{ left: `${((own + 0.5) / stages.length) * 100}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}
