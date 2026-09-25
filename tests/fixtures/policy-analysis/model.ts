// Synthetic provider responses used only by automated tests. Not a runtime fallback.
import { artefact, ASSURANCE_CATEGORIES, isPassStage, passOf, passStep, PATTERNS, SCENARIOS, PROFILE_FIELDS, REPORT_SECTIONS, SHORT_PROFILE_FIELDS, type Artefact, type StageInput, type StageOutput } from '../../../src/lib/policy-analysis/contracts';
export function fixtureModel(stage: number, _key: string, raw: unknown): StageOutput {
  const input = raw as StageInput & { idPrefix: string; targetActorId?: string | null; targetActorIds?: string[]; targetPattern?: string; targetScenario?: string; targetMechanismId?: string; targetCategory?: string };
  const prefix = input.idPrefix;
  const one = (kind: Artefact['kind']) => input.artefacts.find((a) => a.kind === kind && (kind !== 'actor' || stage < 3 || a.id.startsWith('s2_')))!;
  const make = (id: string, kind: Artefact['kind'], data: Record<string, unknown>, refs: string[], statement = 'Synthetic fixture assessment; not a real policy conclusion.') => artefact(`${prefix}${id}`, kind, `Synthetic ${kind} ${id}`, statement, data, { refs, confidence: 0.5 });
  let items: Artefact[] = [];
  /**
   * A PASS. Keyed on the step within the block rather than on the ordinal, so
   * the same fixture serves pass 1, pass 2 and pass 7.
   *
   * Step 0 of an addendum never reaches a model — it is `ingest()` — so a step 0
   * that arrives here can only be a restatement, which is what distinguishes the
   * two kinds without the fixture being told which it is.
   */
  if (isPassStage(stage)) {
    const pass = passOf(stage);
    const step = passStep(stage);
    const materialPassage = input.artefacts.find((a) => a.kind === 'passage' && a.id.startsWith(`m${pass}_`));
    if (step === 1 && materialPassage) {
      const common = { refs: [materialPassage.id], origin: 'extracted_fact' as const, sourceId: materialPassage.id, sourceQuote: materialPassage.statement.slice(0, 40) };
      items = [
        { ...make('claim', 'claim', { category: 'claim', notes: 'A claim the attached material makes.' }, [materialPassage.id]), ...common },
        { ...make('mech', 'mechanism', { intervention: 'A change the material proposes', implementation: 'Unspecified', notes: 'From the material.' }, [materialPassage.id]), ...common },
        make('assumption', 'assumption', { importance: 0.8, uncertainty: 0.8, consequence: 0.8, notes: 'The material assumes this.' }, [materialPassage.id, `${prefix}mech`]),
      ];
    } else if (step === 2) {
      const claim = input.artefacts.find((a) => a.kind === 'claim' && !a.id.startsWith(`s${pass * 100 + 1}_`));
      const materialClaim = input.artefacts.find((a) => a.kind === 'claim' && a.id.startsWith(`s${pass * 100 + 1}_`));
      if (claim && materialPassage) {
        items = [
          make('evidence', 'evidence', { claimId: claim.id, mechanismId: null, actorId: null, assumptionId: null, sourceId: materialPassage.id, evidenceType: 'attached material', result: 'contradicts', sourceQuality: 'A document the reader attached.', relevance: 'Direct', freshness: 'Later than the paper', dispute: 'The material disputes the claim.' }, [claim.id, materialPassage.id]),
          make('reconcile', 'reconciliation', { targetId: claim.id, targetKind: 'claim', relation: 'contradicts', basis: 'The material states the opposite.', significance: 0.8, notes: 'Synthetic reconciliation.' }, [claim.id, ...(materialClaim ? [materialClaim.id] : []), materialPassage.id]),
        ];
      }
    } else if (step === 3) {
      const finding = input.artefacts.find((a) => a.kind === 'finding');
      const basis = input.artefacts.find((a) => a.kind === 'reconciliation' && a.id.startsWith(`s${pass * 100 + 2}_`));
      if (finding && basis) {
        items = [
          make('revision', 'revision', { targetId: finding.id, targetKind: 'finding', status: 'weakened', reason: 'The attached material disputes the claim this rests on.', reconciliationIds: [basis.id], residualRisk: 'The underlying exposure is unchanged.', actionNeeded: 'Re-check the claim against the material.' }, [finding.id, basis.id]),
          // Counts are deliberately WRONG here and left for the server to
          // recompute, which is what the test asserts.
          make('summary', 'addendum_summary', { pass, role: 'critique', materialSummary: 'A synthetic critique of the policy.', upheld: 99, weakened: 99, newIssues: ['A question the assessment does not cover.'], judgement: 'provisional', limitations: ['Reading material cannot replace a fresh assessment.'] }, [finding.id, basis.id]),
        ];
      }
    } else if (step === 0) {
      // A RESTATEMENT: the assured-synthesis shape, over an inventory that now
      // holds the addenda. Ids land in the pass namespace, which is what makes
      // it a replacement rather than a duplicate.
      const initial = input.artefacts.filter((a) => a.kind === 'finding' && a.data.revision === 'assured');
      const challenges = input.artefacts.filter((a) => a.kind === 'assurance_challenge');
      const result = one('test');
      const assumption = one('assumption');
      items = REPORT_SECTIONS.map((section) => make(section, 'finding', {
        section, resultIds: [result.id], hypothesisIds: [assumption.id], revision: 'assured', reviewedFindingIds: initial.length ? [initial[0].id] : [], challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits',
      }, [result.id, assumption.id, ...(initial.length ? [initial[0].id] : []), ...challenges.map((c) => c.id)]));
      items.push(...challenges.map((challenge, i) => make(`response_${i}`, 'assurance_response', {
        challengeId: challenge.id, disposition: 'accepted', response: 'Restated after the material was read.', changes: 'The conclusion is qualified.', remainingLimit: 'Human review remains outside scope.',
      }, [challenge.id])));
      items.push({ ...make('redesign', 'recommendation', { findingIds: [items[0].id], change: 'Commit resources and review authority.', tradeoffs: 'Additional public expenditure.', beneficiaries: ['Service users'], burdenBearers: ['Department'], validationNeeded: 'Verify capacity.', revision: 'assured', challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits' }, [items[0].id, ...challenges.map((c) => c.id)]), origin: 'normative_judgement' });
      items.push(make('summary', 'review_summary', { decisionUse: 'independently_challenged', judgement: 'supported_with_limits', openChallenges: 0, acceptedChallenges: 0, unresolvedMaterialChallenges: 0, scope: 'Restated after material was attached.', limitations: ['No human sign-off.'] }, challenges.map((c) => c.id)));
    }
  } else if (stage === 1) {
    const p = one('passage');
    const common = { refs: [p.id], origin: 'extracted_fact' as const, sourceId: p.id, sourceQuote: 'The Council is accountable for delivery and bears implementation costs.' };
    items = [
      { ...make('objective', 'claim', { category: 'objective', notes: 'The policy claims this objective; no evaluation is supplied.' }, [p.id]), ...common },
      { ...make('mechanism', 'mechanism', { intervention: 'Shared access programme', implementation: 'Council delivery', notes: 'Funding unspecified' }, [p.id]), ...common },
      make('assumption', 'assumption', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'Sufficient capacity is assumed.' }, [p.id, `${prefix}mechanism`, `${prefix}actor`]),
      { ...make('actor', 'actor', { entityType: 'local_authority', aliases: ['Council'], mentions: [p.id], ambiguity: 'None within this synthetic fixture.', dates: [], parent: null }, [p.id]), ...common, label: 'Council' },
    ];
  } else if (stage === 2) {
    const a = one('actor');
    items = [make('council', 'actor', { ...a.data, mentions: [a.id] }, [a.id])];
  } else if (stage === 3) {
    const a = input.artefacts.find((a) => a.kind === 'actor' && a.id.startsWith('s2_'))!;
    const m = one('mechanism');
    // Edges only: the `node` kind the graph stage used to emit alongside them was
    // rendered by nothing and is retired.
    items = [{ ...make('edge', 'edge', { notes: 'Paper assigns responsibility; authority not documented.' }, [a.id, m.id]), fromId: a.id, toId: m.id, relation: 'is_accountable_for', temporal: 'proposed' }];
  } else if (stage === 4 && input.targetActorIds?.length) {
    // A SHORT call: one five-field profile per listed body, as instruction 4 asks.
    items = input.targetActorIds.map((id, i) => {
      const fields = Object.fromEntries(SHORT_PROFILE_FIELDS.map((f) => [f, { value: 'A short synthetic answer.', origin: 'structural_inference', confidence: null, refs: [id] }]));
      return make(`profile_${i}`, 'profile', { actorId: id, ...fields }, [id]);
    });
  } else if (stage === 4) {
    const a = input.artefacts.find((a) => a.id === input.targetActorId)!;
    const fields = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, { value: 'Documented role or an explicit unknown in this synthetic fixture.', origin: 'structural_inference', confidence: null, refs: [a.id] }]));
    items = [make('profile', 'profile', { actorId: a.id, ...fields }, [a.id])];
  } else if (stage === 5) {
    items = [make('question', 'research_question', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, rationale: 'Capacity changes feasibility.', searchStrategy: 'local authority implementation capacity evaluation', gap: 'Capacity is unverified.' }, [one('assumption').id])];
  } else if (stage === 6) {
    const c = one('claim');
    items = [make('evidence', 'evidence', { claimId: c.id, mechanismId: one('mechanism').id, actorId: one('actor').id, assumptionId: one('assumption').id, sourceId: c.sourceId, evidenceType: 'paper claim', result: 'insufficient', sourceQuality: 'Unverified policy proposal.', relevance: 'Direct', freshness: 'Unknown', dispute: 'No independent evaluation.' }, [c.id, one('assumption').id])];
  } else if (stage === 7) {
    items = PATTERNS.filter((p) => !input.targetPattern || input.targetPattern === p).map((pattern) => make(pattern, 'model', { pattern, players: [one('actor').id], strategies: ['Cooperate', 'Minimum compliance'], decisionOrder: 'Department commissions; Council responds.', information: 'Capacity is uncertain.', costs: 'Implementation effort.', benefits: 'Access improvements.', rewards: 'Unspecified.', sanctions: 'Unspecified.', dependencies: [one('mechanism').id], assumptions: [one('assumption').id], responses: ['Minimum compliance under capacity pressure.'], equilibria: ['Conditional compliance; qualitative hypothesis.'], explanation: 'Cooperation depends on resources and reciprocal incentives.', applicability: 'Synthetic semi-formal example.' }, [one('evidence').id, one('assumption').id, one('mechanism').id]));
  } else if (stage === 9) {
    items = SCENARIOS.filter((s) => !input.targetScenario || input.targetScenario === s).map((scenario) => make(scenario, 'scenario', { scenario, changedConditions: 'Capacity and cooperation vary.', firstActor: one('actor').id, strategy: 'Delay delivery when capacity is low.', downstreamEffects: ['Longer waits.'], affectedOutcomes: [one('claim').id], detectability: 'Monthly reports, subject to gaming.', correction: 'Review resourcing.', weaknesses: ['No assured capacity.'], assumptions: [one('assumption').id], sensitivity: ['If capacity is sufficient, cooperation is feasible; if not, minimum compliance becomes more plausible. Capacity most changes this result.'] }, [one('model').id, one('test').id, one('assumption').id]));
  } else if (stage === 10) {
    const a = input.artefacts.find((x) => x.id === input.targetActorId)!;
    items = [make('exploit', 'exploit', { actorId: a.id, motivation: 'Avoids implementation cost while remaining compliant.', play: 'Report against the measure without changing the unobservable practice.', legality: 'compliant', targets: [one('mechanism').id], preconditions: [one('assumption').id], payoff: 'Retains discretion and avoids cost.', costToPolicy: 'The objective is not delivered while the measure reads well.', incentive: 0.6, ease: 0.6, impact: 0.6, concealment: 0.6, earlyWarning: 'Measure improves while complaints do not fall.', counter: 'Add an independent check of the unobservable practice.', precedent: 'None identified in this synthetic fixture.' }, [one('profile').id, one('mechanism').id, one('assumption').id])];
  } else if (stage === 11) {
    items = [];
  } else if (stage === 13) {
    const a = input.artefacts.find((x) => x.id === input.targetActorId)!;
    const profile = input.artefacts.find((x) => x.kind === 'profile' && x.data.actorId === a.id);
    const prior = (raw as { priorPersona?: { personaId?: string } | null }).priorPersona ?? null;
    const traits = [{ key: 'accountableTo', label: 'Who it answers to', value: 'A documented reporting line in this synthetic fixture.', origin: 'structural_inference', confidence: null }];
    items = [make('persona', 'persona_link', {
      personaId: prior?.personaId ?? null, personaName: a.label, entityType: String(a.data.entityType ?? 'concept'),
      actorId: a.id, aliases: [], summary: 'A synthetic body used only by automated tests.',
      traits, observed: traits, continuity: 'First sighting in this synthetic fixture.', divergence: 'None identified.',
    }, [a.id, ...(profile ? [profile.id] : [])])];
  } else if (stage === 12) {
    const sections = REPORT_SECTIONS.filter((section) => !['theory_of_change', 'options_appraisal', 'evaluation_plan', 'assurance'].includes(section));
    items = sections.map((section) => make(section, 'finding', { section, resultIds: [one('test').id], hypothesisIds: [one('assumption').id], revision: 'initial', reviewedFindingIds: [], challengeIds: [], judgement: 'provisional' }, [one('test').id, one('assumption').id]));
    items.push({ ...make('redesign', 'recommendation', { findingIds: [items[0].id], change: 'Commit resources and review authority.', tradeoffs: 'Additional public expenditure.', beneficiaries: ['Service users'], burdenBearers: ['Department'], validationNeeded: 'Verify capacity and legal powers.', revision: 'initial', challengeIds: [], judgement: 'provisional' }, [items[0].id]), origin: 'normative_judgement' });
  } else if (stage === 14) {
    const mechanism = input.artefacts.find((a) => a.id === input.targetMechanismId) ?? one('mechanism');
    items = [make('chain', 'causal_chain', {
      mechanismId: mechanism.id, inputs: ['Staff time'], activities: ['Deliver shared access'], outputs: ['Access offered'], outcomes: ['Use increases'], impacts: ['Access improves'],
      causalMechanisms: ['Removing the access barrier permits use.'], assumptions: [one('assumption').id], alternativeExplanations: ['Demand may change independently.'],
      negativePathways: ['Capacity pressure may lengthen waits.'], indicators: [{ name: 'Use', baseline: 'Not specified', target: 'Not specified', dataSource: 'Administrative data', timing: 'Monthly' }],
      evidenceLimits: 'No impact evaluation is supplied.', judgement: 'provisional',
    }, [mechanism.id, one('assumption').id])];
  } else if (stage === 15) {
    const chain = one('causal_chain');
    const assumption = one('assumption');
    items = ['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative'].map((optionType) => make(optionType, 'option_appraisal', {
      optionType, description: `Synthetic ${optionType} option.`, objectiveFit: 'Partly specified.', costs: 'Not monetised.', benefits: 'Not monetised.', risks: 'Capacity risk.', distribution: 'Service users may benefit.',
      affordability: 'Not specified.', deliverability: 'Depends on capacity.', reversibility: 'Reviewable.', assumptions: [assumption.id], evidenceLimits: 'No comparative appraisal supplied.', judgement: 'provisional',
    }, [chain.id, assumption.id]));
    items.push(make('evaluation', 'evaluation_plan', {
      processQuestions: ['Was access delivered?'], impactQuestions: ['Did use increase because of the policy?'], valueForMoneyQuestions: ['Were benefits proportionate to costs?'], counterfactual: 'Compare with business as usual.',
      indicators: [{ name: 'Use', type: 'outcome', baseline: 'Not specified', target: 'Not specified', source: 'Administrative data', owner: 'Council', cadence: 'Monthly' }],
      decisionRules: ['Review if use does not improve.'], dataGaps: ['Baseline and costs.'], assumptions: [assumption.id], judgement: 'provisional',
    }, [chain.id, assumption.id]));
  } else if (stage === 16) {
    const category = (input.targetCategory ?? ASSURANCE_CATEGORIES[0]) as (typeof ASSURANCE_CATEGORIES)[number];
    const target = one('finding');
    items = [make('challenge', 'assurance_challenge', {
      category, finding: category === 'citation' ? 'cleared' : 'issue', materiality: category === 'completeness' ? 'high' : 'medium', targetIds: [target.id],
      challenge: `Synthetic ${category} challenge.`, testApplied: 'Trace the conclusion through its cited results to source.', evidence: 'The synthetic report is provisional.', resolutionNeeded: 'Qualify or revise the conclusion.',
    }, [target.id])];
  } else if (stage === 17) {
    const initial = input.artefacts.filter((a) => a.kind === 'finding' && a.data.revision !== 'assured');
    const challenges = input.artefacts.filter((a) => a.kind === 'assurance_challenge');
    const result = one('test');
    const assumption = one('assumption');
    items = REPORT_SECTIONS.map((section) => make(section, 'finding', {
      section, resultIds: [result.id], hypothesisIds: [assumption.id], revision: 'assured', reviewedFindingIds: [initial[0].id], challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits',
    }, [result.id, assumption.id, initial[0].id, ...challenges.map((c) => c.id)]));
    items.push(...challenges.map((challenge, i) => make(`response_${i}`, 'assurance_response', {
      challengeId: challenge.id, disposition: challenge.data.finding === 'issue' ? 'accepted' : 'rejected', response: 'The revised report addresses the challenge.', changes: 'The conclusion is qualified.', remainingLimit: 'Human review remains outside scope.',
    }, [challenge.id])));
    items.push({ ...make('redesign', 'recommendation', { findingIds: [items[0].id], change: 'Commit resources and review authority.', tradeoffs: 'Additional public expenditure.', beneficiaries: ['Service users'], burdenBearers: ['Department'], validationNeeded: 'Verify capacity and legal powers.', revision: 'assured', challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits' }, [items[0].id, ...challenges.map((c) => c.id)]), origin: 'normative_judgement' });
    items.push(make('summary', 'review_summary', { decisionUse: 'independently_challenged', judgement: 'supported_with_limits', openChallenges: 0, acceptedChallenges: 0, unresolvedMaterialChallenges: 0, scope: 'Automated independent challenge.', limitations: ['No human sign-off.'] }, challenges.map((c) => c.id)));
  }
  return { artefacts: items, warnings: [] };
}
