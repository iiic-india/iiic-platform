# 02 · Routes and pages

Every route the codebase serves, on both domains, with its register, purpose, data and main action. Page copy comes from `09-content-and-inputs.md`; missing facts render as placeholders. Navigation: **Framework · For organisations · Learn · Counselling · Proof · [Take the Map] · Log in** (in Release 1 the button reads **Find your path** and opens Map step 0; Log in appears in Release 2).

## Platform domain (`imagecatalysts.in`, D-05)

| Route | Release | Register | Purpose | Main action | Data |
| --- | --- | --- | --- | --- | --- |
| `/` | R1 | default | State the thesis; three doors; the Map invitation; proof strip; founder; Journal teaser | Find your path (R2: Take the Map), or a door | pages, counters, posts |
| `/framework` | R1 | default | Subjective Self explained (the Object/Subject flip, the four pillars, origins, who it is for, what changes); the founder's work as sourced (I-32) | Find your path (R2: Take the Map) | pages |
| `/map` | R1 step 0 · R2 full | default | "Who is this for?" then (R2) the questions | Recommended next step | map definition, map results |
| `/map/go` | R1 | — | Where step 0's form sends its answer (`03` F1): a 303 redirect to the visitor's door, or back to `/map` for anything else; the answer travels in the request's body, never in an address; stores nothing; noindex (D-67) | — | — |
| `/map/result/[id]` | R2 | default | The person's constellation, one recommended step and two related; noindex, its share image included, and never in the sitemap (D-67) | Book, enrol or request a Team Map | map results |
| `/founders` | R1 | consultancy | The founders' landing page: IIIC's supplied copy ("From ₹100 Crore to ₹1000 Crore") as a scroll narrative (`11` §3.5); the page LinkedIn posts and referrals land on | Book a Founder Consultation (books the proposal call until I-36) | pages |
| `/organisations` | R1 | consultancy | The three services, the method, the Team Map, case studies | Book a proposal call | pages, case studies |
| `/organisations/[service]` | R1 | consultancy | One landing page per service: organisation planning, marketing and sales, brand positioning | Book a proposal call | services, case studies |
| `/organisations/team-map` | R1 | consultancy | What a Team Map is; the request form (company, team size, sector) | Request a Team Map | leads |
| `/learn` | R1 | education | The certification: curriculum, format, fee, dates, certificate (placeholders until supplied) | Join a free info session; (R2) Enrol | courses, cohorts |
| `/counselling` | R1 | counselling | Approach (the direction line, D-19; modest, non-clinical claims), counsellors, individual and family sessions, format, how booking works (a free time or a request; no prices until IIIC publishes them, D-21), disclaimer and signposting | Book a session | services, practitioners |
| `/proof` | R1 | default | In their words (`#voices`): every published review, filterable by door, programme and decade (D-37); verified stories (R2; empty state until real), institutional work (PDEU 2023), counters with "how we count" | Open a case, then the matching path | testimonials, case studies, counters |
| `/proof/[slug]` | R1 | consultancy | A case study with client-approved numbers | Book a proposal call | case studies |
| `/journal` · `/journal/[slug]` · `/journal/topic/[topic]` (later pages at `/journal/page/[n]` and `/journal/topic/[topic]/page/[n]`, ten articles to a page, newest first; page 1 is the list's own address, so `…/page/1` redirects there; a topic with no published article, a page past the last and an unpublished article are the 404) | R1 | education | Articles applying the framework to work, family and self; the honest empty state while none is published (I-19). An article ends with its question to sit with and the link to its first topic's door. An article any of whose topics leads to counselling, and the list of a topic that does, are counselling surfaces: they end with the scope statement and the crisis numbers, and such an article has no devices (no reading bar, no copy button on its question; `08` §7; `11` §2 item 6, §6) | Subscribe | posts, topics |
| `/about` | R1 | default | IIIC, founder, team, partnerships, contact | Contact | pages, practitioners |
| `/institute` (+ `/research`, `/programmes`, `/partnerships`, `/verify`, `/verify/[token]`) | R1 (verify included, D-39) | education | Academic pages until `iiic.edu.in` is live; `/verify` takes a typed certificate ID, `/verify/[token]` is what the QR code opens (`01` §4); the verify pages are noindex, since a certificate shows a person's name (D-67) | Partnership enquiry; verify a certificate | pages, certificates |
| `/book/[type]` | R1 | from type | The booking flow (`03` F3; the payment step appears only once prices are published, D-24); `type` = `session` · `call` · `info` · (R2) `seat` | Confirm (and pay, once prices are published) | services, availability, bookings, payments |
| `/book/confirmed/[ref]` | R1 | from type | Confirmation, add to calendar, (R2) one opt-in bridge | Add to calendar | bookings |
| `/b/[token]` | R1 | from type | Manage a booking by secure link: details, reschedule, cancel within policy | Reschedule | bookings |
| `/subscribe/confirm/[token]` | R1 | default | Newsletter double opt-in landing | — | subscribers |
| `/feedback/[token]` | R1 | from type | Rate a session; optionally submit a story with consent | Send | bookings, testimonials |
| `/login` · `/login/verify` | R2 | default | One-time code by phone or email; noindex (D-67) | Sign in | accounts |
| `/account` (+ `/bookings`, `/map`, `/learning`, `/documents`, `/invoices`, `/privacy`) | R2 | default | My IIIC | Next recommended step | everything for that person |
| `/legal` | R1 | default | Legal information: the proprietor's legal name and trade name, address, website, GSTIN, customer care, grievance officer; from 1 January 2027 the dark-pattern compliance certificate | — | settings, pages |
| `/privacy` · `/terms` · `/refunds` · `/grievance` · `/accessibility` | R1 | default | Privacy notice and per-flow notices, terms, cancellation, refund and payment information, grievance officer, data requests and complaints (with the published response times) | Contact the grievance officer | pages |
| `/search` | R1 | default | Site search (pages, Journal, services, FAQs) from Payload's search plugin; also the 404 page's "Where were you headed?" | Open a result | search index |
| `/[...slug]` · `/organisations/[...slug]` · `/institute/[...slug]` · `/counselling/[...slug]` | R1 | default · consultancy · education · counselling, in that order | Any address no other route serves, those under `/organisations/`, `/institute/` and `/counselling/` in that section's register: the page published in the CMS at that address, or its starter page until a page there is first published (D-51, D-57); otherwise the 404 in the same register. A route built for an address takes precedence over them | — | pages |
| `404` (`not-found`) · `500` (`error`) | R1 | from the requested path (below the table) | The reflective 404 (`11` §5.1, concept per D-29) with the counselling scope line when the path was a counselling one; a plain, static 500 | Find your path | missing_pages |
| `/humans.txt` · `/.well-known/security.txt` · `/manifest.webmanifest` | R1 | — | Craft and standards (`11` §5.5; `12` §5) | — | — |
| `/admin/*` | R1 | admin theme | The back office (`05-admin-panel.md`) | — | all |
| `/api/webhooks/*` | R1 | — | Payment and messaging provider webhooks (signed) | — | payments, message log |
| `/api/health` | R1 | — | Liveness and database reachability for UptimeRobot; public by design (`12` §6, §7) | — | — |
| `/api/owner-setup` | R1 | — | The owner setup link (D-41) | — | — |
| `/api/*` (Payload) | R1 | — | Payload's REST API behind the admin, with the endpoints added to it: IIIC's `POST /api/pages/from-starter` (D-54) and `POST /api/report-test-error` (D-49); payload-totp's staff two-factor endpoints, `POST /api/setup-totp` (setting up the authenticator), `/api/verify-totp` (checking a code) and `/api/remove-totp` (removing the authenticator, which the plugin refuses because `forceSetup` is on); and IIIC's own two-factor endpoints, `POST /api/users/recovery-codes`, `/api/users/recover-two-factor` and `/api/users/:id/reset-two-factor` (recovery codes, recovery, an owner's reset; D-44) | — | all |
| `/robots.txt` | R1 (now) | — | The same on every deployment, before and after launch: every crawler allowed on the public pages, AI training crawlers included; the `*` group disallows only `/admin` and `/api/`, so search crawlers reach the other noindex routes and read their header; one group for the eight training crawlers repeats those rules and also disallows every noindex route (D-67), since the booking, feedback, confirmation, Map-result and certificate pages are reached by a token or an id, not by sign-in; the `Sitemap:` line (D-61, `12` §3) | — | — |
| `/sitemap.xml` | R1 (now) | — | The published pages and the starter pages still served, with the real `lastmod` where one exists; no noindex route (D-67); production origin only; one sitemap per domain (the institute's at R3) | — | pages (later posts, services, practitioners) |
| `/llms.txt` | R1 (now) | — | A plain-text summary for AI tools, generated from the same facts, titles and descriptions as the JSON-LD; nothing pending, no placeholder; sent with `X-Robots-Tag: noindex` (D-66) | — | pages, site facts |
| `/og/<slug>` (per page; `src/app/og/[...slug]/route.tsx`) · `/logo.png` | R1 | — | Share images generated from the kit's social template, 1200 × 630, served from the main domain, each address versioned by a hash of the page's title (`?v=`); a page without its own carries `/og/home`, which the platform layout gives; the logo the structured data names (D-62), served from the main domain so no setting on the media host can hide it | — | pages |

`book.html` registers: session → counselling, call → consultancy, info and seat → education.

A 404 takes its register from the requested path. A section's own page (`/organisations`, `/founders`, `/institute`, `/learn`, `/counselling`, while it is unpublished, D-57) and the catch-alls under `/organisations/`, `/institute/` and `/counselling/` give it the section's register; any other address gets the default register, `/learn/…`, `/founders/…` and `/book/…` included (the booking flow brings `/book/[type]` into the registers above in M3). On a counselling path (`/counselling` or `/book/session`, and any path under them) the 404 also carries the scope statement and the crisis numbers.

## Institute domain `iiic.edu.in` (Release 3)

Served by the same app through host-based routing. Until then these pages live under `/institute` on the platform.

| Route | Purpose |
| --- | --- |
| `/` | Who the institute is and the standards it holds |
| `/research` | The theory in depth, methodology, papers |
| `/programmes` | Syllabus, learning outcomes, assessment and certification standards |
| `/verify` · `/verify/[certificate]` | Enter a certificate ID or scan its QR code |
| `/partnerships` | University programmes (starting with PDEU, April 2023) and MoUs |
| `/faculty` · `/publications` · `/contact` | Credentials, papers and talks, institutional enquiries |

The institute links to the platform for programmes and services with one quiet link (to be confirmed with ERNET); nothing on the institute domain sells consultancy.

## Redirects

| From | To | When |
| --- | --- | --- |
| `iiicedu.com/*` | platform `/` (path-mapped by `content/sources/old-site-iiicedu-com.md`) | Launch |
| platform `/institute/*` | `iiic.edu.in/*` | ERNET approval |
| `www.` variants | apex | Launch |

## Page anatomy

Every page starts from `src/brand/templates/web/page-shell.html`: skip link, header, main, one yellow band at most (usually the closing call to action), footer with the legal row. Application pages follow: hero (thesis line, one primary action), what it is, how it works (`.iiic-steps`), proof (real or empty state), price or format, FAQ (`.iiic-accordion`), the closing band. The booking flow has no header navigation and no bridges. Narrative pages (`/`, `/framework`, `/founders`, Journal articles) add the bar and the devices in `11-experience-concept.md`, including reviews beside the sections that make a claim (`11` §3.8; D-37); counselling pages add no devices, and their reviews are plain cards in the text. The shell's footer address, phone and email are specimen values: M2 renders them from `settings` (the brochure address without a PIN until I-33; +91 96240 46464; the platform domain's address once I-02 exists).
