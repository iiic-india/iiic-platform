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
   - [x] Booking submission: refused on a preview; Turnstile with keys; on production 5 an hour per
         address and 3 a day per email, counted from stored rows (D-108, proposed).
   - [x] Manage-link actions (reschedule, cancel): refused on a preview.
   - [x] Certificate check by ID: 120 lookups a minute per server (D-109).
   - [x] Staff password reset: one email per account in five minutes (D-109).
   - [x] Tests: `bookingGuards.spec.ts`, `certificatesVerifyPages.spec.tsx`, `resetEmail.spec.ts`.
2. Known gaps
   - [ ] Request-time 404 on the server: not possible inside Next.js 16.4 as built (see report).
   - [x] Proposal PDF opened by signed-in staff or on a preview counts no view.
   - [x] "Move to stage" on the lead's own admin page, role checked first.
   - [x] Invoice PDFs stored in the private bucket; audited download for owners and finance.
3. Lighthouse budgets
   - [x] Every assertion is `error` again: all passed on main's run of 24 November (none printed).
4. [ ] Security pass (ASVS 5.0 L2) into `docs/security-review.md`, fixes with tests.
5. [ ] Booking concurrency integration test.
6. [ ] Docs: `docs/runbook.md`, operator guide, accessibility statement (if `docs/12` §9 gives it).

## Checks

Local: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit tests, `pnpm build`.
CI only: integration, e2e, Lighthouse. `tests/unit/decisions.spec.ts` fails on this branch alone:
D-100 to D-107 arrive with M6, and the template row stays M6's to raise.

## Log

- 2026-11-24: branch made, plan written; items 1, 2 (but the 404) and 3 done and pushed.
