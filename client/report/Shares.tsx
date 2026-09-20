import { InsetText, WarningText } from '../govuk';

/**
 * A COPY TO SEND SOMEONE — as a file, not as a link.
 *
 * This was a panel that minted bearer-token URLs, and the URLs were removed
 * after a security review of them. The reason is worth keeping, because the
 * obvious feature is the wrong one here:
 *
 * EVERY OWNER ROUTE IN THIS SERVICE IS UNAUTHENTICATED, by design and on
 * purpose — the server binds to loopback, there is no sign-in, and everything
 * it serves belongs to whoever can reach the port. A share link is only useful
 * to someone who CAN reach the host. So a recipient handed a redacted copy at
 * `/shared/<token>` could call `GET /api/policy-analysis/:id` a second later
 * and read the whole policy paper, the cross-policy findings, and the titles of
 * every other assessment. The page promised a redaction the deployment does not
 * enforce, which is worse than not offering one: a reader would take the
 * absence of a source quote for an assessment that never had one.
 *
 * A FILE HAS NO SUCH HOLE. It carries exactly what `shareableReport` left in
 * it, needs no server, cannot be walked sideways into a route it was not given,
 * does not expire, has nothing to revoke — and it still works behind a
 * Cloudflare Access policy on the hostname, which would refuse a link-holder
 * outright. `docs/phase-10.md` has the full argument and the measurements.
 *
 * The redaction itself is unchanged and runs where it always did: on the
 * server, in `shareableReport`, once.
 */
/**
 * WHAT IS LEFT HERE IS THE TWO LIMITS ON ACTION.
 *
 * The six download links and the two paragraphs describing them are one
 * `DownloadGrid` now — three formats by two scopes, which is a table, and was
 * 97 words of prose a reader had to hold in their head to compare.
 *
 * These two blocks are NOT descriptions of data and do not compress. One says
 * there is no link to send and why; the other says that sending cannot be
 * undone. Both are arguments about what the reader is about to do, and both
 * would be equally true of a different assessment — which is the test for
 * whether a sentence is standing argument or this run's numbers.
 *
 * `analysisId` IS ACCEPTED AND UNUSED, DELIBERATELY AND TEMPORARILY. It was the
 * six export URLs and they are `DownloadGrid`'s now; `Report.tsx` still passes
 * it, and that call site is the integrator's to change when the two sections
 * merge into one. Typed optional so it can go without a second edit here.
 */
export function Shares(_props: { analysisId?: string } = {}) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <InsetText>
          Send the file. There is no link to send: this service has no sign-in, so a URL that
          worked for your recipient would also let them read everything it withholds. A file
          cannot be walked sideways, and it still works for someone your access policy would turn
          away at the door.
        </InsetText>

        <WarningText>
          Once you have sent it you cannot take it back. Nothing here expires and there is nothing
          to withdraw — which is the honest shape of handing someone a document, and worth a
          moment's thought before you do.
        </WarningText>
      </div>
    </div>
  );
}
