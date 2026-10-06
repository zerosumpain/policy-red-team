import type { Artefact } from '$lib/policy-analysis/contracts';
import { BANDS, bandOf, exposureOf, type Band } from '$lib/policy-analysis/exposure';
import { guideChapter } from '../places';

/**
 * "HOW TO READ A RED-TEAM REPORT" — EVERY WORD AND EVERY DATUM, IN ONE PLACE
 * (phase 26).
 *
 * Two renderers read this file and must never disagree: the guide at `/guide`
 * (six chapters, each with one thing to press) and the offline pack's static
 * "How to read this report" section, which has no router, no guide and no
 * motion. So the words a chapter TEACHES (`takeaway`) live here once, and the
 * guide adds only the interaction around them.
 *
 * ONE FICTIONAL MINI-POLICY, WRITTEN FOR THE GUIDE. Nothing here is drawn from
 * a real run: an example lifted from an assessment would go stale the day the
 * pipeline changed, and could carry a sealed paper's words onto a public page.
 * A breakfast club is small enough to hold in your head and has the three
 * things every chapter needs — money that follows a count, a body that does
 * the counting, and a check that is lighter than it sounds.
 *
 * THE DATA IS REAL-SHAPED. The plays, assumptions and the finding below are
 * artefacts the pipeline could have written (`content.test.ts` parses them
 * against `artefactSchema`), and their exposure and band are computed by the
 * pipeline's own `exposureOf` / `bandOf`. Chapters 3 to 5 feed them to the same
 * components and pure functions the report uses — `PlainBlock`, `PlayList`,
 * `stress`, `reading` — so the guide cannot explain a rule the report does not
 * follow.
 *
 * Pure: no React, no zod, nothing that reaches a server. The pack bundles it.
 */

/** The made-up policy, named the way a paper would name it. */
export const MINI_POLICY = {
  title: 'Breakfast for Every Child',
  blurb: 'a free breakfast club in every primary school, paid for per pupil who attends.',
} as const;

// ── Chapter 2: from paper to parts ───────────────────────────────────────────

/** What the first steps of a run pull out of a sentence, in the report's words. */
export type PieceKind = 'part' | 'assumption' | 'body';

export const PIECE_LABEL: Record<PieceKind, { one: string; many: string }> = {
  part: { one: 'part of the policy', many: 'Parts of the policy' },
  assumption: { one: 'assumption', many: 'Assumptions' },
  body: { one: 'body', many: 'Bodies' },
};

export type Piece = { kind: PieceKind; text: string };
export type Sentence = { text: string; pieces: Piece[] };

/**
 * THE PAPER, ONE SENTENCE AT A TIME, with what each gives up.
 *
 * Each sentence yields at least one piece, and the three kinds all appear, so
 * stepping through it shows the morph steps 1 to 3 of a run perform: a part of
 * the policy is something the paper SETS UP, an assumption something it TAKES
 * FOR GRANTED, a body someone it GIVES A JOB TO. A body named twice is listed
 * once — the run resolves it the same way (`content.test.ts`).
 */
export const PAPER: readonly Sentence[] = [
  {
    text: 'Every state primary school will run a free breakfast club before lessons start.',
    pieces: [
      { kind: 'part', text: 'A free breakfast club in every primary school' },
      { kind: 'body', text: 'Primary schools' },
    ],
  },
  {
    text: 'The Department will pay each school £1.20 for every pupil who attends, whatever the club costs to run.',
    pieces: [
      { kind: 'part', text: 'A flat payment per pupil attending' },
      { kind: 'body', text: 'The Department' },
      { kind: 'assumption', text: 'The same payment works for every school, large or small' },
    ],
  },
  {
    text: 'Schools will count attendance themselves and send a monthly return.',
    pieces: [
      { kind: 'part', text: 'A monthly attendance return' },
      { kind: 'body', text: 'Primary schools' },
    ],
  },
  {
    text: 'Councils will check a sample of returns once a year, which the paper expects to be enough.',
    pieces: [
      { kind: 'part', text: 'A yearly sample check' },
      { kind: 'body', text: 'Local councils' },
      { kind: 'assumption', text: 'A yearly sample is all the checking the counts need' },
    ],
  },
  {
    text: 'Any pupil may attend, and the paper expects the children who most need breakfast to come.',
    pieces: [
      { kind: 'assumption', text: 'Places are open to anyone, so nobody checks who the club feeds' },
    ],
  },
];

/** Everything the paper gives up, by kind, each piece once, in the order first met. */
export function piecesSoFar(through: number): Record<PieceKind, string[]> {
  const out: Record<PieceKind, string[]> = { part: [], assumption: [], body: [] };
  for (const sentence of PAPER.slice(0, Math.max(0, through))) {
    for (const piece of sentence.pieces) {
      if (!out[piece.kind].includes(piece.text)) out[piece.kind].push(piece.text);
    }
  }
  return out;
}

/** "2 parts of the policy, 1 body" — what one sentence gave up, said for a screen reader. */
export function sentenceYield(sentence: Sentence): string {
  const kinds: PieceKind[] = ['part', 'assumption', 'body'];
  return kinds
    .map((kind) => {
      const n = sentence.pieces.filter((p) => p.kind === kind).length;
      if (!n) return '';
      const word = PIECE_LABEL[kind];
      return `${n} ${n === 1 ? word.one : word.many.toLowerCase()}`;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Chapters 3–5: the plays, the assumptions they need, one conclusion ───────

/** Every artefact a run writes carries these; the guide's carry the defaults. */
function artefact(id: string, kind: Artefact['kind'], label: string, statement: string, data: Record<string, unknown>, refs: string[] = []): Artefact {
  return {
    id, kind, label, statement, data, origin: 'behavioural_hypothesis', confidence: null, refs,
    sourceId: null, sourceQuote: null, page: null, section: null, startOffset: null, endOffset: null,
    url: null, fromId: null, toId: null, relation: null, temporal: null,
  };
}

/** The pipeline stamps exposure and band from the four factors; so does the guide. */
function scored(data: Record<string, unknown>): Record<string, unknown> {
  const exposure = exposureOf(data);
  return { ...data, exposure: Number(exposure.toFixed(4)), band: bandOf(exposure).band };
}

const ACTOR_SCHOOLS = 'guide_actor_schools';
const ACTOR_PARENTS = 'guide_actor_parents';

export const ASSUMPTION_SAMPLE = 'guide_assumption_sample';
export const ASSUMPTION_FLAT = 'guide_assumption_flat';
export const ASSUMPTION_OPEN = 'guide_assumption_open';

/**
 * THE THREE ASSUMPTIONS, in the paper's own terms — the same three chapter 2
 * pulls out. Each is something a way to beat it NEEDS to be true, which is why
 * switching one off in chapter 5 takes plays off the table.
 */
export const ASSUMPTIONS: readonly Artefact[] = [
  artefact(ASSUMPTION_SAMPLE, 'assumption', 'A yearly sample is all the checking the counts need', 'Councils check a sample of returns once a year and nothing else checks the count.', { importance: 0.9, uncertainty: 0.7, consequence: 0.8, notes: 'From the paper: "a sample of returns once a year".' }),
  artefact(ASSUMPTION_FLAT, 'assumption', 'The same payment works for every school, large or small', 'Every school is paid £1.20 a pupil whatever its club costs to run.', { importance: 0.7, uncertainty: 0.6, consequence: 0.6, notes: 'From the paper: "whatever the club costs to run".' }),
  artefact(ASSUMPTION_OPEN, 'assumption', 'Places are open to anyone, so nobody checks who the club feeds', 'Any pupil may attend and the club is expected to reach those who need it most.', { importance: 0.6, uncertainty: 0.8, consequence: 0.5, notes: 'From the paper: "any pupil may attend".' }),
];

export const ACTORS: readonly Artefact[] = [
  artefact(ACTOR_SCHOOLS, 'actor', 'Primary schools', 'The schools that run the clubs and count who comes.', { entityType: 'provider', aliases: [], mentions: [], ambiguity: 'None.', dates: [], parent: null, whatItIs: 'The schools that run the clubs.' }),
  artefact(ACTOR_PARENTS, 'actor', 'Working parents', 'Parents who need somewhere for their children before work.', { entityType: 'user_group', aliases: [], mentions: [], ambiguity: 'None.', dates: [], parent: null }),
];

/** One play, with everything a real one carries — what chapter 3 shows and chapter 4 starts from. */
export const LEAD_PLAY_ID = 'guide_play_count';

export const PLAYS: readonly Artefact[] = [
  artefact(LEAD_PLAY_ID, 'exploit', 'Count every early arrival as a breakfast', 'Schools record every child in the building before the bell as attending the club.', scored({
    actorId: ACTOR_SCHOOLS,
    motivation: 'Each name on the return is £1.20, and the club is cheaper to run than the count suggests.',
    play: 'The school opens its doors at 8am, counts every child who arrives early as a club attendee, and serves breakfast to whoever asks. The monthly return is accurate about who was in the building and silent about who ate.',
    legality: 'grey',
    targets: ['guide_part_payment', 'guide_part_return'],
    preconditions: [ASSUMPTION_SAMPLE],
    payoff: 'Funding for many more breakfasts than are served.',
    costToPolicy: 'Money meant to feed hungry children pays for a register instead, and the figures say the policy is working.',
    incentive: 0.8, ease: 0.8, impact: 0.6, concealment: 0.7,
    earlyWarning: 'Attendance that matches the number of pupils arriving early, rather than the food bought.',
    counter: 'Pay against breakfasts served — food bought, or a count at the table — not against arrivals.',
    precedent: 'Payment-per-head schemes have often been claimed against attendance rather than use.',
    precedentBasis: 'unverified_recall',
    plain: {
      who: 'Primary schools, which run the clubs and count who comes.',
      does: 'They count every child who arrives before the bell as having had breakfast.',
      goesWrong: 'The Department pays for breakfasts nobody ate, and a hungry child is no more likely to be fed.',
      likeWhen: 'A gym charging for every member who walks past the door.',
      whyItMatters: 'The money meant to feed children pays for a headcount, and the figures say it is working.',
    },
  }), [ASSUMPTION_SAMPLE]),
  artefact('guide_play_lapse', 'exploit', 'Let the costly clubs quietly lapse', 'Small schools, whose club costs more than £1.20 a pupil, run it on paper and close it in practice.', scored({
    actorId: ACTOR_SCHOOLS,
    motivation: 'A small club loses money on every breakfast.',
    play: 'The club is listed on the timetable but staffed only on the days it can be covered for free.',
    legality: 'grey', targets: ['guide_part_payment'], preconditions: [ASSUMPTION_FLAT],
    payoff: 'No loss on a club the school cannot afford.',
    costToPolicy: 'Children in small and rural schools lose the club first.',
    incentive: 0.7, ease: 0.6, impact: 0.5, concealment: 0.4,
    earlyWarning: 'Small schools claiming far fewer breakfasts than their size suggests.',
    counter: 'A minimum payment per club, as well as per pupil.',
    precedent: 'None recorded.', precedentBasis: 'none',
    plain: {
      who: 'Small primary schools.',
      does: 'They keep the club on paper and close it on the days it costs money.',
      goesWrong: 'Children in small and rural schools lose their breakfast first.',
      likeWhen: null,
      whyItMatters: 'The policy promises every child, and the ones it misses are the hardest to reach.',
    },
  }), [ASSUMPTION_FLAT]),
  artefact('guide_play_childcare', 'exploit', 'Use the club as free early childcare', 'Parents who could feed their children at home use the club as free care before work.', scored({
    actorId: ACTOR_PARENTS,
    motivation: 'Free care from 8am saves a working parent money every week.',
    play: 'Parents book their children in for the early start, whether or not they need the breakfast.',
    legality: 'compliant', targets: ['guide_part_club'], preconditions: [ASSUMPTION_OPEN],
    payoff: 'Free care before work.',
    costToPolicy: 'Places fill with children who would have eaten anyway.',
    incentive: 0.6, ease: 0.9, impact: 0.3, concealment: 0.3,
    earlyWarning: 'Clubs full by the first week of term in better-off areas.',
    counter: 'Keep a share of places for the children the school knows need breakfast.',
    precedent: 'None recorded.', precedentBasis: 'none',
    plain: {
      who: 'Working parents.',
      does: 'They use the club as free care before work.',
      goesWrong: 'Places fill up with children who would have eaten at home.',
      likeWhen: 'Free parking meant for shoppers filling with commuters.',
      whyItMatters: 'The children the club was for may not get a place.',
    },
  }), [ASSUMPTION_OPEN]),
  artefact('guide_play_ghost', 'exploit', 'Claim for a club that has stopped running', 'A school that has closed its club keeps sending the same monthly return.', scored({
    actorId: ACTOR_SCHOOLS,
    motivation: 'The payment keeps coming until someone looks.',
    play: 'The return is copied forward each month after the club stops.',
    legality: 'breach', targets: ['guide_part_return'], preconditions: [ASSUMPTION_SAMPLE],
    payoff: 'Payment for a club that no longer exists.',
    costToPolicy: 'Money paid out for nothing, found a year later at best.',
    incentive: 0.6, ease: 0.5, impact: 0.4, concealment: 0.5,
    earlyWarning: 'Returns that are identical month after month.',
    counter: 'Spot checks without notice, and flags on identical returns.',
    precedent: 'None recorded.', precedentBasis: 'none',
    plain: {
      who: 'A school whose club has closed.',
      does: 'It keeps sending last month’s count.',
      goesWrong: 'The Department pays for breakfasts that do not exist.',
      likeWhen: 'Claiming for a magazine subscription you cancelled.',
      whyItMatters: 'It breaks a rule, but a yearly sample may not catch it for months.',
    },
  }), [ASSUMPTION_SAMPLE]),
];

/**
 * ONE CONCLUSION, so chapter 5 can show the OTHER direction. A play that needs
 * a failed assumption is good news — taken off the table. A conclusion that
 * RESTS on one is bad news — it loses its footing. The report keeps the two
 * apart and so does the guide.
 */
export const FINDINGS: readonly Artefact[] = [
  artefact('guide_finding_small', 'finding', 'Small schools will run the thinnest clubs', 'Because the payment is flat, small schools are paid least for the same fixed costs.', {
    section: 'exploitation', resultIds: ['guide_play_lapse'], hypothesisIds: [ASSUMPTION_FLAT],
    revision: 'initial', reviewedFindingIds: [], challengeIds: [], judgement: 'unknown',
  }, [ASSUMPTION_FLAT, 'guide_play_lapse']),
];

/** Everything chapter 5 runs the stress test over: the guide's whole "assessment". */
export const MINI_ASSESSMENT: readonly Artefact[] = [...ASSUMPTIONS, ...ACTORS, ...PLAYS, ...FINDINGS];

export const leadPlay = (): Artefact => PLAYS.find((a) => a.id === LEAD_PLAY_ID)!;

// ── Chapter 1: the story of one weak point ───────────────────────────────────

/**
 * CHAPTER 1 IS A STORY, NOT A DIAGRAM (phase 28). The first version drew the
 * policy as a box of three "levers" with a figure walking round it, and nothing
 * in the box ever moved — a reader could not tell what a lever was, who pulled
 * it or what went wrong. This tells the lead play (`LEAD_PLAY_ID`) as seven
 * beats over ONE persistent picture, the way the Data Spine's opening does:
 * the policy working as promised, where its money comes from, who keeps the
 * count, the same facts read as the school would, the lever pulled, nobody
 * noticing, and finally what the report writes down.
 *
 * The numbers are the picture's: eight children come for breakfast, four more
 * arrive early, and the payment is the paper's £1.20. Each beat's words carry
 * everything the picture shows, so the picture can be hidden from a screen
 * reader without losing anything (`StoryOpening.tsx`).
 */
export const STORY_PAY = 1.2;
export const STORY_EATEN = 8;
export const STORY_EARLY = 4;

export type StoryBeat = { title: string; body: readonly string[] };

export const STORY: readonly StoryBeat[] = [
  {
    title: 'The promise',
    body: [
      `${MINI_POLICY.title}: every primary school runs a free breakfast club before lessons, and the Department pays for it.`,
      'Eight children come for breakfast. So far everything works the way the paper says it will.',
    ],
  },
  {
    title: 'Follow the money',
    body: [
      'The Department pays the school £1.20 for every pupil who attends, whatever the club costs to run.',
      'So the whole payment rests on one number: how many came. Eight children, £9.60 a day.',
    ],
  },
  {
    title: 'Who keeps the count?',
    body: [
      'The school counts who comes and sends the number in every month. The only check is the council’s: a sample of returns, once a year.',
      'Whoever keeps the count decides the payment.',
    ],
  },
  {
    title: 'Read it as the school would',
    body: [
      'This is where a red team starts. It stops asking “does the policy work?” and asks “who could make it work for them?”',
      'To the school, every name on the return is £1.20. And four more children are in the building early every morning, waiting for the bell.',
    ],
  },
  {
    title: 'Pull the lever',
    body: [
      'So the school counts every child who arrives before the bell. Nothing on the return is false: twelve children were there. It just does not say who ate.',
      'The Department now pays for twelve breakfasts a day. Eight are eaten.',
    ],
  },
  {
    title: 'Nobody notices',
    body: [
      'The figures say the policy is working: more children every month.',
      'The council’s sample checks that the children on the return were in school, and they were. The gap never shows where anyone looks.',
    ],
  },
  {
    title: 'What the report writes down',
    body: [
      'That is one way to beat the policy, and a report writes it down like this.',
    ],
  },
];

/**
 * The other ways to beat the made-up policy, pinned on the picture at the
 * last beat: the same plays chapters 3 to 5 use, each at the part it pulls on.
 */
export const STORY_PINS: readonly { playId: string; where: 'money' | 'children' | 'count' }[] = [
  { playId: 'guide_play_lapse', where: 'money' },
  { playId: 'guide_play_childcare', where: 'children' },
  { playId: 'guide_play_ghost', where: 'count' },
];

// ── Chapter 4: the four factors ──────────────────────────────────────────────

export type FactorKey = 'ease' | 'concealment' | 'incentive' | 'impact';

/**
 * THE FOUR SLIDERS, in the order the brief names them, with the question each
 * asks in a reader's words. The KEYS are the pipeline's (`EXPOSURE_FACTORS`)
 * and the test proves they are the same four, so a renamed factor fails here
 * rather than silently feeding `exposureOf` a zero.
 */
export const FACTORS: readonly { key: FactorKey; label: string; hint: string; low: string; high: string }[] = [
  { key: 'ease', label: 'How easy is it to do?', hint: 'How little effort, skill or money it takes.', low: 'very hard', high: 'very easy' },
  { key: 'concealment', label: 'How hard is it to spot?', hint: 'How poorly the policy would notice. Even an open move keeps a little weight here.', low: 'in plain sight', high: 'invisible' },
  { key: 'incentive', label: 'How much do they gain?', hint: 'What the body or group gets out of it.', low: 'nothing', high: 'a great deal' },
  { key: 'impact', label: 'How much does it hurt the policy?', hint: 'How much of what the policy is for it defeats.', low: 'no harm', high: 'defeats it' },
];

export type Factors = Record<FactorKey, number>;

/** The lead play's four scores — where chapter 4's sliders start. */
export function leadFactors(): Factors {
  const data = leadPlay().data;
  return { ease: Number(data.ease), concealment: Number(data.concealment), incentive: Number(data.incentive), impact: Number(data.impact) };
}

/** A factor value in words, for a slider's `aria-valuetext`. */
export function factorWords(value: number, factor: { low: string; high: string }): string {
  const level = value >= 0.8 ? 'high' : value >= 0.6 ? 'fairly high' : value >= 0.4 ? 'middling' : value >= 0.2 ? 'fairly low' : 'low';
  return `${value.toFixed(2)}, ${level} (0 is ${factor.low}, 1 is ${factor.high})`;
}

/** The score and band the REPORT would give these four values. */
export function bandFor(factors: Factors): { exposure: number; band: Band; note: string } {
  const exposure = exposureOf(factors);
  const row = bandOf(exposure);
  return { exposure, band: row.band, note: row.note };
}

/** The four bands as stretches of the 0–1 scale, lowest first — the key both renderers draw. */
export function bandStretches(): { band: Band; from: number; to: number; note: string }[] {
  const ascending = [...BANDS].sort((a, b) => a.floor - b.floor);
  return ascending.map((row, i) => ({ band: row.band, from: row.floor, to: ascending[i + 1]?.floor ?? 1, note: row.note }));
}

// ── Chapter 6: bodies across policies ────────────────────────────────────────

export type MiniPaper = { id: string; title: string; asks: { body: string; ask: string }[] };

/**
 * THREE TINY POLICIES, ONE BODY IN TWO OF THEM. Local councils are asked to
 * CHECK clubs in one paper and to RUN them in another — the clash the
 * Bodies across policies hub finds across real papers: the same team asked to
 * be the inspector here and the provider there.
 */
export const CLASH_BODY = 'Local councils';

export const MINI_PAPERS: readonly MiniPaper[] = [
  { id: 'breakfast', title: MINI_POLICY.title, asks: [{ body: CLASH_BODY, ask: 'Check a sample of schools’ breakfast returns' }, { body: 'Primary schools', ask: 'Run the club and count who comes' }] },
  { id: 'holiday', title: 'Holiday Food and Fun', asks: [{ body: CLASH_BODY, ask: 'Run holiday clubs and decide who gets a place' }] },
  { id: 'uniform', title: 'Uniform Grant', asks: [{ body: 'Primary schools', ask: 'Keep uniform costs down' }] },
];

/** The papers that ask something of a body, and what. */
export function asksOf(body: string): { paper: MiniPaper; ask: string }[] {
  return MINI_PAPERS.flatMap((paper) => paper.asks.filter((a) => a.body === body).map((a) => ({ paper, ask: a.ask })));
}

/** The register's two trees, in one picture: a team is PART OF a council; a county council is a KIND OF local council. */
export const REGISTER_EXAMPLE = {
  partOf: { child: 'Children’s services', parent: 'A local council' },
  kindOf: { child: 'County councils', parent: 'Local councils' },
} as const;

// ── The chapters ─────────────────────────────────────────────────────────────

export type Chapter = {
  /** Its number, which is also its address: `/guide/<n>`. */
  n: number;
  title: string;
  /** The question the chapter answers, for the contents list. */
  question: string;
  /**
   * WHAT THE CHAPTER TEACHES, as plain paragraphs. The guide prints these
   * beside its interactive figure; the offline pack prints them alone, so they
   * must make sense without anything to press.
   */
  takeaway: readonly string[];
};

export const CHAPTERS: readonly Chapter[] = [
  {
    n: 1, title: 'What a red team does',
    question: 'What is this report for?',
    takeaway: [
      'A red team reads a policy the way someone trying to get round it would. It treats the policy as a machine with levers — money, rules, counts, checks — and asks who could pull them for their own ends.',
      'It finds weak points; it is not a prediction. A report full of ways to beat a policy does not say anyone will use them, and a short report does not say the policy is safe.',
    ],
  },
  {
    n: 2, title: 'From paper to parts',
    question: 'Where do the things in the report come from?',
    takeaway: [
      'The first steps of a run read the paper sentence by sentence and pull out three kinds of thing: parts of the policy (what it sets up), assumptions (what it takes for granted) and bodies (who it gives a job to).',
      'Everything later in the report is built from these, and every item can be traced back to the sentence it came from.',
    ],
  },
  {
    n: 3, title: 'A way to beat it, in plain words',
    question: 'How do I read one way to beat the policy?',
    takeaway: [
      'Each way to beat the policy opens with five short lines: who, what they do, what goes wrong and for whom, what it is like, and why it matters.',
      'The detail sits underneath: how it would be run, what it would cost the policy, how you would spot it and what would close it. Many ways to beat a policy break no rule — "inside the rules" is often the most important thing on the card.',
    ],
  },
  {
    n: 4, title: 'How exposed? Build the band yourself',
    question: 'Why is one way to beat it "severe" and another "limited"?',
    takeaway: [
      'Every way to beat the policy is scored on four things, each from 0 to 1: how easy it is, how hard it is to spot, how much the body gains and how much it hurts the policy.',
      'The score is the geometric mean of the four, so one very low factor pulls the whole score down: nobody runs a move with nothing in it for them. Being easy to spot never takes a move off the table — an open move still counts. The score then falls into one of four bands: severe from 0.7, significant from 0.5, moderate from 0.3, and limited below that.',
    ],
  },
  {
    n: 5, title: 'What if we’re wrong?',
    question: 'What happens if one of the policy’s assumptions turns out false?',
    takeaway: [
      'Every way to beat the policy names what has to be true for it to work, and every conclusion names what it rests on. Switch an assumption off and the report works out what changes, from links it already made — no new guess is involved.',
      'The two directions are opposite. A way to beat it that needed the assumption is taken off the table, which is good news for the policy. A conclusion that rested on it loses its footing, which means it is no longer supported, not that it is wrong.',
    ],
  },
  {
    n: 6, title: 'Bodies across policies',
    question: 'What does it mean when a body turns up in several papers?',
    takeaway: [
      'The same body — a council, a regulator, a department — is often given jobs by several policies. Seen side by side, those jobs can clash: asked to check something in one paper and to run it in another.',
      'Bodies are kept on one list with two kinds of link: part of (a team is part of a council) and kind of (a county council is a kind of local council). What other papers say about a body is context, never evidence about the paper in front of you.',
    ],
  },
];

export const chapterPath = (chapter: Pick<Chapter, 'n'>) => guideChapter(chapter.n);

/**
 * THE "?" BESIDE A REPORT FIGURE, AND WHICH CHAPTER IT OPENS.
 *
 * Kept to the leads where a chapter answers the question the figure raises —
 * a "?" on every heading is litter, and a reader stops seeing it. Keyed by the
 * report's section ids (`Report.tsx`'s `section`/`lead` calls).
 */
export const HELP_FOR_SECTION: Readonly<Record<string, number>> = {
  mechanisms: 2, // the parts of the policy most ways to beat it rest on
  weights: 3, // the ranked ways to beat it, each card with its plain block
  bands: 4, // how exposed the policy is — the band bar
  stress: 5, // what if we are wrong
  interplay: 6, // who is coming for what — the bodies
};

export const chapterByNumber = (n: number): Chapter | undefined => CHAPTERS.find((c) => c.n === n);
