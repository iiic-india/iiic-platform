# Presentation template

`iiic-template.pptx` is a PowerPoint template with the IIIC theme (colours from `tokens.json`) and five layouts, shown across seven sample slides. Opens in PowerPoint, Keynote and Google Slides (File → Import). No slide is dark.

| Layout | Use | Background |
| --- | --- | --- |
| TITLE | Opening slide: kicker, title, subtitle on the yellow field; logo and meta line on the white base | yellow + white base |
| SECTION | Divider between sections, the bar beside the title | paper |
| CONTENT | Title plus body; most slides | white |
| CONTENT_PAPER | The same on the paper wash, for cards and stats | paper |
| Two-column (on CONTENT) | Text left, image or chart panel right | white |
| Stats (on CONTENT_PAPER) | Three big Georgia numbers on yellow-050 cards | paper |
| Process (on CONTENT) | Three numbered steps in paper cards with yellow step circles | white |
| CLOSING | Thank you and the next step on the yellow field; logo and contact on the white base | yellow + white base |

## Rules

- Replace every `[[placeholder]]`; the footer (mark, name, slide number), the white base and the backgrounds live on the layouts and need no editing.
- Yellow is the field and the accent: the title and closing slides, the section bar, step circles, stat cards. Type on yellow is ink. Never yellow text, and never a dark slide.
- One idea per slide; titles never end with a period; body text 14–16pt; titles in Georgia, text in Arial.
- Fonts are Georgia and Arial so the deck renders the same on any machine. If the team installs Fraunces and Manrope everywhere, change both theme fonts in `build-template.js` and rebuild.
- Charts: use PowerPoint's native charts with the theme colours (yellow for the series that matters, slate-500 for the rest, on a white or paper slide).

## Rebuilding

`build-template.js` regenerates the file from `tokens.json`. It needs `pptxgenjs` and the pptx skill's `apply_theme.js` (path in `PPTX_SKILL`); validated with that skill's `validate.py` and rendered on 28 Oct 2026.
