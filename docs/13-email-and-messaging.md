# 13 · Email and messaging: the system and how it is run

Every message IIIC sends or receives, which system carries it, what is automated, who answers what, and how deliverability is kept. The automations themselves are in `06`; the vendors in `07`; the consent rules in `08`. This document is the operating manual.

## 1. The shape of it

| Kind | Carried by | From | Replies go to | Who reads |
| --- | --- | --- | --- | --- |
| Transactional email (confirmations, reminders, receipts, consent receipts, codes, acknowledgements) | Resend, from the app (`06` B-, P-, N-, O-series) | `IIIC Bookings <bookings@notify.<domain>>` or `IIIC <hello@notify.<domain>>` per message type | `bookings@<domain>` or `hello@<domain>` (Google Groups) | The operator |
| Newsletter (the monthly Journal issue) | Resend Broadcasts (D-10), from the app's subscriber list | `IIIC Journal <journal@news.<domain>>` | `hello@<domain>` | The operator; the editor |
| People's own mail (clients, partners, vendors, the lawyer) | Google Workspace mailboxes (D-23) | `name@<domain>` | the same | Each person |
| Role addresses | Google Groups set up as collaborative inboxes (free, no extra licence) | `hello@`, `bookings@`, `privacy@`, `security@`, `partnerships@`, `accounts@` | — | Owners by role (§3) |
| WhatsApp | AiSensy (the provider's inbox and API), one business number (I-03) | The IIIC display name | The same number, in the provider's inbox | The operator |
| Internal alerts (failures, digests, reports, incidents) | Resend to the owners' mailboxes; optionally a Google Chat space with an incoming webhook (included in Workspace) | `IIIC Platform <platform@notify.<domain>>` | — | Owners |
| Calendar | Google Calendar per practitioner, written by the app (D-22); clients get `.ics` attachments in email | — | — | Practitioners |

Transactional mail never goes through a mailbox and mailboxes never send automated mail: two separate reputations, two separate sets of DNS records, and no one's inbox is ever a system of record.

## 2. Domains and DNS (set up in M0)

| Record | On | Purpose |
| --- | --- | --- |
| MX → Google | `<domain>` | Mailboxes and groups |
| `v=spf1 include:_spf.google.com -all` | `<domain>` | Only Google sends as the root domain |
| Google DKIM (2048-bit), selector `google` | `<domain>` | Signs mailbox mail |
| `_dmarc.<domain>`: `v=DMARC1; p=none; rua=mailto:<dmarc reports address>; adkim=s; aspf=r` (SPF alignment relaxed because Resend's bounce address lives on a subdomain of the sending subdomain; DKIM alignment strict) at setup → `p=quarantine` after two clean weeks → `p=reject` after a month | `<domain>` | Policy for the whole domain and its subdomains |
| Resend's records for `notify.<domain>` (the DKIM TXT and the return-path records on its subdomains, as Resend lists them) | `notify.<domain>` | Transactional sending |
| Resend's records for `news.<domain>` | `news.<domain>` | Newsletter sending, separate reputation |
| Google site verification TXT; Search Console | `<domain>` | Postmaster Tools and Search Console |
| MTA-STS and TLS-RPT (optional, Google supports both) | `mta-sts.<domain>`, `_smtp._tls` | Enforce TLS for inbound mail |
| Cloudflare DMARC Management (free in the zone's Email settings) or Postmark's free DMARC digests | — | Reads the aggregate reports so nobody has to parse XML |

BIMI is skipped (it needs a Verified Mark Certificate, which costs more than it returns at this size). The mail records are the same whatever domain D-05 settles on; `iiicedu.com` keeps its MX for as long as `info@iiicedu.com` must still receive mail, with a forward to `hello@<domain>` and an auto-reply naming the new address for six months.

## 3. Addresses and who owns them

| Address | Type | Owner | Answered within | Notes |
| --- | --- | --- | --- | --- |
| `hello@` | Collaborative inbox | Operator (owners see it) | One working day | The contact form's destination; the reply-to of general mail; the public address on the site |
| `bookings@` | Collaborative inbox | Operator | Same working day | Reply-to for every booking message; time requests, reschedules, questions |
| `privacy@` | Collaborative inbox | Team, until the grievance officer is named (I-21) | 48 hours (the law's acknowledgement window) | Data requests, grievances; every message creates a request in Admin → Privacy with its timers (O4, O7) |
| `security@` | Collaborative inbox | Yash | Two working days | `security.txt`; vendor security notices; CERT-In correspondence |
| `partnerships@` | Collaborative inbox | Team | Two working days | Institute and university enquiries (P7) |
| `accounts@` | Collaborative inbox | Team (finance role); the CA on request | Two working days | Invoices, Zoho Books, Razorpay, GST |
| `journal@news.` | Sending only | — | — | Replies land in `hello@` |
| `platform@notify.` | Sending only | — | — | Internal alerts; replies discarded |
| `name@` | Mailbox | Each person | — | Gaurang, the practitioners (needed for calendar sync and Meet), Aum, Yash, Falak as licences allow (three users budgeted at launch in `07`'s cost table; D-23) |

Rules for the inboxes: assign every conversation to one person (Google Groups' collaborative features: assign, mark resolved); use the kit's signature (`src/brand/templates/email/signature.html`); canned responses for the ten commonest replies, written to VOICE.md and kept in a shared document; nothing said in a counselling session is ever written in an email; a request to delete data is forwarded to `privacy@` the same day, never answered from another inbox.

## 4. What is automated and what is human

| Moment | Automated | Human |
| --- | --- | --- |
| Someone books a session, call or info session | Confirmation with the `.ics`, the manage link, the scope statement and crisis numbers for counselling (B2); the consent receipt (B3a); reminders (B5, B6); the feedback request (B8); calendar entry and Meet link (D-22) | Nothing, unless the person replies |
| Someone requests another time | Acknowledgement at once (B12) and a task on Today | The operator offers or accepts a time from Today; the app sends the confirmation |
| A payment link is needed | The link message and one reminder (B13) | The operator decides to send it |
| A reschedule or cancellation | The updated `.ics`, both notifications, re-planned reminders (B7) | Refund approval above the threshold |
| A Team Map request or partnership enquiry | Acknowledgement and a lead with a task (P1, P7) | The operator calls or writes within two working days |
| A proposal | Sent with a tracked link; a follow-up task; a drafted follow-up when unopened (P5, P6) | The operator reviews and sends the follow-up |
| A newsletter signup | Double opt-in and welcome (N1, N2) | The editor writes the issue |
| A data request or complaint | Acknowledgement with a copy of the complaint; deadline reminders (O4, O7) | The grievance officer resolves it |
| Failures, digests, reports, incidents | O1, O2, O3, O8 | Owners act |
| Someone's earlier review is to be published | The consent request with the exact text and how it will appear, and one reminder (V1); unpublishing at once on withdrawal (V2) | The operator imports and screens it; an owner approves publication; before launch, the first batch is sent by hand from IIIC's WhatsApp |
| A general question to `hello@` | Nothing | The operator, within one working day, from the inbox |
| A reply to a WhatsApp message | Nothing (the 24-hour window opens) | The operator, from the provider's inbox, within the window and the quiet hours |

Everything automated can be paused from Admin → Messages → Automations; every automated message has a template in the CMS with a version, an owner and a last-reviewed date.

## 5. Templates and content

- Email templates are React Email ports of `src/brand/templates/email/` (fluid, with the Outlook ghost table), rendered with a plain-text part always, one purpose and one action each, the kit's footer with the address, the phone and the legal row, and a withdraw or unsubscribe link in every message that needs one (VOICE.md § Email and WhatsApp).
- Subject lines state the fact: "Your session on Friday, 6 November at 3 PM" · "Your Team Map request" · "Receipt for your booking IIIC-S-24117". A preheader repeats the next step. No emoji, no urgency words.
- Counselling messages never carry an offer, a bridge or a story (`06`); they carry the scope statement and the crisis numbers.
- Every template is tested on the matrix before release: Gmail (web and Android app), iPhone Mail, Outlook for Windows, Outlook on the web, Yahoo; at 320 px and 700 px; with images off; in a screen reader (`lang`, alt text, headings).
- The newsletter is written by a person, edited by a person, and sent to confirmed subscribers only, with one-click unsubscribe headers (RFC 8058) and a visible unsubscribe link; click tracking on broadcasts only; open tracking off everywhere (it is unreliable and it is tracking).

## 6. Deliverability, kept

- **Authentication**: SPF and DKIM pass for both sending subdomains and the mailboxes, DKIM aligned strictly with the From domain, so every message passes DMARC on DKIM even where SPF aligns only in relaxed mode (the Google bulk-sender requirements: authentication, one-click unsubscribe for marketing mail, and a spam rate kept well under 0.3%, with 0.1% as the working ceiling).
- **Warm-up**: unnecessary at launch volumes (a few hundred messages a month); if a campaign ever needs thousands in a day, send it over several days.
- **Suppression**: hard bounces and complaints mark the address invalid in `people` the same day (Resend's webhook, `/api/webhooks/resend`), show on Today, and stop every send to it; the person is asked for a new address through another channel.
- **Hygiene**: subscribers who have not clicked or replied in twelve months receive one "still want this?" message, then are removed; lists are never bought or imported from elsewhere without recorded consent.
- **Monitoring**: Google Postmaster Tools (domain and IP reputation, spam rate, authentication) checked weekly; DMARC aggregate reports read through the Cloudflare or Postmark dashboard; Resend's delivery rates per subdomain in the weekly report (O2); a test seed (Gmail, Outlook, Yahoo, iCloud) every month and after every template change; mail-tester.com score of 9 or more before launch.
- **Reputation hygiene**: no link shorteners, no tracking domains other than the sending subdomain, no image-only emails, the plain-text part always present, the `List-Unsubscribe` headers on everything promotional, and the `From` names never change without a reason.

## 7. WhatsApp

- One business number (I-03) on the WhatsApp Business Platform through AiSensy; if the same number is in the WhatsApp Business app today, the provider's coexistence path keeps the app usable while the API runs (confirm at setup; a number cannot simply be used in both without it).
- The display name, the business profile (address, hours, the website) and the templates in `06` § Message templates are submitted for approval in M6; utility templates name the person's own booking; marketing templates exist only for people with the matching consent and are sent only in the window the law and the quiet hours allow.
- The operator answers from the provider's inbox during office hours; a reply arriving outside hours gets an automatic "we reply from 10 AM" message once, not repeatedly.
- "STOP", "Unsubscribe" or any plain request to stop is honoured the same day and recorded as a consent withdrawal.
- The provider's quality rating and template statuses are checked weekly; a drop to "medium" pauses marketing templates until it recovers.
- Nothing said in a counselling session is ever sent on WhatsApp; reminders carry the time, the place or link, and how to reschedule, nothing else.

## 8. Internal communication

- The daily digest (O1) at 08:30 IST and the weekly report (O2) on Monday at 09:00 IST go to the operator and owners by email; they are the morning read.
- Failure alerts (O3), incident timers (O8), Sentry and UptimeRobot alerts go to the owners' mailboxes and, optionally, to an "ops-alerts" Google Chat space through an incoming webhook, so they reach phones.
- No Slack, no extra chat tool; Workspace already includes Chat, Meet and Calendar.

## 9. Offboarding and continuity

When someone leaves: suspend the account in Workspace, transfer ownership of their files and calendars, forward their mailbox to the role inbox for three months, rotate any shared secret they knew (`runbook.md`), remove them from every group, from Payload, from the provider dashboards and from the password manager, and record it in the audit log. Every role inbox has two owners at all times.

## 10. Launch checks (mail and messaging)

SPF, DKIM and DMARC pass for a message from each sending subdomain and from a mailbox · DMARC reports arriving · Postmaster Tools verified · a seed test on the matrix in §5 · unsubscribe and withdraw links work and are recorded · reply-to addresses land in the right inbox · bounce and complaint webhooks mark the test address · the WhatsApp templates approved and a test message delivered · quiet hours proven with a reminder scheduled at 22:00 IST · the counselling confirmation carries the scope statement and the crisis numbers · `info@iiicedu.com` forwards to `hello@`.
