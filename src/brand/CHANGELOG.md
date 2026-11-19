# Changelog

Semantic versioning from 1.0.0 (rules in `README.md`). Earlier iterations were labelled v1.0, v1.1 and v2.0 while the kit was being shaped; they are recorded below as pre-release 0.1, 0.2 and 0.3 so that 1.0.0 is the first locked version.

## 1.0.3 · 5 November 2026 · content patch

### Changed
- `VOICE.md`: the signature line's spelling is settled as आत्मानं विद्धि (the brochures' आत्मनं was a typo); the line no longer says the spelling is being confirmed.
- Version labels read 1.0.3.

## 1.0.2 · 4 November 2026 · content patch

After the sources IIIC supplied on 4 November 2026 (two brochures, its description of the framework, the founders' page copy, Falak's copy system) and Yash's and Aum's instruction that nothing on the platform may read like generated filler. Content only: no class, token, role or template field changed.

### Changed
- `VOICE.md`: a fourteen-point writing standard (what "not generated filler" means, with the tells to remove); the phone number IIIC prints on its 2026 brochures (+91 96240 46464) replaces the site's footer number as the default; the address rule notes the unconfirmed PIN; the three social accounts in use (Instagram @iiic.india, LinkedIn, Facebook); the years rule (25 years for the curriculum, three decades for the founder's work); the signature-line rule (आत्मानं विद्धि once per page, ink on yellow, `lang="sa"`); new names (the Journal, not Daily Insight; Proof, not Stories of Change; Built on Subjective Self); pre-platform feedback and labelled illustrations added to the proof rule; the subject-line example states a start time, not a window; words to avoid extended (first, unleash, transformational, best version of yourself, in today's fast-paced world, growth mindset, safe space, assured success, guarantees, diagnostic, psychometric on counselling pages).
- Every template that prints a phone number (page shell, landing, booking confirmation email, letterhead, invoice, presentation) now prints +91 96240 46464; the presentation template was rebuilt. The landing specimen's founder line no longer asserts "30 years of research" (the site's wording); it uses the brochure's sentence about the curriculum.
- Version labels read 1.0.2.

## 1.0.1 · 30 October 2026 · content patch

After IIIC's decisions of 30 October 2026: no prices are published for now, and sessions are booked at a counsellor's free time or by request instead of in four fixed windows. Content only: no class, token, role or template field changed.

### Changed
- Every specimen drops prices: the gallery's price cards show a placeholder, its table lists durations and formats, the counselling door and the booking step carry no amount, and the CSS comment examples no longer quote real prices.
- Booking specimens show sample start times and a "Request another time" option in place of the four windows; the booking-step template shows the current four steps (a Payment step returns once prices are published).
- `VOICE.md`: prices are not published; times are written as start times; reminders state the time, not a window.
- The booking confirmation email marks the "Paid" row as optional.
- Version labels read 1.0.1.

## 1.0.0 · 30 October 2026 · locked baseline

Every file reviewed against the platform plan, the brand rule and accessibility, then fixed, completed and versioned; then reviewed a second time by an independent reviewer (Chromium renders from 320 to 1440px in 4px steps in every register, the ARIA tree, contrast, the dist bundles, PDFs and emails), and every blocking finding fixed (`AUDIT.md`, findings 22 onward). The logo masters and the yellow are unchanged. No class that existed in 0.3 was renamed or removed, so markup written against 0.3 still works; the one-time code changed from six boxes to one field before release.

### Fixed
- **Focus visibility.** The focus ring was yellow with a white gap: 1.25:1 against paper, below the 3:1 non-text contrast minimum. It is now a white gap and an ink ring on every light surface, and a yellow gap with an ink ring on yellow surfaces.
- **Dark next to yellow.** The yellow band filled its primary button with ink, and the secondary button filled with ink on hover. On yellow the primary button is now white with ink type; the secondary warms to yellow-100 on hover everywhere. Nothing dark is filled anywhere in the system.
- **Muted text on yellow.** Secondary text inside a yellow band or panel inherited slate-500 (4.03:1, fails). Yellow surfaces now re-map every text role to ink.
- **Invisible bar device on yellow.** The kicker tick, marked headings, link underlines and list dashes were yellow on yellow. A new `--iiic-mark` role draws them in ink on yellow surfaces and in yellow-deep on the counselling surface.
- **Browser auto-darkening.** Added `color-scheme: light` so Android Chrome's auto-dark and similar features do not invert the system.
- **Header at tablet widths.** Between 851 and 1100px the nav wrapped ("Take the Map" became a circle). Nav labels no longer wrap, and the brand subtitle hides in that range; below 420px it hides too.
- **Long documents.** Fixed sheets clipped anything past one page. Letters, invoices and proposal bodies are now flowing documents that paginate, with the bar, footer and page numbers repeated on every page.
- **Certificate verification.** The QR code promised by the platform plan had been dropped; a generated QR slot is back beside the verify line.
- **Invented copy.** The gallery and landing template stated things nobody has confirmed (question counts, durations, "most booked", a written next step after every session, office or online format, a family price). Replaced with known facts or visible placeholders.
- **Sample PDFs.** The old samples named a fictitious dean at a real university, a fictitious client, and fees for a Team Map the plan offers free. Replaced by specimens whose values describe the template itself, each page watermarked SPECIMEN.
- **Proposal and deck phases.** Phase one was hard-coded as "Team Map", which the plan treats as the free step before a proposal. Phases are now merge fields.
- **Invoice fields.** Added a document type field (invoice or receipt while IIIC is not GST-registered; tax invoice, receipt voucher, refund voucher or credit note once it is), a reverse charge line, a taxable value label and an authorised signatory block. Zoho Books is the system of record for invoices; the template is for previews and plain receipts.
- **OTP overflow.** Six boxes overflowed narrow panels; they now flex within a 352px maximum.
- **Gallery table overflow at 320px.** Tables now sit in `.iiic-table-wrap`, which scrolls instead of the page.
- **Cross-path decline.** The bridge's decline was a "Not now" text link. "Not now" promises to ask again (nagging, one of the 13 dark patterns in India's 2023 guidelines), and a text link beside a button gives the decline less weight. It is now "No, thanks", a secondary button of the same size.
- **Clinical wording.** Sample counselling copy used the word "therapy". Samples now describe sessions without clinical terms, and `VOICE.md` lists the words to avoid.
- `.iiic-field-wrap` was used in markup but undefined; it is now defined.
- **Yellow lines.** Link underlines, the selected line tab, stepper rules, checked borders, the featured price card, card hover borders, alert and bridge borders and the counselling register's rules were thin yellow lines (1.25:1 on paper), against the kit's own rule. Lines are now ink or neutral; yellow is kept for fills and the bar (4px or wider). The proof card's quote mark is ink on a yellow tile, not yellow type.
- **Dark red fill.** The danger button was a dark red fill with white type next to the yellow primary. It is now a soft red fill with red type and border (5.73:1).
- **Control borders.** Field, checkbox and chip borders were slate-300 (1.9–2.1:1). A new slate-400 (`#7A868C`, 3.1:1 or better on every light surface) is the strong rule in every register; placeholders use the muted text colour; checked chips get an ink border.
- **Focus.** The selected line tab lost its focus ring to a later rule; fields showed a pale halo instead of the documented ring. Every focus style now uses the ring and keeps a transparent outline for forced-colours mode, and `scroll-padding-top` stops the sticky header covering focused elements.
- **Yellow surfaces.** Checked controls, badges and highlights vanished on yellow because the accent stayed yellow. On yellow the accent is now white and control borders ink.
- **Registers.** Registers only partly re-mapped the roles, so a block in one register inside a page in another kept the outer register's colours. Every register now sets every role and paints its own surface, so registers nest and work on a wrapper element.
- **Email on phones.** The 600px container did not shrink inside a table cell (632px wide at 375px). Emails are now fluid up to 600px with an Outlook-only fixed table, stack below 480px, hide the preheader in Outlook and keep button padding in Outlook.
- **Unsourced copy.** Removed or sourced: a pre-ticked consent box, "Sessions run Monday to Friday", family sessions "from ₹1,500", a "family map", a ten-minute hold, Netbanking tabs, "University programmes 1" and a school name for the PDEU workshop, the "first ever" framework claim in specimen copy, "a reminder the day before". Fees and windows are now cited to IIIC's registration form. Sample weekdays were wrong (3 November 2026 is a Tuesday; 6 November a Friday) and are corrected.
- **Overflow and menus.** The gallery scrolled sideways at 561–627px and 851–947px; long choice values pushed their card wider; the account menu opened off-screen at 320px. All fixed; the sweep is clean at every 4px step.
- **Print scope.** The unnamed `@page { margin: 0 }`, link styles and exact colour printing applied to every printed web page. All page rules are now named and the adjustments are scoped to `.iiic-print-body`.
- **Accessibility details.** Stepper labels are screen-reader-only on phones instead of removed; the scale's end labels reach screen readers; groups use fieldsets and legends; the modal is named by its heading; the toast has `role="status"`; progress bars have `role="progressbar"`; tabs have `aria-controls` and a roving tabindex; reduced motion now stops every transition and animation; forced-colours mode keeps checked states.
- `font-feature-settings: "ss01", "cv11"` asked for features neither font has; removed.
- Unused `--iiic-warning` tokens removed; caution uses the yellow family.

### Added
- Components and patterns (second pass): `.iiic-fieldset`, `.iiic-error-summary`, `.iiic-article` (Journal and legal prose), `.iiic-bridge[data-to]` (the colour of the application a bridge leads to, as the platform plan asks), `.iiic-menu.is-start`; tokens `--iiic-slate-400`, `--iiic-danger-100`, `--iiic-line-warm`, `--iiic-line-on-yellow`, `--iiic-scrim`, `--iiic-bp-xs`, `--iiic-bp-header`; gallery section 06 "Booking states" (waiting for payment, payment failed, slot taken, booked), plus the icon button, video frame, consent bar and wash band.
- Components: `.iiic-btn.is-loading`, `.iiic-btn-icon`, `.iiic-icon` (+ `-sm`), field validation (`aria-invalid`), disabled and read-only fields, `.iiic-field-group` (the +91 prefix), `.iiic-otp`, `.iiic-scale` (the Map's five-point question), `.iiic-choice` / `.iiic-choices`, `.iiic-tabs` (+ `-line`), `.iiic-empty`, `.iiic-skeleton`, `.iiic-video`, `:lang(gu)` and `:lang(hi)` rules.
- Patterns: `.iiic-dates` (the 14-day strip), `.iiic-price-card`, `.iiic-steps`, `.iiic-pagination`, `.iiic-breadcrumb`, `.iiic-menu`, `.iiic-consent`, `.iiic-fab`.
- Roles: `--iiic-mark`; the yellow-surface scope; tokens `--iiic-focus-ring-on-yellow`, `--iiic-page-margin-bar`, `--iiic-page-bar`.
- Print: flowing documents (`.iiic-sheet-flow`, `.is-confidential`, `.iiic-doc-compact`) with `@page iiic-flow` margin boxes; the business card (89 × 51 mm with bleed); the certificate QR slot.
- Templates: `print/business-card.html`; `office/IIIC-letterhead.docx` and `office/IIIC-document.docx`; `social/social.html` with LinkedIn covers, a quote post and an announcement post, and PNG exports.
- Icons: `favicon.ico` (16/32/48), `icon-maskable.svg` and `png/icon-maskable-512.png`; the manifest gains `id`, `start_url`, `scope`, `lang`, `description` and separate `any` and `maskable` icons.
- `dist/iiic.css` and `dist/iiic.min.css`: the layers bundled into one file.
- Gallery section 05 "Flow pieces" (choice cards, scale, date strip, OTP, tabs, price cards, steps, empty and loading states, breadcrumb, pagination, menu, chat pill).
- `VOICE.md`, `LICENSE.md`, `VERSION`; template READMEs for print, office and social; Next.js integration, browser support, icons, photography and data guidance in the README.

### Changed
- Fonts rebuilt from the Google Fonts sources: the rupee sign now sits in the Latin files of both families, so a page of prices needs only those two files; Manrope moves from 4.504 to 4.505 (upstream fixes to %, fractions, ÷ and some accented capitals). Outlines of every other glyph are unchanged.
- Font stacks read `--font-manrope` and `--font-fraunces` when an app loads the same files with next/font; nothing in the kit has to be redefined. `color-scheme` is now `only light`.
- The one-time code is one field (`.iiic-field.iiic-otp`, `autocomplete="one-time-code"`), so paste and code autofill work without JS.
- Links are ink with an ink underline; the selected line tab and the stepper use ink; caution alerts are a yellow-100 fill; the chat pill is white so it reads over the yellow band; the featured price card carries the bar across its top.
- Email: `supported-color-schemes`, a light-only style block, Apple data-detector reset, and a preheader spacer.
- Footer legal row: Legal, Privacy, Terms, Refunds and Grievance officer links, and an `{{affiliation_statement}}` merge field for the line stating that IIIC is privately owned and not affiliated with any Government body.
- Certificate: `{{certificate_statement}}` is documented as fixed wording (not a degree or diploma; no affiliation, approval or recognition); the specimen shows the draft, which a lawyer must clear.
- `VOICE.md`: counselling copy (scope statement and crisis numbers), certificates and affiliation, cross-path cards, and the dark-pattern rules.
- Version labels across the kit read 1.0.0.

## Pre-release history

### 0.3 · 28 October 2026 · visual redesign (labelled v2.0 at the time)
Rebuilt the system under "yellow lives on paper, never on dark": warm paper base, ink family from the logo's slate, Fraunces + Manrope self-hosted, no dark registers, pill buttons, the yellow band and hero field, the bar down every business page, a new favicon, app icon, avatar and link image, one-colour logos with the face cut out of the bar, the seal, redesigned email, print and deck templates. Removed the "on slate" logo files and the dark slide layout.

### 0.2 · 28 October 2026 · brand system (labelled v1.1)
Added the patterns and print layers, `tokens.json`, the mono logos, the PNG set, the manifest, and templates for web, email, print and presentations.

### 0.1 · 28 October 2026 · kit (labelled v1.0)
Split the supplied single-file kit into tokens, semantic roles and components; added the three registers; rebuilt the gallery.
