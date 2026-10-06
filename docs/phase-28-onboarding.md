# Phase 28 — the guide's opening tells a story

*6 October 2026. Branch `p28-onboarding`, off master @ `1b73c35`. Fixture only;
no model was called.*

## Why

Chapter 1 of the guide ("What a red team does") drew the made-up policy as a
box holding three "levers" with a stick figure walking round it on a 10-second
loop. The owner's verdict: the chapters that break the intelligence down work,
and the opening that sets out the scenario does not make sense. Looking at it,
nothing in the box ever moved. A reader could not tell what a lever was, who
pulled it, or what went wrong, so the figure decorated the paragraph above it
and explained nothing.

## What a reader gets now

`/guide/1` tells ONE way to beat the policy (the lead play, *Count every early
arrival as a breakfast*) as seven beats over one picture. The words scroll past
and the picture is pinned beside them, or above them on a phone:

| | beat | what changes in the picture |
|---|---|---|
| 1 | The promise | the Department, the school, eight children who eat |
| 2 | Follow the money | coins run down the money arrow; £1.20 × count = £9.60 a day; *Paid for* and *Eaten* bars appear, both 8 |
| 3 | Who keeps the count? | the count runs up from the school; the council and its dashed yearly-sample check appear |
| 4 | Read it as the school would | the school is outlined in the band colour, "each name = £1.20"; four more children arrive early, outlined |
| 5 | Pull the lever | the early four are counted; the count and the money tick 8 → 12 and £9.60 → £14.40; the paid bar grows and the gap is hatched: "4 paid for, never eaten" |
| 6 | Nobody notices | the Department "sees it working ✓", the council's sample "✓ looks right" |
| 7 | What the report writes down | the report's plain card for the play (who / what they do / what goes wrong, band tag); pins 1–4 on the picture for this play and the three others, listed with their bands |

The words are `STORY` in `client/guide/content.ts`; the component is
`client/guide/StoryOpening.tsx`; the styles replace the machine's in
`parts/_guide.scss`. `Machine.tsx` is deleted.

## Decisions

| fork | chosen | why |
|---|---|---|
| Model to copy | the Data Spine's "argument in five moves" (`QuestionStory.svelte`): one persistent picture, scroll beats | its explanation works because each beat adds ONE idea to the SAME drawing. The Engine Room swaps scenes per beat, which compares less well; the policy engine's onboarding is a static modal |
| Persistence | every element drawn once, `.is-on` / `.is-hot` classes switch state | a reader compares the picture with itself, and scrolling back plays it backwards for free |
| Driver | scroll, reading line at 55% beside the picture; on a phone, 20% of the way down the space UNDER the pinned picture | a fixed fraction on a phone marked a beat whose words were already hidden under the picture (seen in screenshots) |
| Phone beats | words plus a 30vh gap, no min-height | a tall beat kept its words scrolled under the picture while it was still current |
| Pause control | none | nothing moves unless the reader scrolls; there is no loop to stop (WCAG 2.2.2 does not apply) |
| Reduced motion | tokens collapse every transition; the travelling coins and return are not rendered, and are `display:none` in CSS as well | the picture steps instead of easing, never half-drawn |
| Screen readers | the picture is `aria-hidden`; the beats are an ordered list of real text, current one `aria-current="step"` | the words carry every number the picture shows, so the story is read once, not twice |
| Data | the lead play, its band and the other three plays come from the guide's existing artefacts | chapter 1 tells the same play chapters 3–5 dissect, and a content test pins the sums and the pins |

## Tests

- `content.test.ts` +3: the story's £1.20 is the paper's and its sums match the
  picture; the lead play is told and every other play is pinned exactly once;
  every beat has a title and words.
- Walk: chapter 1 opens on beat 1, scrolling to the last beat moves the picture
  to it with exactly one current step; under reduced motion it still steps and
  nothing travels. The old pause-control assertions are gone with the loop.

## Part 2 — the rest of the onboarding plan

Three follow-ups the owner asked for after seeing chapter 1.

**The whole idea in one picture, on `/guide`.** `StoryTeaser.tsx` draws the
story's picture (`StoryPicture`, now its own component) at two beats as a
before-and-after: *As the paper means it* (beat 3: eight children, eight paid
for, the council's sample) and *As the school reads it* (beat 6: twelve paid
for, eight eaten, everyone satisfied). This is the Data Spine's counterfactual
toggle: the same picture with its state swapped. Two buttons with
`aria-pressed`; the picture is hidden from screen readers and a polite caption
says what it shows.

**How should things be explained? (`reading.ts`, `ReadingChoice.tsx`).** This is
the policy engine's closing question. It is asked at the end of chapter 1 and
kept on the guide's front page. GOV.UK radios, applied on choosing, announced
politely. Stored as `prt-reading-level`, wrapped the way the banner's memory is.
A read that fails is plain; a write that fails holds for the visit. Plain is the
default and never hides anything. **With the detail**:

- every chapter adds `detail` paragraphs, the same idea in the report's own
  terms (stage names, the exposure rule exactly, what the stress test can and
  cannot see), in an inset after the plain paragraphs;
- each story beat adds an "In the report:" line naming what the report calls it;
- in a report, `PlayList` opens each way to beat it's workings ("How it would be
  run", and costs, signs and counters), which plain leaves one press away.

The offline pack prints the plain takeaways only. Its reader made no choice.

**Show the welcome message again.** "Hide this message" used to be permanent,
with nothing in the service to undo it. The guide's front page now tells a reader
who hid it so and offers "Show it again" (`forgetDismissed()` in `remember.ts`).

| fork | chosen | why |
|---|---|---|
| What "detail" changes in a report | open the play card disclosures, nothing more | the report already puts plain first and detail behind a disclosure, so the choice maps onto a structure that exists, and plain loses nothing |
| Where the hook sits in `PlayList` | above the empty-list early return | rules of hooks |
| Apply on choose, no Save button | yes | one question on the form; a Save button is one more thing to miss |
| Toggle as buttons, not radios | `aria-pressed` buttons | they change what is shown, not a value anything submits |

Tests: `reading.test.ts` (3), `remember.test.ts` +1, `content.test.ts` +2
(every chapter has detail that differs from its plain words; every beat but the
last names its report term). The walk covers the toggle and its caption,
"Show it again" bringing the banner back, the detail choice adding a chapter's
inset, and opening a report's play workings, then plain shutting them again.
`test:all` green.
