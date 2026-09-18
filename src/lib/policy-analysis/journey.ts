// The rail, as the redesign wants it: THREE STEPS AND AN ANNEX.
//
// This replaces `TABS` / `tabGroups` / `journeySteps` in
// `src/lib/policy-analysis/view.ts`. Every id is the id it already was, so every
// existing deep link and every `#hash` in an export keeps working.
//
// What changed against the nineteen-cell rail:
//
//   * FOUR cells, numbered from ZERO, are the whole navigation: how it was made,
//     the verdict, the threats, the bodies. Nothing else is a peer of them.
//   * `provenance` — "the working" — LEADS as step 00 rather than sitting in the
//     annex. It is how the assessment was made, and a reader deciding whether to
//     trust a red-team read of their own paper asks that first. It is also the
//     only step that can be ABSENT: a shared copy and an offline pack are handed
//     no run log, so the bar draws three cells there and numbers them 01–03.
//   * `interplay`, `network` and `personas` stop being rail cells. They answer
//     the same question as their step, so they become a view switch INSIDE that
//     step (see `STEP_VIEWS`) rather than three more places to go.
//   * `guide` retires as a tab. Its `RobustReview mode="guide"` block renders
//     inside step 01 under the verdict; `#guide` should resolve to step 01 so old
//     links do not dead-end.
//   * Everything else — thirteen views — is the annex, reached from one menu.

export type StepId = 'provenance' | 'verdict' | 'playbook' | 'actors';

export type JourneyStep = {
  /** Existing tab id. Also the anchor. */
  id: StepId;
  /** 01, 02, 03 — shown in accent before the name. */
  step: number;
  name: string;
  /** Sits under the step head, not on the rail. */
  strap: string;
};

export const JOURNEY: JourneyStep[] = [
  {
    id: 'provenance',
    step: 0,
    name: 'Development process',
    strap:
      'How this assessment was made: eighteen stages in five phases, what each one was given, what it emitted, where that lands in the report — and what it cannot do.',
  },
  {
    id: 'verdict',
    step: 1,
    name: 'Verdict',
    strap: 'What this assessment concludes, what the independent challenge made of it, and what is still open.',
  },
  {
    id: 'playbook',
    step: 2,
    name: 'Key threats',
    strap: 'What a body governed by this policy could do to it, worst first. This is the main event and it opens selected.',
  },
  {
    id: 'actors',
    step: 3,
    name: 'Who would run them',
    strap: 'Every body the policy runs through, what its position rewards, and the worst thing it could do.',
  },
];

/**
 * A second way of reading the same step, offered as a switch inside it.
 *
 * The first entry is the step's own default view. Rendered as one segmented
 * control in the step head — never as navigation.
 */
export const STEP_VIEWS: Record<StepId, { id: string; name: string }[]> = {
  provenance: [{ id: 'provenance', name: 'The working' }],
  verdict: [{ id: 'verdict', name: 'The verdict' }],
  playbook: [
    { id: 'playbook', name: 'Ranked list' },
    { id: 'interplay', name: 'What they aim at' },
  ],
  actors: [
    { id: 'actors', name: 'The bodies' },
    { id: 'network', name: 'How they connect' },
    { id: 'personas', name: 'Met before' },
  ],
};

export type AnnexGroupName = 'Grounding' | 'Review' | 'Assessment';

/**
 * Thirteen views, three groups, one menu. Counts stay exactly as they are today
 * (artefact counts from `view.ts`); a view with nothing behind it still shows its
 * zero rather than being hidden, because absence is a finding.
 *
 * `graph` ARRIVED here from step 00's audit detail, where the whole policy
 * network — hundreds of entities, every relationship the paper states — sat
 * inside a `<details>` behind a flat thirty-node modal. It is not audit; it is
 * the shape of the thing being assessed.
 *
 * `provenance` LEFT this list for step 00. It is the one entry here that was
 * never a thing to consult — it is how the whole assessment was produced — and
 * a reader who wants to know whether to trust the report asks that before they
 * read it, not after.
 */
export const ANNEX: { group: AnnexGroupName; items: { id: string; name: string }[] }[] = [
  {
    group: 'Grounding',
    items: [
      { id: 'stress', name: 'What if we are wrong' },
      { id: 'checks', name: 'Gaps in the paper' },
      { id: 'evidence', name: 'What is backed up' },
      { id: 'scenarios', name: 'If things change' },
    ],
  },
  {
    group: 'Review',
    items: [
      { id: 'causal', name: 'Why it should work' },
      { id: 'appraisal', name: 'Choices and evaluation' },
      { id: 'assurance', name: 'Independent challenge' },
    ],
  },
  {
    group: 'Assessment',
    items: [
      { id: 'cross', name: 'Other policies' },
      { id: 'graph', name: 'The policy as a graph' },
      { id: 'addenda', name: 'What came after' },
      { id: 'report', name: 'The write-up' },
      { id: 'handling', name: 'Where your paper goes' },
      { id: 'key', name: 'How to read this' },
    ],
  },
];

/**
 * `addenda` is the one annex entry that can be ABSENT on the owner's own copy.
 *
 * Every other view here draws a zero when it has nothing, deliberately, because
 * an empty evidence matrix is a finding about the paper. An assessment with no
 * material attached has not failed to produce addenda — nobody asked for one —
 * so an entry reading "What came after: 0" would report the reader's own
 * inaction as a gap in the assessment. `rendered()` in `AssessmentBody` decides.
 */
/** Old ids that must not dead-end. */
export const REDIRECTS: Record<string, string> = { guide: 'verdict' };
