import type { PackPayload } from '$lib/offline-run';
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
export function OfflineApp({ payload }: { payload: PackPayload }) {
  /*
   * THE RUN'S OWN FACTS, WHERE THE PACK HAS THEM.
   *
   * This used to synthesise one stage per warning with `status: 'completed'`
   * written in, and null model, null effort, 'standard' depth. The report counts
   * completed stages out of total, so the pack printed "Stages — 256 of 256
   * completed" for a run that failed at 17 of 18, under its own header tag
   * reading Failed, in the section whose whole job is saying what the run did.
   * The service, from the same assessment, read "17 of 18 completed".
   *
   * `payload.run` carries the real rows. Where it is absent — nothing this code
   * produces, since a pack embeds the script that reads it — the pack says
   * nothing rather than inventing: the stages are still listed so the warnings
   * have somewhere to hang, but with no status to count, and `Report` drops the
   * rows it would otherwise fill with defaults.
   */
  const run = payload.run;
  const byStage = new Map<string, string[]>();
  for (const warning of payload.warnings) {
    byStage.set(warning.stage, [...(byStage.get(warning.stage) ?? []), warning.text]);
  }

  /*
   * THE TIMINGS AND THE COUNTS TRAVEL NOW, so the pack draws the same ladder.
   *
   * Both of these were hard-nulled here. `startedAt`/`completedAt` were written
   * as `null` in both branches — the only five references to either field
   * anywhere in `client/` — so the pack could never have said that one of the
   * eighteen stages took eight of the run's ten hours, and `kept` had nowhere to
   * come from at all, because a pack carries no `artefactMetadata`. Both are on
   * `payload.run` now; where a pack predates them they are still null and the
   * ladder drops those columns, which is this file's own rule.
   */
  const stages: Detail['stages'] = run
    ? run.stages.map((stage) => ({
        ordinal: stage.ordinal,
        name: stage.name,
        status: stage.status,
        warnings: byStage.get(stage.name) ?? [],
        startedAt: stage.startedAt ?? null,
        completedAt: stage.completedAt ?? null,
        error: stage.error,
        kept: stage.kept,
      }))
    : payload.warnings.map((warning, i) => ({
        ordinal: i,
        name: warning.stage,
        status: 'unknown',
        warnings: [warning.text],
        startedAt: null,
        completedAt: null,
        error: null,
      }));

  const detail: Detail = {
    analysis: {
      id: 'offline',
      title: payload.title,
      status: payload.status,
      createdAt: payload.generatedAt,
      // A pack has no timeline; the date it was made is the only instant it
      // carries, and it is the honest answer to "when did this last move".
      updatedAt: payload.generatedAt,
      completedAt: payload.completedAt,
      jurisdiction: payload.jurisdiction,
      policyArea: payload.policyArea,
      model: run?.model ?? null,
      thinkingLevel: run?.thinkingLevel ?? null,
      depth: run?.depth ?? 'standard',
      sealed: payload.sealed,
      error: null,
      context: null,
    },
    stages,
    // The pack names both too — see `RunFacts.models`.
    models: run?.models ?? [],
    // And what it spent. A pack made before this travelled says nothing, which
    // is what `null` means everywhere else in this payload.
    cost: run?.cost ?? null,
    artefacts: payload.artefacts,
    // A pack carries no per-row metadata and does not render the drill, which is
    // the only thing that reads it.
    artefactMetadata: [],
    passes: [],
    personas: [],
    heartbeat: null,
    // A pack has no server to refuse anything. Every control it would gate is
    // suppressed by `offline` already.
    readOnly: true,
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
          {/* THE SERVICE'S PAGE HEADER, not a second one. The status was a
              tag on its own line under an `xl` heading with the date after it;
              on the service the same facts sit in one row beside the title,
              separated by rules. A pack a reader opens next to the service
              should look like the thing they left. */}
          <header className="prt-pagehead">
            <span className="govuk-caption-l">Assessment</span>
            <h1 className="govuk-heading-xl">{payload.title}</h1>
            <p className="prt-pagehead__status">
              <Tag colour={statusColour(payload.status) as TagColour}>{statusLabel(payload.status)}</Tag>
              <span className="prt-meta">
                Pack made {new Date(payload.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </p>
          </header>

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
