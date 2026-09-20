// "What is backed up", against the shape the real run has.
//
// Fifteen evidence rows, every one of them a passage of the paper quoting
// itself: no URL, a page, a dispute the report never printed. The fixture keeps
// the two joins that actually differ between rows — one row whose claim is
// missing and resolves to its mechanism instead, and two rows pointing at the
// same claim — because those are the two cases a coverage count gets wrong.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { evidenceShape } from './evidence-view';

const claim = (id: string, category = 'objective'): Artefact =>
  artefact(id, 'claim', `Claim ${id}`, 'The paper says something.', { category, notes: '' });

const mechanism = (id: string): Artefact =>
  artefact(id, 'mechanism', `Mechanism ${id}`, 'Machinery.', {});

const link = (id: string, data: Record<string, unknown>, over: Partial<Artefact> = {}): Artefact =>
  artefact(id, 'evidence', `Evidence ${id}`, 'A passage.', { result: 'supports', dispute: 'Not established.', evidenceType: 'policy-text extraction', ...data }, { page: 5, origin: 'extracted_fact', ...over });

/** Three claims, two mechanisms, and four links between them. */
const world = (): Artefact[] => [
  claim('c1'), claim('c2'), claim('c3', 'cited_evidence'),
  mechanism('m1'), mechanism('m2'),
  link('e1', { claimId: 'c1', mechanismId: 'm1' }),
  // Same claim as e1: coverage counts claims, not links.
  link('e2', { claimId: 'c1', mechanismId: 'm2' }),
  link('e3', { claimId: 'c2' }),
  // No claim at all — it must fall through to the mechanism rather than vanish.
  link('e4', { mechanismId: 'm1' }),
];

describe('evidenceShape', () => {
  it('counts distinct claims and mechanisms, not links', () => {
    const shape = evidenceShape(world());
    expect(shape.total).toBe(4);
    expect(shape.claims).toEqual({ covered: 2, of: 3 });
    expect(shape.mechanisms).toEqual({ covered: 2, of: 2 });
  });

  it('falls through claim, then mechanism, for what a link backs', () => {
    const shape = evidenceShape(world());
    expect(shape.rows.map((row) => row.backs?.id)).toEqual(['c1', 'c1', 'c2', 'm1']);
  });

  it('calls a link with no URL a passage of the paper', () => {
    const shape = evidenceShape(world());
    expect(shape.internal).toBe(4);
    expect(shape.external).toBe(0);
    expect(shape.reading[0]).toBe(
      'All 4 evidence links are passages of the policy paper itself. None of them cites a source outside it.',
    );
  });

  it('SAYS SOMETHING ELSE on a run that did retrieve a source', () => {
    const found = [...world(), link('e5', { claimId: 'c3' }, { url: 'https://example.gov.uk/report' })];
    const shape = evidenceShape(found);
    expect(shape.external).toBe(1);
    expect(shape.reading[0]).toBe(
      '4 of the 5 evidence links are passages of the policy paper itself; the other 1 cites a source outside it.',
    );
  });

  it('reports the paper’s own cited-evidence claims separately', () => {
    // c3 is the only cited_evidence claim in `world()` and nothing links to it.
    expect(evidenceShape(world()).cited).toEqual({ total: 1, linked: 0 });
    expect(evidenceShape(world()).reading[2]).toBe(
      "The paper's own 1 cited-evidence claim carries none of them.",
    );
  });

  it('counts a cited-evidence claim that IS linked', () => {
    const shape = evidenceShape([...world(), link('e5', { claimId: 'c3' })]);
    expect(shape.cited).toEqual({ total: 1, linked: 1 });
  });

  it('is empty, not broken, on a run that found nothing', () => {
    const shape = evidenceShape([claim('c1')]);
    expect(shape.total).toBe(0);
    expect(shape.reading).toEqual([]);
  });
});
