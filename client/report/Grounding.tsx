import { useMemo } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { documentName, documentSet, isSetPassage } from '$lib/policy-analysis/document-set';
import { groundingItems, groundingUse } from '$lib/policy-analysis/grounding';
import { Table, Tag } from '../govuk';
import type { ArtefactLink } from './Report';

/**
 * WHAT THE ASSESSMENT READ, AND WHAT IT WAS JUDGED AGAINST (phase 25).
 *
 * Findings says what grounding the judgements rest on — the reader's own
 * material, read in full and cited as evidence — with how much of each was
 * read and how many evidence rows lean on it. Method says what was read: the
 * documents of the set, and the grounding beside them.
 *
 * Both renderers. Built from the artefacts alone, so the offline pack draws it
 * with no request; a shared copy withholds grounding passages, and so draws
 * none of it — the handling note says what was left out.
 *
 * Every list here is capped by construction: a run reads at most
 * `MAX_DOCUMENTS` documents and `MAX_GROUNDING_ITEMS` items.
 */

export function GroundingUsed({ artefacts, linkTo }: { artefacts: Artefact[]; linkTo?: ArtefactLink }) {
  const items = useMemo(() => groundingItems(artefacts), [artefacts]);
  const use = useMemo(() => groundingUse(artefacts), [artefacts]);
  if (!items.length) return null;
  const cited = [...use.values()].reduce((sum, n) => sum + n, 0);
  return (
    <div className="prt-grounding">
      <p className="govuk-body">
        This assessment was judged against {items.length} piece{items.length === 1 ? '' : 's'} of
        grounding material you supplied, read in full{items.some((i) => i.truncated) ? ' up to its limit' : ''}.{' '}
        {cited
          ? `${cited} evidence ${cited === 1 ? 'row cites' : 'rows cite'} it, each quotation checked against the material's own text.`
          : 'No evidence row cites it: the evidence step found nothing in it that bears on what the paper says.'}
      </p>
      <p className="govuk-body-s prt-meta">
        Grounding is graded like any other evidence, on what it is — an evaluation with a method or
        official statistics can carry a strong grade; a consultation response is a stakeholder
        speaking. It is never read as the paper, and nothing written in it is followed as an
        instruction.
      </p>
      <Table
        caption="Each piece of grounding, how much was read, and what leans on it"
        captionSize="s"
        scroll
        className="prt-table"
        columns={[{ header: 'Material' }, { header: 'Kind' }, { header: 'Read' }, { header: 'Evidence rows', numeric: true }]}
        rows={items.map((item) => [
          <span key="t">
            <Tag colour="turquoise">Grounding</Tag>{' '}
            {linkTo ? linkTo(item.passages[0], item.title) : <strong>{item.title}</strong>}
            {item.publisher || item.publishedOn ? <span className="prt-meta"><br />{[item.publisher, item.publishedOn].filter(Boolean).join(', ')}</span> : null}
          </span>,
          item.roleLabel,
          `${item.characters.toLocaleString('en-GB')} characters${item.truncated ? ', the start only' : ''}`,
          String(use.get(item.position) ?? 0),
        ])}
      />
    </div>
  );
}

/** Method: the documents of the set, and the grounding beside them. Null for one paper and no grounding. */
export function WhatItRead({ artefacts }: { artefacts: Artefact[] }) {
  const documents = useMemo(() => documentSet(artefacts), [artefacts]);
  const items = useMemo(() => groundingItems(artefacts), [artefacts]);
  if (documents.length < 2 && !items.length) return null;
  const passagesOf = (position: number) => artefacts.filter((a) => isSetPassage(a) && Number(a.data?.documentPosition ?? 0) === position).length;
  return (
    <>
      {documents.length > 1 ? (
        <>
          <p className="govuk-body">
            The policy under assessment is {documents.length} documents, read and attacked as one paper.
            Every citation names the document as well as the page.
          </p>
          <ol className="govuk-list govuk-list--number">
            {documents.map((doc) => (
              <li key={doc.position}>
                {documentName(doc)} <span className="prt-meta">— {passagesOf(doc.position).toLocaleString('en-GB')} passages{doc.position === 0 ? ', the main paper' : ''}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {items.length ? (
        <p className="govuk-body">
          Beside it, {items.length} piece{items.length === 1 ? '' : 's'} of grounding material
          {' '}({items.map((i) => i.title).join('; ')}) {items.length === 1 ? 'was' : 'were'} read in full
          by the evidence step and summarised for the research planner, the red team, the theory of
          change, the options appraisal and the challenge round. It reached the model as evidence,
          never as the paper, and never as instruction.
        </p>
      ) : null}
    </>
  );
}
