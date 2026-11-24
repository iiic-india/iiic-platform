# R2a · accounts and My IIIC · architect's notes

Branch `r2a/foundation`, cut from `origin/m6/core` (PR #38, M1 to M7) at bd796bc. Release 2, item 2 of `docs/10-build-plan.md`: accounts (Better Auth, email and WhatsApp codes), My IIIC, attaching earlier bookings. The design is `docs/20-accounts-design.md`.

Hands off while PR #38's fixer works: `src/lib/privacy/**`, `src/lib/messaging/**`, `src/emails/**`, `src/jobs/**`, `src/migrations/**` are not edited here; the hooks this piece needs there are H1 to H9 in `docs/20` §12, for the lead to land once PR #38 has merged. No migration is generated (the integrator makes `r2a_accounts`, then the hand-written `r2a_customer_auth`, `docs/20` §3.3, §15).

## Plan

1. Read the docs (CLAUDE, README, 00 to 04, 07, 08, 12 to 14, 16 to 19, decisions) and the code for people, consents, bookings, messaging, audit, the private store, env, headers.
2. Look up Better Auth's current docs and source (version, email OTP and phone-number plugins, Postgres adapter, schema generation, session reads in App Router, rate limits, cookies) and choose an exact version.
3. Write `docs/20-accounts-design.md` in the shape of 16 to 19.
4. Scaffold: the dependency pinned; env vars; contract file; route folders with READMEs; collection and field additions with access rules.
5. Decision rows from D-115 and inputs from I-65; README index; check `tests/unit/decisions.spec.ts` against the reserved gap D-110 to D-114.
6. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit tests; push `r2a/foundation`.

## Checklist

- [x] Notes committed
- [x] Docs and code read
- [x] Better Auth 1.7.27 chosen and pinned, with kysely 0.29.9 (its Postgres dialect)
- [x] `docs/20-accounts-design.md`
- [x] Scaffold: `src/lib/accounts/contract.ts`; `accounts` and `sign-in-requests` collections; `people.account`; `POLICY.accounts`, `POLICY.signInRequests`, `VIEW_POLICY.accountActions`; env (`BETTER_AUTH_SECRET`, `BETTER_AUTH_TELEMETRY` guard, `ACCOUNTS_TEST_CODE`); route folders; `tests/unit/accountsFoundation.spec.ts`
- [x] Decisions D-115 to D-129, inputs I-65 to I-67, README
- [x] Checks: typecheck, lint, format and unit tests green except `decisions.spec.ts`'s numbering case, which fails only on the reserved gap D-110 to D-114 and passes once they land
- [ ] Pushed

## For the lead

- Land H1 to H9 (`docs/20` §12) on this branch after PR #38 merges and this branch is rebased on `main`; then the builders branch.
- When D-110 to D-114 land, drop "(D-110 to D-114 held for work in flight)" from `docs/README.md`.
- `docs/04`'s `accounts` row gains "as built" lines when slice A joins.
