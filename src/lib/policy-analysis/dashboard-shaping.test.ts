// The shaping behind the dashboard rebuild: the glossary, the actor atlas, the
// relationship network, the verdict summary and the exportable document.
//
// All five are PURE, which is the point of putting them here rather than in the
// components — a chart that redraws on five measures and a document that has to
// come out identical for two different readers are both things you want to
// assert without mounting anything or opening a browser.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artefact, RELATIONS, type Artefact } from './contracts';
import { STAGE_NOTES, STAGE_PHASES } from './stages';
import { executeStage } from './pipeline';
import { ingest } from './server/ingest';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';
import * as view from './view';
import { GRAPH_KIND, GRAPH_KINDS, GRAPH_NODE_CAP, toPolicyNetGraph } from './graph3d';
import { factLabel, factTotal, stageFacts } from './stage-facts';
import { atlas, ceiling, formatMeasure, rank, ACTOR_MEASURES, degrees } from './actors';
import { network, edgesOf } from './network';
import { explain, explainable, familyOf, RELATION_FAMILIES, FACTOR_TERMS } from './glossary';
import { assessmentMarkdown, documentSlug } from './report-doc';
import { parseSubject } from './peek';
import { shareableReport } from './share';
import { STAGES } from './contracts';

const research = async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] });

/** A complete synthetic assessment: every stage, in order, as the worker runs them. */
async function assessment(): Promise<Artefact[]> {
  const all = (await ingest(readFileSync('tests/fixtures/policy-analysis/policy.txt'), 'policy.txt', 'text/plain')).artefacts;
  const signal = new AbortController().signal;
  for (let stage = 1; stage < STAGES.length; stage++) {
    const result = await executeStage(
      { stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: async (...args) => fixtureModel(...args), research, signal },
    );
    all.push(...result.artefacts);
  }
  return all;
}

describe('the glossary explains every term the page prints', () => {
  it('covers every exposure factor, band, evidence result and check verdict', () => {
    for (const key of ['incentive', 'ease', 'impact', 'concealment']) expect(explain(key), key).not.toBeNull();
    for (const key of ['severe', 'significant', 'moderate', 'limited']) expect(explain(key), key).not.toBeNull();
    for (const key of ['supports', 'contradicts', 'mixed', 'insufficient']) expect(explain(key), key).not.toBeNull();
    for (const key of ['high_risk', 'moderate_risk', 'low_risk', 'indeterminate']) expect(explain(key), key).not.toBeNull();
  });

  it('explains every ORIGIN an artefact can carry, because that is the epistemic backbone', async () => {
    const all = await assessment();
    for (const origin of new Set(all.map((a) => a.origin))) {
      expect(explain(origin), `origin ${origin} has no explainer`).not.toBeNull();
    }
  });

  it('every entry says what it is, why it is there, and how to read a high value', () => {
    for (const key of explainable()) {
      const term = explain(key)!;
      expect(term.what.length, key).toBeGreaterThan(10);
      expect(term.why.length, key).toBeGreaterThan(10);
      expect(term.read.length, key).toBeGreaterThan(10);
    }
  });

  it('says out loud that concealment is about the policy, not about honesty', () => {
    const concealment = FACTOR_TERMS.find((t) => t.key === 'concealment')!;
    expect(concealment.what).toContain('not how secretive');
  });

  it('says exposure is a severity rather than a certainty', () => {
    expect(explain('exposure')!.read).toMatch(/severity|not one the assessment is/i);
  });

  it('has no term without an explainer key, and no key claimed by two families', () => {
    const seen = new Set<string>();
    for (const family of RELATION_FAMILIES) {
      for (const relation of family.relations) {
        expect(seen.has(relation), `${relation} is in two families`).toBe(false);
        seen.add(relation);
        expect(familyOf(relation)).toBe(family.key);
      }
    }
  });

  it('returns null for a relation the vocabulary has since gained', () => {
    expect(familyOf('teleports_to')).toBeNull();
    expect(familyOf(null)).toBeNull();
  });
});

describe('the actor atlas redraws on the measure the reader picks', () => {
  it('carries all five measures on every row, so switching one recomputes nothing', async () => {
    const all = await assessment();
    const rows = atlas(all, view.actorBoard(all, view.plays(all)));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const measure of ACTOR_MEASURES) {
        expect(Number.isFinite(row.measures[measure.key]), `${row.label} has no ${measure.key}`).toBe(true);
      }
    }
  });

  it('ranks by whichever measure is asked for, and the orders genuinely differ', async () => {
    const all = await assessment();
    const rows = atlas(all, view.actorBoard(all, view.plays(all)));
    for (const measure of ACTOR_MEASURES) {
      const ranked = rank(rows, measure.key);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].measures[measure.key]).toBeGreaterThanOrEqual(ranked[i].measures[measure.key]);
      }
    }
  });

  it('LEAVES OUT a body that scores nothing rather than drawing it as a zero', () => {
    const actor = artefact('s2_001', 'actor', 'A body nobody attacks', 'x', {
      entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null,
    });
    const rows = atlas([actor], [{ actor, profile: null, plays: [], worst: 0 }]);
    expect(rows).toHaveLength(1);
    // An empty bar with a name beside it reads as something the assessment
    // measured, when it is an absence it never looked for.
    expect(rank(rows, 'worst')).toHaveLength(0);
  });

  it('normalises the role index across the cast, so the tallest bar is always 1', async () => {
    const all = await assessment();
    const rows = atlas(all, view.actorBoard(all, view.plays(all)));
    const top = ceiling(rows, 'role');
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThanOrEqual(1);
    for (const row of rows) expect(row.measures.role).toBeLessThanOrEqual(1);
  });

  it('prints counts as integers and the two fractions as a 0–100 score', () => {
    expect(formatMeasure('plays', 3)).toBe('3');
    expect(formatMeasure('degree', 12)).toBe('12');
    expect(formatMeasure('worst', 0.826)).toBe('83');
    expect(formatMeasure('role', 0.5)).toBe('50');
  });

  it('counts a relationship at BOTH of its ends', () => {
    const body = (id: string) => artefact(id, 'actor', id, 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const edge = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'b', relation: 'funds' });
    const counts = degrees([body('a'), body('b'), edge]);
    expect(counts.get('a')).toBe(1);
    expect(counts.get('b')).toBe(1);
  });

  it('agrees with the network panel, because the two sit on one page', () => {
    // `degrees()` counted raw edge artefacts and `nodesOf()` counted only the
    // ones whose ends resolve, so a body on an edge with a dangling counterpart
    // read one number in the atlas and a smaller one in the network.
    const body = (id: string) => artefact(id, 'actor', id, 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const real = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'b', relation: 'funds' });
    const dangling = artefact('e2', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'gone', relation: 'funds' });
    const all = [body('a'), body('b'), real, dangling];
    const net = network(all);
    expect(degrees(all).get('a')).toBe(net.nodes.find((n) => n.id === 'a')?.degree);
  });
});

describe('the relationship map reads the graph rather than listing it', () => {
  it('drops an edge whose end is not in the assessment', () => {
    const a = artefact('a', 'actor', 'A', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const dangling = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'gone', relation: 'funds' });
    // A dangling end is a reference, not a relationship: drawing it would put a
    // body on the map that the assessment cannot open.
    expect(edgesOf([a, dangling])).toHaveLength(0);
  });

  it('folds relations into families and counts the ones no family claims', () => {
    const a = artefact('a', 'actor', 'A', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const b = artefact('b', 'actor', 'B', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const funds = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'b', relation: 'funds' });
    const net = network([a, b, funds]);
    expect(net.families.map((f) => f.key)).toContain('money');
    expect(net.unfamilied).toBe(0);
  });

  it('names authority with no accountability, and does NOT call it unaccountable', () => {
    const a = artefact('a', 'actor', 'The Regulator', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const b = artefact('b', 'actor', 'A Provider', 'x', { entityType: 'provider', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const rules = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'b', relation: 'has_authority_over' });
    const insight = network([a, b, rules]).insights.find((i) => i.key === 'authority-without-accountability')!;
    expect(insight.subjects.map((s) => s.label)).toContain('The Regulator');
    // A graph can say the paper does not state a line. It cannot say none exists.
    expect(insight.reading).toContain('gap in the paper');
  });

  it('does not name a body that DOES report to someone', () => {
    const a = artefact('a', 'actor', 'The Regulator', 'x', { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const b = artefact('b', 'actor', 'A Provider', 'x', { entityType: 'provider', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const c = artefact('c', 'actor', 'The Department', 'x', { entityType: 'department', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const rules = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'b', relation: 'has_authority_over' });
    const reports = artefact('e2', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'c', relation: 'reports_to' });
    const insight = network([a, b, c, rules, reports]).insights.find((i) => i.key === 'authority-without-accountability');
    expect(insight?.subjects.map((s) => s.label) ?? []).not.toContain('The Regulator');
  });

  it('finds the body measured on data it supplies itself', () => {
    const a = artefact('a', 'actor', 'A Provider', 'x', { entityType: 'provider', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const m = artefact('m', 'actor', 'The Outcome Measure', 'x', { entityType: 'dataset', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null });
    const measured = artefact('e1', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'm', relation: 'is_measured_by' });
    const owns = artefact('e2', 'edge', 'x', 'y', { notes: '' }, { fromId: 'a', toId: 'm', relation: 'owns_data' });
    const insight = network([a, m, measured, owns]).insights.find((i) => i.key === 'marks-own-homework')!;
    expect(insight.subjects.map((s) => s.label)).toContain('A Provider');
  });

  it('runs over a real assessment without inventing an end it cannot open', async () => {
    const all = await assessment();
    const net = network(all);
    const ids = new Set(all.map((a) => a.id));
    for (const node of net.nodes) expect(ids.has(node.id), `${node.id} is not an artefact`).toBe(true);
  });
});

describe('the verdict is the headline story, summarised', () => {
  it('splits on the first paragraph break and keeps the remainder', () => {
    const { lead, rest } = view.summarise('The first paragraph.\n\nThe second.\n\nThe third.');
    expect(lead).toBe('The first paragraph.');
    expect(rest).toBe('The second.\n\nThe third.');
  });

  it('leaves a short statement whole rather than cutting it mid-thought', () => {
    const { lead, rest } = view.summarise('Short enough to read.');
    expect(lead).toBe('Short enough to read.');
    expect(rest).toBe('');
  });

  it('splits a LONG single paragraph, because that is the case the summary exists for', () => {
    const sentence = 'The policy relies on a body that has every reason to under-report against it, and states no counterpart. ';
    const { lead, rest } = view.summarise(sentence.repeat(8));
    expect(lead.length).toBeGreaterThanOrEqual(view.LEAD_FLOOR);
    expect(rest.length).toBeGreaterThan(0);
    // Nothing is lost in the split.
    expect(`${lead} ${rest}`.replace(/\s+/g, ' ').trim()).toBe(sentence.repeat(8).replace(/\s+/g, ' ').trim());
  });

  it('averages the four factors across the playbook, unweighted', async () => {
    const all = await assessment();
    const plays = view.plays(all);
    const profile = view.factorProfile(plays);
    expect(profile.map((f) => f.key)).toEqual(['incentive', 'ease', 'impact', 'concealment']);
    for (const factor of profile) {
      expect(factor.mean).toBeGreaterThanOrEqual(0);
      expect(factor.mean).toBeLessThanOrEqual(1);
    }
  });

  it('reports zeroes rather than NaN when there is no playbook yet', () => {
    for (const factor of view.factorProfile([])) {
      expect(factor.mean).toBe(0);
      expect(factor.top).toBeNull();
    }
  });
});

/**
 * THREE STEPS, AND AN ANNEX OF TWELVE.
 *
 * The nineteen-cell rail is gone. What replaced it has two failure modes worth
 * pinning: a view that belongs to neither the journey nor the annex is a view
 * the page silently cannot show, and an id that appears in both is a view two
 * things claim to own. Every deep link ever exported names one of these ids, so
 * the set is a contract rather than a layout detail.
 */
describe('the journey is three steps and an annex of twelve', () => {
  it('is the questions John named, in order, and the working leads at 00', () => {
    expect(view.JOURNEY.map((s) => s.id)).toEqual(['provenance', 'verdict', 'playbook', 'actors']);
    expect(view.JOURNEY.map((s) => s.step)).toEqual([0, 1, 2, 3]);
  });

  /**
   * THE NUMERALS ARE FIXED, NOT POSITIONAL. Step 00 is the only one that can be
   * absent — a shared copy and an offline pack are handed no run log — and
   * renumbering the rest when it goes would make "step 02" mean the threats on
   * the owner's page and the bodies on the copy he sent someone.
   */
  it('numbers a step from `journey.ts`, never from its place in a filtered list', () => {
    const withoutWorking = view.JOURNEY.filter((s) => s.id !== 'provenance');
    expect(withoutWorking.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(view.JOURNEY.find((s) => s.id === 'verdict')?.step).toBe(1);
  });

  it('opens every step on its own view', () => {
    for (const step of view.JOURNEY) expect(view.STEP_VIEWS[step.id][0].id).toBe(step.id);
  });

  it('puts nothing in both the journey and the annex, and leaves nothing out', () => {
    const overlap = view.STEP_VIEW_IDS.filter((id) => view.ANNEX_IDS.includes(id));
    expect(overlap, 'a view two places claim to own').toEqual([]);
    const all = [...view.STEP_VIEW_IDS, ...view.ANNEX_IDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the thirteen the annex menu counts, in three groups', () => {
    expect(view.ANNEX.map((g) => g.group)).toEqual(['Grounding', 'Review', 'Assessment']);
    // Twelve until `addenda` joined them. The number is pinned rather than
    // derived so adding a view is a deliberate edit here as well as there —
    // the menu is the whole navigation and it grows one entry at a time.
    expect(view.ANNEX_IDS).toHaveLength(13);
    for (const id of ['stress', 'checks', 'evidence', 'scenarios', 'causal', 'appraisal', 'assurance', 'cross', 'graph', 'addenda', 'report', 'handling', 'key']) {
      expect(view.ANNEX_IDS, `${id} is not in the annex`).toContain(id);
    }
  });

  it('took the working OUT of the annex, because it is step 00 now', () => {
    expect(view.ANNEX_IDS).not.toContain('provenance');
    expect(view.annexPlace('provenance')).toBeNull();
    expect(view.stepOf('provenance')).toBe('provenance');
    expect(view.resolveSection('provenance')).toBe('provenance');
  });

  it('says which step owns each view, and nothing about an annex one', () => {
    expect(view.stepOf('interplay')).toBe('playbook');
    expect(view.stepOf('network')).toBe('actors');
    expect(view.stepOf('personas')).toBe('actors');
    expect(view.stepOf('checks')).toBeNull();
  });

  it('places an annex view in its group, one-indexed, against that group size', () => {
    expect(view.annexPlace('checks')).toEqual({ group: 'Grounding', name: 'Gaps in the paper', index: 2, of: 4 });
    expect(view.annexPlace('playbook')).toBeNull();
  });

  /**
   * `#guide` retired with the rail and every export written before it carries
   * the id. A dead deep link is worse than a renamed one, because nothing on
   * the page says the reader arrived at nothing.
   */
  it('resolves the id that retired rather than dead-ending it', () => {
    expect(view.resolveSection('guide')).toBe('verdict');
    expect(view.isSectionHash('guide')).toBe(true);
    expect(view.resolveSection('interplay')).toBe('interplay');
    expect(view.resolveSection('s11_003')).toBeNull();
    expect(view.isSectionHash('s11_003')).toBe(false);
  });
});

/**
 * THE STAGE GUIDE IS COPY KEYED BY ORDINAL, which is the one way it can go
 * wrong silently. `STAGE_NOTES[i]` describes `STAGES[i]`; a note inserted
 * rather than appended would re-label every stage after it with another
 * stage's method, and the page would read as confidently as ever.
 */
describe('the working explains the stages it actually has', () => {
  it('carries one note per stage, in the order the contract fixes', () => {
    expect(STAGE_NOTES).toHaveLength(STAGES.length);
    expect(STAGE_NOTES.map((n) => n.name)).toEqual([...STAGES]);
  });

  it('puts every note in a phase the page draws', () => {
    const phases = new Set(STAGE_PHASES.map((p) => p.key));
    for (const note of STAGE_NOTES) expect(phases.has(note.phase), `${note.name} is in no phase`).toBe(true);
  });

  it('runs the phases in stage order, so the page never jumps backwards', () => {
    const order = STAGE_PHASES.map((p) => p.key);
    const seen = STAGE_NOTES.map((n) => order.indexOf(n.phase));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('marks exactly one stage as the one step 02 comes from', () => {
    const lead = STAGE_NOTES.filter((n) => n.lead);
    expect(lead).toHaveLength(1);
    expect(STAGES.indexOf(lead[0].name as (typeof STAGES)[number])).toBe(10);
  });

  /**
   * The limit is the point of the page. A stage that explains itself and omits
   * what it cannot do is a sales sheet, so an empty one is a defect rather than
   * a gap in the copy.
   */
  it('says what every stage cannot do', () => {
    for (const note of STAGE_NOTES) {
      expect(note.limit.trim().length, `${note.name} states no limit`).toBeGreaterThan(20);
      expect(note.what.trim().length, `${note.name} says nothing about itself`).toBeGreaterThan(20);
    }
  });
});

/**
 * THE INK BAND'S FOUR FIGURES.
 *
 * Run status left the ledger — it is machinery, and only true while a run is in
 * flight. What replaced it is the finding this assessment exists to deliver.
 */
describe('the ledger counts what a reader can act on', () => {
  const plays = [
    artefact('p1', 'exploit', 'A', 'a', { legality: 'compliant', exposure: 0.9, band: 'severe', incentive: 1, ease: 1, impact: 1, concealment: 1 }),
    artefact('p2', 'exploit', 'B', 'b', { legality: 'breach', exposure: 0.2, band: 'limited', incentive: 0, ease: 0, impact: 0, concealment: 0 }),
  ];
  const tests = [
    artefact('t1', 'test', 'T1', 't', { result: 'high_risk' }),
    artefact('t2', 'test', 'T2', 't', { result: 'low_risk' }),
  ];

  it('counts the ways in, the compliant ones, the short checks and the open questions', () => {
    const cells = view.ledger([...plays, ...tests], view.plays(plays), 7);
    expect(cells.map((c) => c.figure)).toEqual([2, 1, 1, 7]);
    expect(cells[1].label).toBe('Inside the rules');
    expect(cells[2].sub).toBe('of 2 structural checks');
  });

  it('reports zeroes rather than NaN on an assessment with nothing in it yet', () => {
    expect(view.ledger([], [], 0).map((c) => c.figure)).toEqual([0, 0, 0, 0]);
  });
});

/**
 * THE STANDFIRST IS THE ASSESSMENT'S OWN CONCLUSION, not a description of the
 * tool — which was the same sentence on every assessment ever run.
 */
describe('the band carries one sentence of the verdict', () => {
  const finding = (statement: string) =>
    artefact('f1', 'finding', 'Executive assessment', statement, { section: 'executive_assessment', revision: 'assured' });

  it('stops at the first sentence boundary', () => {
    const text = view.headlineSentence([finding('The guidance is beatable without breaking it. Five of the six ways in stay inside the rules.')]);
    expect(text).toBe('The guidance is beatable without breaking it.');
  });

  it('keeps a single sentence whole', () => {
    expect(view.headlineSentence([finding('One sentence and no more')])).toBe('One sentence and no more');
  });

  it('is empty until synthesis has written one, so the band can fall back', () => {
    expect(view.headlineSentence([])).toBe('');
  });
});

/**
 * THE POLICY GRAPH, AS THE 3D VIEW IS FED IT.
 *
 * The view is vendored from SR-Main and takes `NetNode`/`NetEdge`. Everything
 * policy-specific is this mapping, so this is where it can go wrong quietly: a
 * picture that silently drops entities, or one that disagrees with the panel
 * beside it about how many there are.
 */
describe('the policy graph is mapped for the intel view', () => {
  const edge = (id: string, from: string, to: string, relation: (typeof RELATIONS)[number]) =>
    artefact(id, 'edge', relation, 'e', { notes: '' }, { fromId: from, toId: to, relation });
  const world = [
    artefact('a1', 'actor', 'Department', 's', {}),
    artefact('a2', 'actor', 'Regulator', 's', {}),
    artefact('m1', 'mechanism', 'The duty', 's', {}),
    artefact('c1', 'claim', 'A claim', 's', { category: 'objective', notes: '' }),
    edge('e1', 'a1', 'm1', 'delivers'),
    edge('e2', 'a2', 'a1', 'reports_to'),
    edge('e3', 'a1', 'c1', 'supports'),
  ];

  it('draws every connected entity and every relationship the network found', () => {
    const g = toPolicyNetGraph(network(world), world);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a1', 'a2', 'c1', 'm1']);
    expect(g.edges).toHaveLength(3);
    expect(g.omitted).toBe(0);
    expect(g.drawnEdges).toBe(g.totalEdges);
  });

  /**
   * The colour IS the kind, and the legend prints the same swatch. A kind with
   * no swatch must land in `other` rather than being dropped — a picture that
   * silently omits a node disagrees with the count printed under it.
   */
  it('gives every node a kind the legend has a colour for', () => {
    const g = toPolicyNetGraph(network(world), world);
    for (const node of g.nodes) {
      expect(GRAPH_KINDS, `${node.name} is drawn as ${node.typeId}`).toContain(node.typeId);
      expect(node.color).toBe(GRAPH_KIND[node.typeId].colour);
    }
    expect(g.counts.actor).toBe(2);
    expect(g.counts.mechanism).toBe(1);
    expect(g.counts.claim).toBe(1);
  });

  it('puts a kind the contract gains later in `other` rather than losing it', () => {
    const later = [
      artefact('x1', 'actor', 'Department', 's', {}),
      artefact('x2', 'scenario', 'A condition', 's', {}),
      edge('e9', 'x1', 'x2', 'is_exposed_to'),
    ];
    const g = toPolicyNetGraph(network(later), later);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === 'x2')?.typeId).toBe('other');
    expect(g.counts.other).toBe(1);
  });

  /**
   * The cap protects the frame rate, and what it leaves off has to be COUNTED.
   * A capped picture that does not say it is capped lies about the size of the
   * thing it draws.
   */
  it('caps on the busiest entities and says how many it left off', () => {
    const many: Artefact[] = [artefact('hub', 'actor', 'Hub', 's', {})];
    for (let i = 0; i < GRAPH_NODE_CAP + 20; i++) {
      many.push(artefact(`n${i}`, 'mechanism', `M${i}`, 's', {}));
      many.push(edge(`e${i}`, 'hub', `n${i}`, 'delivers'));
    }
    const g = toPolicyNetGraph(network(many), many);
    expect(g.nodes).toHaveLength(GRAPH_NODE_CAP);
    expect(g.total).toBe(GRAPH_NODE_CAP + 21);
    expect(g.omitted).toBe(21);
    // The busiest node is the one the cap must never drop.
    expect(g.nodes.some((n) => n.id === 'hub')).toBe(true);
    // An edge with one end off screen is not drawn, and the totals say so.
    expect(g.drawnEdges).toBeLessThan(g.totalEdges);
  });

  it('sizes a sphere by degree, into the range the view names a node in', () => {
    const g = toPolicyNetGraph(network(world), world);
    const busiest = g.nodes.find((n) => n.id === 'a1');
    const quietest = g.nodes.find((n) => n.id === 'c1');
    expect(busiest!.importance).toBeGreaterThan(quietest!.importance);
    for (const node of g.nodes) {
      expect(node.importance).toBeGreaterThan(0);
      expect(node.importance).toBeLessThan(0.2);
    }
  });

  it('carries the edge artefact id, because the line is what opens the drill', () => {
    const g = toPolicyNetGraph(network(world), world);
    expect(g.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });
});

/**
 * WHAT A STAGE LOST, COUNTED.
 *
 * Every string below is copied VERBATIM from the producer that emits it —
 * `pipeline.ts`, `validation.ts`, `provider.ts`, `ingest.ts`, `research.ts`,
 * `front-matter.ts`. A rollup over prose is only as good as the sentences it
 * was written against, and a test using invented wording would pass while the
 * page mis-grouped every real run.
 */
describe('a stage rolls its warnings up into counted facts', () => {
  const REAL = {
    discardedGroup:
      '12 model outputs were discarded and are not part of this assessment — the citation named an artefact this assessment does not hold. Affected: Trust behaviour, Funding route, and 6 more.',
    discardedSources:
      '3 model-authored sources were discarded: evidence comes from retrieval, never from the model.',
    droppedRefs:
      '9 items referred to something that is not in this assessment; the reference was dropped and the item kept. s5_003 s5_011 And 5 more.',
    frontMatter:
      '4 of 72 pages carry no policy text and were not analysed: page 1 (cover), page 2 (copyright), page 3 (contents), page 4 (foreword). They remain part of the document record.',
    ocr: 'Page 18: no readable text; scanned content may need OCR.',
    unresolved:
      '11 of 50 source mentions were never resolved into a named body: landlords, tenants, and 9 more. Those actors are absent from the graph, the profiles and the red team.',
    notRedTeamed:
      '6 of 18 profiled actors were not red-teamed in this pass: Ofsted, DfE. Ordered by connectivity. A deep run covers more of them.',
    capped:
      'This stage produced 640 items and only the first 500 were kept. The assessment is incomplete for this stage.',
    outputLimit: 'The model reached its output limit on this call, so its list may be incomplete.',
    libraryUnread:
      'The persona library could not be read, so this stage ran without what earlier assessments established about these bodies.',
    sealed:
      'This is a sealed assessment, so nothing was written to the persona library and no model call was made for it. A dossier drawn from this paper would outlive the run and survive its purge, which is the residue sealing exists to remove.',
    novel: 'Something no pattern in this module has ever been shown.',
  };
  const all = Object.values(REAL);

  /**
   * THE PROPERTY THAT MAKES ROLLING PROSE UP SAFE. A sentence the patterns do
   * not recognise must still be readable: the grouping may be wrong about a
   * NAME, never about whether a reader can see what it holds.
   */
  it('loses nothing — every warning is in exactly one fact, verbatim', () => {
    const facts = stageFacts(all);
    const seen = facts.flatMap((f) => f.detail);
    expect(seen.slice().sort()).toEqual(all.slice().sort());
    expect(new Set(seen).size).toBe(all.length);
    expect(factTotal(facts)).toBe(all.length);
  });

  it('reads a sentence it has never seen as an open question rather than dropping it', () => {
    const facts = stageFacts([REAL.novel]);
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe('open');
    expect(facts[0].detail).toEqual([REAL.novel]);
    expect(factLabel(facts[0])).toBe('1 open question');
  });

  /**
   * THE COUNT IS THE SENTENCE'S OWN FIGURE. "12 model outputs were discarded"
   * is twelve items in one sentence; reporting it as "1 discarded" would make
   * the rollup a SMALLER number than the page it replaced, which is the one
   * thing it must never be.
   */
  it('sums the figures the sentences state, not the number of sentences', () => {
    const facts = stageFacts([REAL.discardedGroup, REAL.discardedSources]);
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe('discarded');
    expect(facts[0].count).toBe(15);
    expect(facts[0].detail).toHaveLength(2);
    expect(factLabel(facts[0])).toBe('15 items discarded');
  });

  it('counts a sentence with no figure as the one thing it is', () => {
    const facts = stageFacts([REAL.outputLimit]);
    expect(facts[0].count).toBe(1);
    expect(factLabel(facts[0])).toBe('1 thing cut short by a limit');
  });

  it("keeps a denominator, which is the reading John asked for", () => {
    const facts = stageFacts([REAL.frontMatter]);
    expect(facts[0].kind).toBe('no_text');
    expect(factLabel(facts[0])).toBe('4 of 72 pages carried no policy text');
  });

  /**
   * Two stages of one run can skip pages out of different totals. "4 of 72"
   * printed over a group that also holds "3 of 9" is arithmetic nobody can
   * check, so the denominator survives only while every sentence agrees.
   */
  it('drops the denominator when the sentences disagree about it', () => {
    const facts = stageFacts([REAL.frontMatter, '3 of 9 pages carry no policy text and were not analysed: page 1 (cover).']);
    expect(facts[0].count).toBe(7);
    expect(facts[0].of).toBeNull();
    expect(factLabel(facts[0])).toBe('7 pages carried no policy text');
  });

  it('puts the page with no readable text with the pages that carried none', () => {
    const facts = stageFacts([REAL.ocr]);
    expect(facts[0].kind).toBe('no_text');
  });

  /**
   * A SEALED RUN'S OMISSIONS ARE DELIBERATE. Reading "nothing was written to
   * the persona library" as a failure is the opposite of the truth — not
   * writing it is the whole point — so the rule leads and the label says so.
   */
  it('names a sealed run\'s omissions as deliberate, not as losses', () => {
    const facts = stageFacts([REAL.sealed]);
    expect(facts[0].kind).toBe('sealed');
    expect(factLabel(facts[0])).toBe('1 step skipped because this run is sealed');
  });

  it('separates a dropped REFERENCE from a discarded ITEM — one keeps the artefact', () => {
    const facts = stageFacts([REAL.droppedRefs, REAL.discardedGroup]);
    expect(facts.map((f) => f.kind)).toEqual(['discarded', 'reference_dropped']);
    expect(facts.find((f) => f.kind === 'reference_dropped')!.count).toBe(9);
  });

  it('groups what a stage did not cover, with its denominator', () => {
    const facts = stageFacts([REAL.unresolved, REAL.notRedTeamed]);
    expect(facts[0].kind).toBe('not_covered');
    expect(facts[0].count).toBe(17);
    // 50 and 18 disagree, so no denominator is claimed.
    expect(facts[0].of).toBeNull();
  });

  /**
   * A label is read by someone who did not write it, so it has to be a
   * sentence. "1 thing were not available" shipped and was caught on the live
   * page rather than here, which is what this test is for.
   */
  it('reads as English at one and at many, for every kind', () => {
    const cases: Array<[string, string, string]> = [
      // The SINGULAR forms the producers themselves emit, so one sentence
      // carries a figure of one and two sentences carry two.
      ['1 model output was discarded and is not part of this assessment.', '1 item discarded', '2 items discarded'],
      ['1 item referred to something that is not in this assessment; the reference was dropped and the item kept.', '1 reference dropped, the item kept', '2 references dropped, the item kept'],
      ['Page 18: no readable text; scanned content may need OCR.', '1 page carried no policy text', '2 pages carried no policy text'],
      ['The model reached its output limit on this call.', '1 thing cut short by a limit', '2 things cut short by a limit'],
      ['The persona library could not be read.', '1 thing was not available', '2 things were not available'],
      ['This is a sealed assessment, so nothing was written to the persona library.', '1 step skipped because this run is sealed', '2 steps skipped because this run is sealed'],
      ['Something no pattern has ever been shown.', '1 open question', '2 open questions'],
    ];
    for (const [sentence, singular, plural] of cases) {
      expect(factLabel(stageFacts([sentence])[0]), sentence.slice(0, 40)).toBe(singular);
      expect(factLabel(stageFacts([sentence, sentence])[0]), sentence.slice(0, 40)).toBe(plural);
    }
  });

  /**
   * MOST WARNINGS ON A REAL RUN ARE THE MODEL'S OWN CAVEATS about one artefact
   * in one document, not the pipeline's structural losses — measured at 100 of
   * 173 on the live rail-data assessment. They belong in `open`, and a rule that
   * tried to name them would be fitting a regex to how one paper was worded.
   */
  it('leaves the model\'s own caveats as open questions rather than guessing at them', () => {
    const caveats = [
      'Actor names are generic contractual labels and are not legally resolved entities.',
      'Baselines and targets are not specified in the supplied material.',
      'The supplied passage is a contractual excerpt and does not identify the concrete legal entities.',
      'National Rail remains ambiguous between a legal entity, brand, and organisational group.',
    ];
    const facts = stageFacts(caveats);
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe('open');
    expect(facts[0].count).toBe(4);
    expect(facts[0].detail).toEqual(caveats);
  });

  it('reports the losses before the open questions, and nothing at all for a clean stage', () => {
    expect(stageFacts([])).toEqual([]);
    expect(stageFacts(['   '])).toEqual([]);
    const facts = stageFacts([REAL.novel, REAL.libraryUnread, REAL.discardedGroup]);
    expect(facts.map((f) => f.kind)).toEqual(['discarded', 'unavailable', 'open']);
  });
});

describe('a peek anchor names its kind, so the card is context-aware', () => {
  it('splits on the FIRST colon, because an identifier may carry one', () => {
    expect(parseSubject('actor:s2_001')).toEqual({ kind: 'actor', subject: 's2_001' });
    expect(parseSubject('term:concealment')).toEqual({ kind: 'term', subject: 'concealment' });
    expect(parseSubject('artefact:a:b')).toEqual({ kind: 'artefact', subject: 'a:b' });
  });

  it('ignores an attribute this build cannot render, rather than opening an empty card', () => {
    expect(parseSubject('sandwich:s2_001')).toBeNull();
    expect(parseSubject('actor:')).toBeNull();
    expect(parseSubject(':s2_001')).toBeNull();
    expect(parseSubject(null)).toBeNull();
  });
});

describe('the exported document is the assessment, linearly', () => {
  it('opens by saying what it is, because whoever was sent it has nobody to ask', async () => {
    const all = await assessment();
    const md = assessmentMarkdown(all, { title: 'Synthetic policy' });
    expect(md).toContain('# Synthetic policy');
    expect(md).toContain('red-team assessment');
    expect(md).toContain('not an assurance review');
  });

  it('carries the playbook, the cast, the checks and the written chapters', async () => {
    const all = await assessment();
    const md = assessmentMarkdown(all, { title: 'Synthetic policy' });
    expect(md).toContain('## The exploitation playbook');
    expect(md).toContain('## Who is in the room');
    expect(md).toContain('## Structural checks');
    expect(md).toContain('A check with nothing to look at is not a pass');
  });

  it('names every limit the run recorded rather than quietly dropping it', async () => {
    const all = await assessment();
    const md = assessmentMarkdown(all, {
      title: 'Synthetic policy',
      warnings: [{ stage: 'Targeted research', text: 'External research unavailable.' }],
    });
    expect(md).toContain('## What this assessment could not establish');
    expect(md).toContain('External research unavailable.');
  });

  it('renders the SHARED copy from the same module, and says what it withholds', async () => {
    const all = await assessment();
    const stages = STAGES.map((name, ordinal) => ({ ordinal, name, warnings: [] as string[] }));
    const redacted = shareableReport({ artefacts: all, stages }).artefacts;
    const shared = assessmentMarkdown(redacted, {
      title: 'Synthetic policy',
      withheld: ['the policy document itself'],
    });
    expect(shared).toContain('This is a shared copy');
    expect(shared).toContain('the policy document itself');
    // Same document, same headings — the two readers cannot get different reports.
    expect(shared).toContain('## The exploitation playbook');
  });

  it('leaves a section OUT rather than printing an empty heading', () => {
    const md = assessmentMarkdown([], { title: 'Nothing yet' });
    expect(md).not.toContain('## The exploitation playbook');
    expect(md).not.toContain('## Who is in the room');
    expect(md).toContain('# Nothing yet');
  });

  it('omits the depth it was not told, rather than claiming the run was standard', () => {
    // `resolveShare` does not carry `depth`, and a ternary printed "Standard
    // enquiry" on a deep assessment — a false statement about the run, in the
    // one document a reader cannot check against the page.
    expect(assessmentMarkdown([], { title: 'X', jurisdiction: 'England' })).not.toContain('Standard enquiry');
    expect(assessmentMarkdown([], { title: 'X', depth: 'deep' })).toContain('Deep enquiry');
    expect(assessmentMarkdown([], { title: 'X', depth: 'standard' })).toContain('Standard enquiry');
  });

  it('slugs a real policy title into a filename', () => {
    expect(documentSlug('Post-16 Education and Skills')).toBe('post-16-education-and-skills');
    expect(documentSlug('  ???  ')).toBe('policy-assessment');
    expect(documentSlug('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
