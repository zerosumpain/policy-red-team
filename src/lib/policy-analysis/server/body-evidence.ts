import { desc, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '$lib/db';
import { policyBodyEvidence, policyBodyEvidenceChecks, policyPersonas } from '$lib/db/schema';
import { EVIDENCE_SOURCES, EVIDENCE_TTL_MS, pickEvidence, uncheckedWarning, type BodyEvidenceRecord, type EvidenceQuestion, type EvidenceSource } from '../body-evidence';
import type { Artefact } from '../contracts';
import { isAffectedGroup } from '../personas';
import { resolveBody, type RegisterBody } from '../register';
import { fetchBodySources, type SourceAnswer, type SourceFetch } from './body-sources';
import { registerIndex, syncRegister } from './register';
import { chosenEngine } from '$lib/server/search';

/**
 * THE STORE OF PUBLIC RECORDS ABOUT REGISTER BODIES.
 *
 * Shared by every owner and every assessment, like the register itself: what
 * GOV.UK and Parliament published about a body is the same whoever asks. That
 * is also why it is safe beside a sealed assessment — nothing here came from a
 * paper, and nothing a sealed run does writes here (a sealed run reads what is
 * already stored and never fetches: WHICH bodies it asked about would say
 * something about an unpublished paper).
 *
 * `./body-sources` is the only network in this module, and `build.mjs` swaps it
 * for a fixture in the fixture bundles.
 */

/** Records kept per body per source: the newest, so the table cannot grow without bound. */
const KEEP_PER_SOURCE = 40;
/** A source that failed is asked again sooner than one that answered. */
const RETRY_AFTER_ERROR_MS = 24 * 60 * 60_000;
/** How many bodies are checked at once. Three free services, asked politely. */
const LANES = 3;

export type SourceCheck = { source: EvidenceSource; checkedAt: string; expiresAt: string; found: number; error: string | null };

function toRecord(row: typeof policyBodyEvidence.$inferSelect): BodyEvidenceRecord {
  return {
    bodyId: row.bodyId, source: row.source as EvidenceSource, sourceKind: row.sourceKind, question: row.question as EvidenceQuestion,
    title: row.title, url: row.url, publisher: row.publisher, publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    retrievedAt: row.retrievedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), excerpt: row.excerpt,
  };
}

/** Every stored record for these bodies, newest first. */
export async function storedEvidence(bodyIds: string[], tx: DbExecutor = db): Promise<Map<string, BodyEvidenceRecord[]>> {
  const out = new Map<string, BodyEvidenceRecord[]>();
  if (!bodyIds.length) return out;
  const rows = await tx.select().from(policyBodyEvidence).where(inArray(policyBodyEvidence.bodyId, bodyIds))
    .orderBy(sql`${policyBodyEvidence.publishedAt} DESC NULLS LAST`, desc(policyBodyEvidence.retrievedAt));
  for (const row of rows) out.set(row.bodyId, [...(out.get(row.bodyId) ?? []), toRecord(row)]);
  return out;
}

export async function checksFor(bodyIds: string[], tx: DbExecutor = db): Promise<Map<string, SourceCheck[]>> {
  const out = new Map<string, SourceCheck[]>();
  if (!bodyIds.length) return out;
  const rows = await tx.select().from(policyBodyEvidenceChecks).where(inArray(policyBodyEvidenceChecks.bodyId, bodyIds));
  for (const row of rows) {
    out.set(row.bodyId, [...(out.get(row.bodyId) ?? []), {
      source: row.source as EvidenceSource, checkedAt: row.checkedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), found: row.found, error: row.error,
    }]);
  }
  return out;
}

/** The sources whose last answer about a body has run out, or that were never asked. */
export function staleSources(checks: SourceCheck[], now = new Date()): EvidenceSource[] {
  return EVIDENCE_SOURCES.filter((source) => {
    const check = checks.find((c) => c.source === source);
    return !check || Date.parse(check.expiresAt) <= now.getTime();
  });
}

/**
 * Write one check's answers: upsert the records, record when each source was
 * asked, and keep only the newest `KEEP_PER_SOURCE` per source.
 *
 * Old records are otherwise KEPT. A committee report from 2018 that no longer
 * makes the newest twelve is still the body's track record.
 */
export async function saveAnswers(bodyId: string, answers: SourceAnswer[], now = new Date(), tx: DbExecutor = db): Promise<number> {
  let added = 0;
  for (const answer of answers) {
    // A skip the PAPER GUARD caused is a fact about one run's paper, not about
    // the body, and this table is shared by every owner. Stored, it would tell
    // the next run — anyone's — that the source had been asked, for thirty
    // days. So it is not stored at all: the source stays unasked.
    if (answer.guarded && !answer.records.length) continue;
    if (answer.skipped && !answer.records.length) {
      // Not asked on purpose (no slug, or a name too short to search). Recorded
      // so it is not "never asked" for ever, and with a full TTL.
      await upsertCheck(tx, bodyId, answer.source, now, new Date(now.getTime() + EVIDENCE_TTL_MS), 0, answer.skipped);
      continue;
    }
    if (answer.error) {
      await upsertCheck(tx, bodyId, answer.source, now, new Date(now.getTime() + RETRY_AFTER_ERROR_MS), 0, `The source ${answer.error}.`);
      continue;
    }
    for (const r of answer.records) {
      const [row] = await tx.insert(policyBodyEvidence).values({
        bodyId, source: r.source, sourceKind: r.sourceKind, question: r.question, title: r.title, url: r.url, publisher: r.publisher,
        publishedAt: r.publishedAt ? new Date(r.publishedAt) : null, retrievedAt: new Date(r.retrievedAt), expiresAt: new Date(r.expiresAt), excerpt: r.excerpt,
      }).onConflictDoUpdate({
        target: [policyBodyEvidence.bodyId, policyBodyEvidence.url],
        set: { title: r.title, question: r.question, sourceKind: r.sourceKind, publisher: r.publisher, excerpt: r.excerpt, retrievedAt: new Date(r.retrievedAt), expiresAt: new Date(r.expiresAt), publishedAt: r.publishedAt ? new Date(r.publishedAt) : null },
      }).returning({ inserted: sql<boolean>`(xmax = 0)` });
      if (row?.inserted) added++;
    }
    await tx.execute(sql`
      delete from policy_body_evidence
       where body_id = ${bodyId} and source = ${answer.source}
         and id not in (select id from policy_body_evidence
                         where body_id = ${bodyId} and source = ${answer.source}
                         order by published_at desc nulls last, retrieved_at desc
                         limit ${KEEP_PER_SOURCE})`);
    await upsertCheck(tx, bodyId, answer.source, now, new Date(now.getTime() + EVIDENCE_TTL_MS), answer.records.length, null);
  }
  return added;
}

async function upsertCheck(tx: DbExecutor, bodyId: string, source: EvidenceSource, checkedAt: Date, expiresAt: Date, found: number, error: string | null) {
  await tx.insert(policyBodyEvidenceChecks).values({ bodyId, source, checkedAt, expiresAt, found, error })
    .onConflictDoUpdate({ target: [policyBodyEvidenceChecks.bodyId, policyBodyEvidenceChecks.source], set: { checkedAt, expiresAt, found, error } });
}

export type RefreshOptions = {
  /** Ask every source, whatever its last answer. The page's "Check again". */
  force?: boolean;
  signal?: AbortSignal;
  /** Shingles of the paper a run is reading; empty outside a run. */
  corpus?: Set<string>;
  now?: Date;
  fetch?: SourceFetch;
  guard?: (url: string) => Promise<unknown>;
};

const slugOf = (body: RegisterBody) => (body.id.startsWith('govuk:') ? body.id.slice('govuk:'.length) : null);

/**
 * Check the public record for one body — only the sources whose answer has run
 * out, unless forced. Returns how many new records arrived and which sources
 * were asked.
 */
export async function refreshBody(body: RegisterBody, options: RefreshOptions = {}): Promise<{ added: number; asked: EvidenceSource[]; failed: EvidenceSource[]; off?: boolean }> {
  // AN INSTALL SET NOT TO LOOK ANYTHING UP ASKS NOTHING, whoever calls. The
  // worker already declined for a run; "Check again now" and `npm run
  // research:bodies` did not, and `none` is a reader saying this estate has
  // no route out — not a preference about paid search alone.
  if (chosenEngine() === 'none') return { added: 0, asked: [], failed: [], off: true };
  const now = options.now ?? new Date();
  const checks = (await checksFor([body.id])).get(body.id) ?? [];
  const asked = options.force ? [...EVIDENCE_SOURCES] : staleSources(checks, now);
  if (!asked.length) return { added: 0, asked, failed: [] };
  // Whether the name is the register's own, read from the register rather than
  // trusted from the caller: only then is it exempt from the paper guard.
  const registered = (await registerIndex()).bodies.get(body.id)?.name === body.name;
  const answers = await fetchBodySources({ id: body.id, slug: slugOf(body), name: body.name, registered }, {
    sources: asked, signal: options.signal, corpus: options.corpus, now, fetch: options.fetch, guard: options.guard,
  });
  options.signal?.throwIfAborted();
  await syncRegister();
  const added = await db.transaction((tx) => saveAnswers(body.id, answers, now, tx));
  return { added, asked, failed: answers.filter((a) => a.error).map((a) => a.source) };
}

/** `fn` over `items`, `lanes` at a time. */
async function pooled<T, R>(items: T[], lanes: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, async () => {
    while (next < items.length) { const k = next++; results[k] = await fn(items[k]); }
  }));
  return results;
}

export type ActorEvidence = { actorId: string; bodyId: string; bodyName: string; records: BodyEvidenceRecord[] };

/**
 * Which register body each actor is, by the register's own rule.
 *
 * The same `resolveBody` the library uses, so a run and its dossier agree on
 * who a body is. Groups of people are never bodies.
 */
export async function actorBodies(actors: Pick<Artefact, 'id' | 'label' | 'data'>[]): Promise<Map<string, RegisterBody>> {
  const index = await registerIndex();
  const out = new Map<string, RegisterBody>();
  for (const actor of actors) {
    if (isAffectedGroup(actor.data.entityType)) continue;
    const aliases = Array.isArray(actor.data.aliases) ? (actor.data.aliases as unknown[]).filter((a): a is string => typeof a === 'string') : [];
    const resolved = resolveBody({ label: actor.label, aliases, entityType: String(actor.data.entityType ?? '') }, index);
    if (resolved) out.set(actor.id, resolved.body);
  }
  return out;
}

/**
 * THE PUBLIC RECORD FOR A RUN'S MOST CONNECTED BODIES.
 *
 * Resolves each actor to the register, checks the sources whose answer has run
 * out — only when `fetch` is true — and hands back the few records per body a
 * run is shown (`pickEvidence`). The caller decides `fetch`: a sealed run, a
 * run that may not search, and an install whose search is set to `none` all
 * pass false and are given what is already stored.
 *
 * NEVER THROWS for a source. A body whose check failed is given what is
 * stored, and the failure is one sentence in `warnings`.
 */
export async function evidenceForActors(actors: Artefact[], options: { fetch: boolean; corpus?: Set<string>; signal?: AbortSignal; fetchImpl?: RefreshOptions['fetch']; guard?: RefreshOptions['guard'] }): Promise<{ bundles: ActorEvidence[]; warnings: string[] }> {
  const warnings: string[] = [];
  const bodies = await actorBodies(actors);
  const unique = [...new Map([...bodies.values()].map((b) => [b.id, b])).values()];
  if (!unique.length) return { bundles: [], warnings };
  if (options.fetch) {
    const failed: string[] = [];
    await pooled(unique, LANES, async (body) => {
      options.signal?.throwIfAborted();
      try {
        const result = await refreshBody(body, { signal: options.signal, corpus: options.corpus, fetch: options.fetchImpl, guard: options.guard });
        if (result.failed.length) failed.push(body.name);
      } catch (err) {
        options.signal?.throwIfAborted();
        void err;
        failed.push(body.name);
      }
    });
    const unchecked = uncheckedWarning(failed);
    if (unchecked) warnings.push(unchecked);
  }
  const stored = await storedEvidence(unique.map((b) => b.id));
  const bundles: ActorEvidence[] = [];
  for (const actor of actors) {
    const body = bodies.get(actor.id);
    if (!body) continue;
    const records = pickEvidence(stored.get(body.id) ?? []);
    if (records.length) bundles.push({ actorId: actor.id, bodyId: body.id, bodyName: body.name, records });
  }
  return { bundles, warnings };
}

/** Every register body some owner's library holds, for `npm run research:bodies`. */
export async function libraryBodies(tx: DbExecutor = db): Promise<RegisterBody[]> {
  const rows = await tx.selectDistinct({ bodyId: policyPersonas.bodyId }).from(policyPersonas).where(isNotNull(policyPersonas.bodyId));
  const index = await registerIndex(tx);
  return rows.map((r) => (r.bodyId ? index.bodies.get(r.bodyId) : undefined)).filter((b): b is RegisterBody => Boolean(b));
}

/**
 * Refresh the public record for every body in the library. Stale sources only,
 * unless `force`. One line per body through `log`.
 */
export async function refreshLibrary(options: { force?: boolean; signal?: AbortSignal; log?: (line: string) => void; fetch?: RefreshOptions['fetch'] } = {}): Promise<{ bodies: number; asked: number; added: number; failed: number }> {
  const log = options.log ?? (() => {});
  const bodies = await libraryBodies();
  let asked = 0; let added = 0; let failed = 0;
  await pooled(bodies, LANES, async (body) => {
    const result = await refreshBody(body, { force: options.force, signal: options.signal, fetch: options.fetch });
    if (result.asked.length) asked++;
    added += result.added;
    failed += result.failed.length ? 1 : 0;
    log(`  ${body.name}: ${result.asked.length ? `asked ${result.asked.join(', ')}; ${result.added} new${result.failed.length ? `; ${result.failed.join(', ')} did not answer` : ''}` : 'up to date'}`);
  });
  return { bodies: bodies.length, asked, added, failed };
}

/** One body's whole record and when each source was last asked — for the body's page. */
export async function bodyRecord(bodyId: string): Promise<{ records: BodyEvidenceRecord[]; checks: SourceCheck[] }> {
  const [records, checks] = await Promise.all([storedEvidence([bodyId]), checksFor([bodyId])]);
  return { records: records.get(bodyId) ?? [], checks: checks.get(bodyId) ?? [] };
}

/** Records for several bodies at once, for the grid. Counts only. */
export async function evidenceCounts(bodyIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!bodyIds.length) return out;
  const rows = await db.select({ bodyId: policyBodyEvidence.bodyId, n: sql<number>`count(*)::int` }).from(policyBodyEvidence)
    .where(inArray(policyBodyEvidence.bodyId, bodyIds)).groupBy(policyBodyEvidence.bodyId);
  for (const row of rows) out.set(row.bodyId, Number(row.n));
  return out;
}
