# M7 hardening: working notes

Branch `m7/hardening` from `origin/main` at 52e0590 (M1 to M5 merged). The code-side part of M7
(`docs/10` M7); everything that needs an outside account or the owner is not here. M6 (automations
and messaging) lands in parallel on its own branch: this branch does not touch `src/jobs/**`,
`src/lib/messaging/**`, `src/emails/**`, `src/migrations/**` or the job registration in the
Payload config, and makes no schema change. Decisions D-108 onward, inputs I-60 onward.

## Plan, in order

1. Rate limits and Turnstile on public forms
   - [x] Found in place: the Team Map and partnership forms (trap, signed draw time, Turnstile with
         keys, 5 an hour per address and 3 a day per email, nothing stored on a preview; D-92).
   - [x] Found in place: Turnstile keys optional, both or neither (`src/lib/env.ts`).
   - [ ] Booking submission (`submitBookingAction`): nothing stored on a preview; rate limits by
         address and email counted from stored rows; Turnstile where the keys are set. Decision row.
   - [ ] Manage-link actions (reschedule, cancel): nothing changed on a preview.
   - [ ] Tests: limiter and verification path.
2. Known gaps
   - [ ] Request-time 404 rendered on the server with its content and a 404 status.
   - [ ] Proposal PDF opened from a preview or by signed-in staff counts no view.
   - [ ] "Move to stage" on the lead's own admin page, role checked first.
   - [ ] Invoice PDFs stored in the private bucket (the store exists: `src/lib/storage/privateBucket.ts`),
         read through an audited route.
3. Lighthouse budgets: back to `error` where they pass; the rest stay `warn` with a comment.
4. Security pass (ASVS 5.0 L2: authentication, access control, input, logging) into
   `docs/security-review.md`, fixes with tests.
5. Booking concurrency integration test (two bookings for one slot, one wins).
6. Docs: `docs/runbook.md` (deploy, roll back, restore, rotate, breach), operator guide;
   accessibility statement only if `docs/12` §9 gives its content.

## Checks

Local: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit tests, `pnpm build`.
CI only: integration, e2e, Lighthouse.

## Log

- 2026-11-24: branch made, plan written.
