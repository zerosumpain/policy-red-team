// Phase 19, workstream X: one body across several papers, counted from the
// papers' own graphs. The grid, the timeline and the one clash rule.
import { describe, expect, it } from 'vitest';
import { asksOf, buildGrid, findClashes, onePerDocument, timeline, type IntelEdge, type IntelNode, type IntelPaper, type IntelSighting } from './intel';

const paper = (id: string, title: string, completedAt: string, sha256: string | null = id): IntelPaper => ({ id, title, completedAt, sha256 });
const node = (analysisId: string, id: string, label: string, kind = 'actor'): IntelNode => ({ analysisId, id, kind, label });
let n = 0;
const edge = (analysisId: string, fromId: string, relation: string, toId: string, quote: string | null = null): IntelEdge => ({ analysisId, id: `s3_${String(n++).padStart(3, '0')}_edge`, fromId, toId, relation, label: relation, statement: `${fromId} ${relation} ${toId}`, sourceQuote: quote });

// Two papers. Both name the DfE and Ofsted. In A the DfE commissions Ofsted; in
// B the DfE reports to Ofsted — the two papers put the same two bodies in
// opposite order.
const papers = [paper('A', 'Schools white paper', '2026-09-01T00:00:00Z'), paper('B', 'Inspection reform', '2026-09-20T00:00:00Z')];
const nodes = [
  node('A', 's2_000_dfe', 'Department for Education'), node('A', 's2_001_dfe', 'Department for Education'), node('A', 's2_002_of', 'Ofsted'), node('A', 's1_000_m', 'Academy funding', 'mechanism'),
  node('B', 's2_000_dfe', 'DfE'), node('B', 's2_001_of', 'Ofsted'), node('B', 's1_000_m', 'Inspection framework', 'mechanism'),
];
const edges = [
  edge('A', 's2_000_dfe', 'delivers', 's1_000_m', 'The Department will deliver academy funding.'),
  // The same relationship recorded off a second row of the same body is one ask.
  edge('A', 's2_001_dfe', 'delivers', 's1_000_m'),
  edge('A', 's2_000_dfe', 'funds', 's1_000_m'),
  edge('A', 's2_001_dfe', 'commissions', 's2_002_of', 'The Department commissions Ofsted to inspect.'),
  edge('B', 's2_000_dfe', 'reports_to', 's2_001_of', 'The Department will report to Ofsted on progress.'),
  edge('B', 's2_001_of', 'regulates', 's1_000_m'),
];
const sightings: IntelSighting[] = [
  { analysisId: 'A', actorId: 's2_000_dfe', bodyId: 'govuk:dfe', plays: [{ label: 'Delay', band: 'moderate', exposure: 0.4, legality: 'compliant' }] },
  { analysisId: 'A', actorId: 's2_002_of', bodyId: 'govuk:ofsted', plays: [] },
  { analysisId: 'B', actorId: 's2_000_dfe', bodyId: 'govuk:dfe', plays: [{ label: 'Game the measure', band: 'Severe', exposure: 0.8, legality: 'grey' }, { label: 'x', band: 'limited', exposure: 0.1, legality: 'compliant' }] },
  { analysisId: 'B', actorId: 's2_001_of', bodyId: 'govuk:ofsted', plays: [] },
];
const names = new Map([['govuk:dfe', 'Department for Education'], ['govuk:ofsted', 'Ofsted']]);
const rows = { papers, sightings, edges, nodes };

describe('what a paper asks of a body', () => {
  it('reads it off the graph, counts one relationship once, and says it in plain words', () => {
    const asks = asksOf('A', new Set(['s2_000_dfe', 's2_001_dfe']), edges, nodes);
    expect(asks.map((a) => [a.kind, a.words])).toEqual([
      ['duty', 'commissions Ofsted'], ['duty', 'delivers Academy funding'], ['duty', 'pays for Academy funding'],
    ]);
    expect(asks.find((a) => a.relation === 'delivers')!.quote).toBe('The Department will deliver academy funding.');
  });

  it('includes who it answers to, from edges pointing INTO it', () => {
    expect(asksOf('B', new Set(['s2_001_of']), edges, nodes).map((a) => a.words)).toContain('regulates Inspection framework');
    expect(asksOf('A', new Set(['s2_002_of']), edges, nodes).map((a) => [a.kind, a.words])).toEqual([['oversight', 'Department for Education commissions it']]);
  });
});

describe('the bodies × papers grid', () => {
  it('rows are bodies, columns are papers, and each cell is what that paper gives that body', () => {
    const grid = buildGrid({ ...rows, names });
    expect(grid.papers.map((p) => p.id)).toEqual(['A', 'B']);
    expect(grid.rows.map((r) => r.name)).toEqual(['Department for Education', 'Ofsted']);
    const dfe = grid.rows[0];
    // The paper's filed actor and its same-label rows are the body.
    expect(dfe.cells.A).toEqual({ duties: 3, powers: 0, plays: 1, worstBand: 'moderate', worstExposure: 0.4 });
    // A capitalised band still ranks as the worst.
    expect(dfe.cells.B).toMatchObject({ duties: 1, plays: 2, worstBand: 'Severe', worstExposure: 0.8 });
    expect(dfe.papers).toBe(2);
    expect(dfe.load).toBe(3 + 1 + 1 + 2);
  });

  it('counts two runs of one document as one paper — the later one', () => {
    const again = paper('A2', 'Schools white paper (rerun)', '2026-09-10T00:00:00Z', 'A');
    expect(onePerDocument([...papers, again]).map((p) => p.id)).toEqual(['A2', 'B']);
    const grid = buildGrid({ ...rows, papers: [...papers, again], sightings: [...sightings, { ...sightings[0], analysisId: 'A2' }], names });
    expect(grid.papers.map((p) => p.id)).toEqual(['A2', 'B']);
    expect(grid.rows[0].papers).toBe(2);
  });
});

describe('a body across papers, oldest first', () => {
  it('lists what each paper asked and the plays it attributed, worst first', () => {
    const line = timeline('govuk:dfe', rows);
    expect(line.map((p) => p.paper.id)).toEqual(['A', 'B']);
    expect(line[1].asks.map((a) => a.words)).toEqual(['reports to Ofsted']);
    expect(line[1].plays.map((p) => p.label)).toEqual(['Game the measure', 'x']);
  });
});

describe('clashes between papers', () => {
  const bodyOf = (analysisId: string, actorId: string) => {
    const filed = sightings.find((s) => s.analysisId === analysisId && s.actorId === actorId)?.bodyId;
    if (filed) return filed;
    return actorId === 's2_001_dfe' ? 'govuk:dfe' : null;
  };

  it('finds two papers that put the same two register bodies in opposite order, and quotes both sides', () => {
    const clashes = findClashes({ ...rows, names, bodyOf });
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ bodyName: 'Department for Education', otherName: 'Ofsted' });
    expect(clashes[0].a).toMatchObject({ words: 'Department for Education commissions Ofsted', quote: 'The Department commissions Ofsted to inspect.' });
    expect(clashes[0].b).toMatchObject({ words: 'Department for Education reports to Ofsted', quote: 'The Department will report to Ofsted on progress.' });
    expect(clashes[0].rule).toMatch(/In one paper Department for Education is over Ofsted/);
  });

  it('asserts nothing where the register cannot say who the other end is', () => {
    expect(findClashes({ ...rows, names, bodyOf: () => null })).toEqual([]);
  });

  it('does not call different duties a clash', () => {
    const calm = edges.filter((e) => e.relation !== 'reports_to');
    expect(findClashes({ ...rows, edges: calm, names, bodyOf })).toEqual([]);
  });
});
