# 10 · Build plan

How the platform gets built with Claude Code: the order, what "done" means for each milestone, how each session should run, and the checks a release must pass. Durations are not given; scope and acceptance are.

## Working method with Claude Code

1. **One milestone, one branch, small pull requests.** Each pull request delivers a vertical slice that runs, with tests.
2. **Plan before code.** Start each milestone with `/milestone <ID>` (or the prompt at the end of this document): Claude Code reads `CLAUDE.md`, the docs named in the milestone, and `decisions.md`, then proposes the change list in plan mode. Approve the plan, then build.
3. **Review before merge.** Run the `iiic-reviewer` subagent on every pull request's diff; Blocker and Fix findings are fixed before merge.
4. **Tests first for the logic that costs money or trust:** the slot engine, holds, payment webhooks, refunds, invoice creation in Zoho Books and reconciliation, consent recording, access rules, the audit log.
5. **Preview every pull request** on its Vercel preview deployment with test-mode payments; review against the brand gallery.
6. **Never invent content.** Missing facts are placeholders (`[[TODO: …]]`), listed automatically on `/admin` → Content → Placeholders.
7. **Decisions are written down.** Anything not covered by the docs is asked, or recorded in `decisions.md` as a proposal for IIIC to confirm.
8. **Secrets stay out of the repo.** `.env.example` lists every variable; real values live in Vercel and the local `.env`.

## Milestones · Release 1

### M0 · Accounts and setup (no code; IIIC with Aum)

Domain registered and on Cloudflare DNS, records for Vercel set to DNS-only (D-05; `12` §12); the mail records in `13` §2; Google Workspace with an account per practitioner and the role inboxes (D-23; `13` §3); Vercel team, Supabase organisation (Mumbai), Cloudflare (R2, Turnstile, Web Analytics), Resend, Razorpay (KYC), Zoho Books (India data centre), WhatsApp provider and WhatsApp Business Account in INR, Sentry, UptimeRobot and a log store (D-17), all in IIIC's name with two-factor authentication and two recovery owners; a Google Cloud project for calendar sync (D-22). GitHub repository (private). Start the lawyer and CA reviews (`08-security-privacy-compliance.md` §10) now: they gate launch. Start collecting the reviews and their consents now (I-42, D-37): the team asks for new reviews with the request message, enters each in `docs/content/reviews-intake-template.xlsx`, screens it, and sends the consent message (both messages in `docs/content/review-consent-request.md`); replies are kept as evidence for the import in M2.

Done when: every account in `07-stack-and-integrations.md` exists with test credentials in a password manager, the checklist in `12` §12 is complete, DNS carries the records in `13` §2, and I-40 (the existing systems) is written down.

### M1 · Foundation

Next.js 16 with Payload 3.94.x pinned (the repository already holds `CLAUDE.md`, `.claude/`, `docs/` and `src/brand/`; if a scaffolder refuses a non-empty folder, scaffold in a temporary folder and move the app in); TypeScript strict; Postgres via Supabase with migrations; R2 storage; the brand kit in `src/brand/` (read-only), fonts through `next/font/local`, CSS layers imported once; the page shell (header, nav, footer, skip link) as layout components; host-based routing ready for the institute domain; environments (local with Docker Postgres, preview, production); CI: typecheck, lint, unit tests, Playwright smoke, axe, the security-headers and cookie-inventory tests, Lighthouse CI with the budgets in `12` §2 and `size-limit` on every pull request; Sentry; security headers (`12` §5); deployment protection on previews; the Supabase Data API unexposed; staff auth with TOTP two-factor; roles and access rules from `05-admin-panel.md`; the append-only audit log; seed script with clearly fake data.

Done when: a staff user can sign in with 2FA to `/admin` on a preview deployment; roles restrict collections as specified; an audit entry is written for every change; CI is green; Lighthouse on the shell meets the budgets.

### M2 · Content and public pages

Collections: pages (block-based, using the kit's patterns, with the `facts` array), posts, topics, FAQs, media (alt text required), practitioners, services, settings, redirects (with automatic redirects on slug change), consent versions, the search index, missing pages, analytics events, placeholders report, testimonials (the review fields in `04`), with a one-off import of the intake sheet and its consent evidence. Public pages from `02-routes-and-pages.md` and `content/copy-architecture.md` with IIIC's supplied copy verbatim, approved candidate lines, and placeholders elsewhere; the founders' page (D-25); the experience devices on narrative pages (`11`: the bar, the flip, the chapters, the reveals, the voices beside the text) and, on counselling pages, nothing but plain review cards; Proof's "In their words" with filters; Journal with topics, pagination, reading time and the question to sit with; Find your path (Map step 0); the search system in `12` §3 (SEO plugin fields, generated share images, sitemaps per domain, robots, structured data from the CMS, canonical and noindex rules); `/search`; the 404 (D-29) with the missing-pages log and one-click redirects, and the static 500; `humans.txt`, `security.txt`, the manifest; legal page drafts and `/accessibility`; `iiicedu.com` redirect rules from the map in `content/sources/old-site-iiicedu-com.md`.

Done when: every R1 route renders from the CMS in the right register at 320–1600 px with no horizontal scroll, axe reports no serious issues, editing a page in the admin updates it with a preview and revalidates the live page by tag, the acceptance in `11` §10 passes, Lighthouse CI meets the budgets on the home, framework, founders and counselling pages, and every public claim on a page points to a fact in `09` or `content/sources/`.

### M3 · Booking and payments

Services and prices (all-in, with price history and SAC codes) from the admin, hidden everywhere while `prices_public` is off (D-21); working hours and exceptions; two-way Google Calendar sync (busy blocks in, bookings with Meet links out; D-22); the slot engine (working hours, durations, buffers, notice, horizon, busy blocks) with the exclusion constraint; time requests (D-02); holds; the five-step flow for `session`, `call` and `info` (D-03 applied), with payment at booking or by link (D-24) with separate unticked consents, the counselling scope statement and crisis numbers; Razorpay orders, checkout, signed webhooks, idempotent processing, order-status polling, daily reconciliation; confirmation page; `.ics` and the practitioners' private calendar feeds (D-22); manage-booking links (reschedule and cancel within policy, D-16); refunds from the admin to the original payment method with approval above a threshold; invoices and receipts created in Zoho Books (D-13); proposal PDFs from the print templates (D-09).

Done when: end-to-end tests pass in test mode for paid booking, free booking, payment failure, hold expiry, reschedule, cancellation with refund, and the race where two people pay for one slot (exactly one confirmed, the other refunded); an invoice PDF matches the print template.

### M4 · Pipeline

Organisations, leads, activities, the Team Map request form, partnership enquiries, the Pipeline board (custom admin view, auth-checked), proposals with PDF versions and sending.

Done when: a Team Map request creates a lead with an operator task; a proposal can be generated, previewed, sent and tracked; stale leads surface.

### M5 · The admin experience

Custom views: Today, Calendar (week and day, drag to reschedule), Reports; global search; People record with the unified timeline; Proof moderation (feedback, case studies with evidence and client approval); Privacy (requests with deadlines, consent log, breach register); Settings screens; session notes (author-only, encrypted, read-audited, D-11); certificates (D-39): issue singly or in bulk with a preview, the PDF from the print template with a server-generated QR code, `/institute/verify` and `/institute/verify/[token]`, revocation and reissue, all audited.

Done when: the operator can run a full day from Today on a laptop and on a phone, a practitioner cannot see another practitioner's notes, every view rejects anonymous and unauthorised requests in tests, and a test decodes the QR code in an issued certificate's PDF, opens its verification page, sees it valid, revokes it and sees it revoked.

### M6 · Automations and messaging

Payload jobs and the cron runner; every R1 automation in `06-automations.md` (including O9, O10, V1, V2 and C5); email templates in React Email from the brand templates, tested on the matrix in `13` §5; the sending subdomains, reply-to routing and bounce handling in `13`; WhatsApp templates submitted and wired (email fallback); quiet hours; retries and failure alerts; the daily digest and weekly report; newsletter double opt-in, welcome and broadcasts (D-10).

Done when: each automation has a test that proves it fires once, at the right time, to the right channel, and respects consent and quiet hours; rescheduling re-plans reminders.

### M7 · Hardening and launch

The Vercel team moved from Hobby to Pro, with the project in it (D-04); performance and accessibility audits against `12` §2 and §9, with the accessibility statement written and dated; security review against OWASP ASVS (5.0) level 2 for authentication, access control, input handling and logging; the cookie inventory confirmed and the notice's cookie section written; rate limits and Turnstile on public forms; backups with a tested restore; logs flowing to the one-year store; booking concurrency test; content filled (no placeholders on public pages); lawyer-reviewed legal pages and notices; a dark-pattern review of every flow against `08` §5; PCI DSS SAQ A through the gateway; the CERT-In point of contact recorded; National Consumer Helpline convergence onboarding scheduled before 1 January 2027; DNS cutover; the mail launch checks in `13` §10 (SPF, DKIM, DMARC, seed tests, Postmaster Tools, the `info@iiicedu.com` forward); WhatsApp templates approved; Search Console, Bing and the Google Business Profile verified; the release gates in `12` §14; a live ₹1 transaction and refund; monitoring and alerts; runbooks (`docs/runbook.md`: deploy, roll back, restore, rotate secrets, breach response); a training session for the operator with a one-page guide.

Done when: every release check below passes.

## Release 2 · the engine (order)

1. Map definitions editor and the full Map with consent and results (needs I-15).
2. Accounts (Better Auth, email and WhatsApp codes), My IIIC, attaching earlier bookings.
3. Course: cohorts, enrolment and payment, lessons or live sessions (D-07), progress, attendance.
4. Certificates issued automatically on course completion (issuing, QR verification and revocation exist from Release 1, D-39).
5. Verified stories, publication consent and withdrawal.
6. Cross-path bridges with the "No, thanks" memory (D-18); live counters that show their working; counsellor access to shared Maps.
7. Team Map: invitations, anonymous responses, aggregate view with the minimum-responses threshold.

## Release 3 · the institute

Host routing for `iiic.edu.in`, institute pages, verification on the institute domain, 301 redirects from `/institute/*`, the single permitted link to the platform (I-25).

## Quality and testing

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Slot generation, policy rules, money and tax, the invoice payload sent to Zoho Books, consent rules, routing rules, date and time in IST |
| Integration | Vitest with a test database and Payload's local API | Access rules per role, hooks (audit, consent), jobs, webhook processing with recorded payloads |
| End to end | Playwright | Every flow in `03-user-flows.md` that R1 ships, on desktop and a 375 px viewport |
| Accessibility | axe-core inside Playwright, plus a manual keyboard and screen-reader pass per release | WCAG 2.2 AA |
| Performance | Lighthouse CI and `size-limit` on key pages | The budgets in `12` §2 (lab: LCP ≤ 2.0 s public, INP ≤ 150 ms, CLS ≤ 0.05; JavaScript ≤ 150 KB gzipped on public pages) |
| Visual | Screenshots of key pages compared per pull request | Brand fidelity |
| Security | Tests for auth on every custom view and endpoint, webhook signature rejection, rate limits; dependency audit in CI | ASVS level 2 areas |

## Release checks (every production release)

- No `[[TODO` string in any public page (a crawl of the preview deployment fails the release if it finds one).
- No sample or seed content in production data.
- Legal pages present and marked approved; `/legal` complete (proprietor's legal name, address, grievance officer); crisis numbers re-checked.
- No pre-ticked consent anywhere; every decline is a plain "No, thanks" of equal weight; totals shown before payment.
- All environment variables set; webhooks verified with a test event; cron running.
- Email authentication passes; WhatsApp templates approved; test messages delivered.
- Backups present and a restore tested in the last 30 days.
- Error rate and uptime monitors green; Sentry release created.
- `CHANGELOG.md` updated; any decision taken recorded in `decisions.md`.
- The gates in `12` §14: Lighthouse budgets, the headers test, the cookie inventory, JSON-LD validation, no orphan pages, `/accessibility` dated, `security.txt` not expired, no new Search Console coverage errors.

## The first Claude Code session

Open the repository with `CLAUDE.md`, `.claude/`, `docs/` and `src/brand/` in place, then run `/milestone M1`, or paste:

> Read CLAUDE.md, docs/README.md, docs/decisions.md and docs/10-build-plan.md. We are starting M1 · Foundation. Enter plan mode and propose the exact steps, files and packages (with pinned versions) to deliver M1's "done when". Do not start M2. Ask me about anything the docs do not settle.

Optional before M1: run `docs/prototype-prompt.md` to build the clickable HTML prototype and test the flows with five real people (two founders or HR leads, two prospective learners, one family). Feed what you learn back into `03-user-flows.md` before M3.
