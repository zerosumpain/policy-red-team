import { ASSURANCE_CATEGORIES, DEEP_CHAINS, JUDGEMENTS, REPORT_SECTIONS, type Artefact } from './contracts';

export type RobustnessMetric = { key: string; score: number; detail: string };
export type RobustnessBenchmark = { score: number; metrics: RobustnessMetric[]; blockers: string[] };

const ratio = (part: number, whole: number) => whole > 0 ? Math.min(1, part / whole) : 0;

function reachesSource(id: string, all: Map<string, Artefact>, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const row = all.get(id);
  if (!row) return false;
  if (row.kind === 'passage' || row.kind === 'research_source') return true;
  return row.refs.some((ref) => reachesSource(ref, all, seen));
}

/**
 * Provider-independent acceptance measures for the expanded analytical method.
 *
 * These do not claim that a model is correct. They make the method's structural
 * promises executable, so a prompt, contract or pipeline change cannot quietly
 * remove the causal review, comparison, second pass or provenance chain.
 */
export function benchmarkRobustness(artefacts: Artefact[]): RobustnessBenchmark {
  const of = (kind: Artefact['kind']) => artefacts.filter((a) => a.kind === kind);
  const mechanisms = of('mechanism');
  const chains = of('causal_chain');
  const logic = of('logic_model');
  const options = of('option_appraisal');
  const plans = of('evaluation_plan');
  const challenges = of('assurance_challenge');
  const responses = of('assurance_response');
  const summaries = of('review_summary');
  const assured = of('finding').filter((a) => a.data.revision === 'assured');
  const map = new Map(artefacts.map((a) => [a.id, a]));
  const optionTypes = new Set(options.map((a) => String(a.data.optionType)));
  const challengeTypes = new Set(challenges.map((a) => String(a.data.category)));
  const answered = new Set(responses.map((a) => String(a.data.challengeId)));
  const sections = new Set(assured.map((a) => String(a.data.section)));
  const judged = [...logic, ...chains, ...options, ...plans, ...assured].filter((a) => (JUDGEMENTS as readonly string[]).includes(String(a.data.judgement)));
  const analytical = [...logic, ...chains, ...options, ...plans, ...challenges, ...responses, ...summaries, ...assured];
  const traced = analytical.filter((a) => reachesSource(a.id, map));

  const metrics: RobustnessMetric[] = [
    // Against the mechanisms a run is ASKED to chain since phase 19 — a programme
    // logic model plus `DEEP_CHAINS` deep chains — not against every mechanism,
    // which would read eight of 150 as a 5% causal review. An older run with a
    // chain per mechanism still scores 1.
    { key: 'causal_coverage', score: (ratio(new Set(chains.map((a) => String(a.data.mechanismId))).size, Math.min(DEEP_CHAINS, mechanisms.length)) + (logic.length || chains.length >= mechanisms.length ? 1 : 0)) / 2, detail: `${logic.length} programme logic model${logic.length === 1 ? '' : 's'} and ${chains.length} deep chains for ${mechanisms.length} mechanisms` },
    { key: 'option_coverage', score: ratio(['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative'].filter((x) => optionTypes.has(x)).length, 4), detail: `${optionTypes.size} required option types` },
    { key: 'evaluation_coverage', score: plans.length === 1 && Array.isArray(plans[0].data.indicators) && plans[0].data.indicators.length > 0 ? 1 : 0, detail: `${plans.length} evaluation plans` },
    { key: 'challenge_coverage', score: ratio(ASSURANCE_CATEGORIES.filter((x) => challengeTypes.has(x)).length, ASSURANCE_CATEGORIES.length), detail: `${challengeTypes.size} of ${ASSURANCE_CATEGORIES.length} challenge categories` },
    { key: 'response_coverage', score: ratio(challenges.filter((a) => answered.has(a.id)).length, challenges.length), detail: `${challenges.filter((a) => answered.has(a.id)).length} of ${challenges.length} challenges answered` },
    { key: 'revised_report_coverage', score: ratio(REPORT_SECTIONS.filter((x) => sections.has(x)).length, REPORT_SECTIONS.length), detail: `${sections.size} of ${REPORT_SECTIONS.length} assured report sections` },
    { key: 'qualitative_judgement', score: ratio(judged.length, [...logic, ...chains, ...options, ...plans, ...assured].length), detail: `${judged.length} of ${[...logic, ...chains, ...options, ...plans, ...assured].length} analytical conclusions use the qualitative scale` },
    { key: 'traceability', score: ratio(traced.length, analytical.length), detail: `${traced.length} of ${analytical.length} expanded-review artefacts reach source material` },
  ];
  const blockers = metrics.filter((m) => m.score < 1).map((m) => `${m.key}: ${m.detail}`);
  return { score: metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length, metrics, blockers };
}
