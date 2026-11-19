# IIIC platform · docs

Everything needed to build the IIIC platform with Claude Code: what the product is, how it behaves, how it should feel, how it is built and run, what the law requires, and what IIIC still has to supply or decide. Prepared 30 October 2026 and extended 4 November 2026, against brand kit 1.0.3 and the "IIIC Platform Plan" revision 29.

## Which document wins

1. `decisions.md`: a decision recorded there overrides any other document.
2. `00-platform-plan.md`: the product source of truth.
3. `01`–`14`: the specification that implements the plan.
4. `content/`: the words, verbatim, and where each goes; a fact not in `content/sources/` or `09` does not exist.

**Decided** decisions are final. **Recommended** ones are the working default: build on them unless IIIC says otherwise. **Open** ones must be settled before the milestone that needs them; until then, build only what does not depend on them, behind a placeholder or a feature flag.

## Reading order

| # | Document | What it settles | Read before |
| --- | --- | --- | --- |
| — | `../CLAUDE.md` | The non-negotiables, the stack, the repository layout, the definition of done | Every session |
| 00 | `00-platform-plan.md` | The idea, the three applications, the Map, cross-path rules, proof, the two domains, metrics | Anything |
| 01 | `01-product-requirements.md` | Scope per release (R1 launch, R2 engine, R3 institute), non-functional requirements | M1 |
| 02 | `02-routes-and-pages.md` | Every route, its release, register, purpose, primary action and data source | M2 |
| 03 | `03-user-flows.md` | Flows F1–F12 step by step, with edge cases | M2–M5 |
| 04 | `04-data-model.md` | Entities, fields, sensitivity classes S0–S3, retention | M1, M3 |
| 05 | `05-admin-panel.md` | Roles, navigation, every admin screen, key workflows, the quality bar | M1, M5 |
| 06 | `06-automations.md` | Engine rules and the automation catalogue (B, P, N, O; R2: MA, T, C, S, X, A) | M6 |
| 07 | `07-stack-and-integrations.md` | The stack with alternatives and reasons, known gaps, integrations, environments, running cost | M0, M1 |
| 08 | `08-security-privacy-compliance.md` | The legal frame and its dates, privacy, consumer protection, dark patterns, counselling and certificate wording, processors, security, lawyer and CA review lists | M1, M3, M7 |
| 09 | `09-content-and-inputs.md` | Known facts with sources, the inputs checklist (I-01 to I-42), page content inventory | M2 |
| 10 | `10-build-plan.md` | Working method, milestones M0–M7 with "done when", R2 and R3 order, testing, release checks, the first session prompt | Every milestone |
| 11 | `11-experience-concept.md` | How the site feels: the bar, the flip, the scroll narratives, quiet and hidden things, the 404, motion rules | M2 |
| 12 | `12-engineering-standards.md` | Rendering, performance budgets, the search system, caching, security hardening, backend and API, analytics and monitoring, code quality, accessibility, consent, policies, hosting checklist, scalability, release gates | M0, M1, every pull request |
| 13 | `13-email-and-messaging.md` | Domains and DNS, addresses and owners, what is automated and what is human, templates, deliverability, WhatsApp, internal alerts, offboarding | M0, M6, M7 |
| 14 | `14-technical-direction.md` | The CTO's brief: direction, registers, what to monitor, what to grow, the next 90 days, risks | The CTO, monthly |
| — | `content/` | `copy-architecture.md` (every page, section by section) and `sources/` (IIIC's texts, brochures, feedback, the copy system, the old site, verbatim) | M2 |
| — | `decisions.md` | D-A to D-C and D-01 to D-38 with status | Every milestone |
| — | `research/` | The four research reports behind `07` and `08` (messaging, architecture, compliance, payments), verbatim, with sources, October 2026 | When a choice is questioned |
| — | `prototype-prompt.md` | Optional: a clickable HTML prototype to test the flows with real people before M3 | Before M1 (optional) |

## The brand kit

`../src/brand/` is brand kit 1.0.3, read-only (Claude Code's project settings deny edits there). Start with its `README.md` (classes, roles, registers, integration), `VOICE.md` (copy rules, the writing standard, words to avoid, counselling and certificate wording) and `gallery.html` (every component and pattern, rendered). Print, email and web templates are in `templates/`.

## Claude Code set-up in this repository

| File | Purpose |
| --- | --- |
| `../CLAUDE.md` | Loaded into every session |
| `../.claude/settings.json` | Denies reading local secrets (`.env`, `.env.local`, `.env.production`) and editing the brand kit |
| `../.claude/agents/iiic-reviewer.md` | A reviewer subagent that checks a change against the non-negotiables (including the writing standard and the engineering standards) before a pull request |
| `../.claude/skills/milestone/SKILL.md` | `/milestone M3` starts a milestone in plan mode with the right documents loaded |
| `../.claude/skills/copy-check/SKILL.md` | `/copy-check <path>` checks user-facing copy against the writing standard, the proof rule and the counselling and certificate wording |
| `../.env.example` | Every environment variable, grouped by service; real values live in Vercel and the local `.env` |

## Where things stand

- **Ready:** the brand kit (1.0.3), the product plan, the specification (`01`–`06`), the stack and its costs (`07`), the compliance frame (`08`), the build plan (`10`), the experience concept (`11`), the engineering and messaging standards (`12`, `13`), the CTO's brief (`14`), the copy architecture with every source IIIC has supplied (`content/`).
- **Decided on 30 October 2026:** D-02 (free times from each counsellor's calendar, or a request), D-03 (format set per service), D-21 (no prices shown until IIIC publishes them; IIIC is GST-registered). **Decided on 4 November 2026:** D-26 (Ankvishwa named in the founder's biography only), D-29 (the 404: concept A), D-32 (the writing standard), D-33 (Instagram, LinkedIn, Facebook). **Decided on 5 November 2026:** D-36 (the signature line is आत्मानं विद्धि); **13 November 2026:** D-37 (reviews of Gaurang Mistry's programmes shown through the scroll, with name, designation and place, under consent); owners: Yash and Aum decide; the team owns everything that comes from the founder, the lawyer or the CA.
- **Open decisions:** D-05 (register the domain), D-07 (course delivery, R2), D-11 (counselling notes, lawyer), D-15 (who holds each admin role), D-16 (refund and reschedule rules), D-19 (counselling direction line). **Recommended and waiting for the founder:** D-25, D-27, D-28, D-30, D-31, D-34, D-35, D-38.
- **Inputs:** `09-content-and-inputs.md` lists who supplies what and what the product shows until then. Any placeholder left on a public page blocks a release (`10`, release checks); the inputs nothing can stand in for are I-01 (domain), I-04 (gateway account), I-07 (refund rules), I-21 (grievance officer), I-22 (lawyer review), I-26 (legal name) and I-27 (CERT-In contact). New since 4 November: I-32 to I-41 (the years, the PIN, socials, the Founder Consultation, consents for existing feedback, the organisations list, illustration rights, the existing systems, copy approvals); I-35 (the Sanskrit spelling) is settled, D-36. New on 13 November: I-42 (the reviews, with their consents).
- **Reviews that gate launch:** the lawyer and CA lists in `08` §10. Start them in M0.
