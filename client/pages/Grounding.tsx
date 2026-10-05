import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api, type GroundingItemRow, type PolicyDetail, type PolicyRow } from '../api';
import { Button, ErrorSummary, FileUpload, Input, InsetText, Select, Table } from '../govuk';
import { usePageTitle } from '../layout/Template';
import { useSite } from '../layout/site';
import { GROUNDING_ROLES, MAX_GROUNDING_FILE_BYTES, MAX_GROUNDING_ITEMS } from '$lib/policy-analysis/contracts';

/**
 * THE GROUNDING LIBRARY (phase 25) — what a policy is judged against.
 *
 * John's decision of 5 October: grounding material lives in a library REUSED
 * PER POLICY. Attach the impact assessment once and every run of that policy
 * reads it. So the library is organised by policy, and a policy is the thing
 * drafts and re-runs of one paper share — picked on the submission page.
 *
 * Two routes, not a dialog: `/grounding` lists the policies, and
 * `/grounding/:id` is one policy's library with its add form. Adding a web
 * page fetches it now, through the same SSRF-guarded reader research uses, so
 * a page that will not load says so here rather than in a run.
 *
 * WHAT GROUNDING IS, said on the page because it is the whole difference from
 * the paper: material the assessment TRUSTS AS EVIDENCE and quotes, checked,
 * like the paper — never the paper itself, and never instruction.
 */

const MB = (bytes: number) => `${bytes / 1024 / 1024} MB`;

export function GroundingIndex() {
  usePageTitle('Grounding library');
  const { readOnly } = useSite();
  const [policies, setPolicies] = useState<PolicyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);

  const load = () => api.policies().then((r) => setPolicies(r.policies)).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give the policy a name'); return; }
    setError(null);
    try {
      const created = await api.createPolicy(name);
      setMade(created);
      setName('');
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {error ? <ErrorSummary errors={[{ text: error, href: '#policy-name' }]} /> : null}
        <h1 className="govuk-heading-xl">Grounding library</h1>
        <p className="govuk-body-l">
          What each policy is judged against: its impact assessment, consultation responses,
          statistics, guidance and evaluations.
        </p>
        <p className="govuk-body">
          Add material to a policy once and every assessment of that policy reads it. It is read in
          full, quoted and checked like the paper, and graded as evidence on what it is. It is never
          treated as the paper, and nothing written in it is followed as an instruction.
        </p>
        <h2 className="govuk-heading-m">Policies</h2>
        {policies === null ? (
          <p className="govuk-body prt-meta" role="status">Loading the policies…</p>
        ) : policies.length ? (
          <Table
            caption="Your policies"
            captionSize="s"
            scroll
            columns={[{ header: 'Policy' }, { header: 'Grounding', numeric: true }, { header: 'Assessments', numeric: true }]}
            rows={policies.map((p) => [
              <Link key={p.id} className="govuk-link" to={`/grounding/${p.id}`}>{p.name}</Link>,
              String(p.items),
              String(p.runs),
            ])}
          />
        ) : (
          <p className="govuk-body">
            No policies yet. Every assessment you start belongs to one, so assessing a paper starts
            its policy too — or start one here and add its material first.
          </p>
        )}
        {made ? (
          <p className="govuk-body" role="status">
            <Link className="govuk-link" to={`/grounding/${made.id}`}>{made.name}</Link> is ready for its material.
          </p>
        ) : null}
        {readOnly ? null : (
          <form onSubmit={onCreate} noValidate>
            <h2 className="govuk-heading-m">Start a policy</h2>
            <Input id="policy-name" label="Policy name" value={name} onChange={(e) => setName(e.currentTarget.value)}
                   hint="The name drafts and re-runs of the paper will share, for example “Best start in life”." maxLength={200} />
            <Button type="submit">Start the policy</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function GroundingPolicy() {
  const { id = '' } = useParams();
  const { readOnly } = useSite();
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [formKey, setFormKey] = useState(0);
  usePageTitle(detail ? `Grounding for ${detail.policy.name}` : 'Grounding library');

  const load = () => api.policy(id).then(setDetail).catch(() => setMissing(true));
  useEffect(() => { void load(); }, [id]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const hasFile = file instanceof File && file.size > 0;
    const url = String(form.get('url') ?? '').trim();
    const found: { text: string; href: string }[] = [];
    if (!hasFile && !url) found.push({ text: 'Attach a file or give its web address', href: '#grounding-file' });
    if (hasFile && url) found.push({ text: 'Give a file or a web address, not both', href: '#grounding-url' });
    if (hasFile && (file as File).size > MAX_GROUNDING_FILE_BYTES) found.push({ text: `The file must be at most ${MB(MAX_GROUNDING_FILE_BYTES)}`, href: '#grounding-file' });
    setErrors(found);
    if (found.length) return;
    if (!hasFile) form.delete('file');
    setBusy(true);
    setStatus(url ? 'Fetching the page and adding it to the library…' : 'Reading the file and adding it to the library…');
    try {
      const added = await api.addGrounding(id, form);
      setStatus(`Added “${added.title}”.${added.error ? ` ${added.error}` : ''}`);
      setFormKey((k) => k + 1);
      await load();
    } catch (e) {
      setErrors([{ text: (e as Error).message, href: '#grounding-file' }]);
      setStatus('');
    } finally { setBusy(false); }
  }

  async function onRemove(item: GroundingItemRow) {
    setStatus(`Removing “${item.title}”…`);
    try {
      await api.removeGrounding(id, item.id);
      setStatus(`Removed “${item.title}”. Assessments already run keep their own copy.`);
      await load();
    } catch (e) { setStatus((e as Error).message); }
  }

  if (missing) {
    return (
      <div className="govuk-grid-row"><div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Policy not found</h1>
        <p className="govuk-body"><Link className="govuk-link" to="/grounding">Go back to the grounding library</Link></p>
      </div></div>
    );
  }
  if (!detail) return <p className="govuk-body prt-meta" role="status">Loading the library…</p>;

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <ErrorSummary errors={errors} />
        <span className="govuk-caption-l">Grounding library</span>
        <h1 className="govuk-heading-xl">{detail.policy.name}</h1>
        <p className="govuk-body">
          Every assessment of this policy reads what is listed here, unless it is unticked when the
          paper is submitted. Each run keeps its own copy, so removing an item changes only the runs
          that start afterwards.
        </p>
        <h2 className="govuk-heading-m">What it is judged against</h2>
        {detail.items.length ? (
          <Table
            caption={`${detail.items.length} item${detail.items.length === 1 ? '' : 's'}`}
            captionSize="s"
            scroll
            columns={[{ header: 'Material' }, { header: 'Kind' }, { header: 'Read' }, ...(readOnly ? [] : [{ header: <span className="govuk-visually-hidden">Remove</span>, name: 'Remove' }])]}
            rows={detail.items.map((item) => [
              <span key="title">
                <strong>{item.title}</strong>
                {item.publisher || item.publishedOn ? <span className="prt-meta"><br />{[item.publisher, item.publishedOn].filter(Boolean).join(', ')}</span> : null}
                {item.url ? <span className="prt-meta"><br />{item.url}</span> : null}
              </span>,
              item.roleLabel,
              item.characters ? `${item.characters.toLocaleString('en-GB')} characters` : item.error ? item.error : item.url ? 'Fetched when an assessment runs' : '—',
              ...(readOnly ? [] : [
                <button key="remove" type="button" className="govuk-button govuk-button--secondary govuk-!-margin-bottom-0" onClick={() => void onRemove(item)}>
                  Remove<span className="govuk-visually-hidden"> {item.title}</span>
                </button>,
              ]),
            ])}
          />
        ) : (
          <p className="govuk-body">Nothing yet. Assessments of this policy read the paper alone, and what research finds.</p>
        )}
        <p className="govuk-body prt-meta" role="status">{status}</p>

        {readOnly ? null : (
          <form key={formKey} onSubmit={onAdd} noValidate>
            <h2 className="govuk-heading-m">Add material</h2>
            <InsetText>
              One assessment reads up to {MAX_GROUNDING_ITEMS} items and the first 60,000 characters of
              each — about 20 pages. Put the summary first if you have the choice.
            </InsetText>
            <Select id="grounding-role" name="role" label="What is it?"
                    options={GROUNDING_ROLES.map(([value, text]) => ({ value, text }))} />
            <FileUpload id="grounding-file" name="file" label="Attach it"
                        hint={`PDF, Word or plain text, up to ${MB(MAX_GROUNDING_FILE_BYTES)}. It must have a text layer.`} accept=".pdf,.docx,.txt" />
            <Input id="grounding-url" name="url" label="Or give its web address" type="url" spellCheck={false}
                   hint="A public page. It is fetched now and read as text." />
            <Input id="grounding-title" name="title" label="Title (optional)" maxLength={300}
                   hint="Leave it blank to use the file name or the page's own title." />
            <Input id="grounding-publisher" name="publisher" label="Publisher (optional)" maxLength={300} />
            <Input id="grounding-date" name="publishedOn" label="Date published (optional)" maxLength={60}
                   hint="As the document gives it, for example March 2025." className="govuk-input--width-20" />
            <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add to the library'}</Button>
          </form>
        )}

        <h2 className="govuk-heading-m">Assessments of this policy</h2>
        {detail.runs.length ? (
          <ul className="govuk-list">
            {detail.runs.map((run) => (
              <li key={run.id}><Link className="govuk-link" to={`/assessments/${run.id}`}>{run.title}</Link></li>
            ))}
          </ul>
        ) : (
          <p className="govuk-body">None yet. <Link className="govuk-link" to="/new">Assess a paper</Link> and choose this policy.</p>
        )}
      </div>
    </div>
  );
}
