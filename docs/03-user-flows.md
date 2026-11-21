# 03 · User flows

Each flow lists its steps, the states it can be in, and the edge cases the build must handle. Times are IST. Automations triggered by these flows are specified in `06-automations.md`; the data they write is in `04-data-model.md`.

## F1 · Find your path (Map step 0) · R1

1. "Who is this for?" → Yourself · Your family · Your organisation (`.iiic-choice` cards).
2. Route:
   - Yourself → `/counselling` with the session options, plus related: the course info session.
   - Your family → `/counselling#family`, plus related: the Journal on family.
   - Your organisation → `/organisations/team-map`, plus related: book a proposal call.
   - Until its place exists, Release 1 sends "Your family" to `/counselling` (its family part waits on I-31). "Your organisation" goes to `/organisations/team-map`, whose page exists from M2 (what the Team Map is waits on I-12; its request form comes with the pipeline, M4). The related items are not shown yet. The answers and their doors are in `src/lib/map/stepZero.ts`; the form posts the answer to `/map/go`, so it never appears in an address that a request log keeps.
3. Store nothing personal. Record an analytics event with the choice only (the event comes with the analytics events, M2).

## F2 · The Subjective Self Map · R2

1. Step 0 as F1.
2. Consent screen before the first question: what is stored, why, for how long, who sees it (a counsellor only if the person agrees), how to delete it. Two separate choices: "Save my map" (required to see the full result later) and "Share my map with my counsellor" (optional).
3. Questions, one per screen (`.iiic-scale`), progress bar, back allowed, answers kept in the browser until submit. Count and wording come from the active Map definition (founder-authored, versioned).
4. Result: the constellation (SVG from scores), one recommended next step, two related steps, routed by step 0 and the routing rules in the definition.
5. Optional: email me my map (email only, double opt-in if they also tick the Journal).
6. One bridge card may appear on the result (F9 rules).

Edge cases: abandon midway (nothing stored server-side); retake (new result, old kept in history); definition changes (results keep their definition version); under 18 (step 0 asks age band; the Map is not offered to under-18s until a lawyer confirms it is not "behavioural monitoring" under DPDP s.9; until then the person is routed to a guardian-led booking). Results pages carry the counselling scope statement and crisis numbers.

## F3 · Booking (one flow, four types) · R1 (seat in R2)

Types: `session` (counselling) · `call` (proposal call, free; the founders' page's "Book a Founder Consultation" books this type under that label until I-36 defines a separate offer, D-25) · `info` (course info session, free) · `seat` (course seat, paid, R2). No prices are shown anywhere until IIIC publishes them (D-21); until then a session is booked without online payment (D-24).

| Step | Session | Call | Info | Seat (R2) |
| --- | --- | --- | --- | --- |
| 1 Choose | Length and type: 15 / 30 / 45 minutes, individual or family; format where the service offers both (D-03) | Topic: which service | Which info session | Which cohort |
| 2 When | Date strip of bookable days, then the counsellor's free start times; or "Request another time" (preferred days, times and a note) | Same | Fixed session times | Cohort dates (no picking) |
| 3 Details | Name, mobile (+91, required), email (required), who the session is for, age band; separate unticked consent checkboxes; a guardian books for anyone under 18 | Name, work email, mobile, company, role, team size, sector | Name, email, mobile | Name, email, mobile, billing details |
| 4 Pay | Gateway checkout once prices are published; until then skipped, and staff may send a payment link (D-24) | Skipped | Skipped | Gateway checkout |
| 5 Confirmed | Booking reference, add to calendar, what happens next | Same | Same | Same, plus My IIIC access |

Rules:
- **Slot hold.** When payment is taken at booking, entering step 4 places a hold on the slot (default 10 minutes, setting). A held slot is unavailable to others. Unpaid holds expire and release automatically.
- **Payment truth.** A booking becomes `confirmed` only when the gateway's signed webhook (or a server-side payment verification) confirms capture. The browser redirect alone never confirms.
- **Double booking.** Confirmation runs in a transaction that rechecks the slot; if it was taken (race), the payment is refunded automatically and the person is offered the nearest free times.
- **Notice and horizon.** Earliest bookable time and how far ahead come from settings (defaults: 12 hours' notice, 14 days ahead).
- **Free times (D-02).** Start times are generated from each counsellor's working hours (set in the admin) at the session length plus a buffer, minus every busy time in their Google Calendar (D-22) and every existing booking. "Request another time" creates a booking in `requested` with the person's preferred days, times and note; the operator offers or accepts a time from Today, and the booking is then confirmed like any other.
- **Format.** Online (video link created on confirmation) or at the office (address in every message), per D-03.
- **No bridges** anywhere inside the flow. One opt-in bridge may appear on the confirmation page (F9).
- **Price honesty.** No price is shown while `prices_public` is off (D-21). Once prices are published, the total the person will pay (with the GST breakup) is shown at step 1 and never grows; no fees appear later. A payment link always states the amount before the person pays.
- **Written consent receipt.** For counselling bookings (sensitive data under the SPDI Rules until 13 May 2027), the confirmation email includes a consent receipt naming each purpose consented to, with a withdraw link.
- **Scope and signposting.** Counselling steps show the non-clinical scope statement and the crisis numbers (`08-security-privacy-compliance.md` §7).
- **Validation.** Indian mobile numbers normalised to E.164 (+91XXXXXXXXXX); email checked for format and typos of common domains; every error explains the fix.
- **Accessibility.** The stepper is announced; focus moves to the step heading on each step; the date strip and slots are radio groups.

States: `requested` (a time request) or `held` → `pending_payment` (only when payment is taken at booking) → `confirmed` → `completed` | `no_show` | `cancelled_by_client` | `cancelled_by_iiic` | `rescheduled` (a reschedule creates a new booking linked to the old one). Payment on a confirmed booking is tracked separately (`unpaid` · `link_sent` · `paid` · `refunded`).

Edge cases: payment succeeds after the hold expired (confirm if the slot is still free, otherwise refund and offer times); gateway down (show a clear message and keep the hold for one retry); duplicate submissions (idempotency key per checkout); the person closes the tab after paying (the webhook still confirms and messages still go out).

## F4 · Manage a booking (no account) · R1

The confirmation message carries a signed link (`/b/[token]`, single-purpose, expires after the session). It shows the booking and offers reschedule and cancel within policy (settings: free reschedule up to N hours before; refund rules per service). Changes notify the practitioner, update the event in their Google Calendar and the client's `.ics`, and send new confirmations. Outside the policy window the page shows how to contact IIIC instead.

## F5 · Team Map request and the B2B pipeline · R1

1. `/organisations/team-map` form: company, website (optional), team size band, sector, contact name, role, work email, mobile, what prompted the request (optional), consent.
2. Qualification shown to the operator, not the visitor: size and sector match the target (small and mid-size, non-e-commerce).
3. Acknowledgement at once; the lead appears in the pipeline as **New** with an operator task due in two working days.
4. Pipeline stages: New → Contacted → Team Map scheduled → Team Map done → Debrief held → Proposal sent → Won | Lost (reason). A proposal call booked through F3 creates or updates the lead at "Contacted" with the call attached.
5. Proposal: generated from the proposal template with phases and fees entered in the admin, saved as a PDF version, sent from the admin, follow-up task created.

Release 2 adds the Team Map itself: a link the client shares with their team, anonymous individual Maps, an aggregate picture for the debrief (shown only when at least five people have completed, so no individual can be identified).

## F6 · Course: info session, enrolment, delivery, certificate

- **R1 · Info session.** Register via F3 (`info`); confirmation, reminders, join details; afterwards one follow-up with the course page.
- **R2 · Enrolment.** Choose a cohort (capacity enforced), pay (F3 `seat`), receive the welcome message and My IIIC access.
- **R2 · Delivery.** Cohort sessions (live) and lessons (if recorded content exists) per D-07; progress tracked per lesson or session; attendance recorded by the facilitator.
- **R2 · Completion.** When the course's completion rule is met (defined by the founder), a certificate is issued (single or bulk from the admin), with a certificate number, a verify page and a QR code. Certificates can be revoked or reissued; the verify page always shows the current status.

## F7 · Accounts: My IIIC · R2

- Sign-in with a one-time code to mobile (WhatsApp or SMS) or email; no passwords. Codes expire in 10 minutes; five attempts per code; rate-limited per number and per IP.
- A booking made without an account is attached to the account with the same verified mobile or email.
- Pages: bookings (upcoming, past, manage), my Map (history, delete), learning (progress), documents (proposals, certificates), invoices, privacy (consents, download my data, delete my account).
- Sessions last 30 days on a trusted device; sign-out everywhere is available.

## F8 · Proof: feedback, verified testimonials, case studies

1. **R1 · Feedback.** After a completed session or call, a feedback link (`/feedback/[token]`, tied to the booking) asks for a 1–5 rating and an optional comment. Ratings feed private metrics only.
2. **R2 · Story.** If the rating is 4 or 5, the page offers (never pushes) "Would you share your experience?" Text, optionally video later. Consent choices: publish with full name / initials / anonymously; where it may appear; the right to withdraw at any time.
3. Moderation in the admin: an owner approves; only spelling may be corrected; the published card shows "Verified client", the programme and the month.
4. Withdrawal by the person (from the link, a reply or My IIIC) unpublishes at once (V2).
5. **Case studies** (consultancy): written by IIIC, numbers agreed with the client, client approval recorded (file and date) before publishing.
6. Counselling stories are anonymised by default.
7. **R1 · Earlier reviews (D-37).** Reviews of Gaurang Mistry's programmes from before the platform are imported from the intake sheet, screened (`content/copy-architecture.md` §6), sent to their writers for consent with a preview of exactly what will appear (V1), approved by an owner, and published with the name in the form the person chose, their designation, place, the programme and the year. A withdrawal unpublishes at once (V2).

## F9 · Cross-path bridges · R2

The plan's rule set (`00-platform-plan.md` § Cross-path rules), with one change (D-18): bridges appear only at the Map result, the booking confirmation and in My IIIC; one per touchpoint; each has a plain "No, thanks" with the same size and weight as the accept button (not "Not now"), remembered for a set period (setting, default 90 days); bridges out of counselling appear only for clients who opted in to "Suggest related programmes" and are based only on their profile answers; nothing inside a session, its notes or its reminders.

## F10 · Newsletter · R1

Signup (email, consent wording, source) → pending → confirmation email → confirmed (consent logged with the notice version) → welcome email → monthly issue. Unsubscribe in one click from any issue (and the `List-Unsubscribe` header). Resubscribing requires confirmation again.

## F11 · Privacy requests · R1

From `/grievance` (and My IIIC in R2): access, correction, erasure, withdrawal of consent, nomination, or a complaint. The request is verified (one-time code to the contact on file), acknowledged automatically within minutes with a copy of the complaint as recorded (consumer complaints must be acknowledged within 48 hours and resolved within one month), logged with its deadline (IIIC publishes 30 days for data requests, within DPDP's 90), assigned to an owner, and answered from the admin. Erasure anonymises records that must be kept for tax or legal reasons (invoices) and deletes everything else, including Map results and notes.

## F12 · Partnership enquiry · R1

From `/institute/partnerships` and `/about`: institution, contact, role, email, phone, nature of the enquiry. Lands in the pipeline with the source "Institute" and its own stages (New → In conversation → MoU drafted → Signed).
