# R2a · builder C · privacy and settings in My IIIC

Branch `r2a/privacy`, cut from `r2a/foundation` (8c33dcc). Spec: `docs/20-accounts-design.md` §7.5, §4.6, §4.7, §7.6 (the page that starts a closure), §8, §11, §13 (slice C). Contract: `src/lib/accounts/contract.ts` (not changed here).

## Files (slice C only)

- `src/lib/accounts/privacy/**`: `ListOwnConsents`, `GiveConsent`, `WithdrawConsent`, `CreateOwnRequest`, `ListOwnRequests`; pure rules; the seams to A's and B's functions.
- `src/app/(platform)/(account)/account/privacy/**`: the page and its server actions.
- `src/components/account/privacy/**`: the page's sections.
- Tests: `tests/unit/accountsPrivacy.spec.ts`, `tests/int/accountsPrivacy.int.spec.ts`, `tests/e2e/myIiicPrivacy.e2e.spec.ts`.

## Plan

1. Seams (`src/lib/accounts/privacy/seams.ts`): typed stand-ins for A's `requireAccount`, `listDevices`, `signOutEverywhere`, `closeAccount`, `requestDetailCode`, `confirmDetail` and B's `ownPersonIds`, each marked STUB, so the lead swaps one import per function at the join.
2. Pure rules (`rules.ts`): consent rows from the ledger, what may be given or withdrawn, recent sign-in, one open request per kind.
3. Server functions (`consents.ts`, `requests.ts`), scoped to the account's own records, Zod at the boundary, results not throws.
4. Copy (`copy.ts`): candidate copy to VOICE.md; the account notice and consent text as `[[TODO …, I-65]]`.
5. Page and server actions; components for each section; works without JavaScript; focus on the error summary.
6. Tests: unit, integration, e2e.
7. Checks: typecheck, lint, format:check, build, unit tests.

## Checklist

- [x] Branch and notes
- [ ] Seams
- [ ] Rules and server functions
- [ ] Copy
- [ ] Page, actions and components
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E spec
- [ ] Checks green locally

## For the lead (at the join)

- (filled in as found)
