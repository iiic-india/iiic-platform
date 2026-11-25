# R2a · builder A · sign-in, sessions and the account's life

Branch `r2a/sign-in`, cut from `r2a/foundation` (8c33dcc). Specification: `docs/20-accounts-design.md` §3, §4, §6, §7.6, §9 (A1 to A3), §10, §11, §12 (the three stubs), §13 (slice A). Contract: `src/lib/accounts/contract.ts` (not changed here). This worktree cannot push: the lead pushes the head commit.

## Plan

1. Better Auth's instance (`src/lib/accounts/auth/`): options as §3.4, IIIC's server-only plugin (`startSession`, `createCustomer`, `addDetail`, `forgetCode`, `codeTries`), the platform's logger; `src/scripts/print-customer-auth-sql.ts`; the SQL for the hand-written `r2a_customer_auth` migration, staged for the integrator.
2. Sign-in machinery (`src/lib/accounts/signIn/`): deployment and flag gate (`closed-here`), the sealed sign-in cookie, identifier normalising, masking and hashing, the limits (§4.8), `requestCode`, `verifyCode`, `createAccount`.
3. Sessions (`src/lib/accounts/session.ts`): `getAccountSession`, `requireAccount`, `listDevices`, `signOut`, `signOutEverywhere`.
4. The account's life: `attach.ts` (`attachEarlierRecords`, the `people` create hook), `lifecycle.ts` (close, `closeAccountsOfPerson`, end sessions, detach), `details.ts` (a second detail), `purge.ts` (O5).
5. Pages and components: `/login`, `/login/verify` (steps 2 and 3), `/login/detail` (a second detail's code step), server actions, error summary focus; `src/components/account/signIn/`.
6. Messages A1 to A3 (`src/emails/accounts/`).
7. Owner endpoints on `Accounts.ts`; the hook line in `People.ts`.
8. Docs: `docs/12` §1 and §10 rows, `docs/content/whatsapp-templates.md`, `docs/runbook.md`.
9. Tests: unit (`accountsSignIn*.spec.ts`, `accountsMessages.spec.ts`), int (`accountsAuthSchema`, `accountsSignIn`, `accountsAttach`), e2e (`accountsSignIn`, `cookies`).
10. Checks: typecheck, lint, format:check, build, unit tests.

## Checklist

- [x] Branch and notes (2b79cbe)
- [x] Better Auth instance, plugin, SQL script, staged migration SQL (b951357, 64652e3)
- [x] Sign-in machinery and actions (b951357, 64652e3)
- [x] Sessions (b951357)
- [x] Attach, lifecycle, details, purge; the three stubs replaced (b951357)
- [x] Pages and components (64652e3)
- [x] Templates A1 to A3 (b951357)
- [x] Owner endpoints, People hook line (64652e3)
- [x] Docs (d2912a1)
- [x] Unit tests (b951357, 64652e3, 246ca4d)
- [x] Integration tests (0a8cbee)
- [x] End-to-end tests (`accountsSignIn`, `cookies` rows) (2c3b578)
- [x] For B and C: `whatsappCodesOpenHere` in `details.ts`; `// scope:` comments on every `overrideAccess: true` (a3265a5, e0b32b1)
- [x] A second detail's sign-in cookie on path `/`, so C's privacy page reads it (e0b32b1)
- [x] Checks green (e0b32b1): typecheck, lint, format:check, build; unit 3228 passed, failing only `decisions.spec.ts` (D-112, gone once main is merged at the join) and `firstAccountIsOwner.spec.ts` under the full parallel run (a 10 s hook timeout; 4/4 alone)
- [ ] Pushed (by the lead: this worktree cannot push)

## Choices the design left open (for the lead)

- **The own record (§4.5).** It is the record that already holds the detail proven (a closed account's), else the newest earlier record holding it when its name is the one the person typed, else a new record. A record is never renamed: a different name makes a new own record and the earlier ones are attached.
- **A second detail's code step is `/login/detail`.** The sign-in cookie travels to `/login/*` only (§10), so C's privacy page calls `requestDetailCode` (which sets it) and sends the person to `DETAIL_CODE_PATH`; the page also takes the address itself.
- **`freshAge: 0`** in Better Auth's session options: its own freshness rule would refuse `listSessions` a day after sign-in; the recent-sign-in rule is the platform's (`requireAccount({ recentMinutes })`).
- **The per-network limit** counts nothing when the server sees no network address (a local server), so CI's many sign-ins from one machine are not refused; the per-address and site limits stay on.
- **A `staff` close** does not record the account consent's withdrawal (the ledger refuses `web` from staff and wants evidence for any other channel); nothing calls it in this piece.
