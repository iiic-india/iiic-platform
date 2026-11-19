# 14 · Technical direction (the CTO's brief)

For Yash, who leads IIIC's technology. What to lead IIIC towards, what to watch, what to manage, and what to keep in mind. Written 4 November 2026 against the pack as it stands; the registers and cadences below are meant to be kept, not read once.

## 1. The job

At IIIC's size the CTO is not a developer who also attends meetings; it is the person who owns the platform as a system of record, the data in it, the vendors around it, the security of all three, and the numbers that say whether the business is working. Claude Code writes the code; the CTO decides what gets built, in what order, to what standard, and keeps the whole thing honest, lawful and cheap. The founder supplies the framework, the content and the clients; the CTO turns them into something that runs without him.

## 2. The direction: five bets

1. **One platform, one record.** Every client, lead, booking, payment, consent, Map result and story lives in the platform's database, in Mumbai, in IIIC's own accounts. No parallel spreadsheets, no second CRM, no personal WhatsApp as the booking book. The value compounds only if the data is in one place (`00`, `04`). Existing tools (I-40: the geofencing system, the current CRM, the WhatsApp Business account) are either retired, fed by the platform, or kept strictly separate; none becomes a second source of truth.
2. **Trust as the product.** The plan's proof standard (every claim checkable), the counselling privacy rule, the consent ledger and the compliance frame (`08`) are not overhead; they are what makes IIIC the one counselling and consultancy site in its market a sceptical founder can verify. Protect them from every "quick" request to add a testimonial, a pixel or a number.
3. **Automation before headcount.** The 39 Release 1 automations in `06` (14 more in Release 2) are the operations team. Each one that works is a person IIIC does not need to hire; each one that silently fails is a client lost. Build them with tests, watch them daily (Today, O1), and add one only when a human is doing the same thing twice a week.
4. **Compounding acquisition, not campaigns.** The Journal (search), the founders' page (LinkedIn and referrals), the Map (Release 2) and the WhatsApp opt-in list are assets that keep working; paid campaigns are optional later and only through the consent gate (`12` §10). The cross-path rate is the headline metric because it measures whether the ecosystem, not a campaign, is working.
5. **Boring technology, pinned.** Next.js, Payload 3.94.x, Postgres, R2, Resend, Razorpay, Google Workspace: each chosen because one person with Claude Code can run it (`07`). Upgrades happen on a branch with the full test suite; new tools need a decision in `decisions.md`; anything that cannot export its data is not adopted.

## 3. What the CTO owns (the registers)

| Register | What it holds | Where | Cadence |
| --- | --- | --- | --- |
| Accounts and access | Every vendor account, who owns it, two recovery owners, two-factor on, API keys per environment | The password manager (`12` §12) | Reviewed quarterly; changed the day someone joins or leaves (`13` §9) |
| Secrets | Where each secret lives, when it was rotated, how to rotate it | `runbook.md` (M7) | Rotated yearly and on staff change |
| Vendors and contracts | Each processor, what it holds, where, the DPA or terms, the renewal date, the monthly cost | `08` §8 and the cost table in `07` | Monthly cost check; yearly contract review |
| Costs | Vercel, Supabase, R2, Resend, WhatsApp, Workspace, Zoho, domains; spend alerts set | The vendors' billing pages; one line per month in the weekly report | Monthly; an alert on any +50% month |
| Data | What is collected per flow, its sensitivity class, retention, where it leaves India | `04`, `08` §2 and §8; the processor register in `settings` | Each release; before any new field |
| Backups and recovery | Supabase daily backups; the nightly dump to R2; the last tested restore and how long it took | O6; `runbook.md` | Restore tested quarterly, at least every 30 days before a release (`10`) |
| Incidents | The breach register with timers (CERT-In 6 hours, the Board 72 hours), the point of contact (I-27), the post-incident notes | Admin → Privacy → Breach register; O8 | Drill once before launch, then yearly |
| Dependencies and upgrades | Renovate's weekly pull requests; the Payload and Next.js pins; the v4 migration decision when v4 is stable | The repository; `decisions.md` | Weekly merges; a quarterly upgrade branch |
| Documentation and decisions | `docs/` kept in sync with behaviour; every decision in `decisions.md` with a date and a name; `CHANGELOG.md` per release | The repository | Part of done on every pull request |
| People and training | Admin users and roles (I-23, D-15); the operator's one-page guide; the practitioners' calendar accounts (I-24) | `05`; Admin → Settings → Users | Quarterly access review; training at M7 and on every admin change |
| The legal calendar | 1 January 2027 (E-Commerce Amendment Rules: NCH convergence, complaint copies, prior-price rule, the yearly dark-pattern certificate); 13 May 2027 (DPDP duties); the yearly `security.txt` expiry; domain and certificate renewals; the lawyer and CA reviews (`08` §10) | `08` §1; a shared calendar with reminders a month ahead | Monthly glance |
| Content inputs | The 42 inputs in `09`, who owes each, and the placeholder report | `09`; Admin → Content → Placeholders | Weekly until launch |

## 4. What to monitor (the CTO's dashboard)

Everything below exists in the tools already chosen; the work is to look, on a schedule, and to act on thresholds.

**Daily (five minutes, from the digest O1):** today's sessions and calls; new leads and time requests waiting; failed jobs or messages (any failure is looked at the same day); payments held or mismatched (B11); privacy requests with a deadline inside seven days; uptime incidents overnight.

**Weekly (thirty minutes, Monday, from the weekly report O2 and the dashboards):**

| Signal | Source | Act when |
| --- | --- | --- |
| Bookings, proposal calls, info-session registrations, requests; week on week | O2 (Admin → Reports) | A fall of 30% without a known cause |
| Map completion and Map-to-booking (R2); door clicks and step-0 answers (R1) | `analytics_events` | Completion under 60%; a door that nobody opens |
| Lead response time (P1 tasks done inside two working days) | Pipeline | Any lead untouched past 48 hours |
| Error rate and new Sentry issues | Sentry | Any new production issue; error rate above 0.5% |
| Uptime and the cron heartbeat | UptimeRobot | Any check down more than five minutes; a missed heartbeat |
| Core Web Vitals (field) | Search Console | Any metric turning "needs improvement" |
| Search: coverage errors, sitemap status, queries, clicks; searches with no results | Search Console; Admin → Content | New coverage errors; a query with impressions and no page |
| Email: delivery rate per subdomain, bounces, complaints, DMARC reports, Postmaster reputation | Resend; Postmaster Tools; DMARC dashboard | Complaint rate above 0.1%; a reputation below "high"; a source failing DMARC in the reports |
| WhatsApp: quality rating, template statuses, messages failed | AiSensy | Quality below "high"; a template rejected |
| Broken links (the 404 log) | O2; Admin → Content → Broken links | Any path with more than five hits: create the redirect |
| Security: firewall events, failed logins, audit-log anomalies (reads of notes by the wrong role are impossible by design, but check the log), Renovate and audit results | Vercel firewall; Admin → Settings → Audit log; GitHub | Any anomaly; a high-severity advisory unmerged for a week |
| Placeholders still on public pages (before launch) | Admin → Content → Placeholders | Any, within two weeks of a release |

**Monthly (an hour):** costs against the table in `07` and usage lines (Vercel function and image usage, Supabase compute and storage, R2, Resend, WhatsApp fees); the plan's metrics against baselines (cross-path rate from R2; enrolments, calls, sessions, return rate); content review (the Journal cadence, pages with falling clicks, searches with no results); the consent ledger's withdrawals; data-request response times; the legal calendar; the operator's pain points (what did they do by hand this month?).

**Quarterly (half a day):** the access review (every admin user, every vendor login, every API key); a tested restore; the dependency upgrade branch; the ASVS checklist for anything that changed in auth, access or payments; a dark-pattern walk through every flow (`08` §5); the processor register; the accessibility statement; a read of `decisions.md` for anything Recommended that has silently become permanent (confirm it or change it).

## 5. What to help grow

- **The Journal.** One article a month that answers one question a reader searches for, in the framework's words, with a question to sit with at the end. Measure clicks from search and bookings within 30 days of a visit to the article.
- **The founders' page.** The one complete page IIIC has written. Put it behind every LinkedIn post and referral; measure proposal calls booked from it. Ask the founder for the second version (women founders) when it earns it.
- **The Map (Release 2).** The acquisition engine the plan is built around; it needs the founder's dimensions and questions (I-15). Until then, step 0 routes people and tells you which door they choose.
- **Proof.** The reviews of Gaurang Mistry's programmes (I-42, D-37) are the fastest proof IIIC has: collect them and their consents first, then keep consent collection going after every session and workshop (I-17), so that the Proof hub fills with real, dated, consented stories; the brochure's organisations list (I-38) and the PDEU feedback (I-37) once consents exist; Google Business Profile reviews.
- **The WhatsApp opt-in list and the newsletter.** Grown only through consent; measured by confirmed subscribers and by bookings that follow an issue.
- **Institutional partnerships.** The institute pages and `.edu.in` (R3) are the credibility layer for universities; PDEU is the first worked example.
- **Returning clients.** The counselling return rate and the course's second cohort are the signs the work holds; measure them before measuring reach.

## 6. The next 90 days

1. **Now (M0, no code):** settle the open decisions in `decisions.md` (hosting, D-04, was decided on 19 November 2026); register the domain (D-05); open every account in IIIC's name (`12` §12); Google Workspace and the practitioners' calendars (I-24); start the lawyer and CA reviews (`08` §10); get I-40 (the existing systems) written down; approve or change the copy in `content/copy-architecture.md` with the founder and Falak (I-41); start consent collection (I-17) and the review consents (I-42).
2. **M1–M2:** foundation, then the public pages with the experience devices (`11`) and the standards (`12`) in place from the first commit, not retrofitted.
3. **M3–M4:** booking with calendar sync and payment links; the pipeline. Everything that moves money or trust has tests first.
4. **M5–M7:** the admin the operator runs the day from; the automations; hardening, legal pages, DNS, mail, the launch checks; the operator's training.
5. **After launch:** a month of baselines, then Release 2 in the order in `10`, beginning with the Map when I-15 arrives.

## 7. Risks to hold

| Risk | How it is held |
| --- | --- |
| The founder is the only person who knows the framework | Get the Map's dimensions, the course outline and the copy written down (I-14, I-15, I-41); the platform is where IIIC's knowledge becomes durable |
| A trust breach (a counselling note read by the wrong person, an invented testimonial, a pixel added without consent) | The non-negotiables in `CLAUDE.md`, the reviewer agent, the audit log, the consent gate; the CTO says no |
| Claims that cannot be substantiated ("first ever", "first finishing school", "guarantees") | I-31 and the lawyer; the words-to-avoid list; the proof rule |
| Ankvishwa's positioning next to a platform built on checkable claims | D-26 (decided): one factual line in the founder's biography, nothing else |
| Infrastructure on personal accounts or the office server | `07` § Environments; D-04; the accounts register |
| The WhatsApp number's history and Meta's policies | I-03; coexistence confirmed at setup; marketing only with consent; the quality rating watched |
| Payload v4 and Next.js upgrades | Pinned; upgraded together on a branch with the tests; v4 only after it is stable |
| Vendor lock-in | Exits kept open (`12` §13) |
| Cost creep | Spend alerts; the monthly check; the table in `07` as the budget |
| The legal dates (1 January 2027; 13 May 2027) | The legal calendar; the yearly self-audit; the DPDP transition work scheduled in Q1 2027 |
| Doing too much before launch | Release 1 is deliberately small; everything behind a flag ships dark; the placeholder rule keeps the launch honest |

## 8. Keep in mind

- Everything in IIIC's name, with two owners, two-factor and a vault. Nothing in a personal account, ever.
- Say no to tools. Every new SaaS is a login, a cost, a processor in the register and a place data leaks to. The stack is enough until a measured need says otherwise.
- Write it down. A decision that is not in `decisions.md` did not happen; a doc that is out of date is a bug.
- The operator's day is the product's quality. If Today is not enough to run the morning, fix Today before adding a feature.
- Measure before optimising. The budgets are in `12`; the metrics in `00`; baselines come first.
- Keep the kit. The brand kit is locked; changes are versioned and rare. Pages built on its classes stay consistent without anyone policing them.
- Counselling is a different room. No experiments, no devices, no cross-selling there.
- Ship small and real. A page with three true facts beats a page with ten claims; an empty proof slot beats a borrowed one.
- Ask the founder for facts, not approval of prose. Facts are what the platform is short of.
- Protect the morning: the digest, the weekly review and the monthly hour are the whole management system; keep them.

## 9. What the CTO needs from the founder this month

The team owns getting these (Yash/Aum, 5 Nov 2026); the founder supplies the facts.

I-03 the WhatsApp number · I-05 GSTIN and legal name · I-07 refund rules · I-09 practitioners · I-10 biography and note · I-11 the service list · I-24 working hours · I-31 to I-39 except I-35, which is settled (the phone, the years, the PIN, the social profile URLs, the Founder Consultation, consents, the organisations list, illustration rights) · I-40 the existing systems · I-41 copy approvals.

## 10. When to bring in people

A photographer for one day of real photographs (I-18) · the lawyer and the CA (already required) · an editor if the Journal cadence slips · a designer only for illustration if IIIC wants more than the line-art motif · a second developer only if Release 2's Map engine outgrows one person's weeks; not before.
