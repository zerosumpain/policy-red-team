import { useState, type FormEvent } from 'react';
import { MATERIAL_ROLES } from '$lib/policy-analysis/contracts';
import { addenda, addendumBanner, type PassRow } from '$lib/policy-analysis/view';
import { canRestate, passState, REVISION_COLOUR, REVISION_LABEL } from '$lib/addenda';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { api } from '../api';
import { Button, ButtonGroup, Details, ErrorSummary, FileUpload, InsetText, Radios, SummaryList, Tag, Textarea, WarningText } from '../govuk';
import type { ArtefactLink } from './Report';

/**
 * WHAT CAME AFTER THIS WAS WRITTEN.
 *
 * An assessment is a reading of a paper at a moment. A later draft lands, a
 * consultation response arrives, somebody writes a rebuttal — and the question
 * is not "run it again" but "what does this change". A pass answers exactly
 * that: it reads the new material against the conclusions already reached and
 * returns a verdict on each, and `view.ts`'s `addenda()` shapes what it found.
 *
 * NOTHING IS RE-RUN, AND THAT IS STRUCTURAL rather than a policy. Every late
 * stage cites earlier ids and `persistArtefacts` is a plain insert against an
 * `(analysis_id, id)` primary key, so a stage CANNOT execute twice: the
 * `s<n>_<slot>_` namespace collides. A pass owns its own block of ordinals
 * (`PASS_BASE * n + k`) and appends. The original report stays exactly as it
 * was, which is the point — a reader can see what was concluded before the
 * material arrived and what it did to it.
 *
 * WORST FIRST, and `addenda()` does that ordering for the reason its own
 * comment gives: a reader opening an addendum is asking what BROKE, and a list
 * that opens with eleven conclusions that survived buries the one that did not.
 *
 * BOTH ACTIONS SPEND. Attaching runs four stages; restating runs the most
 * expensive call in the feature. Both say so beside their button, both are
 * refused outright in a read-only copy, and restating is refused by the store
 * when there is nothing to write in — a rule `canRestate` mirrors so the page
 * can explain the refusal rather than collect a 400.
 */
export function Addenda({ analysisId, status, artefacts, passes, readOnly, linkTo, onChanged }: {
  analysisId: string;
  status: string;
  artefacts: Artefact[];
  passes: PassRow[];
  readOnly: boolean;
  linkTo?: ArtefactLink;
  /** The report reloads itself: a pass changes the assessment's own status. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | 'material' | 'restate'>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const views = addenda(artefacts, passes);
  const state = passState(passes);
  const restate = canRestate(status, passes);
  const name = (artefact: Artefact) => (linkTo ? linkTo(artefact) : artefact.label);

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hasFile = (form.get('material') as File | null)?.size;
    const hasText = String(form.get('text') ?? '').trim();
    const problems: string[] = [];
    if (!form.get('role')) problems.push('Say what kind of material this is');
    if (!hasFile && !hasText) problems.push('Attach a document or paste its text');
    if (hasFile && hasText) problems.push('Supply either a document or pasted text, not both');
    setErrors(problems);
    if (problems.length) return;

    setBusy('material');
    try {
      await api.material(analysisId, form);
      onChanged();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(null);
    }
  }

  async function writeAgain() {
    setBusy('restate');
    setErrors([]);
    try {
      await api.act(analysisId, 'restate');
      onChanged();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {views.length ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            {views.map((view) => (
              <div key={view.pass} className="govuk-!-margin-bottom-6">
                <h3 className="govuk-heading-s">
                  {view.roleLabel}
                  {view.filename ? <span className="prt-meta"> · {view.filename}</span> : null}
                </h3>
                <p className="govuk-body-s prt-meta">
                  Attached{' '}
                  {new Date(view.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {view.passages ? ` · ${view.passages} ${view.passages === 1 ? 'passage' : 'passages'} read` : ''}
                  {view.status === 'completed' ? ` · ${view.moved} ${view.moved === 1 ? 'conclusion moved' : 'conclusions moved'}` : ''}
                </p>
                {view.note ? <p className="govuk-body-s">Your note: {view.note}</p> : null}

                {view.status === 'failed' || view.error ? (
                  <WarningText>
                    This pass did not finish. {view.error ?? 'No reason was recorded.'} Nothing in the
                    report was changed by it.
                  </WarningText>
                ) : null}

                {view.summary ? <p className="govuk-body">{view.summary.statement}</p> : null}

                {view.revisions.length ? (
                  <>
                    <SummaryList
                      rows={view.revisions.slice(0, 6).map((revision) => ({
                        key: revision.target ? name(revision.target) : revision.artefact.label,
                        value: (
                          <>
                            <Tag colour={REVISION_COLOUR[revision.status] ?? 'grey'}>
                              {REVISION_LABEL[revision.status] ?? revision.status}
                            </Tag>
                            <br />
                            {revision.artefact.statement}
                          </>
                        ),
                      }))}
                    />
                    {view.revisions.length > 6 ? (
                      <Details summary={`The other ${view.revisions.length - 6}`}>
                        <SummaryList
                          noBorder
                          rows={view.revisions.slice(6).map((revision) => ({
                            key: revision.target ? name(revision.target) : revision.artefact.label,
                            value: (
                              <>
                                <Tag colour={REVISION_COLOUR[revision.status] ?? 'grey'}>
                                  {REVISION_LABEL[revision.status] ?? revision.status}
                                </Tag>{' '}
                                {revision.artefact.statement}
                              </>
                            ),
                          }))}
                        />
                      </Details>
                    ) : null}
                  </>
                ) : view.status === 'completed' ? (
                  <p className="govuk-body">
                    It reached no verdict on any existing conclusion. The material was read and is
                    recorded; it did not bear on what the assessment had already found.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <p className="govuk-body">
              Nothing has been added since this was written. An assessment is a reading of a paper
              at a moment — when a later draft, a consultation response or a rebuttal arrives, the
              useful question is not "run it again" but "what does this change".
            </p>
          </div>
        </div>
      )}

      {state.running ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <InsetText>
              <span role="status">
                {state.running.kind === 'restatement' ? 'Writing the report again' : 'Reading what you attached'} —
                this runs to the end on its own and the page follows it. You can close the tab.
              </span>
            </InsetText>
          </div>
        </div>
      ) : readOnly ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <InsetText>This copy is read-only, so nothing can be added to it.</InsetText>
          </div>
        </div>
      ) : (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            {errors.length ? (
              <ErrorSummary errors={errors.map((text) => ({ text, href: '#material-role' }))} />
            ) : null}

            {/*
              THE FORM OPENS ON REQUEST, and that is a measured decision rather
              than tidiness. Eight radios with hints, a file picker, two
              textareas and a button ran to about 1,300px — roughly a sixth of
              the whole report — permanently open at the foot of the page, so a
              reader who scrolled to the end of the assessment's conclusions
              arrived at a file picker. Attaching a later draft is a real thing
              to do and a rare one; the report is what the page is for.

              The error summary stays OUTSIDE it: a validation failure inside a
              shut disclosure is a page that reports nothing went wrong.
            */}
            <Details summary="Add something to it" open={errors.length > 0}>
            <form onSubmit={(e) => void attach(e)} noValidate>
              {/*
                THE ROLE IS NOT A LABEL, IT IS AN INSTRUCTION TO THE READING.
                It is interpolated into the decomposition and reconciliation
                prompts rather than left for the model to infer: a consultation
                response read as though it were the policy yields claims the
                policy never made, and a later draft read as though it were a
                critique yields contradictions that are only the paper being
                rewritten. The reader is the one who knows which.
              */}
              <Radios
                id="material-role"
                name="role"
                legend="What is this?"
                legendSize="s"
                hint="This changes how it is read, so it is worth getting right."
                items={MATERIAL_ROLES.map(([value, text, hint]) => ({ value, text, hint }))}
              />
              <FileUpload
                id="material-file"
                name="material"
                label="The document"
                labelSize="s"
                hint="PDF, Word or plain text. Or paste the text below instead."
              />
              <Textarea
                id="material-text"
                name="text"
                label="Or paste it"
                labelSize="s"
                hint="For something that has no file — an email, a passage from a letter."
                rows={4}
              />
              <Textarea
                id="material-note"
                name="note"
                label="Anything you want the reading to know"
                labelSize="s"
                hint="Optional. Where it came from, what to watch for."
                rows={2}
              />
              <p className="govuk-body-s prt-meta">
                This runs four stages against what you attach, so it costs something. The original
                report is not touched: nothing is re-run, and what this finds is appended.
              </p>
              <ButtonGroup>
                <Button type="submit" disabled={busy !== null}>
                  {busy === 'material' ? 'Starting…' : 'Read it against this assessment'}
                </Button>
              </ButtonGroup>
            </form>
            </Details>

            <Details summary="Write the report again">
            <p className="govuk-body">
              A restatement rewrites the assured synthesis over everything, including what has been
              added since. The superseded report is kept — it is still stored, still cited by its
              own recommendations, and still reachable. It is simply no longer the current one.
            </p>
            {restate.ok ? (
              <>
                <p className="govuk-body-s prt-meta">
                  This is the most expensive call in the feature: it reads the whole inventory.
                </p>
                <ButtonGroup>
                  <Button variant="secondary" disabled={busy !== null} onClick={() => void writeAgain()}>
                    {busy === 'restate' ? 'Starting…' : 'Write it again'}
                  </Button>
                </ButtonGroup>
              </>
            ) : (
              /* The refusal in words rather than a greyed-out button nobody can
                 explain — the argument the landing page has made since phase 4. */
              <InsetText>{restate.because}</InsetText>
            )}
            </Details>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The line that goes above the verdict when material has been attached since.
 *
 * Null when nothing was attached, or when nothing that was attached moved
 * anything — `addendumBanner` decides that, and its reasoning is the right one:
 * "1 addendum, 0 changes" above an unchanged report is a notification, not a
 * finding, and the section below already says the material was read.
 */
export function AddendumNotice({ artefacts, passes }: { artefacts: Artefact[]; passes: PassRow[] }) {
  const banner = addendumBanner(addenda(artefacts, passes));
  if (!banner) return null;
  return (
    <WarningText>
      This report has been overtaken in part. {banner.addenda}{' '}
      {banner.addenda === 1 ? 'thing was' : 'things were'} attached after it was written and moved{' '}
      {banner.moved} {banner.moved === 1 ? 'conclusion' : 'conclusions'}
      {banner.overturned
        ? `, ${banner.overturned} of ${banner.overturned === 1 ? 'them overturned' : 'them overturned'}`
        : ''}
      . What came after this was written, below, says which.
    </WarningText>
  );
}
