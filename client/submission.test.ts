// The form and the server parse the same fields, and the sealed box once
// disagreed in silence (see submission.ts). Every case goes through the real
// `readSubmission`, so the two cannot drift apart again without this failing.
import { describe, expect, it } from 'vitest';
import { readSubmission } from '../src/lib/policy-analysis/server/ingest';
import { stampSubmission } from './submission';

function parse(sealed: boolean) {
  const form = new FormData();
  form.set('title', 'A paper');
  form.set('text', 'The Council is accountable for delivery.');
  stampSubmission(form, { depth: 'standard', lanes: '6', sealed });
  return readSubmission(new Request('http://localhost', { method: 'POST', body: form }));
}

describe('what the submission form sends', () => {
  it('a ticked sealed box reaches the server as a sealed run', async () => {
    expect((await parse(true)).sealed).toBe(true);
  });

  it('a clear box is an unsealed run', async () => {
    expect((await parse(false)).sealed).toBe(false);
  });

  it('depth and lanes arrive as chosen', async () => {
    const got = await parse(false);
    expect(got.depth).toBe('standard');
    expect(got.concurrency).toBe(6);
  });
});
