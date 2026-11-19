<!-- Exported from the "IIIC Platform Plan" doc (claude.ai artifact 8nDU1uc2cMUCyPWT7PgJQM, revision 29) on 30 October 2026. This is the product source of truth; the other docs implement it. If they disagree, this file wins until a decision in decisions.md says otherwise. Facts, however, come from 09-content-and-inputs.md and content/sources/: where this plan repeats a fact from the old site (for example "the founder's 30 years of work", "₹1,500 today"), the sourced wording in 09 is the one to publish (I-32, D-21). Dates: the DPDP Rules were published in the Gazette on 13 November 2025 (08 §1), which is what sets 13 May 2027; this plan's "14 November" is the press-release date. -->

# IIIC Platform Plan

One theory, three applications, one platform. Subjective Self sits at the root; consultancy, education and counselling are its applications to organisations, learners and individuals. The platform turns that into one ecosystem: a shared language, one self-assessment that routes every visitor, one account, one booking engine, and checkable proof behind every claim.

## The idea: one theory, three applications

Your flow settles the biggest open question from the first brief: Subjective Self is the root, so IIIC is one thesis with three applications, not three products under one roof.

- **Organisations → Consultancy:** organisation planning, marketing & sales, brand positioning. The core business.
- **Learners → Education:** the Subjective Self certification course.
- **Individuals and families → Counselling:** 1:1 and family sessions.

**Suggested story line.** The name already carries it: _Image Catalysts_ change the image people hold of themselves, their families and their organisations. Subjective Self explains how that image forms: the self in connection with family values, society, patterns of thought, emotions and environment (the framework's own wording on the current site). Each application works on one of those images.

**What makes it one ecosystem: four shared layers.**

1. **One language.** The framework's vocabulary appears on every page, so a founder reading about team dynamics recognises the same lens that applies to their family and their own growth.
2. **One instrument.** The Subjective Self Map, a short reflective self-assessment, is the front door to all three applications and routes each visitor (see The engine).
3. **One account.** My IIIC holds a person's sessions, course progress, consultancy documents and Map history in one place.
4. **One proof standard.** Every claim on the platform can be checked (see Proof system).

_[Diagram in the original document: embedded figure]_

Every application draws on the same four shared layers, and the institute backs the platform as its proof.

## Where everything lives

The whole ecosystem you drew (all three applications, the Map, accounts and booking) runs on one platform domain. iiic.edu.in becomes the academic root the platform points to for credibility.

Why: ERNET's undertaking limits the .edu.in to "bonafide academic/educational and or research purpose only and not for any other business", so a single site that sells consultancy and cross-sells all three can only live on the business domain. This refines the earlier split: course sales and delivery now sit on the platform too, so cross-selling never has to cross a domain.

|  | Platform: bare iiic domain (e.g. iiic.works) | Institute: iiic.edu.in, once ERNET approves |
|---|---|---|
| Job | Run the ecosystem: sell, book, deliver, cross-sell | Prove the institute: research, standards, partnerships |
| Holds | Framework intro, the Map, consultancy, course sales and learning, counselling, proof hub, journal, My IIIC | Framework research, course syllabus and certification standards, certificate verification, university partnerships, publications |
| Audiences | Founders and HR leads, learners, individuals and families | Universities, institutional partners, anyone checking a certificate |
| Links | Links freely to the institute as proof | One quiet link to the platform for programmes and services (confirm with ERNET) |
| Live from | Launch | ERNET approval, which needs the university recognition letter |

Until the .edu.in arrives, the academic pages live at /institute on the platform and move later with redirects; iiicedu.com redirects to the platform from launch. One codebase serves both domains, so the move needs no rebuild.

## Sitemap

The thesis owns the homepage; the three applications are doors off it, and the Map sits in the top navigation as the universal entry. That resolves the router-versus-owner question from the first brief.

**Platform navigation:** Framework · For organisations · Learn · Counselling · Proof · [Take the Map] · Log in

| Page | Path | What it does | Main action |
|---|---|---|---|
| Home | / | States the thesis, shows the three applications as doors, invites the Map | Take the Map, or pick a door |
| Framework | /framework | Explains Subjective Self, its dimensions and the founder's 30 years of work | Take the Map |
| Subjective Self Map | /map | A short reflective profile (about 5 minutes) with a recommended path | Book, enrol or request a Team Map |
| For organisations | /organisations | Consultancy services, method, case studies, the free Team Map | Book a proposal call |
| Learn | /learn | The certification: curriculum, format, dates, fee, certificate, alumni outcomes | Enrol, or join a free info session |
| Counselling | /counselling | Approach, counsellors, individual and family sessions, prices | Book a session |
| Proof | /proof | Case studies, verified testimonials, outcome data, institutional work | Open a case, then start the matching path |
| Journal | /journal | Articles applying the framework to work, family and self | Subscribe |
| About | /about | IIIC, founder, team, partnerships | Contact |
| Institute | /institute | Academic pages until iiic.edu.in is live | Read, verify |
| My IIIC | /account | Sessions, course progress, documents, Map history, invoices, recommendations | Take the next recommended step |

**Institute (iiic.edu.in) pages:**

| Page | What it does |
|---|---|
| Home | Who the institute is and the standards it holds |
| Framework and research | The theory in depth, methodology, papers |
| Programmes | Syllabus, learning outcomes, assessment and certification standards |
| Verify a certificate | Enter a certificate ID or scan its QR code |
| Partnerships | University programmes (starting with PDEU, April 2023) and MoUs |
| Faculty | Founder and faculty credentials |
| Publications | Papers, talks and research pieces |
| Contact | Institutional and university enquiries |

## The engine: how the three fields connect

Three components do the connecting: the Map routes people in, one account remembers them, and one booking flow converts them. The cross-paths are where one application hands a person to the next.

**1. The Subjective Self Map (the signature)**

- **What it is:** a short reflective self-assessment across the framework's dimensions. The founder defines the dimensions and questions; the current site lists Emotional, Personal, Social and Professional areas, and the framework statement names family values, society, patterns of thought, emotions and environment.
- **First question:** "Who is this for: yourself, your family, or your organisation?" The answer sets the route.
- **Result:** a visual map of the person (the signature visual, see Design and voice), one recommended next step and two related ones.
- **One instrument, three uses:**
  - Counselling: with consent, the counsellor sees the client's Map before the first session.
  - Education: learners take it at the start and end of the course, so progress is visible.
  - Consultancy: the Team Map runs it across a team and returns an aggregate picture. It's the free lure for founders and HR leads, and it leads to a debrief call.

- **Boundaries:** a reflection tool, not a clinical test. No diagnosis, consent before anything is saved, and only the data the route needs.

**2. One account: My IIIC**

One login across all three applications, showing sessions, course progress, consultancy documents, Map history, invoices and the next recommended step. Cross-paths appear where the person already is.

**3. One booking and payment flow**

The same five steps for a counselling session, a proposal call or a course seat:

1. Choose the session, call or seat.
2. Pick a real calendar slot.
3. Enter name, phone and email.
4. Pay, for paid items (UPI and cards through a gateway such as Razorpay).
5. Get a confirmation, a calendar invite and a WhatsApp or email reminder.

This replaces the current Google Form, which collects no phone number or email.

**The cross-paths:** each application hands people to the other two at a natural moment, exactly as your notes describe.

_[Diagram in the original document: embedded figure]_

Whichever door a visitor uses, the platform offers the other two at a natural moment; the colour shows which application each bridge leads to.

## Cross-path rules

The "algorithm" is a short rule set: each bridge appears at a moment of satisfaction (a booking confirmed, a milestone reached, a session rated well), never at a vulnerable one. Session counts and offer names below are starting proposals to tune.

| Starts in | Trigger | Where it appears | Bridge offered |
|---|---|---|---|
| Map | Result: organisation | Map results page | Free Team Map, then a proposal call |
| Map | Result: self or family | Map results page | The recommended step, with the other two applications shown as related |
| Consultancy | Engagement starts | Client portal; week-2 email | A managers' cohort of the course (education); 1:1 founder sessions (counselling) |
| Education | Learner finishes the module on applying the framework at work | Course dashboard | "Bring it to your team": a free Team Map (consultancy) |
| Education | Any time, opt-in | Course sidebar | "Go deeper 1:1": a counselling session |
| Counselling | Client opts in after the third session | Session follow-up email | "Understand the framework behind your sessions": a free course info session |
| Counselling | Client's own profile says founder or manager | My IIIC only | The organisations page |

**Guardrails**

- What a client says in counselling is never used for marketing or routing. Bridges from counselling run only on the client's own profile answers and explicit opt-ins.
- No offers inside a session, its notes or its reminders.
- One bridge per touchpoint, every one opt-in, and "not now" is respected for a set period.
- Consent is recorded before any Map result or profile answer is stored.

## The three conversion paths

Each goal from your flow gets an entry offer, one paid conversion, and the proof that matters at the moment of decision.

| Goal | Entry offer | Path | Converts to | Proof at the decision |
|---|---|---|---|---|
| a) Course bookings | The Map, plus a free info session on Subjective Self | Journal or Map → /learn → info session → enrol | A paid seat in a cohort | Alumni outcomes, cohort before-and-after Map change, certificate verification, university work |
| b) B2B consultancy enquiries | The Team Map for one team | LinkedIn or referral → /organisations → Team Map → debrief call | A proposal | Case studies with before-and-after numbers, institutional work, the framework's research |
| c) Counselling bookings | The 15-minute session (₹1,500 today) as a low-risk start | Search or referral → /counselling → individual or family session → book | A paid session, with the Map as intake | Consented, anonymised client stories, counsellor credentials, a clear first-session promise |

**Making B2B "uncontrollably luring"**

- The Team Map is the hook: founders rarely get an honest, structured picture of how their team sees itself. The debrief shows it, names what stands out, and ends with a proposal.
- Qualify inside the lure: ask team size and sector up front, so the free Team Maps go to small and mid-size non-ecommerce firms, your target.
- Give each service its own landing page, so LinkedIn posts and referrals land on the exact problem (people and structure, sales, brand), not a generic page.

## Proof system: every claim can be checked

The standard that sets IIIC apart: every testimonial is tied to a real booking, and every number shows where it comes from. It is also the legal floor: India's 2022 CCPA guidelines say an endorsement "must reflect the genuine and reasonably current opinion of the endorser" ([summary](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).

| Proof | How it works | Where it shows |
|---|---|---|
| Verified testimonials | Collected only through a link tied to a real booking or enrolment; shown with a "verified client" badge, the programme and the date; video and text; consent recorded | Beside the matching offer on every page |
| Numbers that show their working | Sessions delivered, learners certified and organisations served are counted from the booking and course records; tap a number to see what was counted and since when | Homepage strip, proof hub |
| Outcome evidence | Course cohorts: aggregate before-and-after Map change. Consultancy: before-and-after numbers agreed with the client. Counselling: aggregate satisfaction and return rates | /learn, /organisations, /counselling |
| Certificate verification | Every certificate carries an ID and QR code that resolves on the institute domain | Certificates, the institute site, LinkedIn shares |
| Institutional proof | University programmes (PDEU, April 2023), MoUs once signed, research, founder credentials | Institute, About, consultancy pages |
| Third-party proof | Live Google reviews from a Google Business Profile, LinkedIn recommendations | Counselling and consultancy pages |

**Rules**

- Only real proof: nothing written for clients, no stock faces. An empty proof slot stays empty until real proof arrives.
- Counselling stories are anonymised by default and published only with written consent.
- Start collecting this week: a feedback-and-consent form after every session, workshop and engagement, so the platform launches with real proof.
- Build consent records into the Map, testimonials and accounts from day one. India's DPDP Rules, notified on 14 November 2025, become fully operational after 18 months ([report](https://www.theweek.in/wire-updates/business/2025/11/14/del148-biz-dpdp-rules-ld-govt.html)).

## Design and voice

One design system at three temperatures: the same grid, type and components everywhere, tuned per application, so the site feels like one place while each door speaks to its own visitor.

**Direction: futuristic and grounded**

- **Futuristic means precision:** crisp type, generous space, data drawn beautifully, motion with a purpose.
- **Grounded means real material:** real photos of real sessions and workshops, Indian context, warm neutrals beside the precise interface. No stock imagery, no decorative "AI" gradients.
- **The signature visual is the person's Map,** drawn as a unique constellation in which each point is a dimension placed by their answers. It appears in the homepage hero, the result page, course progress, Team Maps and the certificate. Each person's map travels with them across all three applications, which makes it the visual thread of the ecosystem. It is always drawn from real answers, never as decoration.

**Three registers**

|  | Consultancy | Education | Counselling |
|---|---|---|---|
| Temperature | Cool, high contrast, data-dense | Editorial, intellectual | Warm, soft, slower motion |
| The visitor should feel | Boardroom-credible, not soft-skills fluff | A serious body of knowledge worth certifying in | "I finally found something that gets how I actually think" |
| Example line | "Your team's numbers have a cause. We map it." | "Learn the Indian theory of the self, and certify in it." | "Not therapy as you've known it." |
| Proof style | Metrics, case studies | Outcomes, certificates, research | Stories, credentials, a clear process |

**Basics:** mobile-first and fast on mobile networks; accessible to WCAG 2.1 AA; motion that respects reduced-motion settings. English at launch, with Gujarati and Hindi counselling pages worth testing later for families in Gujarat.

## Tech stack

Build the platform as custom code, because the ecosystem (shared accounts, the Map, cross-paths) is the point, and no-code tools can't connect them. Use no-code only to test the Map before the custom engine is built. Whoever builds it makes the final call; the choices below assume a developer comfortable with React.

| Layer | Recommended build | Faster no-code start |
|---|---|---|
| Site and pages | Next.js, one codebase serving both domains | Framer or Webflow |
| Content editing | A headless CMS (e.g. Sanity or Payload), so non-developers edit pages | Built into Framer or Webflow |
| Accounts and data | Postgres with sign-in (e.g. Supabase) | Not possible, so no My IIIC |
| The Map | A custom engine inside the platform | A Tally or Typeform quiz with scoring, results by email |
| Booking | Scheduling built in, or self-hosted Cal.com | Hosted Cal.com |
| Payments | Razorpay checkout (UPI, cards) | Razorpay payment links |
| Course | Lessons and progress inside My IIIC, video through a streaming service | A course platform (e.g. Graphy), linked from the site |
| Messages | A WhatsApp Business provider (e.g. Interakt or AiSensy), plus email | Same |
| CRM | HubSpot or Zoho CRM | Same |
| Analytics | GA4, plus a product-analytics tool (e.g. PostHog) for funnels | GA4 |

## Roadmap

The platform launches in about two months and the engine in about four; the institute opens whenever ERNET approves. Week counts are estimates assuming one full-time developer and a designer.

_[Diagram in the original document: embedded figure]_

Nothing on the platform waits for the .edu.in; only the institute phase is gated by ERNET.

1. **Decide and fix (weeks 0–2):** register the platform domain; fix the Google Form; start collecting feedback and consent after every session; founder defines the Map's dimensions and questions; choose the builder.
2. **Launch the platform (weeks 3–8):** homepage, framework page, the three application pages, booking and payments, proof hub, journal and newsletter, analytics. iiicedu.com redirects. A no-code Map tests the idea.
3. **Turn on the engine (weeks 9–16):** the custom Map and Team Map, My IIIC accounts, course sales and lessons, cross-path rules, the verified-testimonial flow, live counters.
4. **Open the institute (after ERNET approval):** iiic.edu.in with research, programmes, certificate verification and partnerships; academic pages move from /institute.
5. **Scale (ongoing):** cohort outcome data, Gujarati and Hindi pages, an alumni community, Team Map dashboards for clients.

## Metrics

The headline number is the cross-path rate: the share of clients active in two or more applications within six months. It measures whether the ecosystem works. Set baselines in the first month after launch, then targets.

| Metric | Goal | Definition |
|---|---|---|
| Cross-path rate | Ecosystem | Clients active in 2+ applications within 6 months ÷ all clients |
| Course enrolments per month | a) | Paid seats booked |
| Info session to enrolment | a) | Enrolments ÷ info-session attendees |
| Proposal calls per month | b) | Calls booked by qualified firms |
| Team Map to proposal | b) | Proposals sent ÷ Team Map debriefs |
| Counselling sessions per month | c) | Paid sessions, new and returning |
| Counselling return rate | c) | Clients who book a second session ÷ first-time clients |
| Map completion | Engine | Finished Maps ÷ started Maps |
| Map to booking | Engine | Bookings within 30 days ÷ finished Maps |

Analytics never records what is said in counselling; it tracks only page and booking events.
