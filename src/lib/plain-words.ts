/**
 * THE REPORT'S WORDS, WRITTEN DOWN ONCE.
 *
 * John's brief for phase 19: "a simpler, easier to access language in the
 * output too where possible". The review of the real assessment found the
 * report's labels were the pipeline's vocabulary — artefacts, mechanisms,
 * plays, exposure bands, provenance, assured synthesis, structural checks,
 * theory of change, preconditions — set in front of a policy reader who has
 * never seen the pipeline.
 *
 * `VOCABULARY` is the decision: for each word the page used, the word it uses
 * now. It is not a translation table the code runs through; every label was
 * rewritten by hand in GOV.UK style — short sentences, common words, name who
 * does what — and this is the record a later change checks itself against, so
 * that "ways to beat it" does not drift back into "plays" one component at a
 * time. Route names, ids and CSS classes are NOT renamed: `?move=causality`
 * and `#mechanisms` still work, and only visible text changed.
 *
 * `GLOSSARY` is the smaller list of words that had to STAY, because there is
 * no shorter plain word for them, and so are explained on the page under
 * "What these words mean".
 */
export type Word = {
  /** What the page used to say. */
  was: string;
  /** What it says now. */
  now: string;
};

export const VOCABULARY: readonly Word[] = [
  { was: 'artefacts', now: 'items (or "findings and evidence" where that is what is meant)' },
  { was: 'plays / exploitation plays', now: 'ways to beat the policy' },
  { was: 'mechanisms', now: 'parts of the policy' },
  { was: 'exposure / exposure band', now: 'how exposed (the four levels keep their names)' },
  { was: 'exposure score', now: 'score' },
  { was: 'provenance', now: 'where this comes from' },
  { was: 'assured synthesis / assured', now: 'final review' },
  { was: 'structural checks', now: 'checks on how the policy is set up' },
  { was: 'theory of change', now: 'how it is meant to work' },
  { was: 'inputs, activities, outputs, outcomes, impacts', now: 'what goes in, what is done, what it produces, what changes, the end result' },
  { was: 'preconditions', now: 'what has to be true' },
  { was: 'counter-measure', now: 'what would stop it' },
  { was: 'origin', now: 'where it came from' },
  { was: 'actors', now: 'bodies and groups' },
  { was: 'causality', now: 'causes' },
  { was: 'stages (of the run)', now: 'steps' },
  { was: 'limits recorded / warnings', now: 'gaps it noted' },
  { was: 'recommendations / suggestions', now: 'recommendations' },
  { was: 'stress test / levers', now: 'what if we are wrong / assumptions you can switch off' },
  // Phase 19, workstream B: the brief and the pattern grid.
  { was: 'patterns / play archetypes', now: 'kinds of way to beat it' },
  { was: 'early warning signal', now: 'early warning' },
  { was: 'counter-play / counter', now: 'the fix' },
  { was: 'wouldChangeIf / falsifier', now: 'what would change our mind' },
  { was: 'owner + action', now: 'who should act' },
  { was: 'limits / gaps (in the brief)', now: 'what we could not check' },
];

export type GlossaryEntry = { term: string; meaning: string };

/** The words that stay, with what they mean here. Alphabetical. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  { term: 'Assumption', meaning: 'Something the policy needs to be true but does not prove. If it turns out false, whatever rests on it is weaker.' },
  { term: 'Final review', meaning: 'The last step of the assessment. An independent challenge attacks the draft findings, and the findings shown here are what survived it.' },
  { term: 'Finding', meaning: 'A conclusion the assessment reached, with how well supported the final review judged it.' },
  { term: 'How exposed', meaning: 'How badly a way to beat the policy could hurt it: severe, significant, moderate or limited. It combines how much someone would want to do it, how easy it is, how much damage it does and how hard it is to see.' },
  { term: 'Part of the policy', meaning: 'Something the paper sets up to deliver its aims — a fund, a duty, a regulator, a measure of performance.' },
  { term: 'Red team', meaning: 'Reading a policy the way someone trying to get round it would. It finds weak points; it is not a prediction that anyone will use them.' },
  { term: 'Way to beat the policy', meaning: 'Something a body or group could do to get what it wants while the policy fails to get what it wants. Most break no rule.' },
];
