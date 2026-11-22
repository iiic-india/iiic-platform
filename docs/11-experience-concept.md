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

As built (M2): the bar sits on the header's lower rule (`src/components/experience/ReadingBar.tsx`, in the header), so it always has the header's paper or white behind it. It is drawn on the paths of the narrative pages that `src/lib/experience/narrative.ts` lists (`/`, `/framework`, `/founders`) and on a Journal article's path (`/journal/[slug]`), and on no other page. On an article it is drawn only while the article asks for it with `data-reading-bar` (`src/components/journal/Article.tsx`), which an article that leads to counselling (`leadsToCounselling`) never does: the stylesheet shows the bar with `:has()` before any script runs, the header follows each page on client navigation, and a browser without `:has()` draws no bar on any article rather than one on a counselling surface. The fallback listens only where the browser has no scroll-driven animations and motion is not reduced, and draws once a frame; without JavaScript in such a browser the bar stays at zero. It reaches full width at the end of the page.

### 3.2 Flip the line (Object or subject?)

The copy system's two-column comparison is the framework's move made tactile. Each of the five pairs is a card showing the object line ("Life happens to me"). The card is a `<button aria-pressed="false">`; pressing it swaps the text to the subject line ("I shape how I meet life") and slides the bar under it; pressing again flips it back. A "Flip all" button flips every card; a "Show both" link reveals the plain two-column table (also the print view and the no-JavaScript view). Cross-fade 200 ms; instant under reduced motion. The accessible name of each button is its visible text, and a visually hidden hint referenced by `aria-describedby` (with `aria-description` as well, where supported) reads "Press to read this line as the subject" / "as the object". Where: `/framework` §3 and the home page §3 (home shows two pairs and links to the rest). Copy: the five pairs `[CS]`; a sixth pair only if IIIC writes it.

As built (M2): a comparison section on `/framework` or the home page is drawn as the flip at every width (`src/components/experience/FlipLines.tsx`); everywhere else, as on `/legal`, it stays the plain table. Each line is a card holding both sides in one grid cell, so it keeps the height of its longer side and a flip moves nothing; the side not shown is `visibility: hidden` and `aria-hidden`, so the button's name is the side it shows. A hairline runs under each line, the place the bar comes to; the bar slides along it when the line reads as the subject. The two hints are `hidden` elements referenced by `aria-describedby`, so a screen reader reads them through the button and never as text of their own. "Flip all" is a toggle button too: pressed when every line reads as the subject, which an inset ring doubling its ink border shows as well as its tint; pressing it then turns every line back. "Show both" is a link to the table, which the stylesheet hides only while the browser runs scripts (`@media (scripting: enabled)`) and shows again when it is the link's target (`:target`) or once the link has been followed, so it works before the page's script has loaded; on paper and without JavaScript the table stands alone in place of the lines. In forced colours (Windows contrast themes), which drop backgrounds and shadows, the bars here and beside the six insights (§3.5) take the system's highlight, and a pressed "Flip all" is filled with it. The home page's two pairs wait on IIIC choosing which two (I-41); the page flips a comparison as soon as it carries one.

### 3.3 The sticky question

On long sections (the framework page's "What changes", the founders' six insights), the section's question stays in view with `position: sticky` on wide screens while its answers scroll past; on phones it is a normal heading. No pinning of the viewport, no hijacked scroll.

As built (M2): from 1100 px (the kit's header breakpoint) the section is a grid of four columns for the question and eight for its answers; the question is `position: sticky` at 96 px from the top, below the sticky header. Below 1100 px the question is a heading above its answers. CSS only; the question comes before its answers in the page either way.

### 3.4 The doors

Three door cards with the register of the application they lead to (the kit's `.iiic-card-door` inside `.iiic-doors`): the reader's sentence as the title ("I want to understand myself."), IIIC's line for the vertical under it ("Counselling transforms how people perceive, interpret and understand."), the outcome band as the footer. Hover and focus lift the card by 2 px and darken its rule; nothing else. The same three doors appear on the home page and the Map's step 0, in the same order; the framework page shows them inside IIIC's own diagram, with each vertical's descriptor (`content/copy-architecture.md` §4.2). Order: counselling, consultancy, education is the copy system's order; the plan lists consultancy first as the core business; IIIC's philosophy document lists education first; the platform uses the order IIIC confirms (I-41).

### 3.5 Chapters

The founders' page is read as chapters: each section is a band with a small kicker (`[proposal]` "Chapter 1 · The shed", "Chapter 2 · The question", …) above the supplied heading. Chapters reveal once as they enter the viewport (opacity 0 → 1, 8 px rise, 320 ms, via `IntersectionObserver`, no library). The six insights are a two-column layout on wide screens: the six titles on the left with the bar marking the one in view, the insight text on the right; stacked cards on phones. The rupee figures are set in Fraunces and never animate: a number that counts up is a tell, and these are not counted facts.

As built (M2): the chapters are the four sections between the hero and the closing band. Each carries its kicker in the section's own kicker field, a placeholder (`[[TODO: approval of this chapter’s kicker, I-41]]`) until IIIC approves the words; the story's label, "IIIC's illustration, not a client's story" (D-28), follows its chapter's kicker. The reveal (`src/components/experience/RevealChapters.tsx`) holds back only a chapter wholly below the window once the page's script runs, so nothing a reader may already see disappears, and nothing is hidden without JavaScript, on paper or under reduced motion. The six insights (a cards section without links, on this page) keep their cards whole, each with its title and IIIC's sentences; on wide screens the section's question and the six titles, as links to the cards, stay in view on the left (§3.3), and the title of the card being read carries the bar (`aria-current`, `src/components/experience/InsightNav.tsx`); on phones the titles list is not shown and the cards stand one under another. A rupee figure in any page text ("₹100 crore") is set in Fraunces by the text renderer (`src/components/blocks/text.tsx`) and is never animated.

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

As built (M2): a review is pinned on the review itself (Proof → Reviews → Placements: a page and the link name of a section, or `first-voice` for the home page's hero), by owners and the operator, since a review's record holds client data editors do not see (`05`). A section with a pinned, published review is drawn by `src/components/proof/Voices.tsx`: from 1100 px a grid of twelve columns, the section across seven and the voice across four from the ninth, the voice `position: sticky` at 96 px (the sticky question's offset) inside the section's own box; below 1100 px the voice follows the section's content. The card is the kit's proof card with the caption wrapping onto its lines (`src/components/proof/ReviewCard.tsx`): the approved excerpt beside the text, with "Read the full review" to the review on Proof; a Gujarati or Hindi review in its language with `lang` and the approved translation after it, "Translated from …"; the connection and anything given for the review disclosed. The reveal is the chapters' (`RevealChapters`, the same 8 px rise and fade, held back only while wholly below the window, off under reduced motion and in print); inside a founders' chapter the chapter reveals as a whole and the voice does not move on its own. The home page's first voice sits under the hero's actions, small, and never moves. On the counselling page the reviews pinned to a section (up to three) are plain cards after its text, with no grid, no sticky column and no reveal; a counselling review shown with initials shows the place alone beside them. A slot with nothing pinned draws nothing. The reviews are read once per request through the visitor's access rules and cached until a published review changes (`src/lib/proof/read.ts`). The stacked "In their words" sections of the home, founders, organisations and learn pages are still to build.

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

The whole page is server-rendered HTML with one small script for the reveals and flips (under 6 KB gzipped) and no third-party code.

As built (M2): the doors' cards (rows 2; 60 ms apart within a row of three) and the steps (row 4) reveal once with the founders' chapters' script (`src/components/experience/RevealChapters.tsx`, `data-reveal`), held back only while wholly below the window and only once the script runs, never under reduced motion; "In their words" (row 6) joins when Proof is built. Row 8 shows the three newest published articles under the candidate heading "A little clarity" (I-41) with a link to all of them, and is not drawn while no article is published. `content-visibility: auto` on sections 4–9 with `contain-intrinsic-size` set from their rendered heights.

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
9. Behind the page: the requested path and the referrer's host (never query strings) are written to `missing_pages`; Admin → Content → Broken links lists them with counts and a one-click "Create redirect" (the `redirects` collection), and the weekly report (O2) carries the top ten. The page returns a real 404 status. As built: the route that answers the address with the 404 writes the entry, after its redirect lookup and before the 404 (`src/lib/redirects/lookup.ts`; the home page while unpublished does the same), never the page's own component, which Next.js renders along with every page that is served; it writes on the server once the response has gone, at most once per request (no route handler anyone could call), never on a preview deployment, never for a prefetch, and never an address that may carry something about a person (an email address, a phone number or a long number, something like a key) or that only a probe asks for (`.php` and the like, the never-indexed routes of D-67); at most 120 writes a minute per server, and no new address once the log holds 2,000 (`src/lib/redirects/`). An address that has a redirect never reaches the 404: it is sent on.

Reduced motion: the bar does not grow; everything else is unchanged. Keyboard: the field is not auto-focused; the tab order is field → actions → search → links.

As built (M2): `src/components/notFound/NotFoundPage.tsx`, its words and pools in `src/lib/notFound/copy.ts`, in every register's route group. The headline, the line and the question pool above are proposals, so until IIIC approves them each is drawn as its placeholder (I-41) and listed in the admin's placeholders report under "Page not found"; an approved line goes into the copy file as approved, and a copy-system line that is only a candidate goes in marked, and is shown with the candidate marker. The pool is chosen by the path, without regard to case (`/organisations` and `/founders` and below: the founders'; `/learn` and below: the learners'; anything else: the general one), and among a pool's approved questions the same address always gets the same one; the question is `data-nosnippet`. The line is a `<textarea>` with no name in no form, so the browser cannot send it, and nothing on the page makes a request as it is written; the bar under it (`aria-hidden`) grows with the words counted by the platform's word segmentation, full at twelve, through a custom property the script sets (no style attribute, D-42); under reduced motion it stands still at full width, the brand's bar, as the reading bar does (§3.1). "Take the line with you" is the Journal's "Take it with you" button with its own label, disabled while the line is empty and absent where the browser offers no clipboard. "Where were you headed?" is the site's search form (§5.3), and the eight main links follow it. On a counselling path the plain version carries the kicker, the headline, the line, the search and the links, then the scope statement and the crisis numbers. The status is 404 and the log is written as before (item 9). Without JavaScript none of the page is drawn: Next.js answers a 404 raised while a page renders per request (D-42) with an empty document that the page's script fills, as it did before this page existed; the status and the noindex header still stand. A 404 that reads without a script is left to the hardening pass (M7).

**Concept B · "Flip it" (not built).** The headline is "Life happens to me." with one button, "Flip it"; pressing it swaps the headline to "I shape how I meet life." and the bar slides under it; then "Find your path" and the links. One move, five seconds, the framework in miniature. Lighter than A, but it has no question and no writing, and the flip already lives on the framework page. Yash and Aum delegated the choice on 4 November 2026; A was chosen (D-29).

### 5.2 The 500 page

Plain: "Something went wrong on our side. It has been logged with the reference [ref]. Try again in a minute; if it keeps happening, write to [hello address] and quote the reference." No question, no device. Static HTML so it renders when the app cannot.

As built (`src/components/site/ServerError.tsx`): the first sentence is the heading; the reference is the error's digest, which Next.js writes to the server's log with the error and Sentry records as the tag `digest`; the address is the one the site publishes (`src/lib/site/contact.ts`) until the hello address exists (I-02). An error raised in the browser has no digest and nothing logs it yet (D-49), so the page then says nothing about a log and asks for no reference. Each register's route group draws it inside the shell (`error.tsx`); in the counselling register it also carries the scope statement and the crisis numbers, as the 404 there does (CLAUDE.md #9). When the root layout itself fails, `global-error.tsx` draws it in a document of its own. The page names itself in the tab ("Something went wrong · IIIC"), since Next.js gives a failed page no metadata. Both are drawn by the page's own scripts, which carry the request's nonce (D-42). The static file Next.js 16 serves when it cannot render the app at all (`500.html`) is built from `src/pages/500.tsx`, the one page of the pages router, in place of Next.js's own (which had its own words and a dark-mode stylesheet): the same heading and words without the reference, since there is no error to name, in the kit's classes, light only, and with no script at all (`unstable_runtimeJS: false`), so it needs no nonce. The proxy still answers a request for `/500`, `/_app`, `/_document` or `/_error` with the site's 404.

### 5.3 Search `/search` (Release 1, small)

Payload's search plugin indexes pages, Journal articles, services and FAQs; results are grouped by type with the matching sentence shown. It powers the 404 page's "Where were you headed?" and the header's search on wide screens. No tracking of queries beyond a count of searches with no results (shown in Admin → Content, to fix content gaps).

As built (M2): the index is `@payloadcms/plugin-search` 3.94.0 (`src/plugins/searchIndex.ts`; `04` `search_index`), holding only what is published; its rules are in `src/lib/search/entries.ts`. `/search` is a server-rendered page with a GET form (`src/components/search/SearchForm.tsx`): no script of its own, no route handler, and it works without JavaScript. A query is read as words by the platform's word segmentation, without LIKE's wildcards, at most 100 characters and 8 words; an entry matches when its text holds every word, whatever the case (Payload's `like`), and the starter pages the site still shows, which are not in the database, are matched by the same rule. Results come in four groups (Pages, Services, From the Journal, Questions and answers), a title holding every word first, then by priority; each shows the sentence holding the most words (the platform's sentence segmentation), cut around them when long, with the words marked by the kit's highlighter. The query is shown back as text and is never logged, stored or cached by the app; a search that finds nothing writes `search_no_results` (route `/search`, register default, the day's session code, the time, never the words), after the response, never for a prefetch or on a preview, at most 60 a minute per server. A server answers at most 600 searches a minute and then asks the visitor to try again in a minute, with the main links. The header's search is a link to `/search` from 1200 px, where the header has room beside the brand's full name, the five links and Find your path; below that it is not drawn, and the phone menu is unchanged, so the header costs no script. The request log of the hosting platform keeps each address it serves, the query of a GET search included, as for every page (D-17's log drain).

### 5.4 Accessibility statement `/accessibility`

The conformance target (WCAG 2.2 AA), what was tested and how, known issues with dates, how to report a problem, and the date of the last review. Written once in M7 and updated per release (`12-engineering-standards.md` §9).

### 5.5 `humans.txt` and `security.txt`

`/humans.txt`: who made the site (IIIC; Claude Code; the kit's typefaces and their licences) and the signature line with its translation. `/.well-known/security.txt` (RFC 9116): the security contact, the preferred language, an expiry date renewed yearly. As built: `Contact` is the address the site publishes until the security address exists (I-02), `Expires` is generated with each response, 365 days from the start of that day (so always a little under a year ahead and never stale), `Preferred-Languages: en`, and `Canonical` names the file on the production domain.

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

- Reveals: one `IntersectionObserver`, threshold 0.2, `rootMargin: "0px 0px -10% 0px"`, class `.is-in`; the CSS transition lives in the page's stylesheet, not the kit. Elements are visible by default and hidden only when JavaScript has loaded (`html.js .reveal { opacity: 0 }`), so nothing is invisible without JavaScript. As built for the founders' chapters (M2): threshold 0, because a chapter can be taller than the window (at 0.2 a chapter comes in only once a fifth of it is in view at one time, which a chapter more than about four and a half windows tall never reaches); the state is an attribute (`data-reveal`: empty as drawn, `waiting` while held back, `in` once seen), and the script holds back only what is wholly below the window, so nothing the reader may already see disappears.
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

## 11. The motion kit (proposed)

On 22 November 2026 IIIC's owner asked for "the best animations ever" on the website, and for the libraries and skills to make them. This section is the answer, proposed for IIIC to confirm (§11.6). The research behind it, with every source, is `research/motion-2026-11.md`.

Here, the best motion is the motion a reader feels without noticing: the page changes and the header stays where it was, a press is answered at once, the bar shows how far they have read. Every item below shows where something went or what changed. Where this section differs from §2, §4 or §7, those stand until IIIC confirms it.

### 11.1 The stack, in layers

| Layer | What it carries | Why |
| --- | --- | --- |
| 1. CSS and the kit | State changes and press feedback (transitions on the kit's roles); things that appear (`@starting-style`); anything tied to the reading position (scroll-driven animations: `animation-timeline` with `scroll()` and `view()`); springs written as `linear()` curves | All of it is in Chrome, Safari and Firefox today, costs no JavaScript, runs off the main thread, needs no nonce, and one media query stops it |
| 2. The browser's view transitions, through React's `<ViewTransition>` | The change from one page to the next | Next.js 16.4's App Router already runs a React that has it (19.3), so it costs CSS only; links within the site are Transitions and animate without configuration |
| 3. The small scripts already in the page | The founders' reveal, the insight titles, Flip the line, the reading bar's fallback, and the 404's bar | A few hundred bytes each, inside the 6 KB the devices may use (`12` §2) |
| 4. A library, only on the page that needs it | Motion (`motion` 14.14, MIT): `animate` from `motion/mini` (3.3 KB) or `motion/react` with `LazyMotion` and `m` (5.5 KB, features loaded on demand), loaded with `next/dynamic` on that page alone | Only for motion a person can interrupt or that follows data, such as the Map's constellation in Release 2. Nothing in the first pass needs it |
| 5. Out | GSAP and Anime.js (three times the headroom of about 10 KB); Rive, Lottie and dotLottie (46 to 430 KB, and WebAssembly or `eval` against the policy); Three.js and React Three Fiber (over the whole budget); Lenis and every smooth-scroll library (§2 rule 2); NumberFlow (counters are ruled out, §6); Theatre.js (public development paused); AutoAnimate (no list on a public page needs it); the animated component collections (built on Tailwind and their own look; inspiration only) | Each is too heavy, weakens the policy, or does what this document rules out |

### 11.2 The motion language

The kit's roles are the vocabulary; nothing defines a parallel set.

| Role | Value | Used for |
| --- | --- | --- |
| `--iiic-motion-fast` | 150 ms | Press feedback, hover, colour, anything leaving, the phone menu arriving |
| `--iiic-motion-base` | 260 ms | A state change or something arriving: the next page's content, an answer opening, the 404's bar |
| `--iiic-motion-slow` | 420 ms | The counselling register's own control transitions (the kit's); no device uses it |
| `--iiic-motion` | the register's role | What the kit's own controls use; 0 ms under reduced motion |
| `--iiic-ease` | `cubic-bezier(.2, .7, .2, 1)` | Everything that arrives, leaves or changes state. It is an ease-out: it moves at once and settles slowly |
| `linear` | constant speed | Progress tied to scrolling (the reading bar, the steps' rule), where the scroll itself sets the pace |
| `--iiic-spring` (new, proposed) | `linear(0, 0.042, 0.134, 0.246, 0.361, 0.469, 0.565, 0.647, 0.717, 0.775, 0.822, 0.86, 0.89, 0.914, 0.933, 0.948, 0.96, 0.969, 0.976, 0.982, 0.986, 0.989, 0.992, 0.994, 0.995, 0.996, 0.997, 0.998, 0.998, 0.999, 0.999, 0.999, 1)` over 480 ms | A mark that travels to a new place (the insight marker, the flip's bar). A critically damped spring (damping 1.0, response 0.3 s, Apple's model), sampled into 33 points: no overshoot, 90% of the way by about 190 ms, settled within 0.1% at 480 ms |

One spring is enough. A second, bouncier preset (damping 0.8: 1.4% overshoot over 450 ms) was generated and left out: overshoot belongs to motion that follows a flick or a throw, and nothing on the public pages is thrown.

How values are chosen:

- `transform` and `opacity` only. `height` only where an answer opens (§11.4, item 6), where there is no transform that does it.
- Nothing starts from `scale(0)`; press feedback is `scale(.97)` on a button and `scale(.985)` on a card, a larger surface.
- Leaving is faster than arriving: 150 ms out, 260 ms in.
- A transition, never a keyframe animation, on anything a person can press twice in a second, so it turns back from where it is.
- Hover motion only under `@media (hover: hover) and (pointer: fine)`, so a tap on a phone leaves nothing lifted.
- A stagger is 40 ms a step, on five items at most.
- Under reduced motion nothing moves, cross-fades included. The kit already stops every transition and animation (`03-components.css`); the view-transition pseudo-elements need their own rule, because the kit's `*` selector does not reach them.

### 11.3 The rules, as a checklist

Every motion change passes all of these before it merges:

- [ ] It shows where something went or what changed, in one sentence. Not decoration.
- [ ] Nothing loops or plays by itself; nothing moves unless the reader scrolled, pressed or navigated. The kit's skeleton shimmer is never used on a public page.
- [ ] Native scrolling only: no scroll-jacking, no pinning, no parallax, no smooth-scroll library. In-page links scroll smoothly only under `prefers-reduced-motion: no-preference`, and `<html>` carries `data-scroll-behavior="smooth"` so a route change still jumps to the top.
- [ ] Nothing delays reading: the hero never animates in; nothing the reader may already see is hidden; a page's content is readable within 260 ms of a navigation.
- [ ] One moving thing at a time, besides what the reader's own scrolling moves (the reading bar, the steps' rule).
- [ ] Budgets (`12` §2): JavaScript ≤ 150 KB a page and ≤ 6 KB for the devices; anything beyond CSS is loaded only on the page that uses it; CSS ≤ 40 KB; LCP ≤ 2 s; CLS ≤ 0.05; TBT ≤ 200 ms; Lighthouse performance ≥ 95; no third-party request (no runtime or WebAssembly file from a CDN).
- [ ] The policy (`12` §5): no script without the request's nonce, no `eval`, no WebAssembly; a `<style>` element added at runtime carries the nonce; styles set from JavaScript are fine.
- [ ] Without JavaScript the page shows everything; nothing is hidden before a script runs.
- [ ] Under reduced motion nothing moves, and the page reads the same.
- [ ] No layout shift: only `transform` and `opacity` move; a change in height follows the reader's own press.
- [ ] Keyboard and screen reader unchanged: an animation never moves focus or changes what is announced; a moving part that only decorates is `aria-hidden`.
- [ ] Forced colours: a moving bar takes the system's `Highlight`, as the devices' bars already do.
- [ ] Print: nothing that moves prints; the content is complete.
- [ ] Where: no devices on counselling pages, booking flows, the Map, legal pages or error pages (the 404's bar is the one device there, §5.1). The kit's own control feedback (buttons, fields, the phone menu) is not a device and stays everywhere, at the register's speed.
- [ ] The kit: light only, the yellow only on paper or white, the kit's roles for duration and easing; a change to a kit file is recorded in `decisions.md` first (D-53).
- [ ] Tested at 320, 375, 768 and 1440 px, with reduced motion on and off, keyboard only, VoiceOver on iOS and NVDA; played at 2 to 5 times its duration to judge the feel; the CSP test and Lighthouse CI pass.

### 11.4 Where motion goes

Found by sweeping the public pages as built (`src/content/starter/*.ts`, `src/components/blocks/`, `src/components/site/`, `src/components/journal/`, `src/components/experience/`, the 404 and Find your path) and judging each candidate in order: should it move at all, for what, with which tool, which properties, which curve and duration, how it is interrupted, how it leaves. Ranked by how much each does for the reader. Pass 1 is the first pull request and fits inside the budgets: about 0.5 KB of JavaScript and about 2 KB of CSS, gzipped, added in all.

| # | Element and page | What moves, and why | Values | Technique, cost | Without JavaScript · reduced motion | LCP · CLS | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Page to page, between the pages in the motion set: home, `/framework`, `/founders`, `/organisations` and its service pages, `/learn`, `/institute`, `/about`, `/proof`, the Journal, `/search` | The page's content changes while the header, the mark and the bar stay still: the reader sees that the place stayed and the page changed | Leaving content: `opacity` 1 → 0, 150 ms, `--iiic-ease`. Arriving content: `opacity` 0 → 1 and `translate` 0 8px → 0, 260 ms, `--iiic-ease`, no delay. Header named `site-header` and the root: group animation `none`, old snapshot `display: none`, new snapshot not animated. `::view-transition { pointer-events: none }`. Each page in the set wraps its content in `<ViewTransition enter={{ page: 'iiic-page-in', default: 'none' }} exit={{ page: 'iiic-page-out', default: 'none' }} default="none">` (in `PageAt` and the Journal's pages, never a layout); a `<Link>` whose destination is in the set carries `transitionTypes={['page']}` | React's `<ViewTransition>` (same-document view transitions), already in the page; CSS about 0.6 KB; no new JavaScript | A full page load, no animation · nothing moves (`animation: none` on every `::view-transition-*`) | None on first load (a navigation inside the page is not an LCP). No shift. Back and forward do not animate (React skips `popstate`) | 1 |
| 2 | Everything pressable: buttons and cards that link (the doors, linked cards, Journal entries) on every page, as the kit's control feedback; the flip lines on the narrative pages | A press is answered on the instant the finger or pointer goes down, before the page changes | `:active` `transform: scale(.97)` on `.iiic-btn`, `scale(.985)` on a linked card and a flip line; `transition: transform 150ms var(--iiic-ease)`; release the same. The kit's hover lift (button −1 px, card −3 px) only under `(hover: hover) and (pointer: fine)` and only on cards that are links (`a.iiic-card`); a card that is not a link stops lifting, because a lift says "press me" | CSS, about 0.2 KB; kit change (`03-components.css`, `04-patterns.css`) | Works without JavaScript · nothing moves | None | 1 |
| 3 | The steps' rule on home §4 and `/framework` ("How Subjective Self works") | A 4 px yellow mark fills the rule between one step and the next as the reader passes the step: the bar again, at the scale of a process | A `<span aria-hidden="true">` per step over the 2 px rule, `background: var(--iiic-mark)`, `transform: scaleY(0 → 1)`, `transform-origin: top`; each step `view-timeline: --iiic-step block`; `animation: iiic-fill linear both; animation-timeline: --iiic-step; animation-range: cover 35% cover 65%` (it fills while the step crosses the middle third of the window; tune by feel); inside `@supports (animation-timeline: view())` and `prefers-reduced-motion: no-preference`; a new device flag in `src/lib/experience/narrative.ts`, so a steps list on a counselling page never fills | CSS scroll-driven animation; CSS about 0.3 KB; no JavaScript | The rule as today, without the mark · the rule as today | None: the mark is drawn over a rule that is already there | 1 |
| 4 | The insight titles on `/founders` (wide screens, from 1100 px) | One mark glides from the title just read to the next, instead of one shrinking while another grows: the reader sees which card they moved to | One `<span aria-hidden="true">` in the titles' list, 4 px wide and 1 px tall, `transform: translateY(<link's top + 6> px) scaleY(<link's height − 12>)` set on the mark itself from `InsightNav` when the current card changes (and on resize), `transform-origin: top`, `transition: transform 480ms var(--iiic-spring)`; the first placement without a transition | The existing client component; about 0.3 KB more | No mark, titles as plain links (as today) · the mark jumps | None | 1 |
| 5 | The phone menu (every page's header below 851 px, the kit's breakpoint) | The menu comes down from the header it belongs to instead of appearing | Opening: `opacity` 0 → 1 and `translate` 0 −8px → 0, 150 ms, `--iiic-ease`, by `@starting-style` on `.iiic-nav-toggle[aria-expanded="true"] + .iiic-nav`; closing: at once, so a link followed from the menu is not held up | CSS, about 0.1 KB; kit change (`04-patterns.css`); the kit's control feedback, not a device | (see the note after this table) · nothing moves | The header grows at the reader's own press, which is not counted as a shift | 1 |
| 6 | The questions on the service pages (`/organisations/*`) and any FAQ outside the counselling register | An answer opens down from its question instead of snapping in | `.iiic-accordion` in the FAQ section: `interpolate-size: allow-keywords`; `::details-content { block-size: 0; overflow: clip; opacity: 0; transition: block-size 260ms var(--iiic-ease), opacity 150ms var(--iiic-ease), content-visibility 260ms allow-discrete }`; `[open]::details-content { block-size: auto; opacity: 1 }`. Animates in Chrome; Safari and Firefox open at once, as today, until they support `interpolate-size` | CSS, about 0.2 KB, in `blocks.module.css` | `<details>` opens without JavaScript · opens at once | A change in height at the reader's press, not counted | 1 |
| 7 | In-page links: the insight titles, "Show both", the footer's Contact (`/about#contact`), the skip link | The page scrolls to where the link points instead of jumping, so the reader sees which way they went | `html { scroll-behavior: smooth }` under `prefers-reduced-motion: no-preference`; `data-scroll-behavior="smooth"` on `<html>` (Next.js 16 then turns it off for route changes); `scroll-padding-top` stays the kit's 88 px | CSS and one attribute; asked for in §7 and not yet built | The same · jumps (the kit sets `scroll-behavior: auto`) | None | 1 |
| 8 | Journal articles | The reading bar, which §3.1 already gives them | Add `/journal/<slug>` to the narrative paths in `src/lib/experience/narrative.ts` | The built device; no new code beyond the path test | As §3.1 | As §3.1 | 1 |
| 9 | Flip the line on `/framework` and home | "Flip all" turns the lines one after another, so the reader sees each line turn; the bar travels like a thing with weight; the cross-fade reads as one line changing, not two lines overlapping | While "Flip all" is pressed the list carries `data-cascade`: `transition-delay` 0, 40, 80, 120, 160 ms on the five lines' faces and bars (a single press clears it). The bar: `transition: transform 480ms var(--iiic-spring)`. The faces: the leaving face also `filter: blur(2px)`, the arriving one from `blur(2px)` to none, within the 200 ms cross-fade; drop the blur if Safari shows a stutter | CSS and about 0.1 KB in `FlipLines` | The table, as today · flips at once | None | 2 |
| 10 | The current page in the header (wide screens) | During a page change the marked link glides from the old page's name to the new one: where the reader went, in the navigation | First, a wayfinding fix worth making by itself: the header's links carry `aria-current="page"` (the kit already styles it; today nothing sets it), from a small client component reading the path (about 0.4 KB). Then `view-transition-name: iiic-nav-current` on that link only while a `page` transition runs (`:root:active-view-transition-type(page)`), group `animation-duration: 260ms`, `--iiic-ease` | View transitions; CSS about 0.1 KB | The current link marked, no glide · no glide | None | 2 |
| 11 | The Journal's topics | On a change of topic the filled chip slides to the chosen one | `view-transition-name: iiic-topic-current` on `.topics a[aria-current]`, 260 ms, `--iiic-ease` | View transitions; CSS only | As today · no slide | None | 2 |
| 12 | The 404 page (built with the full page in M2, §5.1) | The bar under "Your line" grows with the words written | `transform: scaleX(min(words / 12, 1))` set on the bar from the field's input handler, once a frame; `transition: transform 260ms var(--iiic-ease)`, so each word turns it from where it is; `aria-hidden`; not on the plain counselling 404 | Inside the 404's own script | The field works, the bar stays at zero · the bar does not grow | None | With the 404 |
| 13 | Voices beside the text and "In their words" (§3.8, §4 row 6) | As already specified: each voice reveals once | As §3.8: opacity and an 8 px rise, 320 ms, `--iiic-ease`, held back only when wholly below the window, as the founders' chapters are | The founders' reveal, reused | Shown · shown | None | With the reviews |
| 14 | The Map's constellation (Release 2, §3.7) | Points settle into place as the person's answers place them | Points move with `--iiic-spring`; drawn once, in the order answered; SVG first; Motion's mini `animate` or the Web Animations API, loaded only on the result page; OGL only if SVG cannot draw it | Layer 4, its own page | A drawn image · drawn complete, nothing moves | Its own budget check | Release 2 |

On item 5: without JavaScript the phone menu does not open at all today, because the kit shows the menu only when the button says it is open, and the button needs a script. That is outside motion and is noted for the build plan: the footer's links are the way round it for now.

**Page-to-page navigation: yes, as a quiet cross-fade inside the page.** It is the one motion a visitor meets on every visit, and the one that answers "where am I": the header, the mark and the bar hold still while the content changes under them. It is done with React's `<ViewTransition>`, which the App Router already ships, so it costs about 0.6 KB of CSS and no JavaScript. It runs only between pages in the motion set. A link into a counselling page, a booking flow, the Map, a legal page or an error page carries no type, so nothing moves; a counselling page has no wrapper, so leaving it moves nothing on it either. No slides: the site has no forward and back of its own, the browser's back button would not animate anyway, and a slide across the whole window is the motion most likely to make someone unwell. The cross-document rule (`@view-transition`) is not used: Next.js's links change the page inside the document, so it would almost never run, and Firefox does not support it.

**The doors: still when they arrive, answering when pressed, no morph.** The doors are the page's main choice, and on a wide screen they are often already in view when the page loads; a reveal would hide or replay the very thing the reader came to choose, so §4's "Cards reveal once (stagger 60 ms)" is struck. They keep the kit's 3 px lift on a fine pointer (§3.4's "2 px" is corrected to the kit's value) and gain the press in item 2. The page a door opens arrives with the site's cross-fade, except the counselling door, which opens with no motion at all. A door that grows into its page was considered and rejected: one of the three doors leads to counselling, where nothing may move, and a card's sentence stretching into a different heading reads as distortion, not continuity.

### 11.5 What does not move, and why

| Candidate | Why not |
| --- | --- |
| Any hero entrance (a fade, a rise, text split into words or letters) | The hero is the page's LCP and the first thing read; animating it in delays both |
| Sections that fade up as they scroll in, on every page | It hides what is there, replays on every page and reads as a template. §3.5 and §3.8 keep reveals for the founders' chapters and the voices |
| §4's "Steps reveal once" | Replaced by the steps' rule filling (item 3), which hides nothing |
| A door growing into its page | See the verdict on the doors |
| Slides between pages, forward and back | No forward and back of the site's own; the back button would not animate; the strongest trigger of motion sickness |
| The bar on each marked heading drawing itself in | Decoration, a dozen times a page, competing with the reading bar |
| The logo drawing itself in the header (Q9) | Stays optional and IIIC's call; the header is the one thing that stays still across a page change, and the mark is an image, not lines that can be drawn |
| Figures counting up (NumberFlow) | §6 rules it out; the rupee figures never animate |
| Parallax, pinning, smooth-scroll libraries (Lenis) | §2 rule 2 |
| Find your path's choice cards | Step 0 of the Map, which carries no devices; choosing should register at once. The kit's own 150 ms border and dot transitions stay |
| "Take it with you" reading "Copied" | The change of words is the confirmation, announced to screen readers; motion would add nothing |
| Search results changing as a person types | Changes many times a second; motion would slow reading |
| The Journal's list entering with a stagger | It would replay on every list page; the page's cross-fade is enough |
| A WebGL or gradient visual, cursor effects | No hero artwork, no gradients (§2 rule 4, the platform plan); over the budget |

### 11.6 Proposed decisions

For IIIC to confirm in `decisions.md`:

1. **The motion kit's layers (§11.1).** CSS first, view transitions through React, and a library only on the page that needs it, named by a decision; §7's "No animation library" becomes "no animation library on a page unless that page needs it and a decision names it". Reason: the platform now does what the libraries were for, at no cost to the budget.
2. **React 19.3.** Move the pin from 19.2.x to 19.3.x (stable since 9 September 2026), with its types, on a branch with the full test suite. Reason: the App Router already runs Next.js's React 19.3 build, and `<ViewTransition>` is typed only in 19.3.
3. **Page transitions (§11.4 item 1 and its verdict).** A cross-fade inside the page between the pages of the motion set, the header still, nothing to or from counselling, booking, the Map, legal or error pages; no cross-document rule. Reason: it shows that the place stayed and the page changed, for 0.6 KB of CSS.
4. **Kit changes (D-53).** `--iiic-spring` added to `01-tokens.css`; button press `scale(.97)` in `03-components.css`; card lift only on linked cards and fine pointers, card press `scale(.985)` and the phone menu's entrance in `04-patterns.css`. Reason: press feedback and honest hover belong to every page that uses the kit, not to one stylesheet.
5. **Corrections to this document.** §2 rule 3's "durations 200–400 ms" becomes the kit's roles (150, 260 and 420 ms); §3.4's lift is the kit's 3 px; §4 loses the doors' reveal and the steps' reveal, and gains the steps' rule (item 3). Reason: the kit is the design system, and the struck reveals hide what the reader came for.
6. **Smooth in-page scrolling (§11.4 item 7)** with `data-scroll-behavior="smooth"` on `<html>`. Reason: §7 asks for it, and Next.js 16 needs the attribute to keep route changes instant.
7. **Not to be proposed again without new facts:** GSAP, Anime.js, Rive, Lottie and dotLottie, Three.js and React Three Fiber, Lenis, NumberFlow, Theatre.js, and the animated component collections. Reason: `research/motion-2026-11.md` §2 measured each against the budgets and the policy.
