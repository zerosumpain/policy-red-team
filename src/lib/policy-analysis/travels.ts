/**
 * Its own module, with no imports, because the dossier PAGE needs it too:
 * `persona-view.ts` compares papers on what travels, and the client bundle
 * should not carry the identity policy and the contracts to do it.
 */

/**
 * WHAT TRAVELS TO ANOTHER POLICY, and what stays with this paper.
 *
 * Measured on the live library: dossiers held "£523 million annually for the
 * Families First Partnership" and "by 2028" as extracted facts — true of one
 * paper, and exactly what a persona read against a different policy next year
 * must not import. The prompt already said "keep the dossier to what travels";
 * a prompt is not a control, so this is.
 *
 * Sentence by sentence. A sentence carrying a money amount, a year, a month, a
 * percentage or the name of a programme is left out of the STANDING dossier and
 * kept in the paper's own observation, where it is true. The paper's own
 * programme names come from its `programme` actors; a capitalised
 * "… Programme / Partnership / Pilot / Initiative" is caught without them.
 */
const PAPER_SPECIFIC: RegExp[] = [
  /[£$€]\s?\d/,
  /\b\d[\d,.]*\s?(?:million|billion|bn|m|k|thousand)\b/i,
  /\b(?:19|20)\d{2}\b/,
  /\b\d+(?:\.\d+)?\s?(?:%|per\s?cent)/i,
  // A month only beside a number: "May direct a local authority" is a power, not a date.
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/,
  /\b(?:[A-Z][\p{L}'’-]+\s+){1,5}(?:Programme|Partnership|Pilot|Initiative)s?\b/u,
];

const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function travellingValue(value: string, paperNames: string[] = []): string | null {
  const own = paperNames
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter((n) => n.length >= 4)
    .map((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i'));
  const kept = value
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.;!?])\s+/)
    .filter((sentence) => sentence && !PAPER_SPECIFIC.some((re) => re.test(sentence)) && !own.some((re) => re.test(sentence)));
  return kept.join(' ').trim() || null;
}

/** The travelling form of a trait, preferring what was computed when it was written. */
export const travelsOf = (trait: { value: string; travels?: string | null }): string | null =>
  trait.travels !== undefined ? (trait.travels || null) : travellingValue(trait.value);

