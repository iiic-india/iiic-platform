# 19 · Automations and messaging: the design (M6)

The design M6 is built to: the job runner, the messaging core, the provider webhooks, the templates, every Release 1 automation with its trigger, timing, channel and consent, re-planning, the newsletter, the digests, the tests, and who builds what. Written 23 November 2026 on branch `m6/foundation` (from `m3/core`), which holds the collections, the access rules, the contracts in `src/lib/messaging`, `src/lib/automations` and `src/emails`, the send policy, the email frame, the fakes and their unit tests. The target is M6's "Done when" (`10`): each automation has a test that proves it fires once, at the right time, to the right channel, and respects consent and quiet hours; rescheduling re-plans reminders. Sources: `06`, `13`, `07` (Resend, AiSensy, Vercel Cron, no autoRun), `08` §3, §7, `04` (messaging entities), `16` §9 (the events), D-06, D-10, D-21, D-24, D-47. Where this document and those differ, they win, and this one is corrected.

## 1. Rules this design keeps

- An automation fires once: its jobs are queued once per event key, its message is one row per unique key, and the row is claimed before the provider is called (§2). Every task is named by its automation ID and is idempotent (CLAUDE.md, Conventions).
- Consent and quiet hours are checked when a message is sent, not only when it is planned, from the ledger and the settings as they are then (§3). Promotional messages need the matching consent (`marketingEmail`, `marketingWhatsapp`) and never reach anyone under 18; transactional ones go to anyone who booked or asked (`06`, Engine rules).
- Counselling is private: events and job inputs carry ids only; a message row holds who, what about, when and its state, never a body, an address or anything said in a session; no counselling message carries an offer, and confirmations and reminders carry the scope statement and the crisis numbers (CLAUDE.md #3, `06`). Logs hold automation ids, template keys and outcome codes only.
- No price in any message while `prices_public` is off, except the person's own payment (§7; D-21, D-24). No dark patterns: no urgency words, no pre-ticked anything, unsubscribe in one click.
- Everything builds, runs and tests without Resend, AiSensy or the cron secret: each channel answers `not-configured` and the message falls back or is skipped, visibly (§3).
- Every route and admin action checks the user, the role and the two-factor session first, or its own secret (CLAUDE.md #6). The interface pass is parked: every admin view in M6 is plain Payload (lists, forms, buttons that work from the keyboard), accessible and correct; drag-and-drop and D-78's component stack come later.
- This branch commits no migration. The lead generates M6's one migration when the branches are joined, in order (the six collections, the `people` fields, `payload-jobs`' concurrency key and the task-slug enum, and the `payload-jobs-stats` global that scheduling adds).

## 2. The job runner

**The route** (builder A): `GET /api/cron/jobs`, Node runtime, `maxDuration` 60 s, region `bom1`. It answers 503 while `CRON_SECRET` is unset, 404 on any Vercel deployment but production (previews share production's database, so a preview never runs a job or sends a message), and 401 unless `Authorization: Bearer <CRON_SECRET>` matches, compared in constant time over SHA-256 digests. Then: `payload.jobs.handleSchedules({ allQueues: true })`, which queues each scheduled task whose cron has come due once per slot (Payload's `payload-jobs-stats` global); then `payload.jobs.run({ allQueues: true, limit: 25 })` in rounds until the queue is empty or 45 s have passed. It answers counts only. `jobs.autoRun` is never set (`07`). Owners keep running a task by hand through Payload's jobs API with their code (`ownerWithCode`).

**Vercel Cron**: `vercel.json` gains `"crons": [{ "path": "/api/cron/jobs", "schedule": "* * * * *" }]`. The Hobby plan allows only daily crons and refuses a deployment with this one, so the entry lands with the move to Pro (D-04; proposed, §10); until then an owner runs the queue by hand.

**Schedules** (`src/lib/automations/schedules.ts`, applied in `src/jobs/index.ts`, UTC with seconds; India is UTC+05:30 all year): `messages-dispatch` and `B4-expire-holds` every minute; `B2-poll-pending-orders` every 5 minutes; `B14-refresh-busy-times` every 15; `B11-reconcile` 23:00 IST; `O5-purge-missing-pages` 02:00 and `O5-retention` 02:15; `O1-daily-digest` 08:30; `O2-weekly-report` Monday 09:00; `O6-backup-check` 09:30; `P3-P4-lead-ages` hourly; `P6-proposal-follow-up` 08:45. M3's tasks gain their schedules here without their files changing.

**Concurrency**: `jobs.enableConcurrencyControl` is on. `messages-dispatch` takes the exclusive key `messages-dispatch`, so overlapping cron calls never run two dispatchers; each listener task takes its event key. Payload claims a job before running it.

**Retries and failure**: every M6 task has `retries: { attempts: 3, backoff: exponential from 60 s }` for faults (the database or a module throwing). A provider's refusal is an answer, not a fault: the message itself is retried after 1 minute, 10 minutes and 1 hour (`RETRY_DELAYS_MS`, `src/lib/messaging/states.ts`), then marked `failed` and `message.failed` is emitted. A task that spends its retries calls the shared `onFail` (builder A, `src/lib/automations/failures.ts`), which adds to the automation's failure count and emits `automation.failed`. O3 listens to both (§9).

**Fires once, in three layers**: (1) `emit` (booking events, `src/lib/booking/emit.ts`, now with M6's listeners read from the catalogue) and `emitAutomationEvent` (every other event, `src/lib/automations/emit.ts`) queue one job per subscribed task with the key `<event>:<id>`, in the caller's transaction, and never a second while one waits; (2) `deliver` writes one `messages` row per key `<automation>:<collection>:<id>[:<variant>]:<channel>` (`messageKey`, unique), and a key already there returns that row; (3) a due row is claimed with a conditional update (`status queued → sending` where it is still queued and due), committed before the provider is called. Resend gets the key as its `Idempotency-Key`, so a crash between its answer and the row's update cannot send twice within 24 hours; AiSensy has no such key, so a row left `sending` for 5 minutes becomes `unknown`, is never resent on its own, and shows on Today (at most once rather than twice).

## 3. The messaging core

**Collections** (access in `src/access/policy.ts`, audited by the audit plugin; tests `tests/unit/messagingAccess.spec.ts`):

| Collection | Holds | Read · write |
| --- | --- | --- |
| `messages` | The outbox and log (`04` `message_log`): dedupeKey (unique), automation, template, variant, channel, fallback, kind, sender, status, skipReason, lastError (a code), recipientKind with person, subscriber or staff, subjectCollection and subjectId, counselling, fallbackOf, sendAt, sendBefore, requiresOpenWindow, attempts, claimedAt, sentAt, deliveredAt, readAt, provider, providerMessageId (unique) | owner, operator · server; kept one year (O5) |
| `message-templates` | Per key, channel and language: subject, preheader, body with `{{variables}}`, for WhatsApp the provider's template name and category; status (draft · submitted · approved · rejected · paused, set by an owner), owner, lastReviewedAt; versions | owner, operator, editor · owners delete |
| `automations` | One row per catalogue entry: key, enabled, note, lastRunAt, successCount, failureCount (server) | owner, operator · they pause and resume; rows are the server's |
| `suppressions` | channel, address (unique together), reason (hard bounce · complaint · WhatsApp stop · manual), at, source, person, note | owner, operator · server and the office add; owners lift |
| `subscribers`, `newsletter-issues` | §8 | §8 |

`people` gains a join to its suppressions and `whatsappLastInboundAt` (server-written, the 24-hour window).

**States** (`src/lib/messaging/states.ts`): `queued → sending → sent → delivered → read`; `sending → queued` (a retry), `failed`, `unknown`; `sent → bounced | complained | failed` from the provider; `queued → skipped | cancelled`; staff may queue a `failed` or `unknown` message again from the log. Moves only along the table, by conditional update.

**Kinds** (`src/lib/messaging/types.ts`): `transactional`, `promotional`, `operator` (sent by a staff action about the person's own record: V1, B13) and `internal` (to staff).

**Senders** (`src/lib/messaging/channels.ts`): `EmailSender.send` and `WhatsAppSender.sendTemplate`, each returning a `Result` with the provider's message id or a coded `SendError` (`retryable` for `unavailable` and `rate-limited`). Builder A writes `resend.ts` (Resend's REST API with `fetch`, the key as `Idempotency-Key`, tags with automation and template, open and click tracking off on `notify.`) and `aisensy.ts` (the campaign API, one approved template per call), and `channelsFor(env)`: `MESSAGING_TRANSPORT=fake` gives `FakeEmailSender` and `FakeWhatsAppSender` (local, CI; refused on Vercel by `env.ts`), a Vercel deployment other than production and missing keys give `not-configured`. Payload's own email adapter stays for staff mail (D-47).

**Identities** (`src/lib/messaging/senders.ts`, `docs/13` §1, §3): `IIIC Bookings <bookings@notify.<MAIL_DOMAIN>>` replying to `bookings@`, `IIIC <hello@notify.…>` replying to `hello@`, `IIIC Platform <platform@notify.…>` with no reply address, `IIIC Journal <journal@news.…>` replying to `hello@`. Without `MAIL_DOMAIN`, everything goes from `EMAIL_FROM_ADDRESS`.

**`deliver(req, planned)`** (contracts in `src/lib/messaging/operations.ts`): checks the template allows the channel, writes the row (or returns the existing one), sets `counselling` when the subject is a booking of a counselling service, and, when it is due, tries it after the row commits. **`dispatch(req, now, limit)`**, run by `messages-dispatch` every minute: picks due `queued` rows by `sendAt`, moves stale `sending` rows to `unknown`, and tries each. **A try**: read the recipient's address now (never copied into the row); read the suppression list, the ledger (`consentFor`) for promotional mail, the age band, the automation's switch, the channel's set-up, the WhatsApp template's approval, the 24-hour window and the quiet hours (`readQuietHours`); ask `decideSend` (`src/lib/messaging/policy.ts`, pure, tested): `send`, `defer` (WhatsApp in quiet hours: `sendAt` moves to the window's end), `fallback` (a new email row with `fallbackOf`, key `…:email`) or `skip` with its reason. To send: `load` the template's data (§7), which answers `stale` if the subject changed; refuse a price the registry does not allow (`priceAllowed` with `getFlags`); render; add `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` to promotional mail; send; record `sent` and the provider's id, or a retry, or `failed`. Quiet hours bind WhatsApp only; a reminder they would push past its session is dropped (`quiet-hours-late`), not moved to email (`06` B6). A paused automation's due messages are skipped as `paused`, and staff may queue them again.

## 4. Provider webhooks

**Resend** (`/api/webhooks/resend`, builder A): raw body up to 64 KB, verified with `svix` (`svix-id`, `svix-timestamp`, `svix-signature`, five minutes' tolerance) against `RESEND_WEBHOOK_SECRET`, then `parseResendEvent` (`src/lib/messaging/webhooks.ts`). `delivered` and `failed` move the message; a permanent bounce or a complaint moves it to `bounced` or `complained` and suppresses the address Resend tried (`suppress`, unique per channel and address), emitting `message.suppressed` for O9 and N3; a transient bounce marks the message `failed` with `soft-bounce` and suppresses nothing. Answers: 401 bad signature, 400 unreadable, 200 for types not taken and unknown ids, 500 on a fault (Resend retries). Nothing of the body is logged.

**WhatsApp** (`/api/webhooks/whatsapp`, builder A): checked against `WHATSAPP_WEBHOOK_SECRET` (AiSensy's signature if its plan signs, else the secret as a header, compared in constant time; proposed, §10), normalised to `WhatsAppNotice`: a status moves the message as above; an inbound message sets the person's `whatsappLastInboundAt` (found by E.164 mobile), and a plain stop (`isStopRequest`: STOP, Unsubscribe, Opt out) suppresses WhatsApp for that number and records a withdrawal of `marketingWhatsapp` if one is in force (channel WhatsApp, the provider's message id as evidence), the same day (`13` §7). The text is never stored. The out-of-hours reply ("we reply from 10 AM", once) is AiSensy's own setting.

## 5. Every Release 1 automation

The catalogue is code (`src/lib/automations/catalogue.ts`); listeners, schedules, the automations rows and the tests read it. E email, W WhatsApp, A admin (Today, digest), C calendar, D document. Basis: T transactional, P promotional, Op staff action, I internal, — none.

| ID | Trigger | Timing | Channels | Basis | Task · owner | Waits on |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | checkout (M3) | at once | — | — | M3 | — |
| B2 | `booking.confirmed` | at once | E, W (E fallback), C (M3), A | T | `B2-confirmation` · B | — |
| B3 | `invoice.issued` | at once | D, E | T | `B3-receipt` · B | M3 documents emitting it |
| B3a | `booking.confirmed` (counselling) | with B2 | E | T | `B3a-consent-receipt` · B | — |
| B4 | schedule | every minute | — | — | M3 `B4-expire-holds` | — |
| B5 | `booking.confirmed`, `.rescheduled`, `.cancelled` | 24 h before; none if booked under 24 h ahead | W, E fallback | T | `B5-reminder-24h` · B | — |
| B6 | same | 2 h before; online 30 min; dropped if quiet hours push past start | W | T | `B6-reminder-2h` · B | — |
| B7 | `booking.rescheduled`, `.cancelled`, `refund.processed` | at once | E, W, A (staff email) | T | `B7-change-notice` · B | — |
| B8 | `booking.completed` | +2 h | E | T | `B8-feedback-request` · B | attendance marking; the feedback page (M5) |
| B9 | `booking.noShow` | +1 h | E (never W for counselling) | T | `B9-no-show` · B | attendance marking |
| B10 | `booking.slotLost` | at once | E, A (staff email) | T | `B10-slot-lost` · B | — |
| B11 | schedule | 23:00 IST | A (digest) | — | M3 `B11-reconcile` | — |
| B12 | `booking.requested` | at once; flagged on Today at 24 h | E, W, A | T | `B12-time-request-ack` · B | — |
| B13 | `payment.linkSent`; `booking.cancelled` | at once; one reminder 24 h before the session while unpaid | E, W | Op | `B13-payment-link` · B | — |
| B14 | schedule, calendar notices | every 15 min | — | — | M3 `B14-refresh-busy-times` | — |
| P1 | `lead.created` (team map) | at once; task in 2 working days | E, A | T | `P1-team-map-ack` · C | M4 |
| P2 | `booking.confirmed` (a call) | at once | A | — | `P2-call-booked` · C | M4 |
| P3, P4 | schedule | hourly: 24 h amber, 48 h red; 7 days stale | A | — | `P3-P4-lead-ages` · C | M4 |
| P5 | `proposal.sent` | at once; task in 3 working days | E, A | T | `P5-proposal-sent` · C | M4 |
| P6 | schedule | daily: 5 working days unanswered | A | — | `P6-proposal-follow-up` · C | M4 |
| P7 | `lead.created` (partnership) | at once | E, A | T | `P7-partnership-ack` · C | M4 |
| N1 | `newsletter.signedUp` | at once | E | T | `N1-confirm-signup` · C | — |
| N2 | `newsletter.confirmed` | at once | E | P | `N2-welcome` · C | — |
| N3 | `consent.withdrawn`, `message.suppressed` | at once | — | — | `N3-unsubscribe` · C | — |
| N4 | `newsletter.issueScheduled` | at the issue's time | E | P | `N4-send-issue` · C | — |
| O1 | schedule | 08:30 IST | E | I | `O1-daily-digest` · C | — |
| O2, O10 | schedule | Monday 09:00 IST | E | I | `O2-weekly-report` · C | — |
| O3 | `message.failed`, `automation.failed` | at once; owner emailed at 3 in an hour | A, E | I | `O3-failure-alert` · A | — |
| O4 | `dataRequest.received` | at once; 50% and 80% of the deadline | E, A | T | `O4-data-request` · C | M5 |
| O5 | schedule | nightly | — | — | `O5-retention` · C (and M2's purge) | — |
| O6 | schedule | daily | A | I | `O6-backup-check` · C | a Supabase token |
| O7 | `dataRequest.received` (complaint) | at once; 24 h; before each deadline | E, A | T | `O7-complaint` · C | M5 |
| O8 | `incident.opened` | at once, 4, 6, 48, 72 h | A, E | I | `O8-incident-timers` · C | M5 |
| O9 | `message.suppressed` | at once | A | — | `O9-bounce-complaint` · C | — |
| V1 | `review.consentRequested` | at once; one reminder after 5 days | E (W by hand in an open window) | Op | `V1-review-consent-request` · C | — |
| V2 | `consent.withdrawn` (publication) | at once | E, A | T | `V2-withdrawal-confirmation` · C | — |
| C5 | `certificate.issued` | at once | E, D | T | `C5-certificate-email` · C | M5 |

## 6. Timing, rescheduling and cancellation

Timing rules are pure (`src/lib/automations/timing.ts`): `reminder24hAt`, `reminderShortAt`, `after`, with `06`'s offsets. A planner task writes the row at plan time with `sendAt` from the rule and `sendBefore` = the session's start; `plannedSendTime` applies quiet hours at planning, and `decideSend` again at sending. **Reschedule** (`booking.rescheduled`, new booking with `fromBookingId`): B5, B6 and B13 first `cancelQueued` the old booking's queued rows, then plan the new booking's; B7 tells both sides; M3's calendar job moves the event. **Cancellation**: every queued row about the booking is cancelled. **Belt and braces**: at send time `load` answers `stale` when the booking is no longer confirmed, has moved, or (B13's reminder) is paid, and the row is skipped as `stale`. A WhatsApp reminder due at 22:00 IST goes at 08:00 if that is before the session, else it is dropped.

## 7. Templates

**Registry** (`src/emails/registry.ts`): every Release 1 key with its automations, channels, sender, kind, footer link (`withdraw` page, `unsubscribe` with headers, or `none` for internal mail), `counsellingScope` (booking confirmed, the reminders, rescheduled), `offers: false` for every one, and its price rule: `never`, `whenPublic` (the confirmation, only while `prices_public` is on) or `ownPayment` (receipt, payment link, refund, slot lost: the person's own money, D-24). WhatsApp templates are the eight of `06` (`WHATSAPP_TEMPLATE_KEYS`), each naming the person's own booking; slot lost and the payment link's reminder go by email.

**Frame and parts** (`src/emails/components/`, ported from `src/brand/templates/email/booking-confirmation.html`): the paper page, the mark, the white card with the yellow bar, the footer with the legal line from Settings, the site and the preference link; `Paragraph`, `Button` (one per email), `Details` (the ticket), `CounsellingScope` (words from `src/lib/counselling/scope.ts`). Colours from `tokens.json` by role (`src/emails/palette.ts`). `renderEmail` (`src/emails/render.ts`) gives HTML with Outlook's 600 px ghost table and the plain-text part. The PNGs (`mark-email-160.png`, `logo-email-600.png`) are served from `<site>/email/`.

**Implementations** (`src/emails/types.ts`): per key a `load(req, { subject, recipient, sendBefore })` that reads the data at send time and validates it with the template's Zod schema, an `email` (subject, preheader, element) and, for the eight, a `whatsapp` (ordered params). Builder A fills `src/emails/core/`, B `src/emails/booking/`, C `src/emails/other/`; `src/emails/index.ts` joins the three maps. Words are in each template's file, `en-IN`, written to `VOICE.md` and checked with `/copy-check`; unknown facts are `[[TODO: …, I-xx]]` and block the send in production; an approved `message-templates` entry overrides the subject, preheader and lines. Subjects state the fact; no emoji, no urgency.

**What a template may not say**: no offer, bridge, story or cross-sell; for counselling, nothing about the session but its time, format, place or link and how to reschedule, plus the scope and crisis lines; no price outside its rule; no name of another client; nothing from a note.

## 8. The newsletter (D-10)

`subscribers` holds email (unique), status (pending · confirmed · unsubscribed), the notice shown, person, consent, source, confirmExpiresAt, confirmedAt, unsubscribedAt, lastEngagedAt and the hidden `confirmTokenHash`; owners and the office read it, the server writes it, owners delete. `newsletter-issues` holds number, title, preheader, the lead post with a note, up to two items, the call to action (a path on this site), status (draft · scheduled · sending · sent · cancelled), scheduledFor, sentAt and recipientCount; editors and owners write and schedule, the office reads.

Signup (builder C): a form on the Journal posts to `/api/newsletter` (Zod, rate-limited, Turnstile with M7; the same answer whether or not the address is known); a pending entry keeps the address, the notice in force and the hash of a 32-byte token for 7 days; N1 sends the link. `/newsletter/confirm/[token]` shows a button and confirms on POST (link scanners do not confirm): the consent `marketingEmail` is recorded first (channel web, the form, IP and browser, the notice from signup), then the person is found or added by email and the entry confirmed; `newsletter_confirmed` is counted; N2 welcomes. Unsubscribe: every promotional email carries one-click headers to `/api/newsletter/unsubscribe` (RFC 8058) and a visible link to `/newsletter/unsubscribe/[token]`; both record the withdrawal and mark the entry. Transactional mail links `/w/[token]`, the person's consents in force each with a withdraw button (builder C). N4 sends an issue at its time to every confirmed subscriber whose consent is in force then, one `messages` row each (variant `s<subscriber id>`), through Resend's batch endpoint from `news.` with click tracking on that domain only (proposed, §10). A complaint or withdrawal unsubscribes at once (N3). Hygiene (`13` §6: twelve months without a click) waits until a subscriber is a year old.

## 9. Digests, reports and alerts

O1 (08:30 IST) goes to active owners and operators; O2 with O10 (Monday 09:00) to owners; both from `platform@`, in sections each module supplies as counts and booking references only, no client names (proposed): today's sessions by practitioner and time, time requests waiting, refunds awaiting approval, reconciliation mismatches, failed messages and jobs, suppressed addresses, reviews awaiting consent; M4 adds lead ages, M5 privacy deadlines and incidents. O2's metrics are `00`'s funnel from `analytics_events`, week on week; O10 adds the ten most-asked missing pages, the count of searches with no results, delivery per sending subdomain from `messages` (sent, delivered, bounced, complained), the WhatsApp quality rating and cost lines (both an owner's input until a source exists: placeholders). O3 shows failures on Today (M5 reads failed `messages` and failed jobs) and emails owners when three fail within an hour, at most once an hour (key `O3:<UTC hour>`).

## 10. Open decisions and missing inputs, and what the build assumes

| Item | Assumed until answered |
| --- | --- |
| Proposed: the minute cron lands in `vercel.json` with the move to Pro (D-04); Hobby refuses it | An owner runs the queue by hand until then |
| Proposed: the outbox (`messages`) with a one-minute dispatcher, rather than one delayed job per message; `docs/04`'s statuses widened with bounced, complained, skipped, cancelled, unknown | Built so |
| Proposed: "three attempts with backoff (1 min, 10 min, 1 h)" read as a first try and three retries | Built so |
| Proposed: a WhatsApp send whose answer never came is `unknown`, not resent (at most once) | Built so |
| Proposed: a paused automation skips its due messages, which staff may queue again | Built so |
| Proposed: the price rule `ownPayment` (receipt, payment link, refund, slot lost) shows the person's own amount while prices are hidden | Built so; D-21 and D-24 amended if IIIC agrees |
| Proposed: the newsletter goes by Resend's batch endpoint from the platform's own list, not a Resend audience, so the ledger stays the one record (amends D-10) | Built so |
| Proposed: a pending signup keeps the address 7 days only to send the confirmation; the consent is recorded at confirmation, before the person is stored | Built so; the lawyer confirms (I-22) |
| Proposed: STOP on WhatsApp suppresses WhatsApp for that number and withdraws `marketingWhatsapp`; booking messages then go by email | Built so |
| Proposed: the digest carries references, not client names | Built so |
| Proposed: B13's one reminder 24 h before the session; B12's 24 h reminder is a Today flag, not a message; B10 and the payment-link reminder by email (not among `06`'s eight WhatsApp templates); V1 by email, WhatsApp by hand inside an open window | Built so |
| Proposed: offsets in code from `06`; making them settings later | Built so |
| I-03, I-40: the WhatsApp number and whether the Business app uses it (coexistence) | Email only; WhatsApp `not-configured` |
| AiSensy: webhook signing and statuses on the Basic plan (`07`) | Shared-secret header; statuses optional |
| I-02, D-05: role inboxes live; `MAIL_DOMAIN` set in Production | `EMAIL_FROM_ADDRESS` for everything |
| I-22: wording of the consent receipt, the withdraw page and the notices; I-41: copy approval | Drafts to `VOICE.md`, marked candidate |
| A read-only Supabase management token for O6 | O6 reports "not set up" on Today |
| Cost lines and the WhatsApp quality rating for O10 | Placeholders in the report |
| Working days and holidays for P1, P5, P6 | Monday to Friday, no holidays |
| M3 documents emitting `invoice.issued`; attendance marking emitting `booking.completed` and `booking.noShow`; the feedback page | B3, B8, B9 built and tested on the events; live when those land |

## 11. The test plan

Unit (pure, no database): `decideSend`, `quietHoursEnd`, `plannedSendTime`, the state table and retry delays, `messageKey`, the timing rules, `parseResendEvent`, `isStopRequest`, `senderFor`, the catalogue against `06` (every R1 id once, a template for each messaging automation, tasks named by id, schedules in UTC), the registry's rules (no offers, scope on counselling templates, price rules, footers, the eight WhatsApp templates), the access table, the environment, the frame's render (written). Each builder adds its own. Integration (Postgres, fake senders, a fixed `now` passed in), one file per automation group, each proving the five properties:

- **Fires once**: emit the event twice and run the queue twice: one job ran its work, one `messages` row, one fake send; a replayed webhook changes nothing.
- **Right time**: the row's `sendAt` equals the rule; dispatch a minute before sends nothing, at the time sends it; B5 is not planned for a booking made 20 h ahead.
- **Right channel**: WhatsApp when configured and approved; with WhatsApp `not-configured`, suppressed or unapproved, one email row with `fallbackOf`; internal mail from `platform@`.
- **Consent**: a promotional message without consent, or with consent withdrawn after it was queued, is skipped `no-consent`; an under-18 person gets nothing promotional; transactional mail needs no consent.
- **Quiet hours**: a WhatsApp reminder due 22:00 IST is sent at 08:00; a B6 that 08:00 would put after the start is skipped `quiet-hours-late` (`13` §10's launch check); email is not held.
- **Re-planning**: reschedule cancels the old booking's B5 and B6 rows and plans the new booking's at the new times; cancellation cancels them; a stale row is skipped at send time.

Routes: the cron route refuses no secret, a wrong secret and a preview; the Resend route refuses a bad signature and suppresses on a signed permanent bounce; the WhatsApp route honours STOP. e2e (desktop and 375 px, axe): the newsletter signup, confirmation and one-click unsubscribe. The rendering matrix (`13` §5): Playwright renders each template at 320 and 700 px with images off and runs axe on it; the seed test on Gmail, Outlook, iPhone and Yahoo is a person's, per release (`13` §6).

## 12. Who builds what

The foundation is frozen for the builders: the collections' fields, `src/access/policy.ts`, `src/lib/env.ts`, `.env.example`, `src/lib/messaging/{types,states,policy,channels,fakes,senders,operations,webhooks}.ts`, `src/lib/automations/*`, `src/emails/{registry,types,render,palette,index}.ts`, `src/emails/components/*`, `src/jobs/index.ts`, `package.json` and the lockfile. A builder who needs a change asks the lead; two builders never edit one file. Tests go beside each area (`tests/unit/<area>*.spec.ts`, `tests/int/<area>*.int.spec.ts`).

- **A · Runner and core**: `src/app/api/cron/jobs/route.ts`; `src/lib/messaging/` new files (`deliver.ts`, `dispatch.ts`, `try.ts`, `suppress.ts`, `channelsFor.ts`, `resend.ts`, `aisensy.ts`, `links.ts`, `recipients.ts`); `src/lib/automations/failures.ts` and `rows.ts` (the automations rows and counters); `src/app/api/webhooks/resend/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`; the log's "queue again" endpoint on `messages` (owner or operator with the code); `src/jobs/messaging.ts` (`messages-dispatch`, `O3-failure-alert`); `src/emails/core/`; hooks in `Messages.ts`, `Suppressions.ts`, `Automations.ts`; `vercel.json`'s cron (held to the Pro move).
- **B · Templates and the B-series**: `src/emails/booking/` (every booking template, email and WhatsApp params, the `load` functions, the hosted PNGs in `public/email/`), `src/lib/automations/booking/` (planners and re-planning), `src/jobs/bookingMessages.ts`; the WhatsApp template texts for submission (`docs/content/whatsapp-templates.md`, for Meta).
- **C · The rest and the newsletter**: `src/emails/other/`, `src/lib/automations/operations/` (digest sections, report, O5 retention, O6, O9), `src/lib/automations/reviews/` (V1, V2), `src/lib/automations/pipeline/` (P1 to P7 against `04`, live with M4), `src/lib/automations/privacy/` (O4, O7, O8, live with M5), `src/lib/newsletter/`, `src/app/api/newsletter/`, `src/app/(platform)/newsletter/`, `src/app/(platform)/w/[token]/`, hooks in `Subscribers.ts` and `NewsletterIssues.ts`, `src/jobs/operations.ts`, `src/jobs/newsletter.ts`; C5 (live with M5).

Waits on other milestones: P1 to P7 on M4's `leads`, `proposals` and their events; O4, O7, O8 and C5 on M5's data requests, incidents and certificates; B3 on M3 documents emitting `invoice.issued`; B8 and B9 on attendance marking and the feedback page. Each is built and tested on its event now and goes live when the emitter lands.
