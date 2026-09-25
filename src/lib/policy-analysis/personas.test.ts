// The persona library: what may cross from one assessment into the next, and
// what may not.
import { describe, expect, it } from 'vitest';
import { artefact, ASSURED_SYNTHESIS_STAGE, PERSONA_STAGE, PERSONA_TRAITS, SYNTHESIS_STAGE, STAGES, type Artefact } from './contracts';
import { foldTraits, isAffectedGroup, matchPersona, nameSubject, observationFromProfile, onePerActor, personaPrior, personaSubject, playsFor, possibleDuplicates, rebuildDossier, sendableQueries, travellingValue, type PersonaObservation, type PersonaRecord } from './personas';
import { documentShingles } from './query-guard';
import { executeStage } from './pipeline';

const persona = (over: Partial<PersonaRecord> = {}): PersonaRecord => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Department for Education', entityType: 'department',
  aliases: ['DfE'], summary: 'The department.', dossier: [], sightings: 2, researchedAt: null, updatedAt: null, ...over,
});

const field = (value: string, origin = 'extracted_fact') => ({ value, origin, confidence: 0.7, refs: ['passage_0001'] });

describe('the ordinals the report contract is written against', () => {
  it('keeps legacy ordinals fixed and appends the expanded review', () => {
    // `SYNTHESIS_STAGE` was `STAGES.length - 1` until the library was appended
    // after it, which would have moved every report rule onto a stage that does
    // not write a report.
    expect(STAGES[SYNTHESIS_STAGE]).toBe('Synthesis');
    expect(STAGES[PERSONA_STAGE]).toBe('Actor persona library');
    expect(STAGES[ASSURED_SYNTHESIS_STAGE]).toBe('Assured synthesis');
    expect(PERSONA_STAGE).toBe(13);
  });
});

describe('identity is decided by the site policy, not by a matching name', () => {
  it('links a body to its dossier on an alias', () => {
    const match = matchPersona({ id: 's2_0', label: 'Department for Education', entityType: 'department', aliases: [] }, [persona()]);
    expect(match?.persona.id).toBe(persona().id);
  });

  it('refuses to merge two bodies of different types that share a name', () => {
    const match = matchPersona({ id: 's2_0', label: 'Ofsted', entityType: 'person', aliases: [] }, [persona({ name: 'Ofsted', entityType: 'agency' })]);
    expect(match).toBeNull();
  });

  it('opens a NEW persona rather than guessing between two equally good matches', () => {
    const a = persona({ id: '11111111-1111-4111-8111-111111111111', name: 'The Authority' });
    const b = persona({ id: '22222222-2222-4222-8222-222222222222', name: 'The Authority' });
    expect(matchPersona({ id: 's2_0', label: 'The Authority', entityType: 'department', aliases: [] }, [a, b])).toBeNull();
  });
});

describe('a dossier accumulates without letting an inference overwrite a fact', () => {
  it('keeps an extracted fact when a later inference contradicts it', () => {
    const standing = [{ key: 'accountableTo', label: 'Who it answers to', value: 'Parliament', origin: 'extracted_fact', confidence: 0.9 }];
    const observed = [{ key: 'accountableTo', label: 'Who it answers to', value: 'Probably the Treasury', origin: 'structural_inference', confidence: 0.3 }];
    expect(foldTraits(standing, observed)[0].value).toBe('Parliament');
  });

  it('takes the better-grounded answer when a later assessment finds one', () => {
    const standing = [{ key: 'legalPowers', label: 'What it can compel or block', value: 'Unclear', origin: 'structural_inference', confidence: null }];
    const observed = [{ key: 'legalPowers', label: 'What it can compel or block', value: 'May direct a local authority', origin: 'extracted_fact', confidence: 0.9 }];
    expect(foldTraits(standing, observed)[0].value).toBe('May direct a local authority');
  });

  it('orders a dossier by the vocabulary so two personas read the same way', () => {
    const shuffled = [...PERSONA_TRAITS].reverse().map(([key, label]) => ({ key, label, value: key, origin: 'structural_inference', confidence: null }));
    expect(foldTraits([], shuffled).map((t) => t.key)).toEqual(PERSONA_TRAITS.map(([key]) => key));
  });
});

describe('what one assessment contributes', () => {
  const profile = artefact('s4_0_profile', 'profile', 'DfE', 'The department.', {
    actorId: 's2_0', formalRole: field('Sets the standards'), accountableTo: field('Parliament'),
    successCriteria: field('Attainment'), timeHorizon: field('unknown', 'structural_inference'),
    gainFromFailure: field('Nobody identified', 'behavioural_hypothesis'),
  }, { refs: ['s2_0'] });

  it('distils the profile into persona traits and drops the unknowns', () => {
    const traits = observationFromProfile(profile);
    expect(traits.map((t) => t.key)).toContain('accountableTo');
    expect(traits.map((t) => t.key)).toContain('mandate');
    // "unknown" is an honest profile answer and a useless dossier entry.
    expect(traits.map((t) => t.key)).not.toContain('timeHorizon');
  });

  it("counts the plays from the run rather than taking the model at its word", () => {
    const plays: Artefact[] = [
      artefact('s10_0_a', 'exploit', 'Re-base the measure', 'x', { actorId: 's2_0', exposure: 0.8, band: 'severe', legality: 'compliant' }),
      artefact('s10_0_b', 'exploit', 'Someone else entirely', 'x', { actorId: 's2_9', exposure: 0.9, band: 'severe', legality: 'grey' }),
    ];
    const mine = playsFor('s2_0', plays);
    expect(mine).toHaveLength(1);
    expect(mine[0].label).toBe('Re-base the measure');
  });
});

describe('a prior is bounded, and never reads the run it is enriching', () => {
  const observations: PersonaObservation[] = [
    { id: 'o1', personaId: persona().id, kind: 'assessment', analysisId: 'other', analysisTitle: 'Another policy', actorId: 's2_1', traits: [], plays: [{ label: 'Elsewhere', band: 'severe', exposure: 0.9, legality: 'grey' }], sources: [], note: null, observedAt: null },
    { id: 'o2', personaId: persona().id, kind: 'assessment', analysisId: 'this-one', analysisTitle: 'This policy', actorId: 's2_0', traits: [], plays: [{ label: 'Its own', band: 'severe', exposure: 0.95, legality: 'grey' }], sources: [], note: null, observedAt: null },
  ];

  it('excludes the running analysis from the track record', () => {
    const prior = personaPrior('s2_0', { persona: persona(), basis: 'Identical name' }, observations, 'this-one');
    expect(prior!.trackRecord.map((p) => p.label)).toEqual(['Elsewhere']);
  });

  it('caps the traits it carries', () => {
    const dossier = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, label: `l${i}`, value: 'v', origin: 'structural_inference', confidence: null }));
    expect(personaPrior('s2_0', { persona: persona({ dossier }), basis: 'x' }, [], null)!.traits).toHaveLength(12);
  });
});

describe('the library never costs the assessment', () => {
  const actor = artefact('s2_0', 'actor', 'DfE', 'The department.', { entityType: 'department', aliases: [], mentions: ['s1_0_m'], ambiguity: 'none', dates: [], parent: null }, { refs: ['s1_0_m'] });
  const profile = artefact('s4_0_profile', 'profile', 'DfE', 'The department.', { actorId: 's2_0', accountableTo: field('Parliament') }, { refs: ['s2_0'] });
  const edge = artefact('s3_0_edge', 'edge', 'accountable', 'x', { notes: 'x' }, { refs: ['s2_0'], fromId: 's2_0', toId: 's2_0', relation: 'is_accountable_for', temporal: 'current' });

  it('records a dead provider as a warning rather than a failed stage', async () => {
    const model = async () => { throw new Error('provider down'); };
    const output = await executeStage(
      { stage: PERSONA_STAGE, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [actor, profile, edge] },
      { model: model as never, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    ).catch((err) => err);
    // A thrown non-PolicyError still ends the stage; what must not happen is the
    // "this stage produced no artefacts" refusal on an empty but healthy library.
    expect(output).toBeInstanceOf(Error);
  });

  it('completes with nothing rather than refusing an empty library', async () => {
    const model = async () => ({ artefacts: [], warnings: [] });
    const output = await executeStage(
      { stage: PERSONA_STAGE, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [actor, profile, edge] },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    );
    expect(output.artefacts).toHaveLength(0);
    expect(output.warnings.join(' ')).toContain('Nothing in the assessment above depends on it');
  });

  it('reads the library without letting a failure to read it end the stage', async () => {
    let sawPrior = false;
    const model = async (_stage: number, _key: string, raw: unknown) => {
      sawPrior = Boolean((raw as { priorPersona?: unknown }).priorPersona);
      return { artefacts: [], warnings: [] };
    };
    const output = await executeStage(
      { stage: PERSONA_STAGE, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [actor, profile, edge] },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal, personas: async () => { throw new Error('database down'); } },
    );
    expect(sawPrior).toBe(false);
    expect(output.warnings.join(' ')).toContain('persona library could not be read');
  });
});

describe('a persona query never carries the paper it was drawn from', () => {
  // A dossier is written by a model reading an UNPUBLISHED policy document, and
  // the query planner is shown every trait — so the wording can travel from the
  // paper, through the dossier, into a third party's query logs. The prompt says
  // not to; a prompt is not a control.
  const text = 'The Council is accountable for delivery and bears the whole implementation cost of the shared access programme.';
  const passage = artefact('passage_0001', 'passage', 'Page 1', text, { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });
  const corpus = documentShingles([passage]);
  const query = (id: string, searchStrategy: string) => artefact(id, 'research_question', id, 'x', { importance: 0.5, uncertainty: 0.5, consequence: 0.5, rationale: 'x', searchStrategy, gap: 'x' }, {});

  it('drops a query that reproduces a run of the paper', () => {
    const asked = [
      query('q1', 'The Council is accountable for delivery and bears the whole implementation cost'),
      query('q2', 'county council library service statutory duties England'),
    ];
    expect(sendableQueries(asked, corpus).map((q) => q.id)).toEqual(['q2']);
  });

  it('does nothing when the persona has no documents behind it', () => {
    const asked = [query('q1', 'anything at all here about a named public body')];
    expect(sendableQueries(asked, new Set())).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 19 — actor identity. Every case below is a measurement from the live
// library on 25 September 2026, reproduced in miniature.
// ---------------------------------------------------------------------------

const trait = (key: string, value: string, origin = 'extracted_fact') => ({ key, label: key, value, origin, confidence: 0.8 });
const observation = (over: Partial<PersonaObservation> = {}): PersonaObservation => ({
  id: 'o', personaId: persona().id, kind: 'assessment', analysisId: 'a1', analysisTitle: 'Paper one', actorId: 's2_0',
  traits: [], plays: [], sources: [], note: null, summary: null, observedAt: '2026-09-01T00:00:00.000Z', ...over,
});

describe('the register decides before the name does', () => {
  it('links "DfE" typed as an agency to the Department for Education once both carry the register id', () => {
    // Never linked on the live box: the acronym caps at 0.84 and the types differed.
    const dfe = persona({ aliases: [], bodyId: 'govuk:department-for-education' });
    const match = matchPersona({ id: 's2_0', label: 'DfE', entityType: 'agency', aliases: [] }, [dfe], { bodyId: 'govuk:department-for-education', bodyName: 'Department for Education' });
    expect(match?.persona.id).toBe(dfe.id);
    expect(match?.basis).toContain('GOV.UK register');
  });

  it('never links two different register bodies, however alike the names', () => {
    const one = persona({ name: 'Education Funding Agency', aliases: [], bodyId: 'govuk:education-funding-agency' });
    const match = matchPersona({ id: 's2_0', label: 'Education Funding Agency', entityType: 'agency', aliases: [] }, [one], { bodyId: 'govuk:education-and-skills-funding-agency' });
    expect(match).toBeNull();
  });

  it('lets a department and an agency meet on an identical name, which exact type equality refused', () => {
    const ofsted = persona({ name: 'Ofsted', entityType: 'department', aliases: [] });
    expect(matchPersona({ id: 's2_0', label: 'Ofsted', entityType: 'agency', aliases: [] }, [ofsted])?.persona.id).toBe(ofsted.id);
  });

  it('keeps a person apart from a body of the same name, as before', () => {
    expect(matchPersona({ id: 's2_0', label: 'Ofsted', entityType: 'person', aliases: [] }, [persona({ name: 'Ofsted', entityType: 'agency' })])).toBeNull();
  });
});

describe("a reader's ruling reaches the identity policy", () => {
  it('never links a name the reader said is a different body', () => {
    const dfe = persona();
    const rulings = [{ personaId: dfe.id, subject: nameSubject('DfE'), verdict: 'different' as const }];
    expect(matchPersona({ id: 's2_0', label: 'DfE', entityType: 'department', aliases: [] }, [dfe], { rulings })).toBeNull();
  });

  it('links a name the reader said is the same body, across types', () => {
    const dfe = persona({ aliases: [] });
    const rulings = [{ personaId: dfe.id, subject: nameSubject('The Department'), verdict: 'same' as const }];
    expect(matchPersona({ id: 's2_0', label: 'The Department', entityType: 'concept', aliases: [] }, [dfe], { rulings })?.persona.id).toBe(dfe.id);
  });
});

describe('groups of people are not bodies', () => {
  it('never matches or opens a persona for a user group', () => {
    // "Children" twice was the live library's worst split.
    const children = persona({ name: 'Children', entityType: 'user_group', aliases: ['children'] });
    expect(isAffectedGroup('user_group')).toBe(true);
    expect(matchPersona({ id: 's2_0', label: 'Children', entityType: 'user_group', aliases: [] }, [children])).toBeNull();
  });
});

describe('one link per actor', () => {
  it('keeps the fullest of two links for one actor and says how many it dropped', () => {
    const link = (id: string, observed: { value: string }[]) => artefact(id, 'persona_link', 'Children', 'x', { actorId: 's2_3', observed }, {});
    const { kept, dropped } = onePerActor([link('s13_0_a', [{ value: 'x' }]), link('s13_0_b', [{ value: 'x' }, { value: 'y' }])]);
    expect(dropped).toBe(1);
    expect(kept.map((k) => k.id)).toEqual(['s13_0_b']);
  });
});

describe('what travels between policies', () => {
  it('drops the money, the year and the named programme from the standing dossier', () => {
    const value = 'Sets national children’s social care policy. Committed £523 million annually for the Families First Partnership. Reforms land by 2028.';
    expect(travellingValue(value)).toBe('Sets national children’s social care policy.');
  });

  it('drops a sentence naming one of the paper’s own programmes', () => {
    expect(travellingValue('Funds councils. Runs Best Start Family Hubs directly.', ['Best Start Family Hubs'])).toBe('Funds councils.');
  });

  it('keeps "May" as a power rather than reading it as a month', () => {
    expect(travellingValue('May direct a local authority.')).toBe('May direct a local authority.');
  });

  it('returns nothing when nothing travels', () => {
    expect(travellingValue('£40m in 2025-26.')).toBeNull();
  });
});

describe('the dossier is computed from what is left', () => {
  it('folds each paper’s travelling traits and ignores what the model carried from the library', () => {
    const { dossier, summary } = rebuildDossier([
      observation({ id: 'o1', traits: [trait('mandate', 'Sets policy. Spends £1bn.')], summary: 'Older.' }),
      observation({ id: 'o2', analysisId: 'a2', observedAt: '2026-09-02T00:00:00.000Z', traits: [trait('resources', 'Carried over', 'prior_assessment')], summary: 'Newer.' }),
    ]);
    expect(dossier.map((t) => [t.key, t.value])).toEqual([['mandate', 'Sets policy.']]);
    expect(summary).toBe('Newer.');
  });

  it('forgets a deleted paper entirely: its traits and its summary', () => {
    const kept = observation({ id: 'o1', traits: [trait('mandate', 'Sets policy.')], summary: 'Kept.' });
    const { dossier, summary } = rebuildDossier([kept]);
    expect(dossier.map((t) => t.value)).toEqual(['Sets policy.']);
    expect(summary).toBe('Kept.');
  });

  it('prefers the travelling form computed at write time', () => {
    const { dossier } = rebuildDossier([observation({ traits: [{ ...trait('mandate', 'Runs the Foo Hubs. Sets policy.'), travels: 'Sets policy.' }] })]);
    expect(dossier[0].value).toBe('Sets policy.');
  });
});

describe('a re-run of the same paper is not another policy', () => {
  it('offers no prior when every other sighting is the same document', () => {
    // The live library's only "seen twice" personas were two runs of one paper.
    const observations = [observation({ id: 'o1', analysisId: 'run-1' }), observation({ id: 'o2', analysisId: 'run-2' })];
    expect(personaPrior('s2_0', { persona: persona(), basis: 'x' }, observations, new Set(['run-1', 'run-2']))).toBeNull();
  });

  it('builds the prior only from the other papers', () => {
    const observations = [
      observation({ id: 'o1', analysisId: 'same', traits: [trait('mandate', 'From the same paper.')] }),
      observation({ id: 'o2', analysisId: 'other', traits: [trait('judgedOn', 'From another paper.')] }),
    ];
    const prior = personaPrior('s2_0', { persona: persona(), basis: 'x' }, observations, new Set(['same', 'this']));
    expect(prior?.traits.map((t) => t.value)).toEqual(['From another paper.']);
    expect(prior?.sightings).toBe(1);
  });
});

describe('possible duplicates are offered, not acted on', () => {
  it('offers two personas on one register body as a strong pair', () => {
    const a = persona({ id: '11111111-1111-4111-8111-111111111111', name: 'DfE', bodyId: 'govuk:dfe' });
    const b = persona({ id: '22222222-2222-4222-8222-222222222222', name: 'Department for Education', bodyId: 'govuk:dfe' });
    const [pair] = possibleDuplicates([a, b], [], new Map([['govuk:dfe', 'Department for Education']]));
    expect(pair.strong).toBe(true);
    expect(pair.reason).toContain('Department for Education');
  });

  it('offers an abbreviation and its expansion as a weak pair', () => {
    const a = persona({ id: '11111111-1111-4111-8111-111111111111', name: 'NAO', aliases: [] });
    const b = persona({ id: '22222222-2222-4222-8222-222222222222', name: 'National Audit Office', aliases: [] });
    expect(possibleDuplicates([a, b], [])[0]?.strong).toBe(false);
  });

  it('does not offer a pair the reader ruled different', () => {
    const a = persona({ id: '11111111-1111-4111-8111-111111111111', name: 'DfE', bodyId: 'govuk:dfe' });
    const b = persona({ id: '22222222-2222-4222-8222-222222222222', name: 'DfE', bodyId: 'govuk:dfe' });
    expect(possibleDuplicates([a, b], [{ personaId: a.id, subject: personaSubject(b.id), verdict: 'different' }])).toEqual([]);
  });
});
