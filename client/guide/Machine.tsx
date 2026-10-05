import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from './motion';

/**
 * CHAPTER 1: THE POLICY AS A MACHINE, AND SOMEONE WALKING ROUND IT.
 *
 * Money goes in on the left, breakfasts come out on the right, and three
 * levers inside decide how: the payment per pupil, the school's own count, and
 * the council's yearly sample. A figure walks the outside looking for a gap,
 * stops at the count, and the gap lights up. That is the whole idea of a red
 * team, and the sentence under it says the half people miss: it finds weak
 * points; it does not predict that anyone will use them.
 *
 * THE LOOP IS 10 SECONDS AND REPEATS, so it has a pause control (WCAG 2.2.2:
 * anything moving for more than five seconds must be stoppable). Under
 * `prefers-reduced-motion` it does not start: the picture is drawn on its END
 * STATE — the figure at the gap, the gap lit — and says why it is still. The
 * text under the picture says everything the picture does, for anyone who
 * cannot see it.
 *
 * DRAWN FOR A PHONE: the viewBox is 380 wide, so at 320px the type is close to
 * its stated size, and the figure is capped in CSS so it does not balloon on a
 * desktop.
 */
export function Machine() {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  // A reader who turns reduced motion on mid-visit gets the still picture.
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  const id = useId();

  return (
    <figure className="prt-figure-guide">
      <svg
        className={`prt-machine prt-motion-loop${playing ? ' is-playing' : ' is-still'}`}
        viewBox="0 0 380 250"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        focusable="false"
      >
        <title id={`${id}-t`}>The policy as a machine, and a red team walking round it</title>
        <desc id={`${id}-d`}>
          Money goes in on the left and breakfasts come out on the right. Inside are three levers:
          £1.20 a pupil, schools count who comes, and a yearly sample check. A figure walks round the
          outside and stops at the count, which is marked as the weak point.
        </desc>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#0b0c0c" />
          </marker>
        </defs>

        {/* In and out. */}
        <text className="prt-machine__io" x="8" y="118">Money</text>
        <line x1="8" y1="128" x2="86" y2="128" stroke="#0b0c0c" strokeWidth="3" markerEnd={`url(#${id}-arrow)`} />
        <line x1="294" y1="128" x2="372" y2="128" stroke="#0b0c0c" strokeWidth="3" markerEnd={`url(#${id}-arrow)`} />
        <text className="prt-machine__io" x="376" y="118" textAnchor="end">Breakfasts</text>

        {/* The machine and its three levers. */}
        <rect className="prt-machine__body" x="90" y="52" width="200" height="152" rx="10" />
        <text className="prt-machine__name" x="190" y="74" textAnchor="middle">Breakfast for Every Child</text>
        {[
          ['£1.20 a pupil', 98],
          ['Schools count who comes', 134],
          ['Yearly sample check', 170],
        ].map(([label, y]) => (
          <g key={label as string}>
            <rect className="prt-machine__lever" x="100" y={(y as number) - 16} width="180" height="26" rx="4" />
            <circle className="prt-machine__knob" cx="114" cy={(y as number) - 3} r="5" />
            <text className="prt-machine__label" x="126" y={(y as number) + 2}>{label}</text>
          </g>
        ))}

        {/* The gap: the count, lit when the walker reaches it. */}
        <rect className="prt-machine__gap" x="95" y="114" width="190" height="34" rx="6" />

        {/* The walker: drawn at the origin and moved by the animation. */}
        <g className="prt-machine__walker">
          <circle cx="0" cy="-22" r="7" fill="#1d70b8" />
          <path d="M0,-14 L0,4 M0,-8 L-8,-1 M0,-8 L8,-1 M0,4 L-6,16 M0,4 L6,16" stroke="#1d70b8" strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle className="prt-machine__lens" cx="-12" cy="-12" r="5" fill="none" stroke="#0b0c0c" strokeWidth="2" />
        </g>
      </svg>
      <figcaption className="govuk-body prt-figure-guide__caption">
        A red team walks round the policy looking for a lever someone could pull for their own ends.
        Here it stops at the count: schools are paid for every pupil they say attended, and they are
        the ones who count.
      </figcaption>
      {/* NO CONTROL UNDER REDUCED MOTION: the stylesheet will not run a loop
          for a reader who asked for less motion, so a Play button would be a
          control that does nothing. The still picture is the whole answer. */}
      {reduced ? (
        <p className="govuk-body-s prt-meta">The animation is off because your device asks for less motion.</p>
      ) : (
        <button
          type="button"
          className="govuk-button govuk-button--secondary prt-figure-guide__control"
          data-module="govuk-button"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause the animation' : 'Play the animation'}
        </button>
      )}
    </figure>
  );
}
