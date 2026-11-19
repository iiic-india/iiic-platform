# Brand kit audit · 1.0.0 · 30 October 2026

The review that locked the kit. Every file was checked against five things: the platform plan (what the site, the booking flow, the Map, the proof system and the documents actually need), the brand rule (the logo and the yellow are fixed; yellow never sits on dark), accessibility (WCAG 2.2 AA), source fidelity (nothing stated that IIIC has not confirmed), and Indian consumer, privacy and advertising rules as researched for the platform (findings 17 to 21). Fixes are listed in `CHANGELOG.md`.

## Method

- Static checks: every `var(--iiic-…)` resolves to a defined token or role; no hard-coded colour in the component, pattern or semantic layers; every class used in a template is defined; every class in the README exists.
- Rendering: the gallery in all four registers at 1280px, and the gallery and every web template at 320, 375, 851, 900, 1024, 1180 and 1440px, checked for horizontal scroll and console errors. Keyboard focus photographed on paper and on the yellow band.
- Documents: every print template rendered to PDF in Chromium 153 and rasterised; page counts and pagination checked. Word templates validated against the OOXML schema and rendered in LibreOffice. The deck passed the pptx validator.
- Contrast: every text pair and the focus ring computed from the final hex values with the WCAG 2.x formula.

## Second pass: independent review

A separate reviewer, who had not built the kit, checked every text file; rendered the gallery and web templates in Chromium 153 from 320 to 1440px in 4px steps in every register; walked the tab order and the ARIA tree; computed contrast; compared the dist bundles with the source on screen and in print; and checked the PDFs and the emails at phone widths. Its findings are 22 to 41 below. After the fixes the same sweep was re-run: no horizontal scroll at any width in any register, no console errors, emails within the viewport at 320 and 375px, the specimen PDFs at their correct sizes and page counts.

## Findings

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| 1 | Focus ring (yellow, white gap) was 1.25:1 on paper | Blocks AA | Ink ring with a white gap; yellow gap on yellow surfaces |
| 2 | Ink-filled button on the yellow band; ink fill on secondary hover | Breaks the brand rule | White primary on yellow; yellow-100 hover |
| 3 | Muted text and the bar device invisible or failing on yellow surfaces | Blocks AA / visual defect | Yellow-surface role scope and the `--iiic-mark` role |
| 4 | No `color-scheme`; auto-dark could invert the system | Breaks the brand rule | `color-scheme: light` |
| 5 | Nav wrapped between 851 and 1100px | Visual defect | No-wrap labels; subtitle hidden in that range |
| 6 | One-page sheets clipped long letters and invoices | Functional defect | Flowing documents with page margin boxes |
| 7 | Certificate lacked the QR code the plan requires | Missing | QR slot fed by `{{verify_qr_svg}}` |
| 8 | Invented facts in sample copy and sample PDFs | Breaks source fidelity | Facts or placeholders; honest specimens with a watermark |
| 9 | Proposal and deck hard-coded "Team Map" as a paid phase | Contradicts the plan | Merge fields |
| 10 | Invoice lacked document type, reverse charge and signatory | Missing | Added |
| 11 | No components for OTP login, the Map question, choice cards, the date strip, tabs, loading, empty states, pricing, pagination, breadcrumb, account menu, consent bar, chat pill | Missing for the build | Added to components and patterns, shown in gallery section 05 |
| 12 | Letters and documents could only be produced by editing HTML | Missing for the team | Word letterhead and document templates |
| 13 | No business card, no social templates, no `favicon.ico`, no maskable icon | Missing | Added |
| 14 | Six-file `@import` chain in production | Performance | `dist/iiic.min.css`, ≈ 10.5 KB gzipped |
| 15 | No writing guide, licence notice, version file, Next.js guidance | Missing documentation | `VOICE.md`, `LICENSE.md`, `VERSION`, README sections |
| 16 | OTP boxes and a wide table overflowed small containers | Visual defect | Flexible OTP; `.iiic-table-wrap` |
| 17 | Bridge decline was a "Not now" text link | Dark pattern (nagging; weaker decline) | "No, thanks" as a secondary button of the same size |
| 18 | Sample counselling copy used "therapy" | Legal risk | Non-clinical wording; the words-to-avoid list in `VOICE.md` |
| 19 | Footer lacked the legal links and a non-affiliation line | Missing (E-Commerce Rules; platform decision D-20) | Legal row with five links and `{{affiliation_statement}}` |
| 20 | Invoice notes suggested a "bill of supply" for an unregistered business | Factual error | Invoice or receipt while unregistered; GST documents once registered |
| 21 | Certificate wording not fixed against degree or recognition claims | Legal risk | `{{certificate_statement}}` documented as fixed wording; the specimen shows the draft |
| 22 | Thin yellow lines and yellow type on light grounds (link underlines, line tab, stepper, checked borders, featured card, card hover, alert and bridge borders, counselling rules, email underlines, the proof quote mark) | Breaks the brand rule | Lines in ink or neutral rules; yellow only as a fill or the bar (4px or wider); quote mark ink on a yellow tile |
| 23 | Danger button a dark red fill beside the yellow primary | Breaks the brand rule | Soft red fill, red type and border |
| 24 | Gallery showed dark fills beside yellow (slate swatch, an ink logo tile, "don't" tiles drawn in dark) | Breaks the brand rule | Dark tones shown as type; the mono-white logo on a neutral third-party ground away from yellow; don'ts as outlines |
| 25 | Control borders 1.9–2.1:1 and placeholders below 4.5:1 | Blocks AA (1.4.11, 1.4.3) | slate-400 control borders (3.1:1 or better); muted-text placeholders; ink border on checked chips |
| 26 | Selected line tab showed no focus ring; other line tabs clipped it | Blocks AA (2.4.7) | Focus rule last; inset ring on line tabs |
| 27 | Emails 632px wide on phones | Functional defect | Fluid container with an Outlook ghost table; stacking below 480px |
| 28 | Session days, family pricing and other copy without a source | Breaks source fidelity | Removed or cited (registration form, current site); placeholders for the rest |
| 29 | A pre-ticked consent checkbox in the gallery | Dark pattern, DPDP | Unticked, and labelled as never pre-ticked |
| 30 | Accent stayed yellow on yellow surfaces | Visual defect | Accent white, control borders ink on yellow |
| 31 | Registers could not nest or sit on a wrapper; Next.js cannot set body attributes per route | Functional defect | Full role sets per register; a register paints its own surface; README wrapper approach |
| 32 | Sticky header covered focused elements | Blocks AA (2.4.11) | `scroll-padding-top` |
| 33 | ARIA gaps: unnamed stepper items on phones, bare scale numbers, OTP without autocomplete or paste, unnamed dialog, no toast status, no progressbar role, tabs without controls or roving tabindex, ungrouped choices, Enter could repeat a loading action | Blocks AA / functional | Fixed in markup and CSS; single code field; JS duties listed in README |
| 34 | Forced-colours mode lost focus and checked states | Accessibility defect | Transparent outlines; forced-colours rules |
| 35 | Account menu off-screen at 320px; no Escape | Functional defect | Viewport-bounded menu, `.is-start`, Escape in the gallery's reference JS |
| 36 | Gallery overflow at 561–627 and 851–947px; long choice values overflowed | Visual defect | Fixed; sweep clean at every 4px step |
| 37 | Three hard-coded colours outside the token file; README claimed components read roles only | Inconsistency | Tokens for the scrim and on-yellow rule; README states the real rule and the one exception (select chevron) |
| 38 | `color-scheme: light` does not opt out of forced darkening | Brand rule risk | `only light`, plus the meta tag in every template |
| 39 | Next.js steps redefined a kit variable; the rupee sign lived only in the latin-ext files | Inconsistency / performance | Font stacks read next/font variables; rupee moved into the Latin files |
| 40 | Print rules (zero page margin, link styles, exact colour) leaked into every printed web page | Functional defect | Named pages; adjustments scoped to `.iiic-print-body` |
| 41 | Version labels, tokens.json drift, reduced-motion gaps, data-viz guidance below 3:1, classes without example markup, missing skip links, sources not cited | Polish | All fixed; every class now has example markup |

## Known limits, accepted

- Page margin boxes are a Chromium feature. PDFs are rendered in Chromium, so documents are correct; printing a flowing document from Firefox omits the repeated bar and footer.
- `:has()` drives the checked state of choice cards. Supported by every browser in the support baseline; older browsers show the cards without the checked highlight.
- Gmail and Outlook apps may recolour email in dark mode despite `color-scheme: light only`.
- The brand fonts are Latin only. Gujarati and Hindi fall back to Noto families, which should be self-hosted when Indic pages launch.
- Outlook for Windows draws email buttons and card corners square.
- Components use pixel values that sit on or near the spacing scale rather than reading the space tokens; the scale is for page layout.
- Progress bars and the featured bar are yellow on paper (1.25:1). They are decorative or paired with text ("Question 2 of 12"), which is required wherever a progress bar is used.

## Known gaps, planned for 1.1 (before the platform's engine release)

- The Map: a data-driven constellation component with a text alternative, the result card, the consent step, the Team Map invitation and aggregate view, result history.
- Proof: counters that show their working, a case-study page, the certificate verification page, video testimonials.
- My IIIC: the signed-in header, dashboard, lesson view, document and invoice lists.
- Emails beyond the two templates (reminder, sign-in code, receipt, cancellation, Team Map and feedback requests) and WhatsApp copy: built in the platform from the two email templates and `VOICE.md`.

## Out of scope

- Dark mode: ruled out by the brand rule.
- Photography and illustration: none supplied; slots are placeholders.
- Final copy: templates carry structure, merge fields and specimen text only.
- The admin panel's theme: set when the admin tool is chosen; it takes the logo, Manrope, ink, paper and the yellow accent from `tokens.json`.

## After 1.0.0

1.0.1 (the same day) changes specimen content only, after IIIC decided not to publish prices for now and to book from counsellors' free times or by request; see `CHANGELOG.md`.
