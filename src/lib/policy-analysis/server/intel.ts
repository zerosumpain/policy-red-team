import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAnalyses, policyArtefacts, policyDocuments, policyPersonaObservations, policyPersonas } from '$lib/db/schema';
import { bodyFacts, resolveBody, type BodyFacts } from '../register';
import { buildGrid, findClashes, timeline, type Clash, type Grid, type IntelEdge, type IntelNode, type IntelPaper, type IntelSighting, type PaperAsks } from '../intel';
import type { BodyEvidenceRecord } from '../body-evidence';
import { bodyRecord, type SourceCheck } from './body-evidence';
import { registerIndex } from './register';

/**
 * The rows the cross-policy views are computed from, for ONE owner.
 *
 * WHAT IS READ, AND WHAT IS NOT. The persona library's observations (which
 * paper filed which actor under which register body, and the plays it
 * attributed) and those papers' graphs — edges, actors and mechanisms. Only
 * UNSEALED, finished papers: a sealed run never writes to the library, and its
 * artefacts are not read here even to count them. Everything stays in the
 * owner's own pages; none of it goes into a share or an export, which read
 * neither this module nor the library.
 */

/** The papers the views look across. The library, not the account's whole history. */
const PAPER_LIMIT = 60;

type Rows = { papers: IntelPaper[]; sightings: IntelSighting[]; edges: IntelEdge[]; nodes: IntelNode[] };

async function libraryRows(owner: string, bodyIds?: string[]): Promise<Rows> {
  const filed = await db.select({
    analysisId: policyPersonaObservations.analysisId, actorId: policyPersonaObservations.actorId, bodyId: policyPersonas.bodyId, plays: policyPersonaObservations.plays,
    title: policyAnalyses.title, completedAt: policyAnalyses.completedAt,
  })
    .from(policyPersonaObservations)
    .innerJoin(policyPersonas, eq(policyPersonas.id, policyPersonaObservations.personaId))
    .innerJoin(policyAnalyses, eq(policyAnalyses.id, policyPersonaObservations.analysisId))
    .where(and(
      eq(policyPersonas.owner, owner), eq(policyAnalyses.owner, owner), isNotNull(policyPersonas.bodyId),
      eq(policyPersonaObservations.kind, 'assessment'), eq(policyAnalyses.sealed, false),
      inArray(policyAnalyses.status, ['completed', 'completed_with_gaps']),
      ...(bodyIds ? [inArray(policyPersonas.bodyId, bodyIds)] : []),
    ))
    .orderBy(desc(policyAnalyses.completedAt));
  const analysisIds = [...new Set(filed.map((f) => f.analysisId!).filter(Boolean))].slice(0, PAPER_LIMIT);
  if (!analysisIds.length) return { papers: [], sightings: [], edges: [], nodes: [] };
  const shas = new Map((await db.select({ analysisId: policyDocuments.analysisId, sha256: policyDocuments.sha256 }).from(policyDocuments).where(inArray(policyDocuments.analysisId, analysisIds))).map((d) => [d.analysisId, d.sha256]));
  const papers = new Map<string, IntelPaper>();
  for (const f of filed) {
    if (!f.analysisId || !analysisIds.includes(f.analysisId) || papers.has(f.analysisId)) continue;
    papers.set(f.analysisId, { id: f.analysisId, title: f.title, completedAt: f.completedAt ? f.completedAt.toISOString() : null, sha256: shas.get(f.analysisId) ?? null });
  }
  const sightings: IntelSighting[] = filed
    .filter((f) => f.analysisId && f.actorId && f.bodyId && analysisIds.includes(f.analysisId))
    .map((f) => ({ analysisId: f.analysisId!, actorId: f.actorId!, bodyId: f.bodyId!, plays: Array.isArray(f.plays) ? f.plays : [] }));
  const artefacts = await db.select({
    analysisId: policyArtefacts.analysisId, id: policyArtefacts.id, kind: policyArtefacts.kind, label: policyArtefacts.label, statement: policyArtefacts.statement,
    fromId: policyArtefacts.fromId, toId: policyArtefacts.toId, relation: policyArtefacts.relation, sourceQuote: policyArtefacts.sourceQuote, data: policyArtefacts.data,
  }).from(policyArtefacts).where(and(inArray(policyArtefacts.analysisId, analysisIds), inArray(policyArtefacts.kind, ['edge', 'actor', 'mechanism'])));
  const edges: IntelEdge[] = artefacts
    .filter((a) => a.kind === 'edge' && a.fromId && a.toId && a.relation)
    .map((a) => ({ analysisId: a.analysisId, id: a.id, fromId: a.fromId!, toId: a.toId!, relation: a.relation!, label: a.label, statement: a.statement, sourceQuote: a.sourceQuote }));
  const nodes: (IntelNode & { aliases: string[]; entityType: string })[] = artefacts
    .filter((a) => a.kind !== 'edge')
    .map((a) => ({ analysisId: a.analysisId, id: a.id, kind: a.kind, label: a.label, aliases: Array.isArray(a.data?.aliases) ? (a.data.aliases as string[]) : [], entityType: String(a.data?.entityType ?? '') }));
  return { papers: [...papers.values()], sightings, edges, nodes };
}

/** A resolver for "which register body is this actor in this paper": the library's filing, then the register's rule. */
async function bodyResolver(rows: Rows): Promise<(analysisId: string, actorId: string) => string | null> {
  const index = await registerIndex();
  const filed = new Map(rows.sightings.map((s) => [`${s.analysisId}|${s.actorId}`, s.bodyId]));
  const nodes = new Map(rows.nodes.map((n) => [`${n.analysisId}|${n.id}`, n as IntelNode & { aliases?: string[]; entityType?: string }]));
  const cache = new Map<string, string | null>();
  return (analysisId, actorId) => {
    const key = `${analysisId}|${actorId}`;
    if (filed.has(key)) return filed.get(key)!;
    if (cache.has(key)) return cache.get(key)!;
    const node = nodes.get(key);
    const resolved = node && node.kind === 'actor' && node.id.startsWith('s2_')
      ? resolveBody({ label: node.label, aliases: node.aliases ?? [], entityType: node.entityType ?? '' }, index)?.body.id ?? null
      : null;
    cache.set(key, resolved);
    return resolved;
  };
}

/** The bodies × papers grid and every clash the rule finds, for the owner's library. */
export async function bodiesGrid(owner: string): Promise<Grid & { clashes: Clash[]; personaOf: Record<string, string> }> {
  const rows = await libraryRows(owner);
  const index = await registerIndex();
  const names = new Map([...index.bodies.values()].map((b) => [b.id, b.name]));
  const grid = buildGrid({ ...rows, names });
  const clashes = findClashes({ ...rows, names, bodyOf: await bodyResolver(rows) });
  // Which persona to open for each body. Where two personas share a body (a
  // duplicate the reader has not merged), the first is enough to get there.
  const personas = await db.select({ id: policyPersonas.id, bodyId: policyPersonas.bodyId }).from(policyPersonas)
    .where(and(eq(policyPersonas.owner, owner), isNotNull(policyPersonas.bodyId))).orderBy(desc(policyPersonas.sightings));
  const personaOf: Record<string, string> = {};
  for (const p of personas) if (p.bodyId && !personaOf[p.bodyId]) personaOf[p.bodyId] = p.id;
  return { ...grid, clashes, personaOf };
}

export type BodyIntel = {
  body: BodyFacts | null;
  /** The delivery chain the register records and papers rarely state. */
  children: { id: string; name: string; personaId: string | null }[];
  parentPersonas: Record<string, string>;
  papers: PaperAsks[];
  record: { records: BodyEvidenceRecord[]; checks: SourceCheck[] };
  clashes: Clash[];
};

/** Everything the persona page's cross-paper sections draw, for one persona. */
export async function bodyIntel(owner: string, personaId: string): Promise<BodyIntel | null> {
  const [persona] = await db.select({ id: policyPersonas.id, bodyId: policyPersonas.bodyId }).from(policyPersonas).where(and(eq(policyPersonas.id, personaId), eq(policyPersonas.owner, owner)));
  if (!persona) return null;
  if (!persona.bodyId) return { body: null, children: [], parentPersonas: {}, papers: [], record: { records: [], checks: [] }, clashes: [] };
  const index = await registerIndex();
  const body = index.bodies.get(persona.bodyId);
  const names = new Map([...index.bodies.values()].map((b) => [b.id, b.name]));
  const rows = await libraryRows(owner);
  const related = [persona.bodyId, ...(body?.parentIds ?? []), ...(body?.childIds ?? [])];
  const personas = await db.select({ id: policyPersonas.id, bodyId: policyPersonas.bodyId }).from(policyPersonas)
    .where(and(eq(policyPersonas.owner, owner), inArray(policyPersonas.bodyId, related)));
  const personaOf = new Map(personas.map((p) => [p.bodyId!, p.id]));
  const clashes = findClashes({ ...rows, names, bodyOf: await bodyResolver(rows) }).filter((c) => c.bodyId === persona.bodyId || c.otherId === persona.bodyId);
  return {
    body: body ? bodyFacts(body, index) : null,
    children: (body?.childIds ?? []).map((id) => index.bodies.get(id)).filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({ id: b.id, name: b.name, personaId: personaOf.get(b.id) ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    parentPersonas: Object.fromEntries((body?.parentIds ?? []).filter((id) => personaOf.has(id)).map((id) => [id, personaOf.get(id)!])),
    papers: timeline(persona.bodyId, rows),
    record: await bodyRecord(persona.bodyId),
    clashes,
  };
}
