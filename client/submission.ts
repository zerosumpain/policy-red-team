/**
 * The fields the submission form sets itself, rather than leaving to its inputs.
 *
 * THE SEALED BOX SEALED NOTHING from phase 4 until phase 23. The form sent
 * `sealed=sealed`; `readSubmission` accepts the exact string `true` and reads
 * anything else as false, on purpose, because a malformed value must land on
 * the side that leaks less. So a ticked box produced an unsealed run: the paper
 * stored in the clear, offered to the persona library and to every later run as
 * a neighbour. No sealed run was ever submitted from the page, so none leaked.
 *
 * It lives here, outside the component, so `submission.test.ts` can hand what
 * this writes to the real server parser and fail when the two stop agreeing.
 */
export type FormChoices = { depth: string; lanes: string; sealed: boolean };

export function stampSubmission(form: FormData, { depth, lanes, sealed }: FormChoices): FormData {
  form.set('depth', depth);
  form.set('concurrency', lanes);
  form.set('sealed', sealed ? 'true' : 'false');
  return form;
}
