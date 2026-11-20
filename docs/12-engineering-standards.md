# 12 · Engineering standards

The bar the platform is built to: performance, search, security, caching, the backend and API, analytics and monitoring, code quality, accessibility, consent, policies, hosting and scalability. `01` sets the requirements, `07` the stack, `08` the law; this document turns them into budgets, checks and defaults that Claude Code applies on every pull request and that the release checks in `10` enforce. Where a tool's plan or price is quoted it is as of the research dated 30 October 2026 and 4 November 2026; re-check before relying on it.

## 1. Rendering model

| Route group | Rendering | Cache | Why |
| --- | --- | --- | --- |
| Public pages: `/`, `/framework`, `/founders`, `/organisations/*`, `/learn`, `/counselling`, `/proof/*`, `/about`, `/institute/*`, legal pages | Rendered per request (D-42) | The CMS data a page reads is cached and revalidated by tag when the editor publishes (a Payload `afterChange` hook calls `revalidateTag` for the page, its collection and the sitemap; on Next.js 16 the call takes a cache-life profile as its second argument); the HTML is not cached, because each response carries its own CSP nonce | Marketing pages never wait for the database; a traffic spike costs function time, not database load |
| `/journal/*` | Rendered per request (D-42); data revalidated on publish, and the index's every 10 minutes | Same | Same |
| `/map` (step 0), `/search`, `/404` | A light shell rendered per request (D-42); the search and the 404 log call small route handlers | — | Fast first paint; the dynamic part is tiny |
| `/book/*`, `/b/*`, `/feedback/*`, `/subscribe/confirm/*`, `/account/*` (R2) | Dynamic, server-rendered per request, `Cache-Control: private, no-store` | — | Personal and time-sensitive |
| `/admin/*` | Payload's admin (dynamic) | `no-store` | — |
| `/api/*` | Route handlers: webhooks, cron, `.ics`, PDFs, search, health, the 404 log | `no-store` unless a response is public and versioned | — |
| `/opengraph-image`, `/sitemap.xml`, `/robots.txt`, `/humans.txt`, `/.well-known/security.txt`, `/manifest.webmanifest` | Generated, cached at the edge with `s-maxage` of a day and `stale-while-revalidate` | — | — |

Data access is through Payload's local API inside server components and server actions (no HTTP round-trip to the app itself), with `depth` set explicitly on every query (no accidental deep population) and `select` limited to the fields the page renders. The institute domain is served by the same app through host-based routing in the request proxy (`src/proxy.ts`, Next.js 16's name for middleware): a request on an institute host is served from `/institute` (`INSTITUTE_HOSTS`).

## 2. Performance budgets

Measured on Lighthouse CI's throttled mobile profile (a mid-range Android on 4G) for the lab numbers, and in the field through Chrome UX Report data in Search Console once there is traffic. The field targets are the requirements in `01` (LCP under 2.5 s, INP under 200 ms at the 75th percentile); the lab budgets below are stricter so the field numbers hold on slower phones.

| Budget | Public pages | Booking and account | Admin |
| --- | --- | --- | --- |
| Largest Contentful Paint (lab) | ≤ 2.0 s | ≤ 2.5 s | — |
| Interaction to Next Paint (lab) | ≤ 150 ms | ≤ 200 ms | ≤ 300 ms |
| Cumulative Layout Shift | ≤ 0.05 | ≤ 0.05 | ≤ 0.1 |
| Time to First Byte from India | ≤ 600 ms (pages render per request in Mumbai, D-42) | ≤ 800 ms | — |
| JavaScript, gzipped, per page | ≤ 150 KB total; ≤ 6 KB for the experience devices (`11` §7) | ≤ 250 KB (the checkout script loads only on the payment step) | not budgeted, but Payload's admin bundle is not loaded on public routes |
| CSS, gzipped | ≤ 40 KB (the kit is ≈ 11 KB) | ≤ 40 KB | — |
| Fonts on first view | ≤ 120 KB: Manrope (Latin) preloaded; Fraunces loads on demand behind its size-adjusted fallback, because `next/font` cannot preload one face of a family and both faces together are about 150 KB; the rest on demand | same | — |
| Images | AVIF or WebP through `next/image` with `sizes` set; the LCP image (if any) `priority`; hero ≤ 200 KB; no image over 400 KB | same | — |
| Third-party requests | Cloudflare's analytics beacon only (deferred); Turnstile only on pages with a form, loaded on interaction | plus Razorpay checkout on the payment step | — |
| Lighthouse scores (CI gate) | Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100 | Performance ≥ 90, others 100 | — |

Rules that keep the budgets: fonts through `next/font/local` from `src/brand/fonts/` with `display: swap` and the kit's `unicode-range` subsets; no font loaded from a third party; the kit's CSS imported once in the root layout; page CSS in CSS modules or a single per-route stylesheet, never inline `<style>` per component; no client component unless it has state or an event handler, and no client component imports a server-only module; `next/dynamic` for the booking calendar and the admin-only widgets; `content-visibility: auto` on long pages; no layout work in `useEffect`; width and height on every image and iframe; `fetchpriority="high"` on the one asset that matters above the fold; `rel="preconnect"` only to origins the page will use in the first seconds; `size-limit` in CI fails a pull request that grows a route's JavaScript by more than 10 KB without a stated reason.

Vercel's image optimiser counts source images; keep the number of distinct images small (the CMS's media library is the source) and review the usage line in the monthly cost check (`14` §4); if it ever drives cost, switch the `next/image` loader to Cloudflare Images without changing components.

## 3. Search engine system

Everything a search engine, a link preview or a voice assistant reads comes from one place per page, edited in the CMS, rendered by one component.

| Element | Rule |
| --- | --- |
| Titles and descriptions | Payload's SEO plugin (`@payloadcms/plugin-seo`, pinned with Payload) adds `meta.title`, `meta.description`, `meta.image` and a preview to every page, post, service and practitioner. Titles ≤ 60 characters, written as a person would say the page's subject ("Counselling built on Subjective Self · IIIC, Ahmedabad"), never a keyword list; descriptions ≤ 155 characters, a sentence that answers the reader's question. The home page's title is "Indian Institute of Image Catalysts · Subjective Self". Written by people; the editor sees a warning, not a block, when a field is empty, and the release check blocks a public page without them |
| Canonical and robots | One canonical per page (the platform domain; the institute domain's pages have their own); `noindex` on booking, manage, feedback, confirm, search results, account and admin routes; preview deployments send `X-Robots-Tag: noindex` and are protected (§5) |
| Open Graph and Twitter cards | Generated images from the kit's social template (`src/brand/templates/social/`) through the `opengraph-image` route: the page's title in Fraunces on paper with the bar and the mark; 1200 × 630; per page, cached a day. Article images show the title and the author's name. (R2) The Map's share image is personal and never indexed |
| Sitemap | `sitemap.ts` built from the collections with `lastmod` from the document's `updatedAt`; excludes `noindex` routes; the institute domain has its own sitemap; both referenced from `robots.ts` |
| Robots | `robots.ts`: allow everything public; disallow `/admin`, `/api`, `/book`, `/b`, `/feedback`, `/subscribe`, `/account`, `/search`; `Sitemap:` lines for both domains |
| Structured data (JSON-LD, one script per page, generated from the CMS) | `Organization` (name, legal name when supplied, logo, address, telephone, `sameAs` with the three social profiles, I-34) on every page; `ProfessionalService` with the office's address and hours on `/about` and `/counselling` (not `MedicalBusiness` or any of its subtypes such as `Psychiatric`, which are clinical types); `Course` with `CourseInstance` on `/learn` once I-14 supplies dates and format (`isAccessibleForFree: false`, provider the organisation, no `aggregateRating` unless counted); `Event` for info sessions and workshops; `Article` with `author` (`Person`) and `datePublished` on Journal articles; `BreadcrumbList` on every page below the home; `FAQPage` is valid markup but Google no longer shows FAQ rich results for most sites, so it is optional; `WebSite` with `SearchAction` on the home page once `/search` exists (valid markup; Google retired the sitelinks search box in 2024, so it earns nothing on its own) |
| Internal linking | Every door links to the framework page and back; every Journal article links to its door; the proof hub links to the three doors; the footer carries the eight main links and the legal row; no orphan page (the release crawl reports pages with no inbound link) |
| URLs | Lower-case, hyphenated, stable; the slug is set once and changes create a redirect automatically (`redirects` collection, `@payloadcms/plugin-redirects`); dates never in URLs; no query parameters on indexable pages |
| Redirects | 301s from `iiicedu.com` by the map in `content/sources/old-site-iiicedu-com.md`; `www` to apex; HTTP to HTTPS; trailing-slash normalised; the institute's `/institute/*` to `iiic.edu.in` at R3 |
| Local search | A Google Business Profile for the office with the same name, address, phone and hours as `/about` (one PIN, I-33); the profile's "website" is the platform; reviews there are third-party proof the plan already counts |
| Search Console and Bing | Both verified at M2 on the staging domain and again at launch; Core Web Vitals, coverage and the sitemap checked weekly (`14` §4); Bing's IndexNow key published so new Journal articles are fetched promptly |
| Content strategy | The Journal is the compounding asset: one article per topic the readers search for, in the framework's words, answering one question each (the question becomes the title); topics map to the three doors plus the framework; a monthly cadence IIIC can keep (I-19) beats a daily one it cannot. Doors are written for the reader's situation, not for keywords; the founders' page is a landing page for LinkedIn and referrals and is indexable |
| What is not done | `Review` or `AggregateRating` markup for IIIC's own reviews (Google gives no star features to reviews an organisation hosts about itself; the reviews are content, not rich results); keyword stuffing; AI-generated articles; buying links; interstitials; paginated comment spam (there are no comments); `hreflang` until a second language exists (then `[locale]` routes with `hreflang` pairs and `x-default`) |

## 4. Caching and data

- **Cache** for page data and generated assets: pages render per request (D-42), the CMS data they read is cached by tag, and generated assets are cached at the edge (Vercel's CDN); on-demand revalidation by tag from Payload hooks so an editor's change is live within seconds without a rebuild; a scheduled revalidation every 10 minutes for indexes as a safety net.
- **Images**: `next/image` with a long `minimumCacheTTL` (a month); media files in the public R2 bucket are served through the app's image route, never hot-linked; file names include a content hash so they can be cached as immutable.
- **Database**: Supabase's connection pooler in transaction mode from serverless functions, with a small pool per function instance (`max` 3–5; 3 now; a 5-second limit on waiting for a connection, so a starved request fails instead of hanging) and `statement_timeout` set on the app's database role (15 s, applied after the migrations on every deployment by `pnpm db:settings`, because the transaction pooler ignores session settings); indexes on every foreign key and on the columns the booking engine filters (practitioner, start, status); the slot exclusion constraint (`04` § Rules the schema enforces) guarantees no double booking; `EXPLAIN ANALYZE` checked for the booking, Today and Pipeline queries before M3 and M5 ship; no query without a limit.
- **Jobs**: the queue table is indexed on `(status, run_at)`; the cron runner takes a bounded batch and finishes well inside the function's `maxDuration`; long work (PDFs, resyncs) is split into steps.
- **Sessions and holds**: slot holds and one-time codes live in Postgres with expiries and are swept nightly (O5); no Redis unless a measured need appears.
- **Client**: no client-side data cache library for public pages; server components fetch once per request; forms use server actions with progressive enhancement (they work without JavaScript).

## 5. Security hardening (in addition to `08` §9)

| Area | Standard |
| --- | --- |
| Headers | `Content-Security-Policy` with per-request nonces (set in the request proxy, `src/proxy.ts`; every HTML route renders per request, D-42) and `strict-dynamic`; `default-src 'self'`; `script-src 'self' 'nonce-…'` plus Cloudflare's beacon, Turnstile and, on the payment step only, the Razorpay origins its checkout documentation lists; `style-src 'self' 'unsafe-inline'` (Payload's admin injects styles at runtime; inline styles cannot run code); `frame-src` only Turnstile and Razorpay; `connect-src 'self'` plus the same; `img-src 'self' data: blob:` plus the R2 public bucket; `font-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` (over HTTPS only; locally and in CI it would send the page's own requests to an https nothing serves). Under `next dev` only, `script-src` also allows `'unsafe-eval'` for React's debugging. The proxy runs on every path except `/api` and Next.js's own build assets, and skips nothing on a request header. Build assets carry `default-src 'none'; frame-ancestors 'none'` instead, so a missing one renders a 404 in which nothing can run. Requests for Next.js's prerendered error pages and its internal pages (`/_app`, `/_document`, `/_error`) are served the site's own 404, with the nonce. `X-Frame-Options: DENY` backs up `frame-ancestors` for older browsers. `Strict-Transport-Security: max-age=63072000; includeSubDomains` at launch, `preload` submitted after a month without incident. `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on the owner setup link, whose query carries its token, D-41), `Permissions-Policy` denying camera, microphone, geolocation, payment (except the payment step), `Cross-Origin-Opener-Policy: same-origin`, relaxed to `same-origin-allow-popups` on the payment step if Razorpay's checkout needs `window.opener` for bank or UPI pop-ups (verify against its documentation in M3). Payload's colour-scheme client hints (`Accept-CH`, `Vary`, `Critical-CH`) are dropped: the admin is light only, and `Critical-CH` would make Chrome send a first visit's request twice. A Playwright test asserts the headers on every route group, that every script the server renders carries the nonce, and that pages and the admin run without a CSP violation |
| Previews | Vercel's deployment protection (Vercel Authentication) on every preview deployment, so seed data is never public; previews send `X-Robots-Tag: noindex` |
| Supabase | The project is used as plain Postgres: the Data API (PostgREST) must not expose Payload's tables; the `public` schema is removed from the exposed schemas (or Payload uses its own schema that is never exposed); the anon and service keys are not used by the app and are rotated at setup; Supabase's network restrictions are not relied on (Vercel Pro functions have no fixed egress addresses), so the database password is long, held only in Vercel's environment variables and rotated on schedule |
| Rate limits | Vercel's firewall rules (custom rules on every plan; rate limiting on Pro: check the plan's limits) for `/api/*`, `/book/*`, `/login/*` and the forms and the certificate lookup; application-level counters in Postgres for holds, code requests and feedback submissions keyed by identifier and IP; Turnstile on every public form and code request |
| Webhooks | Signature verified on the raw body; a timestamp tolerance of 5 minutes where the provider signs one; events stored by provider event id before processing; replayed events acknowledged and ignored; a 2xx only after the event is stored |
| Admin | TOTP for every staff account (`08` §9); sessions `HttpOnly`, `Secure`, `SameSite=Lax`; re-authentication for exports, role changes, refunds above the threshold and erasure; the audit log table has `UPDATE` and `DELETE` revoked at the database level, not only in Payload |
| Uploads | Allowed types and sizes per field; images re-encoded on upload (sharp) so metadata and payloads are stripped; documents stored in the private bucket and served through signed, short-lived URLs; nothing uploaded is ever executed or served with its original content type unchecked |
| Dependencies | Lockfile committed; Renovate weekly with Payload, `@payloadcms/*` and Next.js grouped and pinned (manual upgrade on a branch, `07`); `npm audit` (or `pnpm audit`) and `gitleaks` in CI; a failing high-severity audit blocks merge unless documented in `decisions.md` with a date to fix |
| Secrets | Vercel environment variables per environment; `.env.example` is the only env file in the repository; rotation on staff change and yearly; `PAYLOAD_SECRET` through `PAYLOAD_SECRET_PREVIOUS` (`08` §9); the `NOTES_ENCRYPTION_KEY` procedure in `runbook.md`; no secret in a client bundle (a CI grep for `NEXT_PUBLIC_` confirms only public keys cross) |
| Review | OWASP ASVS (5.0) level 2 checklist for authentication, session management, access control, validation, cryptography at rest, error handling and logging, run in M7 and after any change to those areas; findings tracked as issues with owners |
| Disclosure | `/.well-known/security.txt` with the security address (I-02); a reply within two working days; no bounty |

## 6. Backend and API

- **Boundaries.** Public inputs are validated with Zod schemas shared between the form and the server action; server actions return typed results (`{ ok: true, data } | { ok: false, error: { code, message, fields? } }`), never thrown strings; every error has a stable `code` the UI maps to copy from VOICE.md.
- **Route handlers** exist only for things that are not pages: webhooks, the cron runner, `.ics` files, PDFs, search, the 404 log, `/api/health` (returns 200 with a database round-trip and nothing else; UptimeRobot polls it, so it is public by design: it checks no user and answers only the status, whether the database responds and the commit), and the Google Calendar notification endpoint. Each declares `maxDuration` and `runtime` explicitly.
- **Domain events** are written in the same transaction as the state change (an outbox row), and the job runner turns them into jobs; a job is idempotent by `(event id, automation id)`; retries follow `06`.
- **Money** is integer paise everywhere; prices carry a history; tax is computed on the server with the CA's classification (I-29).
- **Time** is UTC in the database and the API; Asia/Kolkata only at the edge of rendering; the booking engine works in the practitioner's time zone (always Asia/Kolkata for now) and tests cover the daylight-saving-free but 30-minute-offset arithmetic.
- **Idempotency keys** on booking submission and payment-link creation, so a double tap never books or charges twice.
- **Logs** are structured JSON with a request id, the route, the role (not the user's name), timings and an error code; never a body, a note, an answer, a full phone number or email (`CLAUDE.md`). Payload's own request logging is set to the same rule.
- **Migrations** are generated, reviewed and committed; production runs migrations only through the deploy step; never `push` in production.
- **Tests** as in `10` § Quality and testing; the booking engine, consent and access rules have property-style tests over generated inputs.

## 7. Analytics and monitoring

What is measured, with what, and who looks at it (`14` §4 says when).

| Need | Tool | Rule |
| --- | --- | --- |
| Traffic (pages, referrers, countries, devices) | Cloudflare Web Analytics (cookieless, free) | The beacon is deferred; no personal data; no banner needed (D-14, D-30) |
| The plan's funnel (door chosen, step-0 answer, booking started, time chosen, booking confirmed, request submitted, Map completed in R2, newsletter confirmed) | A first-party `analytics_events` table written server-side (no client script): event name, route, register, anonymous session hash (rotated daily), no identifiers | Reported in Admin → Reports and the weekly report (O2); never joined to people |
| Core Web Vitals in the field | Chrome UX Report through Search Console (free); Vercel Speed Insights optional if more detail is wanted | Checked weekly; a regression below the `01` thresholds opens an issue |
| Errors and release health | Sentry, on the server only for now (D-49) (scrubbed: no request bodies, no user context beyond role; session replay off; an owner can send a test error) | Alerts to the owners' mailboxes on new issues in production and on an error-rate spike; a release is tagged per deployment |
| Uptime | UptimeRobot: the home page, `/api/health`, `/book/session` (status only) and a heartbeat the cron runner pings every run | 5-minute checks; alerts to owners by email and the Workspace mobile app; a public status page (UptimeRobot's free plan hosts it on its own subdomain; a `status.<domain>` address needs its Solo plan, decided at M7) |
| Logs | Vercel log drain to the store chosen in M1 (D-17, one-year retention) | Searchable by request id; an alert when 5xx responses exceed 1% over five minutes |
| Jobs and messages | Payload's job records and `message_log`, shown in Admin → Messages → Automations | O3 raises failures on Today and emails an owner after three failures in an hour |
| Email health | Resend's delivery, bounce and complaint webhooks; Google Postmaster Tools; DMARC aggregate reports | `13-email-and-messaging.md` §6 |
| WhatsApp health | The provider's quality rating and template status | `13` §7 |
| Payments | Razorpay dashboard; B11 reconciliation daily | Mismatches on Today |
| Costs | Vercel spend management alerts; Supabase spend cap on; R2 and Resend usage in the monthly check | `14` §4 |
| Security signals | Vercel firewall logs; Sentry; the audit log; Renovate and audit results | Reviewed weekly (`14` §4) |
| Broken links | `missing_pages` from the 404 page (`11` §5.1) | Top ten in the weekly report; redirects created in one click |
| Search | Search Console queries, coverage, sitemap status; searches with no results from `/search` | Monthly content review |

Nothing in analytics ever records what is said in counselling, a Map answer, a note or an identifier; the `analytics_events` table has no foreign key to `people` by design.

## 8. Code quality

- TypeScript strict, `noUncheckedIndexedAccess`, exhaustive switches; ESLint with `next`, `jsx-a11y` and `@typescript-eslint` recommended rules; Prettier; import order enforced.
- Tests: Vitest (unit, integration with a test database), Playwright (end to end, axe, headers, screenshots), Lighthouse CI with the budgets in §2, whose resource summary also holds each page's JavaScript, CSS and font sizes (D-45); `knip` for dead code once the codebase settles (D-45) and unused dependencies. All run on every pull request; `main` is protected and requires green checks and one review (the `iiic-reviewer` subagent's report attached).
- One package manager (`pnpm`), one Node version pinned in `.nvmrc` and `package.json` `engines`, matching Vercel's runtime.
- Conventional commits; decision and automation IDs in messages; a pull-request template that asks for the milestone, the decisions touched, the tests added, the screenshots, and the reviewer report; `CODEOWNERS` (`.github/CODEOWNERS`) with Yash (`@ofcyashsharma`, a collaborator with write access) on `docs/`, `.claude/`, `.github/` (the CI workflow included), `src/collections/` and `src/lib/payments/`; GitHub applies it to this private repository once the account is on GitHub Pro or Team.
- Feature flags are the `settings` flags in `04` (`prices_public`, `pay_at_booking`, `map_enabled`, `accounts_enabled`, `bridges_enabled`), read on the server; no third-party flag service.
- Documentation stays in `docs/` and is part of done (`CLAUDE.md`); `runbook.md` (M7) holds deploy, roll back, restore, rotate, breach; `CHANGELOG.md` per release.
- No dead code, no commented-out code, no `TODO` without an issue link; the `[[TODO: …]]` placeholder is content, not code.

## 9. Accessibility (WCAG 2.2 AA, in addition to `01`, `10` and the kit)

- The 2.2 criteria that matter most here: target size (24 × 24 CSS px minimum; the kit's controls are larger); focus not obscured (sticky header offsets are set; nothing floats over a focused control); consistent help (the contact link is in the same place on every page); redundant entry (the booking flow never asks for the same detail twice; the manage link pre-fills); accessible authentication (one-time codes can be pasted; no cognitive puzzles; Turnstile's managed mode, with its accessible fallback).
- Screen-reader paths recorded per release: NVDA with Chrome on Windows, VoiceOver on iOS Safari, TalkBack on Android Chrome; keyboard-only paths for every flow in `03`.
- 400% zoom and 320 px width without loss of content; text spacing overrides respected; `forced-colors` handled by the kit.
- Live regions for slot availability changes and form results; `aria-pressed` on the flip buttons; headings in order on every page; landmarks once each; the skip link first.
- Devanagari text carries `lang="sa"` (Sanskrit) or `lang="hi"`; Gujarati `lang="gu"` when it arrives.
- Media: no autoplay; captions and transcripts for any video (R2 lessons included).
- The accessibility statement (`/accessibility`, `11` §5.4) is written in M7 and dated per release; reports go to the hello address and are answered within five working days.

## 10. Consent, cookies and tracking

- **What sets a cookie at launch:** Payload's admin session cookie (only on `/admin`); the staff two-factor cookie (`payload-totp`, set when a staff member enters their code, HttpOnly, SameSite=Lax, as long as the session, removed at sign-out); Better Auth's session cookie (R2, only after sign-in); Turnstile's ephemeral token on pages with a form (no persistent cookie; strictly necessary); the owner setup cookie (`iiic-owner-setup`, ten minutes, sent only to `/api/users/first-register`, set only while the owner setup link is in use, D-41); nothing else. Razorpay's checkout runs on its own origin on the payment step. Cloudflare Web Analytics, Sentry and UptimeRobot set none. A Playwright test lists the cookies set on each route group and fails when a new one appears.
- **Therefore no banner at launch** (D-14): the privacy notice has a "Cookies and similar technologies" section that lists exactly these, with purpose and duration.
- **The consent gate is built anyway** (D-30), so adding a marketing pixel later (Meta or LinkedIn for B2B campaigns) is a content change, not a rebuild: a `<ConsentGate purpose="marketing">` component that renders its children only after a recorded consent; a `consent` cookie (first-party, one year, the purposes consented to and the notice version); a banner component from the kit with two buttons of equal weight ("Yes, allow" / "No, thanks"), no pre-ticked purposes, a link to the notice, and the choice changeable from the privacy page; the `Sec-GPC` header is honoured as a decline. No pixel is added without a decision recorded in `decisions.md` and the notice updated; under the DPDP Rules (duties from 13 May 2027) tracking consent must be specific and withdrawable, and the gate already works that way.
- **Children**: no analytics events and no marketing for under-18s (`08` §3) is enforced by the age band captured in booking and the Map, not by the gate.

## 11. Policies and legal pages

| Page or text | Content | Owner | Review |
| --- | --- | --- | --- |
| `/privacy` | The notice: who, what is collected per flow, purposes, legal basis (consent), processors (`08` §8), retention, rights, grievance officer, cookies, children, changes; per-flow notices linked from each form | Team (with the lawyer, I-22) and Yash | Each release; the DPDP transition before 13 May 2027 |
| `/terms` | Use of the site and the services, bookings, conduct, intellectual property (the framework, the Map, the content), limitation, governing law (Gujarat courts), changes | Team (with the lawyer) | Yearly |
| `/refunds` | Cancellation, reschedule, no-show and refund rules per service (D-16), the refund timeline, payment methods, fees, charge-backs, the gateway's contact (`08` §4) | Team (with the lawyer and the CA) | When D-16 changes |
| `/grievance` | The grievance officer, how to complain, acknowledgement within 48 hours, resolution within one month, the National Consumer Helpline (from 1 January 2027), data requests and the 30-day response | Team (with the lawyer) | Before 1 January 2027 and yearly |
| `/legal` | Legal name and trade name, address, GSTIN, customer care, grievance officer, CERT-In contact, the dark-pattern compliance certificate (from 1 January 2027) | Team (I-26) | Yearly |
| `/accessibility` | §9 | Yash | Each release |
| Counselling scope statement | Non-clinical; not diagnosis or treatment; not an emergency service; confidentiality and its limits; parental consent for under-18s; the crisis numbers (`08` §7) | Team (with the lawyer) | Before launch; crisis numbers re-checked each release |
| Consent texts | One per purpose (booking, counselling data, Map, Team Map, newsletter, WhatsApp updates, stories, account, course, partnership enquiry), versioned in the CMS; the version is stored with every consent record | Team (with the lawyer) | Each change is a new version |
| Testimonial consent | What is published, where, for how long, how to withdraw; the incentive line if any | Team (with the lawyer) | Yearly |
| Certificate terms (R1, D-39) | The fixed wording in `08` §7; verification; revocation | Team (with the lawyer) | Before the first certificate is issued |
| `security.txt`, `humans.txt` | `11` §5.5 | Yash | Yearly (the `Expires` field) |
| The dark-pattern self-audit | A yearly checklist against `08` §5, signed and displayed on `/legal` from 1 January 2027 | Yash with the lawyer | Yearly |

## 12. Hosting and infrastructure (the M0 checklist, in detail)

1. **Domains and DNS.** The platform domain registered in IIIC's name (D-05) at a registrar with two-factor and transfer lock; the zone on Cloudflare; the records for Vercel set to **DNS-only** (Vercel advises connecting directly rather than through Cloudflare's proxy; proxying needs Full (strict) TLS and disables Vercel's bot protection and verified-visitor signals); `www` to apex; `status` to UptimeRobot only if the Solo plan is taken (§7); the mail records in `13` §2; DNSSEC on; registrar and Cloudflare logins in the password manager with two owners.
2. **Vercel.** A team in IIIC's name, on Hobby for previews until the move to Pro before launch (D-04, M7); the project's function region set to `bom1` (the default is the US); Node version pinned; deployment protection on previews; spend management alerts; the log drain (D-17); cron enabled; environment variables per environment; the production branch is `main`, previews from pull requests only; the `iiic.edu.in` domain added when ERNET approves.
3. **Supabase.** An organisation in IIIC's name; the project in Mumbai (`ap-south-1`) on Pro; compute size the smallest that keeps the pooler healthy, reviewed monthly; daily backups (7 days) plus the nightly `pg_dump` to R2 (`08` §9); point-in-time recovery is an add-on worth adding once bookings are the business's record (price checked then); the Data API unexposed (§5); a long database password in Vercel's environment only (network restrictions cannot be scoped to Vercel's functions).
4. **Cloudflare.** R2: a public bucket for media (behind the app's image route) and a private bucket for documents, backups and logs, both in the Asia-Pacific location; Turnstile widgets (one per environment); Web Analytics site; DMARC Management for the zone.
5. **Google.** Workspace Business Starter on the platform domain (D-23) with 2-step verification enforced; a Google Cloud project with the Calendar API enabled and a service account with domain-wide delegation limited to the Calendar scope (`07`); Search Console and Business Profile owned by an IIIC account.
6. **Providers.** Resend (domains and webhooks), Razorpay (KYC, webhooks, test and live keys), Zoho Books (India data centre), AiSensy and the WhatsApp Business Account, Sentry, UptimeRobot, the log store: every account in IIIC's name, two-factor, two recovery owners, API keys per environment.
7. **GitHub.** A private repository under an IIIC organisation; branch protection on `main`; secret scanning and Dependabot alerts on; Renovate installed; the Vercel integration; no personal forks hold production secrets.
8. **Password manager.** One vault for IIIC (Bitwarden: its free organisation covers two people; the Families or Teams plan once more people need access) holding every login, recovery code and API key, with two owners; nothing in chats or spreadsheets.
9. **Nothing on personal accounts, nothing on the office server** (`07` § Environments; D-04).

## 13. Scalability

The platform is small by design and stays cheap by caching what public pages read (D-42). What grows, and what to do when it does:

| Growth | What strains first | Response |
| --- | --- | --- |
| Traffic × 10 (a viral article, a campaign) | Function time for page renders (their data is cached, so the database is not touched); the booking functions and the database pool | Vercel scales functions; raise the pooler's pool size and Supabase compute one step; the exclusion constraint (`04`) keeps bookings correct under concurrency (tested in M3) |
| Bookings × 10 | WhatsApp and email volumes (provider rate limits), Google Calendar API calls (quota is generous), job throughput | Batch the resync (B14), keep jobs small; Resend Pro; the WhatsApp provider's next tier; nothing architectural |
| Practitioners × 10 | Calendar watch channels and working-hours screens | Channels are per calendar and renewed by B14; the admin calendar filters by practitioner |
| Content × 10 | Nothing at build: pages render per request (D-42) | Page data is revalidated on demand; the sitemap is paginated past 1,000 URLs |
| The Map and Team Maps (R2) | Compute is trivial; the aggregate is computed by a job | — |
| A second language | Routes and strings | `[locale]` segment with strings externalised from M1 (`01`) |
| The institute domain (R3) | Host routing | Already in the request middleware |
| A second product line or a team of operators | Roles and the admin's custom views | Payload's access rules scale; the audit log already exists |

What would justify a bigger change, and only then: a hand-built admin (if Payload's views cannot express a workflow IIIC needs daily), a queue service (if jobs exceed what minute-cron handles), Postgres partitioning (never at this scale). Vendor exits are kept open: Postgres dumps, R2's S3 compatibility, React Email templates that work with any sender, Payload's MIT licence, and the domain and DNS in IIIC's hands.

## 14. Release gates added by this document

To the checks in `10` § Release checks: Lighthouse CI budgets (§2) green on the home, framework, founders, counselling and booking pages; the headers test (§5) green; the cookie inventory test (§10) unchanged or the notice updated; JSON-LD validated for every page type (§3); no orphan pages and no `[[TODO` in the crawl; `/accessibility` dated for this release; `security.txt` not expired; Search Console shows no new coverage errors.
