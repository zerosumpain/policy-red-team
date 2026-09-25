import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { changeStrips, isBlank, isUnspecified, programmeStrip, stepNamed, stripOf } from './change-strip';

const base = (id: string, kind: Artefact['kind'], data: Record<string, unknown> = {}, refs: string[] = []): Artefact => ({
  id, kind, label: `${id} title`, statement: '', origin: 'structural_inference', confidence: null, refs,
  sourceId: null, sourceQuote: null, page: null, section: null, startOffset: null, endOffset: null, url: null,
  fromId: null, toId: null, relation: null, temporal: null, data,
});

// Wording from the Post-16 run's chains.
const stated = {
  inputs: ['Skills-needs analysis and priority-occupation information from Skills England'],
  activities: ['Skills England identifies priority occupations and maps relevant courses'],
  outputs: ['Priority occupations and mapped courses are identified and reported.'],
  outcomes: ['A larger pool of learners obtains skills relevant to identified occupations.'],
  impacts: ['Reduced skills-shortage vacancies and improved labour-market matching.'],
};

describe('isUnspecified', () => {
  it('recognises the ways a chain says it does not know', () => {
    expect(isUnspecified('Parliamentary scrutiny; not specified in the supplied evidence')).toBe(true);
    expect(isUnspecified('Provider-level information; the policy does not specify the measure')).toBe(true);
    expect(isUnspecified('Reduced vacancies; no baseline, target or timing')).toBe(true);
    expect(isUnspecified('Priority occupations are identified and reported.')).toBe(false);
  });

  it('tells a blank entry from one that states something and leaves a detail open', () => {
    expect(isBlank('Not specified')).toBe(true);
    expect(isBlank('Implementation arrangements, responsible actor, timetable, funding and monitoring measures: not specified.')).toBe(true);
    expect(isBlank('Flexible student loans for disadvantaged students; amounts and eligibility rules are not specified.')).toBe(false);
  });
});

describe('stripOf', () => {
  it('gives a fully stated chain no weakest link', () => {
    const { steps, weakest } = stripOf(base('c', 'causal_chain', stated));
    expect(steps.map((s) => s.state)).toEqual(['stated', 'stated', 'stated', 'stated', 'stated']);
    expect(weakest).toBeNull();
  });

  it('marks the first missing step, whether empty or blank', () => {
    const { steps, weakest } = stripOf(base('c', 'causal_chain', {
      ...stated,
      outputs: ['Not specified'],
      impacts: [],
    }));
    expect(steps[2].state).toBe('missing');
    expect(steps[4].state).toBe('missing');
    expect(weakest).toBe(2);
  });

  it('otherwise marks the step with the largest share of hedged entries', () => {
    const { steps, weakest } = stripOf(base('c', 'causal_chain', {
      ...stated,
      outcomes: ['Completion may increase', 'Learners obtain skills'],
      impacts: ['Potential contribution to growth', 'Improvement if providers respond', 'Better matching'],
    }));
    expect(steps[3].state).toBe('hedged');
    expect(steps[4].state).toBe('hedged');
    expect(weakest).toBe(4);
  });

  it('calls a step that states things but leaves their detail open a step with gaps, not a missing one', () => {
    const { steps, weakest } = stripOf(base('c', 'causal_chain', {
      ...stated,
      inputs: ['Student loans; amounts and eligibility are not specified.', 'Funding commitment; allocation rules are not specified.'],
    }));
    expect(steps[0].state).toBe('gaps');
    expect(steps[0].unspecified).toBe(2);
    expect(weakest).toBe(0);
  });
});

describe('changeStrips', () => {
  const mechA = base('s1_mechanism_a', 'mechanism');
  const mechB = base('s1_mechanism_b', 'mechanism');
  const assumption = base('s14_assumption_001', 'assumption');
  const own = base('s14_000_causal_chain_001', 'causal_chain', { ...stated, mechanismId: mechA.id, assumptions: [assumption.id] }, [mechA.id]);
  const other = base('s14_001_causal_chain_001', 'causal_chain', { ...stated, mechanismId: mechB.id, assumptions: [] }, [mechA.id, mechB.id]);
  const stubbed = base('s14_002_causal_chain_001', 'causal_chain', { assumptions: [] }, [base('s1_mechanism_c', 'mechanism').id]);
  const artefacts = [mechA, mechB, assumption, own, other, stubbed, base('s1_mechanism_c', 'mechanism')];
  const ids = new Set([mechA.id, mechB.id, 's1_mechanism_c']);

  it('draws each mechanism\'s own chain, in the order it was given, up to k', () => {
    const strips = changeStrips(artefacts, [{ id: mechB.id, plays: 5 }, { id: mechA.id, plays: 3 }], ids, 2);
    expect(strips.map((s) => [s.mechanism.id, s.chain.id, s.plays])).toEqual([
      [mechB.id, other.id, 5],
      [mechA.id, own.id, 3],
    ]);
    expect(strips[1].assumptions.map((a) => a.id)).toEqual([assumption.id]);
  });

  it('skips a mechanism whose chains carry no steps', () => {
    expect(changeStrips(artefacts, [{ id: 's1_mechanism_c', plays: 9 }], ids)).toEqual([]);
  });
});

describe('the assessment\'s own weakest link, and the programme (stage 14, prompt 3.2)', () => {
  it('finds the step a written weakest link names, and only when it names one', () => {
    expect(stepNamed('The outcomes step: nothing measures whether learners progress.')).toBe(3);
    expect(stepNamed('What goes in: the budget is not set.')).toBe(0);
    expect(stepNamed('The jump from outputs to outcomes rests on employers joining.')).toBeNull();
    expect(stepNamed('Employers may not join.')).toBeNull();
  });

  it('draws the programme logic model as one more strip of the same shape', () => {
    const assumption = base('s1_assumption_a', 'assumption');
    const model = base('s14_000_logic_model_001', 'logic_model', { ...stated, assumptions: [assumption.id], mechanismIds: ['m'], weakestLink: 'Impacts: no baseline for vacancies.' });
    const strip = programmeStrip([assumption, model]);
    expect(strip?.model.id).toBe(model.id);
    expect(strip?.steps.map((s) => s.key)).toEqual(['inputs', 'activities', 'outputs', 'outcomes', 'impacts']);
    expect(strip?.stated).toBe('Impacts: no baseline for vacancies.');
    expect(strip?.statedStep).toBe(4);
    expect(strip?.assumptions.map((a) => a.id)).toEqual([assumption.id]);
    expect(programmeStrip([assumption])).toBeNull();
  });
});
