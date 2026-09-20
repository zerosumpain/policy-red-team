import { cx } from '../govuk';

/**
 * THE WHOLE RELATION VOCABULARY, WITH THE UNUSED HALF STILL ON THE PAGE.
 *
 * The standfirst above this figure read "Twenty-six relation types the contract
 * defines, folded into the seven questions a reader actually arrives with", and
 * the chart beneath it drew FOUR bars. `panels()` in the tracked core ends
 * `.filter((p) => p.count > 0)`, so Delivery and data, Influence and Dependence
 * were dropped for being empty, without a word.
 *
 * THOSE THREE ARE THE STRONGEST READING IN THE MOVE. Delivery and data holds
 * `delivers`, `supplies_data_to`, `owns_data` and `is_measured_by`; Dependence
 * holds `depends_on`, `is_exposed_to`, `can_adapt` and `assumes`. All eight are
 * zero, in a move whose question is "why is any of it possible" — the paper
 * wires nothing about who does the work, nothing about what anything is measured
 * on, and nothing about what has to hold for a body to do its part. A chart that
 * deletes an empty category reports the absence as a success.
 *
 * SO AN UNUSED RELATION IS A MARK RATHER THAN A GAP. Each family's relations are
 * chips; a used one carries its count, an unused one is flat with a dashed
 * border and the words "never stated". Three complete rows come out all-dashed,
 * and that is the reading. The chip is deliberately the same object as
 * `.prt-legality` — a word in a 1px box — because both are saying "this is a
 * category, not a score", and the one thing neither may become is a colour ramp.
 *
 * A LIST, NOT AN IMAGE WITH A LABEL, which is what every bar list in this build
 * now is. `role="img"` on a `<ul>` is not an allowed role and takes the list
 * semantics off every item under it; and the content here is twenty-six words
 * and their counts, so read straight it IS the figure. Only the bar track, which
 * says nothing the count beside it does not, is hidden.
 */

export type VocabularyRelation = {
  relation: string;
  /** `relationWords()` — "receives benefit from", not `receives_benefit_from`. */
  words: string;
  count: number;
};

export type VocabularyFamily = {
  key: string;
  label: string;
  /** The family's own sentence from the glossary — what question it answers. */
  what: string;
  count: number;
  colour: string;
  relations: VocabularyRelation[];
};

export function VocabularyGrid({ families, total, caption }: {
  families: VocabularyFamily[];
  /** What the percentages are of — passed in for the reason `BarChart` documents. */
  total: number;
  caption: string;
}) {
  if (!families.length) return null;
  const peak = Math.max(0, ...families.map((family) => family.count));

  return (
    <figure className="prt-vocab govuk-!-margin-0">
      <ul className="prt-vocab__list">
        {families.map((family) => (
          <li key={family.key} className="prt-vocab__family">
            <div className="prt-nodebar">
              <span className="prt-vocab__name">
                <strong>{family.label}</strong>
                <span className="prt-vocab__what">{family.what}</span>
              </span>
              {/* The bar is the only part of the row a screen reader gains
                  nothing from: the count beside it is the same fact in words. */}
              <span className="prt-nodebar__bar" aria-hidden="true">
                {family.count ? (
                  <span
                    className="prt-nodebar__seg"
                    style={{ width: `${peak > 0 ? (family.count / peak) * 100 : 0}%`, background: family.colour }}
                  />
                ) : null}
              </span>
              <span className="prt-nodebar__n">
                <strong>{family.count}</strong>
                {total ? ` · ${Math.round((family.count / total) * 100)}%` : ''}
              </span>
            </div>
            <ul className="prt-vocab__chips">
              {family.relations.map((relation) => (
                <li
                  key={relation.relation}
                  className={cx('prt-vocab__chip', !relation.count && 'prt-vocab__chip--unused')}
                >
                  {relation.words}{' '}
                  {relation.count
                    ? <span className="prt-vocab__n">{relation.count}</span>
                    /* An em dash, because "commissions never stated" reads as
                       one four-word phrase and the chip is meant to say a
                       relation and then its verdict on it. */
                    : <span className="prt-vocab__never">&mdash; never stated</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <figcaption className="govuk-body-s prt-meta">{caption}</figcaption>
    </figure>
  );
}
