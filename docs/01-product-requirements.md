# 01 · Product requirements

What the IIIC platform must do, for whom, and how well. Derived from `00-platform-plan.md` and the project conversation; nothing here adds a business fact the team has not supplied. Unknown facts are listed in `09-content-and-inputs.md` and appear in the product as placeholders.

## 1. What IIIC is

Indian Institute of Image Catalysts (IIIC), Ahmedabad: a sole proprietorship founded by Gaurang Mistry. One theory, **Subjective Self** ("the first ever Indian theory of psychology that focuses on how the Indian society understands self in connection with their society, family values, patterns of thoughts, values of emotions, and environmental factors and benefits"), applied three ways:

| Application | Audience | Offer | Conversion goal |
| --- | --- | --- | --- |
| Consultancy (the core business) | Founders and HR leads at small and mid-size non-e-commerce businesses | Organisation planning, marketing and sales, brand positioning | A proposal conversation, through a free Team Map |
| Education | Learners | The Subjective Self certification course | A paid seat, through a free info session |
| Counselling | Individuals and families | 1:1 sessions of 15, 30 or 45 minutes, and family sessions; online or at the office, set per service (D-03); booked from the counsellor's real calendar or by request (D-02); no prices shown until IIIC publishes them (D-21) | A booked session |
| Institute (fourth audience) | Universities and institutional partners | Research, programmes, certificate verification, partnerships | A partnership enquiry |

Known proof: "Subjective Self", a two-day workshop on self-knowledge at Pandit Deendayal Energy University, 3–4 April 2023; a public workshop on 8–9 July 2023 at Cafe Venture Studio, Ahmedabad. Office: 408, The Claywalls, above Bonanza Salon, Zydus Hospital Lane, Hebatpur Road, Ahmedabad (the PIN is unconfirmed, I-33). Phone: +91 96240 46464 (both 2026 brochures; which number goes on documents is I-31). Sources in `09-content-and-inputs.md`; IIIC's own texts, verbatim, in `content/sources/`.

## 2. Goals and the measure of success

1. More B2B consultancy enquiries from qualified firms.
2. More course enrolments.
3. More counselling bookings, and more returning clients.
4. One ecosystem: the **cross-path rate** (clients active in two or more applications within six months ÷ all clients) is the headline metric. All metrics and definitions are in `00-platform-plan.md` § Metrics; baselines are set in the first month after launch.

## 3. Principles the build must keep

- **One platform, two domains.** All selling, booking, accounts and delivery run on the platform domain. The institute pages live at `/institute` until ERNET approves `iiic.edu.in`, then move with redirects. `iiicedu.com` redirects to the platform from launch. One codebase serves both domains.
- **Nothing invented.** No sample testimonials, counts, clients, credentials, fees or dates. Unknowns render as `[[TODO: …]]` chips in development builds and are blocked from production builds (see `10-build-plan.md`, release checks).
- **Proof is checkable.** Testimonials only through the verified flow tied to a real booking; every public number defined and counted from records.
- **Counselling is private.** What a client says in counselling is never used for marketing or routing. No offers inside a session, its notes or its reminders. Bridges from counselling run only on the client's own profile answers and explicit opt-ins.
- **Consent first.** Consent is recorded before any Map result, profile answer or marketing preference is stored.
- **Lawful by design.** Built to the DPDP standard from launch (duties apply from 13 May 2027) while meeting the SPDI Rules, CERT-In Directions, the E-Commerce Rules and the CCPA guidelines that apply today (`08-security-privacy-compliance.md`).
- **The brand kit is the design system.** `src/brand/` (kit 1.0.3) is used as-is: yellow lives on paper, never on dark.

## 4. Scope by release

Phasing follows the plan's roadmap, adjusted so launch needs no phone-OTP registration and no unwritten content. The split is a recommendation awaiting confirmation (`decisions.md`, D-01).

### Release 1 · Launch the platform

| Area | Included |
| --- | --- |
| Public site | Home, Framework, Founders (the supplied narrative page, D-25), For organisations (+ one landing page per service), Learn, Counselling, Proof (consented reviews of Gaurang Mistry's programmes, D-37, and honest empty states), Journal, About, Institute (`/institute`), legal pages and the accessibility statement, search, the reflective 404 and a plain 500 (`11`) |
| Find your path | Map step 0 only ("Who is this for?") routing to the right door; the full Map engine is built behind a flag and switched on when the founder's dimensions and questions exist |
| Booking | One flow for counselling sessions, proposal calls (free) and course info sessions (free): choose, date and time, details, payment (only once prices are published, D-24), confirmed; free times from each counsellor's working hours and Google Calendar, or a time request (D-02); confirmation, calendar invite, reminders; self-serve reschedule and cancel by secure link |
| Payments | Razorpay payment links while prices are unpublished, and checkout (UPI, cards, netbanking) once they are (D-24); webhook-confirmed payments; refunds from the admin; GST tax invoices from Zoho Books (D-13) |
| B2B pipeline | Team Map request form (company, team size, sector), proposal-call booking, lead pipeline in admin, proposal PDF from template |
| Journal and newsletter | Articles, categories, double opt-in signup, monthly issue |
| Admin | Today, calendar and availability, bookings, clients, leads, content, proof moderation, messages and automations, payments and invoices, privacy requests, settings, users and roles, audit log (see `05-admin-panel.md`) |
| Automations | Booking, reminder, follow-up, lead, newsletter and housekeeping automations marked R1 in `06-automations.md` |
| Compliance | Privacy notice and per-flow notices, consent ledger with written (email) consent receipts for sensitive data, grievance officer with 48-hour acknowledgement and one-month resolution, data-request handling, legal information page, refund, cancellation and payment information, counselling scope statement and crisis signposting, dark-pattern guardrails (`08-security-privacy-compliance.md`) |
| Measurement | Privacy-friendly analytics with the plan's funnel events; error and uptime monitoring |

### Release 2 · Turn on the engine

The full Subjective Self Map and Team Map (aggregate team picture), My IIIC accounts (phone OTP or email code), course sales and delivery (cohorts, enrolments, lessons or sessions, progress), certificates with QR verification, the verified-testimonial flow, cross-path bridges with the "No, thanks" memory (D-18), live counters that show their working, counsellor access to consented Map results before a first session.

### Release 3 · Open the institute

`iiic.edu.in` served from the same codebase once ERNET approves: home, framework and research, programmes and certification standards, certificate verification, partnerships (starting with PDEU, April 2023), faculty, publications, contact. Academic pages move from `/institute` with 301 redirects.

### Later (not designed yet)

Cohort outcome data, Gujarati and Hindi pages (start with counselling), alumni community, Team Map dashboards for clients.

## 5. User stories (Release 1 unless marked)

### Visitors

- As any visitor, I can tell within one screen that IIIC is one theory applied to organisations, learners and families, and pick the door that fits me.
- As any visitor, I can answer "Who is this for?" and land on the right next step.

### Founders and HR leads

- I can read what each consultancy service solves on its own page and see real proof or an honest empty state.
- I can request a free Team Map with my company, team size and sector, and get an acknowledgement at once.
- I can book a proposal call in a real slot without creating an account, and receive a calendar invite.

### Individuals and families

- I can see the session lengths and formats, pick a free time from the counsellor's calendar or ask for another, and get confirmation on WhatsApp and email (prices appear only once IIIC publishes them).
- I can reschedule or cancel within the policy using the link in my confirmation, without phoning anyone.
- I get a reminder the day before and shortly before, and nothing in those messages tries to sell me something.
- After the session I can rate it, and only if I choose, share a story that IIIC may publish with my consent.

### Learners

- I can read the course structure (placeholders until supplied), register for a free info session, and get reminders and the join details.
- (R2) I can enrol and pay for a seat, follow lessons and sessions in My IIIC, see my progress, and receive a certificate with a public verification page.

### Universities and partners

- I can see IIIC's institutional work exactly as it happened, and send a partnership enquiry.
- (R2/R3) I can verify a certificate by ID or QR code.

### Clients with an account (R2)

- I can sign in with a one-time code to my phone or email and see my bookings, Map history, course progress, documents and invoices in one place.
- I can see and change what I have consented to, download my data, or ask for it to be erased.

### The IIIC team

- As the operator, I open one screen each morning that shows today's sessions and calls, new leads, held payments, testimonials to review and anything that failed.
- As a counsellor, I see my own schedule and the context a client has consented to share, and write private notes no one else can read.
- As the owner, I set prices and when they are published, working hours, policies and who can do what, and I can see every change in the audit log.

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Largest Contentful Paint under 2.5 s and Interaction to Next Paint under 200 ms at the 75th percentile on a mid-range Android phone on 4G in India (field); the stricter lab budgets in `12-engineering-standards.md` §2; public pages static and revalidated on publish; JavaScript on marketing pages under 150 KB gzipped |
| Accessibility | WCAG 2.2 AA (which supersedes the plan's 2.1 AA) across public pages, booking and accounts; keyboard and screen-reader paths tested on every release |
| Responsiveness | 320 px to 1600 px with no horizontal scroll; booking completes comfortably on a phone |
| Reliability | 99.9% monthly availability target for the public site and booking; payments confirmed only by verified gateway webhooks; every automation idempotent and retried |
| Security | Staff accounts with two-factor authentication; role-based access with least privilege; secrets never in the repository; dependencies scanned; see `08-security-privacy-compliance.md` |
| Privacy | Consent recorded before storage; data minimised (date of birth only where a purpose needs it); retention periods enforced by jobs; analytics never records anything said in counselling and tracks only page and booking events |
| SEO | The search system in `12-engineering-standards.md` §3: semantic HTML, metadata and generated share images per page, sitemaps and robots per domain, structured data from the CMS (Organization, ProfessionalService, Course, Event, Article, BreadcrumbList; FAQPage optional), canonical and noindex rules, redirects |
| Localisation | English (India) at launch; strings externalised and `lang` set per element so Gujarati and Hindi can follow |
| Time | All times stored in UTC and shown in Asia/Kolkata (IST) |
| Browsers | Last two versions of Chrome, Edge, Firefox and Safari; Safari 15.4+ on iOS; Chrome on Android |
| Maintainability | One person with Claude Code can run, change and deploy it; typed end to end; tests on every critical path; documented runbooks |
