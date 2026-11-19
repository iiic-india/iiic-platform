# 02 · Routes and pages

Every route the codebase serves, on both domains, with its register, purpose, data and main action. Page copy comes from `09-content-and-inputs.md`; missing facts render as placeholders. Navigation: **Framework · For organisations · Learn · Counselling · Proof · [Take the Map] · Log in** (in Release 1 the button reads **Find your path** and opens Map step 0; Log in appears in Release 2).

## Platform domain (decided at D-05; `iiic.works` recommended in the plan)

| Route | Release | Register | Purpose | Main action | Data |
| --- | --- | --- | --- | --- | --- |
| `/` | R1 | default | State the thesis; three doors; the Map invitation; proof strip; founder; Journal teaser | Find your path (R2: Take the Map), or a door | pages, counters, posts |
| `/framework` | R1 | default | Subjective Self explained (the Object/Subject flip, the four pillars, origins, who it is for, what changes); the founder's work as sourced (I-32) | Find your path (R2: Take the Map) | pages |
| `/map` | R1 step 0 · R2 full | default | "Who is this for?" then (R2) the questions | Recommended next step | map definition, map results |
| `/map/result/[id]` | R2 | default | The person's constellation, one recommended step and two related | Book, enrol or request a Team Map | map results |
| `/founders` | R1 | consultancy | The founders' landing page: IIIC's supplied copy ("From ₹100 Crore to ₹1000 Crore") as a scroll narrative (`11` §3.5); the page LinkedIn posts and referrals land on | Book a Founder Consultation (books the proposal call until I-36) | pages |
| `/organisations` | R1 | consultancy | The three services, the method, the Team Map, case studies | Book a proposal call | pages, case studies |
| `/organisations/[service]` | R1 | consultancy | One landing page per service: organisation planning, marketing and sales, brand positioning | Book a proposal call | services, case studies |
| `/organisations/team-map` | R1 | consultancy | What a Team Map is; the request form (company, team size, sector) | Request a Team Map | leads |
| `/learn` | R1 | education | The certification: curriculum, format, fee, dates, certificate (placeholders until supplied) | Join a free info session; (R2) Enrol | courses, cohorts |
| `/counselling` | R1 | counselling | Approach (the direction line, D-19; modest, non-clinical claims), counsellors, individual and family sessions, format, how booking works (a free time or a request; no prices until IIIC publishes them, D-21), disclaimer and signposting | Book a session | services, practitioners |
| `/proof` | R1 | default | In their words (`#voices`): every published review, filterable by door, programme and decade (D-37); verified stories (R2; empty state until real), institutional work (PDEU 2023), counters with "how we count" | Open a case, then the matching path | testimonials, case studies, counters |
| `/proof/[slug]` | R1 | consultancy | A case study with client-approved numbers | Book a proposal call | case studies |
| `/journal` · `/journal/[slug]` · `/journal/topic/[topic]` | R1 | education | Articles applying the framework to work, family and self | Subscribe | posts |
| `/about` | R1 | default | IIIC, founder, team, partnerships, contact | Contact | pages, practitioners |
| `/institute` (+ `/research`, `/programmes`, `/partnerships`, `/verify`) | R1 (verify R2) | education | Academic pages until `iiic.edu.in` is live | Partnership enquiry; verify a certificate | pages, certificates |
| `/book/[type]` | R1 | from type | The booking flow (`03` F3; the payment step appears only once prices are published, D-24); `type` = `session` · `call` · `info` · (R2) `seat` | Confirm (and pay, once prices are published) | services, availability, bookings, payments |
| `/book/confirmed/[ref]` | R1 | from type | Confirmation, add to calendar, (R2) one opt-in bridge | Add to calendar | bookings |
| `/b/[token]` | R1 | from type | Manage a booking by secure link: details, reschedule, cancel within policy | Reschedule | bookings |
| `/subscribe/confirm/[token]` | R1 | default | Newsletter double opt-in landing | — | subscribers |
| `/feedback/[token]` | R1 | from type | Rate a session; optionally submit a story with consent | Send | bookings, testimonials |
| `/login` · `/login/verify` | R2 | default | One-time code by phone or email | Sign in | accounts |
| `/account` (+ `/bookings`, `/map`, `/learning`, `/documents`, `/invoices`, `/privacy`) | R2 | default | My IIIC | Next recommended step | everything for that person |
| `/legal` | R1 | default | Legal information: the proprietor's legal name and trade name, address, GSTIN if registered, customer care, grievance officer; from 1 January 2027 the dark-pattern compliance certificate | — | settings, pages |
| `/privacy` · `/terms` · `/refunds` · `/grievance` · `/accessibility` | R1 | default | Privacy notice and per-flow notices, terms, cancellation, refund and payment information, grievance officer, data requests and complaints (with the published response times) | Contact the grievance officer | pages |
| `/search` | R1 | default | Site search (pages, Journal, services, FAQs) from Payload's search plugin; also the 404 page's "Where were you headed?" | Open a result | search index |
| `404` (`not-found`) · `500` (`error`) | R1 | from the requested path | The reflective 404 (`11` §5.1, concept per D-29) with the counselling scope line when the path was a counselling one; a plain, static 500 | Find your path | missing_pages |
| `/humans.txt` · `/.well-known/security.txt` · `/manifest.webmanifest` | R1 | — | Craft and standards (`11` §5.5; `12` §5) | — | — |
| `/admin/*` | R1 | admin theme | The back office (`05-admin-panel.md`) | — | all |
| `/api/webhooks/*` | R1 | — | Payment and messaging provider webhooks (signed) | — | payments, message log |
| `/sitemap.xml` · `/robots.txt` · `/opengraph-image` | R1 | — | Search and sharing (`12` §3): one sitemap per domain; generated share images from the kit's social template | — | — |

`book.html` registers: session → counselling, call → consultancy, info and seat → education.

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
