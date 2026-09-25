/**
 * ONE BODY ACROSS SEVERAL PAPERS — phase 19, workstream X.
 *
 * The persona library could say that a body had been seen in two papers. It
 * could not say what each paper ASKED of it, whether the asks add up to more
 * than the body has, or whether two papers pull it in opposite directions —
 * which is the cross-policy question a department actually has.
 *
 * Everything here is COUNTED FROM THE PAPERS' OWN GRAPHS, never asked of a
 * model: an ask is a relationship the graph stage recorded running from the
 * body (it delivers, funds, reports to …), a play is one the red team
 * attributed to it. That is why it can be shown side by side across papers
 * without either paper's wording being treated as the other's evidence.
 *
 * A POLICY GRAPH IS A STAR (AGENTS.md): most relationships run from a body to
 * the machinery. So nothing here draws bodies against bodies as a network. The
 * grid is two categorical axes — bodies and papers — and it is a table.
 *
 * Pure: the rows come from `server/intel.ts`.
 */

/** A paper in the library. `sha256` so two runs of one document are one paper. */
export type IntelPaper = { id: string; title: string; completedAt: string | null; sha256: string | null };
/** One body's sighting in one paper, from the library: the actor it was filed from and the plays that paper attributed. */
export type IntelSighting = { analysisId: string; actorId: string; bodyId: string; plays: { label: string; band: string; exposure: number; legality: string }[] };
/** A relationship the paper's graph recorded. `sourceQuote` where the graph stage quoted the paper. */
export type IntelEdge = { analysisId: string; id: string; fromId: string; toId: string; relation: string; label: string; statement: string; sourceQuote: string | null };
/** An actor or mechanism, for naming the other end of an edge. */
export type IntelNode = { analysisId: string; id: string; kind: string; label: string };

/** What an edge says the body is asked to do, allowed to do, or stands to gain. */
export type AskKind = 'duty' | 'power' | 'gain' | 'oversight';

/**
 * THE RELATIONS, IN THREE PLAIN GROUPS.
 *
 * `duty` is something the paper asks the body to do or carry. `power` is
 * something it lets the body do to others. `gain` is what it stands to get.
 * `oversight` is the other direction — an edge INTO the body from something
 * with power over it — which is also an ask: it is who the body answers to.
 * The rest (supports, assumes, competes with …) are not asks of anybody.
 */
export const ASK_RELATIONS: Record<Exclude<AskKind, 'oversight'>, readonly string[]> = {
  duty: ['delivers', 'funds', 'commissions', 'is_accountable_for', 'reports_to', 'supplies_data_to', 'is_measured_by', 'bears_cost_of', 'depends_on'],
  power: ['regulates', 'has_authority_over', 'can_veto', 'sanctions', 'appoints', 'owns_data'],
  gain: ['receives_benefit_from'],
};
/** Relations INTO the body that put something over it. */
const OVER = ['regulates', 'has_authority_over', 'can_veto', 'sanctions', 'appoints', 'commissions', 'funds'];

export const RELATION_WORDS: Record<string, string> = {
  delivers: 'delivers', funds: 'pays for', commissions: 'commissions', is_accountable_for: 'is accountable for',
  reports_to: 'reports to', supplies_data_to: 'gives data to', is_measured_by: 'is measured by', bears_cost_of: 'bears the cost of',
  depends_on: 'depends on', regulates: 'regulates', has_authority_over: 'has authority over', can_veto: 'can block',
  sanctions: 'can penalise', appoints: 'appoints', owns_data: 'holds the data on', receives_benefit_from: 'gains from',
};

export type Ask = { kind: AskKind; relation: string; words: string; other: string; artefactId: string; quote: string };

const BANDS = ['severe', 'significant', 'moderate', 'limited'];
const bandRank = (band: string) => { const i = BANDS.indexOf(String(band).toLowerCase()); return i < 0 ? BANDS.length : i; };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The papers, one per document: the latest completed run of each.
 *
 * Two runs of one file are one paper here as they are in "seen in N papers" —
 * otherwise a redraft would appear as a second paper asking the same things,
 * which reads as a pattern and is an echo.
 */
export function onePerDocument(papers: IntelPaper[]): IntelPaper[] {
  const latest = new Map<string, IntelPaper>();
  for (const p of papers) {
    const key = p.sha256 ?? p.id;
    const held = latest.get(key);
    if (!held || (p.completedAt ?? '') > (held.completedAt ?? '')) latest.set(key, p);
  }
  return [...latest.values()].sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.title.localeCompare(b.title));
}

/**
 * Which of a paper's actors are this body.
 *
 * The library files ONE actor per paper per body, but stage 2 leaves several
 * rows with the same label (Skills England 42 times on one white paper), and
 * the graph stage hangs relationships off any of them. So the rows sharing the
 * filed actor's label count too — the rule stage 4 already uses to profile
 * them together — and nothing else does.
 */
export function actorsOfBody(sightings: IntelSighting[], nodes: IntelNode[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const labelOf = new Map(nodes.map((n) => [`${n.analysisId}|${n.id}`, n.label]));
  for (const s of sightings) {
    const key = `${s.analysisId}|${s.bodyId}`;
    const ids = out.get(key) ?? new Set<string>();
    ids.add(s.actorId);
    const label = labelOf.get(`${s.analysisId}|${s.actorId}`);
    if (label) {
      for (const n of nodes) if (n.analysisId === s.analysisId && n.kind === 'actor' && n.id.startsWith('s2_') && norm(n.label) === norm(label)) ids.add(n.id);
    }
    out.set(key, ids);
  }
  return out;
}

/** What one paper asks of one body, read off its graph. Duties first, then powers, gains and who it answers to. */
export function asksOf(analysisId: string, actorIds: Set<string>, edges: IntelEdge[], nodes: IntelNode[]): Ask[] {
  const labelOf = new Map(nodes.filter((n) => n.analysisId === analysisId).map((n) => [n.id, n.label]));
  const out: Ask[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.analysisId !== analysisId) continue;
    const from = actorIds.has(e.fromId);
    const to = actorIds.has(e.toId);
    let kind: AskKind | null = null;
    if (from && !to) kind = (Object.entries(ASK_RELATIONS).find(([, list]) => list.includes(e.relation))?.[0] as AskKind | undefined) ?? null;
    else if (to && !from && OVER.includes(e.relation)) kind = 'oversight';
    if (!kind) continue;
    const other = labelOf.get(kind === 'oversight' ? e.fromId : e.toId) ?? 'something the graph does not name';
    // One ask per relation and counterpart: the graph records the same
    // relationship from every row of a body, and "delivers the programme" six
    // times is one ask.
    const key = `${kind}|${e.relation}|${norm(other)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const words = kind === 'oversight' ? `${other} ${RELATION_WORDS[e.relation] ?? e.relation.replaceAll('_', ' ')} it` : `${RELATION_WORDS[e.relation] ?? e.relation.replaceAll('_', ' ')} ${other}`;
    out.push({ kind, relation: e.relation, words, other, artefactId: e.id, quote: (e.sourceQuote || e.statement || e.label).replace(/\s+/g, ' ').trim().slice(0, 400) });
  }
  const order: AskKind[] = ['duty', 'power', 'gain', 'oversight'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.words.localeCompare(b.words));
}

export type GridCell = { duties: number; powers: number; plays: number; worstBand: string | null; worstExposure: number | null };
export type GridRow = { bodyId: string; name: string; papers: number; load: number; cells: Record<string, GridCell> };
export type Grid = { papers: IntelPaper[]; rows: GridRow[] };

/**
 * BODIES DOWN, PAPERS ACROSS, WHAT EACH PAPER GIVES EACH BODY IN THE CELL.
 *
 * Only bodies seen in at least one paper, only papers that name at least one
 * register body. Sorted by how many papers name a body, then by load — the
 * duties and plays summed across papers — so the bodies most likely to be
 * pulled in several directions come first.
 */
export function buildGrid(input: { papers: IntelPaper[]; sightings: IntelSighting[]; edges: IntelEdge[]; nodes: IntelNode[]; names: Map<string, string> }): Grid {
  const papers = onePerDocument(input.papers);
  const kept = new Set(papers.map((p) => p.id));
  const sightings = input.sightings.filter((s) => kept.has(s.analysisId));
  const actors = actorsOfBody(sightings, input.nodes);
  const rows = new Map<string, GridRow>();
  for (const s of sightings) {
    const row = rows.get(s.bodyId) ?? { bodyId: s.bodyId, name: input.names.get(s.bodyId) ?? s.bodyId, papers: 0, load: 0, cells: {} };
    const cell = row.cells[s.analysisId] ?? { duties: 0, powers: 0, plays: 0, worstBand: null, worstExposure: null };
    if (!row.cells[s.analysisId]) {
      const asks = asksOf(s.analysisId, actors.get(`${s.analysisId}|${s.bodyId}`) ?? new Set([s.actorId]), input.edges, input.nodes);
      cell.duties = asks.filter((a) => a.kind === 'duty').length;
      cell.powers = asks.filter((a) => a.kind === 'power').length;
      row.papers++;
    }
    for (const play of s.plays) {
      cell.plays++;
      if (cell.worstBand === null || bandRank(play.band) < bandRank(cell.worstBand)) cell.worstBand = play.band;
      if (typeof play.exposure === 'number' && (cell.worstExposure === null || play.exposure > cell.worstExposure)) cell.worstExposure = play.exposure;
    }
    row.cells[s.analysisId] = cell;
    rows.set(s.bodyId, row);
  }
  for (const row of rows.values()) row.load = Object.values(row.cells).reduce((n, c) => n + c.duties + c.plays, 0);
  const sorted = [...rows.values()].sort((a, b) => b.papers - a.papers || b.load - a.load || a.name.localeCompare(b.name));
  const used = new Set(sorted.flatMap((r) => Object.keys(r.cells)));
  return { papers: papers.filter((p) => used.has(p.id)), rows: sorted };
}

export type PaperAsks = { paper: IntelPaper; asks: Ask[]; plays: IntelSighting['plays'] };

/** One body's asks, paper by paper, oldest first — the timeline on its page. */
export function timeline(bodyId: string, input: { papers: IntelPaper[]; sightings: IntelSighting[]; edges: IntelEdge[]; nodes: IntelNode[] }): PaperAsks[] {
  const papers = onePerDocument(input.papers);
  const mine = input.sightings.filter((s) => s.bodyId === bodyId);
  const actors = actorsOfBody(mine, input.nodes);
  return papers
    .filter((p) => mine.some((s) => s.analysisId === p.id))
    .map((paper) => ({
      paper,
      asks: asksOf(paper.id, actors.get(`${paper.id}|${bodyId}`) ?? new Set(), input.edges, input.nodes),
      plays: mine.filter((s) => s.analysisId === paper.id).flatMap((s) => s.plays).sort((a, b) => bandRank(a.band) - bandRank(b.band) || b.exposure - a.exposure),
    }));
}

/** One side of a clash: which paper, what it says, and the edge that says it. */
export type ClashSide = { paper: IntelPaper; words: string; quote: string; artefactId: string };
export type Clash = { bodyId: string; bodyName: string; otherId: string; otherName: string; rule: string; a: ClashSide; b: ClashSide };

/**
 * TWO PAPERS THAT PUT THE SAME TWO BODIES IN OPPOSITE ORDER.
 *
 * The one rule here, and it is deliberately narrow: in one paper body A has
 * power over body B (regulates it, has authority over it, commissions it, pays
 * for it, can block it, appoints to it); in another, A reports to B or depends
 * on it, or B has that power over A. Both A and B must be the SAME GOV.UK
 * register bodies in both papers — the register decides, never the name — and
 * both sides are the papers' own graph edges, so each can be opened and read.
 *
 * Why only this. Two papers giving a body different duties is not a conflict:
 * most bodies do many things. Deciding that "deliver X" contradicts "fund Y"
 * would need a judgement about meaning this module cannot make honestly, and a
 * page that asserts conflicts it cannot show is worse than one that shows
 * "same body, different asks" side by side and lets the reader decide — which
 * the body's own page does.
 */
export function findClashes(input: {
  papers: IntelPaper[]; sightings: IntelSighting[]; edges: IntelEdge[]; nodes: IntelNode[]; names: Map<string, string>;
  /** Which register body an actor in a paper is: the library's filing first, the register's rule otherwise. */
  bodyOf: (analysisId: string, actorId: string) => string | null;
}): Clash[] {
  const papers = new Map(onePerDocument(input.papers).map((p) => [p.id, p]));
  type Direction = { paper: IntelPaper; top: string; bottom: string; words: string; quote: string; artefactId: string };
  const directions: Direction[] = [];
  for (const e of input.edges) {
    const paper = papers.get(e.analysisId);
    if (!paper) continue;
    const from = input.bodyOf(e.analysisId, e.fromId);
    const to = input.bodyOf(e.analysisId, e.toId);
    if (!from || !to || from === to) continue;
    const quote = (e.sourceQuote || e.statement || e.label).replace(/\s+/g, ' ').trim().slice(0, 400);
    const words = `${input.names.get(from) ?? from} ${RELATION_WORDS[e.relation] ?? e.relation.replaceAll('_', ' ')} ${input.names.get(to) ?? to}`;
    if (OVER.includes(e.relation)) directions.push({ paper, top: from, bottom: to, words, quote, artefactId: e.id });
    else if (e.relation === 'reports_to' || e.relation === 'depends_on') directions.push({ paper, top: to, bottom: from, words, quote, artefactId: e.id });
  }
  const clashes: Clash[] = [];
  const seen = new Set<string>();
  // The older paper is side A, so a clash reads in the order the papers came.
  const order = (p: IntelPaper) => `${p.completedAt ?? ''}|${p.id}`;
  for (const x of directions) {
    for (const y of directions) {
      if (order(x.paper) >= order(y.paper)) continue;
      if (x.top !== y.bottom || x.bottom !== y.top) continue;
      const key = [x.paper.id, y.paper.id, [x.top, x.bottom].sort().join('|')].join('#');
      if (seen.has(key)) continue;
      seen.add(key);
      clashes.push({
        bodyId: x.top, bodyName: input.names.get(x.top) ?? x.top, otherId: x.bottom, otherName: input.names.get(x.bottom) ?? x.bottom,
        rule: `In one paper ${input.names.get(x.top) ?? x.top} is over ${input.names.get(x.bottom) ?? x.bottom}. In the other it is the other way round.`,
        a: { paper: x.paper, words: x.words, quote: x.quote, artefactId: x.artefactId },
        b: { paper: y.paper, words: y.words, quote: y.quote, artefactId: y.artefactId },
      });
    }
  }
  return clashes.sort((a, b) => a.bodyName.localeCompare(b.bodyName) || a.otherName.localeCompare(b.otherName));
}
