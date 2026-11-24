# R2a · accounts and My IIIC · architect's notes

Branch `r2a/foundation`, cut from `origin/m6/core` (PR #38, M1 to M7) at bd796bc, then joined with `m67/join` (1f1309b: PR #38's fourteen review fixes, D-110 and D-111). Release 2, item 2 of `docs/10-build-plan.md`: accounts (Better Auth, email and WhatsApp codes), My IIIC, attaching earlier bookings. The design is `docs/20-accounts-design.md`.

The hooks this piece needs in M5's and M6's code, H1 to H9, have landed (`docs/20` §12). No migration is generated: the integrator makes `r2a_accounts`, then the hand-written `r2a_customer_auth` (`docs/20` §3.3, §15). Until then CI's integration stage fails wherever a test touches `people`, `accounts`, `sign-in-requests` or the new message enums.

## Checklist

- [x] Notes committed
- [x] Docs and code read
- [x] Better Auth 1.7.27 chosen and pinned, with kysely 0.29.9 (its Postgres dialect)
- [x] `docs/20-accounts-design.md`
- [x] Scaffold: `src/lib/accounts/contract.ts`; `accounts` and `sign-in-requests` collections; `people.account`; `POLICY.accounts`, `POLICY.signInRequests`, `VIEW_POLICY.accountActions`; env (`BETTER_AUTH_SECRET`, `BETTER_AUTH_TELEMETRY` guard, `ACCOUNTS_TEST_CODE`); route folders; `tests/unit/accountsFoundation.spec.ts`
- [x] Decisions D-113 to D-127 (D-112 is PR #38's), inputs I-65 to I-67, README
- [x] `m67/join` merged; decisions renumbered
- [x] Hooks H1 to H9 with tests (`accountsHooks.spec.ts`, `accountsHooks.int.spec.ts`, and the existing tests they touch)
- [x] Checks: typecheck, lint, format and unit tests green except `decisions.spec.ts`'s numbering case, which fails only for D-112 until PR #38's last commit lands
- [ ] Pushed (by the lead: this worktree cannot push)

## Stubs for builder A

- `src/emails/accounts/index.ts`: `ACCOUNT_TEMPLATES` empty (A1 to A3).
- `src/lib/accounts/lifecycle.ts`: `closeAccountsOfPerson` returns `{ closed: 0, detached: 0 }` (called by the erasure, H7).
- `src/lib/accounts/purge.ts`: `purgeSignIns` removes nothing (called by O5, H9).

## For the lead

- `docs/04`'s `accounts` row gains "as built" lines when slice A joins.
