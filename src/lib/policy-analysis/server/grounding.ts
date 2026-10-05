import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '$lib/db';
import { policyAnalyses, policyGrounding, policyPolicies, policyRunGrounding } from '$lib/db/schema';
import { fetchPage, PageError } from '$lib/server/fetch-page';
import { GROUNDING_ROLE_LABELS, GROUNDING_ROLES, MAX_GROUNDING_CHARACTERS, MAX_GROUNDING_CHARACTERS_PER_ITEM, MAX_GROUNDING_ITEMS, safeSourceUrl, type Artefact } from '../contracts';
import { PolicyError } from '../validation';
import { ingest, type GroundingInput } from './ingest';
import { sealRow, unsealRow, type Seal } from './seal';

/**
 * THE GROUNDING LIBRARY, REUSED PER POLICY (phase 25, John's decision of
 * 5 October): material a reader trusts to judge a policy by is attached ONCE
 * to the policy and every run of that policy uses it.
 *
 * Three places it lives, and why three:
 *
 *   - `policy_policies` — the policy: a name drafts and re-runs share.
 *   - `policy_grounding` — its library. The owner's, in the clear, shared by
 *     every run of the policy. NEVER written from a sealed run.
 *   - `policy_run_grounding` — what ONE run was given: a copy taken at
 *     submission. A run reads only this, so it reads the same material however
 *     the library changes afterwards, a library item deleted mid-run costs it
 *     nothing, and a sealed run's copy is sealed with the run and purged with it.
 *
 * A page given by address is fetched by THIS server through the SSRF-guarded
 * page reader — at once when added on the library page, otherwise when the run
 * starts, under the same three refusals as a reader's source: never for a
 * sealed run, never for a run that may not search, never on an install set to
 * `none`. A fetch made for an unsealed run is written back to the library, so
 * the next run of the policy does not fetch it again.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PolicyRow = { id: string; name: string; createdAt: Date; items: number; runs: number };

export async function listPolicies(owner: string): Promise<PolicyRow[]> {
  const rows = await db.select({ id: policyPolicies.id, name: policyPolicies.name, createdAt: policyPolicies.createdAt }).from(policyPolicies).where(eq(policyPolicies.owner, owner)).orderBy(asc(sql`lower(${policyPolicies.name})`)).limit(500);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = await db.select({ policyId: policyGrounding.policyId, n: sql<number>`count(*)::int` }).from(policyGrounding).where(inArray(policyGrounding.policyId, ids)).groupBy(policyGrounding.policyId);
  const runs = await db.select({ policyId: policyAnalyses.policyId, n: sql<number>`count(*)::int` }).from(policyAnalyses).where(and(eq(policyAnalyses.owner, owner), inArray(policyAnalyses.policyId, ids))).groupBy(policyAnalyses.policyId);
  const count = (list: { policyId: string | null; n: number }[], id: string) => list.find((r) => r.policyId === id)?.n ?? 0;
  return rows.map((r) => ({ ...r, items: count(items, r.id), runs: count(runs, r.id) }));
}

/** A new policy, or the owner's existing one of the same name (case and spacing aside). */
export async function createPolicy(owner: string, name: string, tx: DbExecutor = db): Promise<{ id: string; name: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) throw new PolicyError('input', 'Give the policy a name.');
  const [existing] = await tx.select({ id: policyPolicies.id, name: policyPolicies.name }).from(policyPolicies).where(and(eq(policyPolicies.owner, owner), sql`lower(${policyPolicies.name}) = lower(${clean})`)).limit(1);
  if (existing) return existing;
  const [row] = await tx.insert(policyPolicies).values({ owner, name: clean }).returning({ id: policyPolicies.id, name: policyPolicies.name });
  return row;
}

export async function ownedPolicy(owner: string, id: string, tx: DbExecutor = db) {
  if (!UUID.test(id)) return null;
  const [row] = await tx.select().from(policyPolicies).where(and(eq(policyPolicies.id, id), eq(policyPolicies.owner, owner))).limit(1);
  return row ?? null;
}

/** A library item as the pages see it: never its bytes, never its text. */
export type LibraryItem = {
  id: string; role: string; roleLabel: string; title: string; publisher: string | null; publishedOn: string | null;
  url: string | null; filename: string | null; size: number | null; characters: number | null;
  fetchedAt: Date | null; error: string | null; createdAt: Date;
};

const itemColumns = {
  id: policyGrounding.id, role: policyGrounding.role, title: policyGrounding.title, publisher: policyGrounding.publisher, publishedOn: policyGrounding.publishedOn,
  url: policyGrounding.url, filename: policyGrounding.filename, size: policyGrounding.size, characters: sql<number | null>`length(${policyGrounding.extractedText})`,
  fetchedAt: policyGrounding.fetchedAt, error: policyGrounding.error, createdAt: policyGrounding.createdAt,
};

export async function libraryOf(policyId: string, tx: DbExecutor = db): Promise<LibraryItem[]> {
  const rows = await tx.select(itemColumns).from(policyGrounding).where(eq(policyGrounding.policyId, policyId)).orderBy(asc(policyGrounding.createdAt));
  return rows.map((r) => ({ ...r, roleLabel: GROUNDING_ROLE_LABELS[r.role] ?? 'Something else', characters: r.characters === null ? null : Number(r.characters) }));
}

export async function policyDetail(owner: string, id: string) {
  const policy = await ownedPolicy(owner, id);
  if (!policy) return null;
  const items = await libraryOf(id);
  // Unsealed runs only: a sealed run never records its policy at all.
  const runs = await db.select({ id: policyAnalyses.id, title: policyAnalyses.title, status: policyAnalyses.status, createdAt: policyAnalyses.createdAt })
    .from(policyAnalyses).where(and(eq(policyAnalyses.owner, owner), eq(policyAnalyses.policyId, id), eq(policyAnalyses.sealed, false))).orderBy(desc(policyAnalyses.createdAt)).limit(50);
  return { policy: { id: policy.id, name: policy.name, createdAt: policy.createdAt }, items, runs };
}

/**
 * Put one item in a policy's library. A file is extracted now, so a file with
 * no readable text is refused at the door rather than discovered by a run; a
 * page is fetched now when `fetchNow` (the library page) and otherwise left for
 * the first run that may fetch it.
 */
export async function addLibraryItem(owner: string, policyId: string, input: GroundingInput, options: { fetchNow: boolean; signal?: AbortSignal; fetch?: typeof fetchPage }, tx: DbExecutor = db): Promise<LibraryItem> {
  const policy = await ownedPolicy(owner, policyId, tx);
  if (!policy) throw new PolicyError('missing', 'Policy not found.');
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(policyGrounding).where(eq(policyGrounding.policyId, policyId));
  if (n >= 40) throw new PolicyError('capacity', 'This policy’s library holds 40 items, which is the most it takes. Remove one first.');
  const values = await libraryValues(input, options);
  const [row] = await tx.insert(policyGrounding).values({ owner, policyId, ...values }).returning({ id: policyGrounding.id });
  await tx.update(policyPolicies).set({ updatedAt: new Date() }).where(eq(policyPolicies.id, policyId));
  const [item] = (await libraryOf(policyId, tx)).filter((i) => i.id === row.id);
  return item;
}

async function libraryValues(input: GroundingInput, options: { fetchNow: boolean; signal?: AbortSignal; fetch?: typeof fetchPage }) {
  if (!GROUNDING_ROLES.some(([key]) => key === input.role)) throw new PolicyError('input', 'Say which kind of material this is.');
  const common = { role: input.role, publisher: input.publisher, publishedOn: input.publishedOn };
  if (input.kind === 'file') {
    let text: string;
    try { text = (await ingest(input.bytes, input.filename, input.mimeType, '', { kind: 'grounding_passage', defaultSection: 'Text' })).text; }
    catch (err) { throw new PolicyError('extraction', `${input.filename}: ${(err as Error).message}`); }
    return {
      ...common, title: (input.title ?? input.filename).slice(0, 300), filename: input.filename, mimeType: input.mimeType, size: input.bytes.length,
      sha256: createHash('sha256').update(input.bytes).digest('hex'), content: input.bytes.toString('base64'), extractedText: text, fetchedAt: null, error: null, url: null,
    };
  }
  const host = (() => { try { return new URL(input.url).hostname; } catch { return input.url; } })();
  if (!options.fetchNow) return { ...common, title: (input.title ?? host).slice(0, 300), url: input.url, extractedText: null, fetchedAt: null, error: null };
  const read = await readPage(input.url, options);
  return {
    ...common, title: (input.title ?? read.title ?? host).slice(0, 300), url: read.url ?? input.url,
    extractedText: read.text, fetchedAt: read.text ? new Date() : null, error: read.error,
    sha256: read.text ? createHash('sha256').update(read.text).digest('hex') : null,
  };
}

async function readPage(url: string, options: { signal?: AbortSignal; fetch?: typeof fetchPage }): Promise<{ text: string | null; title: string | null; url: string | null; error: string | null }> {
  try {
    const page = await (options.fetch ?? fetchPage)(url, { signal: options.signal, maxCharacters: MAX_GROUNDING_CHARACTERS_PER_ITEM + 1 });
    return { text: page.text, title: page.title || null, url: safeSourceUrl(page.finalUrl) ?? safeSourceUrl(url), error: null };
  } catch (err) {
    options.signal?.throwIfAborted();
    return { text: null, title: null, url: safeSourceUrl(url), error: err instanceof PageError ? err.message : 'The page could not be reached.' };
  }
}

export async function removeLibraryItem(owner: string, policyId: string, itemId: string): Promise<boolean> {
  if (!UUID.test(itemId) || !(await ownedPolicy(owner, policyId))) return false;
  const removed = await db.delete(policyGrounding).where(and(eq(policyGrounding.id, itemId), eq(policyGrounding.policyId, policyId), eq(policyGrounding.owner, owner))).returning({ id: policyGrounding.id });
  return removed.length > 0;
}

/**
 * WHAT A NEW RUN IS GROUNDED ON, copied into its own rows inside the
 * submission's transaction.
 *
 * Unsealed: the policy's ticked library items, plus anything brought with the
 * submission — which is SAVED TO THE LIBRARY FIRST, so the next run has it —
 * each copied with its library id.
 *
 * Sealed: the ticked items are read and copied into SEALED rows, and anything
 * brought with the submission goes into those rows only. The library is never
 * written, and nothing at run time reads it.
 */
export async function snapshotGrounding(tx: DbExecutor, input: {
  owner: string; analysisId: string; seal: Seal; sealed: boolean; policyId: string | null; useGrounding: string[] | null; brought: GroundingInput[];
}): Promise<number> {
  const chosen = input.policyId
    ? (await tx.select().from(policyGrounding).where(and(eq(policyGrounding.policyId, input.policyId), eq(policyGrounding.owner, input.owner))).orderBy(asc(policyGrounding.createdAt)))
        .filter((row) => input.useGrounding === null || input.useGrounding.includes(row.id))
    : [];
  if (input.useGrounding?.some((id) => !chosen.some((row) => row.id === id))) throw new PolicyError('input', 'One of the grounding items ticked is not in this policy’s library.');
  if (chosen.length + input.brought.length > MAX_GROUNDING_ITEMS) throw new PolicyError('input', `An assessment reads at most ${MAX_GROUNDING_ITEMS} pieces of grounding material. Untick some of the library, or bring fewer.`);
  const rows: (typeof policyRunGrounding.$inferInsert)[] = [];
  for (const row of chosen) {
    rows.push({
      analysisId: input.analysisId, position: rows.length + 1, libraryId: input.sealed ? null : row.id, role: row.role, mimeType: row.mimeType, size: row.size, sha256: row.sha256,
      ...sealRow(input.seal, 'grounding', { title: row.title, publisher: row.publisher, publishedOn: row.publishedOn, url: row.url, filename: row.filename, content: row.content, extractedText: row.extractedText, error: row.error }),
    });
  }
  for (const item of input.brought) {
    // Saved to the library first on an unsealed run; the run's copy names it.
    let libraryId: string | null = null;
    let values: Awaited<ReturnType<typeof libraryValues>>;
    try { values = await libraryValues(item, { fetchNow: false }); }
    catch (err) { throw new PolicyError((err as PolicyError).code ?? 'input', `Supporting material: ${(err as Error).message}`); }
    if (!input.sealed && input.policyId) {
      const [saved] = await tx.insert(policyGrounding).values({ owner: input.owner, policyId: input.policyId, ...values }).returning({ id: policyGrounding.id });
      libraryId = saved.id;
    }
    rows.push({
      analysisId: input.analysisId, position: rows.length + 1, libraryId, role: values.role, mimeType: 'mimeType' in values ? values.mimeType ?? null : null, size: 'size' in values ? values.size ?? null : null, sha256: 'sha256' in values ? values.sha256 ?? null : null,
      ...sealRow(input.seal, 'grounding', { title: values.title, publisher: values.publisher, publishedOn: values.publishedOn, url: values.url ?? null, filename: 'filename' in values ? values.filename ?? null : null, content: 'content' in values ? values.content ?? null : null, extractedText: values.extractedText ?? null, error: values.error ?? null }),
    });
  }
  if (rows.length) await tx.insert(policyRunGrounding).values(rows);
  return rows.length;
}

/** One run's grounding rows, unsealed, in order. */
export async function runGroundingFor(analysisId: string, seal: Seal, tx: DbExecutor = db) {
  const rows = await tx.select().from(policyRunGrounding).where(eq(policyRunGrounding.analysisId, analysisId)).orderBy(asc(policyRunGrounding.position));
  return rows.map((r) => unsealRow(seal, 'grounding', r));
}

/** What a run's grounding rows looked like, for the page: never the bytes or the text. */
export async function runGroundingSummary(analysisId: string, seal: Seal) {
  return (await runGroundingFor(analysisId, seal)).map((r) => ({
    position: r.position, role: r.role, roleLabel: GROUNDING_ROLE_LABELS[r.role] ?? 'Something else', title: r.title, publisher: r.publisher, publishedOn: r.publishedOn,
    url: r.url, filename: r.filename, size: r.size, characters: r.extractedText ? r.extractedText.length : null, error: r.error, fromLibrary: !!r.libraryId,
  }));
}

type RunRow = Awaited<ReturnType<typeof runGroundingFor>>[number];

/**
 * STAGE 0, FOR GROUNDING: each item the run was given, chunked into
 * `grounding_passage` artefacts under `g<n>_`, bounded per item and per run.
 *
 * An item that cannot be read costs the run nothing but itself: it is named in
 * a warning, and the assessment goes on with the rest. A page with no text yet
 * is fetched here when the run may fetch; the text is handed back so the
 * worker can store it on the run's row and, for an unsealed run, write it back
 * to the library item it came from.
 */
export async function ingestGrounding(rows: RunRow[], options: { mayFetch: boolean; why: string; signal?: AbortSignal; fetch?: typeof fetchPage }): Promise<{ artefacts: Artefact[]; warnings: string[]; updates: { id: string; extractedText: string | null; error: string | null; libraryId: string | null; fetched: boolean }[] }> {
  const artefacts: Artefact[] = [];
  const warnings: string[] = [];
  const updates: { id: string; extractedText: string | null; error: string | null; libraryId: string | null; fetched: boolean }[] = [];
  let budget = MAX_GROUNDING_CHARACTERS;
  for (const row of rows) {
    const title = row.title || row.filename || 'Grounding material';
    let source: { bytes: Buffer; filename: string; mimeType: string } | null = null;
    if (row.content && row.filename && row.mimeType) {
      source = { bytes: Buffer.from(row.content, 'base64'), filename: row.filename, mimeType: row.mimeType };
    } else if (row.extractedText) {
      source = { bytes: Buffer.from(row.extractedText), filename: 'page.txt', mimeType: 'text/plain' };
    } else if (row.url) {
      if (!options.mayFetch) {
        warnings.push(`Grounding material “${title}” was given by web address and was not read: ${options.why}.`);
        updates.push({ id: row.id, extractedText: null, error: `Not fetched: ${options.why}.`, libraryId: row.libraryId, fetched: false });
        continue;
      }
      const read = await readPage(row.url, options);
      updates.push({ id: row.id, extractedText: read.text, error: read.error, libraryId: row.libraryId, fetched: !!read.text });
      if (!read.text) { warnings.push(`Grounding material “${title}” could not be read: ${(read.error ?? 'the page could not be reached').replace(/\.$/, '')}. The assessment went on without it.`); continue; }
      source = { bytes: Buffer.from(read.text), filename: 'page.txt', mimeType: 'text/plain' };
    }
    if (!source) { warnings.push(`Grounding material “${title}” held nothing to read and was left out.`); continue; }
    if (budget <= 0) { warnings.push(`Grounding material “${title}” was not read: this assessment had already read ${MAX_GROUNDING_CHARACTERS.toLocaleString('en-GB')} characters of grounding, which is the most one run takes.`); continue; }
    let passages: Artefact[];
    try {
      passages = (await ingest(source.bytes, source.filename, source.mimeType, `g${row.position}_`, {
        kind: 'grounding_passage', defaultSection: 'Text', url: row.url ? safeSourceUrl(row.url) : null,
        data: { groundingTitle: title.slice(0, 300), groundingRole: row.role, groundingPosition: row.position, publisher: row.publisher ?? null, publishedOn: row.publishedOn ?? null, libraryId: row.libraryId ?? null },
      })).artefacts;
    } catch (err) {
      warnings.push(`Grounding material “${title}” could not be read: ${(err as Error).message.replace(/\.$/, '')}. The assessment went on without it.`);
      continue;
    }
    // THE CAP CUTS AT A PASSAGE, keeping the start: the opening of an impact
    // assessment or an evaluation is its summary, which is what a judging
    // stage most needs, and a cut inside a passage would break its offsets.
    const allowance = Math.min(MAX_GROUNDING_CHARACTERS_PER_ITEM, budget);
    const kept: Artefact[] = [];
    let used = 0;
    for (const p of passages) {
      if (used + p.statement.length > allowance && kept.length) break;
      kept.push(p);
      used += p.statement.length;
      if (used >= allowance) break;
    }
    const truncated = kept.length < passages.length;
    if (truncated) {
      for (const p of kept) p.data.truncated = true;
      warnings.push(`Grounding material “${title}” is longer than one run reads: the first ${used.toLocaleString('en-GB')} characters (${kept.length} of ${passages.length} passages) were read.`);
    }
    budget -= used;
    artefacts.push(...kept);
  }
  return { artefacts, warnings, updates };
}
