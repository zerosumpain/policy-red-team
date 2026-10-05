import { and, count, desc, eq, gte, inArray, isNotNull, max } from 'drizzle-orm';
import { db } from '$lib/db';
import { paperKeys } from './paper';
import { policyAnalyses, policyArtefacts, policyPersonaObservations, policyPersonas } from '$lib/db/schema';
import { bodyFacts, resolveBody, type BodyFacts } from '../register';
import { actorsOfBody, asksOf, buildGrid, findClashes, timeline, type Clash, type Grid, type IntelEdge, type IntelNode, type IntelPaper, type IntelSighting, type PaperAsks } from '../intel';
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
  // The PAPER key (phase 25), so a run with an annex and one without are one paper.
  const shas = await paperKeys(analysisIds);
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
  /*
   * NOT ON THE REGISTER IS NOT "NOTHING TO SAY" (phase 24). What a paper asks
   * of a body is read off that paper's graph from the actor it filed, and that
   * needs no register — the register only lets two papers be compared when
   * each called the body something different. Jobcentre Plus, the one body two
   * live papers share, is not on it, and its page said "this needs the body to
   * be matched" under a landing panel that had just quoted what it is asked.
   */
  if (!persona.bodyId) {
    return { body: null, children: [], parentPersonas: {}, papers: timeline(persona.id, await personaRows(owner, persona.id)), record: { records: [], checks: [] }, clashes: [] };
  }
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

/** One paper a recurring body was seen in: its worst band there, and the first thing it asks of the body. */
export type RecurringPaper = { id: string; title: string; completedAt: string | null; worstBand: string | null; plays: number; ask: string | null };
export type RecurringBody = { personaId: string; name: string; entityType: string; sightings: number; papers: RecurringPaper[] };
/**
 * WHAT THE LANDING PAGE'S "BODIES THAT TURN UP AGAIN" DRAWS (phase 24).
 *
 * `papers` is how many documents have a finished, unsealed assessment — the
 * figure the empty state needs to say WHY there is nothing to show ("one paper
 * so far" is a different sentence from "no body has turned up twice").
 * `repeating` is every body seen in two or more; `bodies` the first few of
 * them, most-seen first.
 */
export type Recurring = { papers: number; repeating: number; bodies: RecurringBody[] };

/** How many bodies the landing page shows, and how many papers each strip draws. A cap on a list that grows with use. */
export const RECURRING_SHOWN = 5;
export const RECURRING_PAPERS = 12;

/**
 * Bodies seen in more than one paper, each with one mark per paper.
 *
 * FROM THE LIBRARY, NOT FROM THE GRID. `bodiesGrid` reads only bodies matched
 * to the GOV.UK register, and on the live box the one body two papers share —
 * Jobcentre Plus — is not on it (it is part of DWP, and the register lists
 * DWP). A landing panel built on the grid would say "nothing turns up twice"
 * on an install where something does. So the persona's own sightings decide,
 * counted by document exactly as `recountSightings` counts them, and the ask
 * is read off each paper's graph from the actor that paper filed — the same
 * `actorsOfBody` / `asksOf` the body page uses, keyed by persona.
 */
export async function recurringBodies(owner: string): Promise<Recurring> {
  const finished = await db.select({ id: policyAnalyses.id, sha256: policyAnalyses.paperKey })
    .from(policyAnalyses)
    .where(and(eq(policyAnalyses.owner, owner), eq(policyAnalyses.sealed, false), inArray(policyAnalyses.status, ['completed', 'completed_with_gaps'])));
  const papers = new Set(finished.map((f) => f.sha256 ?? f.id)).size;

  const recurring = await db.select({ id: policyPersonas.id, name: policyPersonas.name, entityType: policyPersonas.entityType, sightings: policyPersonas.sightings })
    .from(policyPersonas)
    .where(and(eq(policyPersonas.owner, owner), gte(policyPersonas.sightings, 2)))
    .orderBy(desc(policyPersonas.sightings), policyPersonas.name);
  const shown = recurring.slice(0, RECURRING_SHOWN);
  if (!shown.length) return { papers, repeating: 0, bodies: [] };

  const filed = await db.select({
    personaId: policyPersonaObservations.personaId, analysisId: policyPersonaObservations.analysisId, actorId: policyPersonaObservations.actorId,
    plays: policyPersonaObservations.plays, title: policyAnalyses.title, completedAt: policyAnalyses.completedAt, updatedAt: policyAnalyses.updatedAt,
  })
    .from(policyPersonaObservations)
    .innerJoin(policyAnalyses, eq(policyAnalyses.id, policyPersonaObservations.analysisId))
    .where(and(
      inArray(policyPersonaObservations.personaId, shown.map((p) => p.id)), eq(policyPersonaObservations.kind, 'assessment'),
      eq(policyAnalyses.owner, owner), eq(policyAnalyses.sealed, false),
    ));
  const analysisIds = [...new Set(filed.map((f) => f.analysisId!).filter(Boolean))];
  const shas = await paperKeys(analysisIds);
  const artefacts = analysisIds.length
    ? await db.select({
      analysisId: policyArtefacts.analysisId, id: policyArtefacts.id, kind: policyArtefacts.kind, label: policyArtefacts.label, statement: policyArtefacts.statement,
      fromId: policyArtefacts.fromId, toId: policyArtefacts.toId, relation: policyArtefacts.relation, sourceQuote: policyArtefacts.sourceQuote,
    }).from(policyArtefacts).where(and(inArray(policyArtefacts.analysisId, analysisIds), inArray(policyArtefacts.kind, ['edge', 'actor', 'mechanism'])))
    : [];
  const edges: IntelEdge[] = artefacts
    .filter((a) => a.kind === 'edge' && a.fromId && a.toId && a.relation)
    .map((a) => ({ analysisId: a.analysisId, id: a.id, fromId: a.fromId!, toId: a.toId!, relation: a.relation!, label: a.label, statement: a.statement, sourceQuote: a.sourceQuote }));
  const nodes: IntelNode[] = artefacts.filter((a) => a.kind !== 'edge').map((a) => ({ analysisId: a.analysisId, id: a.id, kind: a.kind, label: a.label }));

  const BANDS = ['severe', 'significant', 'moderate', 'limited'];
  const bodies = shown.map((persona) => {
    const mine = filed.filter((f) => f.personaId === persona.id && f.analysisId);
    // ONE MARK PER DOCUMENT, the latest run of it — two runs of one paper are one paper.
    const byDoc = new Map<string, typeof mine>();
    for (const f of mine) {
      const key = shas.get(f.analysisId!) ?? f.analysisId!;
      byDoc.set(key, [...(byDoc.get(key) ?? []), f]);
    }
    const sightings: IntelSighting[] = mine.map((f) => ({ analysisId: f.analysisId!, actorId: f.actorId ?? '', bodyId: persona.id, plays: Array.isArray(f.plays) ? f.plays : [] }));
    const actors = actorsOfBody(sightings.filter((s) => s.actorId), nodes);
    const rows: RecurringPaper[] = [...byDoc.values()].map((runs) => {
      const latest = [...runs].sort((a, b) => String(b.completedAt ?? b.updatedAt ?? '').localeCompare(String(a.completedAt ?? a.updatedAt ?? '')))[0];
      const plays = runs.filter((r) => r.analysisId === latest.analysisId).flatMap((r) => (Array.isArray(r.plays) ? r.plays : []));
      const worst = plays.map((p) => BANDS.indexOf(String(p.band).toLowerCase())).filter((i) => i >= 0).sort((a, b) => a - b)[0];
      const asks = asksOf(latest.analysisId!, actors.get(`${latest.analysisId}|${persona.id}`) ?? new Set(), edges, nodes);
      const ask = asks.find((a) => a.kind === 'duty') ?? asks[0] ?? null;
      return {
        id: latest.analysisId!, title: latest.title,
        completedAt: latest.completedAt ? latest.completedAt.toISOString() : null,
        worstBand: worst === undefined ? null : BANDS[worst], plays: plays.length, ask: ask ? ask.words : null,
      };
    }).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
    return { personaId: persona.id, name: persona.name, entityType: persona.entityType, sightings: persona.sightings, papers: rows.slice(-RECURRING_PAPERS) };
  });
  return { papers, repeating: recurring.length, bodies };
}

/** What `recurringBodies` is computed from, as a cache key: the library's size and last change, and the finished papers. */
export async function recurringSignature(owner: string): Promise<string> {
  const [library] = await db.select({ observations: count(policyPersonaObservations.id), changed: max(policyPersonas.updatedAt) })
    .from(policyPersonas)
    .leftJoin(policyPersonaObservations, eq(policyPersonaObservations.personaId, policyPersonas.id))
    .where(eq(policyPersonas.owner, owner));
  const [papers] = await db.select({ finished: count(policyAnalyses.id), changed: max(policyAnalyses.updatedAt) })
    .from(policyAnalyses)
    .where(and(eq(policyAnalyses.owner, owner), eq(policyAnalyses.sealed, false), inArray(policyAnalyses.status, ['completed', 'completed_with_gaps'])));
  return JSON.stringify([library?.observations ?? 0, String(library?.changed ?? ''), papers?.finished ?? 0, String(papers?.changed ?? '')]);
}

/** One persona's sightings and its papers' graphs, keyed by the persona rather than a register body. */
async function personaRows(owner: string, personaId: string): Promise<Rows> {
  const filed = await db.select({
    analysisId: policyPersonaObservations.analysisId, actorId: policyPersonaObservations.actorId, plays: policyPersonaObservations.plays,
    title: policyAnalyses.title, completedAt: policyAnalyses.completedAt,
  })
    .from(policyPersonaObservations)
    .innerJoin(policyAnalyses, eq(policyAnalyses.id, policyPersonaObservations.analysisId))
    .where(and(
      eq(policyPersonaObservations.personaId, personaId), eq(policyPersonaObservations.kind, 'assessment'),
      eq(policyAnalyses.owner, owner), eq(policyAnalyses.sealed, false), inArray(policyAnalyses.status, ['completed', 'completed_with_gaps']),
    ))
    .orderBy(desc(policyAnalyses.completedAt));
  const analysisIds = [...new Set(filed.map((f) => f.analysisId!).filter(Boolean))].slice(0, PAPER_LIMIT);
  if (!analysisIds.length) return { papers: [], sightings: [], edges: [], nodes: [] };
  // The PAPER key (phase 25), so a run with an annex and one without are one paper.
  const shas = await paperKeys(analysisIds);
  const papers = new Map<string, IntelPaper>();
  for (const f of filed) {
    if (!f.analysisId || papers.has(f.analysisId) || !analysisIds.includes(f.analysisId)) continue;
    papers.set(f.analysisId, { id: f.analysisId, title: f.title, completedAt: f.completedAt ? f.completedAt.toISOString() : null, sha256: shas.get(f.analysisId) ?? null });
  }
  const sightings: IntelSighting[] = filed
    .filter((f) => f.analysisId && f.actorId && analysisIds.includes(f.analysisId))
    .map((f) => ({ analysisId: f.analysisId!, actorId: f.actorId!, bodyId: personaId, plays: Array.isArray(f.plays) ? f.plays : [] }));
  const artefacts = await db.select({
    analysisId: policyArtefacts.analysisId, id: policyArtefacts.id, kind: policyArtefacts.kind, label: policyArtefacts.label, statement: policyArtefacts.statement,
    fromId: policyArtefacts.fromId, toId: policyArtefacts.toId, relation: policyArtefacts.relation, sourceQuote: policyArtefacts.sourceQuote,
  }).from(policyArtefacts).where(and(inArray(policyArtefacts.analysisId, analysisIds), inArray(policyArtefacts.kind, ['edge', 'actor', 'mechanism'])));
  return {
    papers: [...papers.values()],
    sightings,
    edges: artefacts.filter((a) => a.kind === 'edge' && a.fromId && a.toId && a.relation)
      .map((a) => ({ analysisId: a.analysisId, id: a.id, fromId: a.fromId!, toId: a.toId!, relation: a.relation!, label: a.label, statement: a.statement, sourceQuote: a.sourceQuote })),
    nodes: artefacts.filter((a) => a.kind !== 'edge').map((a) => ({ analysisId: a.analysisId, id: a.id, kind: a.kind, label: a.label })),
  };
}
