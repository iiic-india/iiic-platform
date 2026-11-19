# Social templates

`social.html` draws four artboards at their exact pixel sizes. `png/` holds exports with specimen text, which only shows the type sizes.

| Artboard | Size | Use | Keep clear |
| --- | --- | --- | --- |
| `linkedin-company-cover` | 1128 × 191 | IIIC's LinkedIn company page cover | The lower left, where the page logo overlaps |
| `linkedin-profile-banner` | 1584 × 396 | Personal profiles of the team | The left 400 px, where the profile photo sits |
| `post-quote` | 1080 × 1080 | A pull quote from the Journal | — |
| `post-announcement` | 1080 × 1350 | An event or programme announcement | — |

## Making a post

Replace the `{{fields}}` in the artboard, then export it at its exact size (a browser screenshot of the element, or Playwright: `element.screenshot()`). The avatar for LinkedIn, WhatsApp and Google Business Profile is `../../logo/png/avatar-512.png`.

## Rules

- Paper, white and yellow grounds only; type is ink (the quote mark is ink on a yellow tile, never yellow type); one yellow field per artboard.
- Real quotes only, with the speaker's permission; client words only through the verified-testimonial flow, with consent recorded.
- No stock photos and no AI-generated people. Real photos go into the yellow field in place of the mark.
- Headlines up to about eight words; quotes up to about thirty.
