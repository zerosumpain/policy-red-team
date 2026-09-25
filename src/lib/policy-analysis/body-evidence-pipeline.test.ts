// Phase 19, workstream X: the public record about a body, in a run. Stage 4
// is handed a few dated records per fully profiled body as ITS OWN retrieved
// sources, a profile may cite them as evidence, and stage 10 sees a body's
// records in that body's call and nobody else's. Stage 11 decides identity
// across papers by register body where it can.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact, type StageInput } from './contracts';
import { executeStage, type BodyEvidence, type PipelineDeps } from './pipeline';
import { ingest } from './server/ingest';
import { hasSource } from './validation';
import { crossIdentityHints } from './entities';
import { isBodyEvidence, type BodyEvidenceRecord } from './body-evidence';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const neverResearch = async () => ({ artefacts: [], warnings: [] });

const record = (bodyId: string, i: number, over: Partial<BodyEvidenceRecord> = {}): BodyEvidenceRecord => ({
  bodyId, source: 'committees', sourceKind: 'Report', question: i === 0 ? 'track_record' : 'capacity',
  title: `${bodyId} record ${i}`, url: `https://committees.parliament.uk/publications/${100 + i}/`, publisher: 'Education Committee (House of Commons)',
  publishedAt: `202${i}-03-01T00:00:00.000Z`, retrievedAt: '2026-09-25T00:00:00.000Z', expiresAt: '2026-10-25T00:00:00.000Z', excerpt: null, ...over,
});

/** A lookup that gives the FIRST actor it is asked about two records, and nobody else any. */
function oneBodyHasARecord(): { lookup: BodyEvidence; asked: string[][] } {
  const asked: string[][] = [];
  const lookup: BodyEvidence = async (actors) => {
    asked.push(actors.map((a) => a.id));
    const first = [...actors].sort((a, b) => a.id.localeCompare(b.id))[0];
    return { bundles: first ? [{ actorId: first.id, bodyName: 'The Department', records: [record('govuk:x', 0), record('govuk:x', 1)] }] : [], warnings: [] };
  };
  return { lookup, asked };
}

async function runTo(last: number, deps: Partial<PipelineDeps>, onCall?: (stage: number, key: string, raw: unknown) => void) {
  const all: Artefact[] = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  const outputs = new Map<number, Awaited<ReturnType<typeof executeStage>>>();
  for (let stage = 1; stage <= last; stage++) {
    const result = await executeStage(
      { stage, title: 'Policy', jurisdiction: null, policyArea: null, context: null, artefacts: all } as StageInput,
      {
        model: async (s, key, raw) => { onCall?.(s, key, raw); return fixtureModel(s, key, raw); },
        research: neverResearch, signal: new AbortController().signal, neighbours: async () => [], personas: async () => [], ...deps,
      },
    );
    outputs.set(stage, result);
    all.push(...result.artefacts);
  }
  return { all, outputs };
}

describe('stage 4 is handed the public record for the bodies it profiles in full', () => {
  it('mints dated retrieved sources, in that body\'s call only, that survive the stage', async () => {
    const { lookup, asked } = oneBodyHasARecord();
    const calls: { key: string; ids: string[] }[] = [];
    const { outputs } = await runTo(4, { bodyEvidence: lookup }, (stage, key, raw) => {
      if (stage === 4) calls.push({ key, ids: (raw as { artefacts: Artefact[] }).artefacts.map((a) => a.id) });
    });
    const stage4 = outputs.get(4)!;
    const sources = stage4.artefacts.filter(isBodyEvidence);
    expect(sources.map((s) => s.id)).toEqual(['s4_body_0', 's4_body_1']);
    expect(asked).toHaveLength(1);
    const target = String(sources[0].refs[0]);
    expect(sources.every((s) => s.origin === 'external_evidence' && s.refs[0] === target && s.data.questionId === target)).toBe(true);
    // The body's own call sees them, AFTER its own context; no other call does.
    const mine = calls.find((c) => c.key === target)!;
    expect(mine.ids.slice(-2)).toEqual(['s4_body_0', 's4_body_1']);
    for (const other of calls.filter((c) => c.key !== target)) expect(other.ids.some((id) => id.startsWith('s4_body_'))).toBe(false);
  });

  it('lets a profile cite one, and the profile then rests on a source — which a prior never gives it', async () => {
    const { lookup } = oneBodyHasARecord();
    const all: Artefact[] = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
    for (let stage = 1; stage <= 3; stage++) {
      all.push(...(await executeStage({ stage, title: 'P', jurisdiction: null, policyArea: null, context: null, artefacts: all }, { model: async (...a) => fixtureModel(...a), research: neverResearch, signal: new AbortController().signal })).artefacts);
    }
    const result = await executeStage({ stage: 4, title: 'P', jurisdiction: null, policyArea: null, context: null, artefacts: all }, {
      bodyEvidence: lookup, research: neverResearch, signal: new AbortController().signal,
      model: async (stage, key, raw) => {
        const out = fixtureModel(stage, key, raw);
        const cited = (raw as { artefacts: Artefact[] }).artefacts.find((a) => a.id === 's4_body_1');
        if (cited) for (const p of out.artefacts) p.data.resources = { value: 'Its 2021 report records a budget under strain.', origin: 'external_evidence', confidence: 0.5, refs: [cited.id] };
        return out;
      },
    });
    const profile = result.artefacts.find((a) => a.kind === 'profile' && (a.data.resources as { refs: string[] }).refs.includes('s4_body_1'));
    expect(profile).toBeDefined();
    const everything = new Map([...all, ...result.artefacts].map((a) => [a.id, a]));
    expect(hasSource('s4_body_1', everything)).toBe(true);
  });

  it('changes nothing without a lookup, and a lookup that fails costs a sentence, not the stage', async () => {
    const without = (await runTo(4, {})).outputs.get(4)!;
    expect(without.artefacts.some((a) => a.kind === 'research_source')).toBe(false);
    const failing = (await runTo(4, { bodyEvidence: async () => { throw new Error('store down'); } })).outputs.get(4)!;
    expect(failing.artefacts.some((a) => a.kind === 'profile')).toBe(true);
    expect(failing.warnings.join(' ')).toMatch(/public record about these bodies could not be read/);
  });
});

describe('stage 10 sees a body\'s record in that body\'s call', () => {
  it('as the call\'s own material, never in the shared block every call carries', async () => {
    const { lookup } = oneBodyHasARecord();
    const calls: { key: string; ids: string[] }[] = [];
    const { outputs } = await runTo(10, { bodyEvidence: lookup }, (stage, key, raw) => {
      if (stage === 10) calls.push({ key, ids: (raw as { artefacts: Artefact[] }).artefacts.map((a) => a.id) });
    });
    const target = String(outputs.get(4)!.artefacts.find(isBodyEvidence)!.refs[0]);
    const mine = calls.find((c) => c.key === target);
    expect(mine, 'the body with a record was red-teamed').toBeDefined();
    expect(mine!.ids).toEqual(expect.arrayContaining(['s4_body_0', 's4_body_1']));
    for (const other of calls.filter((c) => c.key !== target)) expect(other.ids.some((id) => id.startsWith('s4_body_'))).toBe(false);
  });
});

describe('stage 11 decides identity across papers by register body', () => {
  const actor = (id: string, label: string, entityType: string) => artefact(id, 'actor', label, 'x', { entityType, aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });

  it('the same body id is the same body, whatever each paper called it or typed it as', () => {
    const here = actor('s2_000_dfe', 'DfE', 'agency');
    const hints = crossIdentityHints([here], [{ id: 'other', artefacts: [{ id: 'n1', kind: 'actor', label: 'Department for Education', entityType: 'department', bodyId: 'govuk:department-for-education' }] }], new Map([[here.id, 'govuk:department-for-education']]));
    expect(hints).toEqual([expect.objectContaining({ actorId: here.id, otherArtefactId: 'n1', verdict: 'same_body', basis: 'register' })]);
  });

  it('two different register bodies never link, however alike the names', () => {
    const here = actor('s2_000_c', 'The Council', 'local_authority');
    const hints = crossIdentityHints([here], [{ id: 'other', artefacts: [{ id: 'n1', kind: 'actor', label: 'The Council', entityType: 'local_authority', bodyId: 'govuk:another' }] }], new Map([[here.id, 'govuk:one']]));
    expect(hints).toEqual([]);
  });

  it('falls back to the name rules where either side has no body, as before', () => {
    const here = actor('s2_000_c', 'Barchester Council', 'local_authority');
    const hints = crossIdentityHints([here], [{ id: 'other', artefacts: [{ id: 'n1', kind: 'actor', label: 'Barchester Council', entityType: 'local_authority' }] }]);
    expect(hints[0]).toMatchObject({ basis: 'name' });
  });

  it('asks the register about this paper\'s actors and hands the model the result', async () => {
    let seen: { identity?: unknown[] } = {};
    const actors = [actor('s2_000_dfe', 'DfE', 'agency')];
    const neighbour = { id: '00000000-0000-4000-8000-000000000001', title: 'Other', policyArea: null, jurisdiction: null, completedAt: null, sharedBodies: [{ id: 'govuk:department-for-education', name: 'Department for Education' }], artefacts: [{ id: 'n1', kind: 'actor', label: 'Department for Education', statement: 'x', entityType: 'department', bodyId: 'govuk:department-for-education' }] };
    await executeStage({ stage: 11, title: 'P', jurisdiction: null, policyArea: null, context: null, artefacts: actors }, {
      research: neverResearch, signal: new AbortController().signal, neighbours: async () => [neighbour],
      registerBodies: async (list) => new Map(list.map((a) => [a.id, 'govuk:department-for-education'])),
      model: async (_s, _k, raw) => { seen = raw as typeof seen; return { artefacts: [], warnings: [] }; },
    });
    expect(seen.identity).toEqual([expect.objectContaining({ verdict: 'same_body', basis: 'register' })]);
  });
});
