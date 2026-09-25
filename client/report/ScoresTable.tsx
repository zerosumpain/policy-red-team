import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import { Table } from '../govuk';
import type { ArtefactLink } from './Report';

/**
 * EVERY WAY TO BEAT IT, SCORED ON THE FOUR THINGS THAT MAKE IT WORK.
 *
 * This was the table half of the "Ease against impact" scatter. Phase 19 cut
 * the scatter: on the real assessment 38 of its 47 marks sat in one clump,
 * so the picture said one thing — "most of them are fairly easy and fairly
 * damaging" — and said it less exactly than a sentence. The table stays,
 * because it is the only place in the report that prints each play's four
 * scores side by side, which the "rank by what you care about" control above
 * it invites a reader to weigh.
 *
 * The sort keys are the numbers, not the printed strings: "0.9" sorts above
 * "0.72" as text, and the first cell is a link with no text to read.
 */
export function ScoresTable({ plays, linkTo }: { plays: Play[]; linkTo?: ArtefactLink }) {
  if (!plays.length) return null;
  const factor = (play: Play, key: string) => play.factors.find((f) => f.key === key)?.value ?? 0;
  const value = (v: number) => v.toFixed(2);
  return (
    <Table
      caption="Every way to beat it, by the four scores"
      captionSize="s"
      scroll
      defaultOrder="the assessment's own ranking, worst first"
      columns={[
        /* An explicit width for paper, where the print block fixes the table
           layout and seven equal columns set a title one word per line. */
        { header: 'Way to beat it', width: '26%', sortable: true, order: { asc: 'A to Z', desc: 'Z to A' } },
        { header: 'How exposed' },
        { header: 'Motive', numeric: true, sortable: true, order: { asc: 'weakest first', desc: 'strongest first' } },
        { header: 'Ease', numeric: true, sortable: true, order: { asc: 'hardest first', desc: 'easiest first' } },
        { header: 'Damage', numeric: true, sortable: true, order: { asc: 'least damaging first', desc: 'most damaging first' } },
        { header: 'Hard to see', numeric: true, sortable: true, order: { asc: 'most visible first', desc: 'hardest to see first' } },
        { header: 'Score', numeric: true, sortable: true, order: { asc: 'lowest first', desc: 'worst first' } },
      ]}
      rows={plays.map((play) => [
        linkTo ? linkTo(play.artefact) : play.artefact.label,
        BAND_LABEL[play.band],
        value(factor(play, 'incentive')),
        value(factor(play, 'ease')),
        value(factor(play, 'impact')),
        value(factor(play, 'concealment')),
        value(play.exposure),
      ])}
      sortKeys={plays.map((play) => [
        play.artefact.label,
        play.band,
        factor(play, 'incentive'),
        factor(play, 'ease'),
        factor(play, 'impact'),
        factor(play, 'concealment'),
        play.exposure,
      ])}
    />
  );
}
