import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADDENDUM_STAGES, artefact, isPassStage, MATERIAL_ROLES, PASS_BASE, passOf, passOrdinal, passStep,
  stageKinds, stageName, type Artefact,
} from './contracts';
import { systemPrompt } from './prompts';
import { triageArtefacts } from './validation';
import { addenda, addendumBanner, findingsBySection, recommendations } from './view';
import { assessmentMarkdown } from './report-doc';
import { ingest, readMaterial } from './server/ingest';
import { executeStage } from './pipeline';
import { stageBudgetMs } from './server/worker';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const MATERIAL = 'A later consultation response. The Council does not accept that it is accountable for delivery, and says the implementation costs fall on providers instead.\n\nIt asks for the funding position to be restated before the measure is laid.';
const neverResearch = async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] });
const model = async (...args: Parameters<typeof fixtureModel>) => fixtureModel(...args);

/** The main run, up to and including the initial report, exactly as the pipeline test drives it. */
async function assessed(): Promise<Artefact[]> {
  const all = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  for (let stage = 1; stage <= 12; stage++) {
    const result = await executeStage(
      { stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model, research: neverResearch, signal: new AbortController().signal },
    );
    all.push(...result.artefacts);
  }
  return all;
}

/** One addendum pass over `all`, mutating it exactly as the worker does. */
async function attach(all: Artefact[], pass = 1) {
  const extracted = await ingest(Buffer.from(MATERIAL), 'response.txt', 'text/plain', `m${pass}_`);
  all.push(...extracted.artefacts);
  const warnings: string[] = [];
  for (let step = 1; step <= 3; step++) {
    const result = await executeStage(
      { stage: passOrdinal(pass, step), title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model, research: neverResearch, signal: new AbortController().signal, passKind: 'addendum', material: { pass, role: 'critique', label: 'A critique', guidance: 'Test it as sceptically as the policy.', filename: 'response.txt', note: null } },
    );
    all.push(...result.artefacts);
    warnings.push(...result.warnings);
  }
  return warnings;
}

describe('the pass ordinal space', () => {
  it('separates a pass from the main run, and each pass from the next', () => {
    expect(isPassStage(17)).toBe(false);
    expect(isPassStage(PASS_BASE)).toBe(true);
    expect(passOf(17)).toBe(0);
    expect(passOf(passOrdinal(1, 3))).toBe(1);
    expect(passOf(passOrdinal(2, 0))).toBe(2);
    expect(passStep(passOrdinal(3, 2))).toBe(2);
    // THE POINT OF THE WHOLE DESIGN: the id namespace a pass mints into cannot
    // collide with the main run's or with another pass's, because it is derived
    // from an ordinal that cannot.
    const namespaces = [0, 12, 17, passOrdinal(1, 0), passOrdinal(1, 3), passOrdinal(2, 0)].map((o) => `s${o}_`);
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });

  it('names and contracts a pass stage by its kind, not by its ordinal alone', () => {
    // Pass 2 may be either kind. Reading the ordinal alone cannot say which, so
    // both lookups take the kind and answer differently for the same number.
    expect(stageName(passOrdinal(2, 0), 'addendum')).toBe(ADDENDUM_STAGES[0]);
    expect(stageName(passOrdinal(2, 0), 'restatement')).toBe('Restated assessment');
    expect(stageKinds(passOrdinal(2, 3), 'addendum')).toContain('revision');
    expect(stageKinds(passOrdinal(2, 0), 'restatement')).toContain('review_summary');
    // And the main run is untouched by any of it.
    expect(stageName(12)).toBe('Synthesis');
    expect(stageKinds(12)).toEqual(['finding', 'recommendation', 'assumption']);
  });

  it('gives the same ordinal two different prompts, so a cache key cannot cross the kinds', () => {
    const addendum = systemPrompt(passOrdinal(1, 0) + 3, 'addendum');
    const restatement = systemPrompt(passOrdinal(1, 0), 'restatement');
    expect(addendum).toContain('THE ADDENDUM VERDICT');
    expect(restatement).toContain('RESTATED');
    expect(addendum).not.toBe(restatement);
    // The main run's prompts are byte-identical to what they were: a pass must
    // not invalidate a cached call in an assessment already in flight.
    expect(systemPrompt(12)).toBe(systemPrompt(12, null));
  });

  it('sizes a pass by its own material and not by the policy it is attached to', async () => {
    const policy = Array.from({ length: 200 }, (_, i) => artefact(`passage_${i}`, 'passage', 'p', 'text', { documentHash: 'x' }));
    const material = Array.from({ length: 2 }, (_, i) => artefact(`m1_passage_${i}`, 'passage', 'p', 'text', { documentHash: 'y' }));
    const all = [...policy, ...material];
    // Stage 1 of the main run fans out over 200 passages and takes the ceiling.
    expect(stageBudgetMs(1, all)).toBe(6 * 60 * 60_000);
    // The addendum's decomposition fans out over TWO, and must not inherit it.
    expect(stageBudgetMs(passOrdinal(1, 1), all)).toBe(20 * 60_000 + 2 * 3 * 60_000);
    expect(stageBudgetMs(passOrdinal(1, 2), all)).toBe(20 * 60_000 + 3 * 60_000);
  });
});

describe('ingesting material into an assessment that already has a document', () => {
  it('namespaces its passages so they cannot collide with the policy’s', async () => {
    const policy = await ingest(fixture, 'policy.txt', 'text/plain');
    const material = await ingest(Buffer.from(MATERIAL), 'response.txt', 'text/plain', 'm1_');
    expect(policy.artefacts[0].id).toBe('passage_0001');
    expect(material.artefacts[0].id).toBe('m1_passage_0001');
    const ids = new Set([...policy.artefacts, ...material.artefacts].map((a) => a.id));
    expect(ids.size).toBe(policy.artefacts.length + material.artefacts.length);
  });

  it('takes a role and refuses a submission that does not say what the material is', async () => {
    const form = () => { const f = new FormData(); f.set('text', MATERIAL); return f; };
    const read = (f: FormData) => readMaterial(new Request('http://localhost', { method: 'POST', body: f }));

    const good = form(); good.set('role', 'consultation_response'); good.set('note', 'The Council pushed back.');
    await expect(read(good)).resolves.toMatchObject({ role: 'consultation_response', note: 'The Council pushed back.' });

    // Unlike model and thinking level at submission, this does NOT degrade to a
    // default: a rebuttal silently read as a later draft would report the policy
    // as superseding itself.
    await expect(read(form())).rejects.toThrow('what kind of material');
    const wrong = form(); wrong.set('role', 'a_later_thought');
    await expect(read(wrong)).rejects.toThrow('what kind of material');

    const empty = new FormData(); empty.set('role', 'critique');
    await expect(read(empty)).rejects.toThrow('Attach a document');
  });

  it('offers every role a note the prompt can use', () => {
    for (const [key, label, note] of MATERIAL_ROLES) {
      expect(key).toMatch(/^[a-z_]+$/);
      expect(label.length).toBeGreaterThan(3);
      expect(note.length).toBeGreaterThan(40);
    }
  });
});

describe('an addendum pass, end to end', () => {
  it('reads the material, reconciles it, and judges the report without touching it', async () => {
    const all = await assessed();
    const before = structuredClone(all.filter((a) => a.kind === 'finding'));
    const warnings = await attach(all);

    // Everything the pass produced is in the pass namespace; nothing earlier moved.
    const after = all.filter((a) => a.kind === 'finding');
    expect(after.filter((f) => !f.id.startsWith('s100_'))).toEqual(before);

    const revisions = all.filter((a) => a.kind === 'revision');
    expect(revisions).toHaveLength(1);
    expect(revisions[0].data.status).toBe('weakened');
    expect(revisions[0].id.startsWith('s103_')).toBe(true);
    // The judgement names the finding it is about AND the reconciliation it
    // rests on, both folded into refs by triage.
    expect(revisions[0].refs).toContain(String(revisions[0].data.targetId));
    expect(revisions[0].refs).toContain(String((revisions[0].data.reconciliationIds as string[])[0]));

    expect(all.filter((a) => a.kind === 'reconciliation')).toHaveLength(1);
    expect(all.filter((a) => a.kind === 'evidence' && a.id.startsWith('s102_'))).toHaveLength(1);
    expect(warnings.some((w) => w.includes('moved 1'))).toBe(true);
  });

  it('recomputes the summary counts rather than trusting the ones the model wrote', async () => {
    const all = await assessed();
    await attach(all);
    const summary = all.find((a) => a.kind === 'addendum_summary')!;
    // The fixture returns 99 for both, deliberately. A tally the reader reads
    // must be arithmetic over the rows, not a second opinion about them.
    expect(summary.data.weakened).toBe(1);
    expect(summary.data.upheld).toBe(0);
    expect(summary.data.overturned).toBe(0);
    expect(summary.data.pass).toBe(1);
  });

  it('shapes the annex and raises the banner only when something moved', async () => {
    const all = await assessed();
    await attach(all);
    const passes = [{ pass: 1, kind: 'addendum', role: 'critique', note: null, filename: 'response.txt', size: MATERIAL.length, status: 'completed', error: null, createdAt: new Date(), completedAt: new Date() }];
    const [view] = addenda(all, passes);
    expect(view.pass).toBe(1);
    expect(view.moved).toBe(1);
    expect(view.revisions[0].target?.kind).toBe('finding');
    expect(view.passages).toBeGreaterThan(0);
    expect(addendumBanner([view])).toMatchObject({ addenda: 1, moved: 1, overturned: 0 });

    // A pass still running raises nothing: a banner over a report is a claim
    // about that report, and an unfinished pass has not made one yet.
    expect(addendumBanner([{ ...view, status: 'running' }])).toBeNull();
    // Nor does one that moved nothing — a notification is not a finding.
    expect(addendumBanner([{ ...view, moved: 0, revisions: [] }])).toBeNull();
  });

  it('accepts material that bears on nothing as a result, not a failed stage', async () => {
    const all = await assessed();
    const extracted = await ingest(Buffer.from(MATERIAL), 'response.txt', 'text/plain', 'm1_');
    all.push(...extracted.artefacts);
    const silent = async () => ({ artefacts: [], warnings: [] });
    const result = await executeStage(
      { stage: passOrdinal(1, 2), title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: silent, research: neverResearch, signal: new AbortController().signal, passKind: 'addendum' },
    );
    expect(result.artefacts).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('bears on what the assessment already holds');
  });
});

describe('what a pass may and may not assert', () => {
  it('refuses a verdict on something that is not a conclusion, or that rests on nothing', async () => {
    const all = await assessed();
    const finding = all.find((a) => a.kind === 'finding')!;
    const passage = all.find((a) => a.kind === 'passage')!;
    const reconciliation = artefact('s102_000_r', 'reconciliation', 'r', 'A conflict.', { targetId: finding.id, targetKind: 'finding', relation: 'contradicts', basis: 'The material says otherwise.', significance: 0.6, notes: 'x' }, { refs: [finding.id] });

    const judge = (data: Record<string, unknown>, refs: string[]) =>
      triageArtefacts({ artefacts: [artefact('s103_000_v', 'revision', 'v', 'A judgement.', data, { refs })], warnings: [] }, passOrdinal(1, 3), [...all, reconciliation], 'addendum');

    // A passage is not something a reader ACTED on. Judging one "overturned"
    // would read as the assessment retracting a quotation.
    const onPassage = judge({ targetId: passage.id, targetKind: 'passage', status: 'overturned', reason: 'x', reconciliationIds: [reconciliation.id], residualRisk: 'x', actionNeeded: 'x' }, [passage.id, reconciliation.id]);
    expect(onPassage.artefacts).toHaveLength(0);
    expect(onPassage.rejected[0].reason).toContain('finding, a recommendation or an exploitation play');

    // An opinion about the report is not a reading of the material.
    const groundless = judge({ targetId: finding.id, targetKind: 'finding', status: 'overturned', reason: 'x', reconciliationIds: [], residualRisk: 'x', actionNeeded: 'x' }, [finding.id]);
    expect(groundless.artefacts).toHaveLength(0);
    expect(groundless.rejected[0].reason).toContain('must rest on what the new material established');

    // An id that resolves to nothing at all.
    const invented = judge({ targetId: 'sX_nothing', targetKind: 'finding', status: 'weakened', reason: 'x', reconciliationIds: [reconciliation.id], residualRisk: 'x', actionNeeded: 'x' }, [reconciliation.id]);
    expect(invented.artefacts).toHaveLength(0);

    const good = judge({ targetId: finding.id, targetKind: 'finding', status: 'weakened', reason: 'x', reconciliationIds: [reconciliation.id], residualRisk: 'x', actionNeeded: 'x' }, [finding.id, reconciliation.id]);
    expect(good.artefacts).toHaveLength(1);
  });

  it('corrects a stated target kind that disagrees with the artefact it names', async () => {
    const all = await assessed();
    const claim = all.find((a) => a.kind === 'claim')!;
    const { artefacts } = triageArtefacts(
      { artefacts: [artefact('s102_000_r', 'reconciliation', 'r', 'A conflict.', { targetId: claim.id, targetKind: 'mechanism', relation: 'contradicts', basis: 'x', significance: 0.5, notes: 'x' }, { refs: [claim.id] })], warnings: [] },
      passOrdinal(1, 2), all, 'addendum',
    );
    expect(artefacts).toHaveLength(1);
    expect(artefacts[0].data.targetKind).toBe('claim');
  });

  it('keeps the kinds of one pass out of another stage', async () => {
    const all = await assessed();
    const finding = all.find((a) => a.kind === 'finding')!;
    const row = artefact('s12_000_v', 'revision', 'v', 'x', { targetId: finding.id, targetKind: 'finding', status: 'upheld', reason: 'x', reconciliationIds: [], residualRisk: 'x', actionNeeded: 'x' }, { refs: [finding.id] });
    const { rejected } = triageArtefacts({ artefacts: [row], warnings: [] }, 12, all);
    expect(rejected[0].reason).toContain('does not belong to this stage');
  });
});

describe('restating the report over the addenda', () => {
  it('replaces the current report without deleting the one it replaces', async () => {
    const all = await assessed();
    // Carry the main run through its assured synthesis first, so there is a real
    // assured report for the restatement to supersede.
    for (let stage = 13; stage <= 17; stage++) {
      const result = await executeStage(
        { stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
        { model, research: neverResearch, signal: new AbortController().signal },
      );
      all.push(...result.artefacts);
    }
    await attach(all, 1);
    const assuredBefore = all.filter((a) => a.kind === 'finding' && a.data.revision === 'assured');
    expect(assuredBefore.length).toBeGreaterThan(0);
    expect(findingsBySection(all).flatMap((s) => s.items).every((f) => f.id.startsWith('s17_'))).toBe(true);

    const restated = await executeStage(
      { stage: passOrdinal(2, 0), title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model, research: neverResearch, signal: new AbortController().signal, passKind: 'restatement' },
    );
    all.push(...restated.artefacts);

    // BOTH SETS ARE STILL STORED — the superseded report is not deleted, and its
    // ids still resolve for everything that cites them.
    expect(all.filter((a) => a.kind === 'finding' && a.id.startsWith('s17_')).length).toBe(assuredBefore.length);
    // But the report the reader is shown is the new one, and only the new one.
    const shown = findingsBySection(all).flatMap((s) => s.items);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((f) => f.id.startsWith('s200_'))).toBe(true);
    expect(recommendations(all).every((r) => r.id.startsWith('s200_'))).toBe(true);
  });
});

describe('an exported copy cannot drop what an addendum changed', () => {
  it('carries the addendum chapter, and leaves it out when nothing was attached', async () => {
    const all = await assessed();
    const meta = { title: 'Synthetic policy', status: 'completed_with_gaps' as const };

    // Before: no chapter at all. An assessment nobody has added to must not
    // print an empty heading saying so.
    expect(assessmentMarkdown(all, meta)).not.toContain('What came after');

    await attach(all);
    const passes = [{ pass: 1, kind: 'addendum', role: 'critique', note: null, filename: 'response.txt', size: 10, status: 'completed', error: null, createdAt: new Date(), completedAt: new Date() }];
    const doc = assessmentMarkdown(all, { ...meta, passes });

    // A Word file lands on a desk with nobody to ask, so the one thing it must
    // never silently drop is "the finding you are reading no longer stands".
    expect(doc).toContain('What came after this was written');
    expect(doc).toContain('Addendum 01');
    expect(doc).toContain('Weakened —');
    expect(doc).toContain('Nothing above was rewritten by them');
  });
});

