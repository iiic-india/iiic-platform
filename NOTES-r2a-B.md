# R2a · builder B · My IIIC's records

Branch `r2a/records`, cut from `r2a/foundation` (8c33dcc). Slice B of `docs/20-accounts-design.md` §13: the `(account)` layout, `/account`, bookings (with reschedule and cancel within policy), documents (certificates), invoices; `src/lib/accounts/{scope,bookings,documents}.ts`; `src/components/account/**` (not `signIn/`, not `privacy/`); the site header's "Log in"; the beacon's `countsPath`; the tests §13 names. No schema change, no migration.

## Plan

1. `scope.ts`: the door. `ownPersonIds` (the account's own record and every record attached through `people.account`), the scoped query helpers every read in this folder goes through, the local request, and **the seam to builder A's session functions** (`getAccountSession`, `requireAccount`, `signOut`), a stub until A lands: no session, `/login`. The lead swaps the stub for A's imports at the join (one block, marked STUB).
2. `bookings.ts`: `listOwnBookings`, `getOwnBooking`, `manageOwnBooking` (M3's `rescheduleBooking` and `cancelBooking` with `by: 'client'` and `asker: 'client'`, after the ownership check; the refund through `requestClientRefund` and `sendRefunds`, the payment links closed, a new manage token, as the manage link's actions do), the free times (M3's `listSlots`), the refund preview, the `.ics`.
3. `documents.ts`: `listOwnCertificates`, `listOwnInvoices`, `downloadOwnDocument` (certificate: valid, PDF checked against its SHA-256; invoice: only while prices are public; the audit entry `account:<id>` before the bytes go back).
4. Pages: layout (flag, section links, sign out), overview, bookings list, booking page (details, calendar, reschedule and cancel as server-rendered forms that work without JavaScript, "Not your booking?"), `invite.ics`, documents and its PDF route, invoices and its PDF route; `not-found.tsx` in the account segment; the scope statement and crisis numbers wherever a counselling booking shows.
5. Components and copy in `src/components/account/` (one copy file, VOICE.md, candidate copy I-41).
6. `SiteHeader`: "Log in" while `accountsEnabled` is on (no session read). `beacon.ts`: `/login` and `/account` never counted.
7. Tests: `tests/unit/accountsScope.spec.ts` (every `overrideAccess` in `src/lib/accounts/**` scoped or marked; the functions with a fake Payload: another account's booking, certificate and invoice answer not-found; no amount or invoice PDF while prices are hidden; audit before bytes; counselling shows no offer), `tests/int/accountsRecords.int.spec.ts`, `tests/e2e/myIiic.e2e.spec.ts`, the headers test's `/account` rows.
8. Checks: typecheck, lint, format:check, build, unit tests.

## Checklist

- [x] Branch, install, design and code read
- [x] Notes committed
- [ ] `scope.ts`
- [ ] `bookings.ts`
- [ ] `documents.ts`
- [ ] Copy and components
- [ ] Layout and pages, routes
- [ ] Header "Log in", beacon
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E spec and headers rows
- [ ] typecheck, lint, format:check, build, unit tests

## For the lead

- (filled in as found)
