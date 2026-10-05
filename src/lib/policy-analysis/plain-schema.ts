import { z } from 'zod';

/**
 * THE PLAIN-WORDS BLOCK, AS A SHAPE (phase 23).
 *
 * Its own module, importing nothing but zod, because `contracts.ts` needs these
 * schemas at load time and everything else about the block (`plain.ts`) needs
 * the contracts — a runtime cycle between the two is how the offline pack met
 * its TDZ errors before.
 *
 * One short sentence a field, for someone who has never read the policy. The
 * cap is generous on purpose: 600 characters is three times a short sentence,
 * and the WORD limits that matter are soft (`plain.ts`, warnings only). The cap
 * only stops a field that is not a sentence at all.
 *
 * `likeWhen` IS NULLABLE AND REQUIRED. An everyday comparison is the line that
 * makes a play click for a newcomer, and the one a model will force when there
 * is none. Null says "no honest comparison", in the data, where a missing key
 * would say "the model forgot". The two must not read the same.
 */
const line = z.string().trim().min(1).max(600);

export const PLAIN_SCHEMAS = {
  exploit: z.object({ who: line, does: line, goesWrong: line, likeWhen: line.nullable(), whyItMatters: line }).strict(),
  scenario: z.object({ what: line, firstMove: line, result: line, whyItMatters: line }).strict(),
  key_judgement: z.object({ forWhom: line, whyItMatters: line }).strict(),
} as const;

export type PlainKind = keyof typeof PLAIN_SCHEMAS;
export const PLAIN_KINDS = Object.keys(PLAIN_SCHEMAS) as PlainKind[];

/** One line, what a part of the policy is in everyday words. Same cap, same reason. */
export const WHAT_IT_IS = line;
