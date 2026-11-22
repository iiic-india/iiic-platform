# 05 · Admin panel

The back office where IIIC runs the platform. It is built for a small team with one non-technical operator, so the test of every screen is: can the operator do the job from here, on a laptop or a phone, without asking anyone and without breaking anything?

## Design principles

1. **Start from today, not from tables.** The home screen answers "what needs me now?" Every item on it is actionable in place.
2. **One person, one record.** A client, lead or learner is one profile across all three applications, with one timeline of everything that happened.
3. **The system does the routine.** Confirmations, reminders, follow-ups, holds, invoices and certificates happen automatically. Staff approve, decide and talk to people.
4. **Safe by default.** Every destructive or money-moving action asks for a reason and is logged. Refunds above a threshold and anything that publishes proof need an owner. Counselling notes are private to their author.
5. **Nothing hidden in code.** Prices (and whether they are published), working hours, policies, message wording, automations and the Map's questions are edited in the admin, with a preview, not by a developer.
6. **Brand-light.** The admin uses the kit's type, ink, paper and yellow accent, but optimises for density and speed: smaller type scale, tables, keyboard shortcuts.

## Who uses it

| Role | Who (to confirm) | Can | Cannot |
| --- | --- | --- | --- |
| Owner | Founder; Aum | Everything, including settings, roles, approvals, exports | Read another practitioner's session notes |
| Operator | Falak (or whoever runs the office) | Bookings, calendar, clients (contact and booking data), leads, messages, content edits, testimonial moderation (draft decisions), refunds within the threshold, privacy requests (prepare) | Change prices, policies or roles; publish testimonials; approve erasure; see notes or Map answers |
| Practitioner | Each counsellor | Own calendar and availability, own clients' bookings, Map results the client chose to share, own private notes, mark attendance and no-shows | See other practitioners' clients or notes; see payments beyond paid/unpaid |
| Editor | Anyone writing the Journal or pages | Pages, posts, FAQs, media | Any client, lead, booking or payment data |
| Finance | The accountant (optional) | Payments, refunds (view), invoices, exports | Client notes, Map results, messages |

Two-factor authentication is mandatory for every role. Owners can deactivate a user in one click; deactivation ends their sessions immediately. Only owners manage staff accounts: everyone else sees and edits only their own (name, email, password). Staff are deactivated, never deleted (`04`), and accounts are changed one at a time. The last active owner can be neither deactivated nor stripped of the owner role, so someone can always manage staff (D-44).

When someone loses their phone, an owner resets their two-factor from their staff record: their sessions end, any lock from wrong codes is lifted, and they set up a new authenticator when they next sign in. The reset leaves the password as it is, so after a lost or stolen phone the owner sets a new password for them too. An owner's own two-factor is reset by another owner (D-44). Owners read the audit log under Settings: every change, with who made it, when and which fields; no one can edit or delete an entry. Staff can also recover on their own with one of their recovery codes: their other sessions end, and they set up a new authenticator on the spot, before they reach anything.

## Navigation

```
Today
Calendar          (schedule · availability)
Bookings
People            (clients · organisations)
Pipeline          (consultancy leads · partnerships · proposals)
Learning   R2     (courses · cohorts · enrolments; certificates from R1, D-39)
Map        R2     (definitions · results summary)
Proof             (feedback · testimonials · case studies · counters)
Content           (pages · journal · FAQs · media · practitioners · placeholders · broken links · search)
Messages          (templates · automations · log)
Money             (payments · refunds · invoices · exports)
Privacy           (requests · consent log · breach register)
Reports
Settings          (organisation · services and prices · booking rules · users and roles · integrations · audit log)
```

A global search (`/` or `Ctrl K`) finds any person, organisation, booking reference, invoice number or lead by name, phone, email or reference.

## Screens

### Today (home)

The operator's morning screen; practitioners see their own version.

| Panel | Shows | Inline actions |
| --- | --- | --- |
| Today's schedule | Sessions, calls and events in time order: time, client, type, format (with join link or "Office"), paid status, first-time client marker, Map shared marker | Open · join · mark attended or no-show · reschedule |
| Needs a reply | New leads and Team Map requests with an age timer (amber after 24 h, red after 48 h); partnership enquiries; time requests from the booking flow, with the person's preferred days and note (offer or accept a time in one step) | Assign · log a call · move stage · reply by email or WhatsApp |
| Money | Held slots awaiting payment, failed payments, refunds awaiting approval, invoices to send | Approve · retry link · open |
| Proof | New feedback, stories and reviews awaiting approval, consent replies, withdrawals to process | Review |
| Privacy | Open data requests with days remaining | Open |
| Something failed | Messages that bounced or failed, webhooks that errored, automations that stopped | Retry · open log |

A daily digest of the same content is emailed to the operator at 08:30 IST.

### Calendar

Week and day views across practitioners (filter per person), colour-coded by service type using the kit's register accents on white. Availability is edited here: weekly working hours per practitioner, exceptions (holidays, leave, a blocked afternoon) and a preview of the resulting bookable times; busy times from each practitioner's Google Calendar show as blocks and are never bookable. Drag a booking to move it: the system checks the new slot, asks whether to notify the client, updates the practitioner's Google Calendar and the client's invite, and sends the new confirmation.

### Bookings

A filterable list (date range, type, status, practitioner, paid). The booking record shows a header (reference, status chip, client, service, time, format), then a timeline: created → held → paid → confirmation sent (with delivery status per channel) → reminders → rescheduled → completed → feedback. Actions: reschedule, cancel with reason (with the refund the policy allows, shown before confirming), resend confirmation, change format, add a note for the client, open the client.

### People

The client record: contact details and preferred channel; consents (current state and history, read-only); every booking, payment, invoice, enrolment, certificate, message and lead in one timeline; Map results (summary only, and only if shared, for practitioners); tags; private staff notes (S2, operational); and for the practitioner, their own session notes (S3, author-only, every read logged). Organisations show their people, leads, proposals and invoices.

Merge duplicates: the system suggests matches on verified mobile or email; a merge keeps both histories and is logged.

### Pipeline

A board for consultancy leads (New → Contacted → Team Map scheduled → Team Map done → Debrief held → Proposal sent → Won | Lost) and a second board for partnerships. Each card: organisation, size band, sector, owner, next action and due date, days in stage. The lead record holds activities (notes, calls, messages, files), the Team Map (R2) and proposals. "Create proposal" opens a form (phases, fees, notes), renders the proposal PDF from the brand template, saves it as a version and sends it by email with a tracked link. Stale leads (no activity in seven days in an active stage) surface on Today.

### Learning (R2)

Courses (structure, lessons, completion rule), cohorts (dates, capacity, price, sessions), enrolments (status, payment, progress, attendance). Certificates (from R1, D-39): issue singly or in bulk for a programme (from R2, to everyone who met the course's completion rule), preview before issuing, revoke with a reason, reissue; the verify page reflects the change at once.

### Map (R2)

The definition editor: dimensions, questions, scale labels, scoring and routing rules, with a live preview of the question screens and a test mode that shows the result for sample answers. Versions are drafted, previewed and activated by an owner; results keep the version they were taken on. A results summary shows only counts and completion rates, never individual answers.

### Proof

Feedback (ratings and comments, private). Reviews (D-37): import the intake sheet or add one by hand; the screening checklist (`content/copy-architecture.md` §6) with a reason for any failure; "Send consent request" (V1) with a preview of exactly what will appear; the status (received · screened · consent requested · approved · published · declined · withdrawn); an owner approves publication; placements (pin a review to a page slot, see who is pinned where); withdraw. The original file and contact details never reach the public site. Stories: the moderation queue with the verified booking shown beside each, the client's consent choices, and two actions: approve (owner) or decline with a reason; spelling-only edits. Case studies: editor with an evidence field per number and a required client-approval upload before publishing. Counters: each public number with its definition, its source query and its "since" date; the operator can hide a counter but cannot type a number into it.

As built (M2): Proof → Reviews (`testimonials`, `04`). The operator adds a review by hand or the intake sheet is imported with `pnpm reviews:import <file>` (`src/scripts/import-reviews.ts`, run against the production database by the developer at an owner's request): each row records the person (found by their email or mobile, or added), the review at received, and, when the sheet records a yes with its date and evidence file, the consent to publish under the consent text in force on that date (the consent message must first be under Content → Consent texts, in force from before the earliest reply); a row is taken whole or not at all, a Ref already imported is left alone, and the report names rows by Ref only. The operator screens a review (the eight tests as ticks, and a reason for a failure), records the person's reply as a consent under Privacy → Consent log and links it, and moves the review to approved; an owner publishes it, which records who and when. Placements: each row is a page (`home`, `framework`, `founders`, `organisations` or one of its service pages, `learn`, `counselling`) and the link name of the section the review sits beside (a section's own "Link name"; `first-voice` for the home page's first voice); one review beside a section, up to three on the counselling page, about 60 words (25 for the first voice) unless an approved excerpt is shorter, and a review once per page. A withdrawal is recorded in the consent log, which takes every review of that person down at once; to take one review down at the person's request, set it to Withdrawn. "Send consent request" and its reminder come with V1 (M6).

### Content

Placeholders (D-56) lists what the pages still wait for: each placeholder by its input, the sections awaiting IIIC's approval and what awaits legal review, with the page and section of each. Until a page has been brought in, the Pages list names it under "Pages still to bring in", and "Start editing" copies the starter page in as a draft (D-54). A page has a Legal review state for the legal pages (draft until IIIC's lawyer has reviewed it, D-52); each section has a copy status (approved, or candidate with a visible marker until IIIC approves it, I-41, D-51), which a legal page does not show because its legal review is the approval (D-52), and may have a link name, unique on its page, that a link can open (D-55). The page rules (required fields and headings that are not blank, links only to paths on this site, one hero at the top and at most one closing band, unique link names, placeholders written as `[[TODO: what is missing, I-xx]]`, the scope statement on a counselling page and the certificate statement on the course page) are checked when a page is published, not when a draft is saved. A page records when it was first published; from then on its address shows that page only, so while it is unpublished the address shows the 404, and deleting it brings the starter page back (D-57). On the narrative pages the experience devices come from the sections themselves (`11` §3): a comparison on the home or framework page is drawn as the Object/Subject flip, with its table behind "Show both"; the framework's list of points keeps its question beside it on wide screens; on the founders' page each section between the hero and the closing band is a chapter whose kicker is the chapter's kicker (a placeholder until IIIC approves the words, I-41), and a cards section without links is the six insights, with their titles beside the cards on wide screens. Pages built from the kit's blocks (hero, doors, steps, the Object/Subject flip, chapters, FAQ, proof strip, price cards, band), each with its SEO fields (title, description, share image preview) and a `facts` list that names the source of every claim on the page; the Journal (draft, publish, topics, the question to sit with, images from the media library in the body; scheduled publishing waits for the M6 cron runner, because Payload runs it on its jobs queue); FAQs (each with the address of the page it belongs to and its order there, drafted and published as a page is, with no placeholder once published; a page's questions section shows the published ones, and nothing while there are none); media (alt text required; an "identifiable person" flag requires a consent file); practitioner profiles (credentials entered exactly as supplied; shown on the site while active; the staff account behind a profile is linked by an owner and never shown); consent texts with versions (Content → Consent texts: one text per purpose and language, numbered by the platform; owners and editors write them and the operator reads them; a version can change until its time comes and never after, so a new wording is a new version). Live preview in the brand (OS-4): a page or an article opens beside its editor (phone, tablet and desktop widths) and in a tab of its own ("Preview"), drawn by the route that will draw it, in its register, from its newest saved version; the frame reloads from the server at each save (Payload's `RefreshRouteOnSave`; no autosave, so the audit log is not written at every keystroke). Only staff who read drafts and have entered their two-factor code see a draft; a notice above the header says it is a preview, with "Leave preview"; signing out leaves it too. Publishing revalidates the live page at once. Every publish is versioned and can be rolled back. Broken links: the 404 log (path, referrer host, hits, first and last seen), most visited first, each entry opening with "Create redirect": the address visitors should be sent to (the pages are offered as one types), one button, and the entry shows as redirected; only the routes answering with the 404 write the log, and staff only resolve or remove entries. Redirects: each old address and where it leads, a page (followed wherever the page moves) or an address on this site, permanent or temporary; publishing a page at a new address adds the redirect from its old one by itself; a redirect that would chain or loop, start where a page is published or a starter page is still shown, or leave the site is refused with the reason; only the redirect a moved page leaves at its old address may go before a starter page (D-57). Owners, operators and editors make and change both; owners and editors remove them. Search index (Content → Search index): an entry for each published page, offered service, published Journal article and published question, kept by Payload's search plugin as they are published, changed and unpublished; its words are read-only, owners, operators and editors may change an entry's priority (higher comes first among its kind on `/search`), and owners and editors may remove entries and use "Reindex" to build a kind again from what is published. Search: searches with no results, so content gaps are visible (the `search_no_results` count, without the words searched; until Reports is built, under Reports → Analytics events).

### Messages

Templates per channel with variables, a preview with sample data, and for WhatsApp the approved template name and category. Automations: the list from `06-automations.md` with on/off, timing, last run, success and failure counts; each automation can be paused. The log: every message sent, its status from the provider, and retry for failures.

### Money

Payments (synced from the gateway webhooks, searchable by reference or phone), refunds (request with reason → approval if above the threshold → processed through the gateway to the original payment method, any payer instruction logged → status), invoices (created in Zoho Books automatically for paid bookings and shown here with their number, status and PDF; consultancy invoices raised by the operator in Zoho Books, payable by bank transfer or a Razorpay link), reconciliation (gateway payments against bookings and invoices), exports for the accountant.

### Privacy

Requests (access, correction, erasure, withdrawal, nomination, consumer complaints, privacy grievances) with verification status, timers (48-hour acknowledgement, one-month resolution for complaints, 30 days for data requests) and assignee; an access request produces a data export for the person; an erasure request shows exactly what will be deleted and what must be kept (invoices, required logs) before an owner confirms. The consent log (Privacy → Consent log: filterable, with written receipts; no entry is ever changed or deleted). The operator records a consent that arrived as a reply, with where the saved reply is kept, and a withdrawal however it arrived, as an entry of its own that names the consent it ends; the person's record shows both, newest first (M2). Guardian verifications. The breach register with 6-hour (CERT-In) and 72-hour (Data Protection Board) timers and each notification recorded.

### Reports

The plan's metrics with their definitions: cross-path rate, course enrolments per month, info session to enrolment, proposal calls per month, Team Map to proposal, counselling sessions per month, counselling return rate, Map completion, Map to booking; plus revenue by application, no-show rate and lead response time; the funnel from `analytics_events` (doors, step 0, booking started to confirmed, requests, searches; until Reports is built, owners see the raw events under Reports → Analytics events); and a health strip (uptime, failed jobs, email delivery per subdomain, the WhatsApp quality rating, cost lines) as in `12` §7. Each figure links to the records behind it. A weekly summary goes to owners every Monday (O2, O10).

### Settings

Legal information (proprietor's legal name, trade name, address, GSTIN or registration status, Udyam, customer care, grievance officer, CERT-In point of contact), bank details (Settings → Platform settings, owners only, M2: the footer's legal row and `/legal` print each detail once it is entered, and its placeholder until then); services and prices (with price history and SAC codes); the processor register; the yearly dark-pattern audit and its certificate; booking rules (notice, horizon, buffers, hold minutes, reschedule and cancellation windows, refund rules, quiet hours); users and roles; integrations (gateway, email, WhatsApp, calendar: status and test buttons; keys never shown after saving); feature flags; the audit log (who did what, when, from where; filterable; exportable by owners).

## Key workflows

| Workflow | Steps in the admin | Automatic |
| --- | --- | --- |
| Morning routine | Open Today; check the schedule; clear "Needs a reply"; approve money items | Digest at 08:30; reminders already sent |
| A client asks to move a session | Open the booking (search by phone) → Reschedule → pick a time → notify | Calendar invite updated, new confirmation sent, practitioner notified |
| Refund | Booking → Cancel → reason → refund amount shown by policy → confirm (owner approval above the threshold) | Gateway refund, status tracked, client notified, credit note if an invoice exists |
| New Team Map request | Today → open lead → assign → log the call → schedule the Team Map | Acknowledgement sent; SLA timer; stale-lead alert |
| Send a proposal | Lead → Create proposal → phases and fees → preview PDF → send | Version saved, follow-up task in three working days |
| Approve a story | Proof → story → check booking and consent → approve (owner) | Published with "Verified client", the programme and month; client told; withdrawal link active |
| Publish an earlier review | Proof → reviews → import or add → screen → send consent request → on the person's yes, approve (owner) → pin to slots | Consent request and one reminder (V1); the reply stored as evidence; the pages that show it revalidated; withdrawal unpublishes at once (V2) |
| Issue certificates (R1, D-39) | Programme or cohort → recipients (R2: the completion check) → preview → issue | PDFs with QR codes generated, verify pages live, recipients emailed (C5) |
| Data request | Privacy → request → verify → prepare → owner confirms | Deadline reminders; the person notified; audit entries |

## Quality bar

- Every list has search, filters, sorting, saved views and CSV export (owners and finance only for personal data).
- Statuses use one chip vocabulary everywhere (held, pending payment, confirmed, requested, completed, no-show, cancelled, rescheduled), in the kit's badge styles, never colour alone.
- Every destructive action shows what will happen and asks for a reason; every change is in the audit log.
- Today, booking records, the calendar day view and the lead record work on a phone.
- Empty states say what will appear and how to make it appear.
- Pages load in under a second on office broadband; lists paginate on the server.
- Session timeout after 12 hours; re-authentication for exports, role changes and erasure.

The implementation approach (which admin framework, which screens are generated and which are custom) is decided in `07-stack-and-integrations.md`.

## The component stack (D-78)

Proposed on 22 November 2026, after IIIC's owner asked for the console to be built from "the best components available". It becomes a decision when IIIC confirms it in `decisions.md`. The comparison, the sources, what was rejected and what could not be checked are in `research/admin-ui-kit-2026-11.md`. Versions are the latest on that date, pinned exactly. Every library is MIT, ISC or Apache-2.0; nothing is paid for.

| Job | Library | Why |
| --- | --- | --- |
| Shell, record editing, toasts | Payload's own UI 3.94.0: template, drawers, confirm modal, `toast` | It is already loaded, and it already passes the admin's CSP and axe tests. |
| Styling | Tailwind CSS 4.3.5, in the admin only: prefix `tw`, no Preflight | The components below are written in its classes; the prefix keeps them off Payload's own classes and variables. |
| Primitives | shadcn/ui components on Base UI 1.9.0, copied into `src/components/admin/ui` | Keyboard and focus behaviour comes from a maintained library; IIIC owns the markup and restyles it to the kit. |
| Charts | Recharts 3.11.0 through shadcn's Chart wrapper | SVG coloured by the kit's variables, keyboard access on by default, still under reduced motion. |
| Tables | TanStack Table 9.3.1 with Dice UI's data table; state in the URL through nuqs 2.10.3 | A real `<table>`, paged on the server; a filtered list is a link that can be saved. |
| Pipeline board | Dice UI Kanban on dnd-kit core 6.3.1 and sortable 10.0.0 | Pointer, touch and keyboard dragging with announcements, on the copy of dnd-kit that Payload already ships. |
| Calendar | FullCalendar 7.1.5, its MIT features, through its shadcn registry | Week and day grids, drag, resize and Asia/Kolkata are free; it stays light and takes the console's colours. |
| Global search | cmdk 1.1.1 through shadcn's Command | The palette shadcn itself ships; results come from a server function that checks the role. |
| Dates and times | react-day-picker 10.0.2; open slots from the slot engine; the browser's time field | One primitives family, and a phone shows its own time wheel. |
| Overlays | Base UI dialog, alert dialog, popover, menu, tooltip, drawer | One focus and layering model; the drawer is the phone sheet. |
| Timeline, stat tiles, empty states | Dice UI Timeline; shadcn Card, Item, Empty | An ordered list and plain cards: a figure is text first. |
| Motion | CSS transitions on the kit's `--iiic-motion` | Nothing to download, and the kit already sets it to 0 ms under reduced motion. |

Bklit UI, the owner's example, is not in the stack: it has no versions to pin, in effect one maintainer, and no keyboard access to a chart's points. It stays as the visual reference for chart tooltips and loading states, and is re-checked in May 2027.

**Setup, in order**

1. Record the decision. Tailwind is new to the project and stays out of the public site.
2. Add `tailwindcss`, `@tailwindcss/postcss` and `postcss`, pinned, with a `postcss.config.mjs` that names only the Tailwind plugin.
3. Write `src/app/(payload)/console.css`: the layer order first (`payload-default, payload, theme, base, components, utilities`), then Tailwind's theme and utilities with `prefix(tw)`, classes scanned only in `src/components/admin`, no Preflight. Import the kit's `01-tokens.css` and `02-semantic.css` only. Set sizes in px from the kit's tokens: Payload's root font size is 13 px (12 px at 1024 px and below), which would shrink Tailwind's `rem` sizes.
4. Run `shadcn init` on Base UI with the `tw` prefix and `aliases.ui` set to `@/components/admin/ui`. Map its variables to the kit's roles (surface, text, accent, rule, danger, focus). Delete the `.dark` block and the base-layer rules for `*` and `body`.
5. Build the console shell that every view renders: the user, two-factor and role check first, as `PlaceholdersView` does; then Payload's template, the console wrapper with the kit's fonts, Base UI's `CSPProvider` with the request's nonce, and a container for popups.
6. Add the guards (the rules below), then build the proof: the Pipeline board in M4. It exercises the styling, a copied registry component, a drag with a keyboard path, an instant update that goes back if the server refuses, a Payload drawer for the lead, and a phone layout. Today follows in M5.

**Rules**

- A table of the same figures beside every chart, with a caption.
- A keyboard path for every drag: "Move to stage" on a card, the Reschedule dialog on a booking. It is also the path for one finger and for a phone.
- Motion only where something changes place, about 150 ms, none under reduced motion, none on session-note views. Figures do not count up.
- Light only: no `.dark` block, no `dark:` class, the calendar never set to dark. Yellow sits on white, paper or its tints; a copied part with a dark fill is restyled.
- Nothing of this reaches a public page: these packages are imported only under `src/components/admin` and `src/app/(payload)`, held by a lint rule and the Lighthouse resource summary.
- Exact version pins. Copied registry code is recorded with its source and date, and reviewed as our own.
- Every view and every server function checks the user and the role first. Search never reads session notes or Map answers.
- The first view arrives with its data; lists page on the server. An instant update is shown only for what can be put back: never for money, erasure or publishing proof.
- Empty states say what will appear and why; a failed load says so and is never drawn as zero.
- Each screen has a phone layout of its own: one column, stacked rows for tables, 44 px targets, nothing that needs hover.

**Risks to test first** (a one-day spike before M4)

1. A production build on a Vercel preview: Tailwind's layers win over Payload's, and Payload's own screens are unchanged (its `.table`, `--color-blue-500`, `--font-mono`).
2. The public pages' CSS and budgets are unchanged once the PostCSS config exists.
3. The shadcn CLI writes `tw:` classes for its own, Dice UI's and FullCalendar's items, and the class-merging helper is set to the same prefix.
4. Base UI popups sit above Payload's nav, and neither a popup nor a Payload drawer is opened from inside the other. No CSP violation on any view.
5. A screen-reader pass on the board, one chart and the calendar, and a phone pass with one thumb.
6. JavaScript per console screen is measured and written in the pull request; none was measured in the research.

Still open for IIIC: chart and service colours (the kit has one accent, and yellow on white is 1.35:1), and whether the calendar needs a column per practitioner, which is a paid FullCalendar view.
