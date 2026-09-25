// Phase 19, workstream X, against real Postgres: the public-record store, the
// run-time lookup, stage 11's choice of neighbours by shared register body,
// and the cross-paper views.
//
// No network. `tests/setup-integration.ts` swaps the three API adapters for
// the fixture stand-in in every file; the first test here proves that it did.
// Recorded answers from the real APIs go in through `saveAnswers`.
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAnalyses, policyBodyEvidence, policyBodyEvidenceChecks, policyPersonas } from '$lib/db/schema';
import { artefact, type Artefact } from './contracts';
import { committeeRecords, govukRecords } from './body-evidence';
import { createAnalysis, neighbourSummaries, persistArtefacts, remove } from './server/store';
import { applyPersonaLinks } from './server/personas';
import { bodyRecord, evidenceForActors, libraryBodies, refreshBody, saveAnswers, staleSources } from './server/body-evidence';
import { registerIndex } from './server/register';
import { bodiesGrid, bodyIntel } from './server/intel';

const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
const owner = 'intel-fixture@example.test';
const created: string[] = [];
const recorded = (name: string) => JSON.parse(readFileSync(`tests/fixtures/body-evidence/${name}.json`, 'utf8'));

async function paper(title: string, text = title, completedAt = new Date()) {
  const analysis = await createAnalysis(owner, { title, jurisdiction: 'England', policyArea: 'Education', context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'policy.txt', mimeType: 'text/plain', bytes: Buffer.from(`${text}\n\nA synthetic policy for the intelligence tests.`) });
  created.push(analysis.id);
  await db.update(policyAnalyses).set({ status: 'completed', completedAt }).where(eq(policyAnalyses.id, analysis.id));
  return analysis.id;
}

const actor = (id: string, label: string, entityType = 'department') =>
  artefact(id, 'actor', label, `${label}.`, { entityType, aliases: [], mentions: [], ambiguity: 'none', dates: [], parent: null }, {});
const edge = (id: string, fromId: string, relation: string, toId: string, quote: string) =>
  ({ ...artefact(id, 'edge', relation, quote, { notes: 'x' }, { refs: [fromId, toId] }), fromId, toId, relation: relation as Artefact['relation'], temporal: 'proposed' as const, sourceQuote: quote });
const link = (id: string, actorId: string, name: string) => artefact(id, 'persona_link', name, 'x', {
  personaId: null, personaName: name, entityType: 'department', actorId, aliases: [], summary: `${name}.`, traits: [], observed: [], continuity: 'x', divergence: 'x',
}, { refs: [actorId] });

/** A paper whose graph names the given bodies, written to the library as stage 13 would. */
async function paperNaming(title: string, bodies: { id: string; label: string }[], edges: Artefact[] = [], completedAt = new Date()) {
  const id = await paper(title, title, completedAt);
  const actors = bodies.map((b) => actor(b.id, b.label));
  await db.transaction(async (tx) => {
    await persistArtefacts(tx, id, 2, actors);
    if (edges.length) await persistArtefacts(tx, id, 3, edges);
    await applyPersonaLinks(tx, owner, id, title, actors.map((a, i) => link(`s13_${i}_persona`, a.id, a.label)), actors);
  });
  return id;
}

describe.skipIf(!local)('the public-record store', () => {
  afterAll(async () => {
    for (const id of created) await remove(owner, id).catch(() => false);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, owner));
    await db.delete(policyBodyEvidence);
    await db.delete(policyBodyEvidenceChecks);
  });

  it('never reaches a real API from a test: the fixture stand-in answers', async () => {
    const ofsted = (await registerIndex()).bodies.get('govuk:ofsted')!;
    const result = await refreshBody(ofsted);
    expect(result.asked).toEqual(['govuk', 'committees', 'hansard']);
    const { records, checks } = await bodyRecord('govuk:ofsted');
    expect(records.every((r) => r.publisher === 'Fixture' && r.title.includes('(fixture record)'))).toBe(true);
    expect(checks.map((c) => c.source).sort()).toEqual(['committees', 'govuk', 'hansard']);
  });

  it('keeps dated records, asks nothing again inside thirty days, and never duplicates a record', async () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const at = { bodyId: 'govuk:ofsted', now };
    await saveAnswers('govuk:ofsted', [
      { source: 'govuk', records: govukRecords(recorded('govuk-ofsted'), at), error: null, skipped: null },
      { source: 'committees', records: committeeRecords(recorded('committees-ofsted'), at), error: null, skipped: null },
      { source: 'hansard', records: [], error: 'did not answer in time', skipped: null },
    ], now);
    const first = await bodyRecord('govuk:ofsted');
    const annual = first.records.find((r) => r.title === 'Ofsted corporate annual report and accounts 2025 to 2026')!;
    expect(annual).toMatchObject({ question: 'capacity', publishedAt: '2026-08-11T10:03:49.000Z' });
    // Newest first, dated ones before undated.
    expect(first.records[0].publishedAt! >= first.records[1].publishedAt!).toBe(true);
    // A source that failed is asked again the next day; the others in thirty.
    const hansard = first.checks.find((c) => c.source === 'hansard')!;
    expect(hansard.error).toBe('The source did not answer in time.');
    expect(staleSources(first.checks, new Date('2026-09-27T00:00:00Z'))).toEqual(['hansard']);
    expect(staleSources(first.checks, new Date('2026-10-26T00:00:00Z'))).toEqual(['govuk', 'committees', 'hansard']);
    // The same answers again: updated in place.
    const before = first.records.length;
    const added = await saveAnswers('govuk:ofsted', [{ source: 'govuk', records: govukRecords(recorded('govuk-ofsted'), at), error: null, skipped: null }], now);
    expect(added).toBe(0);
    expect((await bodyRecord('govuk:ofsted')).records).toHaveLength(before);
  });

  it('asks nothing when the install is set not to look anything up — "check again" and the library refresh included', async () => {
    const before = process.env.POLICY_SEARCH;
    process.env.POLICY_SEARCH = 'none';
    try {
      const home = (await registerIndex()).bodies.get('govuk:home-office')!;
      const result = await refreshBody(home, { force: true });
      expect(result).toMatchObject({ asked: [], added: 0, off: true });
      expect((await bodyRecord('govuk:home-office')).checks).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.POLICY_SEARCH; else process.env.POLICY_SEARCH = before;
    }
  });

  it('never stores a skip the paper guard caused: the next run, or another owner, asks again', async () => {
    const now = new Date('2026-09-25T12:00:00Z');
    await saveAnswers('govuk:department-for-science-innovation-and-technology', [
      { source: 'committees', records: [], error: null, skipped: 'Its official name reads like a phrase from the paper being assessed, so it was not sent.', guarded: true },
      { source: 'govuk', records: [], error: null, skipped: 'It has no GOV.UK organisation page to search by.' },
    ], now);
    const { checks } = await bodyRecord('govuk:department-for-science-innovation-and-technology');
    expect(checks.map((c) => c.source)).toEqual(['govuk']);
  });

  it('gives a run a few records per body, and fetches only when the run may', async () => {
    const actors = [actor('s2_000_of', 'Ofsted', 'agency'), actor('s2_001_x', 'Children', 'user_group'), actor('s2_002_y', 'The Council', 'local_authority')];
    const { bundles } = await evidenceForActors(actors, { fetch: false });
    expect(bundles.map((b) => [b.actorId, b.bodyId, b.bodyName])).toEqual([['s2_000_of', 'govuk:ofsted', 'Ofsted']]);
    expect(bundles[0].records).toHaveLength(3);
    // Three different things to know, not three annual reports.
    expect(new Set(bundles[0].records.map((r) => r.question)).size).toBe(3);

    // A body never checked, and a run that may not fetch: given nothing, asks nothing.
    const dfe = [actor('s2_000_dfe', 'Department for Education')];
    expect((await evidenceForActors(dfe, { fetch: false })).bundles).toEqual([]);
    expect((await bodyRecord('govuk:department-for-education')).checks).toEqual([]);
    // One that may: checked, and given what came back.
    const fetched = await evidenceForActors(dfe, { fetch: true });
    expect(fetched.bundles[0]?.records.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!local)('stage 11 compares papers that share bodies, not the latest six', () => {
  afterAll(async () => {
    for (const id of created) await remove(owner, id).catch(() => false);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, owner));
  });

  it('ranks by register bodies in common, then by date, and names what is shared', async () => {
    // The OLDEST paper is the only one that shares a body with this one.
    const sharing = await paperNaming('Ofsted inspection paper', [{ id: 's2_000_of', label: 'Ofsted' }], [], new Date('2026-01-01T00:00:00Z'));
    const recent: string[] = [];
    for (let i = 0; i < 7; i++) recent.push(await paperNaming(`Unrelated paper ${i}`, [{ id: 's2_000_hmrc', label: 'HM Revenue & Customs' }], [], new Date(`2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z`)));
    const mine = await paper('This paper', 'This paper', new Date('2026-09-24T00:00:00Z'));
    await db.transaction((tx) => persistArtefacts(tx, mine, 2, [actor('s2_000_of', 'Office for Standards in Education, Children’s Services and Skills', 'agency'), actor('s2_001_of', 'Ofsted', 'agency')]));

    const neighbours = await neighbourSummaries(owner, mine);
    expect(neighbours).toHaveLength(6);
    expect(neighbours[0].id).toBe(sharing);
    expect(neighbours[0].sharedBodies).toEqual([{ id: 'govuk:ofsted', name: 'Ofsted' }]);
    expect(neighbours[0].artefacts.find((a) => a.kind === 'actor')?.bodyId).toBe('govuk:ofsted');
    // Date fills the rest, newest first.
    expect(neighbours.slice(1).map((n) => n.id)).toEqual(recent.slice(-5).reverse());
  });

  it('gives two runs of one other document one slot, not two — the newer', async () => {
    const older = await paperNaming('Repeat inspection paper', [{ id: 's2_000_of', label: 'Ofsted' }], [], new Date('2026-02-01T00:00:00Z'));
    const newer = await paperNaming('Repeat inspection paper', [{ id: 's2_000_of', label: 'Ofsted' }], [], new Date('2026-03-01T00:00:00Z'));
    const mine = await paper('Yet another paper', 'Yet another paper', new Date('2026-09-24T00:00:00Z'));
    await db.transaction((tx) => persistArtefacts(tx, mine, 2, [actor('s2_000_of', 'Ofsted', 'agency')]));
    const ids = (await neighbourSummaries(owner, mine)).map((n) => n.id);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(older);
  });
});

describe.skipIf(!local)('the cross-paper views', () => {
  afterAll(async () => {
    for (const id of created) await remove(owner, id).catch(() => false);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, owner));
  });

  it('draws bodies against papers, finds the one clash, and gives a body its timeline and record', async () => {
    const dfe = { id: 's2_000_dfe', label: 'Department for Education' };
    const ofsted = { id: 's2_001_of', label: 'Ofsted' };
    const mech = artefact('s1_000_m', 'mechanism', 'Inspection funding', 'x', { intervention: 'x', implementation: 'y', notes: 'z' }, { refs: [] });
    const a = await paperNaming('Schools paper', [dfe, ofsted], [
      edge('s3_000_edge', dfe.id, 'commissions', ofsted.id, 'The Department commissions Ofsted.'),
    ], new Date('2026-09-01T00:00:00Z'));
    await db.transaction((tx) => persistArtefacts(tx, a, 1, [mech]));
    const b = await paperNaming('Inspection paper', [dfe, ofsted], [
      edge('s3_000_edge', dfe.id, 'reports_to', ofsted.id, 'The Department reports to Ofsted.'),
    ], new Date('2026-09-20T00:00:00Z'));

    const grid = await bodiesGrid(owner);
    expect(grid.papers.map((p) => p.id)).toEqual([a, b]);
    const row = grid.rows.find((r) => r.bodyId === 'govuk:department-for-education')!;
    expect(row.papers).toBe(2);
    expect(row.cells[a]).toMatchObject({ duties: 1 });
    expect(grid.clashes).toHaveLength(1);
    expect(grid.clashes[0]).toMatchObject({ bodyName: 'Department for Education', otherName: 'Ofsted' });
    expect(grid.personaOf['govuk:department-for-education']).toBeDefined();

    const intel = await bodyIntel(owner, grid.personaOf['govuk:ofsted']);
    expect(intel!.body?.name).toBe('Ofsted');
    expect(intel!.body?.parents.map((p) => p.name)).toContain('Department for Education');
    // The parent is in this library, so the page can link to it.
    expect(intel!.parentPersonas['govuk:department-for-education']).toBe(grid.personaOf['govuk:department-for-education']);
    expect(intel!.papers.map((p) => p.paper.id)).toEqual([a, b]);
    expect(intel!.papers[0].asks.map((x) => x.words)).toEqual(['Department for Education commissions it']);
    expect(intel!.clashes).toHaveLength(1);

    expect((await libraryBodies()).map((body) => body.id)).toEqual(expect.arrayContaining(['govuk:department-for-education', 'govuk:ofsted']));
    // Another owner sees none of it.
    expect((await bodiesGrid('somebody-else@example.test')).rows).toEqual([]);
    expect(await bodyIntel('somebody-else@example.test', grid.personaOf['govuk:ofsted'])).toBeNull();
  });
});
