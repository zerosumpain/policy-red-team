import { useMemo } from 'react';
import { factLabel, stageFacts, type StageFactKind } from '$lib/policy-analysis/stage-facts';
import { Details, Table } from '../../govuk';
import { Bar, Metrics } from '../Metrics';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { groupRefused, groupWords, pageWords, stageOnePlaces, type Place, type RefusedGroup } from '$lib/refused';
import type { ArtefactLink } from '../Report';
import { discards, readable, type ReasonRow } from '../warnings';

/**
 * WHAT THE RUN THREW AWAY, AND WHY.
 *
 * An assessment is what survived. Nothing in this client rendered stage
 * warnings, and on the Post-16 run there were 270 of them carrying the figures
 * that decide whether the report overclaims: 162 groups of model output
 * discarded, 144 references dropped, 227 things not covered, 4 pages never
 * analysed.
 *
 * THE FIGURE THAT MATTERS is that 26 plays were rejected for resting on
 * something other than an assumption — so forty-seven plays survived out of
 * seventy-three written. A report that says "47 plays" without that is
 * overclaiming, which is why this is a view and not a footnote. It was stated in
 * this comment and nowhere on the page; it is the first sentence now.
 *
 * THE COUNTING IS `stage-facts.ts`, which is copied from upstream and had been
 * wired to nothing. A second parser written here recognised four sentence shapes
 * where the copied one recognises eight, and undercounted by 227 "not covered"
 * and 22 "unavailable" items — in the one view whose premise is that an
 * undercount is the serious direction.
 *
 * AND THE ARITHMETIC RECONCILES NOW. The headline card said 162 and the table
 * under it accounted for 90, with nothing on the page explaining the other 72.
 * `discards()` returns both halves from one pass, so they cannot drift apart
 * again — see the note on it.
 */

/**
 * TWO POPULATIONS, NOT ONE ROW OF SIX.
 *
 * The six cards read 162 items discarded, 4 of 72 pages, 227 things not covered,
 * 144 references dropped, 22 unavailable, 164 open questions — and a row of six
 * equal cards asserts they are commensurable. They are not: 162 and 144 count
 * things the PIPELINE refused, 227 and 164 count things the run could not
 * SETTLE, and one of them is a share of pages. Partitioned by `kind` rather than
 * by index, so adding a fact to the copied layer lands it in a group rather than
 * shifting the split.
 *
 * NO BAR ON THESE CARDS, deliberately, and this is the one place in the panel
 * where a bar was proposed and refused. Within either group the nouns still
 * differ — items, references, pages — so a length beside them would assert the
 * comparison the split exists to prevent. The refusal table below is where a bar
 * belongs, because eleven rows there count one thing.
 */
/** A stable empty default, so `useMemo` does not re-place on every render. */
const NONE: Artefact[] = [];

const REFUSED: StageFactKind[] = ['discarded', 'reference_dropped', 'no_text', 'cut_short'];

export function ProvenanceLead({ stages, playsKept, artefacts = NONE, linkTo }: {
  stages: { name: string; warnings: string[]; ordinal?: number }[];
  /**
   * The report's items, for placing a refused step-1 item on its page. Without
   * them the refused items still read by step and kind.
   */
  artefacts?: Artefact[];
  /** Absent in the pack, which has no router: pages then print as text. */
  linkTo?: ArtefactLink;
  /**
   * How many exploitation plays survived, where the caller knows.
   *
   * The refusal count is in these warnings and the survival count is not — it is
   * `plays().length`, which the report has already computed. Optional, because
   * the sentence degrades to the half this panel can prove on its own rather
   * than guessing the other.
   */
  playsKept?: number;
}) {
  const warnings = useMemo(() => stages.flatMap((s) => (s.warnings ?? []).map(readable)), [stages]);
  const facts = useMemo(() => stageFacts(warnings), [warnings]);
  const thrown = useMemo(() => discards(stages), [stages]);
  const reasons = thrown.rows;
  // ~2,500 items on a real run; placed once, not per reason row.
  const places = useMemo(() => stageOnePlaces(artefacts), [artefacts]);

  if (!facts.length) return null;

  const affected = facts.reduce((n, fact) => n + fact.count, 0);
  const refused = reasons.find((row) => /exploitation play/i.test(row.reason))?.count ?? 0;

  /*
   * SORTED BY COUNT, NOT BY REGISTRY ORDER. The row read 162, 4, 227, 144, 22,
   * 164 — so "4 pages carried no policy text" sat at the same weight as, and
   * ahead of, "227 things not covered", and the row read as a list rather than
   * as a ranking.
   *
   * The discard card carries the reconciliation as its note, because it is the
   * card a reader compares against the table underneath it.
   */
  const cards = (group: typeof facts) => group
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((fact) => ({
      label: factLabel(fact).replace(/^\d[\d,]*\s*(of\s+[\d,]+\s*)?/, ''),
      value: fact.count.toLocaleString(),
      note: fact.kind === 'discarded' && thrown.explained && thrown.explained !== fact.count
        ? `${thrown.explained.toLocaleString()} with a reason`
        : fact.of !== null ? `of ${fact.of.toLocaleString()}` : undefined,
    }));

  const kept = facts.filter((fact) => REFUSED.includes(fact.kind));
  const unsettled = facts.filter((fact) => !REFUSED.includes(fact.kind));

  return (
    <section aria-labelledby="discarded">
      <h2 className="govuk-heading-l" id="discarded">What was discarded, and why</h2>
      <p className="govuk-body">
        An assessment is what survived. This is the rest: everything the model wrote that the run
        refused, every reference it could not follow, and the reason it gave in each case.
      </p>

      {/*
        THE SENTENCE THIS FILE'S OWN COMMENT DEMANDED, ON THE PAGE. It was a
        doc-comment above this component — "a report that says '47 plays' without
        that is overclaiming" — while the panel made it row one of a table. Both
        halves are computed: the refusal from `byReason`, the survival from the
        playbook the caller has already built. Never a constant.
      */}
      {refused ? (
        <p className="govuk-body">
          {playsKept
            ? <>The run wrote <strong>{(playsKept + refused).toLocaleString()}</strong> ways to beat the policy and kept{' '}
              <strong>{playsKept.toLocaleString()}</strong>. The {refused} it refused are row one below.</>
            : <>The run refused <strong>{refused}</strong> ways to beat the policy for resting on something other than an
              assumption — row one below. The list under Threats is what was left.</>}
        </p>
      ) : null}

      {kept.length ? (
        <>
          <h3 className="govuk-heading-m">What the run refused</h3>
          <Metrics columns={3} metrics={cards(kept)} />
        </>
      ) : null}

      {unsettled.length ? (
        <>
          <h3 className="govuk-heading-m">What it could not settle</h3>
          <Metrics columns={3} metrics={cards(unsettled)} />
        </>
      ) : null}

      {reasons.length ? (
        <>
          <h3 className="govuk-heading-m" id="why-refused">Why output was refused</h3>
          <p className="govuk-body">
            Each step checks what the model wrote against a fixed set of rules, and anything that
            fails is dropped rather than repaired. <strong>{thrown.explained.toLocaleString()}</strong> pieces
            of model output were refused with a reason recorded. These are those reasons, rolled up
            across the run.
          </p>
          <Table className="prt-table"
            caption="Reasons output was refused, largest first"
            columns={[
              { header: 'Items', numeric: true },
              { header: `Share of the ${thrown.explained}`, numeric: true },
              { header: 'What happened' },
            ]}
            rows={reasons.map((entry) => [
              /* THE SAME PRIMITIVE THE PLAY TABLES USE. Eleven counts spanning
                 26-fold were a column of digits, so the row that matters — 26
                 plays, 29% of everything refused — looked exactly like the three
                 rows worth one. */
              <Bar
                key="n"
                value={entry.count}
                max={reasons[0].count}
                digits={0}
                scale={`items refused, 0 to ${reasons[0].count} on this table`}
              />,
              `${Math.round((entry.count / thrown.explained) * 100)}%`,
              <>
                {entry.human}
                {/* The contract's own words are kept, never replaced: the exact
                    reason is the only thing that makes a discard checkable.

                    AND THE SUMMARY SAYS WHAT IT HOLDS. Eleven disclosures all
                    reading "The contract's own words" is eleven identical links
                    down the page for anyone tabbing the table. */}
                <Details summary={`The rule’s wording, and where the ${entry.count} ${entry.count === 1 ? 'item' : 'items'} it refused came from`}>
                  {/* `<pre>` rather than a paragraph: a zod union lists twenty-nine
                      quoted kinds and reflowing it as prose made a wall nobody
                      could read a value out of. It scrolls in its own box. */}
                  <pre className="prt-contract">{entry.reason}</pre>
                  {entry.items.length || entry.unnamed.length
                    ? <Affected items={entry.items} unnamed={entry.unnamed} places={places} linkTo={linkTo} />
                    : null}
                </Details>
              </>,
            ])}
          />
          {/*
            90 AND 162, RECONCILED IN ONE SENTENCE. The card above says 162 and
            the table says 90; the missing 72 are bulk lines of the shape "49
            groups of model output were discarded in this stage", which
            `parseRefusal` skips because they name no reason. Both figures come
            out of `discards()` in one pass, so they cannot drift apart again.
          */}
          {thrown.unexplained ? (
            <p className="govuk-body-s prt-meta">
              That is {thrown.explained} of the run&rsquo;s {thrown.total} discards. The other{' '}
              {thrown.unexplained} were discarded in bulk by stages that recorded no reason:{' '}
              {thrown.byStage.map((row) => `${row.count} in ${row.name}`).join(', ')}.
            </p>
          ) : null}
        </>
      ) : null}

      {/*
        ONE NOUN, AND THE RELATIONSHIP BETWEEN THE TWO TOTALS.
        The cards sum to 723 and this line said "read from 270 warnings", with
        the next section opening "270 limits were recorded" — three words for one
        array and two totals that cannot both be right unless a reader works out
        unaided that the cards count AFFECTED ITEMS and the caption counts
        SENTENCES. "Limits" is the noun, here and in the section below.
      */}
      <p className="govuk-body-s prt-meta govuk-!-margin-top-4">
        Read from the {warnings.length.toLocaleString()} limits the run recorded about itself, which
        describe {affected.toLocaleString()} affected items between them.
      </p>
    </section>
  );
}

/**
 * WHAT A DISCARD REFUSED — BY WHERE IT CAME FROM, NEVER BY ID.
 *
 * This printed the ids the warnings named, `s1_014_claim_002`, under the note
 * that they were never stored so there was nothing behind them to open. John,
 * reading the Best Start run: they "mean nothing to the user". They mean
 * something to the pipeline, though — a step-1 id names the passage its call was
 * reading — so `src/lib/refused.ts` places each one on its page, and the page
 * IS stored: it is the one link here that goes somewhere.
 *
 * Everything else says which step refused it and what kind of thing it was.
 * Since phase 21 the warning also records what each item said; where it did,
 * the item's own words are quoted beneath its page. NO IDS, not even behind a
 * disclosure: there is nothing a reader can do with one, and anyone who can is
 * reading the stored warning anyway.
 */
function Affected({ items, unnamed, places, linkTo }: {
  items: ReasonRow['items'];
  unnamed: ReasonRow['unnamed'];
  places: Map<string, Place>;
  linkTo?: ArtefactLink;
}) {
  const groups = groupRefused(items, unnamed, places);
  if (!groups.length) return null;
  const total = items.length + unnamed.reduce((n, u) => n + u.count, 0);
  return (
    <>
      <p className="govuk-body-s prt-meta">
        {total === 1 ? 'It was' : 'They were'} refused, so {total === 1 ? 'it is' : 'they are'} not in the
        assessment. This is where {total === 1 ? 'it' : 'they'} came from.
      </p>
      <ul className="govuk-list govuk-body-s prt-affected">
        {groups.map((group) => (
          <li key={group.key}>
            <RefusedLine group={group} linkTo={linkTo} />
            <Said items={group.items} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** One line: a page, or a step. */
function RefusedLine({ group, linkTo }: { group: RefusedGroup; linkTo?: ArtefactLink }) {
  if (group.where !== 'page') return <>{groupWords(group)}</>;
  const page = `page ${group.page}`;
  return (
    <>
      {pageWords(group)}{' '}
      {/* The passage is stored, so this link goes somewhere. A shared copy
          withholds passages and the pack has no router; both print the page
          as text. */}
      {group.passage && linkTo ? linkTo(group.passage, page) : page}
    </>
  );
}

/** The items' own words, where the warning recorded them (phase 21 onward). */
function Said({ items }: { items: RefusedGroup['items'] }) {
  const said = items.filter((item) => item.label || item.quote);
  if (!said.length) return null;
  return (
    <ul className="govuk-list govuk-body-s prt-affected__said">
      {said.map((item, index) => (
        <li key={`${item.id ?? ''}-${index}`}>
          {item.label ? <>&ldquo;{item.label}&rdquo;</> : null}
          {item.quote ? <span className="prt-meta">{item.label ? ', quoting ' : 'Quoting '}&ldquo;{item.quote}&rdquo;</span> : null}
        </li>
      ))}
    </ul>
  );
}
