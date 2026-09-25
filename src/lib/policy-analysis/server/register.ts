import { count, eq, max, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '$lib/db';
import { policyBodies } from '$lib/db/schema';
import snapshotJson from '../../../../register/govuk-organisations.json';
import { bodyFromOrganisation, buildRegisterIndex, REGISTER_SOURCE, type RegisterBody, type RegisterIndex, type RegisterSnapshot } from '../register';

/**
 * The register's table, filled from the COMMITTED snapshot.
 *
 * The snapshot is imported, so it is inside the server bundle: an install with
 * no network, the fixture build and every test have the whole register, and
 * nothing at run time can reach GOV.UK. A refresh rewrites the file, the next
 * build carries it, and the first call here after that upserts the difference.
 *
 * A body that disappears from a later snapshot is KEPT. A persona may point at
 * it, and "GOV.UK no longer lists this" is not the same as "this never existed".
 */
export const snapshot = snapshotJson as unknown as RegisterSnapshot;

const CHUNK = 200;
const sqlExcluded = (column: string) => sql.raw(`excluded.${column}`);
let loaded: Promise<RegisterIndex> | null = null;

function toBody(row: typeof policyBodies.$inferSelect): RegisterBody {
  return {
    id: row.id, name: row.name, acronym: row.acronym, format: row.format, status: row.status,
    closedStatus: row.closedStatus, closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    parentIds: row.parentIds ?? [], childIds: row.childIds ?? [], supersedesIds: row.supersedesIds ?? [],
    supersededByIds: row.supersededByIds ?? [], aliases: row.aliases ?? [], webUrl: row.webUrl,
  };
}

/**
 * Load the snapshot into the table if the table is empty or older than it.
 * Returns how many rows were written.
 *
 * ONE aggregate query when there is nothing to do, so every writer of a
 * `body_id` calls it first, inside its own transaction. That matters more than
 * it looks: the first sync on a new install can happen inside a stage's commit
 * that then rolls back, taking the rows with it while the index held below
 * still names every body. A writer that checks first puts them back.
 */
export async function syncRegister(tx: DbExecutor = db): Promise<number> {
  const [held] = await tx.select({ n: count(), at: max(policyBodies.fetchedAt) }).from(policyBodies).where(eq(policyBodies.source, REGISTER_SOURCE));
  const fetchedAt = new Date(snapshot.fetchedAt);
  if (held && held.n > 0 && held.at && held.at >= fetchedAt) return 0;
  const rows = snapshot.organisations.map((org) => {
    const body = bodyFromOrganisation(org);
    return {
      id: body.id, source: REGISTER_SOURCE, sourceId: org.slug, name: body.name, slug: org.slug,
      acronym: body.acronym, format: body.format, status: body.status, closedStatus: body.closedStatus,
      closedAt: body.closedAt && !Number.isNaN(Date.parse(body.closedAt)) ? new Date(body.closedAt) : null,
      parentIds: body.parentIds, childIds: body.childIds, supersedesIds: body.supersedesIds,
      supersededByIds: body.supersededByIds, aliases: body.aliases, webUrl: body.webUrl, fetchedAt,
    };
  });
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await tx.insert(policyBodies).values(chunk).onConflictDoUpdate({
      target: policyBodies.id,
      set: {
        name: sqlExcluded('name'), acronym: sqlExcluded('acronym'), format: sqlExcluded('format'),
        status: sqlExcluded('status'), closedStatus: sqlExcluded('closed_status'), closedAt: sqlExcluded('closed_at'),
        parentIds: sqlExcluded('parent_ids'), childIds: sqlExcluded('child_ids'), supersedesIds: sqlExcluded('supersedes_ids'),
        supersededByIds: sqlExcluded('superseded_by_ids'), aliases: sqlExcluded('aliases'), webUrl: sqlExcluded('web_url'),
        fetchedAt: sqlExcluded('fetched_at'),
      },
    });
  }
  return rows.length;
}

/**
 * The register as the matcher reads it, held for the life of the process.
 *
 * 1,265 rows, read once. Synced first, so the first persona write on a new
 * install finds the table filled rather than every body unknown.
 */
export function registerIndex(tx: DbExecutor = db): Promise<RegisterIndex> {
  loaded ??= (async () => {
    await syncRegister(tx);
    const rows = await tx.select().from(policyBodies);
    return buildRegisterIndex(rows.map(toBody));
  })().catch((err) => { loaded = null; throw err; });
  return loaded;
}

/** Forget the held index — for a test that changes the table under it. */
export function forgetRegisterIndex() { loaded = null; }
