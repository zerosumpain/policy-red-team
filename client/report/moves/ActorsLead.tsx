import { BAND_LABEL, INTERPLAY_TARGETS, type Interplay, type PersonaGroup } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Table } from '../../govuk';
import { Bar } from '../Metrics';

/**
 * WHO IS COMING FOR WHAT — the head of Move 4.
 *
 * The other three moves each open with a lead that states the move's question in
 * figures: where the exposure sits, which mechanisms generate the most plays,
 * rank by what you care about. Move 4 had none, so the panel that answers "who
 * would do it" was a single twelve-row table and two sentences — 919px against
 * Threats' 6,104px and Causality's 5,330px, in a spine that presents the four as
 * peers.
 *
 * WHAT WAS MISSING WAS ALREADY WRITTEN. `interplay()` has been in the view layer
 * the whole time with its own argument for existing: "the actor board answers
 * 'who is in the room' and the playbook answers 'what could they do', and between
 * them a reader still has to hold the join in their head… that join is the whole
 * point of a game-theoretic read". It was wired to nothing here. So is
 * `personaBoard()`, which reads the twelve persona rows the detail response has
 * always carried. Neither is new work; both are the fork not having connected
 * upstream's answer to its own question.
 *
 * TWO TABLES, NOT A MAP. Upstream draws this as a bipartite diagram. Here the
 * same join is two ordered tables — what is under pressure, and who is applying
 * it — because a node-link picture of twelve targets and twelve bodies is the
 * hairball this build has refused elsewhere, and because a table is the thing
 * that survives into the offline pack, into print and into a screen reader.
 */
export function ActorsLead({ interplay, personas, linkTo }: {
  interplay: Interplay;
  personas: PersonaGroup[];
  linkTo?: (artefact: Artefact, label?: string) => React.ReactNode;
}) {
  const name = (artefact: Artefact | null, fallback: string) => {
    if (!artefact) return fallback;
    return linkTo ? linkTo(artefact) : artefact.label;
  };

  if (!interplay.links.length && !personas.length) return null;

  /** Which bodies are aimed at a given target, in the order they were ranked. */
  const pressingOn = (targetId: string) => {
    const ids = [...new Set(interplay.links.filter((l) => l.targetId === targetId).map((l) => l.actorId))];
    return interplay.actors.filter((a) => ids.includes(a.actor.id));
  };

  return (
    <section aria-labelledby="interplay">
      <h2 className="govuk-heading-l" id="interplay">Who is coming for what</h2>

      {interplay.links.length ? (
        <>
          <p className="govuk-body">
            Every play in the playbook names the body that runs it and the part of the policy it
            defeats. Read down the two tables and the join is the finding: where three different
            bodies are aimed at one measure, and where one body reaches across half the machinery.
            Nothing here is scored that the assessment did not already score — a target&rsquo;s
            pressure is the sum of the exposure of the plays aimed at it.
          </p>

          <Table
            caption={`Under the most pressure${interplay.hidden ? ` — the worst ${INTERPLAY_TARGETS} of ${interplay.targets.length + interplay.hidden}` : ''}`}
            captionSize="s"
            scroll
            columns={[
              { header: 'Part of the policy' },
              { header: 'Plays aimed at it', numeric: true, width: '9rem' },
              { header: 'Pressure', numeric: true, width: '11rem' },
              { header: 'From' },
            ]}
            rows={interplay.targets.map((target) => [
              name(target.artefact, target.label),
              String(target.incoming),
              /* The sum of what is aimed at it, on the same 0–1 scale as a play's
                 own exposure — so a target under four moderate plays reads
                 heavier than one under a single severe one, which is the point. */
              <Bar value={target.pressure} max={Math.max(...interplay.targets.map((t) => t.pressure))} />,
              <span className="prt-tightlist">
                {pressingOn(target.id).map((a, i) => (
                  <span key={a.actor.id}>{i ? ', ' : ''}{name(a.actor, a.actor.label)}</span>
                ))}
              </span>,
            ])}
          />
          {interplay.hidden ? (
            <p className="govuk-body-s prt-meta">
              {interplay.hidden} further {interplay.hidden === 1 ? 'part is' : 'parts are'} under
              pressure from at least one play. Every one is in the playbook on Move 3.
            </p>
          ) : null}

          <Table
            caption="How far each body reaches"
            captionSize="s"
            scroll
            columns={[
              { header: 'Body' },
              { header: 'Parts it can reach', numeric: true, width: '9rem' },
              { header: 'Plays', numeric: true, width: '7rem' },
              { header: 'Worst play', numeric: true, width: '11rem' },
            ]}
            rows={interplay.actors.map((actor) => [
              name(actor.actor, actor.actor.label),
              String(actor.reach),
              String(actor.plays),
              <Bar value={actor.worst} />,
            ])}
          />
        </>
      ) : null}

      {personas.length ? (
        <>
          <h3 className="govuk-heading-m govuk-!-margin-top-6">Bodies this assessment has met before</h3>
          <p className="govuk-body">
            The persona library holds what earlier assessments recorded about a body across other
            papers. A prior is context and never evidence — nothing in this report rests on one —
            but a body you have read about before is one you can read faster.
          </p>
          <Table
            caption="Seen in other assessments"
            captionSize="s"
            scroll
            columns={[
              { header: 'Body' },
              { header: 'Seen in', numeric: true, width: '8rem' },
              { header: 'Plays here', numeric: true, width: '8rem' },
              { header: 'Worst play here', numeric: true, width: '11rem' },
            ]}
            rows={personas.map((group) => [
              group.here.length && linkTo ? linkTo(group.here[0].actor, group.name) : group.name,
              papers(group.records.reduce((n, r) => n + r.sightings, 0)),
              String(group.plays.length),
              group.worst
                ? <span className={`prt-band prt-band--${bandOf(group.worst, group)}`}>{BAND_LABEL[bandOf(group.worst, group)]}</span>
                : <span className="prt-meta">none</span>,
            ])}
          />
        </>
      ) : null}
    </section>
  );
}

/** "1 paper", "5 papers" — a sightings count reads as English or it reads as a bug. */
const papers = (n: number) => `${n} ${n === 1 ? 'paper' : 'papers'}`;

/**
 * The band of a group's worst play, read off the play rather than recomputed.
 *
 * `worst` is an exposure and the bands are the assessment's own cuts of it; the
 * play that produced the figure already carries its band, so the group's plays
 * are asked rather than the number re-classified. A second thresholding here
 * would be a second opinion about severity.
 */
function bandOf(worst: number, group: PersonaGroup) {
  return group.plays.find((p) => p.exposure === worst)?.band ?? 'limited';
}
