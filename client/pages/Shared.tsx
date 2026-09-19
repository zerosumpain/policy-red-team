import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { Detail, SharedAssessment } from '../api';
import { api } from '../api';
import { InsetText, Tag, type TagColour } from '../govuk';
import { usePageTitle } from '../layout/Template';
import { Report } from '../report/Report';
import { statusColour, statusLabel } from '../status';

/**
 * THE RECIPIENT'S END OF A SHARE LINK.
 *
 * The only page in this service that answers to somebody who is not the owner,
 * and it renders `<Report>` rather than a second reader — the same arrangement
 * the offline pack uses, for the same reason: one report that can be read two
 * ways cannot disagree with itself about what the assessment found.
 *
 * NOTHING IS REDACTED HERE. `shareableReport` on the server has already done it
 * and there is exactly one of it; a second pass in the browser would be a
 * second implementation of "what may leave this account", which is how the two
 * eventually differ and a chapter goes missing from one of them. What this page
 * does is SAY SO — `withheld` arrives as figures precisely so the copy can
 * report the absence rather than look complete.
 *
 * NO LINKS INTO THE DRILL. Every artefact page is an owner route that would 404
 * for a holder of this link, and `Report` renders a plain name when no `linkTo`
 * is passed. The absence of the prop is the enforcement, not a flag.
 */
export function Shared() {
  const { token = '' } = useParams();
  const [shared, setShared] = useState<SharedAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    setShared(null);
    api.sharedAssessment(token)
      .then((data) => { if (live) setShared(data); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [token]);

  usePageTitle(shared?.title);

  if (error) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds" role="alert">
          <h1 className="govuk-heading-l">This link does not work</h1>
          <p className="govuk-body">{error}</p>
          <p className="govuk-body">
            Links expire on their own, and the person who sent you one can withdraw it at any
            time. Ask them for another.
          </p>
        </div>
      </div>
    );
  }
  if (!shared) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  /*
   * The shape `<Report>` reads, built from what the link carries.
   *
   * One row per warning carrying the stage that raised it — enough for the
   * report's "what it could not establish" section and its stage count, and
   * honest about the fact that a shared copy does not carry a timeline. The
   * same compromise `OfflineApp` makes.
   */
  const detail: Detail = {
    analysis: {
      id: 'shared',
      title: shared.title,
      status: shared.status,
      createdAt: shared.completedAt ?? new Date().toISOString(),
      completedAt: shared.completedAt,
      jurisdiction: shared.jurisdiction,
      policyArea: shared.policyArea,
      model: null,
      thinkingLevel: null,
      depth: 'standard',
      sealed: false,
      error: null,
      context: null,
    },
    stages: shared.warnings.map((warning, i) => ({
      ordinal: i,
      name: warning.stage,
      status: 'completed',
      warnings: [warning.text],
      startedAt: null,
      completedAt: null,
      error: null,
    })),
    artefacts: shared.artefacts,
    artefactMetadata: [],
    passes: shared.passes,
    personas: [],
    heartbeat: null,
    readOnly: true,
  };

  const expires = new Date(shared.expiresAt);

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <span className="govuk-caption-l">Shared assessment</span>
          <h1 className="govuk-heading-xl">{shared.title}</h1>
          <p className="govuk-body">
            <Tag colour={statusColour(shared.status) as TagColour}>{statusLabel(shared.status)}</Tag>{' '}
            <span className="prt-meta">
              This link stops working on{' '}
              {expires.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </p>

          {/* SAY WHAT IS NOT HERE. A shared copy that reads as complete is worse
              than one that names its own gaps: a reader would take the absence
              of a source quote for an assessment that never had one. */}
          <InsetText>
            This is a shared copy, and it is not everything.{' '}
            {shared.withheld.length
              ? `It leaves out ${shared.withheld.map((w) => `${w.count} ${withheldWords(w.kind, w.count)}`).join(' and ')}. `
              : ''}
            The policy document itself is not included — the report cites it in short spans rather
            than reproducing it — and neither is any comparison with the sender's other
            assessments. Everything the assessment concluded is here.
          </InsetText>

          <p className="govuk-body">
            <a className="govuk-link" href={`/api/policy-analysis/shared/${encodeURIComponent(token)}/export?format=docx`} download>
              Download this as Word
            </a>{' '}
            <span className="prt-meta">·</span>{' '}
            <a className="govuk-link" href={`/api/policy-analysis/shared/${encodeURIComponent(token)}/export?format=bundle`} download>
              or as an offline pack
            </a>
            <br />
            <span className="prt-meta">Both leave out exactly what this page does.</span>
          </p>
        </div>
      </div>

      <Report detail={detail} offline />
    </>
  );
}

/** What a withheld kind is called in a sentence a recipient reads. */
function withheldWords(kind: string, count: number): string {
  if (kind === 'passage') return count === 1 ? 'passage of the paper' : 'passages of the paper';
  if (kind === 'cross_policy') return count === 1 ? 'cross-policy finding' : 'cross-policy findings';
  return count === 1 ? `${kind} artefact` : `${kind} artefacts`;
}
