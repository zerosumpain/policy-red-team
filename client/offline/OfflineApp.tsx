import type { OfflinePayload } from '$lib/policy-analysis/offline/payload';
import type { Detail } from '../api';
import { Report } from '../report/Report';
import { InsetText, Tag, type TagColour } from '../govuk';
import { statusColour, statusLabel } from '../status';

/**
 * The pack's page — the same report, with no server behind it.
 *
 * It renders `<Report>`, not a second implementation of it. The report was
 * already written to take data and nothing else, so the only work here is
 * shaping the payload into what it expects. A separate offline renderer would be
 * a second thing to keep in step, and the one thing worse than a report that is
 * hard to read is two reports that disagree.
 *
 * The payload carries no `stages` array — only the warnings the stages produced
 * — so the stage list is reconstructed from what is there. The report uses it
 * for one figure and the provenance table, and both are about what happened
 * rather than about what is still to come.
 */
export function OfflineApp({ payload }: { payload: OfflinePayload }) {
  const detail: Detail = {
    analysis: {
      id: 'offline',
      title: payload.title,
      status: payload.status,
      createdAt: payload.generatedAt,
      completedAt: payload.completedAt,
      jurisdiction: payload.jurisdiction,
      policyArea: payload.policyArea,
      model: null,
      thinkingLevel: null,
      depth: 'standard',
      sealed: payload.sealed,
      error: null,
      context: null,
    },
    // One row per warning, carrying the stage that raised it: enough for the
    // report's "what it could not establish" section and its stage count, and
    // honest about the fact that a pack does not carry a timeline.
    stages: payload.warnings.map((warning, i) => ({
      ordinal: i,
      name: warning.stage,
      status: 'completed',
      warnings: [warning.text],
      startedAt: null,
      completedAt: null,
      error: null,
    })),
    artefacts: payload.artefacts,
    passes: [],
    personas: [],
    heartbeat: null,
  };

  return (
    <>
      <a href="#main-content" className="govuk-skip-link">Skip to main content</a>
      <header className="govuk-template__header">
        <div className="govuk-generic-header">
          <div className="govuk-generic-header__container govuk-width-container">
            <div className="govuk-generic-header__logo">
              <span className="prt-logotype">Policy Red Team</span>{' '}
              <strong className="govuk-tag govuk-tag--grey prt-logotype-tag">Offline copy</strong>
            </div>
          </div>
        </div>
      </header>

      <div className="govuk-width-container govuk-width-container--wide">
        <main className="govuk-main-wrapper" id="main-content" tabIndex={-1}>
          <span className="govuk-caption-l">Assessment</span>
          <h1 className="govuk-heading-xl">{payload.title}</h1>
          <p className="govuk-body">
            <Tag colour={statusColour(payload.status) as TagColour}>{statusLabel(payload.status)}</Tag>{' '}
            <span className="prt-meta">
              Pack made {new Date(payload.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </p>

          <InsetText>
            This is an offline copy. Nothing on this page reaches the network, and nothing here
            changes if the assessment does — the report beside it in <code>report.docx</code> and{' '}
            <code>report.md</code> is the same text.
            {payload.sealed ? ' This assessment was sealed: its source paper was never stored in the clear.' : ''}
            {payload.withheld.length
              ? ` This copy leaves out ${payload.withheld.map((w) => `${w.count} ${w.kind}`).join(', ')}.`
              : ''}
          </InsetText>

          <Report detail={detail} offline />
        </main>
      </div>

      <footer className="govuk-footer">
        <div className="govuk-width-container">
          <div className="govuk-footer__meta">
            <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
              <p className="govuk-footer__meta-custom">
                Built with the GOV.UK Design System under the MIT Licence. Not a government
                service; the GOV.UK crown, the royal arms and the GDS Transport typeface are not
                used. This is an adversarial reading, not an assurance review.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
