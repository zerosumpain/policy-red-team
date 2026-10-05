/**
 * THE MASTER LIST'S WORDS, written once (phase 24b).
 *
 * A leaf module, like `places.ts`: the hub's two new views and a body's own
 * page both say what sort of actor something is and what papers gave it to do,
 * and they are separate lazy chunks. The server's vocabularies are the enums in
 * `$lib/policy-analysis/contracts` (`ACTOR_KINDS`, `CAPACITIES`,
 * `NOT_ACTOR_REASONS`); importing that module here would put zod in the chunk,
 * which is why `App.tsx` splits routes at all. `register-words.test.ts` keeps
 * the two in step.
 */

export const KIND_WORDS: Record<string, string> = {
  organisation: 'Organisation',
  office_or_role: 'Office or role',
  sector_or_category: 'Sector or category',
  group_of_people: 'Group of people',
  not_an_actor: 'Not an actor',
};

/** What the reader is asked when choosing a kind: the label and one line of what it means. */
export const KIND_CHOICES: { value: string; text: string; hint: string }[] = [
  { value: 'organisation', text: 'An organisation', hint: 'One body with its own name: a department, a regulator, a council, a charity.' },
  { value: 'office_or_role', text: 'An office or role', hint: 'A post inside a body: the Secretary of State, a director of children’s services.' },
  { value: 'sector_or_category', text: 'A sector or category', hint: 'A sort of body there are many of: early years providers, academy trusts.' },
  { value: 'group_of_people', text: 'A group of people', hint: 'People the policy affects or relies on: parents, the early years workforce.' },
];

export const NOT_ACTOR_WORDS: Record<string, string> = {
  programme: 'a programme or scheme',
  place: 'a place',
  assessment: 'an assessment, measure or dataset',
  named_person: 'a named person',
  other: 'something else that is not an actor',
};

/**
 * What a paper shows an actor DOING, in the reader's words. "partners" and
 * "named_only" are the two the enum spells for a program; the rest read as
 * they are.
 */
export const CAPACITY_WORDS: Record<string, string> = {
  decides: 'decides',
  funds: 'funds',
  commissions: 'commissions',
  regulates: 'regulates',
  delivers: 'delivers',
  partners: 'works in partnership',
  advises: 'advises',
  receives: 'receives',
  is_measured: 'is measured',
  is_affected: 'is affected',
  named_only: 'is only named',
};

/** How many capacities a sentence names before it counts the rest. */
const SHOWN = 5;

/**
 * "funds in 2 papers, regulates in 1" — the capacities a body was given across
 * papers, most-seen first, "is only named" last because it says the least.
 * Null when there is nothing to say, so the caller prints no empty sentence.
 */
export function capacitySentence(papers: Record<string, number> | undefined | null): string | null {
  const rows = Object.entries(papers ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => Number(a === 'named_only') - Number(b === 'named_only') || y - x || a.localeCompare(b));
  if (!rows.length) return null;
  const said = rows.slice(0, SHOWN).map(([capacity, n], i) => `${CAPACITY_WORDS[capacity] ?? capacity.replaceAll('_', ' ')} in ${n}${i === 0 ? ` ${n === 1 ? 'paper' : 'papers'}` : ''}`);
  const rest = rows.length - SHOWN;
  return rest > 0 ? `${said.join(', ')}, and ${rest} more` : said.join(', ');
}

/** "a kind of early years provider, a kind of education provider" — nearest first, as the server gives it. */
export function pathSentence(path: string[], tree: 'partOf' | 'kindOf'): string | null {
  if (!path.length) return null;
  return path.map((name) => `${tree === 'partOf' ? 'part of' : 'a kind of'} ${name}`).join(', ');
}
