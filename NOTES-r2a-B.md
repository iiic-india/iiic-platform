# R2a · builder B · My IIIC's records

Branch `r2a/records`, cut from `r2a/foundation` (8c33dcc). Slice B of `docs/20-accounts-design.md` §13: the `(account)` layout, `/account`, bookings (with reschedule and cancel within policy), documents (certificates), invoices; `src/lib/accounts/{scope,bookings,documents}.ts`; `src/components/account/**` (not `signIn/`, not `privacy/`); the site header's "Log in"; the beacon's `countsPath`; the tests §13 names. No schema change, no migration.

## Checklist

- [x] Branch, install, design and code read
- [x] Notes committed
- [x] `scope.ts`: the door (flag, then session), the seam to A's session (STUB), `ownPersonIds`, the scoped readers, the account's request, the private file headers
- [x] `bookings.ts`: `listOwnBookings`, `getOwnBooking`, `manageOwnBooking` (via `changeOwnBooking`), the page, free times, invite
- [x] `documents.ts`: `listOwnCertificates`, `listOwnInvoices`, `downloadOwnDocument` (+ `downloadOwnDocumentWith`, `documentResponse`)
- [x] Copy and components (`src/components/account/`), `/copy-check` run and its Fix applied
- [x] Layout, pages, routes, server actions, the account segment's 404 and 500
- [x] Header "Log in" (wraps rather than widens the row), beacon
- [x] Unit tests (`tests/unit/accountsScope.spec.ts`, 37 cases), the page inventory in `tests/unit/seoPages.spec.tsx`
- [x] Integration tests (`tests/int/accountsRecords.int.spec.ts`; CI only, needs `r2a_accounts`)
- [x] E2E (`tests/e2e/myIiic.e2e.spec.ts`, skipped until A's sign-in and `ACCOUNTS_TEST_CODE`), the headers test's `/account` rows
- [x] typecheck, lint, unit tests (all green but the known D-112 case in `decisions.spec.ts`)
- [ ] build, format:check (running)

## For the lead (the join)

- **The session seam.** `src/lib/accounts/scope.ts`, section "The session (builder A's)": three stubs (`getAccountSession` answers null, `requireAccount` redirects to `/login?next=…`, `signOut` does nothing). Replace the block with A's exports (`export { getAccountSession, requireAccount } from './session'` and A's `signOut`). Nothing else in slice B imports A's modules.
- **The scope test reaches A's and C's files.** `tests/unit/accountsScope.spec.ts` fails on any `overrideAccess: true` in `src/lib/accounts/**` without a `// scope: <what keeps it to the account>` comment in the 14 lines above it (docs/20 §8: "a unit test fails on a query in that folder without one"). A's and C's queries need that line at the join.
- **Two files outside slice B's list were touched, for tests that would otherwise fail:** `tests/unit/seoPages.spec.tsx` (the page inventory gains a `MY_IIIC` list and a noindex case; A's `/login` pages and C's `/account/privacy` need their own lines there too) and `tests/e2e/headers.e2e.spec.ts` (a separate block appended at the end, as §13 gives B "the headers test's rows for /account").
- **"Not your booking?"** links to `/account/privacy?request=correction&booking=<reference>`: C's page may read `request` and `booking` to open the correction request with the booking named (docs/20 §7.2, §7.5).
- **CI env for the e2e:** `myIiic.e2e.spec.ts` runs only when `ACCOUNTS_TEST_CODE` is set (A adds it with `BETTER_AUTH_SECRET` and `MESSAGING_TRANSPORT=fake`); its sign-in helper follows docs/20 §4.1's words ("Email address", "Send me a code", "Six-digit code", "Sign in", "Create my account", "I am 18 or older").
- **Copy** is candidate copy (I-41), checked with `/copy-check`.
