/**
 * The assessment as a document, for Word and for anything else that wants prose.
 *
 * The dashboard is a dashboard: figures, hover cards, a drill. None of that
 * survives being emailed to somebody who needs to read it on a train, and a
 * printed PDF is not a thing a colleague can mark up and send back. So the same
 * artefacts render a second time, as a linear document, and this module is that
 * rendering.
 *
 * PURE, and markdown, for three reasons that all turned out to be the same one.
 * It can be asserted in a test without a database or a headless browser; the
 * SHARED copy can render the identical document simply by handing it the
 * redacted artefact list, so the two can never drift; and the repo already turns
 * markdown into .docx through `synthesize()`, which is how
 * `/projects/dfe-data-strategy` produces its Word brief. Writing an OOXML
 * builder here would be a second one of those.
 *
 * The ORDER is the report's own five acts, not the dashboard's tab strip. A
 * document is read front to back and a dashboard is not, so the exploitation
 * playbook comes after the verdict it explains rather than in a tab beside it.
 */
import type { Artefact } from './contracts';
import { KEY_SECTIONS, READING_CHAIN } from './glossary';
import { beyond, destroyed, headline as handlingHeadline, journey, kept, PLACE_LABEL } from './handling';
import { REPORT_ACTS, actorBoard, addenda, evidenceMix, fragileAssumptions, findingsBySection, headline, isShortProfile, of, plays, precedentOf, recommendations as reportRecommendations, BAND_LABEL, type Band, type PassRow } from './view';
import { checks } from './view';
import { isBody, network } from './network';
import { adjacency } from './matrix';
import { briefItems, type Brief, type BriefItem } from '../brief';

export type DocMeta = {
  title: string;
  jurisdiction?: string | null;
  policyArea?: string | null;
  depth?: string | null;
  status?: string | null;
  completedAt?: string | Date | null;
  /** Whether the assessment was sealed. Changes what the handling note can promise. */
  sealed?: boolean;
  /**
   * Whether it actually searched. An unsealed run always does; a sealed one only
   * if the reader allowed it, and the exported document has to say which — a
   * paper that lands on somebody's desk has nobody to ask.
   */
  searched?: boolean;
  /**
   * Material attached after the report, so an exported copy cannot omit that a
   * conclusion in it has since been overturned.
   *
   * A Word file lands on somebody's desk with nobody to ask — the same reason
   * the key and the handling note are in it. Of everything in this document,
   * "the finding you are reading no longer stands" is the one an export must
   * not silently drop.
   */
  passes?: PassRow[];
  /** Named on the cover so a shared copy never claims to be the whole thing. */
  withheld?: string[];
  /** Gaps the assessment reported about itself. Printed, never quietly dropped. */
  warnings?: { stage: string; text: string }[];
};

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const date = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/** Markdown is whitespace-sensitive in exactly one way that matters: blank lines. */
function block(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => Boolean(l)).join('\n\n');
}

/**
 * The standing frame, printed on every copy.
 *
 * The reader of an exported document is by definition NOT at the dashboard,
 * where the strap above each section says what it is. Somebody forwarded this to
 * them. So the one thing they must not have to infer — that this is an
 * adversarial read and not an assurance review — is stated on page one.
 */
const FRAME = [
  'This is a **red-team assessment**. It reads the paper the way a body governed by it would:',
  'looking for what can be done, within the rules as written, by a body serving itself.',
  'It is not an assurance review, it does not assume anyone intends any of this, and it will',
  'not tell you the policy is fine. Where it says a body *would* do something, that is a',
  'hypothesis about incentives — arguable, and marked as such throughout.',
].join(' ');

function cover(meta: DocMeta, artefacts: Artefact[]): string {
  const list = plays(artefacts);
  const severe = list.filter((p) => p.band === 'severe' || p.band === 'significant').length;
  const failing = of(artefacts, 'test').filter((t) => ['high_risk', 'moderate_risk'].includes(String(t.data.result)));
  // Depth is OMITTED when it is not known rather than defaulted. A shared copy
  // is not handed `depth` — `resolveShare` does not carry it — and a ternary
  // printed "Standard enquiry" on a deep assessment, which is a false statement
  // about the run in the one document a reader cannot check against the page.
  const depth = meta.depth === 'deep' ? 'Deep enquiry' : meta.depth === 'standard' ? 'Standard enquiry' : null;
  const context = [meta.jurisdiction, meta.policyArea, depth].filter(Boolean).join(' · ');
  const done = date(meta.completedAt);

  return block([
    `# ${meta.title}`,
    context || null,
    FRAME,
    '## At a glance',
    [
      `- **${list.length}** way${list.length === 1 ? '' : 's'} to beat the policy${severe ? `, of which **${severe}** are severe or significant` : ''}`,
      `- **${of(artefacts, 'profile').length}** bodies and groups profiled for what actually moves them`,
      `- **${failing.length}** of ${of(artefacts, 'test').length} checks on how the policy is set up fell short`,
      `- **${of(artefacts, 'evidence').filter((e) => ['insufficient', 'contradicts'].includes(String(e.data.result))).length}** of ${of(artefacts, 'evidence').length} evidence links are unsupported or disputed`,
      done ? `- Assessment completed ${done}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    meta.withheld?.length
      ? `> **This is a shared copy.** It withholds ${meta.withheld.join(', ')}. References to withheld material have been removed rather than left dangling.`
      : null,
  ]);
}

/** The verdict, in full — the one section a document must not summarise. */
function verdict(artefacts: Artefact[]): string {
  const lead = headline(artefacts);
  if (!lead) return block(['## The verdict', 'The assessment did not reach a conclusion. What follows is what it established before it stopped.']);
  return block(['## The verdict', lead.statement]);
}

/**
 * Where it has happened before, and whether that was checked.
 *
 * A Word file lands on somebody's desk with nobody to ask, so a precedent from
 * the model's own recall says so in the same line — "not checked" — or it
 * would read as evidence in the one copy nobody can query.
 */
function precedentLine(play: Artefact): string | null {
  const { text, label } = precedentOf(play);
  if (!clean(text)) return null;
  return `**Where it has happened before.** ${clean(text)}${label ? ` *(${label}.)*` : ''}`;
}

/**
 * ONE JUDGEMENT, AS MARKDOWN — the same rows the page's brief draws, so the
 * brief's Word file and the full document cannot describe a judgement two
 * ways. `full` adds the two rows the brief leaves out for length: the
 * assumption it rests on and the decision it bears on.
 */
function itemMarkdown(item: BriefItem, full: boolean): string {
  const play = item.play;
  const act = [clean(item.owner), clean(item.action)].filter(Boolean).join(': ');
  return block([
    `### ${item.rank}. ${clean(item.title)}`,
    `**${clean(item.statement)}**`,
    item.quote ? `> “${clean(item.quote.text)}”${item.quote.page ? ` (page ${item.quote.page})` : ''}` : null,
    [
      item.about && `- **Part of the policy.** ${clean(item.about.label)}`,
      play && `- **The way to beat it.** ${clean(play.artefact.label)} — ${BAND_LABEL[play.band].toLowerCase()}, ${play.pattern.toLowerCase()}.${item.morePlays ? ` It names ${item.morePlays} more.` : ''}`,
      play?.earlyWarning && `- **Early warning.** ${play.earlyWarning}`,
      play?.fix && `- **The fix.** ${play.fix}`,
      full && item.restsOn && `- **What it rests on.** ${clean(item.restsOn.label)}`,
      item.wouldChangeIf && `- **What would change our mind.** ${clean(item.wouldChangeIf)}`,
      full && item.decision && `- **The decision it bears on.** ${clean(item.decision)}`,
      act && (item.owner ? `- **Who should act.** ${act}` : `- **What to do.** ${act}`),
    ].filter(Boolean).join('\n'),
  ]);
}

/** "Key judgements", or on an older assessment the findings that stand in for them. */
const itemsHeading = (source: Brief['source']) => (source === 'judgements' ? 'Key judgements' : 'The findings that matter most');

/**
 * WHAT MATTERS MOST, straight after the verdict.
 *
 * `briefItems` — the list the page and the pack lead with too: the key
 * judgements, or on an assessment written before them, the ranked findings.
 * The Word file used to lead with key judgements only, so an older assessment's
 * document led with nothing while its page led with five findings.
 */
function judgements(artefacts: Artefact[]): string {
  const { source, items } = briefItems(artefacts);
  if (!items.length) return '';
  return block([
    `## ${itemsHeading(source)}`,
    source === 'judgements'
      ? 'The few things that matter most in this assessment, most important first. Each names the part of the policy it is about, the way to beat it that shows it, and who should act.'
      : 'This assessment was written before key judgements, so these are its highest-ranked findings, each with the worst way to beat the policy it touches.',
    ...items.map((item) => itemMarkdown(item, true)),
  ]);
}

function playbook(artefacts: Artefact[]): string {
  const list = plays(artefacts);
  if (!list.length) return '';
  const rows = list.map((play, index) => {
    const d = play.artefact.data as Record<string, unknown>;
    const legality =
      d.legality === 'compliant'
        ? 'Stays within the rules as written'
        : d.legality === 'grey'
          ? 'Arguable either way'
          : 'Would be a breach';
    return block([
      `### ${index + 1}. ${play.artefact.label}`,
      `**${BAND_LABEL[play.band as Band] ?? play.band} · score ${Math.round(play.exposure * 100)}** — ${play.actor?.label ?? 'body not identified'}. ${legality}.`,
      play.artefact.statement,
      `Incentive ${Math.round(Number(d.incentive) * 100)} · ease ${Math.round(Number(d.ease) * 100)} · impact ${Math.round(Number(d.impact) * 100)} · concealment ${Math.round(Number(d.concealment) * 100)}. The score is the even blend of the four, and says how bad it would be, not how likely.`,
      clean(d.payoff) && `**What they get.** ${clean(d.payoff)}`,
      clean(d.costToPolicy) && `**What it costs the policy.** ${clean(d.costToPolicy)}`,
      clean(d.earlyWarning) && `**Early warning.** ${clean(d.earlyWarning)}`,
      clean(d.counter) && `**The fix.** ${clean(d.counter)}`,
      precedentLine(play.artefact),
    ]);
  });
  return block([
    '## Ways to beat the policy',
    'Each is something a body named in the policy could do to serve itself at the policy’s expense, ranked by the even blend of how much the body gains, how easily it can be done, how much of the aim it destroys, and how poorly the policy would notice.',
    ...rows,
  ]);
}

function cast(artefacts: Artefact[]): string {
  const board = actorBoard(artefacts, plays(artefacts));
  if (!board.length) return '';
  const PERSONA: [string, string][] = [
    ['accountableTo', 'Answers to'],
    ['successCriteria', 'Judged on'],
    ['timeHorizon', 'Can look ahead'],
    ['outsideOption', 'Does instead'],
    ['gainFromFailure', 'Better off if it fails'],
  ];
  // What a SHORT profile carries instead: role, wants and powers. Without this a
  // body with a short profile read "No incentive profile was built", which is
  // false — one was, in five fields rather than twenty-one.
  const SHORT: [string, string][] = [
    ['formalRole', 'Role'],
    ['operationalObjectives', 'Its position rewards'],
    ['legalPowers', 'Can compel or block'],
  ];
  const rows = board.map((view) => {
    const fields = (isShortProfile(view.profile) ? SHORT : PERSONA).map(([key, label]) => {
      const raw = view.profile?.data?.[key] as { value?: string } | undefined;
      return raw?.value ? `- **${label}.** ${clean(raw.value)}` : null;
    }).filter(Boolean);
    return block([
      `### ${view.actor.label}`,
      clean(view.actor.data.entityType).replaceAll('_', ' ') || null,
      fields.length ? fields.join('\n') : 'No incentive profile was built for this body.',
      view.plays.length
        ? `Ways to beat it open to this body: ${view.plays.map((p) => `${p.artefact.label} (${BAND_LABEL[p.band as Band] ?? p.band})`).join('; ')}.`
        : 'No way to beat the policy was found for this body. That is a finding, not a guarantee.',
    ]);
  });
  return block(['## Who is involved', 'What each body says it wants, what its position rewards, who it answers to, and who is better off if this policy fails.', ...rows]);
}

function structure(artefacts: Artefact[]): string {
  const rows = checks(artefacts);
  if (!rows.length) return '';
  const words: Record<string, string> = {
    high_risk: 'High risk',
    moderate_risk: 'Moderate risk',
    low_risk: 'Relationship present',
    indeterminate: 'No evidence either way',
  };
  return block([
    '## Checks on how the policy is set up',
    'These are the only figures in this document no model produced. Each follows the relationships the policy states and asks whether what it depends on is there. **A check with nothing to look at is not a pass.**',
    ...rows.map((check) =>
      block([
        `### ${check.label} — ${words[String(check.data.result)] ?? 'unknown'}`,
        check.statement,
        clean(check.data.mitigation) && `*${clean(check.data.mitigation)}*`,
      ]),
    ),
  ]);
}

function relationships(artefacts: Artefact[]): string {
  const net = network(artefacts);
  if (!net.edges.length) return '';
  const bodies = net.nodes.filter(isBody).length;
  // How many relationships run between two BODIES is the fact the page leads
  // with and the one a printed pack could not previously be read for: a paper
  // where almost none do has described who benefits and what will be done
  // without describing who answers to whom.
  const placeable = adjacency(net).placeable;
  return block([
    '## How they connect',
    `${bodies} bodies and ${net.nodes.length - bodies} parts of the policy, ${net.edges.length} stated relationships between them — of which ${placeable} run between two bodies.`,
    ...net.insights.map((insight) =>
      block([
        `### ${insight.headline}`,
        insight.reading,
        insight.subjects.map((s) => `- **${s.label}** — ${s.note}`).join('\n'),
      ]),
    ),
  ]);
}

function foundations(artefacts: Artefact[]): string {
  const fragile = fragileAssumptions(artefacts).slice(0, 10);
  const mix = evidenceMix(artefacts).filter((m) => m.count);
  if (!fragile.length && !mix.length) return '';
  return block([
    '## What it rests on',
    fragile.length
      ? block([
          '### The assumptions most likely to change the conclusion',
          fragile
            .map(
              (a) =>
                `- **${a.label}** — importance ${Math.round(Number(a.data.importance) * 100)}%, uncertainty ${Math.round(Number(a.data.uncertainty) * 100)}%, consequence ${Math.round(Number(a.data.consequence) * 100)}%. ${clean(a.statement)}`,
            )
            .join('\n'),
        ])
      : null,
    mix.length
      ? block([
          '### The evidence behind the claims',
          mix.map((m) => `- **${m.count}** ${m.label.toLowerCase()}`).join('\n'),
          'An "insufficient" result is the honest answer for most claims in most policy papers. It is not a criticism of the claim; it means the assessment cannot help you defend it if it is challenged.',
        ])
      : null,
  ]);
}

function scenarios(artefacts: Artefact[]): string {
  const rows = of(artefacts, 'scenario');
  if (!rows.length) return '';
  return block([
    '## Conditions the policy has to survive',
    ...rows.map((s) =>
      block([
        `### ${clean(s.data.scenario).replaceAll('_', ' ')} — ${s.label}`,
        s.statement,
        clean(s.data.changedConditions) && `**What changes.** ${clean(s.data.changedConditions)}`,
        clean(s.data.strategy) && `**The first move.** ${clean(s.data.strategy)}`,
        strings(s.data.downstreamEffects).length > 0 &&
          `**What follows.**\n${strings(s.data.downstreamEffects).map((e) => `- ${clean(e)}`).join('\n')}`,
        clean(s.data.detectability) && `**Would anyone see it?** ${clean(s.data.detectability)}`,
        clean(s.data.correction) && `**What would correct it.** ${clean(s.data.correction)}`,
      ]),
    ),
  ]);
}

/** The written chapters, in the report's own five acts. */
function chapters(artefacts: Artefact[]): string {
  const bySection = new Map(findingsBySection(artefacts).map((s) => [s.section, s]));
  const recommendations = reportRecommendations(artefacts);
  const acts = REPORT_ACTS.map((act) => {
    const parts = act.sections
      .map((section) => bySection.get(section))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((chapter) =>
        block([`### ${chapter.label}`, ...chapter.items.map((item) => block([`**${item.label}.** ${item.statement}`]))]),
      );
    return parts.length ? block([`## ${act.title}`, act.strap, ...parts]) : '';
  }).filter(Boolean);

  const recs = recommendations.length
    ? block([
        '## What it recommends',
        ...recommendations.map((r) =>
          block([
            `### ${r.label}`,
            r.statement,
            clean(r.data.change) && `**The change.** ${clean(r.data.change)}`,
            clean(r.data.tradeoffs) && `**What it costs.** ${clean(r.data.tradeoffs)}`,
            clean(r.data.validationNeeded) && `**Before adopting it.** ${clean(r.data.validationNeeded)}`,
          ]),
        ),
      ])
    : '';

  // With the key judgements (or the findings that stand in for them) leading
  // the document, the nineteen sections are the appendix that backs them — said in a heading, so a reader who reaches them
  // knows they are the working and not a second verdict.
  const appendix = briefItems(artefacts).items.length && (acts.length || recs)
    ? block(['## Appendix: the assessment in full', 'Every section of the assessment, which what leads this document is drawn from.'])
    : '';
  return block([appendix, ...acts, recs]);
}

/**
 * WHAT CAME AFTER — material attached once this report was written.
 *
 * Placed after the chapters and before the limits, which is where it belongs in
 * the argument: the report says what it concluded, this says which of those
 * conclusions have since moved, and the limits say what none of it could
 * settle. Absent entirely when nothing was attached.
 *
 * Note it reads `findingsBySection` nowhere: if the report has been RESTATED,
 * the chapters above are already the restated ones — `latestGeneration` in
 * `view.ts` sees to that — and this chapter is the record of how they got that
 * way rather than a correction to them.
 */
function afterwards(artefacts: Artefact[], meta: DocMeta): string {
  const views = addenda(artefacts, meta.passes ?? []).filter((v) => v.status === 'completed');
  if (!views.length) return '';
  return block([
    '## What came after this was written',
    'Documents attached to this assessment after it reported, and what reading them did to its conclusions. Nothing above was rewritten by them: a judgement here is recorded beside a conclusion, not applied to it.',
    ...views.map((v) =>
      block([
        `### Addendum ${String(v.pass).padStart(2, '0')} — ${v.roleLabel}`,
        v.summary ? clean(v.summary.statement) : '',
        `${v.passages} passage${v.passages === 1 ? '' : 's'} read; ${v.moved} conclusion${v.moved === 1 ? '' : 's'} moved.`,
        ...v.revisions.map((r) =>
          block([
            `**${r.status.replace(/^./, (c) => c.toUpperCase())} — ${clean(r.target?.label ?? r.artefact.label)}.** ${clean(r.artefact.data.reason) || clean(r.artefact.statement)}`,
            clean(r.artefact.data.actionNeeded) && `*What to do.* ${clean(r.artefact.data.actionNeeded)}`,
          ]),
        ),
        v.revisions.length ? '' : 'Nothing in this material bears on a conclusion. It was read in full and produced no judgement for or against any finding, recommendation or play.',
      ]),
    ),
  ]);
}

/** What the assessment could not establish. Never dropped — a silent omission is worse. */
function limits(meta: DocMeta): string {
  if (!meta.warnings?.length) return '';
  return block([
    '## What it could not establish',
    'Every limit the run recorded about itself, in the order the stages ran.',
    meta.warnings.map((w) => `- *${w.stage}* — ${w.text}`).join('\n'),
  ]);
}


/**
 * THE KEY, AS AN APPENDIX.
 *
 * The exported document uses the same vocabulary as the page — plays, exposure,
 * concealment, standing, structural checks — and until now defined none of it.
 * A Word file lands on somebody's desk with nobody to ask, which makes the
 * appendix more necessary in the export than it is on screen, where a hover
 * card is one pointer away.
 *
 * It renders from `glossary.ts`, the same module `KeyPanel.svelte` reads, so the
 * screen and the document cannot drift into two different definitions of
 * "exposure".
 */
function key(): string {
  const sections = KEY_SECTIONS.map((section) =>
    block([
      `### ${section.title}`,
      section.blurb,
      // ONE PARAGRAPH PER TERM, not a four-item sub-list. As nested bullets the
      // appendix ran to about eight Word pages on its own and dwarfed the
      // assessment it was appended to; the same words as a run-on paragraph are
      // half the length and read better in a document than on a screen.
      section.terms
        .map((t) => {
          const name = t.plain && t.plain !== t.label ? `**${t.plain}** (${t.label.toLowerCase()})` : `**${t.label}**`;
          const parts = [`${name} — ${t.what}`, t.why, `Reading it: ${t.read}`];
          if (t.formula) parts.push(`Worked out as: ${t.formula}`);
          return `- ${parts.join(' ')} *(${t.provenance})*`;
        })
        .join('\n'),
    ]),
  );

  return block([
    '## How to read this assessment',
    'This is a game-theoretic read of a policy paper, and its vocabulary says so. Everything the document uses is defined here, with the arithmetic written out wherever a figure is computed rather than judged.',
    '### How the pieces join',
    READING_CHAIN.map((link, i) => `${i + 1}. **${link.step}** ${link.then}`).join('\n'),
    ...sections,
  ]);
}

/**
 * The whole document.
 *
 * Sections that produced nothing are absent rather than present-and-empty: a
 * heading with "no data" under it in a Word file reads as a defect in the
 * export, and the cover already says what the run reached.
 */
export function assessmentMarkdown(artefacts: Artefact[], meta: DocMeta): string {
  return block([
    cover(meta, artefacts),
    verdict(artefacts),
    judgements(artefacts),
    playbook(artefacts),
    cast(artefacts),
    relationships(artefacts),
    foundations(artefacts),
    structure(artefacts),
    scenarios(artefacts),
    chapters(artefacts),
    afterwards(artefacts, meta),
    limits(meta),
    // Last, because they are references rather than readings — and present in
    // every copy, owner or shared, because the words are the same in both.
    key(),
    handling(meta),
  ]).replace(/\n{3,}/g, '\n\n') + '\n';
}

/**
 * WHERE THE DOCUMENT WENT, in the document itself.
 *
 * The same reason the key is in here: a Word file lands on somebody's desk with
 * nobody to ask. A reader deciding how far to trust an assessment of a paper
 * that is not theirs needs the handling note in the copy they are holding, not
 * on a page they were never sent — and it comes from the module the screen
 * draws, so the two cannot answer differently.
 *
 * The diagram does not survive the trip; the journey does, because the page's
 * list and the page's picture are the same six stops.
 */
function handling(meta: DocMeta): string {
  const sealed = !!meta.sealed;
  const searched = meta.searched ?? !sealed;
  const stops = journey(sealed).map((stop, i) =>
    block([
      `### ${i + 1}. ${stop.title} — ${PLACE_LABEL[stop.place].toLowerCase()}`,
      stop.what,
      ...(stop.emphasis ? [`**${stop.emphasis}**`] : []),
    ]),
  );
  return block([
    '## Where this document went',
    handlingHeadline(sealed),
    ...stops,
    '### While it exists, the site holds',
    kept(sealed).map((line) => `- ${line}`).join('\n'),
    '### A purge destroys',
    destroyed(sealed).map((line) => `- ${line}`).join('\n'),
    '### Nobody there can reach',
    beyond(sealed, searched).map((line) => `- ${line}`).join('\n'),
  ]);
}

/**
 * THE ONE-PAGE BRIEF, ALONE — a document scope of its own.
 *
 * The full document runs to dozens of Word pages; the brief is what a busy
 * official is sent. It holds exactly what the page's brief holds, because both
 * draw `briefOf` (`$lib/brief`): the headline and one sentence, at most five
 * key judgements, and at most three things the assessment could not check.
 * Nothing else — no playbook, no appendix, no key — and a line at the foot
 * saying the full assessment is a separate file, so a reader never mistakes
 * one page for the whole.
 *
 * A SHARED COPY IS HANDED THE REDACTED ARTEFACTS, never redacted here. The
 * export route runs `shareableReport` once and both documents render from its
 * output; a key judgement's quote travels exactly as a finding's does.
 */
export function briefMarkdown(artefacts: Artefact[], meta: DocMeta, brief: Brief): string {
  const context = [meta.jurisdiction, meta.policyArea].filter(Boolean).join(' · ');
  const done = date(meta.completedAt);
  const items = brief.items.map((item) => itemMarkdown(item, false));
  return block([
    `# ${meta.title} — the brief`,
    [context, done ? `Assessment completed ${done}` : null].filter(Boolean).join(' · ') || null,
    'A red-team read: it looks for what a body governed by the policy could do to serve itself. It finds weak points; it does not predict that anyone will use them.',
    meta.withheld?.length
      ? `> **This is a shared copy.** It withholds ${meta.withheld.length > 1 ? `${meta.withheld.slice(0, -1).join('; ')}; and ${meta.withheld[meta.withheld.length - 1]}` : meta.withheld[0]}.`
      : null,
    '## In short',
    [brief.headline, brief.standfirst].filter(Boolean).join(' ') || 'The assessment did not reach a conclusion.',
    brief.items.length ? block([`## ${itemsHeading(brief.source)}`, ...items]) : null,
    brief.limits.length
      ? block(['## What we could not check', brief.limits.map((line) => `- ${line}`).join('\n')])
      : null,
    '*This is the one-page brief. The full assessment, with every way to beat the policy and the working behind each judgement, is a separate download.*',
  ]).replace(/\n{3,}/g, '\n\n') + '\n';
}

/** `Post-16 Education and Skills` → `post-16-education-and-skills`. */
export function documentSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'policy-assessment';
}
