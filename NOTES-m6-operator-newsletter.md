# NOTES · m6-operator-newsletter (M6 slice C)

Branch `m6/operator-newsletter` from `m6/foundation`. Design: `docs/19` (slice C, §5, §8, §9, §12).

## Interfaces built against (foundation, frozen)

- `src/lib/messaging/operations.ts`: `Deliver`, `CancelQueued`, `SignLink`, `VerifyLink`, `messageKey`, `PlannedMessage`. Builder A implements them (not in this base).
- `src/lib/automations/{catalogue,events,emit,listeners,schedules,timing}.ts`: tasks named by id; `emitAutomationEvent(req, event)`; `withSchedule` applies SCHEDULES in `src/jobs/index.ts`.
- `src/emails/types.ts` `TemplateImplementation { load, email, whatsapp }`; `src/emails/registry.ts` keys; `OTHER_TEMPLATES` in `src/emails/other/index.ts` is mine.
- `src/lib/privacy/consents.ts` `consentFor`, `currentNotice`; ledger rules in `consentLedger.ts`.
- `subscribers`, `newsletter-issues` collections (fields frozen; hooks mine).

## How C reaches A's core without A's files

`src/lib/automations/operations/core.ts` holds a port: `messagingCore()` returns the joined core or a
"not joined" one that refuses (`core-missing`). Tests inject fakes with `useMessagingCore`. At the join
one line registers A's `deliver`, `cancelQueued`, `signLink`, `verifyLink`.

Newsletter confirmation token: HMAC of `subscriberId:confirmExpiresAt` under a key derived from
PAYLOAD_SECRET (HKDF, purpose "newsletter-confirm"); only its SHA-256 is stored; N1's load re-derives it.

## Files (order of work)

1. NOTES (this) · 2. `src/lib/newsletter/` tokens, signup, confirm, unsubscribe + unit tests
3. core port, `src/emails/other/` templates · 4. `src/jobs/newsletter.ts` N1–N4, hooks in Subscribers/NewsletterIssues
5. API routes `/api/newsletter`, `/api/newsletter/unsubscribe`; pages confirm/unsubscribe, `/w/[token]`
6. V1, V2 (`src/lib/automations/reviews/`), hooks emitting `review.consentRequested`, `consent.withdrawn`
7. O1, O2+O10, O5, O6, O9 (`src/lib/automations/operations/`), `src/jobs/operations.ts`
8. P1–P7, O4, O7, O8, C5 registered on their events, waiting on M4/M5
9. generate:types, checks, remove NOTES.

## Progress

- [x] 2 · [x] 3 · [x] 4 jobs (hooks in Subscribers/NewsletterIssues: todo) · [ ] 5 · [x] 6 · [x] 7 · [x] 8 · [ ] 9
- Run 3 (18:40 IST): reviews hooks wired into Testimonials/Consents afterChange (hooks only, no fields).
  Next: NewsletterIssues hook (issueScheduled), API routes, pages, unit tests for V1/V2/O-sections, int tests.
