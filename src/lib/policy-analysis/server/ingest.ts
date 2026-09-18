import { createHash } from 'node:crypto';
import { extractPdf } from '$lib/jkai/extract/pdf';
import { extractDocx } from '$lib/jkai/extract/docx';
import type { DocxBlock } from '$lib/jkai/extract/types';
import { artefact, CONCURRENCY_OPTIONS, DEPTHS, EXTRACTIONS, MATERIAL_ROLES, MAX_BYTES, MAX_CHARACTERS, MAX_PAGES, type Artefact, type Concurrency, type Depth, type Extraction, type MaterialRole, type StageOutput } from '../contracts';
import { isOfferedModel } from '$lib/server/models/catalogue';
import { isThinkingLevel, thinkingLevelsFor, type ThinkingLevel } from '$lib/models/thinking';
import { PolicyError } from '../validation';

export type Submission = { title: string; jurisdiction: string | null; policyArea: string | null; context: string | null; depth: Depth; model: string | null; thinkingLevel: ThinkingLevel | null; concurrency: Concurrency | null; extraction: Extraction | null; sharedContextFirst: boolean; sealed: boolean; sealedResearch: boolean; filename: string; mimeType: string; bytes: Buffer };
const MIME: Record<string, string> = { txt: 'text/plain', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
export function validateBytes(bytes: Buffer, filename: string, mimeType: string): string {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new PolicyError('size', 'Supply a nonempty document of at most 10 MB.');
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const expected = MIME[extension];
  if (!expected || (mimeType && mimeType !== 'application/octet-stream' && mimeType !== expected)) throw new PolicyError('type', 'Use a PDF, DOCX or UTF-8 TXT document.');
  if (extension === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new PolicyError('type', 'The file is not a PDF.');
  if (extension === 'docx') {
    if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new PolicyError('type', 'The file is not a DOCX.');
    let expanded = 0, entries = 0;
    // Read ZIP central directory sizes before handing the archive to Mammoth.
    for (let i = 0; i + 46 <= bytes.length; i++) {
      if (bytes.readUInt32LE(i) !== 0x02014b50) continue;
      const size = bytes.readUInt32LE(i + 24);
      const nameLength = bytes.readUInt16LE(i + 28);
      const name = bytes.subarray(i + 46, i + 46 + nameLength).toString();
      expanded += size; entries++;
      if (size === 0xffffffff || expanded > 30 * 1024 * 1024 || entries > 2000 || name.split(/[\\/]/).includes('..')) throw new PolicyError('archive', 'The DOCX archive exceeds safe extraction limits.');
      i += 45 + nameLength + bytes.readUInt16LE(i + 30) + bytes.readUInt16LE(i + 32);
    }
    if (!entries) throw new PolicyError('archive', 'The DOCX archive has no readable directory.');
  }
  return expected;
}
export async function readSubmission(request: Request): Promise<Submission> {
  const limit = MAX_BYTES + 700_000;
  if (Number(request.headers.get('content-length')) > limit) throw new PolicyError('size', 'The submission exceeds the upload limit.');
  const reader = request.body?.getReader();
  if (!reader) throw new PolicyError('input', 'No submission was received.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new PolicyError('size', 'The submission exceeds the upload limit.'); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Request('http://policy.invalid', { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new PolicyError('input', 'Use the policy submission form.'); }
  const str = (key: string, max: number) => {
    const v = form.get(key);
    if (v != null && typeof v !== 'string') throw new PolicyError('input', 'Invalid form field.');
    const s = (v ?? '').trim();
    if (s.length > max) throw new PolicyError('input', `${key} exceeds its length limit.`);
    return s;
  };
  const title = str('title', 240);
  if (!title) throw new PolicyError('input', 'Enter a title.');
  const pasted = str('text', MAX_CHARACTERS);
  const file = form.get('document');
  const uploaded = file && typeof file !== 'string' && file.size > 0;
  if (uploaded && pasted) throw new PolicyError('input', 'Supply either a document or pasted text.');
  // Without this, an empty submission fell through to the byte check and was told
  // its document exceeded 10 MB.
  if (!uploaded && !pasted) throw new PolicyError('input', 'Attach a policy document or paste its text.');
  const filename = uploaded ? file.name.replace(/^.*[\\/]/, '').slice(0, 200) : 'policy.txt';
  const bytes = uploaded ? Buffer.from(await file.arrayBuffer()) : Buffer.from(pasted);
  const mimeType = validateBytes(bytes, filename, uploaded ? file.type : 'text/plain');
  const requested = str('depth', 20);
  const depth: Depth = (DEPTHS as readonly string[]).includes(requested) ? requested as Depth : 'standard';
  // Model and effort are a REQUEST, not a promise. An id nobody catalogues, or an
  // effort the chosen model would answer with a 400, falls back to the workload
  // default rather than failing a submission the reader cannot debug — and the
  // run records what it actually called, so the page never claims a model that
  // never answered.
  const askedModel = str('model', 120);
  const model = isOfferedModel(askedModel) ? askedModel : null;
  const askedEffort = str('thinkingLevel', 20);
  const offered = thinkingLevelsFor('openrouter', model);
  const thinkingLevel = isThinkingLevel(askedEffort) && offered.includes(askedEffort) ? askedEffort : null;
  // How many units of a fan-out run at once. Same rule as the two above: an
  // unoffered number is a request the run cannot honour, and taking the default
  // beats refusing a submission over a dropdown. It never reaches the model — it
  // is an execution setting, and `PipelineDeps` says why that matters.
  const askedAgents = Number(str('concurrency', 4));
  const concurrency = (CONCURRENCY_OPTIONS as readonly number[]).includes(askedAgents) ? askedAgents as Concurrency : null;
  // SEALED IS THE ONE FIELD THAT CANNOT DEGRADE TO A DEFAULT.
  //
  // Model, effort and concurrency all fall back when the form asks for something
  // the run cannot honour, because failing a submission over a dropdown is worse
  // than running on the default. This is the opposite: a reader who ticked the box
  // and got an unsealed run would have handed an unpublished paper to a system
  // they were told would destroy it. Anything but the exact string is false, and
  // false is what the form sends when the box is clear.
  const sealed = str('sealed', 10) === 'true';
  // WIDENING EXPOSURE, so it reads the same way round as `sealed` does: the
  // exact string or nothing. A sealed run that searched when the reader had not
  // said it could is the failure that matters here, and the absent-field case
  // has to land on the value that leaks less.
  //
  // Only meaningful when sealed. Storing it false on an unsealed run keeps the
  // column honest — an unsealed run does not need permission, it always searches
  // — and stops a later reader mistaking it for a run that was denied one.
  const sealedResearch = sealed && str('sealedResearch', 10) === 'true';
  // BOTH DEGRADE TO THE DEFAULT, deliberately, and on the side that changes
  // nothing. They are quality experiments, not guarantees: a form that fails to
  // send either must produce the assessment this feature has always produced,
  // which is the prose contract and the per-call context. That is the opposite
  // of `sealed` above, where the absent field has to land on the safer value
  // rather than the familiar one — there is no safety here to get wrong, only
  // a comparison to keep honest.
  const askedExtraction = str('extraction', 20);
  const extraction = (EXTRACTIONS as readonly string[]).includes(askedExtraction) ? askedExtraction as Extraction : null;
  const sharedContextFirst = str('sharedContextFirst', 10) === 'true';
  return { title, jurisdiction: str('jurisdiction', 200) || null, policyArea: str('policyArea', 200) || null, context: str('context', 5000) || null, depth, model, thinkingLevel, concurrency, extraction, sharedContextFirst, sealed, sealedResearch, filename, mimeType, bytes };
}
/**
 * Material attached to an assessment that has already reported.
 *
 * Deliberately NOT a variant of `readSubmission`. They share the file rules —
 * `validateBytes` is the one place those live — and nothing else: there is no
 * title, no jurisdiction, no depth, no model, no seal. A pass inherits every one
 * of those from the assessment it is attached to, and offering them again would
 * let a reader attach material to a sealed run under a different seal.
 *
 * `role` is the one field that does NOT degrade to a default, for the same
 * reason `sealed` does not at submission: it changes how the model is told to
 * read the document, and a rebuttal silently read as a later draft would report
 * the policy as superseding itself. An unknown value is refused rather than
 * quietly becoming "other".
 */
export type Material = { role: MaterialRole; note: string | null; filename: string; mimeType: string; bytes: Buffer };
export async function readMaterial(request: Request): Promise<Material> {
  const limit = MAX_BYTES + 700_000;
  if (Number(request.headers.get('content-length')) > limit) throw new PolicyError('size', 'The attachment exceeds the upload limit.');
  const reader = request.body?.getReader();
  if (!reader) throw new PolicyError('input', 'No material was received.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new PolicyError('size', 'The attachment exceeds the upload limit.'); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Request('http://policy.invalid', { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new PolicyError('input', 'Use the material form.'); }
  const str = (key: string, max: number) => {
    const v = form.get(key);
    if (v != null && typeof v !== 'string') throw new PolicyError('input', 'Invalid form field.');
    const value = (v ?? '').trim();
    if (value.length > max) throw new PolicyError('input', `${key} exceeds its length limit.`);
    return value;
  };
  const asked = str('role', 40);
  if (!MATERIAL_ROLES.some(([key]) => key === asked)) throw new PolicyError('input', 'Say what kind of material this is.');
  const pasted = str('text', MAX_CHARACTERS);
  const file = form.get('material');
  const uploaded = file && typeof file !== 'string' && file.size > 0;
  if (uploaded && pasted) throw new PolicyError('input', 'Supply either a document or pasted text.');
  if (!uploaded && !pasted) throw new PolicyError('input', 'Attach a document or paste its text.');
  const filename = uploaded ? file.name.replace(/^.*[\\/]/, '').slice(0, 200) : 'material.txt';
  const bytes = uploaded ? Buffer.from(await file.arrayBuffer()) : Buffer.from(pasted);
  const mimeType = validateBytes(bytes, filename, uploaded ? file.type : 'text/plain');
  return { role: asked as MaterialRole, note: str('note', 2000) || null, filename, mimeType, bytes };
}

/** Longest passage handed to a stage. A block bigger than this is split at a line. */
const PASSAGE_CHARACTERS = 7000;

type Section = {
  text: string;
  page: number | null;
  section: string;
  /**
   * The structural units `text` is made of, joined by a blank line. Present for
   * formats that know their own structure; the chunker fills a passage with whole
   * units so a cut lands between them rather than through one.
   */
  blocks?: string[];
};

/**
 * Cut a Word document into sections at its own headings.
 *
 * A PDF gets one section per page and a citation can say "Page 12". A DOCX has no
 * pages to number, so every passage of every Word document was labelled
 * `Policy text · passage 7` — which tells a reader checking a claim nothing at
 * all. mammoth already recovers the heading tree; this spends it. Footnotes get a
 * section of their own because they are not part of the heading they follow.
 */
function docxSections(blocks: DocxBlock[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  const open = (name: string) => {
    current = { text: '', page: null, section: name, blocks: [] };
    sections.push(current);
  };
  for (const block of blocks) {
    if (block.kind === 'heading') open(block.text);
    else if (block.kind === 'footnotes') open('Footnotes');
    else if (!current) open('Policy text');
    current!.blocks!.push(block.text);
  }
  for (const section of sections) section.text = section.blocks!.join('\n\n');
  return sections;
}

/**
 * `idPrefix` NAMESPACES THE PASSAGES, and it exists because material attached
 * after the report is ingested by this same function.
 *
 * Passage ids are `passage_0001`, with no stage prefix — every other artefact in
 * the feature carries `s<stage>_`, but these are minted on the server before any
 * model is involved and never needed one. Ingesting a second document into the
 * SAME analysis does need one: `policy_artefacts` is keyed on
 * `(analysis_id, id)`, so an addendum's first passage would collide with the
 * policy's first passage and the insert would fail mid-pass.
 *
 * Defaulted to empty rather than made required, so the main run's ids are
 * byte-for-byte what they have always been. Changing them would orphan every
 * `sourceId` in every assessment already stored.
 */
export async function ingest(bytes: Buffer, filename: string, mimeType: string, idPrefix = ''): Promise<StageOutput & { text: string; metadata: unknown }> {
  validateBytes(bytes, filename, mimeType);
  let text = ''; let metadata: unknown = {}; const warnings: string[] = [];
  let sections: Section[] = [];
  try {
    if (mimeType === MIME.pdf) {
      const result = await extractPdf(bytes, { maxPages: MAX_PAGES, maxCharacters: MAX_CHARACTERS });
      text = result.text; metadata = result.meta;
      if (result.meta.kind === 'pdf') sections = result.meta.pages.map((p) => {
        if (p.error || !p.text.trim()) warnings.push(`Page ${p.index}: no readable text; scanned content may need OCR.`);
        return { text: p.text, page: p.index, section: `Page ${p.index}` };
      });
    } else if (mimeType === MIME.docx) {
      const result = await extractDocx(bytes); text = result.text; metadata = result.meta;
      if (result.meta.kind === 'docx') {
        warnings.push(...result.meta.warnings);
        // Said before the fallback below, because a document with no headings at
        // all genuinely has nothing but offsets to cite.
        sections = docxSections(result.meta.blocks ?? []);
      }
      warnings.push(sections.length > 1
        ? 'DOCX has no page numbers; references cite the document\u2019s own headings and text offsets.'
        : 'DOCX has no page numbers and no headings to cite; references use text offsets alone.');
    } else {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw new Error('binary');
    }
  } catch (err) {
    // `extractPdf` throws its own limit errors, wrapped, and a bare catch here
    // told a 400-page policy that its PDF might need OCR. Read the cause.
    const chain: string[] = [];
    for (let e: unknown = err, depth = 0; e && depth < 4; depth++) { chain.push(String((e as Error)?.message ?? e)); e = (e as { cause?: unknown }).cause; }
    const reason = chain.join(' | ');
    if (reason.includes('exceeds page limit')) throw new PolicyError('extraction', `This PDF has more than ${MAX_PAGES} pages, which is the limit for one submission. Submit it in parts; the cross-policy stage will compare them against each other.`);
    if (reason.includes('exceeds extracted text limit')) throw new PolicyError('extraction', `This PDF holds more than ${MAX_CHARACTERS / 1000},000 characters of text, which is the limit for one submission. Submit it in parts; the cross-policy stage will compare them against each other.`);
    throw new PolicyError('extraction', 'Document extraction failed. Try a text-based PDF, DOCX or UTF-8 TXT, or paste the policy text.');
  }
  // Two very different problems used to share one message, so a 300-page policy
  // was told its PDF might need OCR.
  if (!text.trim()) throw new PolicyError('extraction', 'No readable text was found. A scanned PDF needs OCR before submission, or paste the policy text instead.');
  if (text.length > MAX_CHARACTERS) throw new PolicyError('extraction', `This document holds ${Math.round(text.length / 1000).toLocaleString()},000 characters of text and the limit is ${MAX_CHARACTERS / 1000},000 — roughly ${Math.round(MAX_CHARACTERS / 3000)} pages. Submit it in parts; the cross-policy stage will compare them against each other.`);
  if (!sections.length) sections = [{ text, page: null, section: 'Policy text' }];
  const hash = createHash('sha256').update(bytes).digest('hex');
  const artefacts: Artefact[] = []; let offset = 0;
  // Bound each passage without dropping text; offsets refer to this canonical extraction.
  const canonical = sections.map((s) => s.text).join('\n\n');
  for (const s of sections) {
    // Zero-padded: artefacts load back ordered by id, so `passage_10` must not
    // sort between `passage_1` and `passage_2` and shuffle the document.
    const emit = (passage: string, at: number) => {
      if (!passage.trim()) return;
      const id = `${idPrefix}passage_${String(artefacts.length + 1).padStart(4, '0')}`;
      artefacts.push(artefact(id, 'passage', `${s.section} · passage ${artefacts.length + 1}`, passage, { documentHash: hash }, { origin: 'extracted_fact', confidence: 1, page: s.page, section: s.section, startOffset: offset + at, endOffset: offset + at + passage.length }));
    };
    // Fill a passage with whole blocks where the format knew its own structure.
    // The old loop cut every 7,000 characters regardless, which put half a table
    // row at the end of one passage and half at the start of the next.
    const units = s.blocks?.length ? s.blocks : [s.text];
    let cursor = 0;   // where the next unit starts inside `s.text`
    let held = '';    // the passage being filled
    let heldAt = 0;
    for (const unit of units) {
      if (unit.length > PASSAGE_CHARACTERS) {
        if (held) { emit(held, heldAt); held = ''; }
        // A single block too big for a passage breaks at a LINE boundary, so a
        // long table parts between rows. The continuation does NOT get a repeated
        // header: a passage has to stay a verbatim span of the extracted text or
        // the offsets stop pointing at what they claim to.
        let cut = 0;
        while (cut < unit.length) {
          let end = Math.min(cut + PASSAGE_CHARACTERS, unit.length);
          if (end < unit.length) {
            const newline = unit.lastIndexOf('\n', end);
            if (newline > cut) end = newline;
          }
          emit(unit.slice(cut, end), cursor + cut);
          cut = end < unit.length ? end + 1 : end;
        }
      } else if (held && held.length + 2 + unit.length > PASSAGE_CHARACTERS) {
        emit(held, heldAt);
        held = unit; heldAt = cursor;
      } else if (held) {
        held += `\n\n${unit}`;
      } else {
        held = unit; heldAt = cursor;
      }
      cursor += unit.length + 2;
    }
    if (held) emit(held, heldAt);
    offset += s.text.length + 2;
  }
  return { artefacts, warnings, text: canonical, metadata };
}
