Build a clickable HTML prototype of the IIIC platform.

CONTEXT
IIIC = Indian Institute of Image Catalysts, Ahmedabad. One theory, Subjective Self (an Indian theory of psychology by founder Gaurang Mistry), applied three ways:
- Consultancy for organisations (the core business): organisation planning, marketing & sales, brand positioning
- Education for learners: the Subjective Self certification course
- Counselling for individuals and families: 1:1 and family sessions
The platform's job is to connect the three so a visitor who enters through one is naturally offered the other two. Three conversion goals: (a) course bookings, (b) B2B consultancy enquiries, (c) counselling session bookings.

This prototype exists to test whether the flows make sense to real users. No backend. Fake data. Real navigation and real multi-step flows.

CONSTRAINTS
- Plain HTML, CSS, JS. No build step, no frameworks. Must open from file:// in a browser. One shared styles.css (which imports the brand kit), one shared app.js.
- Multi-page. Prototype state (Map answers, bookings, "logged in") lives in localStorage.
- Mobile-first; works at 375px wide with no horizontal scroll.
- Respect prefers-reduced-motion.
- NO stock photos, NO invented testimonials, NO invented numbers, NO invented client names. Anything not supplied below is a placeholder. Do not guess.

PLACEHOLDERS
Render every unsupplied fact as a visible chip: <span class="iiic-todo">[[TODO: course fee]]</span> (dashed slate border, muted colour, obviously unfinished). Also generate todo.html listing every placeholder on the site and the page it appears on.

KNOWN FACTS (use as-is)
- Name: Indian Institute of Image Catalysts (IIIC). Office: 408, The Claywalls, Hebatpur Road, Thaltej, Ahmedabad (no PIN: IIIC's sources disagree). Phone: +91 96240 46464.
- Founder: Gaurang Mistry. Subjective Self was "established after 25 years of research, application, and refinement" by him; he has worked in HR planning, human excellence and business and marketing strategy for three decades (IIIC's brochure). Do not write "30 years of research".
- Framework statement (current site; use it without the words "first ever", which need evidence before they are published): "Subjective Self is an Indian theory of psychology that focuses on how the Indian society understands self in connection with their society, family values, patterns of thoughts, values of emotions, and environmental factors and benefits."
- Counselling: 1:1 sessions of 15, 30 or 45 minutes; family sessions exist (length is a placeholder). Online, at the office, or both, set per service. NO PRICES anywhere: IIIC is not publishing prices yet. Times come from each counsellor's calendar, plus a "Request another time" option; there are no fixed windows.
- University work: "Subjective Self", a two-day workshop on self-knowledge at Pandit Deendayal Energy University, 3–4 April 2023 (no school or department is confirmed). Public workshop: 8–9 July 2023, Cafe Venture Studio, Ahmedabad.
UNKNOWN (placeholders): course format, length, fee, dates, certification criteria; counsellor names and qualifications; consultancy case studies; testimonials; client names; counts (sessions delivered, learners certified, organisations served); the Map's real dimensions and questions.

PAGES
Shared header: IIIC mark + "IIIC" wordmark text · Framework · For organisations · Learn · Counselling · Proof · [Take the Map] button · Log in.
1. index.html — Home. Hero states the thesis: one theory, three applications. Primary CTA: Take the Map. Three "doors" below (Organisations / Learn / Counselling), one line each, own CTA. Then a proof strip (placeholder counters with a "how we count" note), founder block, journal teaser.
2. framework.html — Subjective Self explained. Use the framework statement; deeper sections are placeholders. CTA: Take the Map.
3. map.html — The Subjective Self Map. Step 0: "Who is this for?" → Yourself / Your family / Your organisation. Then ~8 questions on a 5-point scale across 4 stand-in dimensions taken from the current site's "areas of life": Emotional, Personal, Social, Professional — label each as a placeholder dimension the founder will replace. Result page: draw the person's map as an SVG constellation (one point per dimension, position from answers; this is the brand's signature visual). Show one recommended next step plus two related, routed by the Step-0 answer: organisation → "Request a free Team Map" (organisations.html#team-map); yourself → counselling session or course info session; family → family session. Save the result to localStorage.
4. organisations.html — Consultancy. The three services, the method (framework-based; detail is placeholder), a Team Map section (form: company, team size, sector → fake "We'll call you to schedule" confirmation), case-study cards (placeholder, no invented numbers). CTA: Book a proposal call → book.html?type=call.
5. learn.html — The certification. Curriculum, format, fee, dates, certificate: placeholders. CTAs: "Join a free info session" → book.html?type=info; "Enrol" → book.html?type=seat.
6. counselling.html — Approach (non-clinical; the direction line is a placeholder, [[TODO: counselling direction line]]; never use the words therapy, therapist, psychologist, clinical, diagnosis or treatment; keep claims modest and mark unsupported ones as placeholders; show the crisis numbers Tele-MANAS 14416 and emergency 112), counsellors (placeholder), session types Individual / Family with their lengths and no prices. CTA: Book a session → book.html?type=session.
7. proof.html — Proof hub. Verified testimonials with an honest empty state: "Verified client stories will appear here. We only publish proof tied to a real booking." Institutional work (PDEU 2023 — real). Counters as placeholders.
8. book.html — ONE booking flow for all types (type=session|call|info|seat). Step 1 choose (length and format for a session, no price; call topic for a call; cohort for a seat, placeholder). Step 2 pick a date and a free time from a fake counsellor calendar (some times shown as taken), or "Request another time" with preferred days, times and a note. Step 3 name, phone, email; phone and email required and validated. No payment step while prices are unpublished: the confirmation says IIIC will confirm, and a request says IIIC will reply with a time. Step 4 confirmation with a fake booking ID and an "add to calendar" stub. One opt-in cross-path card only after an info-session or seat booking ("Go deeper 1:1: a counselling session", the plan's any-time education bridge), with a "No, thanks" of equal weight; never after a counselling or proposal-call booking. Save the booking to localStorage.
9. account.html — My IIIC. Fake login (any email). Shows upcoming bookings from localStorage, the Map result with "Retake", course progress (placeholder), documents (placeholder), and one "next recommended step".
10. journal.html — three placeholder article cards and a fake newsletter signup.
11. about.html — IIIC, founder, team (placeholder), partnerships (PDEU).
12. institute.html — academic stub: research, programmes, "verify a certificate" (input → fake "not found"), partnerships. Note on page: "Moves to iiic.edu.in once approved."
13. todo.html — the auto-generated placeholder list.

CROSS-PATH RULES (implement exactly)
- Bridges appear only at: Map result, booking confirmation, account page. Never inside booking steps.
- One bridge per touchpoint. Each has a plain "No, thanks" with the same size and weight as the accept button (.iiic-btn-secondary), which hides it for the session.
- Bridges leading out of counselling appear only after the user ticks "Suggest related programmes" on the account page.

BRAND (the kit is in /brand, v2.0 — use it as-is; do not restyle the brand or fork its files)
Read /brand/README.md first. It is the brand guide and the kit's rules. The one rule above all others: yellow lives on paper, never on dark. There is no dark surface anywhere in the system; do not add one (no dark heroes, footers, modals or toasts). Dark tones are ink for type only.
- Link /brand/css/iiic.css on every page (it imports fonts → tokens → semantic roles → components → patterns → print; the fonts are self-hosted in /brand/fonts, so no Google Fonts link). styles.css holds page-level layout only and reads the semantic roles (--iiic-surface, --iiic-surface-alt, --iiic-surface-wash, --iiic-text, --iiic-text-muted, --iiic-heading, --iiic-kicker, --iiic-rule, --iiic-rule-strong, --iiic-accent, --iiic-accent-ink, --iiic-accent-wash, --iiic-radius, --iiic-radius-control, --iiic-motion, --iiic-measure), never raw tokens. Never redefine a kit variable. Keep the iiic- prefix on every new class.
- Registers already exist and none is dark. Set data-register on <body>: organisations.html = consultancy (white with cool panels); learn.html = education (paper); counselling.html = counselling (cream yellow); book.html inherits from its type (session → counselling, call → consultancy, info and seat → education); every other page uses the default (paper, no attribute).
- Logos, all in /brand/logo/: iiic-mark.svg in the header at every width and in every register, 40px tall, with "IIIC" as text beside it; iiic-logo.svg in the footer and about page; favicon.svg as the favicon; the mark inside the yellow hero field (.iiic-hero-field) where no photo exists. There are no "on slate" files any more and none are needed. Do not create new logo variants.
- Use the kit's components: .iiic-btn family (primary = yellow with ink text, secondary = ink outline; nothing filled dark), .iiic-btn-lg for hero and band actions, .iiic-field and form classes, .iiic-check, .iiic-badge (+ -soft for "Verified client"), .iiic-alert, .iiic-stat, .iiic-table inside .iiic-table-wrap, .iiic-panel, .iiic-hero with .iiic-hero-field, .iiic-kicker, .iiic-lede for lead paragraphs, .iiic-hl for a highlighted word in a display heading. Placeholders use the kit's .iiic-todo chip. Section headings use .iiic-marked (the brand motif: the logo's yellow bar).
- Use the kit's patterns (04-patterns.css) rather than writing your own: .iiic-header with .iiic-nav and the mobile toggle, .iiic-footer-grid + .iiic-footer-legal, .iiic-doors with .iiic-card-door and .iiic-door-glyph for the three doors, .iiic-card-proof, .iiic-card-case, .iiic-stepper for the five booking steps, .iiic-slots for time slots, .iiic-accordion for FAQs, .iiic-modal, .iiic-toast, .iiic-bridge for the one opt-in cross-path card, and .iiic-band.iiic-band-yellow with .iiic-cta for the one yellow band per page (the closing call to action; never more than one per page, never inside the booking flow). Start every page from /brand/templates/web/page-shell.html; the landing and booking-step templates show the patterns assembled.
- Favicon, Apple touch icon, manifest and theme-color links are in page-shell.html; keep them.
- Palette, type (Fraunces display, Manrope text), radii, motion and contrast rules are in the README. Yellow is the field, the bar and the action; it is never text and never a thin line on a light surface. Text on yellow is always ink; muted text never goes on yellow.
- The Map constellation: on paper and white, slate points and slate-500 lines with the strongest dimension in yellow with an ink outline; on the yellow field, ink points and lines with the strongest dimension in white with an ink ring. SVG only. /brand/gallery.html shows both treatments.
- /brand/gallery.html is the reference page. Do not link it from the prototype.

Accessibility: semantic HTML, labels on all inputs, the kit's focus rings, text pairings from the README's contrast table only.

DELIVER
index.html … todo.html, styles.css, app.js, README.md (how to open, which register each page uses, how placeholders work, list of every fake behaviour). The /brand folder is untouched.
Done when: every nav link resolves; the Map completes and produces three different routes; booking completes end-to-end for all four types with validation; the account page shows what was booked; todo.html lists every placeholder; nothing is invented; no page has a dark surface; the header mark is visible at 375px; a 375px-width check shows no horizontal scroll; the browser console shows no errors on any page.
