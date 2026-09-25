// Phase 19, workstream P, against real Postgres: what lands in the tables when
// the library meets the same body under two names, a group of people, a
// paper-specific figure, a deleted paper and a reader's ruling.
//
// Each case reproduces something measured on the live library on 25 September
// 2026. `applyPersonaLinks` is called directly with synthetic stage-13 output,
// inside a transaction exactly as the worker calls it, so no pipeline has to
// run and no model is involved.
//
// Opt-in and isolated, like every integration file here: the guard refuses to
// run unless the data directory is one `tests/setup-integration.ts` created.
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAffectedGroups, policyAnalyses, policyPersonaDecisions, policyPersonaObservations, policyPersonas } from '$lib/db/schema';
import { artefact, type Artefact } from './contracts';
import { createAnalysis, persistArtefacts, remove } from './server/store';
import {
  applyPersonaLinks, duplicateSuggestions, linkBody, markDifferent, mergePersonas, personaDetail, priorsFor, splitSighting, upgradePersonaLibrary,
} from './server/personas';

const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
const owner = 'identity-fixture@example.test';
const created: string[] = [];

async function paper(title: string, text = title) {
  const analysis = await createAnalysis(owner, { title, jurisdiction: 'England', policyArea: 'Education', context: null, depth: 'standard' as const, model: null, thinkingLevel: null, concurrency: null, extraction: null, sharedContextFirst: false, sealed: false, sealedResearch: false, filename: 'policy.txt', mimeType: 'text/plain', bytes: Buffer.from(`${text}\n\nA synthetic policy for the identity tests.`) });
  created.push(analysis.id);
  // Nothing here runs a stage, and intake allows three active analyses per
  // owner: mark it finished, which is what a paper in the library is.
  await db.update(policyAnalyses).set({ status: 'completed', completedAt: new Date() }).where(eq(policyAnalyses.id, analysis.id));
  return analysis.id;
}

const actor = (id: string, label: string, entityType: string, aliases: string[] = []) =>
  artefact(id, 'actor', label, `${label}.`, { entityType, aliases, mentions: [], ambiguity: 'none', dates: [], parent: null }, {});

const link = (id: string, actorId: string, name: string, entityType: string, observed: { key: string; value: string; origin?: string }[] = [], over: Record<string, unknown> = {}) =>
  artefact(id, 'persona_link', name, 'x', {
    personaId: null, personaName: name, entityType, actorId, aliases: [], summary: `${name}, as this paper saw it.`,
    traits: [], observed: observed.map((t) => ({ key: t.key, label: t.key, value: t.value, origin: t.origin ?? 'extracted_fact', confidence: 0.8 })),
    continuity: 'First sighting.', divergence: 'None.', ...over,
  }, { refs: [actorId] });

// The actors are stored as the pipeline would have stored them, because the
// split reads a paper's own name for a body back from its artefacts.
const write = (analysisId: string, title: string, links: Artefact[], all: Artefact[]) =>
  db.transaction(async (tx) => {
    await persistArtefacts(tx, analysisId, 2, all);
    return applyPersonaLinks(tx, owner, analysisId, title, links, [...all, ...links]);
  });

const mine = () => db.select().from(policyPersonas).where(eq(policyPersonas.owner, owner));

describe.skipIf(!local)('actor identity across papers', () => {
  afterAll(async () => {
    for (const id of created) await remove(owner, id).catch(() => false);
    await db.delete(policyPersonas).where(eq(policyPersonas.owner, owner));
  });

  it('links "DfE" in one paper to "Department for Education" in the next through the register', async () => {
    const one = await paper('Early years paper');
    const two = await paper('Schools paper');
    await write(one, 'Early years paper', [link('s13_0_dfe', 's2_0', 'DfE', 'agency', [{ key: 'mandate', value: 'Sets national education policy.' }])], [actor('s2_0', 'DfE', 'agency')]);
    await write(two, 'Schools paper', [link('s13_0_dfe', 's2_4', 'Department for Education', 'department', [{ key: 'judgedOn', value: 'Judged on attainment.' }])], [actor('s2_4', 'Department for Education', 'department')]);

    const rows = (await mine()).filter((p) => p.bodyId === 'govuk:department-for-education');
    expect(rows).toHaveLength(1);
    // Filed under its OFFICIAL name; the papers' words are aliases.
    expect(rows[0].name).toBe('Department for Education');
    expect(rows[0].aliases).toContain('DfE');
    expect(rows[0].sightings).toBe(2);
    expect(rows[0].dossier.map((t) => t.key).sort()).toEqual(['judgedOn', 'mandate']);
  });

  it('keeps one observation per actor, and says so once', async () => {
    const id = await paper('Duplicate links paper');
    const result = await write(id, 'Duplicate links paper', [
      link('s13_0_a', 's2_1', 'Ofsted', 'agency', [{ key: 'mandate', value: 'Inspects.' }]),
      link('s13_0_b', 's2_1', 'Ofsted', 'agency', [{ key: 'mandate', value: 'Inspects.' }, { key: 'legalPowers', value: 'May enter premises.' }]),
    ], [actor('s2_1', 'Ofsted', 'agency')]);
    expect(result.warnings).toHaveLength(1);
    const rows = await db.select().from(policyPersonaObservations).where(eq(policyPersonaObservations.analysisId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].traits).toHaveLength(2);
  });

  it('records a group of people as an affected group, never a persona', async () => {
    const id = await paper('Groups paper');
    const before = (await mine()).length;
    const result = await write(id, 'Groups paper', [link('s13_0_c', 's2_2', 'Children', 'user_group', [{ key: 'mandate', value: 'None.' }])], [actor('s2_2', 'Children', 'user_group', ['children'])]);
    expect(result.groups).toBe(1);
    expect((await mine()).length).toBe(before);
    const groups = await db.select().from(policyAffectedGroups).where(eq(policyAffectedGroups.analysisId, id));
    expect(groups.map((g) => g.name)).toEqual(['Children']);
  });

  it('keeps money, dates and the paper’s own programme out of the standing dossier, and in the observation', async () => {
    const id = await paper('Families paper');
    await write(id, 'Families paper', [link('s13_0_t', 's2_5', 'HM Treasury', 'department', [
      { key: 'resources', value: 'Controls departmental budgets. Committed £523 million annually for the Families First Partnership.' },
      { key: 'timeHorizon', value: 'Plans to the next Spending Review. Reforms land by 2028.' },
    ])], [actor('s2_5', 'HM Treasury', 'department'), actor('s2_6', 'Families First Partnership', 'programme')]);
    const [treasury] = (await mine()).filter((p) => p.bodyId === 'govuk:hm-treasury');
    // Dossier order is the vocabulary's: how far ahead it looks, then what it can bring to bear.
    expect(treasury.dossier.map((t) => t.value)).toEqual(['Plans to the next Spending Review.', 'Controls departmental budgets.']);
    const [observation] = await db.select().from(policyPersonaObservations).where(eq(policyPersonaObservations.personaId, treasury.id));
    expect(observation.traits[0].value).toContain('£523 million');
  });

  it('keeps the paper’s own programme out of the summary too, with the names only this paper knows', async () => {
    const id = await paper('Hubs paper');
    await write(id, 'Hubs paper', [link('s13_0_h', 's2_9', 'Department of Health and Social Care', 'department', [{ key: 'mandate', value: 'Sets health policy.' }], {
      summary: 'Sets health and care policy. Runs Best Start Family Hubs directly.',
    })], [actor('s2_9', 'Department of Health and Social Care', 'department'), actor('s2_10', 'Best Start Family Hubs', 'programme')]);
    const [dhsc] = (await mine()).filter((p) => p.bodyId === 'govuk:department-of-health-and-social-care');
    expect(dhsc.summary).toBe('Sets health and care policy.');
    const [observation] = await db.select().from(policyPersonaObservations).where(eq(policyPersonaObservations.personaId, dhsc.id));
    expect(observation.summary).toBe('Sets health and care policy.');
  });

  it('rebuilds the dossier and summary from what is left when a paper is deleted, and deletes a persona left with none', async () => {
    const keep = await paper('Kept paper');
    const drop = await paper('Dropped paper');
    await write(keep, 'Kept paper', [link('s13_0_n', 's2_7', 'Department for Work and Pensions', 'department', [{ key: 'mandate', value: 'Audits spending.' }], { summary: 'The kept paper’s summary.' })], [actor('s2_7', 'Department for Work and Pensions', 'department')]);
    await write(drop, 'Dropped paper', [link('s13_0_n', 's2_7', 'DWP', 'agency', [{ key: 'judgedOn', value: 'Words from the dropped paper.' }], { summary: 'The dropped paper’s summary.' })], [actor('s2_7', 'DWP', 'agency')]);
    const [nao] = (await mine()).filter((p) => p.bodyId === 'govuk:department-for-work-pensions');
    expect(nao.sightings).toBe(2);
    expect(nao.summary).toBe('The dropped paper’s summary.');

    expect(await remove(owner, drop)).toBe(true);
    const [after] = await db.select().from(policyPersonas).where(eq(policyPersonas.id, nao.id));
    expect(after.sightings).toBe(1);
    expect(after.summary).toBe('The kept paper’s summary.');
    expect(JSON.stringify(after.dossier)).not.toContain('dropped paper');

    expect(await remove(owner, keep)).toBe(true);
    expect(await db.select().from(policyPersonas).where(eq(policyPersonas.id, nao.id))).toHaveLength(0);
  });

  it('takes a deleted paper’s names off the persona too: its aliases, and a name only it used', async () => {
    const first = await paper('Alpha paper');
    const second = await paper('Beta paper');
    await write(first, 'Alpha paper', [link('s13_0_w', 's2_20', 'Alpha Watch', 'agency', [{ key: 'mandate', value: 'Inspects.' }])], [actor('s2_20', 'Alpha Watch', 'agency', ['The Alpha Watchers'])]);
    const [alpha] = (await mine()).filter((p) => p.name === 'Alpha Watch');
    // The second paper's link echoes the persona, under its own words for it.
    await write(second, 'Beta paper', [link('s13_0_w', 's2_21', 'Beta Board', 'agency', [{ key: 'judgedOn', value: 'Judged on reports.' }], { personaId: alpha.id })], [actor('s2_21', 'Beta Board', 'agency', ['BB'])]);
    const [both] = await db.select().from(policyPersonas).where(eq(policyPersonas.id, alpha.id));
    expect(both.aliases).toEqual(expect.arrayContaining(['The Alpha Watchers', 'Beta Board', 'BB']));

    expect(await remove(owner, first)).toBe(true);
    const [after] = await db.select().from(policyPersonas).where(eq(policyPersonas.id, alpha.id));
    expect(after.name).toBe('Beta Board');
    expect(after.aliases).toEqual(['BB']);
  });

  it('counts two runs of one document as one paper and shows the re-run no prior', async () => {
    const first = await paper('Redraft, first run', 'the same bytes');
    const second = await paper('Redraft, second run', 'the same bytes');
    const cabinet = [actor('s2_8', 'Cabinet Office', 'department')];
    await write(first, 'Redraft, first run', [link('s13_0_co', 's2_8', 'Cabinet Office', 'department', [{ key: 'mandate', value: 'Runs the centre.' }])], cabinet);
    expect(await priorsFor(owner, cabinet, second)).toEqual([]);
    await write(second, 'Redraft, second run', [link('s13_0_co', 's2_8', 'Cabinet Office', 'department', [{ key: 'mandate', value: 'Runs the centre.' }])], cabinet);
    const [office] = (await mine()).filter((p) => p.bodyId === 'govuk:cabinet-office');
    expect(office.sightings).toBe(1);
  });

  it('merges two personas, moves the observations and remembers the name', async () => {
    const a = await paper('Merge paper A');
    const b = await paper('Merge paper B');
    await write(a, 'Merge paper A', [link('s13_0_m', 's2_9', 'The Regulator', 'concept', [{ key: 'mandate', value: 'Regulates.' }])], [actor('s2_9', 'The Regulator', 'concept')]);
    await write(b, 'Merge paper B', [link('s13_0_m', 's2_9', 'Sector watchdog', 'concept', [{ key: 'judgedOn', value: 'Judged on complaints.' }])], [actor('s2_9', 'Sector watchdog', 'concept')]);
    const [keep] = (await mine()).filter((p) => p.name === 'The Regulator');
    const [other] = (await mine()).filter((p) => p.name === 'Sector watchdog');

    await mergePersonas(owner, keep.id, other.id);
    const detail = await personaDetail(owner, keep.id);
    expect(detail?.persona.sightings).toBe(2);
    expect(detail?.persona.aliases).toContain('Sector watchdog');
    expect(await personaDetail(owner, other.id)).toBeNull();

    // The ruling carries: a third paper's "Sector watchdog" finds the merged persona.
    const c = await paper('Merge paper C');
    await write(c, 'Merge paper C', [link('s13_0_m', 's2_9', 'Sector watchdog', 'agency', [])], [actor('s2_9', 'Sector watchdog', 'agency')]);
    expect((await mine()).filter((p) => p.name === 'Sector watchdog')).toHaveLength(0);
  });

  it('refuses to merge two different register bodies', async () => {
    const [dfe] = (await mine()).filter((p) => p.bodyId === 'govuk:department-for-education');
    const [treasury] = (await mine()).filter((p) => p.bodyId === 'govuk:hm-treasury');
    await expect(mergePersonas(owner, dfe.id, treasury.id)).rejects.toThrow(/two different public bodies/);
  });

  it('stops offering a pair the reader said are different', async () => {
    const x = await paper('Pair paper X');
    await write(x, 'Pair paper X', [
      link('s13_0_p', 's2_10', 'Skills England', 'concept', [{ key: 'mandate', value: 'Skills.' }]),
      link('s13_0_q', 's2_11', 'Skills England Board', 'committee', [{ key: 'mandate', value: 'Oversees.' }]),
    ], [actor('s2_10', 'Skills England', 'concept'), actor('s2_11', 'Skills England Board', 'committee')]);
    const [p] = (await mine()).filter((r) => r.name === 'Skills England');
    const [q] = (await mine()).filter((r) => r.name === 'Skills England Board');
    await markDifferent(owner, p.id, q.id);
    const pairs = await duplicateSuggestions(owner, p.id);
    expect(pairs.some((s) => s.a.id === q.id || s.b.id === q.id)).toBe(false);
  });

  it('links a persona to a register body on the reader’s word, and unlinks it for good', async () => {
    const [p] = (await mine()).filter((r) => r.name === 'Skills England');
    const linked = await linkBody(owner, p.id, 'govuk:ofsted', 'same');
    expect(linked.sameBodyAs.length).toBeGreaterThanOrEqual(0);
    expect((await personaDetail(owner, p.id))?.body?.name).toBe('Ofsted');
    await linkBody(owner, p.id, 'govuk:ofsted', 'different');
    const detail = await personaDetail(owner, p.id);
    expect(detail?.body).toBeNull();
    expect(detail?.notBody.map((b) => b.id)).toEqual(['govuk:ofsted']);
  });

  it('splits one paper’s sighting into a persona of its own', async () => {
    const [regulator] = (await mine()).filter((r) => r.name === 'The Regulator');
    const detail = await personaDetail(owner, regulator.id);
    const target = detail!.observations.find((o) => o.analysisTitle === 'Merge paper B')!;
    const { id } = await splitSighting(owner, regulator.id, target.id);
    const moved = await personaDetail(owner, id);
    expect(moved?.persona.name).toBe('Sector watchdog');
    expect(moved?.observations.map((o) => o.id)).toEqual([target.id]);
    const rulings = await db.select().from(policyPersonaDecisions).where(and(eq(policyPersonaDecisions.personaId, regulator.id), eq(policyPersonaDecisions.verdict, 'different')));
    expect(rulings.map((r) => r.subject)).toContain(`persona:${id}`);
  });

  it('types a persona by its actor before its link, as the group filter does — so no boot upgrade can take it for a group', async () => {
    const id = await paper('Mistyped paper');
    // The model called a body a user group; the paper's own actor says department.
    await write(id, 'Mistyped paper', [link('s13_0_m', 's2_30', 'Ministry of Defence', 'user_group', [{ key: 'mandate', value: 'Runs defence.' }])], [actor('s2_30', 'Ministry of Defence', 'department')]);
    const [mod] = (await mine()).filter((p) => p.bodyId === 'govuk:ministry-of-defence');
    expect(mod.entityType).toBe('department');
    await db.transaction((tx) => upgradePersonaLibrary(tx));
    expect(await db.select().from(policyPersonas).where(eq(policyPersonas.id, mod.id))).toHaveLength(1);
  });

  it('leaves a library it has already upgraded alone: a group-typed row written since is not the upgrade\'s to move', async () => {
    const [since] = await db.insert(policyPersonas).values({ owner, name: 'Carers', entityType: 'user_group', dossier: [], dossierVersion: 1 }).returning();
    expect(await db.transaction((tx) => upgradePersonaLibrary(tx))).toMatchObject({ groups: 0, rebuilt: 0 });
    expect(await db.select().from(policyPersonas).where(eq(policyPersonas.id, since.id))).toHaveLength(1);
    await db.delete(policyPersonas).where(eq(policyPersonas.id, since.id));
  });

  it('upgrades a pre-phase-19 library: groups out, dossiers recomputed, bodies matched', async () => {
    const id = await paper('Legacy paper');
    const [group] = await db.insert(policyPersonas).values({ owner, name: 'Parents', entityType: 'user_group', dossier: [], dossierVersion: 0 }).returning();
    const [legacy] = await db.insert(policyPersonas).values({
      owner, name: 'Home Office', entityType: 'department', summary: 'Legacy summary.', dossierVersion: 0,
      dossier: [{ key: 'resources', label: 'x', value: 'Spends £2bn a year.', origin: 'extracted_fact', confidence: 0.9 }],
    }).returning();
    await db.insert(policyPersonaObservations).values([
      { personaId: group.id, analysisId: id, actorId: 's2_12', traits: [] },
      { personaId: legacy.id, analysisId: id, actorId: 's2_13', traits: [{ key: 'resources', label: 'x', value: 'Spends £2bn a year. Has a large policing budget.', origin: 'extracted_fact', confidence: 0.9 }] },
    ]);
    const result = await db.transaction((tx) => upgradePersonaLibrary(tx));
    expect(result.groups).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(policyPersonas).where(eq(policyPersonas.id, group.id))).toHaveLength(0);
    expect((await db.select().from(policyAffectedGroups).where(eq(policyAffectedGroups.analysisId, id))).map((g) => g.name)).toEqual(['Parents']);
    const [after] = await db.select().from(policyPersonas).where(eq(policyPersonas.id, legacy.id));
    expect(after.bodyId).toBe('govuk:home-office');
    expect(after.dossierVersion).toBe(1);
    expect(after.dossier.map((t) => t.value)).toEqual(['Has a large policing budget.']);
    // Nothing was deleted from under it, so the legacy summary stands.
    expect(after.summary).toBe('Legacy summary.');
    // And it is idempotent.
    expect(await db.transaction((tx) => upgradePersonaLibrary(tx))).toMatchObject({ groups: 0, rebuilt: 0 });
  });
});
