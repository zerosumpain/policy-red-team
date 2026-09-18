/**
 * The pure half of upstream's `peek.svelte.ts`.
 *
 * Upstream this file is a Svelte 5 rune store driving one shared hover card for
 * the whole assessment. The store is UI and does not travel — phase 4 rebuilds it
 * in React, and hover-only disclosure has to become click-to-expand anyway to
 * meet WCAG 2.2. But the top of that file is framework-free and the shaping tests
 * depend on it, so it is re-homed here rather than lost.
 *
 * `PeekAnchor` and the popover placement are deliberately NOT here: they need
 * `AnchorRect` from the site's popover module, which is UI, and nothing outside
 * the component tree reads them.
 */

/**
 * What the card is being asked about.
 *
 * `term` is the glossary — a column header, a factor, a band — and it is the
 * kind that survives everywhere, because a word has nowhere else to be
 * explained. The rest name an artefact and differ only in which of its fields
 * are worth the space.
 */
export type PeekKind = 'actor' | 'play' | 'assumption' | 'term' | 'artefact' | 'check' | 'relation';

const KINDS: PeekKind[] = ['actor', 'play', 'assumption', 'term', 'artefact', 'check', 'relation'];

/**
 * Split `actor:s2_dfe` into its parts.
 *
 * An identifier may itself contain a colon, so the split is on the FIRST one
 * only; and an attribute naming a kind this build does not know is ignored
 * rather than rendered as an empty card.
 */
export function parseSubject(raw: string | null): { kind: PeekKind; subject: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const kind = raw.slice(0, at) as PeekKind;
  const subject = raw.slice(at + 1);
  if (!KINDS.includes(kind) || !subject) return null;
  return { kind, subject };
}
