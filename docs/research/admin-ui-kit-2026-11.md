# Research: the admin UI kit (components for the operator's console)

Research snapshot, 22 November 2026. Three research passes (charts, components, fitting them into Payload's admin) were followed by a verification pass. That pass re-read the facts each choice rests on: the npm registry record, the project's own documentation and repository, the published source where a claim could be checked in code, and Payload 3.94 as it is installed in this repository. † marks a fact taken from the research passes and not re-read. Nothing was installed. No bundle weight was measured.

The outcome is proposed in `05-admin-panel.md` § The component stack. It becomes a decision when IIIC confirms it in `decisions.md`.

## The question

On 22 November 2026 IIIC's owner asked that the dashboards be built from "the best components available", named "bklit" as an example he was unsure of, and said "the ui should be the best ever experience". The screens are the console in `05`: Today, Calendar, Bookings, People, Pipeline, Proof, Messages, Money, Privacy, Reports, Settings and global search.

What any choice has to hold to:

- The brand kit is the design system: its roles for colour, type and motion; yellow `#FFDD00` only on paper, white or its own tints; nothing dark filled beside it; light only.
- Accessibility is part of done: keyboard paths, screen readers, a table of the same figures beside every chart, WCAG 2.2 AA.
- A laptop and a phone.
- Every custom view checks the user and the role first.
- The Content-Security-Policy: scripts run only with the request's nonce (`'strict-dynamic'`, no eval); inline styles are allowed; images, fonts and connections from this site only (`src/lib/security/csp.ts`).
- Public pages stay inside their JavaScript budget (170 KB since D-79; 150 KB when this was written). Admin code must not reach them.
- Established, maintained, permissively licensed libraries. No hand-rolled components. Exact version pins.

## The stack in one table

| Job | Chosen | Fallback |
| --- | --- | --- |
| Shell, record editing, toasts | Payload's own UI 3.94.0 | none needed |
| Styling | Tailwind CSS 4.3.5, admin only, prefix `tw`, no Preflight | Tailwind without a prefix, its default theme not loaded, plus a collision test |
| Primitives | shadcn/ui components on Base UI 1.9.0 | shadcn/ui on Radix 1.8.1 |
| Charts | Recharts 3.11.0 through shadcn's Chart wrapper | visx 4.0.0 for a part Recharts cannot draw |
| Tables | TanStack Table 9.3.1 with Dice UI's data table, nuqs 2.10.3 | shadcn's Data Table recipe on the same engine |
| Pipeline board | Dice UI Kanban on dnd-kit core 6.3.1 and sortable 10.0.0 | React Aria drag and drop |
| Calendar | FullCalendar 7.1.5 (MIT features) through its shadcn registry | ReUI event calendar |
| Global search | cmdk 1.1.1 through shadcn's Command | Base UI Autocomplete in a Dialog |
| Dates and times | react-day-picker 10.0.2; slot list; the browser's time field | React Aria date and time fields |
| Overlays | Base UI dialog, alert dialog, popover, menu, tooltip, drawer | Radix, with the base |
| Timeline, stat tiles, empty states | Dice UI Timeline; shadcn Card, Item, Empty | ReUI Timeline |
| Motion | CSS transitions on the kit's motion tokens | `motion` 14.14.0, by decision, for one named screen |

## 1. Styling

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Tailwind CSS v4, admin only, prefix `tw`, no Preflight | `tailwindcss` and `@tailwindcss/postcss` 4.3.5 (6 Nov 2026) [n] | MIT | Tailwind Labs. 4.3.3 on 16 Jul, 4.3.4 on 2 Nov, 4.3.5 on 6 Nov 2026 | The prefix is a documented option: classes become `tw:flex`, theme variables `--tw-color-*` [t1]. Preflight is left out by importing only the theme and the utilities [t2]. `source(none)` [t2] with `@source`† limits class scanning to `src/components/admin`. Needs Chrome 111, Safari 16.4 or Firefox 128 [t3]. Does not work through Sass, so it cannot live in `custom.scss` [t3] | **Chosen** |
| Tailwind CSS v4 without a prefix (the guide on payloadcms.com) | same | MIT | The guide is by Sandro Wegmann of 10xMedia, 25 Feb 2025 [t4] | No prefix, no `@source`; Preflight commented out; it patches Payload's `.table` by hand [t4]. Payload 3.94 also defines `--font-mono`, `--font-serif` and `--color-blue-*`, which Tailwind's default theme would overwrite [L] | Fallback, with Tailwind's default theme not loaded and a test that no generated class matches a Payload class |
| CSS modules on the kit's tokens (today's admin additions) | — | — | — | Works under every constraint. But each registry component would be rewritten by hand, and IIIC would maintain the rewrite | Kept for what exists (two-factor views, placeholders). Rejected as the console's base |

What the verification pass found in this repository:

- Payload wraps its admin CSS in one layer: the stylesheet opens with `@layer payload-default,payload;` [L]. Tailwind's layers declared after it win without `!important`.
- Payload sets the root font size to 13 px, and to 12 px at 1024 px and below [L]. Tailwind's sizes are in `rem`, so every copied component would render about a fifth smaller on a laptop and a quarter smaller on a phone. The console sets its scale in px from the kit's tokens, which are already px.
- Payload's admin stylesheet defines none of shadcn's variable names (`--background`, `--border`, `--ring`, `--radius` and the rest) [L]. They can sit on `:root`.
- Tailwind's `dark:` variant follows the device by default†. Copied code carries `dark:` classes (one in Dice UI's kanban [d2]). Guard: the variant is tied to a class that is never set (`@custom-variant`†), no `.dark` variables block exists, and a lint rule rejects `dark:` in admin code.
- A `postcss.config.mjs` replaces Next's default PostCSS plugins for the whole app†. The public pages' CSS must come out unchanged. Not tested.

The stylesheet, as a sketch. The Tailwind lines follow its documentation [t1] [t2]; the combination has not been run.

```css
/* src/app/(payload)/console.css */
@layer payload-default, payload, theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme) prefix(tw);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(tw) source(none);
@import '../../brand/css/01-tokens.css';
@import '../../brand/css/02-semantic.css';
@source '../../components/admin';
```

The generated `src/app/(payload)/layout.tsx` is marked "DO NOT MODIFY", so the console's shell component imports this file. The kit's `03-components.css` is left out: it styles bare elements (`body`, `h1` to `h4`, `p`), which would restyle Payload's own screens [L].

## 2. Primitives

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| shadcn/ui components on Base UI | `shadcn` CLI 4.23.0 (27 Oct 2026); `@base-ui/react` 1.9.0 (9 Oct 2026) [n] | MIT, MIT | Base UI: 1.6.0 on 18 Jun, 1.7.0 on 4 Aug, 1.8.0 on 4 Sep, 1.9.0 on 9 Oct 2026; a team of seven named in the README; 11.5k stars, 348 open issues, 136 open pull requests [b5]. shadcn: Base UI is the default since July 2026, and "Radix is not being deprecated" [s1] | Peers React 17 to 19; the `date-fns` and `@date-fns/tz` peers are optional [n]. Follows the WAI-ARIA Authoring Practices; claims no WCAG level; focus styles, contrast and labels are left to us [b2]. Our CSP already allows its inline `<style>` tags; `CSPProvider` gives the nonce to any inline script [b4]. Wants `isolation: isolate` on the app root and `body { position: relative }` for iOS 26 Safari [b1]. The source is copied in, so the kit's roles replace shadcn's colours | **Chosen** |
| shadcn/ui components on Radix | `radix-ui` 1.8.1 (12 Oct 2026) [n] | MIT | 1.7.0 on 5 Oct, 1.8.1 on 12 Oct 2026 | Peers React 16.8 to 19. The same components; more third-party examples† | Fallback. One base for the whole console, never both |
| React Aria Components | 1.22.1 (9 Oct 2026) [n] | Apache-2.0 | Adobe; 1.21.0 on 1 Sep, 1.22.1 on 9 Oct 2026 | Peers React 16.8 to 19. Documents keyboard and screen-reader drag and drop, and segmented date and time fields†. Its own styling model; a second family beside Base UI | Fallback for one hard widget (drag and drop, a time field) |
| Payload's own UI | `@payloadcms/ui` 3.94.0 [L] | MIT | Pinned with Payload (CLAUDE.md, rule 7) | Template, gutter, nav links, `DocumentDrawer`, `ListDrawer`, `ConfirmationModal`, `toast` (sonner 1.7.4) [L]. Passes the admin's axe and CSP tests today (`tests/e2e/admin.e2e.spec.ts`). Has no chart, calendar, board, palette or grid for arbitrary data† | **Kept** for the shell, record editing and toasts |
| Tremor | `@tremor/react` 3.18.7 (13 Jan 2025) [n] | Apache-2.0 | No release in 22 months | Peer `react ^18.0.0` only; depends on Recharts 2 [n] | Rejected |
| coss ui (was Origin UI)† | not checked | MIT† | Active† | Base UI and Tailwind†. No calendar or board found† | Not needed |
| Kibo UI† | registry | MIT† | No push since 4 May 2026† | Accessibility not documented† | Rejected |

Full design systems (MUI, Mantine, Ant Design) were not compared. Each brings its own look and styling engine beside Payload's and the kit's.

Small packages that come with this base: `lucide-react` 1.77.0 (20 Nov 2026, ISC; released almost daily); `class-variance-authority` 0.7.1 (26 Nov 2024, Apache-2.0); a class-merging helper, either `clsx` 2.1.1 with `tailwind-merge` 3.7.1 (19 Nov 2026, MIT, has a `prefix` option) or shadcn's `cn` 0.5.2 (2 Nov 2026, MIT, before 1.0, "Tailwind v4 prefixes are supported: `createCn({ prefix: "tw" })`") [n] [s5]; `@base-ui/utils` 0.5.0 (9 Oct 2026, MIT), which Dice UI's components import [n].

Tried to break it:

- **The prefix and the shadcn CLI.** The docs show only the Tailwind v3 form, `"prefix": "tw-"` [s2]. The published code has a branch for v4 that writes `tw:` before each class (`@shadcn/registry` 0.2.1, which CLI 4.23.0 uses) [s4]. Read, not run. Classes built outside a `className` string may be missed.
- **Class merging.** A helper that does not know the prefix leaves conflicting classes side by side. Both helpers above take a prefix. Dice UI's kanban imports `cn` from the package directly [d2], so that import is pointed at the console's configured helper when the file is copied in.
- **Two modal systems.** Payload's drawers use `@faceless-ui/modal` 3.0.0 [L]; Base UI has its own focus trap and portal. Neither is opened from inside the other. Payload's layers are nav 20, modal 30, status 40, popup 60 [L]; shadcn's popups use 50†.
- **Portals.** Base UI popups render in `<body>`, outside the console's wrapper, so they would miss the font variables set on it. The console gives them a container inside the wrapper.

## 3. Charts

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Recharts 3 | 3.11.0 (17 Nov 2026) [n] | MIT | 3.9.2 on 4 Jul, 3.10.0 on 20 Jul, 3.10.1 on 25 Jul, 3.11.0 on 17 Nov 2026; 27.7k stars, 396 open issues, 83 open pull requests [r1] | SVG, so fills and strokes take `var(--…)` and charts print. Peers React 16.8 to 19 and `react-is`, which "needs to match the version of your installed react package" [r1]. `accessibilityLayer` is true by default in 3.0 [r2]. `isAnimationActive` defaults to `'auto'`: no animation when the device asks for reduced motion [r3]. Depends on Redux Toolkit, react-redux and immer [n], so it loads only on the screens that draw a chart | **Chosen** |
| shadcn Chart | not versioned; "now uses Recharts v3"† | MIT | With shadcn/ui | A thin wrapper: one config maps each series to a label and a CSS variable†. Copied in and restyled | **Chosen** as the wrapper |
| Bklit UI | no versions | MIT (charts) | See § Bklit | See § Bklit | Not now |
| visx | `@visx/xychart` 4.0.0 (11 Jun 2026) [n] | MIT | One major a year† | Low-level SVG parts. Peers React 18 to 19 and `@react-spring/web` [n]. No keyboard layer or tooltips with focus†: we would write them | Fallback for a single part |
| TanStack Charts | `@tanstack/react-charts` 1.5.0 (7 Nov 2026) [n] | MIT | 1.2.1 on 2 Nov to 1.5.0 on 7 Nov 2026; 1.0.0 on 3 Oct 2026† | Accessible SVG and a linked chart-and-table example†. Seven weeks past 1.0 | Watch. Re-check in May 2027 |
| evilcharts† | registry, no versions | MIT† | One account† | Recharts with glow and pattern effects†. Decoration over figures | Rejected |
| Nivo† | 0.99.0 (23 May 2025)† | MIT† | No release in 18 months† | Theme as a JS object† | Rejected |
| Apache ECharts† | 6.1.0 (19 May 2026)† | Apache-2.0† | Apache project† | Canvas by default; no keyboard path to a point†; 368 KB gzipped whole† | Rejected |
| Chart.js† | 4.6.1 (22 Oct 2026)† | MIT† | Active† | Canvas only: no CSS variables, fallback content written by hand† | Rejected |
| Observable Plot† | 0.6.19 (5 Nov 2026)† | ISC† | Observable† | Static SVG, no React components, pointer tips only† | Not for the console. A candidate for printed reports later |
| Unovis† | `@unovis/react` 1.8.1 (10 Nov 2026)† | Apache-2.0† | F5† | SVG with CSS variables†. Accessibility not checked† | Not preferred |
| MUI X Charts† | 9.18.1 (16 Nov 2026)† | MIT (community)† | MUI† | Needs `@mui/material` and Emotion† | Rejected |

How each figure in `05` § Reports and `14` §4 is drawn:

- **Trends (bookings, proposal calls, sessions; week on week):** a line or bars, the current period in ink, the earlier one dashed.
- **By service or by door:** horizontal bars, so long labels read.
- **Funnels (doors, step 0, booking started to confirmed; Team Map to proposal):** horizontal bars with the count and the step-to-step rate on each. A trapezoid hides both.
- **Cohort or return-rate grids:** no chart library. A real `<table>` with header cells and a caption, cells tinted from the kit's tints, the value printed in each.
- **Progress to a target:** the browser's `<meter>`.
- **Sparklines in tiles and rows:** a small Recharts line, fixed size, no animation, `aria-hidden`, with the figure in text beside it.
- **Numbers:** `Intl.NumberFormat('en-IN')` for ticks, tooltips and tables: 12,34,567; 1.5L; ₹1.3Cr†.

Every chart has a caption and a table of the same figures beside it or one press away. The table is the reliable path for a screen-reader user: how well the Recharts keyboard layer reads aloud is debated in its own discussions (#4484, #4662)†.

Colour is open. The kit has one accent and no chart palette. Contrast on white, computed from the kit's tokens: yellow `#FFDD00` 1.35:1 (1.25:1 on paper), ink 15.42:1, slate 8.10:1, `slate-500` 5.42:1, `slate-400` 3.74:1, success 6.06:1, danger 6.54:1. WCAG 1.4.11 asks 3:1 for the parts of a graphic. So yellow cannot carry a line or an unoutlined bar. See the open questions.

## 4. Tables

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| TanStack Table | `@tanstack/react-table` 9.3.1 (12 Oct 2026) [n] | MIT | 9.2.5 on 4 Oct to 9.3.1 on 12 Oct 2026; 9.0.0 on 4 Aug 2026†; 28.6k stars, 50 open issues, 36 open pull requests [n2] | Headless: sorting, filters, column visibility, selection, pages. Peer React 18 or later [n]. We keep a real `<table>` | **Chosen** engine |
| Dice UI data table (served from tablecn.com) | registry code, no versions [d3] | MIT [d5] | One lead maintainer; 2.1k stars, 1,137 commits, 25 open issues, 11 open pull requests [d5] | 19 files, about 151 KB of source. Written for v9 (`table.Subscribe`). Sets `aria-sort`. Depends on `@tanstack/react-table`, `nuqs`, `zod`, Base UI; needs shadcn's button, calendar, command, popover, select, slider, table and six more; imports `cmdk` and `react-day-picker`. One hard-coded `en-US` format to change [d3] | **Chosen** table UI |
| nuqs | 2.10.3 (10 Nov 2026) [n] | MIT | 2.10.2 on 8 Oct, 2.10.3 on 10 Nov 2026 | Typed filter, sort and page state in the URL. Peers Next 14.2 or later, React 18.2 or later [n] | **Chosen** |
| TanStack Virtual | `@tanstack/react-virtual` 3.14.26 (3 Nov 2026) [n] | MIT | Four releases from 26 Oct to 3 Nov 2026 | Only where a list passes a few hundred rows (a long timeline, the audit log). Virtual rows need `aria-rowcount` and `aria-rowindex`† | Later, if needed |
| shadcn Data Table recipe† | with shadcn/ui | MIT | Active | Same engine, fewer filters†. Whether it uses the v9 API was not checked | Fallback |
| Payload's list view | 3.94.0 | MIT | With Payload | Filters, columns and bulk edit for one collection | **Kept** for plain collection lists |
| AG Grid Community | 36.3.0 (4 Nov 2026) [n] | MIT; Enterprise is paid | Commercial team | 21.9 MB unpacked [n]. Its own look. Grouping and export are Enterprise† | Rejected |

Lists page, filter and sort on the server through Payload's local API with the user's access rules. The URL holds the state, so a filtered list is a link, and a saved view (`05` § Quality bar) is a named link.

## 5. Pipeline board

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Dice UI Kanban | registry code, one file, 32.8 KB [d2] | MIT [d5] | As Dice UI above | Keyboard: Enter or Space picks up and drops, arrows move, Esc cancels [d1]. The source wires a keyboard sensor, a touch sensor (250 ms press), announcements and screen-reader instructions, and a drag overlay [d2]. One `dark:` class to remove [d2] | **Chosen** |
| dnd-kit, classic packages | `@dnd-kit/core` 6.3.1 (5 Dec 2024), `sortable` 10.0.0 and `modifiers` 9.0.0 (4 Dec 2024) [n] | MIT | No release in 23 months. The repository's README now documents only the new packages; 17.8k stars, 103 open issues, 60 open pull requests [n1] | Peers React 16.8 or later [n]. Payload 3.94 ships core 6.3.1 and sortable 10.0.0 [L], and runs them on React 19.2 in this admin. The same copy serves the board | **Chosen** engine |
| dnd-kit, new packages | `@dnd-kit/react` 0.5.3 (31 Oct 2026) [n] | MIT | 0.5.0 on 11 Jun, 0.5.3 on 31 Oct 2026 | Before 1.0 | Watch. Move when it reaches 1.0 |
| React Aria drag and drop | in `react-aria-components` 1.22.1 [n] | Apache-2.0 | Adobe | Keyboard, screen-reader and touch screen-reader dragging†. No ready board. A second primitives family | Fallback |
| Pragmatic drag and drop | 4.0.0 (24 Sep 2026) [n] | Apache-2.0 | Atlassian | No keyboard dragging; its accessibility helper brings Emotion† | Rejected |
| `@hello-pangea/dnd` | 18.0.1 (9 Feb 2025) [n] | Apache-2.0 | No release in 21 months | Carries Redux [n] | Rejected |

The frozen engine is the weak point, and the answer to it is on the card: every card has a "Move to stage" menu. The menu does not use drag and drop at all. It is the path for one finger (WCAG 2.5.7), for a phone, and for a screen reader, and it keeps the board working if dragging ever breaks.

## 6. Calendar

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| FullCalendar 7 | `@fullcalendar/react` 7.1.5 (12 Nov 2026); `temporal-polyfill` 1.0.8 (4 Nov 2026) [n] | MIT for every standard view and feature [f6] | 7.1.3 on 16 Oct, 7.1.4 on 4 Nov, 7.1.5 on 12 Nov 2026; 7.0.0 on 19 Jun 2026†; 20.8k stars, about 1k open issues, 60 open pull requests [f7] | Written in React, "including working SSR and StrictMode"; peers React 17 to 19 [f1]. Standard views live under `@fullcalendar/react/*` [f2]. It "no longer bundles its own CSS": we import its stylesheets [f1]. Dark is opt-in (`data-color-scheme` or the `colorScheme` prop); it does not follow the device [f4]. A named zone such as Asia/Kolkata needs no plugin; callbacks still give legacy `Date` objects [f1]. Its shadcn registry installs with the shadcn CLI and "inherits all style variables from the Shadcn theme" [f5]. "All calendar views now pass Axe accessibility testing", but for one scrollbar finding it calls a false positive [f1]. Touch: long-press to drag [f3] | **Chosen** |
| ReUI event calendar† | registry code | MIT [e1] | Keenthemes; pushed 16 Oct 2026† | Base UI, date-fns, IANA zones, a day view with a column per resource†. Keyboard moving not documented† | Fallback |
| Schedule-X | `@schedule-x/react` 4.1.0 (21 Jan 2026) [n] | MIT core; premium €479 a year† | Small team† | Preact inside React†. Drag and resize appear to be paid† | Rejected |
| react-big-calendar | 1.20.0 (1 Jun 2026) [n] | MIT | Slow† | Depends on moment, moment-timezone, luxon, dayjs, globalize and lodash together [n] | Rejected |

Two things the documentation does not give:

- **No keyboard way to move or resize an event** is documented. Events can take focus (`eventInteractive`) [f3]. So every booking opens a Reschedule dialog, which `05` already has as the workflow. Dragging is the shortcut, never the only path.
- **A column per practitioner** is the Vertical Resource View, which is Premium, with the Timeline and print views: from $480 for one to ten developers [f6]. `05` asks for week and day views with a filter per person, which is free. If IIIC wants a column per practitioner, it buys Premium or takes the fallback.

## 7. Global search

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| cmdk, through shadcn's Command | 1.1.1 (14 Mar 2025) [n] | MIT | No release in 20 months. Now at `dip/cmdk`: 13.2k stars, 57 open issues, 30 open pull requests [c1] | Peers React 18 and 19; depends on four Radix packages, Radix Dialog among them [n]. shadcn's Command, Base UI variant too, "uses the cmdk component" [s3]. The README reports testing with VoiceOver [c1]. `shouldFilter={false}` lets the server do the search† | **Chosen**, with the fallback named |
| Base UI Autocomplete in a Dialog | in 1.9.0 | MIT | With Base UI | One family, monthly releases. We compose the palette ourselves | Fallback |
| kbar | 1.0.0 (10 Aug 2026) [n] | MIT | One release | Its own fuzzy search (fuse.js) suits lists held in the browser [n] | Rejected |

Results come from a server function that checks the user and the role first. Session notes and Map answers are never searched (CLAUDE.md, rule 3).

## 8. Dates and times

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| React DayPicker, through shadcn's Calendar | `react-day-picker` 10.0.2 (30 Sep 2026) [n] | MIT | 10.0.0 on 8 May, 10.0.2 on 30 Sep 2026 | Follows the ARIA Authoring Practices for date pickers; arrow, Page and Home keys; claims no WCAG level [p1]. Depends on `date-fns` ^4.1.0 and `@date-fns/tz` ^1.4.1 [n]; Payload pins `@date-fns/tz` 1.2.0 [L], so the admin carries two small copies | **Chosen** for dates and ranges |
| A list of open slots; the browser's `<input type="time">` | — | — | — | Rescheduling picks from the slot engine's open times, never free entry. Working hours use the browser's field: a phone shows its own time wheel | **Chosen** for times |
| React Aria DateField and TimeField† | in 1.22.1 | Apache-2.0 | Adobe | Segmented fields with zones†. A second family for one field | Fallback |
| Payload's DatePicker | `react-datepicker` 7.6.0 [L] | MIT | With Payload | Styled as Payload | Stays inside Payload's own fields |

## 9. Overlays and toasts

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Base UI dialog, alert dialog, popover, menu, tooltip, select, tabs, drawer | 1.9.0 [n] | MIT | Drawer "is now stable" since 1.3.0 (12 Mar 2026) [b3] | One focus and layering model. The drawer is the phone sheet | **Chosen** |
| Payload's `toast`, `DocumentDrawer`, `ListDrawer`, `ConfirmationModal` | 3.94.0; sonner 1.7.4 [L] | MIT | With Payload | The toaster is already mounted. Drawers edit a record in place | **Chosen** for toasts and record editing |
| Sonner 2 | 2.0.8 (9 Aug 2026) [n] | MIT | 2.0.7 on 2 Aug 2025, 2.0.8 on 9 Aug 2026 | A second toaster would announce everything twice | Rejected |
| Vaul | 1.1.2 (14 Dec 2024) [n] | MIT | README: "This repo is unmaintained." [v1] | — | Rejected |

## 10. Timeline, stat tiles, empty states

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Dice UI Timeline | registry code, one file, 19 KB [d4] | MIT [d5] | As Dice UI above | List and list-item roles, a `<time>` element, built on Base UI's `useRender`, so the list can be a real `<ol>` [d4] | **Chosen** |
| shadcn Card, Item, Empty, Skeleton† | with shadcn/ui | MIT | Active | Plain parts that take the kit's type and colour† | **Chosen** for tiles and empty states |
| ReUI Timeline† | registry code | MIT [e1] | Keenthemes | A third registry for one part | Fallback |
| TanStack Query | 5.108.2 (20 Nov 2026) [n] | MIT | Several releases a week | Server components load the data, and React 19's `useOptimistic` covers the instant updates | Not at the start |

A stat tile is text first: the figure formatted for en-IN, a label in plain words, the period it covers, and a link to the records behind it (`05` § Reports). The timeline is merged on the server and paged.

## 11. Motion

| Candidate | Version | Licence | Maintenance | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| CSS transitions on the kit's tokens | kit 1.0.3 | — | — | `--iiic-motion-fast` is 150 ms; the kit sets `--iiic-motion` to 0 ms under `prefers-reduced-motion` [L]. Base UI marks entering and leaving states for CSS†. dnd-kit moves the cards itself | **Chosen** |
| `tw-animate-css` | 1.4.0 (24 Sep 2025) [n] | MIT | CSS only | The keyframes shadcn's components name† | Only if a copied component needs it |
| Motion | `motion` 14.14.0 (13 Nov 2026) [n] | MIT | 14.11.1 on 9 Nov to 14.14.0 on 13 Nov 2026 | Layout animation. More JavaScript on a phone for something CSS does here | Not installed. By decision, for a named screen |
| NumberFlow | `@number-flow/react` 0.6.2 (18 Jul 2026) [n] | MIT | Before 1.0; one author† | Rolls digits when a figure changes. Respects reduced motion by default and takes a nonce; its page does not say what a screen reader hears [u1] | Not at the start. Figures are plain text |

## Bklit: what it is and where it stands

Two things carry the name.

**Bklit UI** (bklit.com, `github.com/bklit/bklit-ui`) is a set of chart components handed out as a shadcn registry: the CLI copies the source into the project. It is the one the owner meant.

- Licence: MIT for the charts, "Copyright (c) 2026 uixmat" [k3]. Bklit Studio, the chart playground, is proprietary [k2].
- State: 2.0k stars, 128 forks, 601 commits, 5 open issues, 6 open pull requests, no releases [k2]. Its package is `@bklitui/ui` 0.0.0, private [k4]; nothing is on npm. In effect one maintainer†. The repository was created on 19 January 2026†.
- Built on: Base UI, `motion` ^12.27, d3 modules and NumberFlow ^0.5.4 [k4], with Tailwind v4 classes†.
- The line chart alone is about 167 KB of source in 22 files, and needs 11 further registry items [k1]. In that source there is no key handler and no `tabIndex`; there are three ARIA attributes and eight reduced-motion checks [k1]. A keyboard user cannot reach a data point. The README says nothing about accessibility [k2].
- It moved its drawing from visx to d3 (changelog dated 31 October 2026 by its address). People who had copied charts in must "re-add each chart with `--overwrite`" and re-apply their edits [k5].
- Number formats are hard-coded en-US†. Its documentation opens in dark mode†.

It has the most polished motion of the candidates†: animated reveals, loading states, sprung tooltips. It is also the right kind of thing for this stack, since it uses the same base (a shadcn registry on Base UI and Tailwind v4). It is not adopted now, for three reasons: it has no versions to pin, it rests on one person, and a keyboard user cannot read its charts. It stays as the visual reference for tooltips and loading states. It is re-checked in May 2027: if it then has tagged releases and keyboard access to data points, one chart is tried behind the same rules as any other (a table beside it, axe, a keyboard pass).

**Bklit Analytics** (`github.com/bklit/bklit`) is a separate product, an analytics service. The repository is archived and its README says it "has been discontinued" [k6]. Its licence file is CC BY-NC 4.0: "may not be sold or used for commercial purposes" [k6]. It is not usable and not needed: IIIC uses Cloudflare Web Analytics.

## Licences and cost

Nothing chosen costs money. All of it is MIT, but for `lucide-react` (ISC) and `class-variance-authority` (Apache-2.0), which are as permissive. Paid things were looked at and left out: FullCalendar Premium (from $480 for one to ten developers [f6]), AG Grid Enterprise†, ReUI's Pro blocks (from $249†), Schedule-X premium (€479 a year†) and Bklit Studio (proprietary [k2]).

## Packages to pin, by the screen that first needs them

- **The proof, the Pipeline board (M4):** `tailwindcss` 4.3.5, `@tailwindcss/postcss` 4.3.5 and `postcss` 8.5.33 as dev dependencies; `@base-ui/react` 1.9.0, `@base-ui/utils` 0.5.0, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/modifiers` 9.0.0, `@dnd-kit/utilities` 3.2.2, `class-variance-authority` 0.7.1, the class-merging helper and `lucide-react` 1.77.0. The shadcn CLI is run as `pnpm dlx shadcn@4.23.0`; it is not installed.
- **Lists and search (M5):** `@tanstack/react-table` 9.3.1, `nuqs` 2.10.3, `cmdk` 1.1.1, `react-day-picker` 10.0.2.
- **The Calendar (M5):** `@fullcalendar/react` 7.1.5, `temporal-polyfill` 1.0.8.
- **Reports (M5):** `recharts` 3.11.0, `react-is` 19.2.9 (React's own version).

Each is checked for a newer patch on the day it is installed, and what is installed is what is pinned.

## What will make the console good to use

The libraries give correct behaviour. These are the things that make the screens quick and calm to work in. Each is a rule a pull request can be held to.

1. **The first view arrives with its data.** Views are server components: the page comes with the day's rows in it, with no spinner on load. Lists page on the server. A placeholder shaped like the content shows only when a fetch passes about 300 ms. The calendar, the charts and the board load with their own screens and nowhere else. `05` already sets the bar: under a second on office broadband.
2. **Dense, and readable.** The console uses the kit's 13 and 14 px sizes in Manrope, with Fraunces for screen titles only. Rows are about 36 px on a laptop. Figures use tabular numerals so columns line up. One chip vocabulary for status, never colour alone. Columns can be hidden; the choice is kept in the link.
3. **Keyboard first.** `/` or Ctrl K opens search from anywhere. Arrow keys move through a list, Enter opens, Esc closes, and focus returns to the row it left. `?` lists the shortcuts. Single-letter shortcuts are off while typing and can be turned off altogether (WCAG 2.1.4). Every drag has a menu or a dialog that does the same job.
4. **Instant, and honest about it.** Moving a card, marking attended, assigning a lead: the screen changes at once, and the server confirms. If the server refuses, the item goes back and a toast says why, with Retry. Money, erasure and publishing proof are never shown as done before the server says so.
5. **Empty states that tell the truth.** An empty panel says what will appear and why it is empty (the pattern in `VOICE.md`). Zero is shown as zero, with its period and its definition. A chart with too little data shows its table and says so. A failed load says it failed and offers Retry; it is never drawn as zero.
6. **Motion that answers "where did it go?".** A card settles into its column. A row leaves the list it was cleared from. A drawer closes towards the edge it came from. About 150 ms, the kit's fast token. Nothing moves on load, figures do not count up, and everything is still under reduced motion. Session-note views have no motion at all.
7. **A phone layout for each job, not a shrunken laptop.** Today is one column, in order of urgency, with actions in reach of a thumb. A table becomes stacked rows of label and value. The calendar opens on the day. The board shows one stage at a time, with "Move to stage" on each card. Sheets rise from the bottom. Targets are 44 px. Nothing depends on hover.
8. **Every figure can be checked.** A number links to the records behind it. Times say IST. A destructive action shows what will happen and asks for a reason first (`05` § Quality bar).

## Token map

shadcn's variables, set once for the console from the kit's roles. Light only: no `.dark` block.

| shadcn variable | Kit role | Note |
| --- | --- | --- |
| `--background`, `--card`, `--popover` | `--iiic-surface` | White under the consultancy register |
| `--foreground` | `--iiic-text` | 15.42:1 on white |
| `--primary` / `--primary-foreground` | `--iiic-accent` / `--iiic-accent-ink` | The kit's primary button: yellow, ink text (11.45:1) |
| `--secondary`, `--muted`, `--accent` | `--iiic-surface-wash` | Hover and quiet fills. Yellow tints mark the current item only |
| `--muted-foreground` | `--iiic-text-muted` | 5.42:1 on white |
| `--destructive` | `--iiic-danger` | 6.54:1 on white |
| `--border` | `--iiic-rule` | Rules only |
| `--input` | `--iiic-rule-strong` | Control borders, 3.74:1 on white |
| `--ring` | `--iiic-ink`; focus uses `box-shadow: var(--iiic-focus)` | The kit's ring |
| `--radius` | `--iiic-radius-control` | |
| sans / display font | `--iiic-font` / `--iiic-font-display` | From `next/font`'s `--font-manrope` and `--font-fraunces` |
| `--chart-1` to `--chart-5` | none yet | Needs kit roles (D-53). See the open questions |
| spacing, type sizes, radii | the kit's px tokens | Not `rem`: Payload's root is 13 px |

Copied components with a dark fill (a tooltip, a default badge) are restyled to white with a rule, so nothing dark sits beside yellow. Status chips keep the kit's badge styles and the one vocabulary in `05` § Quality bar: shadcn's Badge is restyled to them.

## What the verification pass changed or settled

- Base UI's `date-fns` and `@date-fns/tz` peers are optional. Payload already ships `date-fns` 4.1.0 and `@date-fns/tz` 1.2.0.
- The shadcn CLI has a Tailwind v4 prefix branch in code. The documentation still shows only `tw-`.
- Dice UI's kanban does wire announcements, screen-reader instructions and a touch sensor. Its page lists only the keys.
- Dice UI has its own Timeline, so ReUI is not needed for it.
- Payload's root font size (13 px, 12 px on small screens) was in none of the three reports.
- cmdk has 57 open issues and 30 open pull requests; "87 open issues" was the sum.
- Tailwind had no release between 16 July and 2 November 2026; "every few weeks" overstates it.
- FullCalendar 7 imports its CSS and does not follow the device into dark mode. A column per practitioner is a paid view.
- Recharts needs `react-is` at React's own version, and carries Redux Toolkit.
- Bklit Analytics: the repository page shows it archived; the licence file is CC BY-NC 4.0, as reported.

## Could not verify

- **Bundle weights.** None was measured, and the published figures are for whole packages. Measure each console screen's JavaScript in the pull request that adds it.
- **GitHub figures.** The API refused unauthenticated calls (rate limit). Stars and open counts were read from the repository pages for Base UI, Recharts, TanStack Table, dnd-kit, Dice UI, FullCalendar, cmdk and Bklit UI; last-commit dates were not shown there. Other repository figures are from the research passes (†).
- **The prefix, end to end.** The CLI's v4 branch was read, not run. Whether Dice UI's and FullCalendar's registry items come out fully prefixed is not known.
- **Tailwind beside Payload in a production build.** Layer order across CSS chunks, and whether Payload's own screens are unchanged, are untested. Users report "works in dev, not in production"†.
- **The public site's CSS after a PostCSS config is added.** Untested.
- **Screen readers.** No pass was run. Open: what the Recharts keyboard layer reads aloud; what dnd-kit announces on the board; FullCalendar's grid.
- **FullCalendar.** Keyboard moving is not documented, which is not proof it is absent. The `timegrid` and `interaction` entry points were not shown on the pages read (only `daygrid`). Whether its shadcn registry is itself MIT is not stated on its page.
- **Base UI.** Which components render an inline script (the page says they are opt-in). Whether a provider registered in Payload's `admin.components.providers` can receive the nonce.
- **Web workers.** The CSP has no `worker-src`; a worker would probably be blocked†. None of the chosen libraries is known to need one.
- **Payload's other stylesheets.** Only the admin stylesheet was searched for clashing names. The rich text editor's own CSS was not.
- **Maintainers.** Bklit's maintainer's full name; the contributor counts of Dice UI and evilcharts.
- **Not re-read:** everything marked †, including the versions and dates of the rejected chart libraries, ReUI's components, coss ui, Kibo UI, Schedule-X's paid features and React's ViewTransition.

## Open questions for IIIC

1. **Tailwind in the admin.** It is new to the project and needs a decision before any component is copied in. It stays out of the public site. The decision should also say that the console is built from shadcn's markup styled by the kit's roles, not from the kit's component classes (CLAUDE.md, rule 2).
2. **Chart and service colours.** The kit has one accent and no chart palette. A proposal to start from: ink for the main series, `slate-400` dashed for the comparison, yellow only as a fill with an ink outline to mark the current bar, success and danger only for good and bad. Telling three services apart (the calendar, revenue by application) needs labels and patterns, or new kit colours. Either is a kit change (D-53).
3. **Which register the console wears.** The mapping above reads the kit's roles. The consultancy register (white surface, 150 ms motion) is the nearest fit; an `admin` register in the kit would be cleaner. A kit change (D-53).
4. **A column per practitioner in the calendar.** Not in `05`. If wanted: FullCalendar Premium, or the fallback.
5. **Definitions for the Reports figures.** The cohort (week of first enquiry, or of first booking) and the targets have no source in `09` yet. The return-rate grid and the progress bars wait for them.

## Sources (all read 22 November 2026)

npm, per package, read through `https://registry.npmjs.org/<name>` (the record behind `https://www.npmjs.com/package/<name>`): [n] `@base-ui/react`, `@base-ui/utils`, `radix-ui`, `react-aria-components`, `react-aria`, `shadcn`, `@shadcn/registry`, `cn`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react`, `tw-animate-css`, `recharts`, `react-is`, `@visx/xychart`, `@tanstack/react-charts`, `@tanstack/react-table`, `@tanstack/react-virtual`, `@tanstack/react-query`, `@tanstack/react-store`, `nuqs`, `zod`, `ag-grid-community`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/react`, `@hello-pangea/dnd`, `@atlaskit/pragmatic-drag-and-drop`, `@fullcalendar/react`, `@fullcalendar/core`, `@full-ui/headless-calendar`, `fullcalendar`, `temporal-polyfill`, `@schedule-x/react`, `react-big-calendar`, `cmdk`, `kbar`, `react-day-picker`, `date-fns`, `@date-fns/tz`, `sonner`, `vaul`, `motion`, `@number-flow/react`, `number-flow`, `@tremor/react`. `@bklit/ui` and `@diceui/kanban` do not exist there (404).

Tailwind and Payload: [t1] https://tailwindcss.com/docs/styling-with-utility-classes [t2] https://tailwindcss.com/docs/preflight [t3] https://tailwindcss.com/docs/compatibility [t4] https://payloadcms.com/posts/guides/how-to-theme-the-payload-admin-panel-with-tailwind-css-4

Base UI: [b1] https://base-ui.com/react/overview/quick-start [b2] https://base-ui.com/react/overview/accessibility [b3] https://base-ui.com/react/overview/releases [b4] https://base-ui.com/react/utils/csp-provider [b5] https://github.com/mui/base-ui

shadcn/ui: [s1] https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default [s2] https://ui.shadcn.com/docs/components-json [s3] https://ui.shadcn.com/docs/components/base/command [s4] https://unpkg.com/shadcn@4.23.0/dist/index.js and the files of https://unpkg.com/@shadcn/registry@0.2.1/ [s5] https://raw.githubusercontent.com/shadcn-ui/cn/main/README.md

Recharts: [r1] https://github.com/recharts/recharts [r2] https://github.com/recharts/recharts/wiki/3.0-migration-guide [r3] https://recharts.github.io/guide/animations/

Bklit: [k1] https://ui.bklit.com/r/line-chart.json (redirects to https://bklit.com/r/line-chart.json) [k2] https://github.com/bklit/bklit-ui [k3] https://raw.githubusercontent.com/bklit/bklit-ui/main/LICENSE [k4] https://raw.githubusercontent.com/bklit/bklit-ui/main/packages/ui/package.json [k5] https://bklit.com/docs/upgrading-from-visx [k6] https://github.com/bklit/bklit and https://raw.githubusercontent.com/bklit/bklit/main/LICENSE

Dice UI, dnd-kit, TanStack: [d1] https://www.diceui.com/docs/components/kanban [d2] https://www.diceui.com/r/kanban.json [d3] https://www.diceui.com/r/data-table.json (redirects to https://www.tablecn.com/r/data-table.json) [d4] https://www.diceui.com/r/timeline.json [d5] https://github.com/sadmann7/diceui and https://raw.githubusercontent.com/sadmann7/diceui/main/LICENSE [n1] https://github.com/clauderic/dnd-kit [n2] https://github.com/TanStack/table

FullCalendar: [f1] https://fullcalendar.io/docs/upgrading-from-v6 [f2] https://fullcalendar.io/docs/react [f3] https://fullcalendar.io/docs/accessibility [f4] https://fullcalendar.io/docs/color-palettes [f5] https://fullcalendar.io/docs/shadcn [f6] https://fullcalendar.io/pricing [f7] https://github.com/fullcalendar/fullcalendar

Others: [c1] https://github.com/pacocoursey/cmdk (now `dip/cmdk`) [p1] https://daypicker.dev/guides/accessibility [v1] https://github.com/emilkowalski/vaul [u1] https://number-flow.barvian.me [e1] https://raw.githubusercontent.com/keenthemes/reui/main/LICENSE.md

This repository: [L] `node_modules/@payloadcms/ui/package.json` and `node_modules/@payloadcms/next/dist/prod/styles.css` (Payload 3.94.0), `src/payload.config.ts`, `src/lib/security/csp.ts`, `src/brand/css/01-tokens.css`, `src/brand/css/02-semantic.css`, `src/brand/css/03-components.css`, `src/app/(payload)/layout.tsx`, `src/components/admin/PlaceholdersView.tsx`, `tests/e2e/admin.e2e.spec.ts`, `lighthouserc.cjs`.

From the three research passes of 22 November 2026, not re-read (†): https://bklit.com/docs/components/line-chart · https://github.com/sponsors/uixmat · https://newreleases.io/project/npm/recharts/release/3.0.0 · https://bundlephobia.com/package/recharts@3.11.0 · https://ui.shadcn.com/docs/components/radix/chart · https://ui.shadcn.com/docs/components/base/chart · https://github.com/legions-developer/evilcharts · https://evilcharts.com · https://vercel.com/blog/vercel-acquires-tremor · https://www.tremor.so/ · https://github.com/tremorlabs/tremor · https://github.com/tremorlabs/tremor-npm · https://github.com/airbnb/visx · https://bundlephobia.com/package/@visx/xychart@4.0.0 · https://tanstack.com/charts/latest · https://www.npmjs.com/package/@tanstack/charts · https://github.com/plouc/nivo · https://www.npmjs.com/package/@nivo/core · https://github.com/apache/echarts · https://echarts.apache.org/handbook/en/best-practices/aria · https://www.npmjs.com/package/echarts · https://github.com/chartjs/Chart.js · https://github.com/reactchartjs/react-chartjs-2 · https://github.com/observablehq/plot · https://www.npmjs.com/package/@observablehq/plot · https://github.com/f5/unovis · https://www.npmjs.com/package/@unovis/react · https://www.npmjs.com/package/@mui/x-charts · https://github.com/barvian/number-flow · https://github.com/radix-ui/primitives · https://github.com/adobe/react-spectrum · https://react-aria.adobe.com/dnd · https://github.com/shadcn-ui/ui · https://ui.shadcn.com/docs/changelog · https://tanstack.com/table/latest · https://github.com/TanStack/virtual · https://www.diceui.com/docs/components/data-table · https://www.ag-grid.com/react-data-grid/community-vs-enterprise/ · https://docs.dndkit.com/guides/accessibility · https://mintlify.com/clauderic/dnd-kit/guides/accessibility · https://github.com/atlassian/pragmatic-drag-and-drop · https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines · https://v7.fullcalendar.io/timeZone · https://reui.io/docs/components/base/event-calendar · https://reui.io · https://github.com/keenthemes/reui · https://schedule-x.dev/docs/calendar · https://schedule-x.dev/premium · https://github.com/bigcalendar/react-big-calendar · https://github.com/timc1/kbar · https://github.com/gpbl/react-day-picker · https://github.com/emilkowalski/sonner · https://github.com/motiondivision/motion · https://coss.com/ui · https://github.com/cosscom/ui · https://github.com/shadcnblocks/kibo · https://payloadcms.com/docs/admin/customizing-css · https://payloadcms.com/docs/custom-components/custom-views · https://payloadcms.com/posts/guides/how-to-setup-tailwindcss-and-shadcn-ui-in-payload · https://rubixstudios.com.au/insights/tailwindcss-v4-with-payloadcms · https://payloadcms.com/community-help/discord/tailwind-4 · https://tailwindcss.com/docs/detecting-classes-in-source-files · https://github.com/payloadcms/payload · https://tremor.so/changelog
