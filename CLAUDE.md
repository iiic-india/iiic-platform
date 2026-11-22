# IIIC platform

The website and back office for the **Indian Institute of Image Catalysts** (IIIC), Ahmedabad: one theory, *Subjective Self*, applied to organisations (consultancy, the core business), learners (a certification course) and individuals and families (counselling). One Next.js codebase serves the business platform domain now and the institute domain `iiic.edu.in` later.

Read `docs/README.md` for the reading order. The product source of truth is `docs/00-platform-plan.md`; decisions are in `docs/decisions.md`.

## Non-negotiables

1. **Never invent a fact.** No testimonials, client names, counts, credentials, prices, dates, policies or outcomes that are not in `docs/09-content-and-inputs.md` or the CMS. No price appears on any page, email or template while the `prices_public` setting is off (D-21). The words IIIC has written are in `docs/content/` and are used verbatim; candidate lines are used only once approved. Render unknowns as `<span class="iiic-todo">[[TODO: what is missing, I-xx]]</span>`. Seed data must be obviously fake and must never reach production.
2. **The brand kit is the design system.** Build on `src/brand/` (kit 1.0.3). Yellow `#FFDD00` lives on paper, white or its own tints, never on a dark surface; nothing dark is filled next to yellow; no dark mode. Use the kit's classes and semantic roles (`--iiic-surface`, `--iiic-text`, `--iiic-accent`, …); never raw colour tokens in page CSS; never redefine an `--iiic-` variable. A design change beyond the kit (the tab icon was the first, D-48) is recorded in `docs/decisions.md` first. Make it in the app's own files where that is enough; a kit file, `VOICE.md` included, may be edited when the improvement belongs in the kit itself (D-53), and the decision names the file. Copy follows `src/brand/VOICE.md`, including its writing standard: nothing that reads as generated filler ships (D-32); every user-facing string is checked against it.
3. **Counselling is private.** Nothing said in counselling is used for marketing, routing or analytics. No offers in session messages, notes or reminders. Session notes are readable only by their author, encrypted at rest, and every read is audited.
4. **Consent before storage.** Record consent (purpose, notice version, time, evidence) before storing Map answers, profile answers or marketing preferences. Promotional messages need the matching consent and stop when it is withdrawn.
5. **Payments are confirmed only by verified gateway webhooks** (or server-side verification), processed idempotently by event id. Money is integer paise. Tax and totals are computed on the server.
6. **Every custom admin view and API route checks the user and role first.** Payload custom views are public by default. Staff accounts require TOTP two-factor. Writes to personal data and reads of S3 data go to the append-only audit log.
7. **Pinned versions.** `payload` and every `@payloadcms/*` package on 3.94.x, pinned exactly (set at the start of M1, 19 November 2026; never the v4 beta). Next.js 16.4.x, React 19.2.x, Node 24. Upgrade Next.js and Payload together on a branch with the full test suite.
8. **Times:** store UTC, display Asia/Kolkata. **Phones:** E.164 (`+91…`).
9. **No dark patterns, no clinical claims.** No pre-ticked or bundled consent, no false urgency, totals shown before payment, decline buttons read "No, thanks" at equal weight. Never describe counselling with "therapy", "therapist", "psychologist", "clinical", "diagnosis" or "treatment"; counselling surfaces carry the scope statement and crisis numbers. Never call the certificate a degree or diploma or imply recognition. Rules: `docs/08-security-privacy-compliance.md`.
10. **The standards are part of done.** The budgets, headers, cookie inventory, search system and accessibility rules in `docs/12-engineering-standards.md`, the experience devices in `docs/11-experience-concept.md` (and their absence on counselling pages), and the messaging rules in `docs/13-email-and-messaging.md` apply to every pull request.
11. **When the docs do not settle something, ask** — or propose a decision in `docs/decisions.md` for IIIC to confirm. Do not decide business rules silently in code.

## Stack

Next.js (App Router, TypeScript strict) · Payload CMS 3.94.x inside the app (admin, collections, access control, hooks, jobs) · Postgres on Supabase (Mumbai) via `@payloadcms/db-postgres`, migrations in every environment (schema push is off) · Cloudflare R2 via `@payloadcms/storage-s3` (public media bucket, private documents bucket) · Vercel Pro with functions in `bom1` · Razorpay · Zoho Books (invoices, India data centre) · Resend (React Email) · WhatsApp through the provider's API · Google Workspace and the Google Calendar API for two-way calendar sync and Meet links, `.ics` invites for clients (D-22, D-23) · Better Auth for customer one-time codes (Release 2) · serverless Chromium for PDFs from `src/brand/templates/print/` · Cloudflare Turnstile, Web Analytics · Sentry · Vitest and Playwright. Details and reasons: `docs/07-stack-and-integrations.md`.

## Repository layout (created in M1)

```
src/
  app/(platform)/…          public routes for the platform domain (route groups per register)
  app/(institute)/…         institute routes (Release 3; host-based)
  app/(payload)/admin/…     Payload admin
  app/api/…                 webhooks, cron runner, health, internal endpoints
  access/                   role helpers shared by collections and views
  brand/                    brand kit 1.0.3 — changed only with a decision (D-53)
  collections/              Payload collections (one file each, with access rules)
  migrations/               Payload migrations (generated, committed, never edited by hand)
  components/               React components built on the kit's classes (site/ holds the page shell)
  lib/env.ts                server environment, validated with Zod
  lib/booking/              slot engine, holds, policies (pure, unit-tested)
  lib/payments/             Razorpay client, webhook handlers
  lib/messaging/            email and WhatsApp senders, templates
  lib/pdf/                  HTML-to-PDF rendering
  lib/privacy/              consent, data requests, retention
  jobs/                     Payload job tasks (one per automation ID)
  emails/                   React Email templates
docs/                       product and technical docs (keep in sync)
tests/                      unit, integration, e2e
```

## Working in this repository

- Start or resume a milestone with `/milestone M1` (any ID from `docs/10-build-plan.md`); it loads the right documents and plans before code.
- After writing or changing copy, run `/copy-check <path>`; before every pull request, run the `iiic-reviewer` subagent on the diff and fix its Blocker and Fix findings.
- `.claude/settings.json` denies reading local secret files. Do not work around that rule. The brand kit is no longer locked (D-53): record a change to a kit file in `docs/decisions.md` before making it.

## Commands

Node 24 (`.nvmrc`), pnpm 10. Local Postgres: `docker compose up -d`, then `cp .env.example .env` and set `PAYLOAD_SECRET`.

- Install: `pnpm install` · develop: `pnpm dev` · build: `pnpm build` (Vercel runs `pnpm vercel-build`: migrate, then build)
- Checks: `pnpm typecheck` · `pnpm lint` · `pnpm format:check` (`pnpm format` fixes)
- Tests: `pnpm test:unit` · `pnpm test:int` (needs Postgres) · `pnpm test:e2e` (desktop and phone, with axe)
- Payload: `pnpm generate:types` and `pnpm generate:importmap` after config changes
- Migrations: `pnpm migrate:create <name>` after every schema change, `pnpm migrate`, `pnpm migrate:status`; never `push`
- Seed and the local job runner: added later in M1 and M6

## Conventions

- Server-only code (secrets, database, providers) in modules marked `server-only`; validate every input at the boundary with Zod; return typed errors, not thrown strings.
- Collections own their access rules; sensitive data (notes, Map answers) lives in its own collection with collection-level rules.
- Automations are jobs named by their ID in `docs/06-automations.md` (e.g. `B5-reminder-24h`), idempotent, with retries; never use Payload's `autoRun` on Vercel.
- Logs never contain message bodies, Map answers, notes or full contact details.
- UI strings live in one place per locale (`en-IN` now); set `lang` on elements in other scripts.
- Accessibility is part of done: labels, focus management in multi-step flows, keyboard paths, axe clean.
- Components use the kit's markup (see `src/brand/gallery.html`); interactive behaviour the kit leaves to JS (nav toggle, tabs, menu close, toasts, focus on the error summary) lives in small client components.
- Conventional commits; reference decision IDs (`D-02`) and automation IDs (`B5`) in messages.

## Definition of done (every pull request)

- The milestone's acceptance criteria in `docs/10-build-plan.md` are met for the slice.
- Typecheck, lint, unit, integration and e2e tests pass; new logic has tests.
- No horizontal scroll from 320 px to 1600 px; axe reports no serious issues; the brand rules hold; the budgets in `docs/12-engineering-standards.md` §2 hold (Lighthouse CI, its resource summary included, D-45); the headers and cookie-inventory tests pass.
- No invented content; new placeholders are listed with their input IDs; new copy passes the writing standard.
- Docs and `docs/decisions.md` updated if behaviour or a decision changed.
- No secrets, no personal data in fixtures or logs.
- The `iiic-reviewer` subagent reports no Blocker or Fix findings.

## Docs

`docs/README.md` (index) · `00-platform-plan.md` · `01-product-requirements.md` · `02-routes-and-pages.md` · `03-user-flows.md` · `04-data-model.md` · `05-admin-panel.md` · `06-automations.md` · `07-stack-and-integrations.md` · `08-security-privacy-compliance.md` · `09-content-and-inputs.md` · `10-build-plan.md` · `11-experience-concept.md` · `12-engineering-standards.md` · `13-email-and-messaging.md` · `14-technical-direction.md` · `15-operating-system.md` · `content/` (copy architecture and verbatim sources) · `decisions.md` · `research/` · `prototype-prompt.md`
