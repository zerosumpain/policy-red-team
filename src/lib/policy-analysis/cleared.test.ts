// Phase 22 — "no way to beat it" is a cleared check, not a way to beat it.
//
// The labels are the real Best Start run's (`44dd5420`), all 46 of them with the
// opening of each play, in `cleared.fixture.json`. Eight are clearances and
// thirty-eight are plays; the pattern is pinned against both, so loosening it
// to catch a ninth has to show which real play it would have swallowed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { clearanceNotes, clearedBodies, clearedByWording, isCleared, isPlay } from './cleared';
import { scoreExploits } from './exposure';
import { playPatterns } from './patterns';
import { deepChainMechanisms } from './pipeline';
import { triageArtefacts } from './validation';
import { plays } from './view';
import { overviewOf } from '$lib/overview';

const REAL: { label: string; play: string }[] = JSON.parse(readFileSync(new URL('./cleared.fixture.json', import.meta.url), 'utf8'));

const CLEARANCES = [
  'Limited room to exploit',
  'Low room for families to defeat delivery',
  'No material child-controlled exploit identified',
  'Limited room for direct exploitation',
  'Limited room for Jobcentre Plus exploitation',
  'No material exploit available to children and babies',
  'No material exploit beyond weak discretion evidence',
  'Limited room for educators to defeat the policy',
];

describe('which real rows are clearances', () => {
  it('holds the whole real run: 46 rows', () => {
    expect(REAL).toHaveLength(46);
  });

  it('recognises the eight clearances by their wording', () => {
    const matched = REAL.filter((row) => clearedByWording(row.label, row.play)).map((row) => row.label);
    expect(matched.sort()).toEqual([...CLEARANCES].sort());
  });

  it('leaves every one of the other 38 real labels alone, label and play both', () => {
    const plays = REAL.filter((row) => !CLEARANCES.includes(row.label));
    expect(plays).toHaveLength(38);
    for (const row of plays) {
      expect(clearedByWording(row.label, row.play), row.label).toBe(false);
      expect(clearedByWording(row.label), row.label).toBe(false);
    }
  });

  it('catches a clearance said only in the play\'s first words', () => {
    expect(clearedByWording('Jobcentre Plus', 'No stronger play is identified. Jobcentre Plus could refer people.')).toBe(true);
    expect(clearedByWording('Children', 'No executable play is supported.')).toBe(true);
    // …and not a play that merely mentions the words later on.
    expect(clearedByWording('Front-load visible hubs', 'First announce hubs. There is no material cost to doing so.')).toBe(false);
  });

  it('lets the stored flag win over the wording, in both directions', () => {
    const row = (label: string, cleared?: boolean) => artefact('s10_000_exploit', 'exploit', label, 's', { play: 'p', ...(cleared === undefined ? {} : { cleared }) });
    expect(isCleared(row('Count contact rather than access', true))).toBe(true);
    expect(isCleared(row('Limited room to exploit', false))).toBe(false);
    expect(isCleared(row('Limited room to exploit'))).toBe(true);
    expect(isCleared(artefact('x', 'finding', 'No material way to beat it', 's', {}))).toBe(false);
  });
});

// A small run: two bodies with plays (one also writes a clearance note), and
// one body whose only row is a clearance.
const passage = artefact('passage_0001', 'passage', 'Page 1', 'Hubs will open in every area and be inspected.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1 });
const mechanism = artefact('s1_000_mechanism', 'mechanism', 'Hubs', 'Hubs.', {}, { refs: [passage.id] });
const other = artefact('s1_001_mechanism', 'mechanism', 'Inspection', 'Inspection.', {}, { refs: [passage.id] });
const assumption = artefact('s1_000_assumption', 'assumption', 'A', 'A.', {}, { refs: [passage.id, mechanism.id] });
const council = artefact('s2_000_actor', 'actor', 'Council', 'c', {}, { refs: [passage.id] });
const ofsted = artefact('s2_001_actor', 'actor', 'Ofsted', 'o', {}, { refs: [passage.id] });
const babies = artefact('s2_002_actor', 'actor', 'Children and babies', 'b', {}, { refs: [passage.id] });
const exploit = (id: string, actor: Artefact, label: string, over: Record<string, unknown> = {}) => artefact(id, 'exploit', label, label, {
  actorId: actor.id, motivation: 'm', play: 'First, do the minimum.', legality: 'compliant', targets: [mechanism.id], preconditions: [assumption.id],
  payoff: 'p', costToPolicy: 'c', incentive: 0.7, ease: 0.7, impact: 0.7, concealment: 0.7, earlyWarning: 'e', counter: 'c', precedent: 'None.', precedentBasis: 'none', ...over,
}, { refs: [mechanism.id, assumption.id] });
const run = (): Artefact[] => scoreExploits([
  passage, mechanism, other, assumption, council, ofsted, babies,
  exploit('s10_000_exploit_001', council, 'Count contact rather than access'),
  exploit('s10_001_exploit_001', ofsted, 'Meet the cycle with shallow visits', { targets: [other.id] }),
  exploit('s10_001_exploit_002', ofsted, 'No material exploit beyond the plays above', { incentive: 0.2, targets: [other.id, mechanism.id] }),
  exploit('s10_002_exploit_001', babies, 'No material way to beat it', { cleared: true, play: 'Babies cannot change what is measured or funded.', incentive: 0, ease: 0, impact: 0, concealment: 0, targets: [other.id] }),
]);

describe('a clearance is out of every count, and listed once', () => {
  it('leaves clearances out of plays(), and so out of the summary, the bands and legality', () => {
    const all = run();
    expect(plays(all).map((p) => p.artefact.id)).toEqual(['s10_000_exploit_001', 's10_001_exploit_001']);
    const view = overviewOf(all);
    expect(view.plays.total).toBe(2);
    expect(view.plays.compliant).toBe(2);
    expect(Object.values(view.plays.bands).reduce((n, c) => n + c, 0)).toBe(2);
    // A body whose only row is a clearance is not a body that could beat it.
    expect(view.bodies.active).toBe(2);
  });

  it('leaves them out of the pattern grid', () => {
    const counted = playPatterns(run()).flatMap((p) => p.plays.map((play) => play.id));
    expect(counted.sort()).toEqual(['s10_000_exploit_001', 's10_001_exploit_001']);
  });

  it('does not let a clearance rank a mechanism for a deep causal chain', () => {
    // Two clearances aim at `other`; one real play does. One real play aims at
    // `mechanism`. Counting clearances would put `other` first on three.
    const { ranked } = deepChainMechanisms(run(), 2);
    const all = run();
    const counted = (id: string) => all.filter(isPlay).filter((a) => (a.data.targets as string[]).includes(id)).length;
    expect(counted(mechanism.id)).toBe(1);
    expect(counted(other.id)).toBe(1);
    // A tie on plays, so the order falls to id — not to the clearances.
    expect(ranked.map((m) => m.id)).toEqual([mechanism.id, other.id]);
  });

  it('lists a body as cleared only when every row it has is a clearance', () => {
    const bodies = clearedBodies(run());
    expect(bodies.map((b) => b.name)).toEqual(['Children and babies']);
    expect(bodies[0].reason).toBe('Babies cannot change what is measured or funded.');
    expect(bodies[0].row.id).toBe('s10_002_exploit_001');
  });

  it('names a clearance written beside real plays as a note, not a cleared body', () => {
    expect(clearanceNotes(run()).map((a) => a.id)).toEqual(['s10_001_exploit_002']);
  });
});

describe('what the door does with a clearance', () => {
  const prior = [passage, mechanism, other, assumption, council, ofsted, babies];
  const write = (label: string, over: Record<string, unknown> = {}) => exploit('s10_003_exploit_001', babies, label, over);

  it('keeps a flagged clearance as it was written', () => {
    const triaged = triageArtefacts({ artefacts: [write('No material way to beat it', { cleared: true })], warnings: [] }, 10, prior);
    expect(triaged.rejected).toHaveLength(0);
    expect(triaged.artefacts[0].data.cleared).toBe(true);
    expect(triaged.warnings.join(' ')).not.toMatch(/cleared check/);
  });

  it('stamps one written in those words without the flag, and says so', () => {
    const triaged = triageArtefacts({ artefacts: [write('Limited room for babies to defeat the policy')], warnings: [] }, 10, prior);
    expect(triaged.artefacts[0].data.cleared).toBe(true);
    expect(triaged.warnings.find((w) => /cleared check/.test(w))).toMatch(/^1 row said a body had no material way to beat the policy/);
  });

  it('never stamps a play', () => {
    const triaged = triageArtefacts({ artefacts: [write('Count contact rather than access')], warnings: [] }, 10, prior);
    expect(triaged.artefacts[0].data.cleared).toBeUndefined();
  });
});
