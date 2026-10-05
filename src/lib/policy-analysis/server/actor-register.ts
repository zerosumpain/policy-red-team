import { and, eq, inArray, sql } from 'drizzle-orm';
import { pgTable, text as pgText, timestamp } from 'drizzle-orm/pg-core';
import { db, type DbExecutor } from '$lib/db';
import { policyActorMentions, policyAnalyses, policyArtefacts, policyDocuments, policyPersonaDecisions, policyPersonaObservations, policyPersonas } from '$lib/db/schema';
import { normaliseName } from '$lib/jkai/intel/resolve/match';
import type { Artefact } from '../contracts';
import {
  ACTOR_KINDS, actorKey, ancestry, capacityOf, classifyMention, entryIndex, inferKind, isNamedPerson, matchName, NOT_ACTOR_REASONS, REGISTER_KINDS, splitComposite, wouldCycle,
  type RegisterEntry, type RegisterKind, type RegisterPlan, type RegisterView, type Target,
} from '../actor-register';
import { resolveBody } from '../register';
import { PolicyError } from '../validation';
import { registerIndex, syncRegister } from './register';

/**
 * THE MASTER LIST OF ACTORS' STORE — phase 23.
 *
 * The list is `policy_personas`, extended (`migrations/0006-actor-register.sql`):
 * one identity system, so a body's GOV.UK link, its aliases, the reader's
 * rulings and its dossier stay one row. This module reads the list for a run,
 * writes what an UNSEALED run proposed inside that run's own commit, serves the
 * register to the pages, and carries the reader's rulings on it.
 *
 * EVERY WRITER TAKES THE PERSONA LOCK (`policy-persona:<owner>`), the one
 * `applyPersonaLinks` and the merge already take, so a run proposing "Providers"
 * and a reader merging two rows cannot interleave.
 */

const lockOwner = (tx: DbExecutor, owner: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`policy-persona:${owner}`}))`);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set<string>(REGISTER_KINDS);

function toEntry(row: typeof policyPersonas.$inferSelect): RegisterEntry {
  return {
    id: row.id, name: row.name, aliases: list<string>(row.aliases),
    kind: (KINDS.has(row.kind) ? row.kind : 'organisation') as RegisterKind,
    partOf: row.partOf ?? null, kindOf: row.kindOf ?? null,
    status: row.status === 'confirmed' ? 'confirmed' : 'proposed',
    bodyId: row.bodyId ?? null, whatItIs: row.whatItIs ?? null, notActorReason: row.notActorReason ?? null,
    entityType: row.entityType,
  };
}

/** The whole list for one owner. Bounded: a list this size is matched in memory. */
const REGISTER_LIMIT = 5000;

async function entriesOf(owner: string, tx: DbExecutor = db) {
  return tx.select().from(policyPersonas).where(eq(policyPersonas.owner, owner)).limit(REGISTER_LIMIT);
}

async function rulingsOf(owner: string, tx: DbExecutor = db) {
  const rows = await tx.select().from(policyPersonaDecisions).where(eq(policyPersonaDecisions.owner, owner));
  return rows
    .filter((r) => r.verdict === 'same' || r.verdict === 'different')
    .map((r) => ({ personaId: r.personaId, subject: r.subject, verdict: r.verdict as 'same' | 'different' }));
}

/**
 * What a run reads: the list, the rulings, the GOV.UK register. Read for a
 * sealed run too — reading writes nothing — and handed to stage 2 once.
 */
export async function loadRegisterView(owner: string, tx: DbExecutor = db): Promise<RegisterView> {
  const [rows, rulings, bodies] = await Promise.all([entriesOf(owner, tx), rulingsOf(owner, tx), registerIndex()]);
  return { entries: rows.map(toEntry), rulings, bodies };
}

/**
 * WRITE WHAT AN UNSEALED RUN PROPOSED, inside the stage's own commit.
 *
 * Each proposal is matched AGAIN against the list as it stands under the lock —
 * a second run may have proposed "Providers" a minute ago — and only created
 * where it is still new. Parents are set after every row exists, and a parent
 * that would close a loop in either tree is left off. The run's mentions are
 * replaced, never duplicated, so a stage that is committed twice says once.
 *
 * Returns each proposal's key → the id of the row it now is, for
 * `stampMasterIds`. The caller stamps only after this has committed, so no
 * artefact can name a row a rolled-back savepoint took away.
 */
export async function applyRegisterPlan(tx: DbExecutor, owner: string, analysisId: string, plan: RegisterPlan): Promise<{ ids: Map<string, string>; created: number }> {
  await lockOwner(tx, owner);
  await syncRegister(tx);
  const rows = await entriesOf(owner, tx);
  const index = entryIndex({ entries: rows.map(toEntry), rulings: await rulingsOf(owner, tx) });
  const knownBodies = (await registerIndex(tx)).bodies;
  const ids = new Map<string, string>();
  const created = new Set<string>();
  for (const p of plan.proposals) {
    const again = matchName(p.name, index)?.entry ?? (p.bodyId ? index.byBody.get(p.bodyId)?.[0] : undefined);
    if (again) { ids.set(p.key, again.id); continue; }
    const [row] = await tx.insert(policyPersonas).values({
      owner, name: clip(p.name, 300), entityType: clip(p.entityType, 60) || 'concept',
      kind: p.kind, status: 'proposed', proposedIn: analysisId, dossierVersion: 1, aliases: [],
      bodyId: p.bodyId && knownBodies.has(p.bodyId) ? p.bodyId : null,
      whatItIs: p.whatItIs ? clip(p.whatItIs, 400) : null,
      notActorReason: p.kind === 'not_an_actor' ? (p.notActorReason ?? 'other') : null,
    }).returning();
    ids.set(p.key, row.id);
    created.add(row.id);
    rows.push(row);
    // Indexed at once, so a later proposal under the same name finds this one.
    const entry = toEntry(row);
    index.byId.set(entry.id, entry);
    index.byKey.set(actorKey(entry.name), [...(index.byKey.get(actorKey(entry.name)) ?? []), entry]);
  }
  const resolve = (t: Target | null) => (t ? (t.to === 'existing' ? t.id : ids.get(t.key) ?? null) : null);
  const parents = { partOf: new Map(rows.map((r) => [r.id, r.partOf ?? null])), kindOf: new Map(rows.map((r) => [r.id, r.kindOf ?? null])) };
  for (const p of plan.proposals) {
    const id = ids.get(p.key);
    if (!id || !created.has(id)) continue;
    const set: { partOf?: string; kindOf?: string } = {};
    for (const field of ['partOf', 'kindOf'] as const) {
      const parent = resolve(p[field]);
      if (!parent || parent === id || !index.byId.has(parent)) continue;
      // An actor never sits inside, or belongs to a category of, something that is not an actor.
      if (p.kind !== 'not_an_actor' && index.byId.get(parent)?.kind === 'not_an_actor') continue;
      if (wouldCycle(id, parent, (x) => parents[field].get(x) ?? null)) continue;
      parents[field].set(id, parent);
      set[field] = parent;
    }
    if (Object.keys(set).length) await tx.update(policyPersonas).set(set).where(eq(policyPersonas.id, id));
  }
  await tx.delete(policyActorMentions).where(eq(policyActorMentions.analysisId, analysisId));
  const seen = new Set<string>();
  const mentionRows = plan.mentions
    .map((m) => ({ m, masterId: resolve(m.target) }))
    .filter(({ m, masterId }) => {
      if (!masterId || !index.byId.has(masterId)) return false;
      const k = `${m.mentionId}|${masterId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ m, masterId }) => ({ owner, analysisId, actorId: m.actorId, mentionId: clip(m.mentionId, 100), masterId: masterId!, capacity: m.capacity, basis: clip(m.basis, 40), wording: clip(m.wording, 300) || '—' }));
  for (let i = 0; i < mentionRows.length; i += 200) await tx.insert(policyActorMentions).values(mentionRows.slice(i, i + 200));
  // THE PAPER'S WORDING BECOMES AN ALIAS of the actor it matched — the "early
  // years workforce" kept on the one workforce — so the next paper that says
  // it matches by rule. Never a personal name.
  for (const { id, names } of plan.aliases) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    const held = list<string>(row.aliases);
    const keys = new Set([normaliseName(row.name), ...held.map(normaliseName)]);
    const fresh = names.filter((n) => !isNamedPerson(n, 'person') && !keys.has(normaliseName(n)));
    if (!fresh.length) continue;
    await tx.update(policyPersonas).set({ aliases: [...held, ...fresh].slice(0, 40), updatedAt: new Date() }).where(eq(policyPersonas.id, id));
  }
  return { ids, created: created.size };
}

/** Put the ids of the rows a run's proposals became onto its stage-2 actors. */
export function stampMasterIds(artefacts: Artefact[], ids: Map<string, string>) {
  for (const a of artefacts) {
    if (a.kind !== 'actor') continue;
    const master = a.data.master as { id: string | null; key: string; partOf?: { id: string | null; key: string } | null; kindOf?: { id: string | null; key: string } | null } | undefined;
    if (!master) continue;
    if (!master.id && ids.has(master.key)) master.id = ids.get(master.key)!;
    for (const ref of [master.partOf, master.kindOf]) if (ref && !ref.id && ids.has(ref.key)) ref.id = ids.get(ref.key)!;
  }
}

// ---------------------------------------------------------------------------
// The register as the pages read it
// ---------------------------------------------------------------------------

const BANDS = ['severe', 'significant', 'moderate', 'limited'];

export type RegisterNode = {
  id: string;
  name: string;
  kind: RegisterKind;
  status: 'confirmed' | 'proposed';
  partOf: string | null;
  kindOf: string | null;
  /** Nearest first. */
  partOfPath: string[];
  kindOfPath: string[];
  whatItIs: string | null;
  notActorReason: string | null;
  aliases: string[];
  body: { id: string; name: string } | null;
  /** Papers that name it, counted by document. */
  papers: number;
  analyses: { id: string; title: string }[];
  /** How often each capacity was seen across those papers. */
  capacities: Record<string, number>;
  /** True when a dossier has been written for it (stage 13). */
  dossier: boolean;
  plays: number;
  worstBand: string | null;
  /** The same, over this actor AND everything below it in each tree — labelled inherited on the page. */
  rollup: { partOf: { plays: number; worstBand: string | null }; kindOf: { plays: number; worstBand: string | null } };
  proposedIn: { id: string; title: string } | null;
};

export type RegisterTree = {
  entries: RegisterNode[];
  /** Ids with no parent in each tree, and each id's children. */
  partOf: { roots: string[]; children: Record<string, string[]> };
  kindOf: { roots: string[]; children: Record<string, string[]> };
  counts: { actors: number; proposed: number; notActors: number; groups: number };
};

/**
 * THE REGISTER AS A TREE, both hierarchies, for the hub the landing builder
 * draws in phase 24. Everything is counted from rows, no model, and nothing
 * here leaves the owner's own pages: the sealed papers wrote no mention.
 */
export async function registerTreeFor(owner: string): Promise<RegisterTree> {
  const rows = await entriesOf(owner);
  const ids = rows.map((r) => r.id);
  const mentions = ids.length ? await db.select({ masterId: policyActorMentions.masterId, analysisId: policyActorMentions.analysisId, capacity: policyActorMentions.capacity }).from(policyActorMentions).where(eq(policyActorMentions.owner, owner)) : [];
  const observations = ids.length ? await db.select({ personaId: policyPersonaObservations.personaId, analysisId: policyPersonaObservations.analysisId, kind: policyPersonaObservations.kind, plays: policyPersonaObservations.plays }).from(policyPersonaObservations).where(inArray(policyPersonaObservations.personaId, ids)) : [];
  const analysisIds = [...new Set([...mentions.map((m) => m.analysisId), ...observations.map((o) => o.analysisId).filter((a): a is string => Boolean(a))])];
  const analyses = analysisIds.length ? await db.select({ id: policyAnalyses.id, title: policyAnalyses.title, sealed: policyAnalyses.sealed, sha: policyDocuments.sha256 }).from(policyAnalyses).leftJoin(policyDocuments, eq(policyDocuments.analysisId, policyAnalyses.id)).where(and(eq(policyAnalyses.owner, owner), inArray(policyAnalyses.id, analysisIds))) : [];
  const paper = new Map(analyses.filter((a) => !a.sealed).map((a) => [a.id, a]));
  const proposedIds = rows.map((r) => r.proposedIn).filter((a): a is string => Boolean(a));
  const proposers = proposedIds.length ? new Map((await db.select({ id: policyAnalyses.id, title: policyAnalyses.title, sealed: policyAnalyses.sealed }).from(policyAnalyses).where(inArray(policyAnalyses.id, proposedIds))).filter((a) => !a.sealed).map((a) => [a.id, a.title])) : new Map<string, string>();
  const index = await registerIndex();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = (field: 'partOf' | 'kindOf') => {
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const parent = r[field];
      if (parent && byId.has(parent)) (out[parent] ??= []).push(r.id);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));
    return out;
  };
  const tree = { partOf: children('partOf'), kindOf: children('kindOf') };
  const own = new Map<string, { plays: number; worst: number }>();
  const nodes: RegisterNode[] = rows.map((r) => {
    const mine = mentions.filter((m) => m.masterId === r.id);
    const obs = observations.filter((o) => o.personaId === r.id);
    const seen = new Map<string, { id: string; title: string; sha: string }>();
    for (const a of [...mine.map((m) => m.analysisId), ...obs.map((o) => o.analysisId)]) {
      const row = a ? paper.get(a) : undefined;
      if (row) seen.set(row.id, { id: row.id, title: row.title, sha: row.sha ?? row.id });
    }
    const capacities: Record<string, number> = {};
    for (const m of mine) if (m.capacity) capacities[m.capacity] = (capacities[m.capacity] ?? 0) + 1;
    const plays = obs.flatMap((o) => list<{ band?: string }>(o.plays));
    const worst = Math.min(...plays.map((p) => BANDS.indexOf(String(p.band))).filter((i) => i >= 0), BANDS.length);
    own.set(r.id, { plays: plays.length, worst });
    const body = r.bodyId ? index.bodies.get(r.bodyId) : undefined;
    const path = (field: 'partOf' | 'kindOf') => ancestry(r.id, (x) => byId.get(x)?.[field] ?? null, (x) => byId.get(x)?.name ?? null);
    return {
      id: r.id, name: r.name, kind: (KINDS.has(r.kind) ? r.kind : 'organisation') as RegisterKind,
      status: r.status === 'confirmed' ? 'confirmed' : 'proposed',
      partOf: r.partOf && byId.has(r.partOf) ? r.partOf : null, kindOf: r.kindOf && byId.has(r.kindOf) ? r.kindOf : null,
      partOfPath: path('partOf'), kindOfPath: path('kindOf'),
      whatItIs: r.whatItIs ?? null, notActorReason: r.notActorReason ?? null,
      aliases: list<string>(r.aliases).slice(0, 40),
      body: body ? { id: body.id, name: body.name } : null,
      papers: new Set([...seen.values()].map((s) => s.sha)).size,
      analyses: [...seen.values()].map(({ id, title }) => ({ id, title })),
      capacities,
      dossier: obs.some((o) => o.kind === 'assessment'),
      plays: plays.length,
      worstBand: worst < BANDS.length ? BANDS[worst] : null,
      rollup: { partOf: { plays: 0, worstBand: null }, kindOf: { plays: 0, worstBand: null } },
      proposedIn: r.proposedIn && proposers.has(r.proposedIn) ? { id: r.proposedIn, title: proposers.get(r.proposedIn)! } : null,
    };
  });
  // ROLL-UP: what was found for childminders shows under early years providers
  // too. Every descendant counted once, a loop (there should be none) cut.
  for (const node of nodes) {
    for (const field of ['partOf', 'kindOf'] as const) {
      let plays = 0; let worst = BANDS.length;
      const stack = [node.id]; const seen = new Set<string>();
      while (stack.length) {
        const at = stack.pop()!;
        if (seen.has(at)) continue;
        seen.add(at);
        plays += own.get(at)?.plays ?? 0;
        worst = Math.min(worst, own.get(at)?.worst ?? BANDS.length);
        stack.push(...(tree[field][at] ?? []));
      }
      node.rollup[field] = { plays, worstBand: worst < BANDS.length ? BANDS[worst] : null };
    }
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  const roots = (field: 'partOf' | 'kindOf') => nodes.filter((n) => !n[field]).map((n) => n.id);
  return {
    entries: nodes,
    partOf: { roots: roots('partOf'), children: tree.partOf },
    kindOf: { roots: roots('kindOf'), children: tree.kindOf },
    counts: {
      actors: nodes.filter((n) => n.kind !== 'not_an_actor').length,
      proposed: nodes.filter((n) => n.status === 'proposed').length,
      notActors: nodes.filter((n) => n.kind === 'not_an_actor').length,
      groups: nodes.filter((n) => n.kind === 'group_of_people').length,
    },
  };
}

/**
 * THE REVIEW QUEUE: every proposed entry, most-seen first, each with the rows
 * it might really be — the same name family or one name inside the other.
 * Offered, never acted on.
 */
export async function proposalQueue(owner: string) {
  const tree = await registerTreeFor(owner);
  const confirmedOrAll = tree.entries;
  const words = (name: string) => new Set(actorKey(name).split(' ').filter((w) => w.length > 2));
  return tree.entries
    .filter((e) => e.status === 'proposed')
    .sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name))
    .map((e) => {
      const mine = words(e.name);
      const key = actorKey(e.name);
      const similar = confirmedOrAll
        .filter((o) => o.id !== e.id && o.kind !== 'not_an_actor')
        .map((o) => {
          const other = actorKey(o.name);
          const shared = [...words(o.name)].filter((w) => mine.has(w)).length;
          const contains = other !== key && (other.includes(key) || key.includes(other));
          return { o, score: (contains ? 2 : 0) + shared };
        })
        .filter((x) => x.score >= 2)
        .sort((a, b) => b.score - a.score || a.o.name.localeCompare(b.o.name))
        .slice(0, 5)
        .map(({ o, score }) => ({ id: o.id, name: o.name, reason: score >= 3 ? 'The names overlap closely.' : 'One name contains the other, or they share words.' }));
      return { ...e, similar };
    });
}

// ---------------------------------------------------------------------------
// The reader's rulings on the register
// ---------------------------------------------------------------------------

async function owned(tx: DbExecutor, owner: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await tx.select().from(policyPersonas).where(and(eq(policyPersonas.id, id), eq(policyPersonas.owner, owner)));
  return row ?? null;
}

/** ACCEPT a proposal: the reader vouches for it. Optionally with the kind it really is. */
export async function acceptEntry(owner: string, id: string, kind?: string | null): Promise<{ id: string; status: 'confirmed' }> {
  if (kind && !(ACTOR_KINDS as readonly string[]).includes(kind)) throw new PolicyError('input', 'Choose what sort of actor this is.');
  return db.transaction(async (tx) => {
    await lockOwner(tx, owner);
    const row = await owned(tx, owner, id);
    if (!row) throw new PolicyError('missing', 'That actor is no longer on the list.');
    await tx.update(policyPersonas).set({ status: 'confirmed', ...(kind ? { kind, notActorReason: null } : {}), updatedAt: new Date() }).where(eq(policyPersonas.id, id));
    return { id, status: 'confirmed' as const };
  });
}

/**
 * MOVE an actor in either tree. `null` takes it out from under its parent;
 * `undefined` leaves that tree alone. Refused where it would make a loop —
 * the Secretary of State cannot be part of a body that is part of the
 * Secretary of State — and where the new parent is not an actor.
 */
export async function reparentEntry(owner: string, id: string, change: { partOf?: string | null; kindOf?: string | null }): Promise<{ id: string; partOf: string | null; kindOf: string | null }> {
  return db.transaction(async (tx) => {
    await lockOwner(tx, owner);
    const row = await owned(tx, owner, id);
    if (!row) throw new PolicyError('missing', 'That actor is no longer on the list.');
    const rows = await entriesOf(owner, tx);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const set: { partOf?: string | null; kindOf?: string | null } = {};
    for (const field of ['partOf', 'kindOf'] as const) {
      const value = change[field];
      if (value === undefined) continue;
      if (value === null) { set[field] = null; continue; }
      const parent = byId.get(value);
      if (!parent) throw new PolicyError('input', 'Choose an actor that is on the list.');
      if (parent.id === id) throw new PolicyError('input', 'An actor cannot sit under itself.');
      if (parent.kind === 'not_an_actor') throw new PolicyError('input', `${parent.name} is marked as not an actor, so nothing can sit under it.`);
      if (field === 'kindOf' && row.kind !== 'not_an_actor' && parent.kind !== 'sector_or_category' && parent.kind !== 'group_of_people') {
        // Allowed — a reader may know better — but only into a category-shaped
        // parent or a group; "a kind of" one organisation is almost always a
        // "part of" that the reader meant.
        throw new PolicyError('input', `${parent.name} is a single ${parent.kind.replaceAll('_', ' ')}, not a category. Did you mean "part of"?`);
      }
      if (wouldCycle(id, parent.id, (x) => byId.get(x)?.[field] ?? null)) {
        throw new PolicyError('state', `${parent.name} already sits ${field === 'partOf' ? 'inside' : 'under'} ${row.name}, so ${row.name} cannot sit under it. Move one of them first.`);
      }
      set[field] = parent.id;
    }
    if (Object.keys(set).length) await tx.update(policyPersonas).set({ ...set, updatedAt: new Date() }).where(eq(policyPersonas.id, id));
    return { id, partOf: set.partOf !== undefined ? set.partOf : row.partOf ?? null, kindOf: set.kindOf !== undefined ? set.kindOf : row.kindOf ?? null };
  });
}

/**
 * NOT AN ACTOR: a programme, a place, an assessment. The row stays — so the
 * next paper that names it matches it by rule and never profiles it — and
 * anything that sat under it is let go. `runBy` attaches a programme to the
 * actor that runs it. A NAMED PERSON is not kept even as that: delete the row.
 */
export async function markNotActor(owner: string, id: string, reason: string, runBy?: string | null): Promise<{ id: string }> {
  if (!(NOT_ACTOR_REASONS as readonly string[]).includes(reason) || reason === 'named_person') {
    throw new PolicyError('input', reason === 'named_person' ? 'A named person is not kept on the list at all. Remove it instead.' : 'Say what it is: a programme, a place, an assessment or something else.');
  }
  return db.transaction(async (tx) => {
    await lockOwner(tx, owner);
    const row = await owned(tx, owner, id);
    if (!row) throw new PolicyError('missing', 'That actor is no longer on the list.');
    let partOf: string | null = null;
    if (runBy) {
      const runner = await owned(tx, owner, runBy);
      if (!runner || runner.kind === 'not_an_actor') throw new PolicyError('input', 'Choose the actor that runs it.');
      partOf = runner.id;
    }
    await tx.update(policyPersonas).set({ kind: 'not_an_actor', notActorReason: reason, partOf, kindOf: null, status: 'confirmed', updatedAt: new Date() }).where(eq(policyPersonas.id, id));
    await tx.update(policyPersonas).set({ partOf: null }).where(and(eq(policyPersonas.owner, owner), eq(policyPersonas.partOf, id)));
    await tx.update(policyPersonas).set({ kindOf: null }).where(and(eq(policyPersonas.owner, owner), eq(policyPersonas.kindOf, id)));
    return { id };
  });
}

// ---------------------------------------------------------------------------
// The backfill
// ---------------------------------------------------------------------------

export type BackfillReport = {
  before: { personas: number; mentions: number };
  after: { entries: number; confirmed: number; proposed: number; mentions: number; notActors: number; groups: number };
  runs: { analysisId: string; actors: number; labels: number; masters: number; matched: number; proposed: number; dropped: number; clusters: { master: string; labels: string[] }[] }[];
  seeded: { kind: Record<string, number>; partOf: number; kindOf: number };
};

/**
 * ONE-OFF, IDEMPOTENT, AND NO MODEL.
 *
 *   - Every existing persona gets a kind (from its type and its name) and a
 *     status: CONFIRMED where the GOV.UK register vouches for it, PROPOSED
 *     otherwise — the reader has never been asked about the rest.
 *   - A GOV.UK parent that is also on the list becomes `part_of`.
 *   - Each finished, unsealed run's stage-2 actors are mapped to master actors
 *     by the same deterministic rules a new run uses — name, alias, GOV.UK,
 *     rulings — and what nothing matches becomes a proposal under its own
 *     name. Named private individuals are skipped; a programme the rules
 *     recognise is recorded as not an actor.
 *   - Its mentions are written, so the register can say which papers named
 *     what. ARTEFACTS ARE NOT TOUCHED: an old report renders exactly as it did.
 *
 * Run again, it finds every mention already written and maps nothing twice.
 */
export async function backfillRegister(tx: DbExecutor = db, options: { owner?: string } = {}): Promise<BackfillReport> {
  const owners = options.owner ? [options.owner] : [...new Set((await tx.select({ owner: policyAnalyses.owner }).from(policyAnalyses)).map((r) => r.owner))];
  const report: BackfillReport = { before: { personas: 0, mentions: 0 }, after: { entries: 0, confirmed: 0, proposed: 0, mentions: 0, notActors: 0, groups: 0 }, runs: [], seeded: { kind: {}, partOf: 0, kindOf: 0 } };
  report.before.personas = (await tx.select({ id: policyPersonas.id }).from(policyPersonas)).length;
  report.before.mentions = (await tx.select({ id: policyActorMentions.id }).from(policyActorMentions)).length;
  await syncRegister(tx);
  const bodies = await registerIndex(tx);
  for (const owner of owners) {
    await lockOwner(tx, owner);
    // 1. SEED the existing rows, once: a row the backfill has seeded carries a
    // kind it chose, and a reader's later change is never overwritten because
    // only rows still at the column defaults with no ruling are touched.
    const rows = await entriesOf(owner, tx);
    for (const row of rows) {
      if (row.status === 'confirmed' || row.kind !== 'organisation' || row.partOf || row.kindOf) continue;
      const kind = seedKind(row.entityType, row.name);
      const confirmed = Boolean(row.bodyId);
      report.seeded.kind[kind] = (report.seeded.kind[kind] ?? 0) + 1;
      await tx.update(policyPersonas).set({
        kind, status: confirmed ? 'confirmed' : 'proposed',
        notActorReason: kind === 'not_an_actor' ? 'programme' : null,
      }).where(eq(policyPersonas.id, row.id));
      row.kind = kind; row.status = confirmed ? 'confirmed' : 'proposed';
    }
    // GOV.UK structure, where both ends are on the list.
    const onList = new Map(rows.filter((r) => r.bodyId).map((r) => [r.bodyId!, r.id]));
    for (const row of rows) {
      if (!row.bodyId || row.partOf) continue;
      const parent = bodies.bodies.get(row.bodyId)?.parentIds.map((p) => onList.get(p)).find(Boolean);
      if (!parent || parent === row.id) continue;
      if (wouldCycle(row.id, parent, (x) => rows.find((r) => r.id === x)?.partOf ?? null)) continue;
      await tx.update(policyPersonas).set({ partOf: parent }).where(eq(policyPersonas.id, row.id));
      row.partOf = parent;
      report.seeded.partOf++;
    }

    // 2. MAP each finished, unsealed run that has no mentions yet.
    const runs = await tx.select({ id: policyAnalyses.id, status: policyAnalyses.status, sealed: policyAnalyses.sealed })
      .from(policyAnalyses).where(and(eq(policyAnalyses.owner, owner), inArray(policyAnalyses.status, ['completed', 'completed_with_gaps'])));
    for (const run of runs) {
      if (run.sealed) continue;
      const [already] = await tx.select({ id: policyActorMentions.id }).from(policyActorMentions).where(eq(policyActorMentions.analysisId, run.id)).limit(1);
      if (already) continue;
      const actors = (await tx.select().from(policyArtefacts).where(and(eq(policyArtefacts.analysisId, run.id), eq(policyArtefacts.kind, 'actor'))))
        .filter((a) => a.id.startsWith('s2_'));
      if (!actors.length) continue;
      const entries = (await entriesOf(owner, tx)).map(toEntry);
      const view: RegisterView = { entries, rulings: await rulingsOf(owner, tx), bodies };
      const index = entryIndex(view);
      const masters = new Map<string, Set<string>>();
      let matched = 0; let proposed = 0; let dropped = 0;
      const mentionRows: (typeof policyActorMentions.$inferInsert)[] = [];
      for (const actor of actors) {
        const data = (actor.data ?? {}) as Record<string, unknown>;
        const asMention = { id: actor.id, label: actor.label, statement: actor.statement, data } as unknown as Artefact;
        const said = classifyMention(asMention);
        if (said.is === 'not_actor' && said.reason === 'named_person') { dropped++; continue; }
        let masterId: string | null = null;
        let basis = 'name';
        const hit = matchName(actor.label, index);
        if (hit) { masterId = hit.entry.id; basis = hit.basis; }
        if (!masterId) {
          const resolved = resolveBody({ label: actor.label, aliases: list<string>(data.aliases).filter((a) => !isNamedPerson(a, 'person')), entityType: String(data.entityType ?? '') }, bodies);
          const held = resolved ? index.byBody.get(resolved.body.id)?.[0] ?? matchName(resolved.body.name, index)?.entry : undefined;
          if (held) { masterId = held.id; basis = 'register'; }
          else if (resolved) {
            masterId = await createProposal(tx, owner, run.id, { name: resolved.body.name, kind: 'organisation', entityType: String(data.entityType ?? 'agency'), bodyId: resolved.body.id, notActorReason: null }, index);
            basis = 'register'; proposed++;
          }
        }
        if (!masterId) {
          // Uncertain: a proposal under its own name. A composite stays whole —
          // splitting it is a reader's call, or the next run's model's.
          const notActor = said.is === 'not_actor' ? said.reason : said.is === 'unsure' && said.hint === 'programme' ? 'programme' : null;
          masterId = await createProposal(tx, owner, run.id, {
            name: actor.label, kind: notActor ? 'not_an_actor' : inferKind(String(data.entityType ?? ''), actor.label),
            entityType: String(data.entityType ?? 'concept'), bodyId: null, notActorReason: notActor,
          }, index);
          basis = splitComposite(actor.label) ? 'fallback' : 'reconciled';
          proposed++;
        } else matched++;
        (masters.get(masterId) ?? masters.set(masterId, new Set()).get(masterId)!).add(actor.label);
        for (const mentionId of list<string>(data.mentions)) {
          mentionRows.push({ owner, analysisId: run.id, actorId: actor.id, mentionId: clip(mentionId, 100), masterId, capacity: capacityOf(`${actor.statement} ${actor.label}`), basis, wording: clip(actor.label, 300) || '—' });
        }
      }
      const seen = new Set<string>();
      const unique = mentionRows.filter((r) => { const k = `${r.mentionId}|${r.masterId}`; if (seen.has(k)) return false; seen.add(k); return true; });
      for (let i = 0; i < unique.length; i += 200) await tx.insert(policyActorMentions).values(unique.slice(i, i + 200)).onConflictDoNothing();
      const names = new Map((await entriesOf(owner, tx)).map((r) => [r.id, r.name]));
      report.runs.push({
        analysisId: run.id, actors: actors.length, labels: new Set(actors.map((a) => a.label)).size, masters: masters.size, matched, proposed, dropped,
        clusters: [...masters].filter(([, labels]) => labels.size > 1).map(([id, labels]) => ({ master: names.get(id) ?? id, labels: [...labels].sort() })).sort((a, b) => b.labels.length - a.labels.length),
      });
    }
  }
  const all = await tx.select().from(policyPersonas);
  report.after = {
    entries: all.length,
    confirmed: all.filter((r) => r.status === 'confirmed').length,
    proposed: all.filter((r) => r.status === 'proposed').length,
    mentions: (await tx.select({ id: policyActorMentions.id }).from(policyActorMentions)).length,
    notActors: all.filter((r) => r.kind === 'not_an_actor').length,
    groups: all.filter((r) => r.kind === 'group_of_people').length,
  };
  return report;
}

/**
 * A kind for a persona written before the register, from what it was typed and
 * how it is named. The live library typed some rows in free words ("provider
 * category", "provider grouping"), which say category outright.
 */
export function seedKind(entityType: string, name: string): RegisterKind {
  const type = entityType.toLowerCase();
  if (/category|group(ing)?$|sector/.test(type)) return 'sector_or_category';
  if (type === 'programme' && !/\b(hubs?|services?|centres?|teams?)\b/i.test(name)) return 'not_an_actor';
  if (type === 'user_group') return 'group_of_people';
  return inferKind(type, name);
}

async function createProposal(tx: DbExecutor, owner: string, analysisId: string, p: { name: string; kind: RegisterKind; entityType: string; bodyId: string | null; notActorReason: string | null }, index: ReturnType<typeof entryIndex>): Promise<string> {
  const again = matchName(p.name, index)?.entry;
  if (again) return again.id;
  const [row] = await tx.insert(policyPersonas).values({
    owner, name: clip(p.name, 300), entityType: clip(p.entityType, 60) || 'concept', kind: p.kind, status: 'proposed', proposedIn: analysisId,
    dossierVersion: 1, aliases: [], bodyId: p.bodyId, notActorReason: p.kind === 'not_an_actor' ? (p.notActorReason ?? 'other') : null,
  }).returning();
  const entry = toEntry(row);
  index.byId.set(entry.id, entry);
  index.byKey.set(actorKey(entry.name), [...(index.byKey.get(actorKey(entry.name)) ?? []), entry]);
  if (entry.bodyId) index.byBody.set(entry.bodyId, [...(index.byBody.get(entry.bodyId) ?? []), entry]);
  return row.id;
}

/**
 * The migrations ledger, read here and nowhere else, so the one-off backfill
 * runs ONCE per database — at the boot after the migration that made room for
 * it — and a reader's later edits are never re-seeded over. Not in `schema.ts`:
 * it belongs to `scripts/migrate.mjs`, and the schema test compares only the
 * tables the pipeline owns.
 */
const ledger = pgTable('_migrations', { name: pgText('name').primaryKey(), appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow() });
export const BACKFILL_MARK = 'backfill:0006-actor-register';

export async function backfillRegisterOnce(tx: DbExecutor = db): Promise<BackfillReport | null> {
  const [done] = await tx.select({ name: ledger.name }).from(ledger).where(eq(ledger.name, BACKFILL_MARK));
  if (done) return null;
  const report = await backfillRegister(tx);
  await tx.insert(ledger).values({ name: BACKFILL_MARK }).onConflictDoNothing();
  return report;
}
