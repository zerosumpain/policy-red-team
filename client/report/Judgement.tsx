import { judgementOf } from '$lib/writeup-view';
import type { Artefact } from '$lib/policy-analysis/contracts';

/**
 * HOW MUCH OF THIS THE ASSESSMENT WILL STAND BEHIND.
 *
 * Every finding and every recommendation carries `data.judgement`, and until
 * now the only place in the app that read it was the drill — one artefact per
 * page load. So a reader of the write-up could not tell a well-supported
 * conclusion from a provisional one without opening nineteen separate pages, on
 * a run where four of the nineteen are provisional and four are well supported.
 *
 * NOT THE EXPOSURE RAMP, AND NOT A GDS TAG. The four-step pink ramp means
 * MAGNITUDE everywhere else on this page — how bad a play is — and a second
 * vocabulary borrowing its steps would make one set of colours mean two things
 * in one panel. `Tag` was the other candidate and is what the design system
 * offers: it was declined because its palette is the third colour vocabulary on
 * the same screen, and because GDS defines a tag as the status of a case or a
 * task, which an epistemic reading of an argument is not.
 *
 * SO IT IS INK, AND IT IS THE WORD. Filled black for the strongest claim, a
 * plain outline for the middle, a dotted outline for provisional — a ramp of
 * CONFIDENCE drawn as a ramp of solidity, which survives a monochrome print and
 * every form of colour vision. The word is inside the box in all four cases, so
 * the treatment is never carrying the meaning on its own.
 */
export function Judgement({ artefact, className }: { artefact: Artefact; className?: string }) {
  return <JudgementWord judgement={judgementOf(artefact)} className={className} />;
}

/**
 * The same chip, from a judgement already worked out — the Verdict lead holds
 * `KeyJudgement`s, and a key judgement from a later stage may have no finding
 * artefact to read one from.
 */
export function JudgementWord({ judgement, className }: { judgement: { key: string; label: string }; className?: string }) {
  const { key, label } = judgement;
  // A run whose findings carry no judgement and no confidence reads "Unknown",
  // which is a real answer and is drawn. Nothing is rendered only where the
  // function returns nothing at all, which it cannot — but an empty string is
  // cheaper to guard than to reason about.
  if (!label) return null;
  return (
    <p className={`prt-judgement${key ? ` prt-judgement--${key}` : ''}${className ? ` ${className}` : ''}`}>
      <span className="govuk-visually-hidden">How well supported: </span>{label}
    </p>
  );
}
