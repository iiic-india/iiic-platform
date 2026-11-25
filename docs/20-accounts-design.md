# 20 · Customer accounts and My IIIC: the design (Release 2, item 2)

The design the first piece of Release 2 is built to: sign-in by one-time code over email and, once the provider is set up, WhatsApp; Better Auth beside Payload; the account and how it reaches a person's records; attaching earlier bookings; My IIIC's screens; access, the audit log, cookies, headers and messages; the tests; and who builds what. Written 24 November 2026 on branch `r2a/foundation`, cut from `m6/core` (PR #38: M1 to M7), which holds the dependency (`better-auth` 1.7.27 and `kysely` 0.29.9, pinned), the `accounts` and `sign-in-requests` collections, `people.account`, the access rules, the environment, the contract in `src/lib/accounts/contract.ts` and its unit test. Sources: `00` (One account), `01` §4 and §5 (Clients with an account), `02` (`/login`, `/account`), `03` F7 and F11, `04` (`accounts`, `people`), `06` A1, `07` (Customer sign-in), `08` §3, §5, §7, §9, `12` §1, §5, §10, `13`, `16` to `19`, D-08, D-18, D-21, D-24, D-87, D-89, D-92, D-101, D-102, D-108. Where this document and those differ, they win, and this one is corrected.

**What it is for.** `03` F7 and `01` §5: a person signs in with a code to their email or mobile, sees their bookings, documents and invoices in one place, changes what they agreed to, and asks for a copy or the erasure of their data. Release 2's order (`10`) puts this second, after the Map; nothing here waits on the Map.

**The migrations.** The builders committed none. At the join (25 November 2026, branch `r2a/join`) the integrator generated one Payload migration after every fix, `src/migrations/20261125_161605_r2a_accounts.ts` (§15), unedited, and then a blank one, `src/migrations/20261125_161840_r2a_customer_auth.ts`, holding Better Auth's own SQL for its four tables (§3.3). Neither is edited afterwards (CLAUDE.md, Commands): a change is a new migration. Neither had run when they were made, since the join's machine had no database; their first run is CI's integration stage on its own empty database, and the branch keeps its Vercel preview off until then, because a preview build migrates production's database (D-140). `r2a_accounts`' down recreates nine enums by casting through text, which fails once a row holds one of the new values, and `r2a_customer_auth`'s down drops every customer's sign-in user and session: neither is used on production.

**Interface.** The interface pass is parked (`15`; the experience-pass memory). Every screen is built plain, accessible and correct from the kit's classes (`src/brand/gallery.html`): forms, the error summary, `.iiic-ticket` for a booking, real tables. My IIIC carries no experience device (`11`), and any page that shows a counselling booking ends with the scope statement and the crisis numbers (`08` §7).

## 1. Rules this design keeps

- **Customers are not staff.** Staff sign in to `/admin` with Payload and TOTP, as before; customers sign in with Better Auth and never become Payload's `req.user`. Payload's access rules stay the staff's. What a customer reads or writes goes through server functions in `src/lib/accounts` that take the signed-in `AccountSession` and touch only that account's records (§8).
- **Every route checks the session first** (CLAUDE.md #6): each page, server action and route handler under `/account` calls `requireAccount()` before it reads a parameter, a body or the database; a record that is not the account's answers exactly as one that does not exist.
- **Consent before storage** (CLAUDE.md #4): no account, person or Better Auth user is stored for a new address until the account consent is recorded under the notice in force (D-113). Marketing preferences given from My IIIC are consents in the ledger, each with its notice.
- **Counselling stays private** (CLAUDE.md #3): My IIIC shows a counselling booking's time, format, place or link and practitioner, as its confirmation does, and nothing else; no offer or recommendation appears in My IIIC in this piece (D-124); nothing about counselling routes or markets anything.
- **No dark patterns** (CLAUDE.md #9): no box is ticked in advance; "Keep me signed in" is off until chosen; every decline is "No, thanks" at equal weight; no urgency words; closing the account is as plain as opening it.
- **No price while `prices_public` is off** (D-21, D-94, D-101): no amount on any My IIIC page or message, and no invoice PDF offered until prices are public (D-118).
- **Previews act on nothing** (D-102, D-108): previews share production's database, so a preview sends no code, starts no session and reads no account (D-122).
- **Never invent a fact.** The account notice, the consent wording and the WhatsApp template's approval are IIIC's (I-65, I-66); until they exist the step that needs them shows its placeholder and refuses. Copy is drafted to `VOICE.md`, checked with `/copy-check`, and marked as candidate copy until IIIC approves it (I-41).
- Results, not thrown strings; Zod at every boundary; `server-only` for every module that reads the database or a secret; times stored in UTC and shown in IST; phones in E.164; logs carry outcome codes only, never an address, a code, a name or a session token.

## 2. Scope, and what is left for later

**In this piece:** sign-in by email code; sign-in by WhatsApp code, built and tested but off until the provider and its authentication template exist (D-126); the account and its link to `people`; attaching earlier records by verified email or mobile; My IIIC's overview, bookings (with reschedule and cancel within policy), documents (certificates), invoices, and privacy (consents, marketing preferences, requests about one's data, contact details, devices, closing the account); the owner's acts on an account in the admin; the messages A1 to A3.

**Left for the pieces that build them** (`10`, Release 2): the Map and its history (`/account/map`, item 1), the course and progress (`/account/learning`, item 3), stories and their withdrawal from My IIIC (item 5), bridges with the "No, thanks" memory and the next recommended step (item 6; D-18), the Team Map (item 7). Their sections are left off My IIIC rather than drawn empty, as D-58 does for the site (D-124). Proposals stay on their tracked link (D-93) and are not listed in Documents yet (D-124). A booking made while signed in still goes through M3's flow as a guest; prefilling it from the account is a later change to `src/components/booking/` (`12` §9, redundant entry). SMS stays out (D-08).

## 3. Better Auth beside Payload

### 3.1 The version

`better-auth` **1.7.27**, pinned exactly, the version `15` names as current (22 November 2026) and the latest release on 24 November 2026; `kysely` **0.29.9**, pinned to the version Better Auth resolves, for its Postgres dialect. Its email-OTP plugin keeps codes hashed, counts tries atomically and offers a server-only call that returns the code to the caller (§4.3); its phone-number plugin does the same for WhatsApp, with one gap (§3.4). Upgrades go on a branch with the full suite, as Payload's do, and the schema test (§3.3) fails when an upgrade changes the tables.

### 3.2 Where its tables live

Better Auth keeps four tables, in a Postgres schema of their own, **`customer_auth`** (`CUSTOMER_AUTH` in the contract): `users` (the verified email or mobile; no name, no image), `sessions` (token, expiry, user agent; no IP address, §3.4), `identities` (Better Auth's "account" table: no passwords, and empty until "Continue with Google" is built, §16), and `verifications` (codes, hashed, under hashed identifiers). Not Supabase's `auth` schema, which belongs to Supabase's own sign-in service. A schema of its own keeps Payload's generated migrations from ever seeing these tables (Payload diffs its own snapshot, not the database) and keeps them out of Supabase's Data API, which exposes no new schema unless asked (`12` §5).

The link to the rest of the platform is Payload's `accounts` collection (`04` `accounts`): one row per account, holding Better Auth's user id (`authUserId`, unique) and the account's own `people` record (`person`, unique). Every earlier record the account holds points at it through `people.account` (§6). Payload owns everything a person's record, bookings and consents need; Better Auth owns only who may sign in and their sessions.

### 3.3 How the tables are created and migrated

The repository runs Payload migrations only, and schema push is off. Better Auth's tables come in a **blank, hand-written migration**, `r2a_customer_auth`, made right after the generated `r2a_accounts`, in the way `bookings_no_overlap` (D-84) and the audit log's trigger (D-43) came: never edited, and a change is a new migration.

- **The SQL is Better Auth's own, not typed by hand.** Builder A writes `src/scripts/print-customer-auth-sql.ts` (`pnpm payload run`), which builds the auth options of §3.4 against an empty local database and prints `getMigrations(options).compileMigrations()`: `CREATE SCHEMA IF NOT EXISTS "customer_auth"`, the four tables with Better Auth's column names, types (`text` ids, `timestamptz`, `boolean`), keys (`sessions.userId` and `identities.userId` referencing `users.id`, on delete cascade), unique columns (`users.email`, `users.phoneNumber`, `sessions.token`) and indexes (`sessions.userId`, `identities.userId`, `verifications.identifier`). Builder A staged that output beside the auth code; at the join it went word for word into the blank migration made with `pnpm migrate:create r2a_customer_auth --force-accept-warning` right after `r2a_accounts` (so its snapshot is `r2a_accounts`' and it generates nothing of its own), with `down` dropping the schema, and the staged copy was removed. The staged SQL still equalled Better Auth's printed output when it was moved.
- **The migration adds the grants** the app's own role needs (D-43): `REVOKE ALL ON SCHEMA customer_auth FROM PUBLIC`, then, when `iiic_app` exists, `GRANT USAGE ON SCHEMA customer_auth TO iiic_app` and `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA customer_auth TO iiic_app`, in a `DO` block as the audit log's migration does. Nothing in the repository creates `iiic_app`, and CI and a local Postgres run as `postgres`, so the block is skipped wherever the role does not exist yet: whoever creates the role later grants it what the runbook lists ("The app's own database role"), on `customer_auth` and on public's `accounts` and `sign_in_requests`, or sign-in breaks the day `DATABASE_URL` switches to it. A grant on all tables covers only the tables that exist, so a table Better Auth adds later needs its own. Only the schema statement, the revoke and the grants can run twice, and `migrate:fresh` drops only `public`, so it is never used on a database that has run this migration.
- **Tests hold the migration.** The integration test `accountsAuthSchema.int.spec.ts` runs the migrations on the test database, then Better Auth's `getMigrations` with the same options, and expects nothing to be created, added or indexed: an upgrade or an option that needs another column fails CI until a new migration adds it. The unit test `accountsSignInSchema.spec.ts` holds only the placed file's shape (the four tables in `customer_auth`, their keys and indexes, the grants, the way down, its place right after `r2a_accounts`); it no longer compares the file with Better Auth's printed SQL, which would fail for good after an upgrade even once a correct follow-up migration exists (the join's ruling 12).
- The app never runs Better Auth's `migrate` and never calls `getMigrations().runMigrations()` outside that script's printing.

### 3.4 The instance

`getAuth()` in `src/lib/accounts/auth/instance.ts` (builder A, `server-only`) builds Better Auth once per server, after `getPayload()`, with these options:

| Option | Value | Why |
| --- | --- | --- |
| `secret` | `BETTER_AUTH_SECRET` | Unset: sign-in is closed here (§4.9) |
| `baseURL`, `trustedOrigins` | `env().siteUrl`, `env().allowedOrigins` | The site's own origin, the previews' included; `BETTER_AUTH_URL` is not read |
| `database` | `{ dialect: new PostgresDialect({ pool: payload.db.pool }), type: 'postgres', schemaName: 'customer_auth' }` | Payload's own pool (`max` 3, `12` §4): no second pool per function |
| `user`, `session`, `account`, `verification` | `modelName` `users`, `sessions`, `identities`, `verifications` | §3.2 |
| `verification.storeIdentifier` | `'hashed'` | No address in plain text in `verifications` |
| `emailAndPassword`, `socialProviders`, `account.accountLinking` | off | Codes only (`03` F7: no passwords); Google and passkeys come before accounts open (§16, D-137) |
| `session` | `expiresIn` 30 days, `disableSessionRefresh: true`, `cookieCache.enabled: false`, `freshAge: 0` | D-115: thirty days from sign-in; a revoked session ends at once. Better Auth's own freshness rule would refuse the devices list a day after sign-in, so it is off: the platform asks for a recent sign-in itself where it matters (`requireAccount`'s `recentMinutes`, D-121) |
| `advanced.cookiePrefix` | `iiic-account` | §10 |
| `advanced.useSecureCookies` | true when the site URL is https | `__Secure-` names |
| `advanced.defaultCookieAttributes` | `httpOnly`, `sameSite: 'lax'`, `path: '/'` | §10 |
| `advanced.ipAddress.disableIpTracking` | true | A session keeps no IP address; the devices list names the browser only |
| `rateLimit.enabled` | false | Better Auth's limiter guards its HTTP routes, which are not mounted; the limits are the platform's (§4.8) |
| `telemetry.enabled` | false | And `env.ts` refuses `BETTER_AUTH_TELEMETRY` (D-117) |
| `logger` | the platform's, level `error`, message only | Better Auth's arguments can carry an address; none is logged |
| `plugins` | `emailOTP`, `phoneNumber`, IIIC's server-only plugin, `nextCookies()` last | below |

- **`emailOTP`**: `otpLength` 6, `expiresIn` 600, `allowedAttempts` 5, `storeOTP: 'hashed'`, `resendStrategy: 'rotate'`, `disableSignUp: true` (users are made only by IIIC's plugin, after the consent), `generateOTP` returning `ACCOUNTS_TEST_CODE` where it is set (CI only), `sendVerificationOTP` unused (the code is sent by the platform, §4.3) and failing loudly if anything calls it.
- **`phoneNumber`**: `otpLength` 6, `expiresIn` 600, `allowedAttempts` 5, `phoneNumberValidator` the platform's E.164 check (`src/lib/phone.ts`), `sendOTP` handing the code to the platform's sender (§4.3), no `signUpOnVerification` (an account is made by IIIC's plugin after the consent, §4.5). **The gap:** 1.7.27's phone plugin stores a WhatsApp code in plain text for its ten minutes (the email plugin hashes it); the identifier is hashed, the tries are counted, and the code is never logged. Accepted while WhatsApp is off, and checked again when it is switched on (D-117).
- **IIIC's plugin** (`src/lib/accounts/auth/plugin.ts`): five server-only endpoints (`createAuthEndpoint.serverOnly`, never reachable over HTTP), each a few lines on Better Auth's own internal adapter and cookie helpers: `startSession({ userId, trusted })` (a session, with `dontRememberMe` when the device is not kept, and its cookie; then the session the request's own cookie carried, if any, is ended, §4.7, D-130), `createCustomer({ channel, value })` (a user with the proven email, or the proven mobile and a placeholder address of the form `wa-<digits>@accounts.invalid` that is never written to), `addDetail` (a second proven detail on the user, §4.6), `forgetCode({ channel, value })` (deletes the identifier's code, for "a new code replaces the old" and for using up a code that was checked) and `codeTries` (how many wrong tries the current code has used, so the code step can say how many are left).
- **Better Auth's HTTP handler is not mounted.** There is no `/api/auth/*` route and no client SDK in a bundle: every call is `auth.api.*` from the platform's server actions and server components. Fewer public endpoints, CSRF covered by Next.js's own origin check on server actions, and no Better Auth script on the public pages' 170 KB budget (D-79).

### 3.5 Reading the session in App Router code

- `getAccountSession()` (`src/lib/accounts/session.ts`, builder A; the contract's `GetAccountSession`): wrapped in React's `cache` for one request; answers null at once on a preview, while `accountsEnabled` is off or while `BETTER_AUTH_SECRET` is unset; otherwise `auth.api.getSession({ headers: await headers() })`, then the `accounts` row by `authUserId` and its person, and returns `AccountSession`. A Better Auth user with no account row is no session (the account step was not finished; §4.5).
- `requireAccount({ next, recentMinutes })`: the session or `redirect('/login')`, with `next` kept only when it is a path under `/account`. With `recentMinutes`, a session older than that sends the person to sign in again first (D-121).
- Server components read; server actions write. Server components never set cookies, which is why sessions do not slide (`disableSessionRefresh`): the cookie written at sign-in is the cookie for the session's life.
- The pages under `/account` and `/login` read cookies, so Next.js renders them per request with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, which `12` §1 asks for; a headers test holds it (§11).

### 3.6 The account and the person

An account has one **own record**: the `people` record that holds its verified email or mobile (`emailVerifiedAt`, `mobileVerifiedAt`, set by the server only, and unique when verified: `oneVerifiedPerson`). It is, in this order (D-131): the earlier record that already holds the detail proven, whatever name was typed, since only one record may (`oneVerifiedPerson`): the own record of an account closed earlier, whose markers stay, or the record the newsletter made when the person confirmed the Journal; else the newest earlier adult record holding the detail that no account holds, when its name is the one the person typed (spaces and capitals aside); else a new record with the name typed (§4.5). The newsletter's placeholder name ("Newsletter subscriber", `src/lib/newsletter/subscriptions.ts`) counts as no name: it is never offered at the account step, and an own record that carries it takes the name typed. Any other name is never changed: when the person types another, theirs is a new record, for the office to merge if they are one person (`05`, People). The other earlier records holding the detail are **attached** (§6) either way. Bookings, consents, payments and certificates keep pointing at the records they were made with; nothing is moved or merged, and the office still merges duplicates by hand (`05`, People).

## 4. Signing in

### 4.1 The steps, and what the person sees

| Step | Route | The person sees | On submit |
| --- | --- | --- | --- |
| 1 Address | `/login` | "Sign in to My IIIC"; one form with "Email address" (`type=email`, `autocomplete=email`) and "Send me a code"; when WhatsApp codes are open (§4.3), a second form under the heading "Or use WhatsApp" with "Mobile number" (`type=tel`, `autocomplete=tel`, +91 assumed) and "Send a code on WhatsApp"; a line linking the account notice (I-65); Turnstile where its keys are set | The server action validates, checks the deployment, the flag, Turnstile and the limits, writes the `sign-in-requests` row, sends the code (§4.3), sets the sign-in cookie and answers `303` to `/login/verify` |
| 2 Code | `/login/verify` | "Enter your code"; "If a••••@gmail.com can receive our messages, a six-digit code is on its way. It works for 10 minutes."; "Six-digit code" (`inputmode=numeric`, `autocomplete=one-time-code`, pasting allowed); "Keep me signed in on this device for 30 days", unticked; "Sign in"; "Send a new code" (a form of its own, answered with the time to wait when it is too early); "Use a different address" | Right code, account exists: a session, then `303` to `next` or `/account`. Right code, no account: step 3 on the same route. Wrong: the error, with the tries left |
| 3 Account (new address only) | `/login/verify` | "Create your My IIIC account"; "Full name" (the newest earlier record's name filled in, if one carries a name the person gave; never the newsletter's placeholder, §3.6); the account notice in force beside an unticked box (D-113); "I am 18 or older", unticked (D-114); "Create my account" and "No, thanks" of equal weight | The consent, the person, the account, Better Auth's user, the session, the attachments (§4.5), then `303` to `/account`. "No, thanks" clears the sign-in cookie and stores nothing |

- **Errors.** Each step shows the kit's error summary at the top, linked to its field, and the message beside the field; focus moves to the summary when it appears and to the step's heading when a step opens (a small client component, as the newsletter's `FocusOnArrival`). Every message says what to do: "That code doesn't match. You have 3 tries left.", "That code has run out. Send a new code.", "That code had five wrong tries and no longer works. Send a new code.", and for a mobile number while WhatsApp codes are not open, "Codes on WhatsApp cannot be sent just now. Use your email address instead." That line names no hours, because it has three causes: the WhatsApp channel not set up, the authentication template not approved, or quiet hours (§4.3); naming 8 AM to 9 PM would be wrong for the first two. The words are candidate copy (I-41), as the code has them (`src/lib/accounts/signIn/copy.ts`).
- **Without JavaScript** every step works: the forms post to server actions with progressive enhancement and the server answers with a redirect or the page with its errors (`12` §4). Turnstile is the exception, as on the enquiry forms (D-92): where its keys are set, a browser without JavaScript is told it needs JavaScript for the check, or to write to the office.
- **Accessible authentication** (`12` §9; WCAG 2.2): no puzzle, the code can be pasted and autofilled, nothing times out on the page itself (the code's ten minutes are stated, not counted down), the step is named in the title (`Enter your code · My IIIC`), targets are the kit's.
- `/login` while already signed in: on to `next`, else `/account` (Next.js's `redirect` from a server component answers `307`; the server actions answer `303`), unless the page was asked to sign in again (D-121). The sign-in cookie (§10) carries the attempt between the steps; the address never appears in an address bar or a log.
- **Where a sign-in lands.** A person whose account exists goes back to the page that sent them to sign in (`next`, kept only when it is a path under `/account`, §3.5), else to `/account`. A new account always lands on `/account`, whatever `next` the address step carried: the overview is where a first visit starts, and nothing is lost, since every My IIIC page is one link from it. Accepted at the join (25 November 2026); a later change is small (the attempt already holds `next`).

### 4.2 The code

Six digits (D-08), from Better Auth's generator; ten minutes (`03` F7); five tries per code, the fifth wrong one ends it (`03` F7, `08` §9); a new code replaces the old one (`forgetCode` before the new one is made, and Better Auth's `rotate`), so only the latest works; a code that signed someone in, or proved an address for the account step, is used up. Email codes are stored hashed; WhatsApp codes as §3.4 says. Neither is ever logged, written to a message row, a job or the sign-in cookie.

Step 2 always checks the code with Better Auth, which counts the tries and ends the code at the fifth wrong one: `auth.api.checkVerificationOTP` for email (it puts a right code back for a follow-up call, so the action spends it at once with `forgetCode`; for an address with no Better Auth user, 1.7.27 answers `USER_NOT_FOUND` only after the code has passed, and the action reads that answer as a proven address: a unit test on the installed version holds that order, and an upgrade that changes it fails), `auth.api.consumePhoneNumberOTP` for WhatsApp (it spends it, and looks up no user). Then, for an address whose account exists, `startSession` signs the person in, trusted or not as ticked; for one with none, the sign-in cookie records that the address was proven and step 3 follows. One path for both channels, no Better Auth user before the consent, and the code never kept anywhere for the next step.

### 4.3 Channels, through the M6 messaging core

Both channels go through the core's one entry point, **`deliver(req, planned, { transient })`** (`src/lib/messaging/deliver.ts`; contract `Deliver` in `src/lib/messaging/operations.ts`), which writes one `messages` row (no address, no body) and, outside a transaction, tries it at once (`tryMessage`, `src/lib/messaging/try.ts`). The code and the address travel in `transient` (`DeliverOptions`), which the core hands to the first try only and never writes to the row, the job queue or a log (docs/19 §14 already uses it for the proposal's tracked link). A retry has no `transient`, so the template's `load` answers `stale` and nothing is sent twice: the person asks for a new code.

- **Email**: the action asks Better Auth for the code with the server-only `auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } })`, which stores it hashed and returns it, then calls `deliver` with automation `A1`, template `account-sign-in-code`, channel `email`, no fallback, recipient `{ kind: 'signIn', id: <sign-in-requests id> }`, subject `{ collection: 'sign-in-requests', id }`, `sendAt` now, `sendBefore` the code's expiry, and `transient: { address, code }`.
- **WhatsApp**: the same, with channel `whatsapp`, through the phone plugin's `auth.api.sendPhoneNumberOTP`, whose `sendOTP` callback receives the code and calls `deliver` with the request and the row the action set in an `AsyncLocalStorage` (`node:async_hooks`) for that call. The template is Meta's **authentication** category: Meta's fixed words with the code and a copy-code button, so IIIC writes nothing in it (I-66).
- **When WhatsApp codes are open**: the core's WhatsApp channel is configured (`channelsFor`), the authentication template is approved in `message-templates`, the time is outside quiet hours (`readQuietHours`, `inQuietHours`; D-103), and `accountsEnabled` is on. Otherwise `/login` shows email only, and a mobile typed elsewhere is answered `whatsapp-closed` with the email form. Quiet hours hold for codes too until IIIC decides otherwise (D-123).
- The core's other checks apply as for every message: the A1 switch (an owner can pause sign-in codes in an emergency), the suppression list for the address (a bounced address gets nothing, and the answer to the person is the same), the channel's set-up, no price, no placeholder in production.
- **The hooks the core needed** for a recipient with no `people` record, H2 to H6, have landed (§12): a `signIn` recipient whose address comes only from the first try. The three templates themselves are builder A's (`src/emails/accounts/`, a stub until then).

### 4.4 No account enumeration

- Step 1 answers the same page, with the same words and the same masked address, whether the address has an account, earlier records, a suppression, or nothing; the row is written and the code made in every case; the send happens through the same call. Its timing is the same to within the core's own variance (the email is sent after the row commits, as for every message).
- The limits (§4.8) count what was typed, not whether it exists, so "too many" says nothing about an account either.
- Only after a right code does the person learn whether an account exists (step 3 or not), and they have just proved the address.
- `/login/verify` without a sign-in cookie answers "Start again" and nothing else.

### 4.5 A new account, in order

At step 3, in one Payload transaction, then Better Auth, then the link. The consent comes before anything is stored for good (CLAUDE.md #4; D-113): a consent row names its person, so a new person row is written first, but inside the same transaction as the consent, and nothing of the person, the consent or the account is kept unless all of them are; Better Auth's user is made only after that transaction commits, so a failure part-way leaves nothing that signs anyone in:

1. Check the sign-in cookie: a proven address, within its fifteen minutes; the notice shown is still the account notice in force (`currentNotice('account', 'en-IN')`), else draw the step again (`notice-changed`); no earlier record of this address says under 18 (D-114).
2. In one transaction, in this order (`createAccountRecords`, `src/lib/accounts/lifecycle.ts`): the own record found (§3.6), or, when there is none, a new `people` record with the name, the address, `language` en-IN and `source` "My IIIC"; the account consent on it (`consents`, purpose `account`, the notice version, channel `web`, evidence the form `/login/verify`, the IP address and browser the server read, `grantedAt` now); the `accounts` row with `person` and an empty `authUserId`; the own record linked to the account and given the verified marker (and `ageBand` adult unless the office set one, and the name typed when it carries only the newsletter's placeholder); `create-account` in the audit log. If any write fails, the transaction rolls back: no new record, no consent, no account, and an earlier record as it was. A unit test makes the consent write fail and finds none of them and no Better Auth user (`tests/unit/accountsOwnRecord.spec.ts`), and an integration case does the same on the database.
3. Better Auth's user (`createCustomer`) and the session (`startSession`, trusted or not as ticked); `accounts.authUserId` set; `sign-in` in the audit log.
4. The earlier records attached (§6).

If step 3 fails after step 2, the person has a consent, a record and an account with no user: the next right code for the address finds the account by its own record's verified detail and finishes it. A Better Auth user with no account row is never a session (§3.5).

### 4.6 A second detail

From My IIIC (§7.5) a person adds the detail they did not sign in with: an email to a WhatsApp account, or a mobile to an email account once WhatsApp codes are open. The same code machinery runs (`RequestDetailCode`, `ConfirmDetail`; purpose `addDetail` in `sign-in-requests`, the same limits); a right code updates Better Auth's user first (the email, or `phoneNumber` with `phoneNumberVerified`), so that a detail Better Auth cannot take is never marked; then marks the detail verified on the account's own record and writes `add-contact-detail`, in one transaction; then attaches the records holding it (§6) and sends A3 to the detail held before. A detail already verified on another account answers `belongs-to-another-account` after the code (the person has proved it), with the office's address to sort it out; nothing is moved between accounts on its own (D-120).

### 4.7 Sessions, devices and signing out

- A session lasts thirty days from sign-in on a device the person keeps (`03` F7); otherwise it ends when the browser closes, and after a day at most on the server, Better Auth's own `dontRememberMe` path (D-115). It never slides.
- **Signing in again** ends the session the browser carried. "Sign in again" before closing, a copy or an erasure (D-121), or any sign-in from a browser that still holds a session, starts a new session and then ends the one whose cookie the request carried (`startSession`, §3.4): the new cookie replaces the old in that browser, so the devices list shows it once and nothing is left alive for a cookie no browser holds. Other devices' sessions are not touched (D-130).
- "Sign out" (every My IIIC page) ends this session (`auth.api.signOut`) and clears its cookies. "Sign out everywhere" (§7.5) ends every other session (`auth.api.revokeOtherSessions`), audited as `sign-out-everywhere`. "Devices" lists the sessions (`auth.api.listSessions`) by browser and system from the user agent, when each began and ends, and which is this one; never an address.
- An owner ends every session of an account (`EndAccountSessions`, `VIEW_POLICY.accountActions`, the two-factor code), audited as `end-account-sessions` (D-125). Today that is the endpoint `POST /api/accounts/:id/end-sessions`, which checks the staff user, the code and the owner role, then refuses a preview, before it reads anything; the admin control that calls it is on the "before accounts open" list (§14). Closing an account or an erasure ends them too (§7.6).

### 4.8 Rate limits and Turnstile

- **Per address typed**: one code a minute, five an hour, ten a day; **per network address**: twenty an hour; **across the site**: 120 codes in ten minutes, past which `/login` says it is busy and to try again shortly, as the newsletter's signup now does (A6), so a burst from many network addresses cannot make the platform mail strangers in bulk (`SIGN_IN_LIMITS`; D-116). Counted from `sign-in-requests` rows: the address as an HMAC under a key derived from `BETTER_AUTH_SECRET` for this alone, the network address as the day's keyed hash the enquiry forms use (`submitterHash`, `submitterHashesWithin` in `src/lib/enquiryForms/guards.ts`). A refused request writes nothing and counts for nothing, as D-92 and D-108 do. Past a limit the person reads when they can ask again ("We've sent several codes to this address. Use the latest, or ask again after 4:35 PM."), and the office's address.
- **Wrong codes**: five per code (Better Auth), and with ten codes a day at most, fifty guesses a day per address: one chance in twenty thousand of guessing a six-digit code in a day.
- **Turnstile** on step 1 where both keys are set, checked on the server with the existing `siteverify` (`src/lib/enquiryForms/turnstile.ts`) before anything is stored. Steps 2 and 3 need the sign-in cookie, which only step 1 sets.
- Locally and in CI the limits stay on, but `ACCOUNTS_TEST_CODE` fixes the code; the suite uses a fresh address per test. Vercel's firewall rule on `/login/*` comes with the move to Pro (D-109, `12` §5).
- `sign-in-requests` rows are purged after 48 hours, with Better Auth's expired sessions and codes, by the nightly O5 (`purgeSignIns`, builder A; hook H9).

### 4.9 Previews, the flag and the secret

| Where | `/login` | `/account/*` | Codes, sessions |
| --- | --- | --- | --- |
| `accountsEnabled` off (any deployment) | 404 | 404 | None; the header shows no "Log in" |
| A Vercel preview | "Sign-in is closed on this preview." No form | `303` to `/login` | None: actions answer `closed-here` before reading input, `getAccountSession` answers null without reading anything (D-122) |
| Production or local, `BETTER_AUTH_SECRET` unset | "Sign-in is not open yet." No form | `303` to `/login` | None |
| Production, local or CI, all set | The steps | My IIIC | Yes |

`accountsEnabled` is the `settings` flag `04` and `12` §8 already name (`src/lib/settings/flags.ts`), off by default; an owner turns it on at Release 2's launch.

### 4.10 Under 18

My IIIC accounts are for people of 18 or older (D-114): `08` §3 needs a guardian's verified consent before a child's data is stored, which the platform cannot check yet, and D-87 already books an under-18 session in the parent's or guardian's own name. Step 3 asks "I am 18 or older" (an unticked box that must be ticked to go on; not a consent); an earlier record whose age band is under 18 is never the account's record and never attached (§6), and an account is refused for its address with "My IIIC accounts are for adults. A parent or guardian can book and sign in for their child." No marketing consent is offered to anyone whose record says under 18 (`06`, Engine rules), and no analytics event is recorded about a signed-in person (§8).

## 5. Routes

| Route | Slice | What | Reads |
| --- | --- | --- | --- |
| `/login` | A | Step 1 (§4.1); on to `/account` when signed in (§4.1) | the flag, the WhatsApp channel's state |
| `/login/verify` | A | Steps 2 and 3 | the sign-in cookie, the account notice |
| `/account` | B | Overview: the person's first name, their next booking as a ticket with its actions, the sections; the scope statement and crisis numbers when a counselling booking is shown | own bookings |
| `/account/bookings` | B | Upcoming and past bookings | own bookings |
| `/account/bookings/[ref]` | B | One booking as its confirmation shows it; "Add to calendar"; reschedule and cancel within policy (§7.2); "Not your booking?" (§7.2) | own booking, its service's rules |
| `/account/bookings/[ref]/invite.ics` | B | The booking's `.ics`, from M3's builder, `private, no-store` | own booking |
| `/account/documents` | B | Certificates: ID, programme, completion day, status, the verification page, the PDF | own certificates |
| `/account/documents/certificates/[id]/pdf` | B | The certificate's PDF from the private bucket, audited | own certificate |
| `/account/invoices` | B | Invoices and credit notes: number, kind, day, status; no amount while prices are hidden | own invoices |
| `/account/invoices/[id]/pdf` | B | The PDF, audited; only while `prices_public` is on (D-118) | own invoice |
| `/account/privacy` | C | Consents and marketing preferences, requests about your data (opened as a correction naming a booking from "Not your booking?"), contact details, devices, the way to close the account (§7.5) | own consents, requests, sessions; the named booking by reference |
| `/account/privacy/contact` | C | Adding the missing email or mobile with a code (§4.6); the second detail's cookie lives on `/account` (§10) | the second detail's cookie |
| `/account/privacy/close` | C | Closing the account: what closing does and keeps, "Close my account" and "No, thanks", after a sign-in within ten minutes (§7.6; D-121) | the account notice in force |
| `/account/privacy/closed` | C | The page closing leads to, readable signed out; the 404 while `accountsEnabled` is off, and a signed-in person is sent to `/account/privacy` | the flag, the session |

All are under `PRIVATE_ROUTES` already (`src/lib/security/headers.ts`: `/account/:path*`, `/login/:path*`; D-67), so they are never indexed, never in the sitemap and kept from the training crawlers. The `(account)` route group (`src/app/(platform)/(account)/`) has its own layout: the site's frame in the default register with My IIIC's section links (Overview · Bookings · Documents · Invoices · Privacy) and "Sign out"; `/login` lives in the `(default)` group. The site header shows "Log in" (`02`, Navigation) only while `accountsEnabled` is on; it does not read the session, so public pages do no more work than now, and `/login` sends a signed-in person on to `/account`.

## 6. Attaching earlier records

`03` F7: "A booking made without an account is attached to the account with the same verified mobile or email." M3 makes a new `people` record for every booking (`src/lib/bookingFlow/people.ts`: "the details are not verified yet, so the office merges records"), so a returning client has several. Attaching (`AttachEarlierRecords`, builder A; D-120):

- **When**: after a code proves a detail (a sign-in, a new account, a second detail), and when a `people` record is created holding a detail an account has verified (a hook on `people` create, builder A), so a booking made later shows at once.
- **Which**: every `people` record whose `email` (an email code) or `mobile` (a WhatsApp code) equals the proven detail, that holds no account yet, and whose age band is not under 18. A record already attached to another account stays there.
- **How**: `people.account` set to the account, by the server, in one transaction, with one `attach-records` audit entry naming how many (the audit plugin also logs each record's change by field name). Bookings, consents, payments, invoices and certificates are not touched; nothing is merged.
- **What it shows**: My IIIC reads through `OwnPersonIds` (the account's own record and every attached one), so the person sees the bookings, certificates, invoices, consents and requests of all of them.
- **The shared address**: an email shared by two people (a family's) attaches both people's records to whoever signs in with it. That person already receives every message about those bookings at that address, so My IIIC shows nothing the mailbox did not; counselling bookings show only what their confirmation shows. Accepted for the lawyer to confirm (I-67). "Not your booking?" on a booking sends a correction request naming it (§7.5) and an owner detaches the record from the account (`DetachRecord`, `VIEW_POLICY.accountActions`), audited as `detach-record`: today through the endpoint `POST /api/accounts/:id/detach`, never on a preview; the admin control that calls it is on the "before accounts open" list (§14).

## 7. My IIIC

### 7.1 The overview (`/account`)

A heading with the person's first name from their own record; their next upcoming booking as a ticket (`.iiic-ticket`), with "Add to calendar" and "Change or cancel"; the sections with one line each; an empty state that says plainly that bookings made with this email or mobile appear here. `02` names "Next recommended step" as the main action: nothing is recommended in this piece, because a recommendation is a bridge and bridges come with their own rules (D-18, D-124).

### 7.2 Bookings

Upcoming (soonest first) and past (latest first) from every own record, as `AccountBooking` (reference, service, IST date and time, format, place or link, practitioner's public name, status). A booking's page shows what its confirmation shows (`viewBooking`, M3), and for a counselling booking the scope statement and the crisis numbers.

- **Reschedule and cancel** within the service's policy (`ManageOwnBooking`): the same rules as the manage link (`03` F4; `/b/[token]`), by calling M3's `rescheduleBooking` and `cancelBooking` (`src/lib/booking/changes.ts`) in a transaction with `by: 'client'` and `asker: 'client'`, after the ownership check, as `src/lib/booking/api.ts`'s token branch does; the refund rule, B7's messages, the calendar and the `.ics` follow as they do for the link. Free times come from M3's `listSlots`. Outside the window the page says how to reach IIIC, as `/b/[token]` does. While prices are hidden a refund is described without its amount (D-101).
- **"Not your booking?"** opens the correction request (§7.5) with the booking named, and hides nothing on its own.

### 7.3 Documents

Certificates (`AccountCertificate`) from every own record: the ID, the programme, the completion day, Valid or Revoked, a link to the public verification page by ID (`/institute/verify?id=`), and the PDF for a valid one through `/account/documents/certificates/[id]/pdf` (`DownloadOwnDocument`): the session, then the certificate's person among the account's records, then the PDF from the private bucket (`certificateStoreFor`, M5), with `download-certificate` written to the audit log (actor `account:<id>`) before the file is handed back, `Cache-Control: private, no-store`, `Content-Disposition: attachment`. A revoked certificate has no download. Proposals are not listed here yet (D-124).

### 7.4 Invoices

Invoices and credit notes of the account's bookings (`AccountInvoice`): Zoho's number, the kind, the day, the status. While `prices_public` is off there is no amount and no PDF; the page says the PDF comes on request by replying to the receipt email (B3's words). Once prices are public, the total shows and the PDF downloads through `/account/invoices/[id]/pdf` with `download-invoice` audited, as `src/lib/invoicing/download.ts` does for finance (D-118).

### 7.5 Privacy (`/account/privacy`, builder C)

- **What you have agreed to**: every purpose of the account's records with its state and the day it changed (`ListOwnConsents`), the same list the withdraw page shows (`/w/[token]`, docs/19 §8). Each consent in force has its own "Withdraw" button, which records a withdrawal through `withdrawPurpose` (`src/lib/newsletter/withdrawals.ts`, the withdraw page's own) for each record that holds it, channel `web`, evidence "My IIIC"; a withdrawal of the consent to publish a testimonial takes reviews down at once, as the ledger already does (V2). Withdrawing the account consent is closing the account, and leads there.
- **Messages from IIIC**: the Journal by email (`marketingEmail`) and, once WhatsApp is open, updates on WhatsApp (`marketingWhatsapp`), each with the notice in force beside an unticked box and its own button (`GiveConsent`; D-119). Giving the Journal's consent also adds the account's verified email to the newsletter as confirmed (the address is already proven, so no second confirmation email): the consent first, then the `subscribers` entry (confirmed, linked to the consent and the person, source "My IIIC"), then `newsletter.confirmed` once, as `/api/newsletter/confirm` does, so N2 welcomes them; an account with no verified email is offered it after adding one. Purposes for features not built yet (the Map, suggested programmes) are never offered, only withdrawn if held. Nothing is offered to a record under 18. A consent posted that My IIIC does not offer now (no notice in force, a record under 18, no verified detail for its channel, WhatsApp not set up) is answered `not-offered` with a line of its own, and nothing is recorded (D-135).
- **Ask about your data**: access (a copy), correction, erasure, nomination, a privacy grievance or a consumer complaint (`CreateOwnRequest`), with a short text of up to 2,000 characters, the one limit the contract and the `data-requests` collection share (D-135). It is recorded as a `data-requests` entry for the account's own record, channel `web`, received now, with the identity check the session's code gave (`verificationMethod` `oneTimeCode`, `verifiedAt` now); M5's rules start it as received with its clocks, M6's O4 or O7 acknowledges it, and the office moves it on. A copy or an erasure asked here must reach every record of the account, since the page shows all of them as the person's; today the export and the erasure plan read the own record alone, so that is first on the "before accounts open" list (§14; D-138). Access and erasure need a sign-in within ten minutes (D-121). One open request of each kind at a time. The page lists the account's requests with their state and the day each is due; the office answers as for every request (`05`, Privacy).
- **Your contact details**: the verified email and mobile, and "Add" for the missing one (§4.6). "Add a mobile number" shows only while WhatsApp codes are open (§4.3), so it is hidden during quiet hours too, as well as before the channel and its template exist; accepted at the join (25 November 2026), since it cannot show at all before WhatsApp codes open (D-126). Under the request form, "Not your booking?" on a booking's page (§7.2) opens this page with the request set to a correction and, when the booking is one of the account's own, its reference in the details; when that booking is counselling, the page offers no message and ends with the scope statement and the crisis numbers (`08` §7).
- **Devices**: the sessions, "Sign out everywhere" (§4.7).
- **Close your account**: what closing does and keeps, then "Close my account" and "No, thanks" at equal weight, after a sign-in within ten minutes (D-121).

### 7.6 Closing an account

`CloseAccount` (builder A): Better Auth's user goes, with its sessions and codes; every record is detached (`people.account` emptied) and the own record's verified markers stay; the account consent is withdrawn when the person closes it, with the evidence of their request (form, address, browser), and an erasure has withdrawn it already, while a `staff` close withdraws nothing today, since nothing calls it and the ledger takes no channel `web` from staff, and is decided when something first does; the `accounts` row is deleted; `close-account` is audited; A2 confirms by email when the person closed it. Bookings, payments, invoices, certificates and the other consents stay the office's, under their retention (`04`), and the page says that an erasure request removes the rest. An owner's erasure closes the account whose own record it erases, and detaches an erased record from any other account, in its own transaction (`CloseAccountsOfPerson`, hook H7; it lists the account in the erasure's plan).

## 8. Access and the audit log

**A customer reads only their own records.** Every My IIIC function takes the `AccountSession` and starts from `OwnPersonIds`; every query adds `person in <own ids>` (or, for an invoice, its booking's person), reads with `overrideAccess: true` and `depth: 0` and a `select` of the fields shown, and answers `not-found` for anything else, the same as for a record that does not exist. `overrideAccess` appears in `src/lib/accounts/**` only behind such a scope; a unit test (`accountsScope.spec.ts`) fails on a query in that folder without one, and on a spread of a constant that holds it (`...SERVER`) without a `// scope:` line of its own (D-132); a call that names no `overrideAccess` at all counts as one that holds it, since Payload's Local API defaults the flag to true; one scope line covers only the first such query after it (the join's ruling I.3); and each function has an integration test where a second account's record answers `not-found`.

**Staff** (`src/access/policy.ts`, `src/access/views.ts`): owners read `accounts` and no one writes one through the API; no one reads or writes `sign-in-requests`; `people.account` is the office's to read, the server's to write; in the admin nobody deletes the own record of an account that is open (closing comes first: the person closes it, or an erasure of the record does), and nobody changes a proven email or mobile on a record while its marker stays, since sign-in finds the account by that pair (D-134); `VIEW_POLICY.accountActions` (owner, two-factor code) for ending an account's sessions and detaching a record, through two endpoints that check the user, the code and the role, then refuse a preview, before any read (`src/collections/Accounts.ts`, `ownerAct`; D-122), while `endAccountSessions` and `detachRecord` refuse a preview again. Practitioners see nothing of accounts (D-89 holds: a client's name, mobile and email only). Better Auth's tables are read by no Payload collection and appear in no admin screen; an owner sees on an account its own record, the records attached, when it was made and its last sign-in and channel. The number of its devices is not shown: sessions are Better Auth's, and the admin control for ending them is still to come (§14).

**The audit log** (`src/lib/audit/record.ts`; actor `account:<id>`, no email, for a customer's own acts; the staff member for the owner's): `create-account`, `sign-in` (with the channel as the field changed), `sign-out-everywhere`, `attach-records`, `add-contact-detail`, `close-account`, `end-account-sessions`, `detach-record`, `download-certificate`, `download-invoice`; and, through the audit plugin, every write to `accounts`, `people`, `consents` and `data-requests` by field name. Every write a customer makes carries `account:<id>` as its actor (D-133): My IIIC's pages, routes and actions and the sign-in steps run on one request, `accountRequest` (`src/lib/accounts/scope.ts`), which has no Payload user, keeps of the browser's headers only `x-forwarded-for`, `x-real-ip` and `user-agent` (never its cookies), and puts the signed-in account on `req.context.auditActor`; the sign-in steps put it there once a code has proven the account's detail. The plugin and `recordAudit` name the request's user, else that account (`src/lib/audit/actor.ts`). Not logged: a code request (its row is the record, kept 48 hours, D-116), a wrong code, a page view of My IIIC. Logs carry outcome codes (`sign-in:wrong-code`), never the address, the code or the token.

**Analytics**: nothing about a signed-in person; `/login` and `/account` are out of the funnel's events and out of Cloudflare's beacon (`countsPath` in `src/lib/analytics/beacon.ts` gains them), as the booking confirmation and the verify pages are.

## 9. Messages

In the style of `06`; the templates live in `src/emails/accounts/` (builder A) and join the registry through hooks H4 and H5 (§12). Every one is transactional, carries no offer, bridge or price (`price: 'never'`), and has no counselling content.

| ID | Template key | Trigger | Timing | Channels | Basis | Sender, footer | Words |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `account-sign-in-code` | A code asked for at `/login` or for a second detail | At once; useless after ten minutes (`sendBefore`) | E; W (Meta's authentication template) when open (§4.3) | Transactional: the person asked for it | `hello@notify.` (replies reach `hello@`); footer `none`: it may go to an address with no record, and it is about no consent (D-123) | "Your IIIC sign-in code"; the code, that it works for 10 minutes, that IIIC never asks for it, and to ignore it if they did not ask. The code is in the body, never the subject (lock screens). WhatsApp: Meta's fixed text (I-66) |
| A2 | `account-closed` | The person closes their account | At once | E | Transactional | `hello@`; footer `withdraw` | What was closed, what IIIC keeps and why, how to ask for erasure |
| A3 | `account-detail-added` | A second detail added (§4.6) | At once | E, to the email held before (none for a WhatsApp-only account) | Transactional | `hello@`; footer `withdraw` | Which kind of detail was added (masked), and whom to tell if it was not them |

No automation is event-driven: A1 is planned by the sign-in action, A2 by `CloseAccount`, A3 by `ConfirmDetail`, each with one key per subject (`A1:sign-in-requests:<id>:email`), so a double tap sends once. Sign-in alerts for a new device are not sent in this piece (§14).

## 10. Cookies and headers

**Additions to the cookie inventory** (`12` §10, "What sets a cookie"), to be inserted by builder A with the code, word for word:

- the sign-in cookie (`iiic-sign-in`, HttpOnly, SameSite=Lax, Secure over HTTPS, path `/login`, fifteen minutes), set when a code is asked for at `/login`, holding the attempt sealed under a key of its own (the channel, the address, when the code went, whether the address was proven; never the code), so that the code step and the account step know whose code they are checking; cleared on sign-in and by "Use a different address" (`src/lib/accounts/signIn/cookie.ts`; strictly necessary, Release 2);
- the second detail's cookie (`iiic-add-detail`, HttpOnly, SameSite=Lax, Secure over HTTPS, path `/account`, fifteen minutes), set only when a signed-in person asks for a code to add an email or a mobile on `/account/privacy/contact` (§4.6), holding that attempt sealed the same way, so that the code step knows whose code it is checking; it never reaches `/login`; cleared when the code is confirmed (`src/lib/accounts/signIn/cookie.ts`; strictly necessary, Release 2; D-129);
- Better Auth's session cookie (`iiic-account.session_token`, `__Secure-` before it over HTTPS; HttpOnly, SameSite=Lax, Secure, path `/`), set only at sign-in, holding the signed session token, for thirty days on a device the person kept and otherwise for the browser session; removed at sign-out (strictly necessary, Release 2);
- Better Auth's "not kept" cookie (`iiic-account.dont_remember`, the same prefix and attributes, for the browser session), set only at a sign-in where "Keep me signed in" was not ticked, so the session is not kept past the browser's closing (strictly necessary, Release 2).

And in the same paragraph, "Better Auth's session cookie (R2, only after sign-in)" is replaced by the four items above. The cookie test (`tests/e2e/cookies.e2e.spec.ts`) adds `/login`, `/login/verify` without a cookie, and `/account` signed out to its "no cookie" pages, and a test of its own lists exactly these cookies through a sign-in and none after sign-out.

**Headers** (`12` §1, §5):

- `12` §1's dynamic row becomes "`/book/*`, `/b/*`, `/feedback/*`, `/subscribe/confirm/*`, `/login/*`, `/account/*` (R2)", `Cache-Control: private, no-store`; the headers test asserts it on `/login`, `/login/verify` and `/account`.
- **CSP: no change.** Better Auth runs on the server only, with no script, frame or connection of its own; Turnstile's script and frame are already allowed on public pages where its keys are set (`turnstileSources`, D-92), `/login` included; `form-action 'self'` covers every form. The analytics beacon is left off `/login` and `/account` (§8), which removes `static.cloudflareinsights.com` from their policy through the existing `beaconSources`.
- noindex: already on both (`PRIVATE_ROUTES`, D-67). Referrer: nothing secret is ever in an address, so the default holds.

## 11. Environment, fakes and the test plan

**Environment** (`src/lib/env.ts`, `.env.example`; done here): `BETTER_AUTH_SECRET` (optional, 32+ characters; unset, sign-in is closed), `BETTER_AUTH_TELEMETRY` (refused unless unset, `0` or `false`), `ACCOUNTS_TEST_CODE` (six digits, refused on any Vercel deployment). `BETTER_AUTH_URL` is not read. Production and Preview get `BETTER_AUTH_SECRET` from an owner; previews never act whatever they hold (D-122). Rotating the secret signs every customer out; the runbook gains that line with builder A.

**Fakes**: the messaging core's fake senders (`MESSAGING_TRANSPORT=fake`), `ACCOUNTS_TEST_CODE` for the end-to-end suite, Turnstile's fake (`fakeTurnstile`), M3's fake gateway for bookings, the certificate store's folder. Fixtures are obviously fake ("Example Client", `client@example.com`, `+91 90000 00000`).

**Tests** (each builder's beside their slice; money, privacy, consent and access cases are written while building, D-80):

| What | Level | Cases that must exist |
| --- | --- | --- |
| The foundation | unit `accountsFoundation.spec.ts` (written) | F7's numbers, access per role for `accounts` and `sign-in-requests`, no address or code in a sign-in request, `people.account` server-written, the environment's guards, the exact pin |
| Better Auth's schema | int `accountsAuthSchema.int.spec.ts` (A) | After `pnpm migrate`, Better Auth's `getMigrations` finds nothing to create, add or index; `iiic_app` reaches the schema when it exists |
| Codes and limits | unit `accountsSignIn.spec.ts`, int `accountsSignIn.int.spec.ts` (A) | The limits at their edges (the second code within a minute, the sixth in an hour, the eleventh in a day, the twenty-first from one network address); a refused request writes nothing; the same answer for an address with an account, without one, suppressed and malformed-but-valid; a fifth wrong code ends the code; a new code ends the old; an expired code; a used code cannot sign in again; Turnstile failing stores nothing; the code is in no `messages` row, job, log line or cookie (a test greps them) |
| Previews and the flag | unit (A) | Every action answers `closed-here` on `VERCEL_ENV=preview` before reading input; `getAccountSession` is null there without touching the database; `accountsEnabled` off is a 404 for `/login` and `/account` |
| A new account | int (A) | No consent, no account: nothing stored; the consent recorded before the person and the account, in one transaction; a failure after it finishes on the next code; under 18 refused; the notice changed is drawn again |
| Attaching | int `accountsAttach.int.spec.ts` (A) | Records with the proven detail attached, others not; a record of another account never moved; under 18 never attached; a later booking's record attached by the hook; nothing in bookings, consents or payments rewritten |
| Sessions | int (A) | Thirty days kept, browser-only otherwise; sign out everywhere leaves only this session; an owner's end-sessions needs the code and the owner role; closing ends them all |
| Own records | unit `accountsScope.spec.ts`, int `accountsRecords.int.spec.ts` (B) | Every function answers `not-found` for another account's booking, certificate and invoice; every query in `src/lib/accounts` is scoped; reschedule and cancel keep M3's policy and refund rule; a revoked certificate has no PDF; no amount and no invoice PDF while prices are hidden (money); each download writes its audit entry first |
| Privacy | int `accountsPrivacy.int.spec.ts` (C) | A withdrawal reaches every own record holding the purpose and takes reviews down; giving a marketing consent records it under the notice in force and refuses a changed notice; nothing offered to under 18; a request is recorded with its deadlines and acknowledged by O4 or O7; access and erasure need a recent sign-in; closing keeps bookings, payments and invoices and removes the user, sessions and links (privacy) |
| Messages | unit (A) | A1 to A3 in the registry with their rules (no offer, no price, footers); A1's `load` answers `stale` (never `not-found`, which fails the message, B4) without `transient`; no template carries counselling content |
| The flow | e2e `accountsSignIn.e2e.spec.ts` (A), `myIiic.e2e.spec.ts` (B), `myIiicPrivacy.e2e.spec.ts` (C), desktop and 375 px, axe | Sign in with the test code, keyboard only; the account step with the boxes unticked; errors focus the summary; works with JavaScript off (except Turnstile); a booking made as a guest appears after sign-in; cancel within policy; withdraw a consent; sign out; no horizontal scroll at 320 px; the cookies of §10 and no other; `private, no-store` and noindex on every page |

**Added at the join** (25 November 2026), for the decisions it made:

| What | Level | Cases that must exist |
| --- | --- | --- |
| The seams between the slices | unit `accountsSeams.spec.ts` | `scope.ts` and the privacy seams hand on the slices' own functions, never a wrapper; no `STUB` is left under `src` |
| One second-detail flow and its cookie (D-128, D-129) | unit `accountsSignIn.spec.ts`; int `accountsSignIn.int.spec.ts` | Each reader names the cookie it reads; a second detail proved with a real code travels in `iiic-add-detail` and never in the sign-in cookie |
| Signing in again (D-130) | unit `accountsSignInAuth.spec.ts`; int `accountsSignIn.int.spec.ts` | The session the request carried ends after the new one starts; another device's session and a cookie that fails its signature end nothing |
| The own record and the account step's order (D-131, D-113) | unit `accountsOwnRecord.spec.ts`; int `accountsSignIn.int.spec.ts` | The newsletter's placeholder is never suggested and takes the typed name; a failed consent write leaves no person, account, consent, audit entry or Better Auth user |
| The scope rule (D-132) | unit `accountsScope.spec.ts` | A literal `overrideAccess: true`, a spread of a constant that holds it, and a call that names no `overrideAccess` (Payload's default is true) each need their own `// scope:` line; one line covers only the first query after it |
| The audit actor (D-133) | unit `accountsRequest.spec.ts`, `auditLog.spec.ts`, `accountsPrivacy.spec.ts`; int `accountsPrivacy.int.spec.ts` | `accountRequest` keeps three headers and no cookie and carries the account; the plugin and `recordAudit` name the staff user first, else `account:<id>`; a request's rows written from My IIIC name the account |
| A person's record and their account (D-134) | unit `trustCollections.spec.ts`; int `accountsAttach.int.spec.ts` | Deleting an open account's own record and changing a proven email or mobile are refused; the first proof, the account step and an erasure still pass |
| The contract's two changes (D-135) | unit `accountsPrivacy.spec.ts`; int `accountsPrivacy.int.spec.ts` | `not-offered` with its own line; one 2,000-character limit for the contract, staff and the collection |
| The owner's endpoints (D-125, D-122) | unit `accountsEndpointsOrder.spec.ts` | A visitor, a missing code and every other role are refused, then a preview, before the body or the database is read; a record the account does not hold answers `not-found` |
| The migration's shape | unit `accountsSignInSchema.spec.ts` | The placed `r2a_customer_auth` makes the four tables in `customer_auth` with their keys, indexes and grants, comes right after `r2a_accounts`, and is the only copy; the equality with Better Auth is the integration test's (§3.3) |
| The end-to-end run in CI | unit `accountSignInRun.spec.ts`, `secretScanAllowlist.spec.ts` | CI's end-to-end step carries `BETTER_AUTH_SECRET` and `ACCOUNTS_TEST_CODE`, and the account specs fail there rather than skip without them; each test signs in from a network address of its own; every made-up secret is on the scan's allowlist |
| The header with "Log in" (D-136) | by hand, before accounts open (§14) | 320, 900 and 1600 px, axe |

## 12. Hooks in M5's and M6's code (landed)

The foundation first left `src/lib/privacy/**`, `src/lib/messaging/**`, `src/emails/**` and `src/jobs/**` alone while PR #38's review fixes were made. Those fixes were merged into this branch from `m67/join` (1f1309b, with D-110 and D-111), and the hooks were then landed on `r2a/foundation` against the fixed code, each with its tests. Three of them (H5, H7, H9) relied on code builder A owns, each through a typed stub of the contract's interface marked in its file; at the join (25 November 2026) all three hold slice A's real code.

| Hook | Files | What landed | Tests |
| --- | --- | --- | --- |
| H1 | `src/lib/privacy/purposes.ts`; `src/app/(platform)/w/[token]/page.tsx` and `withdraw/route.ts`; `src/lib/newsletter/copy.ts` | `CONSENT_PURPOSES` gains `account` ("Keeping a My IIIC account", D-113). `ENDED_IN_MY_IIIC` names it, so the withdraw page shows "Close your account in My IIIC" (a link to `/account/privacy`) in place of a withdraw button, and the withdraw route sends that purpose there instead of withdrawing it: closing the account is what ends it (§7.6) | `accountsHooks.spec.ts`, `newsletterPages.spec.tsx`, `messagingPublicRoutes.spec.ts` |
| H2 | `src/lib/messaging/types.ts` | `Recipient` gains `{ kind: 'signIn'; id }` (a `sign-in-requests` row), listed in `RECIPIENT_KINDS`; `SUBJECT_COLLECTIONS` gains `sign-in-requests` and `accounts` | `accountsHooks.spec.ts` |
| H3 | `src/lib/messaging/recipients.ts`, `try.ts`; `src/collections/Messages.ts` | `recipientFacts` takes the first try's `transient`; for `signIn` it answers `signInFacts`: the address from `transient.address` only (an email in small letters on email, E.164 on WhatsApp), no person and no subscriber, and no address at all without it, so a retry or the dispatcher skips the row as `no-address` before any template is loaded. `recipientOf` (now exported) maps `signIn` to the row's subject when that is a `sign-in-requests` row. `messages.recipientKind` takes its options from `RECIPIENT_KINDS` | `accountsHooks.spec.ts`; `accountsHooks.int.spec.ts` (the code reaches the address, the row holds neither, a try without them sends nothing) |
| H4 | `src/emails/registry.ts` | `account-sign-in-code` (A1; email, WhatsApp; `hello`; transactional; footer `none`; price `never`), `account-closed` (A2) and `account-detail-added` (A3) (email; `hello`; transactional; footer `withdraw`; `never`); `builder` widened with `R2a`; `WHATSAPP_TEMPLATE_KEYS` gains `account-sign-in-code`, and `WHATSAPP_AUTHENTICATION_KEYS` names it as Meta's authentication category | `automationsCatalogue.spec.ts` |
| H5 | `src/emails/index.ts`, `src/emails/accounts/index.ts` | The map joins `ACCOUNT_TEMPLATES`, which holds the three templates; the foundation's empty stub was replaced by slice A at the join | `accountsHooks.spec.ts`, `accountsMessages.spec.ts` |
| H6 | `src/lib/automations/catalogue.ts`; `docs/06` | A1 to A3 (owner `R2a`, no event and no task: each is planned by its own action); `Owner` widened; `docs/06`'s Engine (R2) table gains A2 and A3 | `automationsCatalogue.spec.ts` (docs/06's Release 1 ids and its account ids, each once) |
| H7 | `src/lib/privacy/erasure.ts`; `src/lib/accounts/lifecycle.ts` | In `confirmErasureWith`'s one transaction, right after the shared `erasePersonFromPipeline`: `closeAccountsOfPerson(req, personId)`; the emptied record also loses its `account` link; the plan (`planOf`, the same lines for the operator and the owner) gains `PLAN_LINES.account`, which `survey` counts as the account whose own record it is or the one it is attached to. `closeAccountsOfPerson` is slice A's real one since the join (the foundation's stub, which closed nothing, was replaced): it closes the account whose own record is erased and detaches the record from any other | `privacyExport.spec.ts` (the plan's line) |
| H8 | `src/lib/privacy/export.ts` | `EXPORT_SECTIONS` gains "Your My IIIC account": the account whose own record it is or the one it is attached to, with when it was made and when and how they last signed in, never Better Auth's id; the person's section drops the bare `account` id. The devices are not listed: a session holds a browser's name and expires within thirty days | `privacyExport.spec.ts`; `accountsHooks.int.spec.ts` |
| H9 | `src/lib/automations/operations/run.ts`; `src/lib/accounts/purge.ts` | `runO5` (the existing `O5-retention` task, so `src/jobs/` is unchanged) calls `purgeSignIns(req, now)`, slice A's real one since the join (the foundation's stub removed nothing): the 48-hour purge of `sign-in-requests` and of Better Auth's expired sessions and codes | `accountsHooks.spec.ts`; `accountsSignIn.int.spec.ts` (the 48-hour cutoff) |

M5's request rules (`requestRules`, `src/lib/privacy/hooks.ts`) need no hook: a request created by the server starts as received with its clocks set, whoever makes it, and C's `CreateOwnRequest` fills `verifiedAt` and `verificationMethod` at creation.

**What the review fixes changed in this design.**

- A template whose data is missing at send time now fails the message loudly (`data-missing`, B4), and only `stale` is a quiet skip. A1's `load` therefore answers `stale`, never `not-found`, without its `transient`, though H3 already skips such a try as `no-address` before `load` runs.
- The price guard reads every client message and fails it on a hit (D-111). A1 to A3 carry no amount and quote none of the person's own words, so they declare no `quoted`.
- The withdraw page's buttons now run `withdrawPurpose` from `src/lib/newsletter/withdrawals.ts`, which C reuses (§7.5).
- The newsletter's signup now counts its pending entries across the site to bound the mail a burst can cause (A6). Sign-in codes take the same guard (`SIGN_IN_LIMITS.site`, §4.8).
- An erasure keeps the person's suppressed addresses (D-110); closing an account does not touch them either.

## 13. Who builds what

The foundation is frozen for the builders: `src/lib/accounts/contract.ts`, the collections (`Accounts.ts`, `SignInRequests.ts`, the `account` field in `People.ts`), `src/access/policy.ts`, `src/access/views.ts`, `src/lib/env.ts`, `.env.example`, `package.json` and the lockfile. A builder who needs a change asks the lead; no file belongs to two slices. Each branches from `r2a/foundation`, where the hooks have landed (§12), and touches only its own files; builder A replaces the three stubs (`src/emails/accounts/index.ts`, `closeAccountsOfPerson` in `lifecycle.ts`, `purgeSignIns` in `purge.ts`).

**A · Sign-in, sessions and the account's life**

- Owns: `src/lib/accounts/auth/**`, `src/lib/accounts/signIn/**`, `src/lib/accounts/session.ts`, `src/lib/accounts/attach.ts`, `src/lib/accounts/lifecycle.ts` (create, close, end sessions, detach, `closeAccountsOfPerson`), `src/lib/accounts/details.ts` (a second detail), `src/lib/accounts/purge.ts`; `src/app/(platform)/(default)/login/**`; `src/components/account/signIn/**`; `src/emails/accounts/**`; `src/scripts/print-customer-auth-sql.ts`; after the foundation, `src/collections/Accounts.ts` (its owner endpoints) and the `people` create hook's one line in `src/collections/People.ts`; `docs/12` §1 and §10 (the rows of §10), `docs/content/whatsapp-templates.md` (the authentication template), `docs/runbook.md` (rotating the secret); tests `tests/unit/accountsSignIn*.spec.ts`, `tests/unit/accountsMessages.spec.ts`, `tests/int/accountsAuthSchema.int.spec.ts`, `tests/int/accountsSignIn*.int.spec.ts`, `tests/int/accountsAttach.int.spec.ts`, `tests/e2e/accountsSignIn.e2e.spec.ts`, `tests/e2e/cookies.e2e.spec.ts`.
- Implements: `GetAccountSession`, `RequireAccount`, `RequestCode`, `VerifyCode`, `CreateAccount`, `ListDevices`, `SignOut`, `SignOutEverywhere`, `AttachEarlierRecords`, `CloseAccount`, `CloseAccountsOfPerson` (replacing the stub), `EndAccountSessions`, `DetachRecord`, `RequestDetailCode`, `ConfirmDetail`, `PurgeSignIns` (replacing the stub), and the three templates (replacing `ACCOUNT_TEMPLATES`'s stub).
- Done when: a person signs in by email code end to end with the keyboard, with JavaScript off and on a phone; a new address gets an account only after the consent; earlier records attach; the limits, the tries and the previews hold as §11 says; Better Auth's schema test is green; the cookie inventory matches §10.

**B · My IIIC's records**

- Owns: `src/app/(platform)/(account)/layout.tsx` and `src/app/(platform)/(account)/account/**` except `account/privacy/**`; `src/lib/accounts/scope.ts`, `src/lib/accounts/bookings.ts`, `src/lib/accounts/documents.ts`; `src/components/account/**` except `signIn/**` and `privacy/**`; `src/components/site/SiteHeader.tsx` and its stylesheet ("Log in" while the flag is on); `src/lib/analytics/beacon.ts` (`countsPath`); tests `tests/unit/accountsScope.spec.ts`, `tests/int/accountsRecords.int.spec.ts`, `tests/e2e/myIiic.e2e.spec.ts`, and the headers test's rows for `/account`.
- Implements: `OwnPersonIds`, `ListOwnBookings`, `GetOwnBooking`, `ManageOwnBooking`, `ListOwnCertificates`, `ListOwnInvoices`, `DownloadOwnDocument`.
- Done when: a signed-in person sees exactly their own bookings, certificates and invoices and nobody else's (tested per function), reschedules and cancels within policy, downloads a valid certificate with the read audited, sees no amount while prices are hidden, and every page is axe-clean at 320 px with the scope statement wherever a counselling booking shows.

**C · Privacy and the account's settings**

- Owns: `src/app/(platform)/(account)/account/privacy/**`; `src/lib/accounts/privacy/**`; `src/components/account/privacy/**`; tests `tests/unit/accountsPrivacy.spec.ts`, `tests/int/accountsPrivacy.int.spec.ts`, `tests/e2e/myIiicPrivacy.e2e.spec.ts`.
- Implements: `ListOwnConsents`, `GiveConsent`, `WithdrawConsent`, `CreateOwnRequest`, `ListOwnRequests`; the page's sections for contact details, devices and closing call A's `RequestDetailCode`, `ConfirmDetail`, `ListDevices`, `SignOutEverywhere` and `CloseAccount`.
- Done when: every consent in force can be withdrawn and the marketing ones given under their notice, a request of each kind is recorded and acknowledged, access and erasure ask for a recent sign-in, closing keeps what `04` keeps, all keyboard-only and axe-clean.

**The contract between them** is `src/lib/accounts/contract.ts`: A's `AccountSession` and `RequireAccount` are what B and C call first on every page and action; B's and C's functions take that session and nothing else that identifies the person; C calls A's lifecycle and detail functions rather than Better Auth. B and C build against a fake `requireAccount` (a fixed `AccountSession` from the contract) until A lands. The lead joins A, then B, then C, regenerates types and the import map, generates `r2a_accounts`, adds `r2a_customer_auth` (§3.3), and runs the reviewer once on the joined branch (D-80). The join was made on 25 November 2026 on `r2a/join` (the types and the import map came out unchanged); the reviewer's run and the first run of the migrations and of the integration and end-to-end suites follow it (D-140).

## 14. Open decisions and missing inputs, and what the build assumes

| Item | Assumed until IIIC decides |
| --- | --- |
| D-113: an account needs its own consent, `account`, given with an unticked box under its notice | Built so; no notice in force (I-65), no new account |
| D-114: accounts are for adults | Built so; the lawyer confirms with the under-18 rules (I-22, I-67) |
| D-115: thirty days on a kept device, the browser session otherwise, no sliding | Built so |
| D-116: the limits' numbers, counted from `sign-in-requests` | Built so; IIIC may change the numbers in the contract |
| D-117: Better Auth beside Payload as §3, its handler not mounted, WhatsApp codes stored plain for ten minutes by 1.7.27's phone plugin | Built so; checked again before WhatsApp codes open |
| D-118: no invoice PDF in My IIIC while prices are hidden | Built so; the PDF by reply to the receipt |
| D-119: My IIIC offers only the two marketing consents; every consent in force can be withdrawn | Built so |
| D-120: attaching by verified detail, linking without merging; the shared-mailbox case accepted; owners detach | Built so; the lawyer confirms the shared address (I-67) |
| D-121: a sign-in within ten minutes before closing, access and erasure | Built so |
| D-122: previews act on nothing | Built so |
| D-123: A1 to A3; codes keep quiet hours on WhatsApp; A1 has no withdraw link | Built so; IIIC may exempt codes from quiet hours |
| D-124: Map, learning, proposals and the next recommended step left off My IIIC until their pieces | Built so |
| D-125: owners read accounts and end their sessions; no one edits one | Built so |
| D-126: WhatsApp codes built, off until I-03, I-40 and I-66 | Email only |
| D-127: customers are never Payload users; every My IIIC read is a scoped server function | Built so |
| I-65: the account notice and the account consent's text | The account step shows `[[TODO: the account notice and consent text, I-65]]` and refuses |
| I-66: the WhatsApp authentication template approved for IIIC's number (with I-03) | Email codes only |
| I-67: the lawyer on accounts: the consent's wording, adults only, the shared address, whether a session's code verifies a data request | As D-113, D-114, D-120, D-121 |
| Not decided here: an email when a new device signs in | None sent; proposed for after launch if IIIC wants it |
| Not decided here: whether a signed-in booking is prefilled and made under the account's own record | M3's flow unchanged; the hook attaches the new record |
| D-130: signing in again ends the session the browser carried | Built so |
| D-131: the own record, with the newsletter's placeholder name counting as no name | Built so |
| D-133: every write a customer makes names the account as the audit actor | Built so |
| D-134: the admin refuses to delete an open account's own record and to change a proven email or mobile | Built so; what the office does when a proven address must change and the person cannot prove a new one is I-69 |
| D-136: the header's row of links wraps from 851 px when "Log in" needs the room | Built so; checked by hand before accounts open |
| D-137: codes, "Continue with Google" and passkeys; no passwords, no Apple, no calendar access (§16) | Codes only: Google and passkeys are built before accounts open |
| D-138: a copy or an erasure asked from My IIIC reaches every record of the account | Not built: the request names the account's own record only, so accounts stay closed until it is (D-139) |
| I-68: Google's OAuth client for "Continue with Google" | No Google button; sign-in by code |
| I-69: what the office does when a proven address must change and the person cannot prove a new one | The admin refuses the change (D-134); the placeholder in `05`, People |

**Before accounts open** (D-139). `accountsEnabled` goes on in production only when every line is true, in this order; `runbook.md`, "Opening My IIIC accounts", holds the same list with where to check each:

1. A copy and an erasure asked from My IIIC reach every record of the account, not only its own record (D-138).
2. `BETTER_AUTH_SECRET` is set in Production.
3. The account notice is in force (I-65); without it every new account is refused.
4. The privacy notice's cookie section lists the account cookies (`12` §10).
5. An owner can end an account's sessions and detach a record from the admin, not only through the two endpoints (D-125; §4.7, §6).
6. "Continue with Google" is built and its client is set (D-137, I-68).
7. Passkeys are built (D-137).
8. The header has been checked by hand with "Log in" showing, at 320, 900 and 1600 px, axe included (D-136).
9. Vercel's firewall limits `/login` (D-109).
10. The lawyer has answered on accounts (I-67).
11. Then an owner switches the flag on.

## 15. Schema changes the migration carries

`r2a_accounts` (`src/migrations/20261125_161605_r2a_accounts.ts`), generated by `pnpm migrate:create r2a_accounts` at the join after every fix and committed unedited, carries exactly:

- the `accounts` table: `id`, `auth_user_id` (varchar, unique index `accounts_auth_user_id_idx`), `person_id` (integer, NOT NULL, foreign key to `people` set null on delete, unique index `accounts_person_idx`), `last_sign_in_at` with `lastsigninat_tz` (enum `enum_accounts_lastsigninat_tz`, Asia/Kolkata), `last_sign_in_channel` (enum `enum_accounts_last_sign_in_channel`: email · whatsapp), `updated_at` and `created_at` (each indexed);
- the `sign_in_requests` table, with no `updated_at` or `created_at`: `id`, `purpose` (enum signIn · addDetail), `channel` (enum email · whatsapp), `identifier_hash` and `network_hash` (varchar), `requested_at` (indexed), and the compound indexes `identifierHash_requestedAt_idx` and `networkHash_requestedAt_idx`;
- `people.account_id` (foreign key `people_account_id_accounts_id_fk` to `accounts`, set null on delete, index `people_account_idx`);
- Payload's own `payload_locked_documents_rels.accounts_id` (cascade on delete, indexed; `sign-in-requests` does not lock);
- from the hooks (§12), twenty values on nine enums: `enum_consents_purpose` and `enum_consent_versions_purpose` gain `account` (H1); `enum_messages_recipient_kind` gains `signIn` and `enum_messages_subject_collection` gains `sign-in-requests` and `accounts` (H2, H3); `enum_messages_template`, `enum_message_templates_key` and `enum__message_templates_v_version_key` gain the three template keys (H4); `enum_messages_automation` and `enum_automations_key` gain A1, A2 and A3 (H6).

Its down drops both tables and both columns and recreates the nine enums by casting through text, which fails once a row holds a new value: it is not used on production.

`r2a_customer_auth` (`src/migrations/20261125_161840_r2a_customer_auth.ts`), made blank right after it and holding builder A's staged SQL word for word (§3.3), carries the `customer_auth` schema, Better Auth's four tables as its own SQL prints them, the revoke from PUBLIC and the grants to `iiic_app` when that role exists.

## 16. Sign-in methods to come (D-137)

Decided on 25 November 2026, when the owner asked whether clients can sign in with Google or Apple and have their appointments synced to their calendars, and asked for the best long-term design. Nothing of it is built in this piece; its two build items are on the "before accounts open" list (§14).

- **Ways in.** A one-time code by email, or by WhatsApp once its provider is set up (D-126); "Continue with Google"; or a passkey (the device's fingerprint, face or screen lock) once the person has added one in My IIIC. No passwords, and no "Sign in with Apple": it needs a paid developer account and a secret renewed every six months, and its relay addresses do not match the email a guest booked with. People on Apple devices are served by passkeys and codes.
- **Google** is asked only for the person's email address and whether Google has verified it. A verified address counts as the proven email (§3.6, §6), so the same account and the same earlier bookings are found whichever way the person signs in; an address Google has not verified is refused. The link to Google would live in Better Auth's `identities` table (§3.2), empty until then. The OAuth client is IIIC's to set up (I-68); until it is set, the Google button is not shown and sign-in is by code.
- **Passkeys** are offered only after a sign-in by code or Google, and a code always remains the way back in.
- **Calendars.** IIIC never asks for access to a client's calendar. Every booking sends a standard invite that Google, Apple and Outlook add, move and cancel as one event (D-22), and My IIIC offers the same file (`/account/bookings/[ref]/invite.ics`, §5). Nothing is built that needs a calendar permission, and there is no second "add to calendar" link that would leave a stale copy when a session moves.
- **When.** Google sign-in and passkeys are built after the three slices are joined and before `accountsEnabled` goes on, so that the account notice (I-65), the privacy notice's cookie section and the lawyer's answers (I-67) cover every way of signing in at once.
