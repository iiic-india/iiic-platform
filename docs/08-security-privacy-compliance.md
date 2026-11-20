# 08 · Security, privacy and compliance

What the law requires or strongly implies, and how the platform meets it. Sources and confidence levels are in `research/compliance.md` (30 October 2026). **This is not legal advice**: every item marked ⚖ goes to a lawyer, every item marked ₹ to a chartered accountant, before launch.

## 1. The legal frame and its dates

| In force | Law | What it means for IIIC |
| --- | --- | --- |
| Now | IT Act s.43A and the SPDI Rules 2011 | A sole proprietorship is a "body corporate". Publish a privacy policy; name a Grievance Officer with contact details and resolve within one month; "mental health condition" is sensitive personal data, needing consent "in writing through letter or Fax or email" ⚖ |
| Now | CERT-In Directions (28 April 2022) | Designate a point of contact; clocks synced to NIC/NPL-traceable time (cloud time qualifies); report listed incidents within 6 hours; keep logs of all ICT systems for a rolling 180 days (may be outside India if producible) |
| Now | Consumer Protection Act 2019 and E-Commerce Rules 2020 | IIIC selling its own services online appears to be an inventory e-commerce entity ⚖: legal information, grievance officer, refund terms, all-in prices, no pre-ticked consent, receipts for every payment |
| Now | CCPA guidelines: misleading ads and endorsements (2022), coaching ads (2024), dark patterns (2023) | Genuine, current, consented testimonials; no outcome guarantees; none of the 13 dark patterns |
| Now | GST | Registration above ₹20 lakh aggregate turnover (Gujarat); tax-invoice fields; plain invoice or receipt while unregistered ₹ |
| 1 Jan 2027 | E-Commerce (Amendment) Rules 2026 | Join the National Consumer Helpline convergence; send the complainant a copy of the complaint as recorded; show the prior price (lowest in the previous 30 days) beside any reduced price; a yearly dark-pattern self-audit with a certificate of compliance displayed ⚖ |
| 13 May 2027 | DPDP Act 2023 and DPDP Rules 2025 (notified 13 November 2025) | Every data-fiduciary duty: notices, consent, withdrawal, rights within 90 days, breach notices (individuals without delay; the Board within 72 hours), security safeguards, logs kept at least one year, children's data. s.43A and the SPDI Rules fall away the same day |

**The platform is built to the DPDP standard from launch**, which also satisfies the SPDI Rules on almost every point. Where SPDI is stricter today (written consent for sensitive data), the platform does both (§3).

## 2. Data classification

From `04-data-model.md`: **S3** counselling notes and Map answers · **S2** contact details, bookings, payments, consents, messages · **S1** organisations and leads · **S0** public content.

| Rule | S3 | S2 | S1 | S0 |
| --- | --- | --- | --- | --- |
| Who can read | Author (notes); the person and a practitioner they chose (Map) | Roles that need it | Operator, owners | Anyone |
| Encryption | Field-level (notes) plus provider encryption at rest | Provider encryption at rest; TLS in transit | Same | — |
| Audit | Every read and write | Every write | Every write | Publish events |
| Analytics | Never | Never (events carry no personal data) | Never | Page views only |
| Leaves India | Only to processors under contract (§8) | Same | Same | — |

## 3. Privacy implementation

| Duty | Implementation |
| --- | --- |
| **Notice per flow** (stand-alone, itemised data, itemised purposes, how to withdraw, how to exercise rights and complain; English or an Eighth Schedule language) | A versioned notice for each flow: booking, Map, Team Map, newsletter and WhatsApp updates, feedback and stories, account, course, partnership enquiry. Shown before the data is given, linked from the form, English at launch with the language selector ready ⚖ (which languages) |
| **Consent** (free, specific, informed, unconditional, unambiguous, a clear affirmative act; provable) | One unticked checkbox per purpose; never bundled with the booking; the `consents` ledger stores purpose, notice version, language, time, evidence |
| **SPDI written consent for sensitive data** (until 13 May 2027) | For counselling bookings and the Map, the consent is captured on the form **and** confirmed in writing by email (a consent receipt that the person can reply to withdraw); the receipt is stored with the consent record ⚖ (whether this satisfies "in writing") |
| **Withdrawal** as easy as giving | A withdraw link in every message and on the privacy page (R1); My IIIC privacy page (R2); withdrawal propagates to Resend, the WhatsApp provider and any other processor the same day |
| **Rights** (access, correction, erasure, grievance, nomination; respond within 90 days at most; publish how) | `/grievance` explains the process and the response period; requests verified by one-time code; tracked in Admin → Privacy with deadline timers; the response period IIIC publishes is 30 days (within both SPDI's one month and DPDP's 90) |
| **Contact** (publish a person able to answer; repeat in every reply) | The Grievance Officer (SPDI and E-Commerce) and the DPDP privacy contact are one named person, shown on `/grievance`, the privacy notice and the footer legal row (I-21) |
| **Breach** | Runbook in `runbook.md`: contain; assess; report to CERT-In within 6 hours if a listed incident; notify affected people without delay through their registered channel (nature, extent, timing, likely consequences, mitigation, what they can do, contact); notify the Board, then the detailed report within 72 hours ⚖ (how to reach the Board while it is being constituted). Admin → Privacy → Breach register records each step with timestamps |
| **Retention and erasure** | Retention periods per entity (`04-data-model.md`) enforced nightly; erasure on withdrawal or when the purpose ends, with legal holds (GST records, required logs) ⚖ ₹ |
| **Logs** (DPDP: at least one year; CERT-In: 180 days) | Application, access, database and email logs shipped to a log store with **one-year retention** (D-17); the audit log in Postgres kept three years |
| **Children** (under 18: verifiable parental consent; no tracking, behavioural monitoring or targeted advertising) | Age band asked in booking and the Map. Under 18: the booking is made by a parent or guardian, whose adulthood is checked (details held or provided, or a DigiLocker token) before any data about the child is stored; the Map is not offered to under-18s until a lawyer confirms it is not "behavioural monitoring" ⚖; no analytics events and no marketing for minors |
| **Processors** | A data-processing contract or the vendor's DPA with every processor in §8; a register of what each holds and where |

## 4. Consumer protection

| Requirement | Implementation |
| --- | --- |
| Legal information (legal name, address, website, customer care, grievance officer name, designation and contact) | A `/legal` page and the footer legal row: the proprietor's legal name and the trade name, address, GSTIN if registered, contacts (I-26) |
| Grievance handling: acknowledge within 48 hours, resolve within one month; from 1 Jan 2027 send a copy of the complaint as recorded and join the National Consumer Helpline convergence | Grievances are a request type in Admin → Privacy with 48-hour and one-month timers; automatic acknowledgement with a copy of the complaint (O7); NCH onboarding before 1 Jan 2027 ⚖ |
| Refund and cancellation terms; no cancellation charges unless IIIC bears similar charges when it cancels; refunds to the original payment method; a published refund timeline; refund within 30 days by default for deficient services | `/refunds` written from D-16 with symmetric terms (if a client pays a late-cancellation charge, IIIC compensates equally when it cancels late); refunds only through the gateway to the original method, with any payer instruction logged; IIIC publishes its own timeline (for example: initiated within 2 working days, credited per the bank) |
| Payment information (methods, their security, fees, charge-backs, the payment provider's contact) | A section of `/refunds` (or `/payments`) |
| Price shown as a single all-in figure with its breakup; no fees revealed late | Prices in the admin are stored as the amount the client pays; if GST applies, the breakup shows on the price card and at step 1 of booking (D-21) |
| Prior price beside any discount (from 1 Jan 2027) | `services` keep a price history; a reduced price displays with the lowest price of the previous 30 days |
| A bill or receipt for every payment | Automatic on payment (B3) |
| Yearly dark-pattern self-audit and certificate (from 1 Jan 2027) | A checklist against §5 run yearly; the certificate shown on `/legal` |

## 5. Dark-pattern guardrails (the 13 specified patterns)

| Pattern | Rule in this product |
| --- | --- |
| False urgency | Timers only for a real hold or deadline (the payment hold), never reset; no "only X left" unless it is the true remaining capacity of a cohort |
| Basket sneaking | Nothing is ever added to a booking or cart automatically |
| Confirm shaming | Decline options are plain: "No, thanks" (never guilt copy) |
| Forced action | Booking never requires newsletter, WhatsApp marketing or an account; marketing consent is separate and optional |
| Subscription trap · SaaS billing | No auto-renewing packages; if packages are ever sold, renewal is opt-in and cancellable as easily as bought |
| Interface interference | The decline button has the same size and weight as the accept button (both `.iiic-btn-secondary`/`-primary` pairs of equal size); no light-grey "no" |
| Bait and switch | An advertised slot or price is honoured or not shown; if a slot is taken mid-flow, the person is told plainly |
| Drip pricing | The total (and any GST) is shown at step 1 and never grows later |
| Disguised advertisement | Bridges and promotions are labelled as IIIC's own offers |
| Nagging | One bridge per touchpoint; a "No, thanks" is remembered for the set period (default 90 days) |
| Trick question | Consent wording is plain and positive ("Send me the monthly Journal"), never double negatives |
| Rogue malware | No third-party scripts beyond the gateway, Turnstile and analytics; CSP enforced |

The platform plan's "Not now" label for bridges becomes **"No, thanks"** with equal visual weight (D-18).

## 6. Proof and claims

- Testimonials: genuine, reasonably current, from a real booking or a real earlier programme, dated, naming the programme; any incentive disclosed on the card; consent for this use and its withdrawal recorded. The CCPA's 2022 guidelines require an endorsement to reflect the "genuine, reasonably current opinion" of the person, based on adequate information about, or experience with, the service ([PIB, 8 February 2023](https://consumeraffairs.nic.in/sites/default/files/PIB1897389.pdf)); for a review written years ago the consent request asks the person to confirm they still stand by it, and the card shows the year. Publishing a name, designation and place is processing that person's data and needs their consent for this purpose (`consents`: testimonial publication). A testimonial cannot carry a claim IIIC could not make itself: no diagnosis, cure, clinical result, guarantee or prediction. A writer's connection to Gaurang Mistry or IIIC (a friend, a relative, someone who works or worked with IIIC) is disclosed on the card: the Department of Consumer Affairs' endorsement guidance (20 January 2023) says endorsers "must disclose any material connection with the advertiser" ([PIB](https://consumeraffairs.nic.in/sites/default/files/PIB1892527.pdf)), and its examples include a "personal or employment relationship" ([Khaitan & Co, 31 January 2023](https://khaitanco.com/sites/default/files/2023-02/Ergo_31012023.pdf)). That guidance is written for celebrities and influencers; applying it to reviews on IIIC's own site is the cautious reading. The screening tests are in `content/copy-architecture.md` §6 (D-37) ⚖.
- Course testimonials: written consent taken after the outcome; no claims of guaranteed outcomes, jobs or promotions; disclaimers in the same type size as the claim (Coaching Guidelines 2024, if they apply ⚖).
- Counters show what was counted and since when (the plan's proof standard).
- Case studies publish numbers only with the client's written approval.
- Superlatives and firsts need evidence. The current site calls Subjective Self "the first ever Indian theory of psychology"; the platform publishes that only if IIIC can substantiate it and a lawyer agrees (CCPA Guidelines for Prevention of Misleading Advertisements, 2022) ⚖. Until then the framework is described without "first ever" (I-31).

## 7. Counselling, certificates and the name

- **Counselling wording.** Do not describe IIIC's sessions or people with "psychologist", "clinical", "therapist", "therapy", "diagnosis" or "treatment". Describe the founder's real background exactly as supplied. The plan's direction line "Not therapy as you've known it" uses the word "therapy" and needs a replacement or legal clearance (D-19) ⚖.
- **Scope statement** on `/counselling`, in the booking flow and in session emails: non-clinical; not diagnosis or treatment; not an emergency service; confidentiality and its legal limits (including mandatory reporting under POCSO for minors); parental consent for under-18s ⚖.
- **Crisis signposting** on `/counselling`, Map results, booking confirmation and counselling emails: Tele-MANAS **14416** or **1-800-891-4416** (free, 24×7); emergencies **112**; children **1098**. (KIRAN has been merged into Tele-MANAS; do not list it.) Re-check the numbers before launch.
- **Certificates.** Never "degree", "diploma", "university", "accredited", "recognised" or "approved". Fixed wording on every certificate and the course page (draft, ⚖): "Certificate of Completion — [course]. Issued by Indian Institute of Image Catalysts, a privately owned sole proprietorship, Ahmedabad. Not a degree or diploma; not affiliated with, approved or recognised by UGC, AICTE, any university or any Government body."
- **The name.** A footer line stating that IIIC is privately owned and not affiliated with any Government body (D-20) ⚖. An `.edu.in` domain or a university MoU is never presented as recognition.

## 8. Processors and where data lives

| Processor | Holds | Location | Contract |
| --- | --- | --- | --- |
| Vercel | Application runtime, request logs | Functions in Mumbai (`bom1`); company in the US | DPA |
| Supabase | The database (all S1–S3 data) | Mumbai (`ap-south-1`) | DPA |
| Cloudflare | DNS, R2 files (media, invoices, certificates), Turnstile, Web Analytics | Global network; R2 location set to Asia-Pacific | DPA |
| Resend | Email addresses and message content in transit | US / EU / Japan (no India region) | DPA |
| WhatsApp provider (AiSensy) and Meta | Phone numbers, template messages | India (provider); Meta global | Provider terms, Meta terms |
| Razorpay | Payment data (card data never touches IIIC) | India | Merchant agreement |
| Zoho Books | Invoices, customer billing details | India data centre | DPA |
| Google Workspace (mailboxes, Groups, Calendar, Meet, Chat) | Staff mail; booking times and client first names on practitioners' calendars; Meet links | Global | Workspace DPA |
| Sentry, UptimeRobot | Error reports (scrubbed of personal data), uptime checks | US / EU | DPA |
| Bunny (R2) | Lesson videos | EU company, global CDN | DPA |

No transfer restriction has been notified under DPDP s.16; the register is reviewed when one is.

## 9. Security architecture

| Area | Control |
| --- | --- |
| Staff authentication | Payload auth with lockout and revocable sessions, **TOTP two-factor mandatory**, recovery codes, 12-hour sessions, re-authentication for exports, role changes and erasure |
| Customer authentication (R2) | Emailed 6-digit codes at launch of accounts; WhatsApp authentication template next; SMS only after DLT (D-08). Codes expire in 10 minutes, five attempts, rate-limited per identifier and IP, Turnstile on request |
| Authorisation | Collection-level access rules per role; every custom view and endpoint checks role first (tested); S3 data in separate collections |
| Secrets | Vercel environment variables (encrypted); never in the repo; rotated on staff change and yearly; `NOTES_ENCRYPTION_KEY` rotation procedure in the runbook |
| Transport and headers | HTTPS only, HSTS (preload after launch), strict CSP with nonces, `frame-ancestors 'none'` (except where the gateway needs frames), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal |
| Payments | Hosted Razorpay checkout (PCI DSS SAQ A); no card data on IIIC systems; script integrity controls (CSP, SRI where possible) on pages that launch checkout; webhook signatures verified on the raw body; events stored and processed once; order-status polling as a fallback |
| Input and output | Zod validation at every boundary; parameterised queries (ORM); output encoding by React; file uploads type- and size-checked, stored in R2, never executed |
| Abuse | Turnstile on public forms and code requests; rate limits on booking holds, forms and webhooks |
| Dependencies | Lockfile; Renovate or Dependabot weekly; `npm audit` in CI; Payload and Next.js upgraded together on a branch |
| Backups | Supabase daily backups (7 days) plus a nightly encrypted `pg_dump` to the private R2 bucket (30 days); a restore tested at least quarterly |
| Logging and monitoring | Structured logs without personal data; Vercel log drain to a store with one-year retention (D-17); Sentry with PII scrubbing; UptimeRobot on the site, booking and webhook endpoints; the audit log for every sensitive action |
| Time | Cloud provider clocks (NTP) for all systems; timestamps stored in UTC |
| CERT-In | Point of contact designated (I-27); the 6-hour reporting path in the runbook |
| Access reviews | Quarterly review of admin users and roles; immediate deactivation when someone leaves |

**Rotating `PAYLOAD_SECRET`.** In one deploy, move the current value to `PAYLOAD_SECRET_PREVIOUS` and set a new `PAYLOAD_SECRET`, in each environment that uses it. Everyone is signed out and signs in again. Staff two-factor secrets are encrypted under a key derived from `PAYLOAD_SECRET`: a secret still under the old key opens with the previous value and is written again under the new key the first time its account is read, as every sign-in does. Once every active staff member has signed in since the change, delete `PAYLOAD_SECRET_PREVIOUS`; anyone whose code is refused after that gets their two-factor reset by an owner. Changing `PAYLOAD_SECRET` without keeping the old value leaves no one able to enter a code until the old value is put back as `PAYLOAD_SECRET_PREVIOUS`.

## 10. Before launch: lawyer and accountant review

⚖ Lawyer: whether the E-Commerce Rules apply; privacy notice per flow and the languages offered; whether the email consent receipt meets SPDI "in writing"; the Map for under-18s; minors' consent flow; counselling scope statement, confidentiality limits and POCSO procedure; refund and cancellation policy; terms; testimonial consent wording, and the treatment of older reviews (reaffirmed by the person, year shown); certificate and non-affiliation wording; whether "Indian Institute of…" needs any further disclaimer; whether the course falls under the Coaching Guidelines; whether the "first ever" claim can be made; retention periods and legal holds; how session notes are treated on an access request (D-11); breach notification to the Board.

₹ Chartered accountant: GST registration timing and whether prices include GST (D-21); SAC codes (998311 consultancy and 999293 training are the likely codes; counselling needs classification); invoice, receipt voucher, refund voucher and credit note handling; record retention.
