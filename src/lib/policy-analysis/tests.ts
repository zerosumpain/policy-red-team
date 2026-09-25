import { artefact, type Artefact } from './contracts';

export const POLICY_TESTS = [
  ['authority', 'Responsibility–authority alignment', 'is_accountable_for', 'has_authority_over', 'Give responsible actors explicit decision rights.'],
  ['resources', 'Accountability–resource alignment', 'is_accountable_for', 'funds', 'Identify and commit resources to accountable actors.'],
  ['distribution', 'Cost–benefit alignment', 'bears_cost_of', 'receives_benefit_from', 'Compensate actors bearing costs and examine distributional effects.'],
  ['cooperation', 'Cooperation and free-riding', 'depends_on', 'reciprocates', 'Specify reciprocal commitments and shared benefits.'],
  ['observability', 'Observability of effort and outcomes', 'is_accountable_for', 'is_measured_by', 'Make effort and outcomes observable with independent checks.'],
  ['metrics', 'Metric integrity and gaming', 'is_measured_by', 'owns_data', 'Assign data ownership and audit measures for gaming.'],
  ['enforcement', 'Enforcement credibility', 'regulates', 'sanctions', 'Specify lawful, feasible sanctions and credible enforcement.'],
  ['coordination', 'Coordination dependency', 'depends_on', 'is_accountable_for', 'Name dependency owners, reporting routes and fallbacks.'],
  ['information', 'Information asymmetry', 'supplies_data_to', 'reciprocates', 'Provide incentives, standards and accountability for timely sharing.'],
  ['veto', 'Veto and bottleneck exposure', 'can_veto', 'is_accountable_for', 'Make veto rights transparent and provide escalation and accountability.'],
  ['power', 'Distributional and power effects', 'has_authority_over', 'bears_cost_of', 'Review whose interests control decisions and who bears their costs.'],
  ['adaptability', 'Adaptability under changing conditions', 'delivers', 'can_adapt', 'Add review points, feedback and authority to adapt.'],
] as const;

/**
 * How much of the knowledge graph was thrown away before these checks ran.
 *
 * Triage keeps a run alive by quarantining faulty artefacts, and that is also how
 * a check could hand back false reassurance: if 38 of 40 relationships were
 * discarded, "all 2 extracted relationships have a corresponding counterpart"
 * still renders as **low risk** in bold to someone deciding whether to publish.
 * Above this share the checks refuse to reach a verdict at all, which is the same
 * position they already take when there is no evidence either way.
 */
const GRAPH_LOSS_CEILING = 0.34;

/**
 * How little of the policy the graph actually holds.
 *
 * `discarded` is what triage threw away. `uncovered` is the share of resolved
 * actors the graph never gave a node at all — a different failure with the same
 * consequence, and the one that was invisible. On the 72-page white paper of
 * 2026-09-10 triage discarded NOTHING, so `discarded` was 0 and this machinery
 * stayed asleep, while the graph itself held 9 nodes and 4 edges for 352 resolved
 * actors. Seven of the eleven checks correctly returned indeterminate on their
 * own, but four produced risk verdicts — one of them `high_risk` — from three
 * assertions, and nothing on the page said those rested on 2.6% of the actors.
 */
export type GraphReach = { discarded?: number; uncovered?: number };

/**
 * WHAT STAGE 1 EXTRACTED THAT A RELATION WOULD HAVE BEEN DRAWN FROM.
 *
 * A check that finds no `is_measured_by` edge was reporting a defect in the
 * PAPER: "43 of 43 relevant assertions have no documented matching
 * is_measured_by relationship", high risk. On that run stage 1 had extracted
 * 39 measures from the paper. The paper stated them; the graph stage — offered
 * 8 of 26 relation types at the time — never wired one. That is a limit of the
 * run, and printing it as a finding about the paper is the most damaging thing
 * a check can say wrongly, because it is the one a reader will quote.
 *
 * So each relation a check reads is paired, where one exists, with the stage-1
 * inventory it would have been drawn from: a claim category, or for `delivers`
 * the mechanisms themselves. Only relations with a clear source are listed —
 * `sanctions`, `can_veto`, `reciprocates` and the rest have no category of their
 * own, and guessing one would move the error rather than remove it.
 */
const EXTRACTED_AS: Partial<Record<string, { what: string; of: (a: Artefact) => boolean }>> = {
  is_accountable_for: { what: 'responsibilities', of: (a) => a.kind === 'claim' && a.data.category === 'responsibility' },
  has_authority_over: { what: 'decision rights', of: (a) => a.kind === 'claim' && a.data.category === 'decision_right' },
  funds: { what: 'funding commitments', of: (a) => a.kind === 'claim' && a.data.category === 'funding' },
  is_measured_by: { what: 'measures', of: (a) => a.kind === 'claim' && a.data.category === 'measure' },
  owns_data: { what: 'data flows', of: (a) => a.kind === 'claim' && a.data.category === 'data_flow' },
  supplies_data_to: { what: 'data flows', of: (a) => a.kind === 'claim' && a.data.category === 'data_flow' },
  depends_on: { what: 'dependencies', of: (a) => a.kind === 'claim' && a.data.category === 'dependency' },
  receives_benefit_from: { what: 'benefits', of: (a) => a.kind === 'claim' && a.data.category === 'benefit' },
  delivers: { what: 'mechanisms', of: (a) => a.kind === 'mechanism' },
};

/** The paper's own stage-1 items behind a relation — never an addendum's, which are not the paper. */
function extractedFor(all: Artefact[], relation: string): { relation: string; what: string; count: number; ids: string[] } | null {
  const source = EXTRACTED_AS[relation];
  if (!source) return null;
  const ids = all.filter((a) => a.id.startsWith('s1_') && source.of(a)).map((a) => a.id);
  return ids.length ? { relation, what: source.what, count: ids.length, ids } : null;
}

/**
 * How many of those items a gap cites. They are its evidence — the reader can
 * open the measures the paper stated — and a check with no references at all is
 * discarded by triage, so without them the gap would vanish rather than be read.
 */
const GAP_REFS = 40;

export function runPolicyTests(all: Artefact[], reach: number | GraphReach = 0): Artefact[] {
  const { discarded = 0, uncovered = 0 } = typeof reach === 'number' ? { discarded: reach } : reach;
  const graphLoss = Math.max(discarded, uncovered);
  const gutted = graphLoss > GRAPH_LOSS_CEILING;
  const guttedReason = uncovered > discarded
    ? `the policy graph names only ${Math.round((1 - uncovered) * 100)}% of the resolved actors, so the relationships this check reads cover a fraction of the policy`
    : `${Math.round(graphLoss * 100)}% of the relationships this check reads were discarded before it ran`;
  const edges = all.filter((a) => a.kind === 'edge');
  const assumptions = all.filter((a) => a.kind === 'assumption');
  const models = all.filter((a) => a.kind === 'model');
  const patterns: Record<string, string> = { authority: 'principal_agent', resources: 'principal_agent', distribution: 'collective_action', cooperation: 'collective_action', observability: 'principal_agent', metrics: 'metric_gaming', enforcement: 'enforcement_credibility', coordination: 'coordination', information: 'information_asymmetry', veto: 'bargaining_veto', power: 'bargaining_veto', adaptability: 'repeated_interaction' };
  return POLICY_TESTS.map(([testId, name, trigger, counterpart, mitigation]) => {
    const relevant = edges.filter((e) => e.relation === trigger || (testId === 'information' && e.relation === 'owns_data') || (testId === 'coordination' && e.relation === 'reports_to'));
    const missing = relevant.filter((e) => !edges.some((other) => {
      if (other.relation !== counterpart) return false;
      if (testId === 'resources') return other.toId === e.fromId;
      if (testId === 'metrics') return other.toId === e.toId;
      if (testId === 'coordination') return other.toId === e.toId;
      if (testId === 'information' && e.relation === 'owns_data') return other.toId === e.fromId;
      if (testId === 'cooperation' || testId === 'information') return other.fromId === e.toId && other.toId === e.fromId;
      if (testId === 'observability' || testId === 'enforcement' || testId === 'adaptability') return other.fromId === e.fromId;
      return other.fromId === e.fromId && other.toId === e.toId;
    }));
    // 'high_risk' used to be unreachable: every shortfall, however total, read as
    // moderate. A check where EVERY relevant assertion lacks its counterpart, over
    // more than one assertion, is a different finding from one where some do.
    // AN EXTRACTION GAP: the paper states what this check reads, and the graph
    // this run built does not link it. Either the trigger relation is absent
    // although stage 1 extracted what it is drawn from, or a counterpart is
    // missing and the graph holds NO edge of that type at all while stage 1
    // extracted what it is drawn from. Some edges of the type and some missing is
    // a real shortfall: the graph could wire it, and here did not find it.
    const gap = gutted ? null
      : !relevant.length ? extractedFor(all, trigger)
      : missing.length && !edges.some((e) => e.relation === counterpart) ? extractedFor(all, counterpart)
      : null;
    const result = gutted || gap || !relevant.length ? 'indeterminate'
      : !missing.length ? 'low_risk'
      : missing.length === relevant.length && relevant.length >= 2 ? 'high_risk'
      : 'moderate_risk';
    const inputs = [...new Set([...relevant.map((e) => e.id), ...edges.filter((e) => e.relation === counterpart).map((e) => e.id)])];
    const related = new Set(relevant.flatMap((e) => [e.fromId, e.toId]));
    const relevantModels = models.filter((m) => m.data.pattern === patterns[testId]);
    const relevantAssumptions = assumptions.filter((a) => a.refs.some((id) => related.has(id)) || relevantModels.some((m) => (m.data.assumptions as string[]).includes(a.id)));
    const refs = [...new Set([...inputs, ...relevantAssumptions.map((a) => a.id), ...relevantModels.map((a) => a.id), ...(gap?.ids.slice(0, GAP_REFS) ?? [])])];
    const label = (id: string | null) => all.find((a) => a.id === id)?.label ?? null;
    const named = [...new Set(missing.map((e) => label(e.fromId)).filter((n): n is string => !!n))].slice(0, 6);
    const extra = testId === 'coordination'
      ? ` ${conflictingReportingLines(edges).length} actor(s) have multiple reporting targets; whether these conflict needs institutional interpretation.` : '';
    const reasoning = gutted
      ? `${guttedReason}, so no verdict is available. Evidence is insufficient; this is not a pass.`
      : gap
      ? `This run could not make this check. The paper states ${gap.count} ${gap.what}, but the relationship graph built on this run records no ${gap.relation} link, so there was nothing to compare. This is a limit of this run, not a gap in the paper, and it is not a pass.`
      : !relevant.length
      ? 'No applicable graph assertion was extracted. Evidence is insufficient; this is not a pass.'
      : missing.length
        ? `${missing.length} of ${relevant.length} relevant assertions have no documented matching ${counterpart} relationship. This is a structural review signal: missing evidence does not prove missing powers, resources or incentives.`
        : `All ${relevant.length} extracted relationships have a corresponding ${counterpart} relationship. This only establishes structural coverage; adequacy and behaviour remain uncertain.`;
    return artefact(`test_${testId}`, 'test', name, reasoning + extra, {
      testId, rationale: `Check ${trigger} against ${counterpart} in the provenance graph.`, inputs,
      rule: `${trigger} requires a corresponding ${counterpart}; absent trigger = indeterminate; missing counterpart = moderate review risk; matched = low structural risk.`,
      reasoning: reasoning + extra, result, severity: result === 'indeterminate' ? 'unknown' : result === 'high_risk' ? 'high' : result === 'moderate_risk' ? 'moderate' : 'low',
      actors: [...new Set(relevant.map((e) => e.fromId).filter((id): id is string => !!id))],
      mitigation: gap
        ? `Nothing to change in the paper on this evidence. Read its ${gap.what} directly: this run did not link them into the graph.`
        : named.length ? `${mitigation} Here that means: ${named.join(', ')}.` : mitigation,
      // Where the check stands: a verdict drawn from the graph, or a limit of
      // the run. The report and the stage facts read this, not the prose.
      ...(gap ? { basis: 'extraction_gap', extracted: { relation: gap.relation, what: gap.what, count: gap.count } } : {}),
    }, { origin: 'structural_inference', confidence: relevant.length ? Math.min(0.6, ...relevant.map((e) => e.confidence ?? 0)) : null, refs });
  });
}
export function conflictingReportingLines(edges: Artefact[]): string[] {
  const reporting = new Map<string, Set<string>>();
  for (const edge of edges) if (edge.relation === 'reports_to' && edge.fromId && edge.toId) {
    const targets = reporting.get(edge.fromId) ?? new Set<string>(); targets.add(edge.toId); reporting.set(edge.fromId, targets);
  }
  return [...reporting].filter(([, targets]) => targets.size > 1).map(([id]) => id);
}
