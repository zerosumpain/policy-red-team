import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, type OfferedModel } from '../api';
import { Button, ButtonGroup, ErrorSummary, FileUpload, Input, Radios, Select, Textarea, WarningText } from '../govuk';

/**
 * Commissioning an assessment.
 *
 * ONE PAGE, NOT ONE QUESTION PER PAGE, and that is a departure from GOV.UK's
 * default worth being explicit about. One-thing-per-page exists for services
 * where the person filling the form is doing it once, under stress, possibly on a
 * phone. This is a tool its owner uses repeatedly and deliberately, and eight
 * pages to start a run they will start again tomorrow is friction with nothing on
 * the other side of it. The grouping, the hints and the error summary are kept;
 * the pagination is not.
 *
 * Everything except the paper itself degrades. A model this build cannot reach,
 * an effort it will not take, an unknown depth — each falls back to a default
 * rather than failing a submission over a dropdown. Sealing is the one field that
 * does not, because a reader who ticked the box and got an unsealed run would
 * have handed an unpublished paper to a system they were told would destroy it.
 */
export function New() {
  const navigate = useNavigate();
  const [models, setModels] = useState<OfferedModel[]>([]);
  const [depth, setDepth] = useState('standard');
  const [sealed, setSealed] = useState(false);
  const [errors, setErrors] = useState<{ text: string; href: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.landing().then((data) => setModels(data.models)).catch(() => setModels([]));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // Checked here as well as on the server, because an error summary that
    // appears without a round trip is the difference between a form that feels
    // broken and one that feels answered.
    const found: { text: string; href: string }[] = [];
    if (!String(form.get('title') ?? '').trim()) found.push({ text: 'Enter a title for this assessment', href: '#title' });
    const file = form.get('document');
    if (!(file instanceof File) || !file.size) found.push({ text: 'Select the paper to assess', href: '#document' });
    setErrors(found);
    if (found.length) return;

    form.set('depth', depth);
    form.set('sealed', sealed ? 'sealed' : '');
    setSubmitting(true);
    try {
      const { id } = await api.submit(form);
      void navigate(`/assessments/${id}`);
    } catch (err) {
      setErrors([{ text: (err as Error).message, href: '#document' }]);
      setSubmitting(false);
    }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <ErrorSummary errors={errors} />
        <h1 className="govuk-heading-xl">Assess a paper</h1>

        <form onSubmit={onSubmit} noValidate>
          <Input id="title" label="What is this paper called?" labelSize="s"
                 hint="Use the title on the front of the document." />
          <FileUpload id="document" name="document" label="The paper" labelSize="s"
                      hint="PDF, DOCX or UTF-8 text, up to 10 MB. It must have a text layer — a scan of a page yields nothing."
                      accept=".pdf,.docx,.txt" />
          <Input id="jurisdiction" label="Jurisdiction" labelSize="s"
                 hint="Optional. England, Scotland, Wales, Northern Ireland, or UK-wide." />
          <Input id="policyArea" name="policyArea" label="Policy area" labelSize="s" hint="Optional." />
          <Textarea id="context" label="Anything the paper does not say" labelSize="s" rows={4}
                    hint="Optional. What you already know that the assessment should take into account." />

          <Radios
            id="depth" legend="How deeply should it read?" legendSize="s"
            hint="A deep read follows each line of enquiry further, and costs more."
            value={depth} onChange={setDepth}
            items={[
              { value: 'standard', text: 'Standard', hint: 'One pass over every passage.' },
              { value: 'deep', text: 'Deep', hint: 'Keeps going until a line of enquiry stops producing new evidence.' },
            ]}
          />

          {models.length ? (
            <Select
              id="model" label="Which model?" labelSize="s"
              hint="Optional. Leave it alone and the configured default is used. Decomposition makes one call per passage, so this is a bill, not a rounding error."
              options={[{ value: '', text: 'Use the default' }, ...models.map((m) => ({ value: m.id, text: `${m.name} — ${m.tier}` }))]}
            />
          ) : null}

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Sealing</legend>
              <div className="govuk-checkboxes govuk-checkboxes--small" data-module="govuk-checkboxes">
                <div className="govuk-checkboxes__item">
                  <input className="govuk-checkboxes__input" id="sealed" type="checkbox"
                         checked={sealed} onChange={(e) => setSealed(e.currentTarget.checked)}
                         aria-describedby="sealed-hint" />
                  <label className="govuk-label govuk-checkboxes__label" htmlFor="sealed">
                    Seal this assessment
                  </label>
                  <div id="sealed-hint" className="govuk-hint govuk-checkboxes__hint">
                    None of the paper is written to the database in the clear.
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {sealed ? (
            <WarningText>
              Destroying the key destroys the run. There is no recovery, by design — back up the
              key directory deliberately or accept that a purge is final.
            </WarningText>
          ) : null}

          <ButtonGroup>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Starting…' : 'Start the assessment'}
            </Button>
            <a className="govuk-link" href="/">Cancel</a>
          </ButtonGroup>
        </form>
      </div>
    </div>
  );
}
