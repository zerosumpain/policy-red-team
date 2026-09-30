/**
 * THE SUMMARY OF AN ASSESSMENT — what the front door of a report shows, and what
 * the landing page shows about each finished run.
 *
 * Phase 20. A reader new to this tool wants five things before they want any of
 * the detail: how bad, where, who, what to do, and how far to trust it. Every
 * figure here is computed by the function the detailed tab already uses —
 * `plays()`, `bandCounts()`, `mechanismChart()`, `actorBoard()`,
 * `linkRecommendation()` — so a summary card and the tab it opens cannot
 * disagree about a number unless the shared function changes under both.
 *
 * PURE AND FRAMEWORK-FREE, like `brief.ts`, because it has two callers on two
 * sides of the wire: the Summary tab renders it in the browser, and the list
 * route computes a cut-down copy of it on the server so the landing page does
 * not fetch five whole reports to draw five cards.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BANDS, type Band } from '$lib/policy-analysis/exposure';
import { mechanismChart } from '$lib/mechanisms';
import { OTHER_PATTERN, PLAY_PATTERNS, patternOf } from '$lib/policy-analysis/patterns';
import { linkRecommendation } from '$lib/recommendation';
import {
  actorBoard, bandCounts, confidenceJudgement, findingsBySection, headlineSentence, plays, recommendations,
  type Play,
} from '$lib/policy-analysis/view';

/** How many rows a summary card lists. A card is a glance, not a table. */
export const OVERVIEW_ROWS = 5;

export type BandTally = Record<Band, number>;

export type OverviewPlay = {
  id: string;
  label: string;
  /** Who would do it, by name. */
  who: string;
  band: Band;
  exposure: number;
  /** The kind of way to beat it, in the pattern's plain name. */
  pattern: string;
  /** `compliant`, `grey`, `breach` — or whatever the run wrote. */
  legality: string;
};

export type OverviewPart = {
  id: string;
  label: string;
  /** Ways to beat it that rest on this part. */
  plays: number;
  bands: BandTally;
};

export type OverviewBody = {
  label: string;
  plays: number;
  worstBand: Band;
  worst: number;
};

export type OverviewRec = {
  id: string;
  label: string;
  judgement: string;
  /** Ways to beat it this recommendation answers, by the report's own two-edge join. */
  answers: number;
};

export type Overview = {
  headline: string;
  plays: {
    total: number;
    bands: BandTally;
    /** Inside the rules — the sharpest claim the report makes. */
    compliant: number;
    top: OverviewPlay[];
    /** The commonest kind of way to beat it, and how many share it. */
    commonest: { label: string; count: number } | null;
  };
  parts: {
    /** Parts of the policy at least one way to beat it rests on. */
    underPressure: number;
    /** Every part of the policy the paper sets up. */
    total: number;
    top: OverviewPart[];
  };
  bodies: {
    /** Distinct names that could run at least one way to beat it. */
    active: number;
    /** Distinct names the paper mentions at all. */
    named: number;
    top: OverviewBody[];
  };
  recs: {
    items: OverviewRec[];
    /** Ways to beat it at least one recommendation answers. */
    answered: number;
    /** Ways to beat it no recommendation answers, and how many of those are severe. */
    unanswered: number;
    severeUnanswered: number;
  };
  findings: {
    total: number;
    /** How well supported the final review judged them, in the words the page prints. */
    confidence: { label: string; count: number }[];
  };
};

const zeroBands = (): BandTally => Object.fromEntries(BANDS.map((b) => [b.band, 0])) as BandTally;

/** Bands in ramp order, worst first — the order every figure in the report uses. */
export const BAND_ORDER: Band[] = BANDS.map((b) => b.band);

const nameOf = (label: string) => label.trim().toLowerCase();

function patternLabel(play: Play): string {
  const key = patternOf(play.artefact);
  return PLAY_PATTERNS.find((p) => p.key === key)?.label ?? OTHER_PATTERN.label;
}

/**
 * The order the confidence words read in, strongest first. A word the run wrote
 * that is not here keeps its place after these rather than being dropped.
 */
const CONFIDENCE_ORDER = [
  'Well supported', 'Documented in the paper', 'Supported with limits', 'Provisional', 'Contested', 'Unknown',
];

export function overviewOf(artefacts: Artefact[]): Overview {
  const list = plays(artefacts);
  const bands = zeroBands();
  for (const { band, count } of bandCounts(list)) bands[band] = count;

  const mechanismIds = new Set(artefacts.filter((a) => a.kind === 'mechanism').map((a) => a.id));
  const byId = new Map(artefacts.map((a) => [a.id, a]));

  /* ── Ways to beat it ─────────────────────────────────────────────────── */
  const patterns = new Map<string, number>();
  for (const play of list) {
    const label = patternLabel(play);
    patterns.set(label, (patterns.get(label) ?? 0) + 1);
  }
  const commonest = [...patterns.entries()]
    .filter(([label]) => label !== OTHER_PATTERN.label)
    .sort((a, b) => b[1] - a[1])[0];

  const top: OverviewPlay[] = list.slice(0, OVERVIEW_ROWS).map((play) => ({
    id: play.artefact.id,
    label: play.artefact.label,
    who: play.actor?.label ?? '',
    band: play.band,
    exposure: play.exposure,
    pattern: patternLabel(play),
    legality: String(play.artefact.data.legality ?? 'unknown'),
  }));

  /* ── Where the pressure lands ────────────────────────────────────────── */
  // The same chart the Causes tab leads with, fed the same way, so "33 parts"
  // here is the "33 parts" on the tab.
  const chart = mechanismChart(list, (play) => {
    const found: string[] = [];
    for (const ref of play.artefact.refs) if (mechanismIds.has(ref) && !found.includes(ref)) found.push(ref);
    return found;
  });
  const parts: OverviewPart[] = chart.rows.slice(0, OVERVIEW_ROWS).map((row) => {
    const tally = zeroBands();
    for (const play of row.plays) tally[play.band] += 1;
    return { id: row.id, label: byId.get(row.id)?.label ?? row.id, plays: row.plays.length, bands: tally };
  });

  /* ── Who could do it ─────────────────────────────────────────────────── */
  // Counted BY NAME: a board row is a candidate, and one body can be several
  // rows (see the "A BODY IS A NAME" note in Report.tsx). A name's figures are
  // the union of its rows' plays.
  const board = actorBoard(artefacts, list);
  const byName = new Map<string, { label: string; plays: Play[] }>();
  for (const row of board) {
    const key = nameOf(row.actor.label);
    const entry = byName.get(key) ?? { label: row.actor.label, plays: [] };
    entry.plays.push(...row.plays);
    byName.set(key, entry);
  }
  const activeBodies = [...byName.values()].filter((entry) => entry.plays.length);
  const bodies: OverviewBody[] = activeBodies
    .map((entry) => {
      const worst = entry.plays.reduce((best, play) => (play.exposure > best.exposure ? play : best), entry.plays[0]);
      return { label: entry.label, plays: entry.plays.length, worstBand: worst.band, worst: worst.exposure };
    })
    .sort((a, b) => b.worst - a.worst || b.plays - a.plays || a.label.localeCompare(b.label))
    .slice(0, OVERVIEW_ROWS);

  /* ── What it recommends ──────────────────────────────────────────────── */
  const recs = recommendations(artefacts);
  const playIds = new Set(list.map((play) => play.artefact.id));
  const reached = new Set<string>();
  const items: OverviewRec[] = recs.map((rec) => {
    const answered = [...new Set(linkRecommendation(rec, artefacts).plays.map((p) => p.id))].filter((id) => playIds.has(id));
    for (const id of answered) reached.add(id);
    return { id: rec.id, label: rec.label, judgement: confidenceJudgement(rec), answers: answered.length };
  });
  const missed = list.filter((play) => !reached.has(play.artefact.id));

  /* ── How far to trust it ─────────────────────────────────────────────── */
  const findings = findingsBySection(artefacts).flatMap((group) => group.items);
  const confidence = new Map<string, number>();
  for (const finding of findings) {
    const word = confidenceJudgement(finding);
    confidence.set(word, (confidence.get(word) ?? 0) + 1);
  }
  const rank = (word: string) => (CONFIDENCE_ORDER.indexOf(word) === -1 ? CONFIDENCE_ORDER.length : CONFIDENCE_ORDER.indexOf(word));

  return {
    headline: headlineSentence(artefacts),
    plays: {
      total: list.length,
      bands,
      compliant: list.filter((play) => String(play.artefact.data.legality) === 'compliant').length,
      top,
      commonest: commonest ? { label: commonest[0], count: commonest[1] } : null,
    },
    parts: { underPressure: chart.rows.length, total: mechanismIds.size, top: parts },
    bodies: { active: activeBodies.length, named: byName.size, top: bodies },
    recs: {
      items,
      answered: recs.length ? list.length - missed.length : 0,
      unanswered: recs.length ? missed.length : 0,
      severeUnanswered: recs.length ? missed.filter((play) => play.band === 'severe').length : 0,
    },
    findings: {
      total: findings.length,
      confidence: [...confidence.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => rank(a.label) - rank(b.label)),
    },
  };
}

/**
 * THE CUT-DOWN COPY THE LANDING PAGE GETS.
 *
 * Counts and the headline only — no labels of plays, parts or bodies. The list
 * route is behind the same reader gate as the report, so this is not a
 * redaction; it is simply everything a card on the landing page draws and
 * nothing it does not, which keeps the landing payload the size of a page.
 */
export type OverviewCard = {
  headline: string;
  plays: number;
  bands: BandTally;
  parts: number;
  bodies: number;
  recs: number;
};

export function overviewCard(artefacts: Artefact[]): OverviewCard | null {
  if (!artefacts.some((a) => a.kind === 'exploit' || a.kind === 'finding')) return null;
  const view = overviewOf(artefacts);
  return {
    headline: view.headline,
    plays: view.plays.total,
    bands: view.plays.bands,
    parts: view.parts.underPressure,
    bodies: view.bodies.active,
    recs: view.recs.items.length,
  };
}
