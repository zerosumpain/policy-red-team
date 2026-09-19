import { useCallback, useEffect, useState } from 'react';
import { api, type ShareRow } from '../api';
import { Button, ButtonGroup, InsetText, Input, Table, Tag, WarningText } from '../govuk';

/**
 * LINKS HANDED OUT, AND TAKEN BACK.
 *
 * A share link is the only access-control primitive in this service. There is no
 * sign-in: the server binds to loopback and everything it serves belongs to
 * whoever can reach the port. So a link is not "read-only access for a
 * colleague" the way it is on a site with accounts — it is a bearer token, and
 * the page says so rather than implying a login somewhere.
 *
 * THE TOKEN IS SHOWN ONCE. `createShare` returns it; `listShares` never does,
 * because only its hash is stored. That is a property of the design rather than
 * a nicety of this page, and the copy says which — a reader who closes the panel
 * expecting to find the link again would otherwise mint a second one and leave
 * the first live.
 *
 * WHAT GOES DOWN THE LINK is decided by `shareableReport` on the server and by
 * nothing here. This panel does not know the redaction rules and must not: a
 * second opinion about what may leave the account is how the two disagree.
 */
export function Shares({ analysisId, readOnly }: { analysisId: string; readOnly: boolean }) {
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [label, setLabel] = useState('');
  const [minted, setMinted] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares((await api.shares(analysisId)).shares);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [analysisId]);

  useEffect(() => { void load(); }, [load]);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.share(analysisId, label.trim() || null);
      // Built from where the browser actually is, so a link minted through the
      // tunnel carries the public hostname and one minted on loopback does not
      // pretend to.
      setMinted({ url: `${window.location.origin}/shared/${created.token}`, expiresAt: created.expiresAt });
      setCopied(false);
      setLabel('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: ShareRow) {
    setBusy(true);
    setError(null);
    try {
      await api.revoke(analysisId, share.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const live = shares?.filter((s) => s.live) ?? [];

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <p className="govuk-body">
          A link hands someone the assessment without the paper it read. They see every
          conclusion, every play and every check; they do not see the document's own passages,
          or any comparison with your other assessments.
        </p>
        <WarningText>
          Anyone holding the link can read it. There is no sign-in behind it — the link is the
          permission, so treat it like the assessment itself and withdraw it when you are done.
        </WarningText>

        {error ? <p className="govuk-body govuk-error-message" role="alert">{error}</p> : null}

        {readOnly ? (
          /* A disabled control the reader cannot explain is worse than no
             control at all — the same argument the landing page makes about the
             submit button. */
          <InsetText>
            This copy is read-only, so no new link can be minted here and none can be withdrawn.
            Existing links, if there are any, still work.
          </InsetText>
        ) : (
          <>
            <Input
              id="share-label"
              label="Who is this link for?"
              labelSize="s"
              hint="Optional, and only you ever see it. It is how you tell two links apart when you come to withdraw one."
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              disabled={busy}
            />
            <ButtonGroup>
              <Button disabled={busy} onClick={() => void mint()}>Create a link</Button>
            </ButtonGroup>
          </>
        )}

        {minted ? (
          <>
            {/* SHOWN ONCE, and it says so. Only the hash is stored, so this is
                the only moment the link exists in readable form. */}
            <InsetText>
              <p className="govuk-body govuk-!-font-weight-bold">
                Copy this now. It is not stored and will not be shown again.
              </p>
              <p className="govuk-body">
                <code className="prt-token">{minted.url}</code>
              </p>
              <ButtonGroup>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(minted.url).then(() => setCopied(true)).catch(() => setCopied(false));
                  }}
                >
                  Copy the link
                </Button>
              </ButtonGroup>
              <p className="govuk-body-s" role="status">
                {copied ? 'Copied to the clipboard.' : 'Select the text above if the button does not work.'}
              </p>
              <p className="govuk-body-s prt-meta">
                It stops working on{' '}
                {new Date(minted.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
            </InsetText>
          </>
        ) : null}

        {shares === null ? <p className="govuk-body">Loading…</p> : null}
        {shares?.length === 0 ? (
          <p className="govuk-body">No links have been created for this assessment.</p>
        ) : null}
      </div>

      {shares?.length ? (
        <div className="govuk-grid-column-full">
          <Table
            caption={`Links created — ${live.length} of ${shares.length} still working`}
            captionSize="s"
            scroll
            columns={[{ header: 'For' }, { header: 'Created' }, { header: 'Stops working' }, { header: 'Opened', numeric: true }, { header: 'Status' }, { header: 'Withdraw' }]}
            rows={shares.map((share) => [
              share.label ?? <span className="prt-meta">No label</span>,
              date(share.createdAt),
              date(share.expiresAt),
              String(share.useCount),
              share.revokedAt
                ? <Tag colour="grey">Withdrawn</Tag>
                : share.live
                  ? <Tag colour="green">Working</Tag>
                  : <Tag colour="grey">Expired</Tag>,
              share.live && !readOnly ? (
                <Button variant="warning" disabled={busy} onClick={() => void revoke(share)}>
                  Withdraw<span className="govuk-visually-hidden"> the link for {share.label ?? 'this assessment'}</span>
                </Button>
              ) : (
                <span className="prt-meta">—</span>
              ),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
