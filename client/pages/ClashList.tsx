import { Link } from 'react-router';
import type { Clash, ClashSide } from '$lib/policy-analysis/intel';

/**
 * TWO PAPERS THAT PUT THE SAME TWO BODIES IN OPPOSITE ORDER, side by side.
 *
 * Both sides are the papers' own graph edges, quoted where the graph stage
 * quoted the paper, and each opens the edge in its assessment — so a reader
 * checks the claim rather than trusting it. `findClashes` explains why this is
 * the only rule: a page that asserts conflicts it cannot show is worse than one
 * that shows nothing.
 *
 * Its own leaf module: the bodies page and a body's page both draw it, and
 * they are separate lazy chunks.
 */
export function ClashList({ clashes, headingLevel = 3 }: { clashes: Clash[]; headingLevel?: 3 | 4 }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <>
      {clashes.map((clash) => (
        <div key={`${clash.a.artefactId}-${clash.a.paper.id}-${clash.b.artefactId}-${clash.b.paper.id}`} className="govuk-!-margin-bottom-6">
          <Heading className="govuk-heading-s">{clash.bodyName} and {clash.otherName}</Heading>
          <p className="govuk-body">{clash.rule}</p>
          <div className="govuk-grid-row">
            <Side side={clash.a} />
            <Side side={clash.b} />
          </div>
        </div>
      ))}
    </>
  );
}

function Side({ side }: { side: ClashSide }) {
  return (
    <div className="govuk-grid-column-one-half">
      <p className="govuk-body govuk-!-margin-bottom-1">
        <Link className="govuk-link" to={`/assessments/${side.paper.id}`}>{side.paper.title}</Link>
      </p>
      <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">{side.words}</p>
      <blockquote className="govuk-inset-text govuk-!-margin-top-1">{side.quote}</blockquote>
      <p className="govuk-body-s">
        <Link className="govuk-link" to={`/assessments/${side.paper.id}/artefacts/${encodeURIComponent(side.artefactId)}`}>
          See where this comes from<span className="govuk-visually-hidden"> in {side.paper.title}</span>
        </Link>
      </p>
    </div>
  );
}

/** The rule, said once, in plain words — for both pages. */
export const CLASH_RULE = 'In one paper, one public body has power over another: it pays for it, commissions it, regulates it or appoints to it. In another paper, the first body reports to the second, or the second has that power over the first. Both have to be the same bodies on the GOV.UK list in both papers.';
