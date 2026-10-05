// Synthetic provider responses used only by automated tests. Not a runtime fallback.
import { artefact, ASSURANCE_CATEGORIES, KEY_JUDGEMENT_FLOOR, MAX_KEY_JUDGEMENTS, isPassStage, passOf, passStep, PATTERNS, SCENARIOS, PROFILE_FIELDS, REPORT_SECTIONS, SHORT_PROFILE_FIELDS, type Artefact, type StageInput, type StageOutput } from '../../../src/lib/policy-analysis/contracts';
export function fixtureModel(stage: number, _key: string, raw: unknown, _options?: { signal?: AbortSignal }): StageOutput {
  const input = raw as StageInput & { idPrefix: string; targetActorId?: string | null; targetActorIds?: string[]; targetPattern?: string; targetScenario?: string; targetMechanismId?: string; targetCategory?: string };
  const prefix = input.idPrefix;
  const one = (kind: Artefact['kind']) => input.artefacts.find((a) => a.kind === kind && (kind !== 'actor' || stage < 3 || a.id.startsWith('s2_')))!;
  const make = (id: string, kind: Artefact['kind'], data: Record<string, unknown>, refs: string[], statement = 'Synthetic fixture assessment; not a real policy conclusion.') => artefact(`${prefix}${id}`, kind, `Synthetic ${kind} ${id}`, statement, data, { refs, confidence: 0.5 });
  let items: Artefact[] = [];
  const items_: Artefact[] = [];
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
        { ...make('mech', 'mechanism', { intervention: 'A change the material proposes', implementation: 'Unspecified', notes: 'From the material.', whatItIs: 'A change the attached document proposes to how the programme works.' }, [materialPassage.id]), ...common },
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
      items.push(...keyJudgements(input, [items[0].id], 1));
    }
  } else if (stage === 1) {
    const p = one('passage');
    const common = { refs: [p.id], origin: 'extracted_fact' as const, sourceId: p.id, sourceQuote: 'The Council is accountable for delivery and bears implementation costs.' };
    items = [
      { ...make('objective', 'claim', { category: 'objective', notes: 'The policy claims this objective; no evaluation is supplied.' }, [p.id]), ...common },
      { ...make('mechanism', 'mechanism', { intervention: 'Shared access programme', implementation: 'Council delivery', notes: 'Funding unspecified', whatItIs: 'A council scheme that gives residents one place to ask for help.' }, [p.id]), ...common, label: 'Shared access programme' },
      make('assumption', 'assumption', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'Sufficient capacity is assumed.' }, [p.id, `${prefix}mechanism`, `${prefix}actor`]),
      { ...make('actor', 'actor', { entityType: 'local_authority', aliases: ['Council'], mentions: [p.id], ambiguity: 'None within this synthetic fixture.', dates: [], parent: null }, [p.id]), ...common, label: 'Council' },
      // PHASE 23: enough of a cast to exercise the master list of actors — a
      // body the GOV.UK register knows, the same council named twice, a
      // category, a programme that is not an actor, and a named private
      // individual who must never become one.
      ...[
        ['actor_dfe', 'Department for Education', 'department', 'The Department for Education commissions the Council.'],
        ['actor_councils', 'Councils', 'local_authority', 'Councils deliver the shared access programme.'],
        ['actor_providers', 'Providers', 'provider', 'Providers supply data to the Council.'],
        ['actor_programme', 'Shared access programme', 'programme', 'The shared access programme is delivered by the Council.'],
        ['actor_person', 'Jane Smith', 'person', 'Jane Smith is a resident who uses the service.'],
      ].map(([id, label, entityType, statement]) => ({ ...make(id, 'actor', { entityType, aliases: [], mentions: [p.id], ambiguity: 'None within this synthetic fixture.', dates: [], parent: null }, [p.id], statement), ...common, label })),
    ];
  } else if (stage === 2 && Array.isArray((raw as { items?: unknown }).items)) {
    // THE MASTER-LIST MATCH (phase 23): the answers a model would give for the
    // names the rules could not place. A name already on the register tree is
    // that entry; a programme is not an actor, run by the first other name; a
    // person with no role is a named individual; anything else is new.
    const asked = (raw as { items: { item: string; mentions: string[]; said: string; type: string; hint?: string }[] }).items;
    const tree = String((raw as { register?: unknown }).register ?? '');
    const onTree = (said: string) => tree.split('\n').map((line) => /^([rn]\d+) (.*?) \[/.exec(line)).find((m) => m && m[2].toLowerCase().replace(/s$/, '') === said.toLowerCase().replace(/s$/, ''))?.[1] ?? null;
    const runner = asked.find((i) => i.hint !== 'programme' && i.hint !== 'person');
    asked.forEach((item, i) => {
      const capacities = item.mentions.map((mentionId) => ({ mentionId, capacity: item.type === 'provider' ? 'delivers' : 'decides' }));
      const answer = (data: Record<string, unknown>, label = item.said) => ({ ...make(`match_${i}`, 'actor_match', { mentions: item.mentions, capacities, partOf: null, kindOf: null, runBy: null, matchId: null, kind: null, whatItIs: null, notActor: null, ...data }, item.mentions, `What the paper calls ${item.said}.`), label });
      const known = onTree(item.said);
      if (known) items_.push(answer({ answer: 'existing', matchId: known }));
      else if (item.hint === 'programme') items_.push(answer({ answer: 'not_actor', notActor: 'programme', runBy: runner?.said ?? null }));
      else if (item.hint === 'person') items_.push(answer({ answer: 'not_actor', notActor: 'named_person' }));
      else items_.push(answer({ answer: 'new', kind: item.type === 'provider' ? 'sector_or_category' : 'organisation', whatItIs: `A synthetic ${item.type.replaceAll('_', ' ')} used only by automated tests.` }));
    });
    items = items_;
  } else if (stage === 2) {
    const a = one('actor');
    items = [make('council', 'actor', { ...a.data, mentions: [a.id] }, [a.id])];
  } else if (stage === 3) {
    const m = one('mechanism');
    // Edges only: the `node` kind the graph stage used to emit alongside them was
    // rendered by nothing and is retired. A batched call (phase 23) names
    // several bodies, and each gets its own edge.
    const targets = input.targetActorIds?.length ? input.targetActorIds : [input.targetActorId ?? input.artefacts.find((a) => a.kind === 'actor' && a.id.startsWith('s2_'))!.id];
    items = targets.map((id, i) => ({ ...make(i ? `edge_${i}` : 'edge', 'edge', { notes: 'Paper assigns responsibility; authority not documented.' }, [id, m.id]), fromId: id, toId: m.id, relation: 'is_accountable_for' as const, temporal: 'proposed' as const }));
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
    items = [make('evidence', 'evidence', { claimId: c.id, mechanismId: one('mechanism').id, actorId: one('actor').id, assumptionId: one('assumption').id, sourceId: c.sourceId, evidenceType: 'paper claim', result: 'insufficient', sourceQuality: 'Unverified policy proposal.', relevance: 'Direct', freshness: 'Unknown', dispute: 'No independent evaluation.', grade: 'weak' }, [c.id, one('assumption').id])];
    // A SOURCE THE READER SUPPLIED (phase 22 part 2), read like any other: it
    // contradicts the paper's capacity claim and is graded on what it is — a
    // review read in full — never up for who supplied it.
    const supplied = input.artefacts.find((a) => a.kind === 'research_source' && a.data.supplied === 'reader');
    if (supplied) {
      const about = ((supplied.data.aboutIds as string[] | undefined) ?? []).map((id) => input.artefacts.find((a) => a.id === id)).find((a) => a?.kind === 'claim') ?? c;
      items.push(make('supplied', 'evidence', { claimId: about.id, mechanismId: null, actorId: null, assumptionId: one('assumption').id, sourceId: supplied.id, evidenceType: 'review supplied by the reader', result: 'contradicts', sourceQuality: 'A review with a stated method, read in full.', relevance: 'Direct', freshness: 'Unknown', dispute: 'The review found vacancies the paper does not mention.', grade: 'moderate' }, [about.id, supplied.id, one('assumption').id]));
    }
  } else if (stage === 7) {
    items = PATTERNS.filter((p) => !input.targetPattern || input.targetPattern === p).map((pattern) => make(pattern, 'model', { pattern, players: [one('actor').id], strategies: ['Cooperate', 'Minimum compliance'], decisionOrder: 'Department commissions; Council responds.', information: 'Capacity is uncertain.', costs: 'Implementation effort.', benefits: 'Access improvements.', rewards: 'Unspecified.', sanctions: 'Unspecified.', dependencies: [one('mechanism').id], assumptions: [one('assumption').id], responses: ['Minimum compliance under capacity pressure.'], equilibria: ['Conditional compliance; qualitative hypothesis.'], explanation: 'Cooperation depends on resources and reciprocal incentives.', applicability: 'Synthetic semi-formal example.' }, [one('evidence').id, one('assumption').id, one('mechanism').id]));
  } else if (stage === 9) {
    items = SCENARIOS.filter((s) => !input.targetScenario || input.targetScenario === s).map((scenario) => make(scenario, 'scenario', { scenario, changedConditions: 'Capacity and cooperation vary.', firstActor: one('actor').id, strategy: 'Delay delivery when capacity is low.', downstreamEffects: ['Longer waits.'], affectedOutcomes: [one('claim').id], detectability: 'Monthly reports, subject to gaming.', correction: 'Review resourcing.', weaknesses: ['No assured capacity.'], assumptions: [one('assumption').id], sensitivity: ['If capacity is sufficient, cooperation is feasible; if not, minimum compliance becomes more plausible. Capacity most changes this result.'],
      plain: { what: 'Councils have fewer staff than the programme expects.', firstMove: 'The Council, which runs the scheme locally, slows down new cases.', result: 'A parent asking for help waits weeks longer for an answer.', whyItMatters: 'The programme promised quicker help, and this is slower help.' } }, [one('model').id, one('test').id, one('assumption').id]));
  } else if (stage === 10) {
    const a = input.artefacts.find((x) => x.id === input.targetActorId)!;
    items = [make('exploit', 'exploit', { actorId: a.id, motivation: 'Avoids implementation cost while remaining compliant.', play: 'Report against the measure without changing the unobservable practice.', legality: 'compliant', targets: [one('mechanism').id], preconditions: [one('assumption').id], payoff: 'Retains discretion and avoids cost.', costToPolicy: 'The objective is not delivered while the measure reads well.', incentive: 0.6, ease: 0.6, impact: 0.6, concealment: 0.6, earlyWarning: 'Measure improves while complaints do not fall.', counter: 'Add an independent check of the unobservable practice.', precedent: 'None identified in this synthetic fixture.', precedentBasis: 'none',
      // The plain block the report shows first (phase 23); the comparison is
      // honest here, so it is given — a null would mean there is none.
      plain: { who: 'The Council, which runs the shared access programme locally.', does: 'It reports good numbers without changing how it treats people.', goesWrong: 'A parent who asks for help is counted as helped but still waits.', likeWhen: 'Like a shop counting people through the door instead of sales.', whyItMatters: 'The programme looks delivered when families are no better off.' } }, [one('profile').id, one('mechanism').id, one('assumption').id])];
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
  } else if (stage === 14 && (raw as { programmeModel?: boolean }).programmeModel) {
    // The programme call: one logic model over the whole policy.
    const mechanism = one('mechanism');
    items = [make('logic', 'logic_model', {
      inputs: ['Staff time'], activities: ['Deliver shared access'], outputs: ['Access offered'], outcomes: ['Use increases'], impacts: ['Access improves'],
      mechanismIds: [mechanism.id], assumptions: [one('assumption').id], weakestLink: 'Capacity: councils may not have the staff to deliver.',
      evidenceLimits: 'No impact evaluation is supplied.', judgement: 'contested',
    }, [mechanism.id, one('assumption').id])];
  } else if (stage === 14) {
    const mechanism = input.artefacts.find((a) => a.id === input.targetMechanismId) ?? one('mechanism');
    items = [make('chain', 'causal_chain', {
      mechanismId: mechanism.id, inputs: ['Staff time'], activities: ['Deliver shared access'], outputs: ['Access offered'], outcomes: ['Use increases'], impacts: ['Access improves'],
      causalMechanisms: ['Removing the access barrier permits use.'], assumptions: [one('assumption').id], alternativeExplanations: ['Demand may change independently.'],
      negativePathways: ['Capacity pressure may lengthen waits.'], indicators: [{ name: 'Use', baseline: 'Not specified', target: 'Not specified', dataSource: 'Administrative data', timing: 'Monthly' }],
      evidenceLimits: 'No impact evaluation is supplied.', judgement: 'provisional', weakestLink: 'Use depends on councils having the capacity to deliver.',
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
      // The one remit that builds rather than criticises (phase 22): the
      // competing account and what would tell the two apart.
      ...(category === 'rival_explanation' ? {
        rival: 'Councils already wanted to widen access, so use would rise without the programme; the programme is taking credit for a change that was coming anyway.',
        discriminators: [
          'If use rises as fast in councils outside the programme, that favours the rival.',
          'If use rises only where the programme funds staff, that favours the report.',
        ],
      } : {}),
    }, [target.id])];
  } else if (stage === 17) {
    const initial = input.artefacts.filter((a) => a.kind === 'finding' && a.data.revision !== 'assured');
    const challenges = input.artefacts.filter((a) => a.kind === 'assurance_challenge');
    const result = one('test');
    const assumption = one('assumption');
    items = REPORT_SECTIONS.map((section) => make(section, 'finding', {
      section, resultIds: [result.id], hypothesisIds: [assumption.id], revision: 'assured', reviewedFindingIds: [initial[0].id], challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits',
    }, [result.id, assumption.id, initial[0].id, ...challenges.map((c) => c.id)]));
    items.push(...challenges.map((challenge, i) => make(`response_${i}`, 'assurance_response', challenge.data.category === 'rival_explanation' ? {
      // Weighed, and honestly left open: the fixture's evidence cannot tell
      // the two accounts apart, which is what `unresolved` is for.
      challengeId: challenge.id, disposition: 'unresolved', response: 'The evidence supplied cannot tell the two accounts apart: nothing compares councils inside and outside the programme.', changes: 'The report now says the rise in use may have happened without the programme.', remainingLimit: 'Use in councils outside the programme, over the same period, would settle it.',
    } : {
      challengeId: challenge.id, disposition: challenge.data.finding === 'issue' ? 'accepted' : 'rejected', response: 'The revised report addresses the challenge.', changes: 'The conclusion is qualified.', remainingLimit: 'Human review remains outside scope.',
    }, [challenge.id])));
    items.push({ ...make('redesign', 'recommendation', { findingIds: [items[0].id], change: 'Commit resources and review authority.', tradeoffs: 'Additional public expenditure.', beneficiaries: ['Service users'], burdenBearers: ['Department'], validationNeeded: 'Verify capacity and legal powers.', revision: 'assured', challengeIds: challenges.map((c) => c.id), judgement: 'supported_with_limits' }, [items[0].id, ...challenges.map((c) => c.id)]), origin: 'normative_judgement' });
    items.push(make('summary', 'review_summary', { decisionUse: 'independently_challenged', judgement: 'supported_with_limits', openChallenges: 0, acceptedChallenges: 0, unresolvedMaterialChallenges: 0, scope: 'Automated independent challenge.', limitations: ['No human sign-off.'] }, challenges.map((c) => c.id)));
    // The main call writes `KEY_JUDGEMENT_FLOOR`; a top-up asked for more
    // (phase 23) writes the rest, each about a combination the ones already
    // written do not use — which is what the instruction asks of a model.
    const asking = input as unknown as { coverageGap?: unknown; keyJudgementsWritten?: { mechanismId?: unknown; playIds?: unknown }[] };
    const asked = Array.isArray(asking.coverageGap) && asking.coverageGap.includes('key_judgements');
    const written = asking.keyJudgementsWritten ?? [];
    items.push(...keyJudgements(input, [items[0].id], asked ? MAX_KEY_JUDGEMENTS - written.length : KEY_JUDGEMENT_FLOOR, written));
  }
  // ONE NOTE ABOUT THE PAPER, from decomposition (phase 23): what the provider
  // hands back as `notes` when a model's reply says, in its own `warnings`,
  // what the passage leaves out. The walk then sees it stored apart from the
  // run's limits, listed under "What the paper does not say", and absent from
  // every later stage's `priorWarnings`.
  const notes = stage === 1 && items.length ? [FIXTURE_NOTE] : [];
  return { artefacts: items, warnings: [], notes };
}

/** The fixture's one remark about the paper; tests look for it by value. */
export const FIXTURE_NOTE = 'The passage does not say how the shared access programme will be funded after its first year.';

/**
 * The key judgements a revised report leads with: up to `count`, each quoting
 * the mechanism it is about exactly as stage 1 located it and naming a play,
 * and none repeating a (mechanism, play) pair in `written` or in this list.
 */
function keyJudgements(input: StageInput & { idPrefix: string }, findingIds: string[], count: number, written: { mechanismId?: unknown; playIds?: unknown }[] = []): Artefact[] {
  const mechanisms = input.artefacts.filter((a) => a.kind === 'mechanism' && a.sourceId && a.sourceQuote);
  const plays = input.artefacts.filter((a) => a.kind === 'exploit');
  const assumption = input.artefacts.find((a) => a.kind === 'assumption');
  if (!mechanisms.length || !plays.length || !assumption) return [];
  const taken = new Set(written.map((w) => `${String(w.mechanismId)}|${Array.isArray(w.playIds) ? String(w.playIds[0]) : ''}`));
  const out: Artefact[] = [];
  for (let i = 0; out.length < count && i < mechanisms.length * plays.length; i++) {
    const mechanism = mechanisms[i % mechanisms.length];
    const play = plays[Math.floor(i / mechanisms.length) % plays.length];
    if (taken.has(`${mechanism.id}|${play.id}`)) continue;
    taken.add(`${mechanism.id}|${play.id}`);
    const n = out.length + 1;
    out.push(artefact(`${input.idPrefix}judgement_${n}`, 'key_judgement', n === 1 ? 'Councils can comply on paper' : `Synthetic judgement ${n}`, n === 1
      ? 'Councils can report against the access measure without changing practice, so the shared access programme can look delivered when it is not.'
      : `Synthetic key judgement ${n}: a body can meet the letter of this part of the policy without its purpose.`, {
      rank: n, mechanismId: mechanism.id, playIds: [play.id], assumptionId: assumption.id,
      wouldChangeIf: 'An independent check found practice changing where the measure improves.',
      decision: 'Whether to fund the programme beyond its first year.',
      action: 'Add an independent check of practice before the second year of funding.', owner: 'The funding department',
      findingIds,
      plain: n === 1
        ? { forWhom: 'Parents who ask the council for help.', whyItMatters: 'Money keeps flowing to a programme that is not helping anyone faster.' }
        : { forWhom: 'The people this part of the policy is meant to help.', whyItMatters: 'The policy can look delivered while its purpose is missed.' },
    }, { refs: [mechanism.id, play.id, assumption.id, ...findingIds], sourceId: mechanism.sourceId, sourceQuote: mechanism.sourceQuote, origin: 'structural_inference', confidence: null }));
  }
  return out;
}
