# NOTES · m6-booking-messages (M6 slice B)

Branch `m6/booking-messages` from `m6/foundation`. Design: `docs/19` §5 to §7, §11, §12 (B).

## Interfaces built against (frozen foundation)

- `src/emails/registry.ts`: the 15 booking keys, price rules, `counsellingScope`, footers.
- `src/emails/types.ts`: `TemplateImplementation { load, email, whatsapp }`, `EmailContext`.
- `src/emails/components/{Frame,parts}.tsx`: Frame, Paragraph, Button, Details, CounsellingScope.
- `src/lib/messaging/operations.ts`: `Deliver`, `CancelQueued`, `PlannedMessage`, `messageKey`.
  Builder A implements them (`src/lib/messaging/deliver.ts`); not on this branch.
- `src/lib/automations/timing.ts` (`reminder24hAt`, `reminderShortAt`, `after`, `OFFSETS`),
  `src/lib/messaging/policy.ts` (`plannedSendTime`), catalogue task names.
- Events: `src/lib/booking/events.ts` (ids only), `invoice.issued` in automations/events.ts.

## Plan of the code

- `src/lib/automations/booking/plan.ts`: pure planners. Input: the event plus a snapshot of the
  booking (startsAt, confirmedAt, format, counselling, status, payment) and `now`. Output:
  `{ cancel: CancelScope[], deliver: PlannedMessage[] }`. Unit-tested (time, channel, re-plan).
- `src/lib/automations/booking/snapshot.ts` (server-only): reads the booking for the planner.
- `src/lib/automations/booking/core.ts`: the `MessagingCore` port `{ deliver, cancelQueued }`;
  until A's core is joined it answers `core-not-wired` (lead wires one import at the join).
- `src/lib/automations/booking/run.ts`: runs a plan against a core (cancels first).
- `src/jobs/bookingMessages.ts`: one task per automation id, handler = snapshot, plan, run.
- `src/emails/booking/*.tsx`: one file per template; `load.ts` reads booking data at send time
  and answers `stale`. Copy from the kit's booking-confirmation.html; other lines candidate.
- `docs/content/whatsapp-templates.md`: the eight WhatsApp texts for Meta.

## Decisions to propose (not in decisions.md)

- Manage link: the token is not stored, so emails cannot carry it; emails say "reply to this
  email" (kit words). Propose a signed `manage` link purpose (A's links.ts) later.

## Order of work

1. NOTES (this). 2. plan.ts + unit tests. 3. core/run/snapshot + jobs. 4. load.ts + templates.
5. WhatsApp texts. 6. int tests. 7. checks; remove NOTES.

## Status

- [x] 1, 2, 3 (plan.ts, tasks.ts, snapshot.ts, core.ts, fakeCore.ts, wiring.ts, jobs file)
- [x] Schema: `payments.linkUrl` (B13's link), payload-types regenerated with the B task slugs
- [x] 4a: data.ts, format.ts, copy.ts, load.ts; confirmed, reminders, changes (B2, B5, B6, B7)
- [ ] 4b: receipt (B3), consent receipt (B3a), after (B8, B9), slot lost (B10), time request
      (B12), payment link (B13); booking/index.ts map; public/email PNGs
- [ ] 5 WhatsApp texts doc. 6 unit tests for templates; int test for tasks with the fake core.
- [ ] 7 checks; remove NOTES
