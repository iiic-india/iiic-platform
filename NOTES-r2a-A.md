# R2a · builder A · sign-in, sessions and the account's life

Branch `r2a/sign-in`, cut from `r2a/foundation` (8c33dcc). Specification: `docs/20-accounts-design.md` §3, §4, §6, §7.6, §9 (A1 to A3), §10, §11, §12 (the three stubs), §13 (slice A). Contract: `src/lib/accounts/contract.ts` (not changed here). This worktree cannot push: the lead pushes the head commit.

## Plan

1. Better Auth's instance (`src/lib/accounts/auth/`): options as §3.4, IIIC's server-only plugin (`startSession`, `createCustomer`, `forgetCode`), the platform's logger; `src/scripts/print-customer-auth-sql.ts`; the SQL for the hand-written `r2a_customer_auth` migration written as a file for the integrator.
2. Sign-in machinery (`src/lib/accounts/signIn/`): deployment and flag gate (`closed-here`), the sealed sign-in cookie, identifier normalising, masking and hashing, the limits (§4.8), `requestCode`, `verifyCode`, `createAccount`.
3. Sessions (`src/lib/accounts/session.ts`): `getAccountSession`, `requireAccount`, `listDevices`, `signOut`, `signOutEverywhere`.
4. The account's life: `attach.ts` (`attachEarlierRecords`, the `people` create hook), `lifecycle.ts` (close, `closeAccountsOfPerson`, end sessions, detach), `details.ts` (a second detail), `purge.ts` (O5).
5. Pages and components: `/login`, `/login/verify` (steps 2 and 3), server actions, error summary focus; `src/components/account/signIn/`.
6. Messages A1 to A3 (`src/emails/accounts/`).
7. Owner endpoints on `Accounts.ts`; the hook line in `People.ts`.
8. Docs: `docs/12` §1 and §10 rows, `docs/content/whatsapp-templates.md`, `docs/runbook.md`.
9. Tests: unit (`accountsSignIn*.spec.ts`, `accountsMessages.spec.ts`), int (`accountsAuthSchema`, `accountsSignIn*`, `accountsAttach`), e2e (`accountsSignIn`, `cookies`).
10. Checks: typecheck, lint, format:check, build, unit tests.

## Checklist

- [x] Branch and notes
- [ ] Better Auth instance, plugin, SQL script, migration SQL file
- [ ] Sign-in machinery and actions
- [ ] Sessions
- [ ] Attach, lifecycle, details, purge
- [ ] Pages and components
- [ ] Templates A1 to A3
- [ ] Owner endpoints, People hook line
- [ ] Docs
- [ ] Tests
- [ ] Checks green
