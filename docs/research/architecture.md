# Research: architecture (admin, hosting, data, scheduling, tools)

Research snapshot, 30 October 2026. Prices in USD per month, excluding tax, unless stated. † marks a well-known feature not re-checked in this research.

## 1. Admin / back office

| | Payload 3.x | Directus 12 | Strapi 5 | Supabase + Refine | Django / Wagtail |
|---|---|---|---|---|---|
| Version · licence | 3.92.0 (22 Oct 2026) · MIT · owned by Figma since Jun 2025 · v4 beta announced 19 Oct 2026, no GA date [1–5] | MSCL-1.0, which becomes GPL-3.0 after 4 years · full features free under the Open Innovation Grant (under $5M revenue and under 50 staff; key lasts 1 year, renew yearly) [20–22] | 5.60.0 (28 Oct 2026) · Community edition MIT · Growth $45 for 3 seats [26–27] | Refine is MIT [35] · Supabase Pro $25 [30] | Django 5.2 LTS, security fixes to Apr 2028 · Wagtail 7.4 LTS, supported to Nov 2027 [36–37] |
| How it runs | Inside the Next.js app | Separate Docker service | Separate Node service | Hosted database plus an admin you build | Separate Python app |
| Admin UI | Generated from TypeScript config; dashboard widgets and custom root, list and edit views. Custom views are **public by default**, so each one must check auth itself [15] | Generated from the database; built-in Calendar and Kanban layouts; extensions in Vue 3 [24–25] | Generated | Every screen hand-built | Mature generated admin |
| Access control | Collection and field level; field rules return only true/false [8] | Policies | RBAC in the free edition [27] | Postgres RLS | Model permissions† |
| Automation | Lifecycle and auth hooks [9]. Jobs queue supports cron `schedule` and `waitUntil`; on serverless an external cron must call the runner [10–11]. Resend and Nodemailer email adapters [12] | Flows (admin-only, each run logged) [25] | Lifecycles/webhooks† | Database functions plus an external cron | Celery/cron† |
| 2FA | Not in core [6]; community plugins only [16] | Built in; can be required per policy [23] | No built-in TOTP; MFA only through paid SSO [29] | Basic MFA free; phone MFA $75 [30] | django-two-factor-auth 1.18.1 (Sep 2025) [38] |
| History / audit | Versions, drafts, autosave and restore; docs don't say how the author of each change is recorded [13] | Activity log and revisions (30-day retention on Core) [22] | Content history 14 days (Growth); audit logs Enterprise only [27] | Build it yourself | Admin history† |
| Hosting | No extra service | Own VPS, or Cloud Core $89 (annual) / $99 (monthly) [22] | Cloud Starter $35 (sleeps when idle), Pro $90 [28] | Pro $25 | VPS |
| Fit with Claude Code | Best: schema, access rules, hooks and admin are typed TypeScript in one repo; has an MCP plugin [18] | Medium: configuration in the database; second UI framework | Medium | Clean code, but the most code to write | Adds a second language |

**Payload details.** Postgres: first-party adapter built on Drizzle; schema push works only in development; production uses migrations; `schemaName` is experimental [7]. Auth: cookies/JWT, API keys, custom strategies, email verification, lockout after failed logins, revocable sessions (on by default) [6]. Uploads: adapters for S3 (also works with R2), Vercel Blob, GCS, Azure, Uploadthing; Vercel caps request bodies at 4.5 MB, so larger files need `clientUploads`; the R2-native adapter is beta and Workers-only [14].

**Payload pain points.** No 2FA and no cross-collection audit log in core. Field-level access is true/false only. `autoRun` must not be used on Vercel [10]. Tightly coupled to Next.js: Next 16 with Turbopack broke it until a fix in Nov 2025 [17]. 3.92.0 raised the minimum Node version inside a minor release [2]. A v3 → v4 migration is coming.

**Supabase details.** Mumbai region (`ap-south-1`) [31]. The Free plan allows 2 projects, pauses them after 1 week idle, and has no daily backups [30, 34]. Phone OTP through Twilio, MessageBird, Vonage or Textlocal, or a Send-SMS hook for any provider; Supabase's docs point out India's TRAI DLT rules for SMS [32–33].

**Verdict: Payload 3.x.** The only option where admin, schema, access rules, hooks and jobs sit in the same typed Next.js codebase; the custom workflows (slot calendar view, booking statuses, refund action, certificate issuing, testimonial verification, lead stages) each become a small module Claude Code can read, test and diff. Directus is the alternative (enforced 2FA, Calendar/Kanban, Flows, activity log; but a second service, Vue extensions, config in the database, a yearly licence key). Payload's gaps must be closed on purpose: TOTP 2FA for staff, an append-only audit collection, an auth check in every custom view.

## 2. Hosting and data

| Option | Nearest compute | Entry price | Ops · backups | Cron / jobs |
|---|---|---|---|---|
| Vercel Pro | Mumbai `bom1` (default is `iad1`, must be changed) [45] | $20 per developer seat, includes $20 of usage. Hobby bans commercial use, explicitly including taking payments or paying a developer [43–44] | Lowest · database elsewhere | Cron down to every minute, 100 per project (Hobby: once a day) [46]. Functions run 300 s by default, 800 s max; 4.5 MB request body [47]. bom1 CPU $0.14/h [48] |
| Cloudflare Workers + OpenNext | Edge | $5 minimum [49] | Medium · OpenNext doesn't support Node middleware [51]; Payload's template uses D1 (SQLite) and needs the Paid plan [52] | Cron Triggers, 250 on Paid [50] |
| Railway | Singapore [54] | Hobby $5 minimum; RAM ≈$10 per GB per month [53] | Low [55] | Cron at least 5 min apart, UTC [56] |
| Render | Singapore [58] | Web $7 / $25; Postgres $6 / $19 [57] | Low · PITR 3 days (Hobby) / 7 days (paid) [57] | Cron billed per minute [57] |
| Fly.io | Singapore; no India region [59] | From $2.19 per machine [60] | Medium | — |
| Hetzner + Coolify | EU or Singapore | CX23 €5.49 + IPv4; Singapore CPX12 €15.49 [61–62] | High | System cron |
| DigitalOcean BLR1 + Coolify | Bangalore (13 ms from Mumbai) [64] | 2 GB $12, 4 GB $24 [63] | High · backups +20% weekly / +30% daily [63] | System cron |
| Vultr + Coolify | Mumbai / Bangalore / Delhi [67] | 2 GB $10, 4 GB $20 [66] | High | System cron |

Coolify is free to self-host (Apache-2.0); Coolify Cloud $5 for 2 servers [68]. Dokploy Cloud $4.50 per server; its repo includes a proprietary licence file [69].

| Managed Postgres | Nearest region | Price |
|---|---|---|
| Neon | Singapore only [71] | Launch plan $0.106 per compute-hour + $0.35/GB-month; scales to zero; 7-day restore [70] |
| Supabase | Mumbai [31] | Pro $25: 8 GB, Micro compute, daily backups kept 7 days; PITR from $100 [30, 34] |
| DigitalOcean | Bangalore [64] | From $15.15 (1 GiB) [65] |
| Railway / Render | Singapore | Usage-based / $6–19 [53, 57] |

**Object storage.** R2 $0.015/GB-month, no egress fees, first 10 GB plus 1M/10M operations free [72]. S3 Mumbai $0.025/GB-month plus about $0.109/GB egress (third-party) [73].

**Jobs.** Payload's jobs queue triggered by Vercel Cron is enough at this volume. Inngest: free for 50k executions, 5 concurrent steps, 24 h history; Pro from $99 [74]. Trigger.dev: free with $5 credit and 10 schedules; Hobby $10; self-hostable under Apache-2.0 [75].

**DPDP.** No general data-localisation mandate; Section 16 lets the government blacklist countries (none notified); localisation can be imposed only on Significant Data Fiduciaries (no categories notified); RBI payment-data storage rules bind the payment system (Razorpay's side) [76]. Timeline: 13 Nov 2025 Rules notified; 13 Nov 2026 consent-manager rule; 13 May 2027 most duties (notices, security safeguards, breach reports within 72 h, erasure, verifiable parental consent, logs kept at least 1 year) [77]. In Jan 2026 MeitY consulted on moving that date up to 13 Nov 2026 [78] (not verified whether notified).

**Latency** (WonderNetwork, from Mumbai, 29 Oct 2026) [79]: Bangalore 13 ms, Singapore 54 ms, Frankfurt 120 ms, Washington 259 ms. Vercel `bom1` and Supabase are both in AWS `ap-south-1` [31, 45].

## 3. Scheduling

| Option | Price | Razorpay | Fit |
|---|---|---|---|
| **Build it in** (Payload + Google Calendar API) | $0; the API is free for standard use; Google has announced billing for over-quota use later in 2026 [88] | Native | Handles the exact rules: 4 daily windows, 15/30/45 min sessions, holds during payment, course seats, more counsellors later. Two-way sync uses push channels that must be renewed and can be dropped, so a periodic resync is needed [89] |
| Cal.com | Free (1 user); Teams $12 and Orgs $28 per user (annual); APIs on Teams+; embeddable [80] | No; Stripe and PayPal only [80, 83] | Commercial code went closed-source with v6.4 (Apr 2026); the MIT fork Cal.diy is described as non-production [81–82] |
| Zoho Bookings | Free (1 user); Basic ₹360 / Premium ₹540 per user per month, annual (partner page) [84–85] | Premium only, one gateway at a time [86] | Booking data outside the platform |
| Calendly | Standard $10, Teams $16 per seat [87] | No | Round robin on Teams+ |

**Verdict: build it in.**

## 4. Supporting tools

| Need | Verified options | Pick |
|---|---|---|
| Analytics | Cloudflare Web Analytics: free, no cookies, localStorage or fingerprinting [93]. Plausible: $9 / $14 / $19 up to 10k pageviews, cookieless, EU-hosted; self-hosted AGPLv3 [90]. Umami: Hobby free (100k events, 1 site), Pro $20, cookieless, MIT [91]. PostHog: free 1M events, US or EU only [92]. GA4: its cookies need opt-in consent per an Indian law firm's DPDP analysis [94] | Cloudflare Web Analytics; add Umami or Plausible for funnels |
| Error tracking | Sentry free: 5k errors, 1 user, 30-day lookback; Team $26 (annual) [95] | Sentry free |
| Uptime | UptimeRobot free: 50 monitors, 5-min checks, commercial use allowed [96]. Better Stack free: 10 monitors, described as for personal projects [97] | UptimeRobot |
| Anti-spam | Cloudflare Turnstile: free, unlimited challenges, 20 widgets [98] | Turnstile on every public form and OTP request |
| PDF | @react-pdf/renderer 4.3.0, MIT, ~884k weekly downloads [99]. Playwright on serverless usually needs @sparticuz/chromium (over 50 MB; 512 MB RAM minimum, 1.6 GB preferred) [100]. Hosted PDF APIs not priced | Researcher: @react-pdf/renderer. Platform docs: HTML + serverless Chromium (see 07) |
| Lesson video | Bunny Stream: storage from $0.01/GB, delivery from $0.005/GB, free encoding, $1 minimum [101]. Mux: free for 10 videos and 100k minutes [102]. Cloudflare Stream: $5 per 1,000 min stored + $1 per 1,000 min delivered [103]. Vimeo Advanced $75, forced moves to the $400 plan reported Sep 2026 [104]. YouTube unlisted: anyone with the link can watch and reshare [105] | Bunny Stream |
| CRM | HubSpot free (2 users), Starter $15 per seat [106]. Zoho CRM free for 3 users [107]. Twenty Pro $9 per user [108] | Keep leads inside Payload |

## Researcher's recommended architecture

- One repo: Next.js (App Router, TypeScript) with Payload pinned to 3.92.x (needs Node 22.23.4 or later [2]); host-based middleware for the business domain now and an `iiic.edu.in` route group later; the admin on its own subdomain; move to Payload v4 after GA plus a patch release or two.
- Runtime: Vercel Pro with functions in `bom1`; Supabase Pro (Mumbai) as plain Postgres through its pooler; production schema changes through migrations [7].
- Files: R2 through `@payloadcms/storage-s3`, `clientUploads` on [14]; a public bucket for media, a private bucket for invoices and certificates.
- Customer login: Better Auth email-OTP and phone-OTP plugins (defaults: 3 attempts, 5-minute expiry), tables in a separate `auth` schema [39–40]; SMS through MSG91 at ₹0.25 per OTP on the 5k pack, after DLT registration [42, 32].
- Staff login: Payload auth plus TOTP via Better Auth's 2FA plugin or payload-totp after a code review [6, 41, 16].
- Workflows: bookings driven by Razorpay webhooks with an admin-only refund action; a slot engine with a calendar custom view; leads with a Kanban view (community plugin [19] or custom); testimonials attachable only to a completed booking or enrolment; a job issues certificates with a random ID and a QR code to `/verify/[id]`.
- Automations: Payload jobs (`waitUntil` for reminders, `schedule` for digests), Vercel Cron every minute protected by `CRON_SECRET` [10–11]; email through the Resend adapter [12, 109].
- Security and DPDP: append-only `audit-log` and `consents` collections written from hooks; Turnstile, Sentry, UptimeRobot.
- Backups: Supabase daily backups (7 days) [34], plus a nightly `pg_dump` to R2 kept 30 days, plus a quarterly restore test.
- Accounts: every vendor account in IIIC's own name; do not reuse the existing office geofence server, which sits in a relative's personal account.

| Item | Launch (~300 bookings/month) | 10× (~3,000/month) |
|---|---|---|
| Vercel Pro | $20 | $20–50 |
| Supabase Pro | $25 | $30 (Small compute) |
| Resend | $0–20 | $20 |
| R2 + Bunny Stream | $1–5 | $11–21 |
| Sentry / UptimeRobot / Turnstile / Cloudflare Web Analytics | $0 | $0–38 |
| Subtotal | ≈$46–70 | ≈$81–159 |
| MSG91 SMS OTP | ≈₹250–300 (1k OTPs) | ≈₹2,000–2,500 (10k OTPs) |

Excludes Razorpay fees, domains and taxes.

**Credible alternative:** Next.js on Vercel `bom1` with Directus 12 on the free grant licence, run through Coolify on a 4 GB DigitalOcean droplet in Bangalore, with DigitalOcean Managed Postgres (BLR1) and R2. About $64 at launch plus email and SMS. Trade-offs: two services, Vue 3 extensions for the slot engine and refund screens, server patching, a licence key renewed yearly, a licence regime that changed in 2026.

## Could not verify

Prices: Plausible above 10k pageviews; Zoho Bookings in INR; Zoho CRM paid tiers; Vimeo Starter and Standard; hosted PDF APIs; Fly Managed Postgres; Hetzner and Vultr backups; DigitalOcean managed-Postgres backup terms. Third-party only: S3 Mumbai rates; Hetzner CX23 availability; Vultr Bangalore/Delhi. Directus: whether the free Core tier has the pricing-page limits; Directus Cloud region; whether schema snapshots include Flows and permissions. Payload: how versions record the author; whether hooks share the database transaction; whether payload-totp and the kanban plugin work with 3.92; Supabase pooler behaviour with Payload transactions; v4 GA date and v3 support period. Cloudflare Worker size limit (64 MiB per Cloudflare vs 3/10 MiB per OpenNext). Whether MeitY's proposed 13 Nov 2026 DPDP deadline was notified. Latency from Ahmedabad; real Vercel usage; Razorpay fees; DLT cost and time; GST on foreign SaaS; Better Stack free-plan commercial use; Resend's sending region; Bunny's Asia rates and token auth; Cal.com's data region; Google Calendar over-quota pricing; the † items.

## Sources (all accessed 30 Oct 2026)

Payload: [1] https://github.com/payloadcms/payload/releases [2] https://newreleases.io/project/github/payloadcms/payload/release/v3.92.0 [3] https://payloadcms.com/posts/blog/payload-4-beta-redesigned-admin-tanstack-mcp [4] https://payloadcms.com/posts/blog/payload-is-joining-figma [5] https://github.com/payloadcms/payload [6] https://payloadcms.com/docs/authentication/overview [7] https://payloadcms.com/docs/database/postgres [8] https://payloadcms.com/docs/access-control/fields [9] https://payloadcms.com/docs/hooks/collections [10] https://payloadcms.com/docs/v3/jobs-queue/queues.md [11] https://payloadcms.com/docs/v3/jobs-queue/jobs.md [12] https://payloadcms.com/docs/email/overview [13] https://payloadcms.com/docs/versions/overview [14] https://payloadcms.com/docs/upload/storage-adapters [15] https://payloadcms.com/docs/custom-components/custom-views [16] https://www.pkgstats.com/pkg:payload-totp , https://www.buildwithmatija.com/blog/md/which-payload-cms-auth-plugin-to-use [17] https://github.com/payloadcms/payload/issues/14354 [18] https://newreleases.io/project/github/payloadcms/payload/release/v3.84.0 [19] https://www.pkgstats.com/pkg:payload-kanban-board

Directus: [20] https://github.com/directus/directus/blob/main/license [21] https://directus.com/docs/licensing/open-innovation-grant [22] https://directus.com/pricing [23] https://directus.com/docs/guides/auth/2fa [24] https://directus.com/docs/guides/content/layouts [25] https://directus.com/docs/guides/flows , https://directus.com/docs/guides/extensions/app-extensions/panels

Strapi: [26] https://github.com/strapi/strapi/releases [27] https://strapi.io/pricing-self-hosted [28] https://strapi.io/pricing-cloud [29] https://strapi.io/blog/strapi-admin-panel-mfa-2fa

Supabase / Refine / Django: [30] https://supabase.com/pricing [31] https://supabase.com/docs/guides/platform/regions [32] https://supabase.com/docs/guides/auth/phone-login [33] https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook [34] https://supabase.com/docs/guides/platform/backups [35] https://github.com/refinedev/refine [36] https://endoflife.date/django [37] https://endoflife.date/wagtail [38] https://pypi.org/project/django-two-factor-auth/

Auth / SMS: [39] https://www.better-auth.com/docs/plugins/phone-number [40] https://www.better-auth.com/docs/plugins/email-otp [41] https://www.better-auth.com/docs/plugins/2fa [42] https://msg91.com/in/pricing/otp

Vercel: [43] https://vercel.com/pricing [44] https://vercel.com/docs/limits/fair-use-guidelines [45] https://vercel.com/docs/regions [46] https://vercel.com/docs/cron-jobs/usage-and-pricing [47] https://vercel.com/docs/functions/limitations [48] https://vercel.com/docs/pricing/regional-pricing/bom1

Cloudflare: [49] https://developers.cloudflare.com/workers/platform/pricing/ [50] https://developers.cloudflare.com/workers/platform/limits/ [51] https://opennext.js.org/cloudflare [52] https://payloadcms.com/posts/blog/deploy-payload-onto-cloudflare-in-a-single-click

Railway / Render / Fly: [53] https://railway.com/pricing [54] https://docs.railway.com/reference/deployment-regions [55] https://docs.railway.com/reference/backups [56] https://docs.railway.com/reference/cron-jobs [57] https://render.com/pricing [58] https://render.com/docs/regions [59] https://docs.fly.io/reference/regions [60] https://fly.io/pricing

VPS and deploy tools: [61] https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ [62] https://www.bitdoze.com/md/hetzner-cloud-cost-optimized-plans.md [63] https://www.digitalocean.com/pricing/droplets [64] https://docs.digitalocean.com/products/platform/availability-matrix/ [65] https://www.digitalocean.com/pricing/managed-databases [66] https://www.vultr.com/pricing/ [67] https://blogs.vultr.com/Namaste-India-Vultr-has-landed-in-Mumbai , https://blogs.vultr.com/Vultr-expands-in-India-now-available-in-Bangalore-and-Delhi-NCR [68] https://coolify.io/pricing/ , https://github.com/coollabsio/coolify [69] https://dokploy.com/pricing , https://github.com/Dokploy/dokploy

Data and jobs: [70] https://neon.com/pricing [71] https://neon.com/docs/introduction/regions [72] https://developers.cloudflare.com/r2/pricing/ [73] https://costgoat.com/pricing/amazon-s3 [74] https://www.inngest.com/pricing [75] https://trigger.dev/pricing

DPDP and latency: [76] https://ksandk.com/data-protection-and-data-privacy/cross-border-data-transfers-dpdp-act-india/ [77] https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/ [78] https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/ [79] https://wondernetwork.com/pings/Mumbai

Scheduling: [80] https://cal.com/pricing [81] https://github.com/calcom/cal.com [82] https://alternativeto.net/news/2026/4/cal-com-is-going-closed-source-with-a-major-shift-in-its-license-strategy/ [83] https://forum.fossunited.org/t/can-cal-com-get-a-razorpay-integration/7445 [84] https://www.zoho.com/bookings/pricing.html [85] https://itforsme.in/pricing/zoho-bookings-india [86] https://help.zoho.com/portal/en/kb/bookings/integrations/payments/articles/razorpay-payment [87] https://calendly.com/pricing [88] https://developers.google.com/workspace/calendar/api/guides/quota [89] https://developers.google.com/workspace/calendar/api/guides/push

Tools: [90] https://plausible.io/ , https://plausible.io/data-policy , https://plausible.io/self-hosted-web-analytics [91] https://umami.is/pricing , https://docs.umami.is/docs/faq , https://github.com/umami-software/umami [92] https://posthog.com/pricing [93] https://www.cloudflare.com/web-analytics/ [94] https://www.mondaq.com/india/privacy-protection/1619518/cracking-the-cookie-code-digital-cookies-under-the-dpdp-act [95] https://sentry.io/pricing/ [96] https://uptimerobot.com/pricing/ [97] https://betterstack.com/pricing [98] https://developers.cloudflare.com/turnstile/plans/ [99] https://npmjs.com/package/@react-pdf/renderer [100] https://github.com/Sparticuz/chromium [101] https://bunny.net/pricing/stream/ [102] https://www.mux.com/pricing [103] https://developers.cloudflare.com/stream/pricing/ [104] https://petapixel.com/2026/09/04/vimeo-can-decide-to-change-your-plan-and-force-you-to-pay-5x-more/ [105] https://support.google.com/youtube/answer/157177 [106] https://www.hubspot.com/products/crm [107] https://www.zoho.com/crm/zohocrm-pricing.html [108] https://twenty.com/pricing [109] https://resend.com/pricing
