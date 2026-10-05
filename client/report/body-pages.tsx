import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { PersonaLink } from '$lib/policy-analysis/view';
import { seenIn } from '../places';

/**
 * EVERY BODY A REPORT NAMES, LINKED TO ITS PAGE ACROSS POLICIES (phase 24).
 *
 * `detail().personas` has always said which of an assessment's actors are
 * bodies the install has a record of — and how many papers each has turned up
 * in — and no report linked to one. The only way from a report to the
 * cross-paper picture was the footer.
 *
 * A CONTEXT, NOT A PROP, because the names are in eight components three
 * layers down (the body table, the cast grid, the "met before" table, every
 * play card, the item page), and threading a renderer through each is eight
 * prop chains for one fact. The provider sits at the root of `Report` and of
 * the item page; every consumer asks `useBodyPage()` and gets null when there
 * is nothing to draw.
 *
 * THE PACK DRAWS NOTHING, by construction rather than by a flag. The offline
 * pack has no personas — `persona_link` is withheld from everything that
 * leaves, and the pack's `personas` is `[]` — AND no renderer: the caller
 * supplies the link, so the machinery is not in the pack's bundle, the same
 * rule `linkTo` keeps (AGENTS.md). Either absence alone leaves the body's name
 * as plain text.
 */

/** How the caller draws a link to a body's page. The service's is a router `Link`. */
export type BodyPageRender = (target: { personaId: string; sightings: number; name: string }, words: string) => ReactNode;

type Lookup = (actorId: string | null | undefined, options?: { always?: boolean }) => ReactNode;

const BodyPagesContext = createContext<Lookup | null>(null);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Which body record each of this assessment's actors is.
 *
 * THE LIBRARY FILES ONE ACTOR PER PAPER PER BODY, but stage 2 leaves several
 * rows with the same label — "Jobcentre Plus" can be three candidates on one
 * paper — and the body table, the cast grid and a play's `actor` can each hold
 * a different one of them. So every actor row sharing the filed actor's label
 * maps to the same record: the rule `actorsOfBody` in `intel.ts` already uses
 * to read a paper's asks. Where two records claim one label, the one seen in
 * more papers wins, which is the one a reader would want to open.
 */
export function bodyIndex(personas: PersonaLink[], artefacts: Artefact[]): Map<string, PersonaLink> {
  const out = new Map<string, PersonaLink>();
  if (!personas.length) return out;
  const actors = artefacts.filter((a) => a.kind === 'actor');
  const labelOf = new Map(actors.map((a) => [a.id, norm(a.label)]));
  const byLabel = new Map<string, PersonaLink>();
  for (const link of personas) {
    if (!link.actorId) continue;
    const held = out.get(link.actorId);
    if (!held || link.sightings > held.sightings) out.set(link.actorId, link);
    const label = labelOf.get(link.actorId);
    if (!label) continue;
    const prior = byLabel.get(label);
    if (!prior || link.sightings > prior.sightings) byLabel.set(label, link);
  }
  for (const actor of actors) {
    if (out.has(actor.id)) continue;
    const link = byLabel.get(norm(actor.label));
    if (link) out.set(actor.id, link);
  }
  // A profile names its actor in `data.actorId`; the item page for a profile
  // is a page about that body too.
  for (const profile of artefacts) {
    if (profile.kind !== 'profile') continue;
    const link = out.get(String(profile.data?.actorId ?? ''));
    if (link) out.set(profile.id, link);
  }
  return out;
}

export function BodyPages({ personas, artefacts, render, children }: {
  personas: PersonaLink[];
  artefacts: Artefact[];
  /** Absent in the offline pack, which then draws every body as plain text. */
  render?: BodyPageRender;
  children: ReactNode;
}) {
  const index = useMemo(() => (render ? bodyIndex(personas, artefacts) : new Map<string, PersonaLink>()), [render, personas, artefacts]);
  const lookup = useMemo<Lookup | null>(() => {
    if (!render || !index.size) return null;
    /*
     * ONLY A BODY SEEN IN MORE THAN ONE POLICY, in a table or on a card. On
     * the live run every one of twelve records had been seen once, and a
     * "seen in 1 policy →" on every row of three tables is a column that says
     * nothing twelve times — the defect phase 20 took out of the "met before"
     * table. The item page asks for `always`: one body, one link, and the page
     * it opens also carries the register and the public record, which are
     * worth reading for a body met once.
     */
    return (actorId, options) => {
      const link = actorId ? index.get(actorId) : undefined;
      if (!link) return null;
      if (link.sightings < 2 && !options?.always) return null;
      const words = link.sightings > 1 ? seenIn(link.sightings) : 'its page across policies';
      return render({ personaId: link.personaId, sightings: link.sightings, name: link.name }, words);
    };
  }, [render, index]);
  return <BodyPagesContext.Provider value={lookup}>{children}</BodyPagesContext.Provider>;
}

/** The link to an actor's body page, or null — no record, the pack, or seen only here. */
export function useBodyPage(): Lookup {
  return useContext(BodyPagesContext) ?? (() => null);
}

/**
 * The link, set beside a name. Its own small element so every surface draws
 * it the same way: after the name, in the meta colour, never replacing it.
 */
export function BodyPageLink({ actorId, always }: { actorId: string | null | undefined; always?: boolean }) {
  const link = useBodyPage()(actorId, { always });
  return link ? <span className="prt-meta prt-bodylink"> {link}</span> : null;
}
