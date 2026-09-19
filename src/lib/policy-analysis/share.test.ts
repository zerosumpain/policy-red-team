// What a share link may and may not carry out of a private workspace.
import { describe, expect, it } from 'vitest';
import { artefact, KINDS, STAGES, type Artefact } from './contracts';
import { shareablePasses, shareableReport, withheldNote, WITHHELD_KINDS } from './share';

const text = 'The Council is accountable for delivery and bears the whole implementation cost.';
const passage = artefact('passage_0001', 'passage', 'Page 1', text, { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });
const claim = artefact('s1_0_claim', 'claim', 'Accountability', 'The Council is accountable.', { category: 'responsibility', notes: 'x' },
  { refs: ['passage_0001'], origin: 'extracted_fact', sourceId: 'passage_0001', sourceQuote: 'The Council is accountable for delivery', page: 4, section: 'Delivery' });
const actor = artefact('s2_0', 'actor', 'The Council', 'x', { entityType: 'local_authority', aliases: [], mentions: ['passage_0001'], ambiguity: '', dates: [], parent: null }, { refs: ['passage_0001'] });
const cross = artefact('s11_0_x', 'cross_policy', 'Two policies, one body', 'x', {
  pattern: 'common_actor_overload', otherAnalysisId: 'abc', otherAnalysisTitle: 'A DIFFERENT PRIVATE PAPER',
  otherArtefactIds: [], actorId: 's2_0', interaction: 'x', consequence: 'x', severity: 0.5, evidenceLimits: 'x', action: 'x',
}, { refs: ['s2_0'] });
const finding = artefact('s12_0_f', 'finding', 'A conclusion', 'x', { section: 'actors', resultIds: [], hypothesisIds: [] }, { refs: ['s1_0_claim', 's11_0_x'] });

const stages = STAGES.map((name, ordinal) => ({ ordinal, name, warnings: [`warning from ${name}`] }));

describe('a shared copy carries the report and nothing around it', () => {
  const shared = shareableReport({ artefacts: [passage, claim, actor, cross, finding], stages });

  it('never carries the policy document', () => {
    // `passage` holds the extracted paper in full — up to 600,000 characters of
    // somebody's unpublished draft. The report cites it in spans, which is how a
    // report cites; the whole text is not the report.
    expect(shared.artefacts.some((a) => a.kind === 'passage')).toBe(false);
    expect(JSON.stringify(shared).includes(text)).toBe(false);
  });

  it('never names the author’s other assessments', () => {
    expect(shared.artefacts.some((a) => a.kind === 'cross_policy')).toBe(false);
    expect(JSON.stringify(shared).includes('A DIFFERENT PRIVATE PAPER')).toBe(false);
  });

  it('keeps the quotation, its page and its section', () => {
    const kept = shared.artefacts.find((a) => a.id === 's1_0_claim')!;
    expect(kept.sourceQuote).toBe('The Council is accountable for delivery');
    expect(kept.page).toBe(4);
    expect(kept.section).toBe('Delivery');
  });

  it('prunes a reference to something withheld rather than leaving a dead link', () => {
    expect(shared.artefacts.find((a) => a.id === 's1_0_claim')!.refs).toEqual([]);
    expect(shared.artefacts.find((a) => a.id === 's12_0_f')!.refs).toEqual(['s1_0_claim']);
    expect(shared.artefacts.find((a) => a.id === 's2_0')!.data.mentions).toEqual([]);
    expect(shared.artefacts.find((a) => a.id === 's1_0_claim')!.sourceId).toBeNull();
  });

  it('says what it left out rather than looking complete', () => {
    expect(shared.withheld).toEqual(expect.arrayContaining([{ kind: 'passage', count: 1 }, { kind: 'cross_policy', count: 1 }]));
    expect(withheldNote(shared.withheld)).toContain('name other assessments');
  });

  it('withholds the commentary of the chapters it withholds, and keeps the rest', () => {
    const said = shared.warnings.map((w) => w.stage);
    expect(said).not.toContain('Cross-policy exposure');
    expect(said).not.toContain('Actor persona library');
    expect(said).toContain('Exploitation playbook');
    expect(said).toContain('Document ingestion');
  });

  it('withholds exactly two kinds, so a new one is a deliberate decision', () => {
    // If a future kind must not be shared, it goes in WITHHELD_KINDS and this
    // test changes with it. The failure mode this guards is the opposite one: a
    // kind added to the contract and silently shipped to anonymous readers.
    expect([...WITHHELD_KINDS]).toEqual(['passage', 'cross_policy', 'persona_link']);
    for (const kind of WITHHELD_KINDS) expect(KINDS).toContain(kind);
  });

  it('carries every other kind through untouched', () => {
    const all: Artefact[] = KINDS.map((kind) => artefact(`x_${kind}`, kind, kind, 'x', {}, {}));
    const out = shareableReport({ artefacts: all, stages });
    expect(out.artefacts.map((a) => a.kind).sort()).toEqual(KINDS.filter((k) => !(WITHHELD_KINDS as readonly string[]).includes(k)).sort());
  });

  it('shares what an addendum concluded and not the document it read', () => {
    const [out] = shareablePasses([{ pass: 1, kind: 'addendum', role: 'critique', status: 'completed', createdAt: '2026-09-18T00:00:00.000Z', completedAt: '2026-09-18T01:00:00.000Z', filename: 'internal-rebuttal-FINAL-v3.pdf', note: 'Sent by the Council, do not forward', error: 'quoting the paper', size: 4096 } as never]);
    // A recipient acting on an overturned conclusion needs to know it moved.
    expect(out).toMatchObject({ pass: 1, kind: 'addendum', role: 'critique', status: 'completed' });
    // They were never given the attachment, and a filename is content.
    expect(JSON.stringify(out)).not.toContain('rebuttal');
    expect(JSON.stringify(out)).not.toContain('do not forward');
    expect(JSON.stringify(out)).not.toContain('quoting the paper');
    expect(out.filename).toBeNull();
    expect(out.note).toBeNull();
    expect(out.error).toBeNull();
  });
});
