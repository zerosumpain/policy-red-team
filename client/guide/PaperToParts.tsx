import { useRef, useState } from 'react';
import { PAPER, PIECE_LABEL, piecesSoFar, sentenceYield, type PieceKind } from './content';

const KINDS: PieceKind[] = ['part', 'assumption', 'body'];

/**
 * CHAPTER 2: THE PAPER COMES APART INTO THE THINGS THE REPORT IS BUILT FROM.
 *
 * The made-up paper is on the left; pressing "Read the next sentence" lights
 * one sentence and drops what it gives up into three lists — parts of the
 * policy, assumptions, bodies — which is what steps 1 to 3 of a real run do
 * to a whole paper.
 *
 * THE READER DRIVES IT. Nothing moves on its own, so there is nothing to
 * pause; each step is one short transition (the motion tokens), and under
 * reduced motion the pieces simply appear. "Show it all" jumps to the end
 * state for anyone who wants the answer rather than the walk.
 *
 * WHAT CHANGED IS SAID ALOUD: a polite live region reads "Sentence 2 of 5
 * gave 1 part of the policy, 1 body, 1 assumption", so a screen-reader user is
 * not left to rediscover three lists after every press. A body met twice is
 * listed once — the run resolves names the same way — and the announcement
 * still counts what the sentence named.
 */
export function PaperToParts() {
  const [read, setRead] = useState(0);
  const [said, setSaid] = useState('');
  const primary = useRef<HTMLButtonElement>(null);
  const total = PAPER.length;
  const pieces = piecesSoFar(read);
  // Pieces the latest sentence added, so only they animate in.
  const before = piecesSoFar(read - 1);
  const isNew = (kind: PieceKind, text: string) => read > 0 && !before[kind].includes(text);

  return (
    <div className="prt-parts">
      <div className="prt-parts__paper">
        <h2 className="govuk-heading-s">The paper</h2>
        <ol className="prt-parts__sentences">
          {PAPER.map((sentence, i) => (
            <li
              key={sentence.text}
              className={`prt-parts__sentence${i < read ? ' is-read' : ''}${i === read - 1 ? ' is-current' : ''}`}
              aria-current={i === read - 1 ? 'step' : undefined}
            >
              {sentence.text}
            </li>
          ))}
        </ol>
        <div className="govuk-button-group">
          {/* ONE BUTTON THAT CHANGES JOB, never a disabled one: disabling the
              control that has focus drops a keyboard user at the top of the page. */}
          <button
            type="button"
            className="govuk-button govuk-!-margin-bottom-0"
            data-module="govuk-button"
            ref={primary}
            onClick={() => {
              const next = read >= total ? 0 : read + 1;
              setRead(next);
              setSaid(next ? `Sentence ${next} of ${total} gave ${sentenceYield(PAPER[next - 1])}.` : 'Back to the start. Nothing has been read yet.');
            }}
          >
            {read === 0 ? 'Read the first sentence' : read >= total ? 'Start again' : 'Read the next sentence'}
          </button>
          {read < total ? (
            <button
              type="button"
              className="prt-linkbutton"
              onClick={() => {
                setRead(total);
                const all = piecesSoFar(total);
                setSaid(`All ${total} sentences read: ${KINDS.map((k) => `${all[k].length} ${PIECE_LABEL[k].many.toLowerCase()}`).join(', ')}.`);
                // This control goes when it has done its job; focus stays on the one that remains.
                primary.current?.focus();
              }}
            >
              Show it all
            </button>
          ) : null}
        </div>
      </div>

      <div className="prt-parts__out">
        {KINDS.map((kind) => (
          <section key={kind} className={`prt-parts__bin prt-parts__bin--${kind}`} aria-labelledby={`parts-bin-${kind}`}>
            <h2 className="govuk-heading-s prt-parts__bintitle" id={`parts-bin-${kind}`}>
              {PIECE_LABEL[kind].many} <span className="prt-meta">({pieces[kind].length})</span>
            </h2>
            {pieces[kind].length ? (
              <ul className="prt-parts__pieces">
                {pieces[kind].map((text) => (
                  <li key={text} className={`prt-parts__piece${isNew(kind, text) ? ' is-new' : ''}`}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className="govuk-body-s prt-meta">None yet.</p>
            )}
          </section>
        ))}
      </div>

      <p className="govuk-visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
