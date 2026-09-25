/**
 * WHAT "BACKED UP" ACTUALLY MEANS ON THIS RUN.
 *
 * The section reads 15 Supports on a green rule, then 0 Contradicts, 0 Mixed,
 * 0 Insufficient — three quarters of it the numeral zero, and the one non-zero
 * figure coloured for agreement. A reader scanning it concludes fifteen things
 * support the paper and nothing contradicts it.
 *
 * The payload says something sharper and much less comfortable. All fifteen
 * evidence artefacts have `url: null` and `origin: 'extracted_fact'`, and every
 * one carries a `page` and a `sourceQuote`: every link is a passage of the
 * policy paper quoting itself, and not one independent source was retrieved.
 * They resolve to 14 distinct claims of 536 and 13 distinct mechanisms of 151,
 * and the paper's own 47 cited-evidence claims carry none of them. All fifteen
 * also carry a `data.dispute` the page has never printed.
 *
 * So the numbers here are not a prettier version of the four cards. They are
 * the finding the four cards hide, and they are computed rather than written:
 * a run whose research stage does find something has to be able to say so with
 * this same module.
 *
 * FORK-OWN. `src/lib/policy-analysis/` is a verbatim-tracked copy of the
 * upstream core and `evidenceMix()` lives there; nothing in it is edited for
 * this. The precedent for a derived reading beside the report is `spread.ts`
 * and `stress-view.ts`.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export type EvidenceRow = {
  id: string;
  label: string;
  page: number | null;
  /** Null on every row of this run, which is the whole point of the section. */
  url: string | null;
  result: string;
  evidenceType: string;
  /** What the run says this link does NOT establish. Non-empty on 15 of 15. */
  dispute: string;
  /** The claim, mechanism or assumption it backs — the first of the three that resolves. */
  backs: Artefact | null;
};

export type EvidenceShape = {
  rows: EvidenceRow[];
  total: number;
  /** Links with no URL: a passage of the paper rather than a source outside it. */
  internal: number;
  external: number;
  claims: { covered: number; of: number };
  mechanisms: { covered: number; of: number };
  /**
   * Claims the paper itself files under "cited evidence", and how many of them
   * an evidence link actually reaches. Zero of forty-seven on this run.
   */
  cited: { total: number; linked: number };
  /** The reading, one claim per sentence, in the order it should be printed. */
  reading: string[];
};

/**
 * `data.claimId`, else `data.mechanismId`, else `data.assumptionId`.
 *
 * In that order because it is the order of decreasing specificity about what
 * the paper asserted: a claim is a sentence the paper makes, a mechanism is
 * machinery it describes, an assumption is something it took for granted. One
 * of the fifteen has no claim and resolves to its mechanism, which is why the
 * fallback exists rather than being a guard against nothing.
 */
function backing(row: Artefact, byId: Map<string, Artefact>): Artefact | null {
  for (const key of ['claimId', 'mechanismId', 'assumptionId']) {
    const found = byId.get(str(row.data[key]));
    if (found) return found;
  }
  return null;
}

export function evidenceShape(artefacts: Artefact[]): EvidenceShape {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const evidence = artefacts.filter((a) => a.kind === 'evidence');
  const claims = artefacts.filter((a) => a.kind === 'claim');
  const mechanisms = artefacts.filter((a) => a.kind === 'mechanism');

  const rows: EvidenceRow[] = evidence.map((row) => ({
    id: row.id,
    label: row.label,
    page: row.page,
    url: row.url,
    result: str(row.data.result),
    evidenceType: str(row.data.evidenceType),
    dispute: str(row.data.dispute),
    backs: backing(row, byId),
  }));

  /*
   * A LINK WITH NO URL IS NOT AN INDEPENDENT SOURCE, and that is the whole
   * test. `origin: 'extracted_fact'` says the same thing on all fifteen here,
   * but a URL is the one field that cannot be true of a passage of the paper
   * being assessed, so it is the field the split is made on.
   */
  const external = rows.filter((row) => row.url).length;
  const internal = rows.length - external;

  /** Distinct, not per row: two links to the same claim cover one claim. */
  const resolved = (kind: string) =>
    new Set(evidence.map((row) => str(row.data[kind === 'claim' ? 'claimId' : 'mechanismId']))
      .filter((id) => byId.get(id)?.kind === kind)).size;

  const citedClaims = claims.filter((claim) => claim.data.category === 'cited_evidence');
  const linkedIds = new Set(evidence.map((row) => str(row.data.claimId)));
  const cited = { total: citedClaims.length, linked: citedClaims.filter((c) => linkedIds.has(c.id)).length };

  const shape: Omit<EvidenceShape, 'reading'> = {
    rows,
    total: rows.length,
    internal,
    external,
    claims: { covered: resolved('claim'), of: claims.length },
    mechanisms: { covered: resolved('mechanism'), of: mechanisms.length },
    cited,
  };
  return { ...shape, reading: evidenceReading(shape) };
}

/**
 * The sentences, derived so they stay true on a run that did retrieve something.
 *
 * Three claims, each a count: where the evidence came from, how much of the
 * paper it reaches, and whether the paper's own citations are among it.
 */
function evidenceReading(shape: Omit<EvidenceShape, 'reading'>): string[] {
  if (!shape.total) return [];
  const lines: string[] = [];

  if (!shape.external) {
    lines.push(
      `All ${shape.total} evidence links are passages of the policy paper itself. `
      + 'None of them cites a source outside it.',
    );
  } else if (!shape.internal) {
    lines.push(`All ${shape.total} evidence links cite a source outside the paper.`);
  } else {
    lines.push(
      `${shape.internal} of the ${shape.total} evidence links are passages of the policy paper `
      + `itself; the other ${shape.external} ${shape.external === 1 ? 'cites' : 'cite'} a source outside it.`,
    );
  }

  lines.push(
    `They reach ${shape.claims.covered} of the ${shape.claims.of} claims the run extracted and `
    + `${shape.mechanisms.covered} of its ${shape.mechanisms.of} parts of the policy.`,
  );

  /*
   * THE PAPER'S OWN CITATIONS, WHICH ARE THE ONES A READER WOULD EXPECT TO BE
   * BACKED. `cited_evidence` is the category the extractor gives a claim that
   * the paper presents as evidence for something. Forty-seven of them here, and
   * not one carries an evidence link — which is a different and worse fact from
   * "coverage is thin".
   */
  if (shape.cited.total) {
    const many = shape.cited.total !== 1;
    lines.push(shape.cited.linked
      ? `${shape.cited.linked} of the paper's ${shape.cited.total} cited-evidence `
        + `${many ? 'claims carries' : 'claim carries'} one.`
      : `The paper's own ${shape.cited.total} cited-evidence ${many ? 'claims carry' : 'claim carries'} `
        + 'none of them.');
  }
  return lines;
}
