# R2a · accounts and My IIIC · architect's notes

Branch `r2a/foundation`, cut from `origin/m6/core` (PR #38, M1 to M7) at bd796bc. Release 2, item 2 of `docs/10-build-plan.md`: accounts (Better Auth, email and WhatsApp codes), My IIIC, attaching earlier bookings.

Hands off while PR #38's fixer works: `src/lib/privacy/**`, `src/lib/messaging/**`, `src/emails/**`, `src/jobs/**`, `src/migrations/**` are not edited here; new files only, with the hooks needed described in the design. No migration is generated (the integrator makes `r2a_accounts` after the builders).

## Plan

1. Read the docs (CLAUDE, README, 00 to 04, 07, 08, 12 to 14, 16 to 19, decisions) and the code for people, consents, bookings, messaging, audit, the private store, env, headers.
2. Look up Better Auth's current docs (version, email OTP and phone-number plugins, Postgres adapter, schema generation, session reads in App Router, rate limits, cookies) and choose an exact version.
3. Write `docs/20-accounts-design.md` in the shape of 16 to 19.
4. Scaffold: the dependency pinned; env vars; contract files (types only); route folders with READMEs; collection and field additions with access rules.
5. Decision rows from D-115 and inputs from I-65; README index; check `tests/unit/decisions.spec.ts` against the reserved gap D-110 to D-114.
6. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit tests; push `r2a/foundation`.

## Checklist

- [ ] Notes committed
- [ ] Docs and code read
- [ ] Better Auth version chosen
- [ ] `docs/20-accounts-design.md`
- [ ] Scaffold
- [ ] Decisions, inputs, README
- [ ] Checks green
- [ ] Pushed
