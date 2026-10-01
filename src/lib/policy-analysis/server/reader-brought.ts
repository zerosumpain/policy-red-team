import { fetchPage, PageError } from '$lib/server/fetch-page';
import { safeSourceUrl } from '../contracts';
import type { ReaderBrought } from '../pipeline';
import { lookUpQuery, MAX_SUPPLIED_CHARACTERS, type SuppliedSource } from '../reader-inputs';
import { ingest } from './ingest';

/** One stored row of `policy_reader_inputs`, unsealed. */
export type ReaderInputRow = {
  kind: string; url: string | null; filename: string | null; mimeType: string | null; content: string | null;
  about: string | null; note: string | null; wording: string | null;
};

/**
 * TURN WHAT THE READER STORED INTO WHAT STAGE 5 READS (phase 22 part 2).
 *
 * A file is extracted by the same `ingest()` the paper goes through, and its
 * text kept up to a little past the cap — `readerArtefacts` decides what the
 * matrix sees and says when it cut. A page is fetched NOW, at stage 5, and only
 * when `mayFetch`: never on a sealed run (which page a sealed paper's reader
 * pointed at says something about the paper) and never on an install whose
 * search is `none` (a reader saying their estate does not reach the open web).
 * A page that was not fetched, or could not be, is still listed — with the
 * reason — so the reader sees it was received and why nothing came of it.
 *
 * A look-up's query is built again here from the stored words rather than
 * trusted from submission, so a guard tightened between the two applies.
 */
export async function resolveReaderInputs(rows: ReaderInputRow[], options: { mayFetch: boolean; why: string; signal?: AbortSignal; fetch?: typeof fetchPage }): Promise<ReaderBrought> {
  const read = options.fetch ?? fetchPage;
  const supplied: SuppliedSource[] = [];
  const lookUps: ReaderBrought['lookUps'] = [];
  for (const row of rows) {
    const about = row.about?.trim() || null;
    const note = row.note?.trim() || null;
    if (row.kind === 'look_up' && row.wording) {
      const built = lookUpQuery(row.wording);
      if ('query' in built) lookUps.push({ wording: row.wording, query: built.query });
    } else if (row.kind === 'file' && row.content && row.filename && row.mimeType) {
      try {
        const { text } = await ingest(Buffer.from(row.content, 'base64'), row.filename, row.mimeType);
        supplied.push({ form: 'file', url: null, title: row.filename, text: text.slice(0, MAX_SUPPLIED_CHARACTERS + 1), failure: null, about, note });
      } catch {
        supplied.push({ form: 'file', url: null, title: row.filename, text: null, failure: 'no readable text was found in the file', about, note });
      }
    } else if (row.kind === 'page' && row.url) {
      const host = (() => { try { return new URL(row.url!).hostname; } catch { return row.url!; } })();
      if (!options.mayFetch) {
        supplied.push({ form: 'page', url: safeSourceUrl(row.url), title: host, text: null, failure: options.why, about, note });
        continue;
      }
      try {
        const page = await read(row.url, { signal: options.signal, maxCharacters: MAX_SUPPLIED_CHARACTERS + 1 });
        supplied.push({ form: 'page', url: safeSourceUrl(page.finalUrl) ?? safeSourceUrl(row.url), title: page.title || host, text: page.text, failure: null, about, note });
      } catch (err) {
        options.signal?.throwIfAborted();
        supplied.push({ form: 'page', url: safeSourceUrl(row.url), title: host, text: null, failure: err instanceof PageError ? err.message.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase()) : 'the page could not be reached', about, note });
      }
    }
  }
  return { supplied, lookUps };
}
