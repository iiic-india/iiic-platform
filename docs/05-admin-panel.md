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

When someone loses their phone, an owner resets their two-factor from their staff record: their sessions end, any lock from wrong codes is lifted, and they set up a new authenticator when they next sign in. The reset leaves the password as it is, so after a lost or stolen phone the owner sets a new password for them too. An owner's own two-factor is reset by another owner (D-44). Staff can also recover on their own with one of their recovery codes: their other sessions end, and they set up a new authenticator on the spot, before they reach anything.

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

### Content

Pages built from the kit's blocks (hero, doors, steps, the Object/Subject flip, chapters, FAQ, proof strip, price cards, band), each with its SEO fields (title, description, share image preview) and a `facts` list that names the source of every claim on the page; the Journal (draft, schedule, publish, topics, the question to sit with); FAQs; media (alt text required; an "identifiable person" flag requires a consent file); practitioner profiles (credentials entered exactly as supplied); consent texts with versions. Live preview in the brand; publishing revalidates the live page at once. Every publish is versioned and can be rolled back. Placeholders: every `[[TODO]]` on the site with its page and input ID, as a to-do list for IIIC. Broken links: the 404 log (path, referrer host, hits, first and last seen) with "Create redirect" in one click. Search: searches with no results, so content gaps are visible.

### Messages

Templates per channel with variables, a preview with sample data, and for WhatsApp the approved template name and category. Automations: the list from `06-automations.md` with on/off, timing, last run, success and failure counts; each automation can be paused. The log: every message sent, its status from the provider, and retry for failures.

### Money

Payments (synced from the gateway webhooks, searchable by reference or phone), refunds (request with reason → approval if above the threshold → processed through the gateway to the original payment method, any payer instruction logged → status), invoices (created in Zoho Books automatically for paid bookings and shown here with their number, status and PDF; consultancy invoices raised by the operator in Zoho Books, payable by bank transfer or a Razorpay link), reconciliation (gateway payments against bookings and invoices), exports for the accountant.

### Privacy

Requests (access, correction, erasure, withdrawal, nomination, consumer complaints, privacy grievances) with verification status, timers (48-hour acknowledgement, one-month resolution for complaints, 30 days for data requests) and assignee; an access request produces a data export for the person; an erasure request shows exactly what will be deleted and what must be kept (invoices, required logs) before an owner confirms. The consent log (read-only, filterable, with written receipts). Guardian verifications. The breach register with 6-hour (CERT-In) and 72-hour (Data Protection Board) timers and each notification recorded.

### Reports

The plan's metrics with their definitions: cross-path rate, course enrolments per month, info session to enrolment, proposal calls per month, Team Map to proposal, counselling sessions per month, counselling return rate, Map completion, Map to booking; plus revenue by application, no-show rate and lead response time; the funnel from `analytics_events` (doors, step 0, booking started to confirmed, requests, searches); and a health strip (uptime, failed jobs, email delivery per subdomain, the WhatsApp quality rating, cost lines) as in `12` §7. Each figure links to the records behind it. A weekly summary goes to owners every Monday (O2, O10).

### Settings

Legal information (proprietor's legal name, trade name, address, GSTIN or registration status, Udyam, customer care, grievance officer, CERT-In point of contact), bank details; services and prices (with price history and SAC codes); the processor register; the yearly dark-pattern audit and its certificate; booking rules (notice, horizon, buffers, hold minutes, reschedule and cancellation windows, refund rules, quiet hours); users and roles; integrations (gateway, email, WhatsApp, calendar: status and test buttons; keys never shown after saving); feature flags; the audit log (who did what, when, from where; filterable; exportable by owners).

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
