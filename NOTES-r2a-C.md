# R2a · builder C · privacy and settings in My IIIC

Branch `r2a/privacy`, cut from `r2a/foundation` (8c33dcc). Spec: `docs/20-accounts-design.md` §7.5, §4.6, §4.7, §7.6 (the page that starts a closure), §8, §11, §13 (slice C). Contract: `src/lib/accounts/contract.ts` (not changed here).

## Files (slice C only)

- `src/lib/accounts/privacy/`: `seams.ts` (A's and B's functions, stubs until the join), `rules.ts` (pure), `copy.ts` (candidate copy), `outcome.ts` (the page's addresses and outcome codes), `state.ts` (the two action-state forms), `consents.ts` (`listOwnConsents`, `giveConsent`, `withdrawConsent`), `requests.ts` (`createOwnRequest`, `listOwnRequests`), `actions.ts` (server actions).
- `src/app/(platform)/(account)/account/privacy/`: `page.tsx`, `close/page.tsx`, `closed/page.tsx`, `contact/page.tsx` (the placeholder README went).
- `src/components/account/privacy/`: `PrivacySections.tsx`, `OutcomeNote.tsx`, `OwnRequestForm.tsx`, `AddDetailFlow.tsx`, `SignInAgain.tsx`, `privacy.module.css`.
- Tests: `tests/unit/accountsPrivacy.spec.ts`, `tests/int/accountsPrivacy.int.spec.ts`, `tests/e2e/myIiicPrivacy.e2e.spec.ts`.

## Checklist

- [x] Branch and notes
- [x] Seams
- [x] Rules and server functions
- [x] Copy (copy check run; fixes applied)
- [x] Page, actions and components
- [x] Unit tests (31)
- [x] Integration tests (CI only; need `r2a_accounts`)
- [x] E2E spec (CI only; needs A and `ACCOUNTS_TEST_CODE`)
- [x] Checks green locally: typecheck, lint, format:check, build, unit tests

## For the lead (at the join)

- **Seams.** In `src/lib/accounts/privacy/seams.ts`, replace each stub with an import from its owner: `getAccountSession`, `requireAccount` (A, `session.ts`); `signOut`, `listDevices`, `signOutEverywhere` (A); `closeAccount` (A, `lifecycle.ts`); `requestDetailCode`, `confirmDetail` (A, `details.ts`); `ownPersonIds` (B, `scope.ts`; the copy here is a working query the int test relies on). Nothing else in the slice imports A or B.
- **`whatsAppCodesOpen`.** The contract has no "are WhatsApp codes open here" function, so the seam answers false (D-126: email only) and "Add a mobile number" never shows. When A exposes one, wire it here.
- **Contract gaps** (not edited): `GiveConsent` has no code for "not offered here" (under 18, no verified detail, WhatsApp not set up, no notice), so those answer `closed-here`; `ownRequestInput` allows 4,000 characters but `data-requests.summary` keeps 2,000, so the server and the form cap it at 2,000 (`SUMMARY_MAX`).
- **Audit actor.** Consent and request writes from My IIIC reach the audit log through the plugin by field name, but with no actor: the plugin reads `req.user`, and a customer is never one (D-127). `account:<id>` on those entries needs a change to `src/plugins/auditLog.ts` (for example reading an account actor from `req.context`), which is not slice C's file.
- **`/account/privacy/closed`** reads the session first and sends a signed-in person back to the page, otherwise shows fixed words. If B's `(account)` layout redirects every signed-out visitor, this page needs an exception there, or the closing action should lead elsewhere.
- **Layout.** The pages use `iiic-page-narrow`; drop it if B's layout already wraps children in a page container.
- **Int test.** Closing ("keeps bookings, payments and invoices and removes the user, sessions and links") is an `it.todo`: it is A's `CloseAccount`, to write against the real function after the join.
- **E2E.** Skipped without `ACCOUNTS_TEST_CODE`; CI needs it set (and `BETTER_AUTH_SECRET`). The sign-in helper reads A's steps by docs/20 §4.1's labels ("Email address", "Send me a code", "Six-digit code", "Sign in", "Full name", the account notice's words as the box's label, "I am 18 or older", "Create my account"); adjust if A's markup differs.
- **I-67.** A request made here is marked verified by `oneTimeCode` at creation, as docs/20 §7.5 says; the lawyer confirms whether a session's code verifies a data request.
