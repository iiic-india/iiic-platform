# Email templates

Three files, all table-based with inline styles so they survive Gmail, Outlook and Apple Mail. The look: paper background `#F8F6F0`, a white card with the logo's yellow bar down its left edge, Georgia headlines, Arial text, one yellow pill button. No dark blocks anywhere.

| File | Use | Merge fields |
| --- | --- | --- |
| `booking-confirmation.html` | Sent after any booking (session, proposal call, info session, course seat) | `first_name` `booking_type` `date` `slot` `location` `booking_id` `amount` `manage_url` `unsubscribe_url` |
| `newsletter.html` | The Journal: one lead story, two short items, one call to action on the yellow band | `issue_title` `issue_number` `issue_date` `preheader` `lead_*` `item1_*` `item2_*` `cta_*` `unsubscribe_url` `preferences_url` |
| `signature.html` / `signature.txt` | Staff signatures, HTML and plain text | `name` `title` `phone` `email` |

Global fields: `{{ASSET_URL}}` (where the PNGs are hosted), `{{SITE_URL}}` and `{{SITE_DISPLAY}}` (the new domain once chosen).

## Rules

- Fluid up to 600px: the container is `width:100%; max-width:600px`, with a fixed 600px ghost table for Outlook on Windows only. Below 480px the padding tightens and the newsletter's columns and closing band stack. Headlines Georgia, text Arial/Helvetica (web fonts do not load in most clients). Every colour is from `tokens.json`.
- Images are hosted PNGs from `logo/png/`: `mark-email-160.png` shown at 24–40px wide, `logo-email-600.png` at 180–300px wide. Never attach them; never use SVG in email.
- Yellow appears as the bar, the button and the ticket tint. It is never text, never a line or underline (links are underlined in ink), and it never sits on a dark block.
- One yellow button per email. The newsletter's closing band is yellow, so its button is white.
- Outlook for Windows draws the pill buttons and card corners square. That is acceptable; do not add VML. Button cells carry `mso-padding-alt` so Outlook keeps the button's padding.
- Both templates declare `color-scheme: light only`. Apple Mail honours it; Outlook and the Gmail apps may still recolour messages in dark mode. Check both in the sending tool's preview; no separate dark-mode version is kept.
- The hidden preheader (with `mso-hide:all` for Outlook) is followed by spacer characters so the inbox preview shows only the preheader, not body text.
- Every email carries the postal address and an unsubscribe link in the footer (CAN-SPAM and most ESPs require it; the newsletter also needs a preferences link).
- Test in your sending tool's preview for Gmail, Outlook desktop and iPhone before the first send.

## Signature setup

Gmail: Settings → See all settings → Signature → Create new, paste the rendered HTML (open `signature.html` in a browser, select all, copy). Outlook: Options → Mail → Signatures, paste the same. The mark must be hosted at a public `{{ASSET_URL}}`; a local file path will show as a broken image for recipients.
