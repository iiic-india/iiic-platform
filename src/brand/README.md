# IIIC brand kit · 1.0.3

The visual system for the Indian Institute of Image Catalysts: tokens, three registers, components, patterns, print, logo and icon set, self-hosted fonts, and templates for web, email, print, Office, presentations and social. Framework-free CSS; everything opens from `file://`.

**Status: locked baseline (1.0.0), patched to 1.0.1 on 30 October 2026, 1.0.2 on 4 November 2026 and 1.0.3 on 5 November 2026 (content only).** This is the version the platform is built on. Changes follow the versioning rules at the end of this file and are recorded in `CHANGELOG.md`. `AUDIT.md` records what was reviewed and why each piece exists. `VOICE.md` is the writing guide.

## The principle

The logo has two colours: **Yellow `#FFDD00`** and **Slate `#43525A`**. Everything else here serves them.

**Yellow lives on paper, never on dark.** Yellow next to a dark surface reads as a hazard sign, so the system has no dark surfaces, and nothing dark is ever filled next to yellow: on a yellow surface the primary button is white. Yellow is a fill (a field, a button, a highlight, a tile) or the logo's bar (4px or wider); it is never text and never a thinner line. Dark tones are ink for type and for the illustration in the mark. The loudest thing on any page is one yellow field (a hero panel, a band, a cover, a seal), and it always has room to breathe.

## What is in the kit

```
brand/
├── README.md · VOICE.md · AUDIT.md · CHANGELOG.md · LICENSE.md · VERSION
├── gallery.html              living reference: every piece, with a live register switch
├── tokens.json               the tokens for tools that cannot read CSS (email, print, Office, Figma, admin theming)
├── css/
│   ├── iiic.css              entry file for development (imports the six layers)
│   ├── 00-fonts.css          @font-face for the self-hosted fonts
│   ├── 01-tokens.css         raw values
│   ├── 02-semantic.css       roles, the three registers, the yellow-surface scope
│   ├── 03-components.css     primitives
│   ├── 04-patterns.css       page pieces
│   └── 05-print.css          A4 documents, business card
├── dist/
│   ├── iiic.css              all layers bundled into one file (no @import chain)
│   └── iiic.min.css          the same, minified (≈ 10.5 KB gzipped): link this in production
├── fonts/                    Fraunces and Manrope, variable woff2, with their OFL licences
├── logo/
│   ├── iiic-logo.svg · iiic-mark.svg                  the masters, untouched
│   ├── iiic-logo-mono-black/-white.svg · iiic-mark-mono-black/-white.svg
│   ├── favicon.svg · favicon.ico · icon-square.svg · icon-maskable.svg · avatar.svg · og-image.svg · seal.svg
│   ├── site.webmanifest
│   └── png/                  favicon 16/32/48 · apple-touch 180 · icon 192/512 · maskable 512 · avatar 512 · og 1200×630 · email and Office logos
└── templates/
    ├── web/                  page-shell · landing · booking-step
    ├── email/                booking-confirmation · newsletter · signature (HTML + text)
    ├── print/                letterhead · invoice · proposal · certificate · business-card · pdf/ specimens
    ├── office/               IIIC-letterhead.docx · IIIC-document.docx
    ├── presentation/         iiic-template.pptx · build-template.js
    └── social/               social.html · png/ (LinkedIn covers, quote post, announcement post)
```

Each template folder has its own README.

## Quick start (static HTML)

```html
<meta name="color-scheme" content="only light">
<meta name="theme-color" content="#FFDD00">
<link rel="icon" href="/brand/logo/favicon.ico" sizes="32x32">
<link rel="icon" href="/brand/logo/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/logo/png/apple-touch-icon-180.png">
<link rel="manifest" href="/brand/logo/site.webmanifest">
<link rel="preload" href="/brand/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/brand/fonts/fraunces-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/brand/dist/iiic.min.css">
<body data-register="counselling">   <!-- or consultancy / education; omit for default -->
```

Start a page from `templates/web/page-shell.html`. Open `gallery.html` to see every piece and switch registers live.

## Using the kit in Next.js

1. Copy `brand/` into the repository as `src/brand/`. Treat it as read-only: page-level CSS lives in the app and reads the semantic roles.
2. Import the CSS once in the root layout: `import '@/brand/dist/iiic.min.css'`. It carries the `@font-face` rules, so the fonts resolve from `src/brand/fonts/` with no further set-up.
3. Optional, for preloading and zero layout shift: load the two Latin files with `next/font/local` and put their variables on `<html>`. The kit's font stacks read `--font-manrope` and `--font-fraunces` when they exist, so nothing in the kit is redefined. The Latin files include the rupee sign.
   ```ts
   import localFont from 'next/font/local';
   const manrope = localFont({ src: '../brand/fonts/manrope-latin-wght-normal.woff2', weight: '200 800', variable: '--font-manrope', display: 'swap' });
   const fraunces = localFont({ src: [{ path: '../brand/fonts/fraunces-latin-opsz-normal.woff2', style: 'normal' }, { path: '../brand/fonts/fraunces-latin-opsz-italic.woff2', style: 'italic' }], weight: '100 900', variable: '--font-fraunces', display: 'swap', adjustFontFallback: 'Times New Roman' });
   // <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
   ```
4. Registers: the App Router cannot change `<body>` attributes per route, so put `data-register` on a wrapper element in each route group's layout (the wrapper paints its own surface; registers nest). Keep the header and footer inside that wrapper so the whole page shares one register.
5. Copy `logo/favicon.ico` to `app/favicon.ico`, `logo/png/apple-touch-icon-180.png` to `app/apple-icon.png`, `logo/png/og-image-1200x630.png` to `app/opengraph-image.png`, and serve `site.webmanifest` from `/` with its icon paths updated. Add `<meta name="color-scheme" content="only light">` through the root layout's metadata.
6. Generated documents (invoices, certificates) render the `templates/print/` HTML with headless Chromium and `printBackground: true`, `preferCSSPageSize: true`.

## The layers

| Layer | File | Rule |
| --- | --- | --- |
| Fonts | `00-fonts.css`, `fonts/` | Fraunces (display) and Manrope (text), self-hosted under the SIL Open Font License 1.1. |
| Tokens | `01-tokens.css`, `tokens.json` | Raw values, `--iiic-<thing>`. Never read directly from page CSS. The CSS is the source of truth; the JSON mirrors it. |
| Semantic | `02-semantic.css` | Roles: `--iiic-surface`, `--iiic-surface-alt`, `--iiic-surface-wash`, `--iiic-text`, `--iiic-text-muted`, `--iiic-heading`, `--iiic-kicker`, `--iiic-rule`, `--iiic-rule-strong`, `--iiic-accent`, `--iiic-accent-hover`, `--iiic-accent-ink`, `--iiic-accent-wash`, `--iiic-mark`, `--iiic-radius`, `--iiic-radius-control`, `--iiic-motion`, `--iiic-measure`, `--iiic-focus`. Registers and yellow surfaces re-map them. |
| Components | `03-components.css` | Primitives, every class prefixed `iiic-`. Anything a register or a yellow surface changes is read from a role; fixed values (ink type, the white of a modal, toast, menu or chat pill, status colours, the footer's yellow bar) read tokens directly, by design. |
| Patterns | `04-patterns.css` | Page pieces composed from components. |
| Print | `05-print.css` | A4 sheets, flowing documents, business card. |

To change the brand, edit a token. To change how a register feels, edit its role mapping. To change a component, edit the component. Never fix one by editing another. Page CSS in the app may use roles and the spacing scale, never raw colour tokens, and never redefines an `--iiic-` variable. The only hard-coded colour outside `01-tokens.css` is the ink of the select chevron, an inline SVG that cannot read variables.

## Registers

No register is dark. The three temperatures differ by warmth, sharpness and pace.

| Register | Audience | Surface | Panels | Text | Card radius | Controls | Motion | Measure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default | mixed pages | paper `#F8F6F0` | white | ink | 24px | pill | 260ms | 66ch |
| consultancy | founders, HR leads | white | mist-050 `#EEF2F3` | ink | 16px | 10px | 150ms | 60ch |
| education | learners | paper | white | ink | 24px | pill | 260ms | 68ch |
| counselling | individuals, families | yellow-050 `#FFFAE0` | white | slate | 32px | pill | 420ms | 62ch |

Page mapping: organisations = consultancy; learn = education; counselling = counselling; booking inherits from its type (session → counselling, call → consultancy, info session and seat → education); everything else is the default. Every register sets every role and paints its own surface, so `data-register` works on `<body>` or on any wrapper, and a block in one register inside a page in another is fully that register. Counselling draws its rules in a warm neutral (ink at 12%) rather than yellow. `prefers-reduced-motion` sets every register's motion to 0. The header mark is the same file in every register.

**Yellow surfaces** (`.iiic-band-yellow`, `.iiic-panel-yellow`, `.iiic-hero-field`) re-map their own roles: the surface is yellow, every text role becomes ink, the bar device (`--iiic-mark`) becomes ink, controls get ink borders, focus rings switch to the on-yellow ring, and the accent turns white, so the primary button, checked controls and badges are white with ink. Data pieces (progress, stepper, steps, pagination, tables, charts) are not placed on yellow.

## Logo

The mark is a face in profile carrying the letters "iiic", drawn over the yellow bar. The two master files are byte-identical to the supplied originals and are never redrawn, recoloured, stretched, outlined or given effects.

| File | Use |
| --- | --- |
| `iiic-logo.svg` | Full lockup on white and paper: footer, about page, letterhead, documents, the proposal cover's white base. Minimum height 28px on screen, 12mm in print. |
| `iiic-mark.svg` | Header logo at every width, 40px tall, with "IIIC" as text beside it; running heads; the yellow hero field, social fields and the card back. On yellow the bar merges with the ground and the face stays. Minimum 20px tall. |
| `*-mono-black.svg` / `*-mono-white.svg` | One-colour uses: print in one ink, embroidery, stamps, and the only files allowed on a third party's dark background. The face is cut out of the bar. |
| `favicon.svg`, `favicon.ico`, `png/favicon-*.png` | Browser tabs: a geometric lowercase i on the yellow square. The face does not survive below 48px. |
| `icon-square.svg`, `png/apple-touch-icon-180.png`, `png/icon-192/512.png` | Home-screen icons: the face on the yellow square. No corner radius: platforms mask it. |
| `icon-maskable.svg`, `png/icon-maskable-512.png` | Android adaptive icon: the face inside the 80% safe circle. |
| `avatar.svg`, `png/avatar-512.png` | Social and WhatsApp profile pictures, shown in a circle. |
| `og-image.svg`, `png/og-image-1200x630.png` | Link previews: the lockup on paper. |
| `seal.svg` | The institute's seal: the face on a yellow disc with the name and city. Certificates and formal letters only. Not a legal stamp. |
| `png/logo-email-600.png`, `png/mark-email-160.png` | Email: hosted, shown at half size for retina. |
| `png/logo-1200.png`, `png/mark-600.png` | Office documents and slides. |

Clear space: at least the bar's width on all sides. There is no "on slate" lockup; on a partner's dark ground use mono-white.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| `--iiic-yellow` | `#FFDD00` | the field, the bar, the action, the seal |
| `--iiic-slate` | `#43525A` | the mark, kickers, counselling body text |
| `--iiic-yellow-deep` | `#E8C800` | hover and pressed on yellow; the mark on the counselling surface |
| `--iiic-yellow-200 / -100 / -050` | `#FFE866` `#FFF3B0` `#FFFAE0` | hover wash on yellow surfaces; soft badges, current nav, secondary hover, caution alerts; counselling surface, the default bridge and ticket tints |
| `--iiic-yellow-text` | `#5C4E00` | small text on yellow tints |
| `--iiic-paper / -paper-2` | `#F8F6F0` `#EFEBE1` | the base and its deeper wash |
| `--iiic-white` | `#FFFFFF` | panels, cards, consultancy surface, the primary button on yellow |
| `--iiic-ink` | `#1C262B` | headings, body, text on yellow, focus rings |
| `--iiic-slate-500` | `#5E6C74` | secondary text, placeholders |
| `--iiic-slate-400` | `#7A868C` | control borders (fields, checkboxes, chips, outline buttons): 3.1:1 or better on every light surface |
| `--iiic-slate-300` | `#A9B4B9` | disabled states and decorative dashes only (below 3:1) |
| `--iiic-mist / -mist-050` | `#E4E8EA` `#EEF2F3` | rules; cool consultancy panels |
| `--iiic-line-warm / -line-on-yellow / -scrim` | ink at 12% / 22% / 45% | rules on the counselling surface; rules on yellow; the modal backdrop |
| `--iiic-success / -danger` (+ `-050`, `-danger-100`) | `#1E6F57` `#B3261E` | status only, never marketing. The danger button is the soft fill with red type and border; there is no dark red fill. Caution uses the yellow family; there is no separate warning colour. |

Rules: yellow is a fill or the bar (4px or wider), never text and never a thinner line: borders, underlines, dividers and focus rings are ink or neutral. Nothing is filled dark: the primary button is yellow with ink type (white with ink type on a yellow surface), the secondary is an ink outline that warms to yellow-100 on hover, and the danger button is a soft red. Muted text never goes on yellow.

Contrast, WCAG 2.x formula, computed from the hex values (also in `tokens.json`):

| Pair | Ratio | Use |
| --- | --- | --- |
| ink on yellow | 11.45 | primary buttons, the band, the cover, the seal |
| ink on paper / paper-2 / white | 14.27 / 12.96 / 15.42 | headings and body; the focus ring on every light surface |
| ink on yellow-050 / yellow-100 / mist-050 | 14.69 / 13.73 / 13.68 | text on tints and panels |
| slate on white / paper / yellow-050 | 8.10 / 7.49 / 7.71 | counselling body, kickers |
| slate-500 on white / paper / paper-2 | 5.42 / 5.02 / 4.55 | secondary text, 12px and up |
| slate-500 on yellow-050 / yellow-100 / mist-050 | 5.16 / 4.83 / 4.81 | secondary text on tints and panels |
| yellow-text on yellow-100 / yellow-050 | 7.35 / 7.86 | small text on tints |
| success / danger on their washes | 5.42 / 5.73 | alerts; danger on danger-100 (button hover) 5.07; danger on white 6.54 |
| slate-400 on white / paper / paper-2 / mist-050 / yellow-050 / yellow-100 | 3.74 / 3.46 / 3.14 / 3.32 / 3.56 / 3.33 | control borders (non-text, 3:1 needed) |
| slate-500 on yellow | 4.03 | fails: no muted text on yellow |
| yellow on white / paper | 1.35 / 1.25 | fails: never text, lines under 4px or focus rings |

## Type

Fraunces for display (weight 500, optical size 144 for headings, 18 for ledes) and Manrope for everything else, both self-hosted in `fonts/`. Scale: 12 / 13 / 14 / 16 (body) / 18 / 20 and fluid `h2 clamp(28px, 3.2vw, 38px)`, `h1 clamp(36px, 5vw, 56px)`, `display clamp(44px, 7vw, 84px)`. Weights 400 / 500 / 600 / 700 / 800. Line height 1.55 for text, 1.05 for display. Reading measure is a role (`--iiic-measure`); apply it with `.iiic-prose`. Email and PowerPoint and Word use Georgia and Arial.

Two text devices: `.iiic-hl` (the highlighter: yellow behind ink words, for one phrase in a display heading) and `.iiic-marked` (the bar beside a heading). Links are ink with an ink underline (1.5px) that thickens to 3px on hover. Long-form CMS content (Journal articles, legal pages) goes in `.iiic-article`.

Gujarati and Hindi: the brand fonts are Latin only. The font stacks fall back to Noto Sans/Serif Gujarati and Devanagari, and `:lang(gu)` / `:lang(hi)` add line height and remove tight tracking. Set `lang` on any element that holds those scripts. When Indic pages launch, self-host the two Noto families the same way as the brand fonts.

## Layout and browser support

Breakpoints: 420px (the brand subtitle hides below this), 560px (phones), 850px (tablets; the header collapses to the menu below this), 1100px (the header drops the brand subtitle between 851 and 1100), 1200px (desktop). Container 1240px with a 32px gutter (18px on phones); narrow container 760px for forms and reading. `.iiic-page` is the site container; `.iiic-container` is kept for standalone pages such as the gallery. Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Z-index: header 100, dropdown 200, modal 300, toast 400.

Support baseline: the last two versions of Chrome, Edge, Firefox and Safari, Safari 15.4 and later on iOS, and Chrome on Android. `:has()` (choice cards) and CSS page margin boxes (print) are required; PDFs are rendered in Chromium.

## Motif, icons, imagery, data

- **Motif.** The logo's vertical bar is the one decoration: the kicker tick, `.iiic-marked`, the 6px rule above the footer, the bar across a featured price card, the left bar on toasts, email cards and every business page in print. The yellow field is the second device: one per page. No gradients, patterns, glows or illustrations beyond the logo and the Map constellation.
- **Icons.** Lucide (ISC licence; `lucide-react` in the app), stroke 1.75, 20px by default (`.iiic-icon`, `.iiic-icon-sm`), drawn in `currentColor`. Icons support a label; they never replace one. No other icon family.
- **Photography.** Real people, real sessions, real places, in natural light, with written consent from anyone identifiable. No stock imagery and no AI-generated people. Crops: 4:3 for frames, 1:1 for the hero field (`.iiic-hero-field.is-photo`), 16:9 for video. Until a real photo exists the slot shows the mark on the yellow field or a labelled `.iiic-image-frame`.
- **Data.** Charts and dashboards sit on white or paper. Yellow fills the bar or area that matters, with an ink outline; the other series are ink, slate and slate-500. Lines, points and labels are never yellow or slate-300 (both below 3:1). Never more than four series; label lines directly rather than relying on a legend; no red and green pairs; never colour alone.

## The Map constellation

The signature visual, drawn only from a person's real answers, never as decoration. On paper and white: slate points and slate-500 lines, the strongest dimension in yellow with an ink outline. On the yellow field: ink points and lines, the strongest dimension in white with an ink ring. SVG only. The gallery shows the treatment with four stand-in dimensions; the founder defines the real ones.

## Components and patterns

Primitives: `iiic-container` `iiic-section` `iiic-section-head` `iiic-grid` + `iiic-span-3…12` `iiic-row` `iiic-prose` `iiic-panel` + `-yellow` `iiic-brand` `iiic-top-actions` `iiic-marked` `iiic-hl` `iiic-hero` `iiic-hero-field` (+ `.is-photo`) `iiic-kicker` `iiic-lede` `iiic-type-display` `iiic-type-h2` `iiic-type-small` `iiic-btn` + `-primary -secondary -outline -ghost -danger -lg -icon` + `.is-loading` `iiic-icon` + `-sm` `iiic-label` `iiic-field` (+ `aria-invalid`) `iiic-field-wrap` `iiic-field-group` `iiic-form-grid` (+ `.full`) `iiic-fieldset` `iiic-help` `iiic-error` `iiic-error-summary` `iiic-check` `iiic-otp` (on the one code field) `iiic-scale` `iiic-scale-row` `iiic-scale-ends` `iiic-choice` `iiic-choices` `iiic-link` `iiic-article` `iiic-sr-only` `iiic-skip-link` `iiic-badge` + `-yellow -soft -green -red -dot` `iiic-alert` + `-yellow -green -red` `iiic-stat` `iiic-progress` + `-flat` `iiic-table` `iiic-table-wrap` `iiic-avatar` `iiic-todo` `iiic-tabs` + `-line` `iiic-empty` `iiic-skeleton` + `-text -title` `iiic-video` `iiic-footer`

Patterns: `iiic-header` `iiic-nav` `iiic-nav-toggle` `iiic-footer-grid` `iiic-footer-legal` `iiic-page` `iiic-page-narrow` `iiic-split` `iiic-doors` `iiic-strip` `iiic-image-frame` `iiic-band` + `-wash -yellow` `iiic-cta` `iiic-card` + `-door -proof -case` `iiic-door-glyph` `iiic-stepper` `iiic-slots` `iiic-slot` `iiic-dates` `iiic-date` `iiic-price-card` (+ `.is-featured`) `iiic-steps` `iiic-pagination` `iiic-breadcrumb` `iiic-menu` (+ `.is-start`) `iiic-accordion` `iiic-modal` `iiic-toast` `iiic-bridge` (+ `data-to`) `iiic-consent` `iiic-fab`

Print: `iiic-print-body` `iiic-sheet` + `-landscape -bar -flow` (+ `.is-confidential`) `iiic-sheet-head` `iiic-sheet-foot` `iiic-doc-kicker` `iiic-doc-title` `iiic-doc-meta` `iiic-doc-meta-row` `iiic-doc-body` `iiic-doc-sign` `iiic-doc-table` `iiic-doc-total` `iiic-doc-note` `iiic-doc-compact` `iiic-cover` `iiic-cover-field` `iiic-cover-base` `iiic-cover-meta` `iiic-cert` `iiic-cert-frame` `iiic-cert-head` `iiic-cert-id` `iiic-cert-body` `iiic-cert-name` `iiic-cert-rule` `iiic-cert-programme` `iiic-cert-foot` `iiic-cert-verify` `iiic-cert-qr` `iiic-seal` `iiic-bizcard` + `-front -back -top -mark -name -role -contact` `iiic-no-print`

Sub-elements: `iiic-sub` (panel subtitle), `iiic-stat-label` `iiic-stat-value` `iiic-stat-icon`, `iiic-choice-body` `iiic-choice-meta`, `iiic-price` (inside a price card), `iiic-case-metrics` (inside a case card), `iiic-footer-brand` (first footer column).

Markup for every piece is in `gallery.html` and the templates. Interactive pieces need a few lines of JS that the kit does not ship (the gallery shows the expected behaviour): the nav toggle (`aria-expanded`; Escape closes); tabs (`aria-selected`, `aria-controls`, a roving `tabindex`, arrow keys, Home and End); `.iiic-menu` closing on Escape (focus returns to the summary) and on an outside click; the toast (`role="status"`, at least 5 seconds, paused on hover and focus); a loading button (`aria-disabled="true"`, repeat activation ignored); moving focus to the error summary after a failed submit. The one-time code is a single field and needs no JS.

## Print

Fixed sheets (`.iiic-sheet`) are exactly one page: the proposal cover, the certificate. Flowing documents (`.iiic-sheet.iiic-sheet-flow`) paginate themselves in print, with the yellow bar, the footer and "Page n of N" repeated on every page through CSS page margin boxes; add `.is-confidential` for proposals and `.iiic-doc-compact` for invoices. Details in `templates/print/README.md`.

## Placeholders and merge fields

Anything the team has not supplied is rendered as `<span class="iiic-todo">[[TODO: what is missing]]</span>`, never guessed. Templates use `{{merge_field}}` for per-use values. Global merge fields: `{{SITE_URL}}`, `{{SITE_DISPLAY}}`, `{{EMAIL}}`, `{{ASSET_URL}}`. Facts still to supply: the platform domain and email addresses, GSTIN or registration status, Udyam number, bank details, counsellor names and credentials, prices (not published for now), family-session length, which phone number goes on documents, the framework statement as IIIC wants it published, course format and fee, programme details, the certificate verify URL, the Map's real dimensions and questions.

## Accessibility

Semantic HTML, a visible label on every input, a skip link, `:focus-visible` rings (a white gap and an ink ring, 3:1 or better on every surface) that keep a transparent outline so they survive forced-colours mode, `scroll-padding-top` so the sticky header never hides a focused element (WCAG 2.2, 2.4.11), 4.5:1 or better for every text pairing, 3:1 or better for every control border, targets that meet WCAG 2.2 target size (buttons, fields, slots, dates and choice cards are 44px or taller; checkboxes take the whole label as their target), fieldsets and legends for grouped choices, screen-reader names for the stepper on phones and for the scale's end labels, reduced motion respected everywhere (no transitions or animation), native `dialog` and `details` for modal, accordion and menu, `aria-invalid` with a described error and an error summary for form errors, and `color-scheme: only light` so browsers do not darken the system. The gallery (all four registers) and every web template pass a sweep from 320px to 1440px in 4px steps with no horizontal scroll and no console errors.

## Do and don't

| Do | Don't |
| --- | --- |
| Put yellow on paper, white or its own tints | Put yellow on slate, ink or any dark ground |
| Use one yellow field per page | Stack several yellow bands or panels |
| Set type on yellow in ink | Use muted slate, or yellow text, anywhere on yellow |
| Show a placeholder chip for a missing fact | Write sample testimonials, counts or clients |
| Use the mark at 40px in the header | Redraw, recolour, outline or stretch the logo |
| Use the white button on a yellow surface | Fill a button, toast or panel with ink next to yellow |
| Draw borders, underlines and dividers in ink or neutral rules | Draw thin lines or underlines in yellow |
| Show the danger action as the soft red button | Fill a button with dark red |

## Versioning and licences

Semantic versioning. Patch (1.0.x): fixes that change no class, token or template field. Minor (1.x.0): additions that break nothing. Major (2.0.0): renaming or removing a class, token, role or merge field. Every change gets a `CHANGELOG.md` entry, a rebuilt `dist/` and a re-rendered gallery. The logo and the name are IIIC's property; the fonts are under the SIL Open Font License 1.1. See `LICENSE.md`.
