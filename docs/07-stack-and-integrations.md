# 07 · Stack and integrations (architecture decision record)

Status: **recommended, awaiting confirmation** (`decisions.md`). Research done 30 October 2026; prices exclude GST and change often, so re-check before signing up. Source links are in `research/` (see the end of this file).

## The decision in one table

| Layer | Choice | Why | Alternative kept in reserve |
| --- | --- | --- | --- |
| App | **Next.js (App Router, TypeScript)**, one codebase serving the platform domain now and `iiic.edu.in` later through host-based routing | One typed codebase one person can maintain with Claude Code | — |
| Admin, content, data layer | **Payload CMS 3.x, pinned to 3.94.x** (3.92.x when researched; set to the current release at the start of M1, 19 November 2026), running inside the Next.js app (MIT licence; owned by Figma since June 2025) | The only option where schema, access rules, hooks, jobs and the admin UI all live in the same TypeScript repo; the generated admin covers most screens and custom views cover Today, Calendar, Pipeline and Reports | Directus 12 (better operator defaults: enforced 2FA, calendar and kanban layouts, Flows, activity log; but a second service, Vue extensions, config in the database, a yearly licence key under its grant) |
| Hosting | **Vercel Pro**, functions in Mumbai (`bom1`; the default is the US and must be changed) | No servers to patch; preview deployments per branch; cron down to every minute. Hobby is for "personal or non-commercial use" only (Vercel's terms, §4) | Cloudflare Workers Paid ($5 a month), the one cheaper option weighed on 19 November 2026: it needs the OpenNext adapter, Hyperdrive to Supabase, Cloudflare Images instead of sharp and Browser Rendering for PDFs, and Payload on Workers is less proven. Free tiers do not fit: Workers Free allows 10 ms of CPU per request, Netlify Free pauses every site when its credits run out, Render Free sleeps after 15 minutes. Also Render (Singapore) or a Bangalore VPS with Coolify |
| Database | **Supabase Pro (Mumbai, `ap-south-1`) used as plain Postgres** through its pooler; schema changes by migration in every environment, never push | Same AWS region as `bom1`; daily backups kept 7 days | DigitalOcean Managed Postgres (Bangalore) |
| Files | **Cloudflare R2** through Payload's S3 adapter, uploads through the server up to 4 MB (D-46); a public bucket for media, a private bucket for invoices, certificates and proposals | No egress fees; S3-compatible, so portable | S3 Mumbai |
| Jobs and automations | **Payload jobs queue**, triggered every minute by Vercel Cron (protected by `CRON_SECRET`); `waitUntil` for reminders, `schedule` for digests | Small volume; no extra vendor | Trigger.dev or Inngest if volume or complexity grows |
| Payments | **Razorpay**: 2% on cards, netbanking, wallets and UPI (a platform fee; UPI's statutory MDR is zero), T+2 settlement, payment links, webhooks retried for 24 hours, typed official Node SDK; no GST registration needed to onboard | One dashboard the operator can run; Zoho Books invoices payable through it; the most mature SDK. About ₹5,900 in fees for every ₹2.5 lakh collected (GST included) | Cashfree (1.95%, and 0% up to ₹20 lakh of sales until 31 March 2027, saving up to about ₹39,000 in the first months; raise its webhook retries to the maximum). Stripe is invite-only in India |
| Invoicing | **Zoho Books** (Free while revenue stays under ₹25 lakh a year and 1,000 invoices; Standard ₹749 a month billed yearly after that) as the system of record for invoices: the payment webhook creates the invoice and records the payment through the API (India endpoint); B2B invoices are raised by the operator in Zoho, payable by bank transfer or a Razorpay link | GST-correct documents (tax invoices, credit notes, advances), GSTR reports for the accountant, India data centre; Razorpay's API cannot create GST invoices | The platform's own invoice template (`src/brand/templates/print/invoice.html`) for plain receipts while unregistered, with a monthly export for the accountant |
| Scheduling | **Built in, with two-way Google Calendar sync** (D-02, D-22): working hours set in the admin, slot engine, holds and time requests. Each practitioner's Google Calendar busy times are read (free/busy plus change notifications) so those times are never offered; every booking is written to their calendar (without attendees) with a unique Meet link for online sessions or the office address, and updated on reschedule or cancel. Clients get an `.ics` invite with every confirmation, which works in Google, Apple and Outlook | Booking, payment links, course seats and testimonials tied to bookings need one data model; the calendar sync keeps practitioners in the tool they already use; Cal.com takes no Razorpay and its commercial code closed in April 2026 | Zoho Bookings (booking data would live outside the platform) |
| Mailboxes and calendars | **Google Workspace Business Starter** on the platform domain (₹270 per user a month plus 18% GST in the October 2026 research; introductory prices may apply): mailboxes, each practitioner's Google Calendar, and Meet links for online sessions (D-03, D-23). Shared addresses (hello, bookings, privacy) are free group aliases | Online sessions and two-way calendar sync need it; transactional mail never goes through mailboxes | Zoho Mail Lite (₹59 per user a month), only if every session were at the office |
| Transactional email | **Resend** through Payload's email adapter; React Email templates ported from `src/brand/templates/email/` | Built for React Email and Next.js; free under 3,000 a month, $20 Pro after | Postmark (if inbox placement suffers); Amazon SES (cheapest) |
| WhatsApp | **A WhatsApp Business Solution Provider with a shared inbox: AiSensy Basic** (₹1,500 a month plus Meta's message fees with the provider's markup) | The operator gets a team inbox; one API call per template from Next.js; supports coexistence with the WhatsApp Business app | Interakt Advanced (documented webhooks); direct Meta Cloud API (cheapest, but no inbox) |
| Newsletter | **Resend Broadcasts** with double opt-in built in the app (the platform must record consent anyway) | One email vendor, one set of DNS records, React Email for every message | MailerLite (friendlier visual editor for non-technical writers; double opt-in built in) |
| Customer sign-in (R2) | **Better Auth** email-OTP and phone-OTP plugins, in their own schema, linked to `people` by verified identifiers. Start with **emailed 6-digit codes** (no registration, about ₹0); add a **WhatsApp authentication template** (about ₹0.115 a message plus the provider's markup) for phone verification; SMS only if D-08 asks for it, after TRAI DLT registration (about ₹5,900 with GST, two to three weeks, possibly a GST certificate), then 2Factor (₹0.17) or MSG91 (₹0.25) | Codes rather than magic links survive corporate link scanners and in-app browsers; mobile numbers are collected for reminders without verification until accounts exist | Payload auth with custom OTP endpoints |
| Staff sign-in | **Payload auth** (lockout, revocable sessions) **plus TOTP two-factor** through `payload-totp` 3.0.7 (MIT; its source reviewed before adoption, 19 November 2026), with the secret encrypted at rest, IIIC's own setup and verify views (one labelled code field), ten single-use recovery codes and the owner's reset in the repo | Payload core has no 2FA; staff 2FA is mandatory | TOTP in the repo on `otpauth`, if the plugin stops being maintained |
| PDFs | **The brand's HTML print templates rendered by headless Chromium** (`playwright-core` with `@sparticuz/chromium` in a dedicated function with raised memory), run as a job | One template source for preview and PDF; the templates are already verified in Chromium, including pagination; generation is asynchronous and low-volume | `@react-pdf/renderer` (pure JavaScript, no browser; the templates would have to be rebuilt in its primitives with static font files) |
| Lesson video (R2) | **Bunny Stream** with token authentication | Cheap storage and delivery, free encoding | Mux |
| Analytics | **Cloudflare Web Analytics** (free, cookieless) for traffic; funnel metrics computed from the platform's own records and an anonymous event table | No consent banner needed for cookieless analytics; the plan's metrics come from bookings, Map results and enrolments anyway | Plausible or Umami if marketing wants richer dashboards |
| Errors and uptime | **Sentry** (free tier) and **UptimeRobot** (free, commercial use allowed) | — | — |
| Logs | **A Vercel log drain to a log store with one-year retention** (provider and price chosen in M1, D-17), plus the audit log in Postgres | CERT-In requires 180 days of logs and the DPDP Rules at least one year; Vercel's own log retention is short | A drain endpoint that writes compressed daily batches to the private R2 bucket |
| Anti-spam | **Cloudflare Turnstile** on every public form and every code request | Free, privacy-friendly | — |
| CRM | **Inside Payload** (leads, activities, proposals) | Avoids syncing personal data to a second system | HubSpot free, if sales grows a team |

Why not the others: Strapi has no built-in 2FA and puts audit logs behind Enterprise; Supabase with a hand-built admin means writing every screen; Django adds a second language; Cloudflare Workers needs OpenNext workarounds and Payload's Cloudflare template uses SQLite; Neon's nearest region is Singapore (about 54 ms more per database round trip than Mumbai).

## Known gaps in the chosen stack, closed on purpose

| Gap | How it is closed |
| --- | --- |
| Payload has no 2FA in core | TOTP for every staff account, enforced at login; recovery codes; re-authentication for exports, role changes and erasure |
| Payload has no cross-collection audit log | An append-only `audit_log` collection written from hooks (create, update, delete on S2/S3 data; reads of S3 records); no update or delete access for anyone |
| Payload custom admin views are public by default | Every custom view and endpoint checks the user and role first; a test asserts each one rejects anonymous requests |
| Field-level access returns only true or false | Sensitive fields (notes, Map answers) live in their own collections with collection-level rules |
| `autoRun` must not be used on Vercel | Jobs run only from the cron-triggered endpoint |
| Payload v4 is in beta (announced 19 October 2026) | Pin `payload@3.94.x` and all `@payloadcms/*` to the same version; move to v4 only after it is generally available and has a patch release or two |
| Next.js and Payload are tightly coupled | Pin Next.js to the version Payload 3.94 supports (16.4.x); upgrade both together on a branch with the full test suite |
| Serverless Chromium is heavy | A single dedicated PDF function (memory raised, 60 s timeout), called from jobs only, with the output cached in the private bucket |

## Integrations

| Service | Used for | Setup | Webhooks into the platform |
| --- | --- | --- | --- |
| Razorpay | Checkout, refunds, payment links for manual invoices | Account in IIIC's name, KYC (PAN, ID and address proof, a business proof such as a Shops and Establishment certificate, bank proof), live and test keys, webhook secret | `payment.captured`, `payment.failed`, `refund.processed`, `order.paid` → `/api/webhooks/razorpay` (signature verified on the raw body, stored by event id, order status polled as a fallback) |
| Zoho Books | Invoices, credit notes, payment records, GST reports | Organisation on the India data centre; API client; invoice template styled from `src/brand/templates/print/invoice.html` (logo, ink, yellow total) | — (the platform calls Zoho; Zoho does not call back) |
| Resend | All email | Verified sending subdomains, e.g. `notify.` (transactional) and `news.` (newsletter); SPF, DKIM, DMARC on the root | Delivery, bounce, complaint → `/api/webhooks/resend` |
| AiSensy (WhatsApp) | Confirmations, reminders, feedback, login codes, the operator's inbox | WhatsApp Business Account in INR; display name; templates submitted for approval | Delivery and read status, incoming messages (confirm the plan includes them) → `/api/webhooks/whatsapp` |
| Google Workspace and Calendar API | Reading each practitioner's busy times; writing bookings to their calendars without attendees; unique Meet links | Google Workspace on the platform domain; a Google Cloud project; a service account with domain-wide delegation limited to the Calendar scope (or per-practitioner OAuth); free within quota (1,000,000 requests a day per project) | Calendar change notifications → `/api/webhooks/google-calendar` (channels renewed before expiry; a resync every 15 minutes as the fallback, B14) |
| Cloudflare | DNS, R2, Turnstile, Web Analytics | Zone for the platform domain | — |
| Sentry, UptimeRobot | Monitoring | Projects and alerts to owners | — |

## Environments

| Environment | Where | Data | Payments and messages |
| --- | --- | --- | --- |
| Local | Developer machine; Postgres in Docker | Seed data, clearly fake | Razorpay test mode; emails to a sandbox; WhatsApp off |
| Preview | Vercel preview per pull request; a separate Supabase project | Seed data | Test mode only |
| Production | Vercel `bom1`; Supabase Mumbai | Real | Live |

Every vendor account is opened in IIIC's own name with an IIIC email address and two-factor authentication, with at least two owners able to recover it. Nothing runs on personal accounts or on the existing office geofencing server.

## Monthly running cost (estimate)

| Item | Launch (~300 bookings a month) | Ten times that |
| --- | --- | --- |
| Vercel Pro | $20 | $20–50 |
| Supabase Pro | $25 | $30 |
| Resend (email and newsletter) | $0–20 | $20–40 |
| R2 and Bunny Stream | $1–5 | $11–21 |
| Sentry, UptimeRobot, Turnstile, Cloudflare Web Analytics | $0 | $0–38 |
| WhatsApp provider (AiSensy Basic, about 4 utility messages per booking) | ₹1,800–1,900 with GST | ₹3,000–5,000 (estimate) |
| Zoho Books | ₹0 (Free) | ₹749 (Standard, billed yearly) plus GST |
| Google Workspace Business Starter (3 users) | ≈ ₹810 plus GST | same, plus ₹270 for each further practitioner |
| Log store with one-year retention | to price in M1 | to price in M1 |
| **Total** | **about $46–70 plus ≈ ₹2,800 (GST included)** | **about $81–179 plus ≈ ₹4,800–6,800** |

Payment gateway fees are separate: Razorpay's 2% plus GST is about ₹5,900 for every ₹2.5 lakh collected. NPCI has announced (and postponed) a 0.40% MDR on merchant UPI payments above ₹2,000; if it starts and is passed on, it adds 0.40% to each such payment. Also excluded: domain registration, SMS (only if chosen; plus DLT registration), GST on foreign services.

## Research files

The full research reports with every source URL and access date are kept in `docs/research/` (messaging, architecture, payments, compliance). Treat their prices as a snapshot dated 30 October 2026.
