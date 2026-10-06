import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Band } from '$lib/policy-analysis/exposure';
import { BAND_FILL, BAND_INK, BAND_LABEL } from '$lib/policy-analysis/view';
import { leadPlay, PLAYS, STORY, STORY_EARLY, STORY_EATEN, STORY_PAY, STORY_PINS } from './content';
import { useReducedMotion } from './motion';
import { useReadingLevel } from './reading';

/**
 * CHAPTER 1: ONE WEAK POINT, TOLD AS A STORY OVER ONE PICTURE (phase 28).
 *
 * The beats are `STORY` in `content.ts`. They scroll past on the left while the
 * picture stays pinned on the right (on a phone, pinned above them), and the
 * beat whose top has crossed the reading line is the one the picture shows.
 * That is the Data Spine's "argument in five moves": EVERY THING IN THE PICTURE
 * IS DRAWN ONCE AND ONLY CHANGES STATE — the money, the count, the twelve
 * children, the two bars — so a reader compares one picture with itself
 * rather than reading seven pictures, and scrolling back plays it backwards.
 *
 * THE READER DRIVES IT. Nothing moves unless the reader scrolls, so there is no
 * loop and nothing to pause (the first version's 10-second loop needed a pause
 * control under WCAG 2.2.2; this has none to need). The coins and the return
 * that travel along the arrows run once per beat and are hidden outright under
 * reduced motion; every other change is a transition on the motion tokens,
 * which reduced motion collapses, so the picture simply steps.
 *
 * THE PICTURE IS HIDDEN FROM SCREEN READERS ON PURPOSE. The beats are real
 * text in an ordered list and say everything the picture does — the numbers
 * included — so a screen-reader user reads the story once, not twice. The beat
 * on screen is marked with `aria-current="step"` for anyone navigating by it.
 *
 * Drawn on a 360-wide viewBox, so at 320px the type is close to its stated
 * size; the stage is capped in CSS so it does not balloon on a desktop.
 */

/**
 * WHERE THE READING LINE SITS. Beside the picture (tablet up) it is just over
 * half way down the window. On a phone the picture is pinned ABOVE the words,
 * so the line sits a little below the picture's foot: a beat becomes current
 * as its words come out from under the picture, and stays current while they
 * are readable — a line at a fixed fraction of the window marked a beat whose
 * words were already hidden behind the picture.
 */
function readingLine(stage: HTMLElement | null): number {
  const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 40.0625em)').matches;
  if (wide || !stage) return window.innerHeight * 0.55;
  const foot = stage.getBoundingClientRect().bottom;
  return foot + (window.innerHeight - foot) * 0.2;
}

/** The last beat whose top has crossed the reading line. */
function useActiveBeat(list: RefObject<HTMLOListElement | null>, stage: RefObject<HTMLDivElement | null>): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const items = list.current?.querySelectorAll<HTMLElement>('[data-beat]');
      if (!items) return;
      const line = readingLine(stage.current);
      let current = 0;
      items.forEach((item, i) => { if (item.getBoundingClientRect().top <= line) current = i; });
      setBeat(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [list, stage]);
  return beat;
}

/** A number that eases to its target, or jumps there under reduced motion. */
function useTween(target: number, reduced: boolean, ms = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== 'function') { from.current = target; setValue(target); return; }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, ms]);
  return value;
}

const money = (n: number) => `£${n.toFixed(2)}`;
const bandOfPlay = (id: string): Band => PLAYS.find((p) => p.id === id)!.data.band as Band;

// The picture's geometry, named once.
const KID_X = (i: number) => 24 + i * 28.4;
const KIDS = STORY_EATEN + STORY_EARLY;
const BAR_X = 94;
const BAR_UNIT = 20;

/** Pins 2–4: the other ways to beat it, numbered after the story's own. */
const pinFor = (where: (typeof STORY_PINS)[number]['where']) => STORY_PINS.findIndex((p) => p.where === where) + 2;

export function StoryOpening() {
  const reduced = useReducedMotion();
  const level = useReadingLevel();
  const list = useRef<HTMLOListElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const beat = useActiveBeat(list, stage);

  const lead = leadPlay();
  const leadBand = lead.data.band as Band;
  const plain = lead.data.plain as { who: string; does: string; goesWrong: string };

  return (
    <div className="prt-story" data-beat={beat}>
      <div className="prt-story__stage" aria-hidden="true" ref={stage}>
        <p className="prt-story__where">
          <span className="prt-story__n">{beat + 1} of {STORY.length}</span> {STORY[beat].title}
        </p>
        <StoryPicture beat={beat} reduced={reduced} />
      </div>

      <ol className="prt-story__beats" ref={list}>
        {STORY.map((b, i) => (
          <li key={b.title} className={`prt-story__beat${i === beat ? ' is-current' : ''}`} data-beat={i} aria-current={i === beat ? 'step' : undefined}>
            <h2 className="govuk-heading-s prt-story__title">
              <span className="prt-story__n">{i + 1}</span> {b.title}
            </h2>
            {b.body.map((p) => <p key={p} className="govuk-body">{p}</p>)}
            {level === 'detail' && b.detail ? (
              <p className="govuk-body-s prt-story__detail"><strong>In the report:</strong> {b.detail}</p>
            ) : null}
            {i === STORY.length - 1 ? (
              <>
                <div className="prt-story__card" style={{ borderLeftColor: BAND_FILL[leadBand] }}>
                  <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-2">
                    <span className="prt-story__pin" style={{ background: BAND_FILL[leadBand], color: BAND_INK[leadBand] }} aria-hidden="true">1</span>{' '}
                    {lead.label}{' '}
                    <span className="prt-story__band" style={{ background: BAND_FILL[leadBand], color: BAND_INK[leadBand] }}>{BAND_LABEL[leadBand]}</span>
                  </p>
                  <dl className="prt-story__plain">
                    <dt>Who</dt><dd>{plain.who}</dd>
                    <dt>What they do</dt><dd>{plain.does}</dd>
                    <dt>What goes wrong</dt><dd>{plain.goesWrong}</dd>
                  </dl>
                </div>
                <p className="govuk-body">
                  A full run does the same for every body the paper gives a job to. On this paper it finds three more, pinned on the picture:
                </p>
                <ul className="govuk-list prt-story__others">
                  {STORY_PINS.map((pin) => {
                    const play = PLAYS.find((p) => p.id === pin.playId)!;
                    const band = bandOfPlay(pin.playId);
                    return (
                      <li key={pin.playId}>
                        <span className="prt-story__pin" style={{ background: BAND_FILL[band], color: BAND_INK[band] }} aria-hidden="true">{pinFor(pin.where)}</span>{' '}
                        {play.label} <span className="prt-meta">({BAND_LABEL[band].toLowerCase()})</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="govuk-body">
                  The report ranks them by how exposed the policy is to each. They are weak points, not
                  predictions: nobody has to use them. The next chapter shows where they come from.
                </p>
              </>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * THE PICTURE ALONE, at one beat: the story draws it beside its words, and the
 * guide's front page draws it at two beats as a before-and-after. Hidden from
 * screen readers by whoever draws it, whose words must say what it shows.
 */
export function StoryPicture({ beat, reduced }: { beat: number; reduced: boolean }) {
  const id = useId();
  const on = (from: number) => (beat >= from ? ' is-on' : '');

  const counted = beat >= 4 ? KIDS : STORY_EATEN;
  const shownCount = useTween(counted, reduced);
  const paid = Math.round(shownCount * 100) / 100;

  const leadBand = leadPlay().data.band as Band;
  const pinXY = { money: [124, 68], children: [KID_X(3.5), 222], count: [236, 68] } as const;

  return (
    <svg className="prt-story__svg" viewBox="0 0 360 390" focusable="false">
      <defs>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#0b0c0c" />
        </marker>
        <pattern id={`${id}-gap`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={BAND_FILL[leadBand]} />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2" />
        </pattern>
      </defs>

      {/* The Department, which pays and, at the end, believes the figures. */}
      <rect className="prt-story__box" x="100" y="6" width="160" height="48" rx="6" />
      <text className="prt-story__strong" x="180" y="26" textAnchor="middle">The Department</text>
      <text className={`prt-story__swap${beat < 5 ? ' is-on' : ''}`} x="180" y="44" textAnchor="middle">pays per pupil</text>
      <text className={`prt-story__swap prt-story__fooled${on(5)}`} x="180" y="44" textAnchor="middle">sees it working ✓</text>

      {/* The money, down: one number decides it. */}
      <line className={`prt-story__flow${beat === 1 || beat === 4 ? ' is-hot' : ''}`} x1="145" y1="56" x2="145" y2="144" markerEnd={`url(#${id}-arrow)`} />
      <g className={`prt-story__el${on(1)}`}>
        <text x="137" y="90" textAnchor="end">£1.20 × count</text>
        <text className="prt-story__strong" x="137" y="108" textAnchor="end">{money(paid * STORY_PAY)} a day</text>
      </g>
      {!reduced && (beat === 1 || beat === 4) ? (
        <g key={`coins-${beat}`} className="prt-story__travel">
          {[0, 1, 2].map((i) => (
            <circle key={i} className="prt-story__coin" cx="145" cy="0" r="5" style={{ animationDelay: `${i * 220}ms` }} />
          ))}
        </g>
      ) : null}

      {/* The count, up: kept by the school. */}
      <g className={`prt-story__el${on(2)}`}>
        <line className={`prt-story__flow${beat === 2 || beat === 4 ? ' is-hot' : ''}`} x1="215" y1="144" x2="215" y2="56" markerEnd={`url(#${id}-arrow)`} />
        <text x="223" y="90">Count sent in</text>
        <text className="prt-story__strong" x="223" y="108">{Math.round(shownCount)} pupils</text>
      </g>
      {!reduced && (beat === 2 || beat === 4) ? (
        <g key={`return-${beat}`} className="prt-story__travel">
          <rect className="prt-story__return" x="207" y="-7" width="16" height="14" rx="2" />
        </g>
      ) : null}

      {/* The school: the one that counts, and the one that gains. */}
      <rect className={`prt-story__box${beat >= 3 ? ' is-hot' : ''}`} x="100" y="146" width="160" height="52" rx="6" />
      <text className="prt-story__strong" x="180" y="168" textAnchor="middle">Primary school</text>
      <text x="180" y="186" textAnchor="middle">breakfast club</text>
      <g className={`prt-story__el prt-story__thought${beat === 3 || beat === 4 ? ' is-on' : ''}`}>
        <text x="92" y="166" textAnchor="end">each name</text>
        <text className="prt-story__strong" x="92" y="184" textAnchor="end">= £1.20</text>
      </g>

      {/* The council and its yearly sample, which looks where the gap is not. */}
      <g className={`prt-story__el${on(2)}`}>
        <rect className="prt-story__box prt-story__box--quiet" x="272" y="146" width="82" height="52" rx="6" />
        <text className="prt-story__strong" x="313" y="166" textAnchor="middle">Council</text>
        <text className={`prt-story__small prt-story__swap${beat < 5 ? ' is-on' : ''}`} x="313" y="184" textAnchor="middle">yearly sample</text>
        <text className={`prt-story__small prt-story__swap prt-story__fooled${on(5)}`} x="313" y="184" textAnchor="middle">✓ looks right</text>
        <path className={`prt-story__check${beat === 2 || beat >= 5 ? ' is-hot' : ''}`} d="M300,146 Q290,124 222,126" />
      </g>

      {/* Twelve children: eight came for breakfast, four arrived early. */}
      {Array.from({ length: KIDS }, (_, i) => {
        const early = i >= STORY_EATEN;
        return (
          <g
            key={i}
            className={`prt-story__kid${early ? ' prt-story__kid--early' : ''}${early ? on(3) : ' is-on'}${early && beat >= 4 ? ' is-counted' : ''}`}
            transform={`translate(${KID_X(i)} 0)`}
            style={{ transitionDelay: early && beat === 3 && !reduced ? `${(i - STORY_EATEN) * 120}ms` : undefined }}
          >
            <circle cx="0" cy="240" r="6" />
            <path d="M-7,262 Q-7,249 0,249 Q7,249 7,262 Z" />
          </g>
        );
      })}
      <g className="prt-story__el is-on">
        <path className="prt-story__bracket" d={`M${KID_X(0) - 8},270 v5 H${KID_X(STORY_EATEN - 1) + 8} v-5`} />
        <text className="prt-story__small" x={KID_X(3.5)} y="290" textAnchor="middle">came for breakfast</text>
      </g>
      <g className={`prt-story__el${on(3)}`}>
        <path className="prt-story__bracket" d={`M${KID_X(STORY_EATEN) - 8},270 v5 H${KID_X(KIDS - 1) + 8} v-5`} />
        <text className={`prt-story__small prt-story__swap${beat === 3 ? ' is-on' : ''}`} x={KID_X(9.5)} y="290" textAnchor="middle">arrived early</text>
        <text className={`prt-story__small prt-story__strong prt-story__swap${on(4)}`} x={KID_X(9.5)} y="290" textAnchor="middle">counted too</text>
      </g>

      {/* Paid for against eaten: the gap is the finding. */}
      <g className={`prt-story__el${on(1)}`}>
        <text x={BAR_X - 8} y="322" textAnchor="end">Paid for</text>
        <rect className="prt-story__bar" x={BAR_X} y="311" width={shownCount * BAR_UNIT} height="14" />
        <rect className={`prt-story__el${on(4)}`} x={BAR_X + STORY_EATEN * BAR_UNIT} y="311" width={Math.max(0, shownCount - STORY_EATEN) * BAR_UNIT} height="14" fill={`url(#${id}-gap)`} stroke="#0b0c0c" strokeWidth="1" />
        <text className="prt-story__strong" x={BAR_X + shownCount * BAR_UNIT + 6} y="322">{Math.round(shownCount)}</text>
        <text x={BAR_X - 8} y="350" textAnchor="end">Eaten</text>
        <rect className="prt-story__bar" x={BAR_X} y="339" width={STORY_EATEN * BAR_UNIT} height="14" />
        <text className="prt-story__strong" x={BAR_X + STORY_EATEN * BAR_UNIT + 6} y="350">{STORY_EATEN}</text>
      </g>
      <text className={`prt-story__el prt-story__gaplabel${on(4)}`} x={BAR_X + (STORY_EATEN + STORY_EARLY / 2) * BAR_UNIT} y="376" textAnchor="middle">
        {STORY_EARLY} paid for, never eaten
      </text>

      {/* The last beat: this way to beat it, and the three others a run would find. */}
      <g className={`prt-story__el${on(6)}`}>
        <Pin x={KID_X(9.5)} y={222} n={1} band={leadBand} />
        {STORY_PINS.map((pin) => {
          const [x, y] = pinXY[pin.where];
          return <Pin key={pin.playId} x={x} y={y} n={pinFor(pin.where)} band={bandOfPlay(pin.playId)} />;
        })}
      </g>
    </svg>
  );
}

function Pin({ x, y, n, band }: { x: number; y: number; n: number; band: Band }) {
  return (
    <g className="prt-story__pinmark" transform={`translate(${x} ${y})`}>
      <circle r="10" fill={BAND_FILL[band]} stroke="#0b0c0c" strokeWidth="1.5" />
      <text y="4.5" textAnchor="middle" style={{ fill: BAND_INK[band], fontWeight: 700 }}>{n}</text>
    </g>
  );
}
