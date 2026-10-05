import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, type GroundingItemRow, type PolicyRow } from '../api';
import { FileUpload, Input, Select } from '../govuk';
import { GROUNDING_ROLE_LABELS, MAX_BYTES, MAX_DOCUMENTS, MAX_GROUNDING_FILE_BYTES, MAX_GROUNDING_FILES_BYTES, MAX_GROUNDING_ITEMS, SUBMISSION_GROUNDING_ROLES } from '$lib/policy-analysis/contracts';

/**
 * THE DOCUMENTS SECTION AND THE POLICY QUESTION (phase 25).
 *
 * ONE "Documents" section, as the plan has it: the first row is the paper, and
 * every further row takes a role — "Part of the policy" (an annex, a technical
 * note: decomposed and attacked as the paper) or one kind of "Supporting
 * material" (read in full and cited as evidence, never as the paper, and kept
 * in the policy's grounding library for its next run).
 *
 * The names are NUMBERED — `document.1`, `documentRole.1` — because a multipart
 * reader that keeps one value per name keeps one document of three. The first
 * row keeps the name `document` every caller has always sent.
 *
 * Add-another is done as on "Sources it should use": a fieldset per row, a
 * stable key, focus to the new row's first control and back to the button.
 */

const MB = (bytes: number) => `${bytes / 1024 / 1024} MB`;

export const DOCUMENT_ROLE_OPTIONS = [
  { value: 'policy', text: 'Part of the policy — an annex, a technical note' },
  ...SUBMISSION_GROUNDING_ROLES.map((role) => ({ value: role, text: `Supporting material: ${GROUNDING_ROLE_LABELS[role].toLowerCase()}` })),
];

export function Documents({ sealed }: { sealed: boolean }) {
  const [rows, setRows] = useState<{ key: number; role: string }[]>([]);
  const next = useRef(1);
  const add = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'add') add.current?.focus();
    else if (target) document.getElementById(target)?.focus();
  }, [rows]);

  const addRow = () => {
    const key = next.current++;
    setRows((current) => [...current, { key, role: 'policy' }]);
    focusAfter.current = `document-role-${rows.length + 1}`;
  };
  const removeRow = (key: number) => {
    setRows((current) => current.filter((r) => r.key !== key));
    focusAfter.current = 'add';
  };
  const setRole = (key: number, role: string) => setRows((current) => current.map((r) => (r.key === key ? { ...r, role } : r)));

  return (
    <div className="govuk-form-group prt-add-another">
      <fieldset className="govuk-fieldset" aria-describedby="documents-hint">
        <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">Documents</legend>
        <div id="documents-hint" className="govuk-hint">
          The paper first. Add an annex or a technical note as part of the policy — up to{' '}
          {MAX_DOCUMENTS} documents and {MB(MAX_BYTES)} together. Add an impact assessment,
          consultation responses, statistics, guidance or an evaluation as supporting material —
          up to {MAX_GROUNDING_ITEMS} items, {MB(MAX_GROUNDING_FILE_BYTES)} a file and{' '}
          {MB(MAX_GROUNDING_FILES_BYTES)} together. Supporting material is read in full and cited as
          evidence, never as the paper{sealed ? '' : ', and it is kept in this policy’s grounding library for its next assessment'}.
        </div>
        <FileUpload id="document" name="document" label="The paper" labelSize="s"
                    hint="PDF, DOCX or UTF-8 text. It must have a text layer — a scan of a page yields nothing."
                    accept=".pdf,.docx,.txt" />
        {rows.map((row, i) => {
          const n = i + 1;
          const supporting = row.role !== 'policy';
          return (
            <fieldset key={row.key} className="govuk-fieldset prt-add-another__item">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Document {n + 1}</legend>
              <Select id={`document-role-${n}`} name={`documentRole.${n}`} label="What is it?" labelSize="s"
                      value={row.role} onChange={(e) => setRole(row.key, e.currentTarget.value)}
                      options={DOCUMENT_ROLE_OPTIONS} />
              <FileUpload id={`document-${n}`} name={`document.${n}`} label="Attach it" labelSize="s"
                          hint={supporting ? `PDF, DOCX or plain text, up to ${MB(MAX_GROUNDING_FILE_BYTES)}. Or give its web address below.` : 'PDF, DOCX or plain text.'}
                          accept=".pdf,.docx,.txt" />
              {supporting ? (
                <Input id={`document-url-${n}`} name={`documentUrl.${n}`} label="Or its web address" labelSize="s" type="url" spellCheck={false}
                       hint={sealed ? 'This assessment is sealed, so a web address is not fetched: attach the file instead.' : 'A public page, fetched when the assessment starts.'} />
              ) : null}
              <Input id={`document-title-${n}`} name={`documentTitle.${n}`} label="Its title (optional)" labelSize="s" maxLength={300}
                     hint={supporting ? 'How citations name it. Leave blank to use the file name.' : 'How citations name it, for example “Annex A: costings”. Leave blank to use the file name.'} />
              {supporting ? (
                <>
                  <Input id={`document-publisher-${n}`} name={`documentPublisher.${n}`} label="Publisher (optional)" labelSize="s" maxLength={300} />
                  <Input id={`document-date-${n}`} name={`documentDate.${n}`} label="Date published (optional)" labelSize="s" maxLength={60} className="govuk-input--width-20" />
                </>
              ) : null}
              <button type="button" className="govuk-button govuk-button--secondary prt-add-another__remove" onClick={() => removeRow(row.key)}>
                Remove<span className="govuk-visually-hidden"> document {n + 1}</span>
              </button>
            </fieldset>
          );
        })}
        {rows.length < MAX_DOCUMENTS + MAX_GROUNDING_ITEMS - 1 ? (
          <button ref={add} type="button" className="govuk-button govuk-button--secondary" onClick={addRow}>
            Add another document
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}

/**
 * WHICH POLICY, and which of its grounding to use.
 *
 * Unsealed, leaving it on the first choice starts a policy named after the
 * paper, so its next draft can pick it here. Sealed, a policy can be READ —
 * its library copied into the sealed run — but not started, because its name
 * would be kept in the clear.
 *
 * The library's items are checkboxes, all ticked: "attach it once and every
 * run uses it". `groundingListed` tells the server the list was drawn, so no
 * ticks means none rather than "the form did not ask".
 */
export function PolicyChoice({ sealed }: { sealed: boolean }) {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [chosen, setChosen] = useState('');
  const [items, setItems] = useState<GroundingItemRow[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => { api.policies().then((r) => setPolicies(r.policies)).catch(() => setPolicies([])); }, []);
  useEffect(() => {
    if (!chosen) { setItems(null); return; }
    let live = true;
    api.policy(chosen).then((d) => {
      if (!live) return;
      setItems(d.items);
      setTicked(new Set(d.items.map((i) => i.id)));
    }).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [chosen]);

  return (
    <>
      <Select id="policy" name="policy" label="Which policy is this paper part of?" labelSize="s"
              hint={sealed
                ? 'A sealed assessment can use a policy’s grounding library but does not start a policy: its name would be kept in the clear.'
                : 'Drafts and re-runs of one policy share its grounding library. Choose the policy, or start one for this paper.'}
              value={chosen} onChange={(e) => setChosen(e.currentTarget.value)}
              options={[
                { value: '', text: sealed ? 'None' : 'Start a new policy for this paper' },
                ...policies.map((p) => ({ value: p.id, text: `${p.name}${p.items ? ` — ${p.items} grounding item${p.items === 1 ? '' : 's'}` : ''}` })),
              ]} />
      {chosen && items ? (
        <div className="govuk-form-group">
          <input type="hidden" name="groundingListed" value="true" />
          <fieldset className="govuk-fieldset" aria-describedby="use-grounding-hint">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Its grounding library</legend>
            <div id="use-grounding-hint" className="govuk-hint">
              {items.length
                ? `What this assessment will be judged against. Untick anything that does not apply to this draft. At most ${MAX_GROUNDING_ITEMS} items, including any you add below.`
                : 'This policy has no grounding yet. Add supporting material under Documents and it is kept here for the next run.'}{' '}
              <Link className="govuk-link" to={`/grounding/${chosen}`}>Open the library</Link>
            </div>
            {items.length ? (
              <div className="govuk-checkboxes govuk-checkboxes--small" data-module="govuk-checkboxes">
                {items.map((item, i) => (
                  <div className="govuk-checkboxes__item" key={item.id}>
                    <input className="govuk-checkboxes__input" id={`use-grounding-${i}`} name={`useGrounding.${i}`} type="checkbox" value={item.id}
                           checked={ticked.has(item.id)}
                           onChange={() => setTicked((current) => { const nextSet = new Set(current); if (nextSet.has(item.id)) nextSet.delete(item.id); else nextSet.add(item.id); return nextSet; })} />
                    <label className="govuk-label govuk-checkboxes__label" htmlFor={`use-grounding-${i}`}>
                      {item.title} <span className="prt-meta">({item.roleLabel}{item.publishedOn ? `, ${item.publishedOn}` : ''})</span>
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
          </fieldset>
        </div>
      ) : null}
    </>
  );
}

/** Where a server refusal about one document should send the error summary's link. */
export function documentErrorHref(message: string): string | null {
  const row = /^Document (\d+):/.exec(message);
  if (!row) return null;
  const n = Number(row[1]) - 1;
  return n ? `#document-${n}` : '#document';
}
