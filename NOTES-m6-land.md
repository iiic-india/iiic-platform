# M6 landing notes (working file; the lead removes it at the join)

Branch `m6/join`, pushed to `origin m6/core`. No PR, no merge to main.

## Done before this round (head 51e2185)

- Main with M3 fixes and M4 merged; M6 wired to M4 (P1, P5 mailer, P6, P7, digest lines, schedules
  for P3-P4-lead-alerts and P8-expire-proposals).
- Review lessons: price rule `paymentLink`; webhooks and signup production-only; suppression
  `source` server-only; field-access test; public-routes test; quiet hours at send time.

## This round (M5 landed on main at 52e0590)

1. [x] Merge origin/main (M5) into m6/join (0d3d53c)
2. [x] Wire O4, O7, O8, C5, B8, B9 (a09aafc); tests tests/unit/automationsPrivacy.spec.tsx
   - M5 emitted no dataRequest/incident events and no attendance events: M6 added afterChange
     hooks (src/lib/automations/privacy/hooks.ts, booking/attendance.ts) on DataRequests,
     Incidents, Bookings; CERTIFICATE_LISTENERS reads the catalogue (C5).
   - B8 gated by FEEDBACK_PAGE_BUILT=false (no /feedback page in M5): outcome
     `waits-on-feedback-page`.
   - O7 complaint-ack sets complaintCopySentAt after send (src/lib/messaging/afterSent.ts).
   - Template loads now get the message's variant (privacy-deadline, incident-alert steps).
3. [x] O5-purge-missing-pages: registered and scheduled 02:00 IST (asserted in the catalogue test)
4. [x] Migration src/migrations/20261124_100324_m6_messaging.ts (a130904)
5. [x] D-100 to D-107 in docs/decisions.md (template row to D-108); I-56 onward in docs/09;
       docs/README.md; docs/19 true to the build
6. [ ] typecheck, lint, format:check, unit, build green
7. [ ] Push and report

## Decisions to record (D-100 to D-107)

1. P6 makes a `reviewFollowUpDraft` task for the operator, not a drafted email.
2. P8's expiry notice is a digest line only.
3. `ownPayment` not taken: only the payment link carries an amount while prices are hidden.
4. Webhooks and the newsletter signup act on production only.
5. Quiet hours drop a message only when it is due.
6. A suppression's `source` is the server's.
7. Acknowledgements keyed to the enquiry (a request joining an open lead is answered too).
8. `messages.subjectCollection` gains `enquiries`.

## Inputs to record (I-56 onward)

- The words of P6's drafted follow-up email.

## Log
