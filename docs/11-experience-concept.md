# 11 · Experience concept

How the platform should feel, and the specific devices that make it feel that way. The brief (Yash/Aum, 4 November 2026): the site should be immersive and thoughtfully made, with a smooth narrative landing page that shows IIIC's work with businesses and individuals, hidden or playful details where they fit, the best possible 404, and nothing that reads like generated filler. The concept below spends its effort on pacing, typography and a few meaningful interactions rather than on motion for its own sake, because the people it is for arrive on mid-range phones over 4G and because the brand kit (`src/brand/`, 1.0.3) is already the visual language. Every line of copy here marked `[proposal]` needs IIIC's approval (I-41); none is a fact.

## 1. The concept: the bar is you

In the logo, the yellow bar is the ground the face stands on. On the platform, the bar is the reader: the subject moving through a page about the self. It is the one visual device that recurs everywhere, and it always does something:

- On narrative pages (home, framework, founders, a Journal article) a yellow bar under the header grows with the reader's progress down the page.
- In the Object/Subject section the bar slides under the line the reader has just flipped from object to subject.
- In the six-insight chapter of the founders' page the bar marks the insight in view.
- In forms, the bar marks the step the person is on (the kit's stepper already does this).
- On the 404 page the bar grows as the person writes.
- In Release 2 the person's Map, drawn as a constellation, travels with them (the plan's signature visual); the bar becomes its baseline.

Everything else is paper, ink, two typefaces and air. The framework's own claim is that the change is inside the person while the circumstances stay the same; the site behaves the same way: quiet surfaces, one moving thing, and that thing is the reader.

## 2. Principles

1. **Immersion is pacing, not spectacle.** Long measure, generous space, sections that answer one question each, a rhythm the reader learns once (`content/copy-architecture.md` §1).
2. **Native scrolling only.** No scroll-jacking or smooth-scroll libraries (they break accessibility, battery and the back button). Smoothness comes from `scroll-behavior: smooth` for in-page links, CSS scroll-driven animations where the browser supports them, and nothing that fights the thumb.
3. **One moving thing at a time.** At most one animation runs in view; durations 200–400 ms; easing `cubic-bezier(.2, .7, .2, 1)`; every animation is off under `prefers-reduced-motion` (the kit already enforces this globally).
4. **Type is the hero.** No hero artwork at launch: Fraunces for the question, Manrope for the answer, the bar. Real photographs appear where real people and rooms exist (I-18); no stock, no generated images, no gradients (platform plan).
5. **Every device has a reason the reader can feel.** If a detail cannot be explained in one sentence of the framework's own terms, it goes.
6. **Counselling pages stay plain.** No games, no hidden things, no bridges; the scope statement and the crisis numbers are the only extras.
7. **The budgets in `12-engineering-standards.md` win.** A device that costs more than its budget is cut, not optimised later.

## 3. The signature devices

### 3.1 The bar (progress)

A 6 px bar fixed below the header on narrative pages, `background: var(--iiic-accent)`, `transform-origin: left`, scaled from 0 to 1 with scroll. Built with a CSS scroll-driven animation (`animation-timeline: scroll(root)`) inside `@supports`, with a passive-scroll JavaScript fallback that sets a custom property; under reduced motion the bar is static and full-width (it becomes the brand's bar). `aria-hidden="true"`; the page's headings carry the structure for screen readers. Pages: `/`, `/framework`, `/founders`, `/journal/[slug]`; not booking, not counselling.

### 3.2 Flip the line (Object or subject?)

The copy system's two-column comparison is the framework's move made tactile. Each of the five pairs is a card showing the object line ("Life happens to me"). The card is a `<button aria-pressed="false">`; pressing it swaps the text to the subject line ("I shape how I meet life") and slides the bar under it; pressing again flips it back. A "Flip all" button flips every card; a "Show both" link reveals the plain two-column table (also the print view and the no-JavaScript view). Cross-fade 200 ms; instant under reduced motion. The accessible name of each button is its visible text, and a visually hidden hint referenced by `aria-describedby` (with `aria-description` as well, where supported) reads "Press to read this line as the subject" / "as the object". Where: `/framework` §3 and the home page §3 (home shows two pairs and links to the rest). Copy: the five pairs `[CS]`; a sixth pair only if IIIC writes it.

### 3.3 The sticky question

On long sections (the framework page's "What changes", the founders' six insights), the section's question stays in view with `position: sticky` on wide screens while its answers scroll past; on phones it is a normal heading. No pinning of the viewport, no hijacked scroll.

### 3.4 The doors

Three door cards with the register of the application they lead to (the kit's `.iiic-card-door` inside `.iiic-doors`): the reader's sentence as the title ("I want to understand myself."), IIIC's line for the vertical under it ("Counselling transforms how people perceive, interpret and understand."), the outcome band as the footer. Hover and focus lift the card by 2 px and darken its rule; nothing else. The same three doors appear on the home page and the Map's step 0, in the same order; the framework page shows them inside IIIC's own diagram, with each vertical's descriptor (`content/copy-architecture.md` §4.2). Order: counselling, consultancy, education is the copy system's order; the plan lists consultancy first as the core business; IIIC's philosophy document lists education first; the platform uses the order IIIC confirms (I-41).

### 3.5 Chapters

The founders' page is read as chapters: each section is a band with a small kicker (`[proposal]` "Chapter 1 · The shed", "Chapter 2 · The question", …) above the supplied heading. Chapters reveal once as they enter the viewport (opacity 0 → 1, 8 px rise, 320 ms, via `IntersectionObserver`, no library). The six insights are a two-column layout on wide screens: the six titles on the left with the bar marking the one in view, the insight text on the right; stacked cards on phones. The rupee figures are set in Fraunces and never animate: a number that counts up is a tell, and these are not counted facts.

### 3.6 A question to sit with

Every Journal article ends with one reflective question (the copy system's rule) in a paper panel, with a small "Take it with you" button that copies the question to the clipboard and reads "Copied" for two seconds. No account, no storage.

### 3.7 The Map's constellation (Release 2)

The plan's signature visual, drawn from real answers only. In Release 2 it appears on the result page, in the account, on the certificate and as the person's share image. Nothing is drawn before there are answers: no decorative constellations in Release 1.

### 3.8 Voices beside the text (reviews as the reader scrolls; D-37)

Every section that makes a claim has, beside it, someone who lived it saying so in their own words. The reader meets a new voice every few screens without anything moving on its own: the claim and the person who confirms it sit side by side.

- **Wide screens (from 1100 px, the kit's header breakpoint):** the section is a two-column grid, the content across seven of twelve columns and the voice across four, one column between. The voice is `position: sticky` (top: the header's height plus 24 px) inside its own section, so it stays beside the text while that section scrolls and gives way to the next section's voice where the section ends. CSS only: no scroll listeners, no JavaScript.
- **Phones and tablets:** the voice follows the section's content as a full-width card, read after the claim it supports.
- **The card:** the kit's proof card (`.iiic-card .iiic-card-proof`): the quote mark in ink on the yellow tile, the words in Fraunces, and a footer with the name, designation and place on one line and the programme and year on the next (the page stylesheet lets the footer wrap; the kit is not edited). Markup: an `<aside aria-label="In their words">` holding the card; the `blockquote` carries `lang` when the review is not in English, with the approved English translation after it. In the DOM the aside follows the section's content, so a screen reader meets the claim first, then the voice.
- **Length:** up to about 60 words beside the text (the excerpt the person approved, marked with an ellipsis); when it is an excerpt, the card links to the full review on Proof.
- **The first voice (home only):** one review of up to 25 words under the hero's actions, set small, with the same caption: the first person a visitor hears from, before they scroll.
- **Motion:** the kit's reveal once as the voice enters (opacity, 8 px rise, 320 ms); nothing under reduced motion; never a rotation, an auto-advance, a slider or a marquee.
- **Counselling pages:** plain cards inside the text, no sticky column, no reveal; initials and place unless the person chose more.
- **Not on:** booking flows, the Map, error pages, legal pages, emails and messages.
- **Performance:** voices are part of the page's server-rendered HTML, and their data is revalidated when a review is published, changed or withdrawn; no image unless the person agreed to a photograph (then 48 px, lazy-loaded, with width and height); a video review shows a poster and plays only when asked, with captions and a transcript.
- **Empty slot:** renders nothing, and the section stays one column.
- **Choosing:** the editor pins a review to each slot from the reviews tagged for that section's theme (`content/copy-architecture.md` §6); a review appears once per page; the selection changes only when the editor changes it.

## 4. The home page as a scroll narrative

Order and copy are in `content/copy-architecture.md` §4.1; this is the choreography.

| # | Section | What moves | Notes |
| --- | --- | --- | --- |
| 1 | Hero: the question, the lead, two actions, the first voice | Nothing. The bar starts here at zero | LCP is text; fonts preloaded; no image; the voice is text (§3.8) |
| 2 | Which question brought you here? (three doors) | Cards reveal once (stagger 60 ms) | Register surfaces on each door |
| 3 | One framework (the paragraph, two flip-able pairs) | Flip the line | Links to the full set on `/framework`; a voice beside it |
| 4 | How Subjective Self works (four steps) | Steps reveal once | The kit's `.iiic-steps`; a voice beside it |
| 5 | Why IIIC (three sourced facts) | Nothing | Each fact carries its source in small type; a voice beside it |
| 6 | In their words: six reviews, two per door, stacked, or the empty state | Each card reveals once | No carousel, no marquee; "Read them all" to Proof |
| 7 | A word from the founder | Nothing | His photograph, his words; beside them, a voice about him |
| 8 | The Journal (three) | Nothing | |
| 9 | Closing band (yellow): the heading, the Sanskrit line, the action | The bar reaches full width as the band enters | The page's one yellow band |

The whole page is server-rendered HTML with one small script for the reveals and flips (under 6 KB gzipped) and no third-party code. `content-visibility: auto` on sections 4–9 with `contain-intrinsic-size` set from their rendered heights.

## 5. Error pages, search and small pages

### 5.1 The 404 page (route `not-found`; register from the requested path; concept A, decided D-29)

**Concept A · "You're here. The page isn't."** The page does three things in order: it owns the broken link (accountability is one of the framework's three outcomes, so the site practises it), it offers one question that fits where the person was headed, and it gets them back on their way.

1. Kicker: "404 · Page not found".
2. Headline `[proposal]`: "This page isn't here. You are."
3. Line `[proposal]`: "The broken link is ours. It's logged, and it will be fixed. While you're here, one question."
4. One question, set in Fraunces, drawn from the pool for the door the requested path belonged to (`/organisations` and `/founders`: the founder questions; `/learn`: the learner questions; anything else: the general ones), so the question meets the person where they were going. A small link under it, "Why a question?", opens `/framework`. Candidate pool `[proposal]`, for the founder to approve, replace or extend (I-41):
   - "What were you looking for before you came here?"
   - "Which decision today was yours, and which was expected of you?"
   - "When did you last change your mind, and what changed it?"
   - "Whose expectation are you carrying right now?"
   - "What is one thing you did today because you chose to?"
   - "What would you do with the next hour if nobody were watching?"
   - Founders: "Which decision passed through your desk today that did not need you?" · "Who in your company decided something well this week, without you?"
   - Learners: "What did you learn this week that nobody set as a lesson?" · "Which question are you carrying into the next class?"
5. A text field, label "Your line (optional)", helper "Nothing you write here is stored or sent." As the person types, the bar under the field grows with the word count (full width at about twelve words). The field is plain `<textarea>` with no network call; the bar is `aria-hidden`.
6. Actions: "Find your path" (primary, to `/map`) · "Take the line with you" (secondary: copies the field's text, reads "Copied").
7. "Where were you headed?" a search field (`/search`), then the eight main links (Home · Framework · For organisations · Learn · Counselling · Proof · Journal · Contact, which opens the contact section of `/about`).
8. If the requested path begins with `/counselling` or `/book/session`, the page is the plain version: no question and no writing field; the kicker, the headline, the line, search, the links, and the counselling scope line with the crisis numbers above the footer. Someone who followed a broken counselling link may be in no state for a reflective exercise, and counselling surfaces carry no devices (§2).
9. Behind the page: the requested path and the referrer's host (never query strings) are written to `missing_pages`; Admin → Content → Broken links lists them with counts and a one-click "Create redirect" (the `redirects` collection), and the weekly report (O2) carries the top ten. The page returns a real 404 status.

Reduced motion: the bar does not grow; everything else is unchanged. Keyboard: the field is not auto-focused; the tab order is field → actions → search → links.

**Concept B · "Flip it" (not built).** The headline is "Life happens to me." with one button, "Flip it"; pressing it swaps the headline to "I shape how I meet life." and the bar slides under it; then "Find your path" and the links. One move, five seconds, the framework in miniature. Lighter than A, but it has no question and no writing, and the flip already lives on the framework page. Yash and Aum delegated the choice on 4 November 2026; A was chosen (D-29).

### 5.2 The 500 page

Plain: "Something went wrong on our side. It has been logged with the reference [ref]. Try again in a minute; if it keeps happening, write to [hello address] and quote the reference." No question, no device. Static HTML so it renders when the app cannot.

### 5.3 Search `/search` (Release 1, small)

Payload's search plugin indexes pages, Journal articles, services and FAQs; results are grouped by type with the matching sentence shown. It powers the 404 page's "Where were you headed?" and the header's search on wide screens. No tracking of queries beyond a count of searches with no results (shown in Admin → Content, to fix content gaps).

### 5.4 Accessibility statement `/accessibility`

The conformance target (WCAG 2.2 AA), what was tested and how, known issues with dates, how to report a problem, and the date of the last review. Written once in M7 and updated per release (`12-engineering-standards.md` §9).

### 5.5 `humans.txt` and `security.txt`

`/humans.txt`: who made the site (IIIC; Claude Code; the kit's typefaces and their licences) and the signature line with its translation. `/.well-known/security.txt` (RFC 9116): the security contact, the preferred language, an expiry date renewed yearly.

## 6. Quiet and hidden things

Each one is small, explainable in the framework's terms, off under reduced motion where it moves, and invisible to assistive technology where it is decoration. **Default** items ship in Release 1; **optional** items need IIIC's yes (I-41) and are built only if the budgets hold.

| # | Thing | Where | Default / optional | Why it belongs |
| --- | --- | --- | --- | --- |
| Q1 | The bar as progress (§3.1) | Narrative pages | Default | The reader is the subject |
| Q2 | Flip the line (§3.2) | `/framework`, home | Default | The framework's move, performed |
| Q3 | A question to sit with, with "Take it with you" (§3.6) | Journal articles, the 404 | Default | Reflection the reader keeps |
| Q4 | The printed page: any page printed becomes a clean sheet with the bar and the footer (the kit's print styles) | Everywhere | Default | Thoughtfulness extends to paper |
| Q5 | `humans.txt`, `security.txt` (§5.5) | Root | Default | Craft, and a standard |
| Q6 | A console note for developers: the institute's name, one line (`[proposal]` "Curious how this is built? Write to [hello address].") | Public pages | Default | The people who look are worth greeting |
| Q7 | The founder's photograph, when hovered or focused on the About page, shows a one-line caption in his words (I-10) | `/about` | Optional | His words, not a caption written for him |
| Q8 | Typing the word "self" anywhere on a public page (outside a form) shows a quiet card for five seconds: `[proposal]` "You went looking for the self. It was already here." with a link to `/framework`; Escape closes it; never on counselling or booking pages | Public pages | Optional | A hidden thing that says what the framework says |
| Q9 | The logo's line draws itself once, on the first visit of a session, 900 ms, then stays (an SVG stroke animation of the same fixed logo); off under reduced motion | Header | Optional (IIIC's yes, because the logo is fixed: the animation presents it, it does not change it) | The face is drawn, like the brochure's line art |
| Q10 | The eight words from the brochures' line art (learning, counseling, motivation, perception, personality, leadership, behavior, emotion; the platform respells counselling and behaviour in British English) as a quiet typographic strip above the footer, `aria-hidden` | Home | Optional (only if the founder confirms they are the field's words) | Continuity with IIIC's printed material |
| Q11 | The Map's share image and constellation (§3.7) | Release 2 | Default in R2 | The plan's signature visual |

Not done, on purpose: rotating testimonial sliders, testimonial marquees, star ratings, scroll-jacking, parallax, cursor trails, custom cursors, auto-playing video, sound, confetti, counters that count up, chat widgets, pop-ups of any kind, "exit intent", and anything on the counselling pages beyond the copy.

## 7. Motion and implementation rules (for Claude Code)

- Reveals: one `IntersectionObserver`, threshold 0.2, `rootMargin: "0px 0px -10% 0px"`, class `.is-in`; the CSS transition lives in the page's stylesheet, not the kit. Elements are visible by default and hidden only when JavaScript has loaded (`html.js .reveal { opacity: 0 }`), so nothing is invisible without JavaScript.
- Scroll-driven animations: `@supports (animation-timeline: scroll())` for the bar; the JavaScript fallback listens with `{ passive: true }` and throttles with `requestAnimationFrame`.
- `scroll-behavior: smooth` only under `@media (prefers-reduced-motion: no-preference)`; `scroll-padding-top` is already 88 px in the kit.
- `content-visibility: auto` on below-the-fold sections with `contain-intrinsic-size: auto 600px` (measure and adjust per section).
- No animation library; no `framer-motion`; no GSAP. The reveal, flip, bar, copy-to-clipboard and the 404 field together stay under 6 KB gzipped of JavaScript.
- Every interactive device has a no-JavaScript state that shows the full content.
- Focus is never moved by an animation; focus rings are the kit's.
- Test each device at 320 px, 375 px, 768 px and 1440 px, with reduced motion on and off, with a keyboard only, and with VoiceOver on iOS.

## 8. Imagery

- Launch: typography, the bar, the kit's patterns, and real photographs where IIIC supplies them with consent (I-18): the office, a workshop, the founder.
- The line-art illustration from the brochures (faces, brain, butterfly, solids) may be used as a motif if IIIC owns it (I-39); then it appears at most once per page, in ink on paper or ink on the yellow band, never as a hero.
- The head collage on the Subjective Self brochure cover is not used (I-39: origin and licence unknown; style outside the kit).
- No stock photography, no generated images, no icons beyond the kit's set.
- Every image has alt text written by a person; decorative images are `alt=""`.

## 9. What IIIC approves before M2 builds this

The hero headline choice (I-41) · the five Object/Subject pairs (I-41) · the door order (I-41) · the chapter kickers on the founders' page (I-41) · the 404 question pool (I-41; the concept is decided, D-29) · the "In their words" heading and the line under it on Proof (I-41) · the reviews and their consents (I-42) · the console line (I-41) · the optional items Q7–Q10 (I-41) · illustration rights (I-39) · photographs (I-18).

## 10. Acceptance (M2)

The home, framework and founders' pages read as one continuous narrative at 375 px with no layout shift (CLS ≤ 0.05), the bar tracks progress, each flip works with a keyboard and reads correctly in VoiceOver, every device degrades without JavaScript, reduced motion removes all movement, a voice stays beside its section on wide screens and follows it on phones without JavaScript, the 404 returns status 404 and logs the path, and the pages meet the budgets in `12-engineering-standards.md` §2 on a throttled mobile profile.
