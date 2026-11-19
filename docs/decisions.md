# Decisions

The decision log. Claude Code reads this before building and records any new decision here (with the date and who made it) rather than deciding silently in code. Status: **Decided** (by IIIC), **Recommended** (awaiting IIIC's confirmation; build on it unless told otherwise), **Open** (IIIC must decide before the milestone that needs it). Owners: Yash and Aum decide; where a decision needs the founder, the lawyer or the CA, the team owns getting it (Yash/Aum, 5 Nov 2026).

| ID | Decision | Status | Needed by |
| --- | --- | --- | --- |
| D-A | Two domains: the platform (sell, book, deliver) on a bare-`iiic` business domain; the institute on `iiic.edu.in` when ERNET approves. Consultancy never appears on the `.edu.in`. `iiicedu.com` redirects to the platform. | Decided (Yash/Aum) | — |
| D-B | Brand: the logo and yellow `#FFDD00` are fixed; yellow never sits on dark; no dark surfaces. Brand kit 1.0.3 is the design system. | Decided (Yash/Aum) | — |
| D-C | Nothing invented: unknown facts appear as placeholders; proof only from real, consented sources. | Decided (Yash/Aum) | — |
| D-01 | Release phasing: R1 launch (site, booking, payments, pipeline, journal, admin, automations, compliance); R2 engine (Map, accounts, course, certificates, verified stories, bridges, counters); R3 institute domain. | Recommended | M1 |
| D-02 | How clients choose a time: from each counsellor's real availability (working hours set in the admin, minus their Google Calendar busy times), with "Request another time" for anything else. The current form's four fixed windows are retired. | Decided (Yash/Aum, 30 Oct 2026) | M3 |
| D-03 | Session format: set per service (online, at the office, or both). | Decided (Yash/Aum, 30 Oct 2026) | M3 |
| D-04 | Hosting: managed cloud in IIIC's own accounts (Vercel Pro in Mumbai, Supabase Mumbai), not the office geofencing server. Free hosting was weighed and ruled out on 19 November 2026 (`07`, Hosting). | Decided (Yash/Aum, 19 Nov 2026) | M1 |
| D-05 | Platform domain: `iiic.works` (the plan's recommendation; `iiic.consulting` if counselling ever moves to the institute). | Open (Yash/Aum to register it) | M0 |
| D-06 | Stack: Next.js + Payload 3.92.x + Supabase Postgres + R2 + Resend + a WhatsApp provider (AiSensy Basic) + Razorpay, as in `07-stack-and-integrations.md`. | Recommended | M1 |
| D-07 | Course delivery: live cohorts, recorded lessons, or both. | Open (Team) | R2 |
| D-08 | Login codes for accounts: emailed 6-digit codes first; WhatsApp authentication template for phone verification; SMS only if needed, after TRAI DLT registration (about ₹5,900, two to three weeks). | Recommended | R2 |
| D-09 | PDFs: render the brand's HTML print templates with serverless Chromium; fall back to `@react-pdf/renderer` only if that proves unreliable. | Recommended | M3 |
| D-10 | Newsletter: Resend Broadcasts with double opt-in built in the platform; MailerLite if the writers want a richer visual editor. | Recommended | M6 |
| D-11 | Counselling notes: private to the author; whether they are disclosed on a data access request, and how long they are kept. | Open (Team, with the lawyer) | M5 |
| D-12 | Payment gateway: Razorpay (2%, T+2, payment links, mature SDK); Cashfree if first-year fee savings matter more (0% up to ₹20 lakh until 31 March 2027). | Recommended | M0 |
| D-13 | Invoicing system of record: Zoho Books (Free, then Standard). IIIC is GST-registered, so documents are tax invoices, receipt vouchers, refund vouchers and credit notes. | Recommended (Team to supply the GSTIN, I-05) | M3 |
| D-14 | Analytics: cookieless (Cloudflare Web Analytics) plus first-party funnel counts; no cookie banner needed while nothing non-essential sets a cookie. | Recommended | M2 |
| D-15 | Admin access: owners, operator, practitioners, editor, finance, with the permissions in `05-admin-panel.md`; who holds each role. | Open (Yash: names) | M1 |
| D-16 | Refund and reschedule rules per service (symmetric: any late-cancellation charge IIIC applies, it also bears when it cancels late; refunds to the original payment method; a published refund timeline). | Open (Team) | M3 |
| D-17 | Logs shipped to a store with one-year retention (CERT-In 180 days; DPDP one year); provider and price chosen in M1. | Recommended | M1 |
| D-18 | Bridge decline label is "No, thanks", with the same size and weight as the accept button (replaces the plan's "Not now", which Indian dark-pattern guidance flags). | Recommended | R2 |
| D-19 | The counselling direction line without the word "therapy" (the plan's "Not therapy as you've known it" is on hold); wording chosen by IIIC and cleared by a lawyer. | Open (Team, with the lawyer) | M2 |
| D-20 | Footer statement that IIIC is privately owned and not affiliated with any Government body; fixed certificate wording (non-degree, non-affiliation). | Recommended (Team to clear the wording with the lawyer) | M2 |
| D-21 | Prices: none shown on any page, email or template until IIIC publishes them (the `prices_public` setting stays off). IIIC is GST-registered; whether published prices include GST is settled with the CA when prices are set. | Decided (Yash/Aum, 30 Oct 2026) | M3 |
| D-22 | Calendar: two-way sync with each counsellor's Google Calendar (their busy times block slots; every booking is written to their calendar with a Meet link or the office address and updated on reschedule or cancel); clients get an `.ics` invite that works in Google, Apple and Outlook; the admin calendar shows everything. | Recommended | M3 |
| D-23 | Mailboxes and calendars: Google Workspace (Business Starter) on the platform domain, because online sessions need Meet links and calendar sync (D-03, D-22). | Recommended | M0 |
| D-24 | Payment while prices are hidden: bookings confirm without online payment, and staff can send a Razorpay payment link from the booking (the client sees the amount before paying). Once IIIC publishes prices, the flow shows the all-in price at step 1 and takes payment at booking. | Recommended | M3 |
| D-25 | The founders' page: `/founders` in the consultancy register, built from IIIC's supplied copy as a scroll narrative (`11` §3.5); "Book a Founder Consultation" books the free proposal call under that label until I-36 defines the offer. | Recommended | M2 |
| D-26 | Ankvishwa: named in the founder's biography only, as one factual line in his own words (I-10); the platform offers no AnkVishwa assessment and prints no "an initiative by Ankvishwa" line unless the legal entity requires it (I-26). Reason: the platform's claims are checkable and counselling is non-clinical. | Decided (Yash/Aum, 4 Nov 2026) | M2 |
| D-27 | Names: the Journal (not "Daily Insight" or "blog"); the Proof hub keeps its name, with verified stories as a section; "Built on Subjective Self" for the line under a door's hero. | Recommended | M2 |
| D-28 | Stories: a narrative IIIC writes to illustrate a reader (the founders' page story; any of the copy system's five "stories" that is not a consented client's own words) is labelled as IIIC's illustration, never placed in Proof and never shown as a client story; verified stories come only through the consented flow or with documented consent for pre-platform feedback (I-37). | Recommended | M2 |
| D-29 | The 404 page: concept A as refined in `11` §5.1 (the page owns the broken link first; one approved question chosen by the door the person was headed for; a line they may write, with the bar growing as they write; nothing stored; search and the doors; a plain version with the scope line and crisis numbers on counselling paths). Concept B ("Flip it") is not built. | Decided (Yash/Aum, 4 Nov 2026, delegated to the platform team) | M2 |
| D-30 | Tracking: no third-party pixel or tag at launch; the consent gate is built so one can be added later as content, with a banner of equal-weight buttons and `Sec-GPC` honoured; no pixel is added without a decision here and a notice update. Extends D-14. | Recommended | M2 |
| D-31 | Contact details on the platform: +91 96240 46464 (both 2026 brochures and the copy system); info@iiicedu.com until the platform domain's addresses exist (I-02); the address without a PIN until I-33 is answered. | Recommended | M2 |
| D-32 | The writing standard in `src/brand/VOICE.md` 1.0.3 is a non-negotiable: every user-facing string is reviewed against it; nothing that reads as generated filler ships. | Decided (Yash/Aum, 4 Nov 2026) | M2 |
| D-33 | Social accounts: Instagram (@iiic.india), LinkedIn and Facebook only; the current site's X and YouTube icons are dropped. | Decided (Yash/Aum, 4 Nov 2026) | M2 |
| D-34 | Site search (Payload's search plugin) and the 404 log with one-click redirects ship in Release 1 (`11` §5.1, §5.3). | Recommended | M2 |
| D-35 | Existing systems (I-40): the platform is the system of record; the office geofencing system, the current CRM and the WhatsApp Business account are retired, fed by the platform, or kept separate; none holds client data the platform also holds, and none is integrated before its data, owner and purpose are written down. | Recommended | M1 |
| D-36 | The signature line is spelled आत्मानं विद्धि (ātmānaṃ viddhi), the grammatically correct form; the brochures' आत्मनं is a typo and is not reproduced. I-35 is closed. | Decided (Yash/Aum, 5 Nov 2026) | M2 |
| D-37 | Reviews of Gaurang Mistry's programmes, earlier and new, are part of IIIC's proof (the programmes are the same, now under IIIC). They appear on the home page as the visitor scrolls (one beside each section that makes a claim, and six together), on the founders' page and the door pages, and all together on Proof. Each shows the name in the form the person chose, their designation and place, the programme and the year; it is published only with that person's consent for this use and only as written (an excerpt only if they approve it). Counselling reviews show initials and place unless the person chooses otherwise. What the reviews show about outcomes informs the outcome language and the choice of voices, not IIIC's definition, applications or terms. (`11` §3.8; `content/copy-architecture.md` §6) | Decided (Yash/Aum, 13 Nov 2026) | M2 |
| D-38 | IIIC's philosophy document of 19 November 2026 is the newest statement of what IIIC is: where it differs from the 4 November description (the outcome bands, each vertical's descriptor), the copy follows it; lines it does not cover stay in use. (`content/sources/iiic-philosophy-2026-11-19.md`; `content/copy-architecture.md` §3) | Recommended | M2 |

## How to record a decision

```
| D-39 | <the decision, in one sentence> | Decided (Yash/Aum, <date>) | <milestone> |
```

If a decision changes a document, update that document in the same commit and note the decision ID in the commit message.
