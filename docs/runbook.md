# Runbook

Steps to follow when something has to be done by hand: deploy, roll back, restore from a backup, rotate a secret, and respond to a breach (`08` §3, §9; `12` §5, §8; `14`). Each names the screen or the command. Whoever acts is one of the two people who hold IIIC's vendor logins and recovery codes in the password manager (`12` §12): <span class="iiic-todo">[[TODO: the two people who act on a deploy or an incident, and how to reach them out of hours, I-60]]</span>. Nothing here is done from a personal account, and no secret is pasted into a chat, a ticket or the repository.

## What runs where

| Part | Where | Who changes it |
| --- | --- | --- |
| The app | Vercel, project in IIIC's team, functions in `bom1` (Mumbai); production from `main`, a preview for each pull request | A merge to `main`; an owner of the Vercel team |
| The database | Supabase, Mumbai (`ap-south-1`), used as plain Postgres; previews and production share it until previews get their own (`16` §10) | Migrations only, run by the deploy (`pnpm vercel-build`) |
| Files | Cloudflare R2: the public media bucket (`media.imagecatalysts.in`) and the private bucket for certificates, invoices and privacy exports | The app; an owner in Cloudflare |
| Email | Resend, sending from the platform domain's subdomains (`13` §2) | An owner in Resend |
| Payments | Razorpay: test keys on previews, live keys on production only (`src/lib/env.ts` refuses a live key elsewhere) | An owner in Razorpay |
| Errors | Sentry (EU), server only (D-49) | An owner in Sentry |

Environment variables live in Vercel → the project → Settings → Environment Variables, per environment (Production, Preview, Development); `.env.example` lists every one. A change takes effect only on the next deployment.

## Deploy

A deploy is a merge to `main`. Vercel builds it with `pnpm vercel-build`, which runs, in order: the migrations (`pnpm migrate`), the database settings (`pnpm db:settings`, the 15-second statement limit on the app's role), the two re-keying steps (`pnpm totp:rekey`, `pnpm notes:rekey`, which do nothing unless a key is being rotated) and the build. A failure at any step stops the deploy, and the site keeps serving the deployment before it.

1. Before merging: CI is green (types, lint, unit, integration, end-to-end with axe, the headers and cookie tests, Lighthouse's budgets, the audit and the secret scan), the reviewer has no Blocker or Fix finding, and the release checks in `10` hold for a release.
2. Merge the pull request on GitHub. Vercel starts the production build.
3. Watch it in Vercel → Deployments → the newest one → Building. The migrations' and re-keying steps' lines are in its build log.
4. When it is Ready, open the site and `/api/health` (it answers 200 with the database's answer and the commit). Sign in to `/admin` with the two-factor code.
5. In Sentry, the release named after the commit appears with the first event; watch Issues for an hour after a release.

A deploy by hand, when GitHub is down: `vercel deploy --prod` from a clean checkout of `main`, signed in to the Vercel CLI as an owner of IIIC's team. Never deploy a branch that is not `main` to production.

A schema change comes with its migration, generated with `pnpm migrate:create <name>` and committed; migrations are never edited by hand and never pushed with `push` (CLAUDE.md, `12` §6).

## Roll back

The fastest way back is Vercel's instant rollback: it points the domain at an earlier deployment without building anything.

1. Vercel → Deployments → the last deployment that worked → the menu (⋯) → **Instant Rollback** (or `vercel rollback <deployment-url>` with the CLI). The domain serves it within seconds.
2. A rollback does not undo migrations. If the bad deployment ran a migration, the older code now reads a newer schema. Most migrations only add, and the older code ignores what it does not know; if it does not, fix forward with a new pull request rather than running a down migration on production. Rolling back `20261121_094426_review_fixes` needs the page facts that cite the registration form changed first (`12` §6).
3. Rolled-back production stays on the old deployment until the next promotion: revert the bad commit on `main` (a revert pull request), let it deploy, and check it as in "Deploy".
4. Record what happened in the pull request that fixes it; an outage of personal data is also a breach (below).

## Restore from a backup

Two kinds of backup are meant to exist (`08` §9; `12` §12): Supabase's daily backups, kept 7 days on the Pro plan, and a nightly encrypted `pg_dump` to the private R2 bucket, kept 30 days. Supabase's daily backups exist from the moment the project is on Pro. The nightly dump to R2 is not built yet; until it is, a dump is taken by hand before any risky change, as in step 2 below, and the O6 check (`06`) reads Supabase's.

A restore is tested at least once a quarter, and in the 30 days before every release (`10`, Release checks): restore into a new, empty Supabase project, never into production, point a local copy of the app at it and open a few records; write down the date and how long it took.

**Restoring production (only after deciding that the data now is worse than the backup):**

1. Tell the office first, then stop writes by pausing the project in Vercel (the project's settings), so neither the site nor the admin answers while the data is replaced.
2. Take a dump of the database as it is now, whatever its state, so nothing is lost by the restore: `pg_dump --format=custom --no-owner --file=iiic-before-restore.dump "$DATABASE_URL_DIRECT"` (the direct connection string, not the pooler's; Supabase → Project → Connect). Keep the file in the private bucket, never on a laptop longer than the restore takes.
3. Supabase → the project → Database → Backups → choose the day → **Restore**. Supabase restores into the same project; the project is unavailable while it runs.
4. Or, from a dump: `pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL_DIRECT" iiic-<day>.dump`.
5. Run `pnpm migrate:status` against the restored database (with its `DATABASE_URL`) and, if the backup predates a migration, redeploy production so the deploy runs the missing ones.
6. Re-check: `/api/health`, a sign-in to `/admin`, Today, one booking, one invoice. Anything written between the backup and the restore is gone: bookings, payments and consents among them. Reconcile payments from Razorpay's dashboard (B11 does it daily once M6 runs it), and tell the people whose bookings were lost.
7. Files in R2 are not part of a database backup: a certificate or an invoice whose row is gone stays in the bucket, and a row whose file is gone shows that the PDF is missing.

## Rotate a secret

Rotate on a schedule (yearly), when someone who could read it leaves, and at once if it may have been seen (`08` §9; `12` §5). The pattern is always the same: make the new value at the provider, put it in Vercel for each environment that uses it, redeploy, check, then revoke the old one. Previews and production share one database today, so a database or encryption secret changes in both at once, and every open preview is redeployed.

| Secret | Make the new one | Notes |
| --- | --- | --- |
| `PAYLOAD_SECRET` | `openssl rand -base64 48` | Through `PAYLOAD_SECRET_PREVIOUS`: the procedure in `08` §9. Everyone signs in again |
| `NOTES_ENCRYPTION_KEY` | `openssl rand -base64 32` | Through `NOTES_ENCRYPTION_KEY_PREVIOUS`: below |
| `DATABASE_URL`, `DATABASE_URL_DIRECT` | Supabase → Project Settings → Database → Reset database password | Both strings carry the password; update both, redeploy production and every open preview at once, since the old password stops working immediately |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → Manage API tokens → Create a token with Object Read and Write on the two buckets | Put both in Vercel, redeploy, check an image and a certificate download, then delete the old token |
| `RESEND_API_KEY` | Resend → API Keys → Create (sending access, the platform domain) | Redeploy, send a test (an owner's password reset), then delete the old key |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Account & Settings → API Keys → Regenerate | Live keys on Production only. Regenerating ends the old pair at once: do it at a quiet hour and redeploy straight away |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Dashboard → Account & Settings → Webhooks → the platform's webhook → Edit → a new secret | Set it in Vercel first, redeploy, then save it in Razorpay; events refused in between are retried by Razorpay. Send a test event and see it answered 200 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Cloud console → IAM → Service accounts → the calendar account → Keys → Add key (JSON) | Paste the JSON into Vercel, redeploy, check a practitioner's busy times, then delete the old key |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | `openssl rand -base64 48` | Existing watch channels carry the old token until B14 renews them; rotate it just before the renewal, or expect notifications refused until then (the 15-minute sweep covers the gap) |
| `ZOHO_REFRESH_TOKEN`, `ZOHO_CLIENT_SECRET` | Zoho API Console (India data centre) → the platform's client | Invoices wait in `pending` while they are wrong; B3 issues them once the new values are in |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` | Customer sign-in (Release 2; `20` §3.4). It signs Better Auth's session cookie and keys the sign-in cookie and the hashes in `sign-in-requests`, and there is no previous value to fall back on: rotating it signs every customer out of My IIIC, and a sign-in begun before it must start again. Each signs in again with a code; nothing they hold is lost. The rate limits start counting afresh. Set it per environment; previews never act whatever they hold (D-122). Unset, sign-in is closed and `/login` says so |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → the widget → Rotate secret key | Both Turnstile keys are set together or not at all (`src/lib/env.ts`) |
| `OWNER_SETUP_TOKEN` | — | Delete it once the first owner exists (D-41); it is never rotated, only removed |
| Sentry DSN | Vercel's Sentry integration sets it | Rotate the client key in Sentry → Project Settings → Client Keys only if it was published somewhere it should not be |

After any rotation: `/api/health` answers 200, an owner signs in with the code, and Sentry shows no new issue from the change.

## Rotating the session notes key

Session notes are sealed at rest under `NOTES_ENCRYPTION_KEY` (D-11; `18` §3). Rotate it yearly, when someone who could read Vercel's environment variables leaves, and at once if the key may have been seen. An owner does this in Vercel; nobody else holds the key, and it is never put in the repository, a chat or a ticket.

1. Make a new key on your own computer: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Copy it straight into Vercel, not into a file.
2. In Vercel → Project → Settings → Environment Variables, for each environment that has notes (Preview and Production share one database today, so they share one key):
   - set `NOTES_ENCRYPTION_KEY_PREVIOUS` to the current value of `NOTES_ENCRYPTION_KEY`;
   - set `NOTES_ENCRYPTION_KEY` to the new key.
   The app refuses to start with the previous key alone, or with both the same.
3. Redeploy. Every note opens under either key in the meantime. The build runs `pnpm notes:rekey`, which re-seals each note still under the previous key and logs two counts: notes re-sealed, and notes no key held could open.
4. Check the build log. When a later deployment's run re-seals 0 and finds 0 unopened, delete `NOTES_ENCRYPTION_KEY_PREVIOUS` in Vercel and redeploy.
5. If the count of notes no key could open is above 0, stop and keep both keys: those notes were sealed under a key this deployment does not hold. Find the key they were sealed under before deleting anything.

Without `NOTES_ENCRYPTION_KEY` the app still builds and runs: the notes panel says notes are not available and nothing is stored unsealed.

## Responding to a breach

The breach register is Admin → Privacy → Breach register (`incidents`). Its two clocks run from the moment the incident was detected: CERT-In within 6 hours for a listed incident, and the Data Protection Board's detailed report within 72 hours (`08` §3). The Privacy view shows each open clock as time left or overdue, in words.

1. **Record it at once.** Add an incident with the time it was detected (IST), a title and what happened. Name systems and kinds of data, never a person's details. Saving sets both deadlines; they move only if the time detected is corrected.
2. **Contain it.** Stop what is leaking: revoke keys or sessions, take a page or integration offline, rotate the secret involved (above for the notes key; `PAYLOAD_SECRET` through `PAYLOAD_SECRET_PREVIOUS`, `08` §9). Record the time contained and set the status to Contained.
3. **Assess it within the first hour.** Tick "A listed incident: report to CERT-In" if it is one of CERT-In's listed kinds, and "Personal data was affected" with the kinds of data and how many people. An incident with neither box ticked shows its clocks as not assessed.
4. **CERT-In, within 6 hours** of detection, for a listed incident: report through CERT-In's incident reporting channel, from IIIC's point of contact <span class="iiic-todo">[[TODO: CERT-In point of contact, name, email and phone, I-27]]</span>. Record the time reported and CERT-In's reference.
5. **The people affected, without delay**, through their registered channel: what happened, how far it reached, when, the likely consequences, what IIIC has done, what they can do, and whom to contact <span class="iiic-todo">[[TODO: grievance officer's name and contact, I-21]]</span>. No offers, and nothing from a counselling session, in these messages (CLAUDE.md #3). Record when, how and how many under "People told".
6. **The Data Protection Board**: the first notice without delay, then the detailed report within 72 hours of detection (the DPDP Rules' duty, from 13 May 2027) <span class="iiic-todo">[[TODO: how to reach the Board while it is being constituted, to confirm with the lawyer]]</span>. Record the first notice, the detailed report's time and the reference.
7. **Close it** once the remediation is written down and every notification is recorded: set the status to Closed with the time.

Every change to the register is in the audit log. If a step's time was missed, record when it was done all the same; the clock then shows how late it was.

### Containing it, by system

| What may be exposed | Do this first | Then |
| --- | --- | --- |
| A staff account | Owner: deactivate the account in Settings → Staff users (its sessions end at once) and reset its two-factor | Set a new password; read its entries in the audit log (Settings → Audit log) |
| An owner's account | Another owner does the above | If no other owner can sign in, an owner resets through Payload's "Forgot password" and their recovery codes |
| Every session | Rotate `PAYLOAD_SECRET` (above, `08` §9): everyone is signed out | — |
| The database password | Rotate `DATABASE_URL` and `DATABASE_URL_DIRECT` (above) | Supabase → Logs for connections from unknown addresses |
| The private bucket's keys | Delete the R2 token in Cloudflare at once (certificate, invoice and export downloads fail until the new token is in) | Make a new token, redeploy |
| A provider key (Resend, Razorpay, Google, Zoho) | Revoke it at the provider | Rotate as above |
| The site serving something it must not | Roll back (above), or pause the project in Vercel | Fix forward |
| Session notes | Rotate `NOTES_ENCRYPTION_KEY` (above) if the key may have been read | Every opening of a note is in the audit log (`read-note`) |

Sentry, Vercel's logs and the audit log are where to look first; none of them holds a message body, a note or a full contact detail, so they can be shared with whoever investigates.
