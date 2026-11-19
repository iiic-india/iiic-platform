# 06 · Automations

Everything the platform does on its own. Each automation is an event or a schedule, a condition, and an action through a channel, run by the job queue with retries and logged in `message_log` and `jobs`. All of them can be paused from Admin → Messages → Automations.

## Engine rules

- **Event-driven, idempotent.** Domain events (`booking.confirmed`, `payment.captured`, `lead.created`, …) enqueue jobs with an idempotency key, so a retried webhook or a double click never sends twice.
- **Scheduled jobs** (reminders, digests, retention) are enqueued at a computed `run_at` and recomputed when the underlying booking changes (a reschedule cancels and re-plans its reminders).
- **Retries.** Three attempts with backoff (1 min, 10 min, 1 h); then the job fails visibly on Today and in the log.
- **Quiet hours.** No WhatsApp or SMS between 21:00 and 08:00 IST (setting); messages due in that window are sent at 08:00, except a reminder that would then arrive after the session, which is dropped.
- **Consent.** Transactional messages (confirmations, reminders, receipts, login codes) go to anyone who booked. Anything promotional (bridges, follow-up offers, newsletters, nudges) needs the matching consent and stops the moment it is withdrawn.
- **Counselling guardrail.** No offer, bridge or cross-sell in any message about a counselling session; feedback requests name the session and ask nothing else. Counselling confirmations and reminders carry the scope statement and the crisis numbers.
- **No dark patterns.** Bridges and nudges use a plain "No, thanks"; no false urgency; nothing promotional to under-18s.
- **WhatsApp.** Only approved templates outside the 24-hour customer-service window. Utility templates must be specific to the person's own booking (Meta reclassifies generic feedback requests as marketing, which costs more and needs marketing consent). Email is the fallback when WhatsApp fails or the person prefers email.
- **Ownership.** Every automation that creates work for a person (a task, an approval) assigns it to a role and shows on Today.

## Catalogue

Channels: E = email · W = WhatsApp · A = admin (Today, digest) · C = calendar · D = document. Automation IDs are prefixed by area (B bookings, P pipeline, N newsletter, O operations, V reviews; Release 2: MA Map, T Team Map, C course, S stories, X cross-path, A accounts); milestone IDs (M0–M7) are a separate series in `10-build-plan.md`.

### Bookings · counselling sessions, proposal calls, info sessions (R1)

| ID | Trigger | Timing | Action | Channels | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | Checkout started | At once | Hold the slot; release if unpaid | — | Hold minutes from settings (default 10) |
| B2 | Payment captured (webhook), a booking submitted while payment is not taken at booking (D-24), or a time request accepted | At once | Confirm the booking; confirmation with booking reference, time, format, address or Meet link, manage link, `.ics` attached | E, W, C, A | Written to the practitioner's Google Calendar with the Meet link or the office address (D-22) |
| B3 | Payment captured | At once | Create the invoice (or receipt) in Zoho Books and record the payment; attach the PDF to the booking and the confirmation | D, E | Document type per GST status (D-13); retried if Zoho is unavailable; reconciliation (B11) catches gaps |
| B3a | Counselling booking confirmed | With B2 | Written consent receipt: each purpose consented to, notice version, withdraw link | E | SPDI written consent for sensitive data (until 13 May 2027) |
| B4 | Hold expired unpaid | At hold expiry | Release the slot; no message for counselling sessions | — | For course seats (R2), one email: "Your seat was not reserved" |
| B5 | Confirmed booking | 24 h before | Reminder with time, format, place or link, how to reschedule | W (E fallback) | Skipped if booked less than 24 h ahead |
| B6 | Confirmed booking | 2 h before (online: 30 min with the link) | Short reminder | W | Dropped if it would fall in quiet hours and after the start |
| B7 | Reschedule or cancel (client link or admin) | At once | Update the booking, send an updated `.ics` (or a cancellation), re-plan reminders, notify both sides, apply the refund rule | E, W, C, A | Refunds above the threshold wait for owner approval |
| B8 | Session marked completed | +2 h | Feedback request naming the session (rating 1–5) | E (W optional, utility template) | Counselling: the request asks for nothing else |
| B9 | Session marked no-show | +1 h | Gentle message with a link to rebook; fee per policy | E | No WhatsApp for no-shows in counselling |
| B10 | Race lost at confirmation (slot taken) | At once | Automatic refund and an offer of the nearest free times | E, W, A | Logged as an incident |
| B11 | Payment captured but booking missing (reconciliation) | Daily 23:00 | Compare gateway payments with bookings; flag mismatches | A | Also catches refunds made in the gateway dashboard |
| B12 | "Request another time" submitted | At once; reminder at 24 h | Acknowledge with what happens next; put the request on Today for the operator to offer or accept a time | E, W, A | No time is promised in the acknowledgement |
| B13 | Staff send a payment link (D-24) | At once; one reminder before the session | Razorpay payment link with the amount, linked to the booking; marked paid by the webhook | E, W | Never sent for a free service |
| B14 | A practitioner's Google Calendar changes | On the change notification, and every 15 minutes | Refresh busy blocks so changed times stop or start being bookable; renew watch channels before they expire | — | Event details are never copied, only start and end (D-22) |

### Pipeline · consultancy and partnerships (R1)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| P1 | Team Map request submitted | At once | Acknowledgement; create lead (New); task for the operator due in 2 working days | E, A |
| P2 | Proposal call booked | At once | Create or update the lead (Contacted), attach the call | A |
| P3 | Lead untouched in New | 24 h amber, 48 h red | Escalate on Today and in the digest | A |
| P4 | Active-stage lead with no activity | 7 days | "Stale" flag on Today | A |
| P5 | Proposal sent | At once | Version saved; tracked link; follow-up task in 3 working days | E, A |
| P6 | Proposal not opened or answered | 5 working days | Draft follow-up email for the operator to review and send | A |
| P7 | Partnership enquiry | At once | Acknowledgement; lead in the partnerships board | E, A |

### Newsletter (R1)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| N1 | Signup | At once | Double opt-in email | E |
| N2 | Confirmed | At once | Log consent; add to the list; welcome email | E |
| N3 | Unsubscribe or complaint | At once | Remove from the list; log withdrawal | — |
| N4 | Monthly issue | When an editor schedules it | Send to confirmed subscribers, with one-click unsubscribe headers | E |

### Operations (R1)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| O1 | Daily digest | 08:30 IST | Today's schedule, replies needed, money, proof, privacy, failures | E (operator, owners) |
| O2 | Weekly report | Monday 09:00 | The plan's metrics with week-on-week change | E (owners) |
| O3 | Message or webhook failure | At once | Show on Today; email an owner if three fail within an hour | A, E |
| O4 | Data request received | At once and at 50% / 80% of the deadline | Acknowledge to the person; remind the assignee | E, A |
| O5 | Retention | Nightly | Delete expired holds, codes and tokens; anonymise records past retention; purge logs past their period | — |
| O6 | Backup check | Daily | Confirm the latest database backup exists and restores (weekly test restore) | A |
| O7 | Consumer complaint or privacy grievance received | At once, then at 24 h and before each deadline | Automatic acknowledgement with a copy of the complaint as recorded; reminders to the assignee before the 48-hour and one-month marks | E, A |
| O8 | Incident opened in the breach register | At once, 4 h, 6 h, 48 h, 72 h | Timers for the CERT-In report (6 h) and the Board's detailed report (72 h); owners alerted | A, E |
| O9 | Hard bounce or complaint (Resend webhook) | At once | Mark the address invalid on the person, stop every send to it, show on Today | A |
| O10 | Weekly, with O2 | Monday 09:00 | Add to the weekly report: top ten missing pages (the 404 log), searches with no results, email delivery per subdomain, the WhatsApp quality rating, cost lines that moved | E (owners) |

### Reviews (R1)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| V1 | An operator sends a consent request for a review (imported or added by hand) | At once; one reminder after 5 days if there is no reply; nothing after that | Show the person the exact text (or the excerpt and any translation proposed) and how it will appear (name in the form they choose, designation, place, programme, year), with three answers: publish as shown · publish with initials · do not publish; ask them to confirm they still stand by it; record the reply as a consent with its evidence; move the review to approved or declined | E; W only inside a 24-hour window the person opened |
| V2 | Consent to publish a review or story withdrawn (a reply, the withdraw link, or recorded by the operator) | At once | Unpublish, revalidate every page that showed it, confirm to the person, record the withdrawal; covers every review and story (Release 2's stories use it too) | E, A |

### Certificates (R1, D-39)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| C5 | Certificate issued (from the admin; from R2 also on course completion) | At once | Email with the signed PDF link, the verification link and LinkedIn's add-to-profile link | E, D |

### Engine (R2)

| ID | Trigger | Timing | Action | Channels |
| --- | --- | --- | --- | --- |
| MA1 | Map completed with "email me my map" | At once | Email the result summary and the recommended step | E |
| MA2 | Map completed by someone who consented to follow-up | +2 days | One message about the recommended step | E |
| MA3 | Map result is "organisation" | At once | Offer the Team Map on the result page; no message unless they request it | — |
| T1 | Team Map responses reach the threshold | At once | Aggregate ready; task to schedule the debrief | A |
| C1 | Course enrolment paid | At once | Welcome, schedule, My IIIC access, invoice | E, W, D |
| C2 | Cohort session | 24 h and 1 h before | Reminder with link or place | W, E |
| C3 | Learner inactive 14 days (opted in) | Weekly check | One nudge back to the next lesson | E |
| C4 | Completion rule met | At once | Task to issue the certificate (or auto-issue if enabled) | A |
| C6 | Learner completes the "framework at work" module | At once | Bridge: "Bring it to your team: a free Team Map" (opt-in rules) | My IIIC |
| S1 | Feedback rating 4–5 | On submit | Offer the story option on the same page | — |
| S2 | Story approved | At once | Publish; tell the client with the withdrawal link (a withdrawal runs V2) | E |
| X1 | Consultancy engagement won | Week 2 | Bridge email (managers' cohort; 1:1 founder sessions), only with consent | E |
| X2 | Counselling client opted in and has had three sessions | After the third | Bridge in the follow-up email: free course info session | E |
| A1 | Account sign-in requested | At once | One-time code: WhatsApp authentication template or email (SMS only if D-08 chooses it) | W, E |

## Message templates needed for launch

Operating rules for every channel (addresses, who answers, deliverability) are in `13-email-and-messaging.md`.

Email (React Email components in the brand, from `src/brand/templates/email/`): booking confirmation (per type, counselling with the scope statement and crisis numbers), consent receipt, reminder, rescheduled, cancelled and refund, feedback request, Team Map acknowledgement, partnership acknowledgement, proposal sent, newsletter confirm and welcome, data-request acknowledgement, complaint acknowledgement (with the complaint copy), review consent request and reminder, review withdrawal confirmation, daily digest, weekly report, failure alert, incident alert (internal).

WhatsApp utility templates for Meta approval (each names the specific booking): booking confirmed, 24-hour reminder, 2-hour reminder, booking rescheduled, booking cancelled, session feedback, time request received, payment link. Release 2 adds the authentication template for login codes and course reminders. The review consent request goes by email, or by WhatsApp only inside a 24-hour window the person opened; the first batch of earlier reviews is sent person to person from IIIC's WhatsApp before launch, using `content/review-consent-request.md`.
