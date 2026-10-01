import { useEffect, useRef, useState } from 'react';
import { FileUpload, Input, Textarea } from '../govuk';
import { MAX_LOOK_UPS, MAX_READER_SOURCES } from '$lib/policy-analysis/reader-inputs';

/**
 * "SOURCES IT SHOULD USE" AND "THINGS TO LOOK UP", ON THE SUBMISSION FORM
 * (phase 22 part 2).
 *
 * GOV.UK's add-another, done the simple way: a fieldset per entry, an "Add
 * another" button under the list, and a "Remove" button on every entry but a
 * lone one. No JavaScript-free fallback is needed — this form is already one
 * that only works with the page's script. Entries keep a stable key, so
 * removing the second of three leaves the third's file picker holding its
 * file; the NAMES are numbered by position (`sourceUrl.0`, `lookUp.2`), which
 * is what `readSubmission` reads.
 *
 * Optional, and said so in the legend, because almost every run will leave
 * both empty and a blank row is the form's spare, not a mistake: the server
 * skips a row with nothing in it and refuses one with words but no source.
 *
 * Focus moves to the new entry's first field on "Add another" and back to the
 * add button on "Remove", the two things a keyboard user loses otherwise.
 */
export function SourcesItShouldUse({ sealed }: { sealed: boolean }) {
  const [rows, setRows] = useState<number[]>([0]);
  const next = useRef(1);
  const add = useRef<HTMLButtonElement>(null);
  // Moved AFTER the commit that draws the entry, not in a frame that may
  // run before it: what to focus is noted, and this effect does it.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'add') add.current?.focus();
    else if (target) document.getElementById(target)?.focus();
  }, [rows]);

  const addRow = () => {
    const key = next.current++;
    setRows((current) => [...current, key]);
    focusAfter.current = `source-url-${rows.length}`;
  };
  const removeRow = (key: number) => {
    setRows((current) => current.filter((k) => k !== key));
    focusAfter.current = 'add';
  };

  return (
    <div className="govuk-form-group prt-add-another">
      <fieldset className="govuk-fieldset" aria-describedby="sources-hint">
        <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Sources it should use (optional)</legend>
        <div id="sources-hint" className="govuk-hint">
          An evaluation, a report or a page you already know bears on this paper. Each is read in
          full and graded like any other source — supplying it makes it relevant, not strong.
          {sealed ? ' This assessment is sealed, so a web address is not fetched: attach the file instead.' : ''}
        </div>
        {rows.map((key, i) => (
          <fieldset key={key} className="govuk-fieldset prt-add-another__item">
            <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Source {i + 1}</legend>
            <Input id={`source-url-${i}`} name={`sourceUrl.${i}`} label="Its web address" labelSize="s" type="url" spellCheck={false}
                   hint="A public page. Or attach a file below — one or the other." />
            <FileUpload id={`source-file-${i}`} name={`sourceFile.${i}`} label="Or attach it" labelSize="s"
                        hint="PDF, Word or plain text, up to 2 MB." accept=".pdf,.docx,.txt" />
            <Input id={`source-about-${i}`} name={`sourceAbout.${i}`} label="What is it about?" labelSize="s" maxLength={200}
                   hint="Optional. A body, a part of the policy, a topic or a risk. Where it names something in the paper, the source is linked to it." />
            <Textarea id={`source-note-${i}`} name={`sourceNote.${i}`} label="A note on it" labelSize="s" rows={2} maxLength={1000}
                      hint="Optional. Why it matters, or what to look for in it." />
            {rows.length > 1 ? (
              <button type="button" className="govuk-button govuk-button--secondary prt-add-another__remove" onClick={() => removeRow(key)}>
                Remove<span className="govuk-visually-hidden"> source {i + 1}</span>
              </button>
            ) : null}
          </fieldset>
        ))}
        {rows.length < MAX_READER_SOURCES ? (
          <button ref={add} type="button" className="govuk-button govuk-button--secondary" onClick={addRow}>
            Add another source
          </button>
        ) : (
          <p className="govuk-body-s prt-meta">That is the most one assessment takes: {MAX_READER_SOURCES}.</p>
        )}
      </fieldset>
    </div>
  );
}

export function ThingsToLookUp() {
  const [rows, setRows] = useState<number[]>([0]);
  const next = useRef(1);
  const add = useRef<HTMLButtonElement>(null);
  // Moved AFTER the commit that draws the entry, not in a frame that may
  // run before it: what to focus is noted, and this effect does it.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'add') add.current?.focus();
    else if (target) document.getElementById(target)?.focus();
  }, [rows]);

  const addRow = () => {
    const key = next.current++;
    setRows((current) => [...current, key]);
    focusAfter.current = `look-up-${rows.length}`;
  };
  const removeRow = (key: number) => {
    setRows((current) => current.filter((k) => k !== key));
    focusAfter.current = 'add';
  };

  return (
    <div className="govuk-form-group prt-add-another">
      <fieldset className="govuk-fieldset" aria-describedby="look-ups-hint">
        <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">Things to look up (optional)</legend>
        <div id="look-ups-hint" className="govuk-hint">
          Questions you want checked against published evidence. They are asked before anything the
          assessment thinks of itself. Write them as you would type them into a search — no names,
          addresses or contact details: they are sent to a search service.
        </div>
        {rows.map((key, i) => (
          <div key={key} className="prt-add-another__item prt-add-another__item--inline">
            <Input id={`look-up-${i}`} name={`lookUp.${i}`} label={`Thing to look up ${i + 1}`} labelSize="s" maxLength={300} />
            {rows.length > 1 ? (
              <button type="button" className="govuk-button govuk-button--secondary prt-add-another__remove" onClick={() => removeRow(key)}>
                Remove<span className="govuk-visually-hidden"> thing to look up {i + 1}</span>
              </button>
            ) : null}
          </div>
        ))}
        {rows.length < MAX_LOOK_UPS ? (
          <button ref={add} type="button" className="govuk-button govuk-button--secondary" onClick={addRow}>
            Add another thing to look up
          </button>
        ) : (
          <p className="govuk-body-s prt-meta">That is the most one assessment takes: {MAX_LOOK_UPS}.</p>
        )}
      </fieldset>
    </div>
  );
}

/** Where a server refusal about one entry should send the error summary's link. */
export function readerErrorHref(message: string): string | null {
  const source = /^Source (\d+):/.exec(message);
  if (source) return `#source-url-${Number(source[1]) - 1}`;
  const lookUp = /^Thing to look up (\d+):/.exec(message);
  if (lookUp) return `#look-up-${Number(lookUp[1]) - 1}`;
  return null;
}
