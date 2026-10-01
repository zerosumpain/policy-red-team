import { useState, type FormEvent } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { MATERIAL_ROLES } from '$lib/policy-analysis/contracts';
import { api } from '../api';
import { Button, Details, ErrorSummary, FileUpload, Input, InsetText, Select, Textarea } from '../govuk';

/**
 * "I HAVE A SOURCE FOR THIS" AND "LOOK THIS UP", FOR ONE ITEM (phase 22 part 2).
 *
 * On every item page and on every open research gap. Both go through the
 * material pass phase 12 built — four steps that read something against the
 * conclusions already reached — aimed at THIS item, which the reading takes
 * first. Nothing is re-run; what it finds is appended, and the page that
 * follows the run says so.
 *
 * TWO DISCLOSURES, SHUT. A gap with two open forms under it is a page of forms
 * with the research in between; the actions are there for the reader who has
 * something, which is the rare case. The error summary sits OUTSIDE them, for
 * the reason `Addenda` gives: a failure inside a shut disclosure is a page
 * that reports nothing went wrong.
 *
 * NEVER IN THE PACK OR A READ-ONLY COPY. The caller decides — `Report` passes
 * no actions offline, and both callers pass none when the copy is read-only —
 * because a form that can only answer 403 is the control this codebase keeps
 * refusing to draw.
 */
export function ReaderActions({ analysisId, target, onStarted }: {
  analysisId: string;
  target: Artefact;
  /** The run is going again; the caller decides whether to reload or say so. */
  onStarted?: () => void;
}) {
  const [busy, setBusy] = useState<null | 'source' | 'lookup'>(null);
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [started, setStarted] = useState<null | 'source' | 'lookup'>(null);
  // Ids from the item's own id: unique on the page, and safe in a fragment.
  const key = `ra-${target.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;

  async function send(which: 'source' | 'lookup', event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('targetId', target.id);
    const problems: { text: string; href: string }[] = [];
    if (which === 'source') {
      const file = form.get('material');
      const hasFile = file instanceof File && file.size > 0;
      const url = String(form.get('url') ?? '').trim();
      if (!hasFile && !url) problems.push({ text: 'Attach the source or give its web address', href: `#${key}-url` });
      if (hasFile && url) problems.push({ text: 'Give a file or a web address, not both', href: `#${key}-url` });
      if (!hasFile) form.delete('material');
    } else if (!String(form.get('lookUp') ?? '').trim()) {
      problems.push({ text: 'Say what to look up', href: `#${key}-lookup` });
    }
    setErrors(problems);
    if (problems.length) return;
    setBusy(which);
    try {
      await api.material(analysisId, form);
      setStarted(which);
      onStarted?.();
    } catch (err) {
      setErrors([{ text: (err as Error).message, href: which === 'source' ? `#${key}-url` : `#${key}-lookup` }]);
    } finally {
      setBusy(null);
    }
  }

  if (started) {
    return (
      <InsetText>
        <span role="status">
          {started === 'source' ? 'Your source is' : 'What the search finds is'} being read against
          “{target.label}”, and then against the rest of the report. It runs on its own; the
          assessment page follows it and records what it changed.
        </span>
      </InsetText>
    );
  }

  return (
    <div className="prt-reader-actions">
      {errors.length ? <ErrorSummary errors={errors} /> : null}
      <Details summary="I have a source for this" id={`${key}-source`} open={errors.some((e) => e.href.endsWith('-url'))}>
        <form onSubmit={(e) => void send('source', e)} noValidate>
          <Input id={`${key}-url`} name="url" label="Its web address" labelSize="s" type="url" spellCheck={false}
                 hint="A public page. This server fetches it and reads it in full." />
          <FileUpload id={`${key}-file`} name="material" label="Or attach it" labelSize="s"
                      hint="PDF, Word or plain text." accept=".pdf,.docx,.txt" />
          <Select id={`${key}-role`} name="role" label="What is it?" labelSize="s" defaultValue="supporting_evidence"
                  hint="This changes how it is read."
                  options={MATERIAL_ROLES.map(([value, text]) => ({ value, text }))} />
          <Textarea id={`${key}-note`} name="note" label="Anything the reading should know" labelSize="s" rows={2}
                    hint="Optional. Why it bears on this, where it came from." />
          <p className="govuk-body-s prt-meta">
            It is graded like any other source: supplying it makes it relevant, not strong. This
            runs four steps, so it costs something.
          </p>
          <Button type="submit" variant="secondary" disabled={busy !== null}>
            {busy === 'source' ? 'Starting…' : 'Read it against this'}
          </Button>
        </form>
      </Details>
      <Details summary="Look this up" id={`${key}-search`} open={errors.some((e) => e.href.endsWith('-lookup'))}>
        <form onSubmit={(e) => void send('lookup', e)} noValidate>
          <Input id={`${key}-lookup`} name="lookUp" label="What should be looked up?" labelSize="s" maxLength={300}
                 hint="A few words, as you would type them into a search. No names, addresses or contact details — they are not sent to a search service." />
          <p className="govuk-body-s prt-meta">
            What the search returns is read as search snippets — weak evidence at best — against this
            item first.
          </p>
          <Button type="submit" variant="secondary" disabled={busy !== null}>
            {busy === 'lookup' ? 'Starting…' : 'Look it up'}
          </Button>
        </form>
      </Details>
    </div>
  );
}
