# 04 · Data model

The entities, their key fields, who may see them, and how long they are kept. Postgres is the system of record. Field names are indicative; Claude Code finalises them in the schema with migrations. Every table has `id` (UUID), `created_at`, `updated_at`; times are stored in UTC.

Sensitivity: **S3** = most sensitive (counselling notes, Map answers), **S2** = personal (contact details, bookings, payments, consents), **S1** = business (leads, organisations), **S0** = public content.

## People and organisations

| Entity | Key fields | Sensitivity · access | Retention |
| --- | --- | --- | --- |
| `staff_recovery_codes` | `staff_id`, code hash (PBKDF2-SHA256 with a salt of its own, of a single-use 16-character code), used_at | S2 · nobody reads them; created and used only through the staff sign-in endpoints | With the staff account; a new set cancels the old |
| `staff` | name, email, role (owner · operator · practitioner · editor · finance), 2FA secret (encrypted at rest), active | S2 · owners manage | While employed, then deactivated (never deleted, for the audit trail) |
| `people` | full name, mobile (E.164, unique when verified), email (unique when verified), preferred channel, language, age band, city, source and UTM, tags, `organisation_id?` | S2 · operator, owner; practitioners see their own clients | Until erasure request, or 3 years after last activity (setting; to confirm with a lawyer) |
| `accounts` (R2) | `person_id`, verified identifiers, last sign-in, trusted devices | S2 · the person; owners | With the person |
| `organisations` | name, website, sector, team-size band, city, GSTIN (for invoices), billing address | S1 · operator, owner, finance | 7 years after last invoice |
| `consents` | `person_id`, purpose (booking communications · marketing email · marketing WhatsApp · Map storage · share Map with counsellor · testimonial publication · suggest related programmes), notice version, language, granted_at, withdrawn_at, channel, evidence (IP, user agent, form), written receipt (email message id, for sensitive data); a withdrawal is an entry of its own that names the consent it ends (`withdraws`) | S2 · append-only; operator reads and records replies, nobody edits or deletes | Kept for the period of processing plus the limitation period (lawyer to confirm) |
| `guardian_verifications` | the guardian `person_id`, the child's `person_id`, method (details held · details provided · DigiLocker token), verified_at, evidence reference | S2 · owners | With the child's records |
| `practitioners` | `staff_id`, public name, photo, credentials (as supplied, verbatim), bio, services offered, calendar connection, active | S0/S2 · public profile; staff | While active |

## Offers and scheduling

| Entity | Key fields | Notes |
| --- | --- | --- |
| `services` | type (`session` · `call` · `info` · `seat`), name, slug, register, options (durations and all-in prices in paise, GST-inclusive flag), SAC code, format (online · office · both), booking rules (notice, horizon, buffer, hold minutes, reschedule window, cancellation and refund rule), active | Prices live here, never in code |
| `price_history` | `service_id`, option, price, valid_from, valid_to | Needed to show the prior (lowest 30-day) price beside any reduced price from 1 January 2027 |
| `availability_rules` | `practitioner_id`, weekday, working hours (start–end, more than one span a day allowed), valid_from, valid_to | No defaults: each counsellor's hours are set in the admin (D-02) |
| `availability_exceptions` | `practitioner_id`, date, closed or custom hours, reason | Holidays, leave |
| `calendar_connections` | `practitioner_id`, provider (`google`), calendar id, sync token, watch channel id and expiry, last synced, status | Busy times are read, never stored beyond the time blocks; event bodies are not copied (D-22) |
| `busy_blocks` | `practitioner_id`, start, end, source (`google`), external id | Refreshed on change notifications and every 15 minutes |
| `events` | type (`info_session` · `cohort_session` · `workshop`), title, start, end, capacity, location or link, `cohort_id?` | Fixed-time items |

## Bookings and money

| Entity | Key fields | Sensitivity · access | Retention |
| --- | --- | --- | --- |
| `bookings` | reference (human-readable, e.g. IIIC-S-24117), `service_id`, option, `practitioner_id`, `person_id`, `event_id?`, start, end, status (`held` · `pending_payment` · `confirmed` · `requested` · `completed` · `no_show` · `cancelled_by_client` · `cancelled_by_iiic` · `rescheduled`), format, location or meeting link, `hold_expires_at`, `rescheduled_from_id`, manage-token hash, source and UTM, who-for (self · family · organisation), age band | S2 · operator, owner, the practitioner; the person (R2) | 7 years where an invoice exists, else 3 years |
| `payments` | `booking_id?` `enrolment_id?` `invoice_id?`, gateway, gateway order and payment ids, amount (paise), currency, status, method, captured_at, webhook event ids (for idempotency) | S2 · operator, owner, finance | 8 years (GST law keeps accounts 72 months from the annual-return due date; 8 years covers it; confirm with the accountant) |
| `refunds` | `payment_id`, amount, reason, requested_by, approved_by, gateway refund id, status | S2 · finance, owner | 8 years (as payments) |
| `invoices` | Mirror of the documents in Zoho Books (D-13): Zoho id, number, type (invoice · receipt · tax invoice · receipt voucher · refund voucher · credit note), buyer snapshot, totals, PDF link, status, related booking or engagement | S2 · finance, owner | 8 years (as payments) |

## The Map (R2)

| Entity | Key fields | Notes |
| --- | --- | --- |
| `map_definitions` | version, status (draft · active · retired), dimensions (key, label, description), questions (id, text, dimension, reverse-scored?), scale labels, scoring, routing rules (by who-for and scores → recommended step and two related) | Founder-authored in the admin; one active version |
| `map_results` | `person_id?`, `definition_version`, who-for, answers, dimension scores, recommended step, related steps, `consent_id`, shared-with-counsellor flag | **S3** · the person; a practitioner only if shared; never in analytics; deletable by the person |
| `team_maps` | `organisation_id`, `lead_id`, invite token, status, min-responses threshold (default 5), aggregate scores | Individual responses are anonymous and never shown to the client |

## B2B

| Entity | Key fields |
| --- | --- |
| `leads` | kind (consultancy · partnership), `organisation_id`, `person_id`, source, stage, owner (staff), next action, due date, value estimate (optional), lost reason, `team_map_id?` |
| `lead_activities` | `lead_id`, type (note · call · email · WhatsApp · stage change · file), body, at, by |
| `proposals` | `lead_id`, version, phases (rows), fees (rows), totals, PDF, sent_at, accepted_at, status |

## Courses (R2)

| Entity | Key fields |
| --- | --- |
| `courses` | title, slug, summary, outcomes, completion rule, certificate template, status |
| `cohorts` | `course_id`, name, start, end, format, capacity, price (paise), status |
| `enrolments` | `cohort_id`, `person_id`, status (pending payment · active · completed · withdrawn), `payment_id` |
| `lessons` | `course_id`, module, order, title, body, video reference, resources |
| `progress` | `enrolment_id`, `lesson_id` or `event_id`, completed_at, attendance |
| `certificates` | `person_id`; the programme (an enrolment from R2, or the programme's name and dates for anything else, D-39); certificate ID (`IIIC-C-<year>-<sequence>` with a check character, unique); verify token (128 random bits, unique, never shown in the admin list); name as printed; completion date; issued_at, issued_by; PDF (private bucket); status (valid · revoked); revoked_at; revoke reason (staff only); replaces (for a reissue) |

## Proof and content

| Entity | Key fields | Notes |
| --- | --- | --- |
| `feedback` | `booking_id` or `enrolment_id`, rating, comment, submitted_at | Private |
| `testimonials` | origin (platform feedback · earlier programme); `feedback_id?` (platform origin: proves a real booking); `person_id?`; display form (full name · first name and surname initial · initials); designation; organisation and a show-organisation flag; place (city; state or country); programme as it was called and `service_id?` (today's equivalent); year (month if known); door tags (consultancy · education · counselling · framework); theme tags (internal, from the outcomes map); text verbatim in its original language; translation, translator and the person's approval of it; excerpt (the published part, approved by the person); video or audio with captions and transcript; photo and profile link (each only with its own consent); source (letter · email · WhatsApp · feedback form · brochure · Google review · LinkedIn · video · in person), the date received and the original file (private bucket); connection to Gaurang Mistry or IIIC (none · friend · relative · works with IIIC · worked with IIIC), shown on the card when there is one (`08` §6); screening result (passes · needs information · not publishable) with the checklist and the reason (`content/copy-architecture.md` §6); consent id; status (received · screened · consent requested · approved · published · declined · withdrawn); placements (page slots); approved_by; published_at | S2 until published, then only the published fields are public; the original file and any contact detail stay S2; counselling reviews show initials and place by default. Withdrawal unpublishes at once (V2) and deletes the text, media and original file; the consent record stays (append-only; evidence period for the lawyer to confirm) |
| `case_studies` | `organisation_id`, title, problem, approach, outcomes (each with evidence), client approval (file, date, approver name), status | Public only when approved |
| `counters` | key, label, definition text, query key, since date, value cache, visible | "Numbers that show their working" |
| `pages` · `posts` · `faqs` · `media` | structured blocks: a page's sections (`layout`) are hero, doors, statement, steps, comparison, points, cards, factList, founderNote and band, each with `copyStatus` (approved · candidate; a candidate shows a marker until IIIC approves it, I-41, D-51), and the fixed scope, certificate, contact and legal information blocks, which have no fields and carry the ids `scope`, `certificate`, `contact` and `legal` (the legal information block draws the legal details from `settings`, each a placeholder while it is empty); doors, statement, steps, comparison, points, cards, factList and founderNote may carry an `anchor`, a link name of small letters, digits and hyphens (D-55); on a page, `legalReview` (draft · approved) for the legal pages (D-52), and `firstPublishedAt`, set when the page is first published and never changed (D-57); post body, topic, author, status, publish date; question/answer/page; files with alt text and consent flag for identifiable people | S0 |
| `subscribers` | email, status (pending · confirmed · unsubscribed), `consent_id`, source, provider contact id | Mirror of the newsletter list |

## Messaging, automation and operations

| Entity | Key fields | Notes |
| --- | --- | --- |
| `message_templates` | key, channel (email · WhatsApp · SMS), language, subject, body with variables, provider template name and category (for WhatsApp), status | WhatsApp templates must match the approved text |
| `message_log` | `person_id`, channel, template key, related entity, provider message id, status (queued · sent · delivered · read · failed), error, sent_at | S2; 1 year |
| `automations` | key, enabled, timing, conditions, last run, failure count | Configured, not coded, where possible |
| `jobs` | queue entries with run_at, attempts, idempotency key, payload, status | Framework-managed |
| `session_notes` | `booking_id`, author (practitioner), body (encrypted at rest with a per-environment key), created_at | **S3** · readable by the author only; owners see that a note exists, not its content; never exported except to the person on a verified access request (lawyer to confirm) |
| `bridges` · `bridge_events` | definition (from, trigger, offer, touchpoint); shown · dismissed · accepted, `person_id`, at | Enforces the "No, thanks" memory (D-18) |
| `data_requests` | `person_id`, type (access · correction · erasure · withdrawal · nomination · consumer complaint · privacy grievance), received_at, acknowledged_at, verified_at, due_at (48-hour acknowledgement; one month for complaints; 30 days published for data requests), status, assignee, resolution, complaint copy sent | Deadlines from `08-security-privacy-compliance.md` |
| `incidents` | detected_at, description, systems, personal data affected, CERT-In report (due 6 h), people notified (when, how), Board notified and detailed report (due 72 h), remediation | The breach register |
| `audit_log` | actor (id and email copied in, not linked, so an entry never has to change), action (create, update, delete or a named action such as `reset-two-factor`), entity, entity id, at, IP, the names of the fields that changed (never their values); reads of S3 records are logged too | Append-only, in Payload and in the database (a trigger; the app's own role, D-43); 3 years, after which an entry leaves only through the nightly purge's database function (O5, D-43) |
| `settings` | legal information (proprietor's legal name, trade name, address, GSTIN or registration status, Udyam, customer care, grievance officer name, designation and contact, CERT-In point of contact), bank details, booking policy defaults, quiet hours (default 21:00–08:00), feature flags (`prices_public` off until IIIC publishes prices (D-21), `pay_at_booking` (D-24), `map_enabled`, `accounts_enabled`, `bridges_enabled`), processor register, the yearly dark-pattern audit record | Owner only |
| `redirects` | Payload's redirects plugin (`@payloadcms/plugin-redirects`, pinned with Payload): from (a path on this site, unique, as the 404 log keeps it), to (a page, by reference, which the redirect follows wherever the page moves; or an address on this site with an optional section, never another site), type (308 permanent, the default, or 307 temporary: what a page can send) | S0 · owners, operators and editors; owners and editors delete; visitors never read them through the API. Slug changes create one automatically (to the page, by reference); the 404 log's "Create redirect" writes here; none may chain or loop, start where a page is published or where the site answers itself; at most 2,000 |
| `missing_pages` | path (no query string), referrer host (the host only), first seen, last seen, hits, resolved (redirect id) | The 404 log (`11` §5.1); S0 · read by owners, operators and editors, written only by the routes answering with the 404, staff set `resolved`; at most 2,000 addresses; an entry not asked for in 180 days is purged (O5) |
| `analytics_events` | name (door · step0 · booking_started · time_chosen · booking_confirmed · request_submitted · map_completed (R2) · newsletter_confirmed · search_no_results), route, register, who-for where relevant, daily-rotated session hash, at | Server-written; no foreign key to `people` by design; S0; aggregated into Reports and the weekly report (`12` §7) |
| `search_index` | Payload's search plugin collection (title, excerpt, doc reference, priority) | Rebuilt by the plugin on publish; powers `/search` and the 404 page |
| `consent_versions` | purpose, version, language, text, effective_from | The text a person consented to is never lost when the notice changes (`12` §11) |
| `page_facts` (on `pages`, `posts`, `services`) | a `facts` array: statement, source (brochure · site · form · founder · description · page copy IIIC supplied · counted), checked_at | Makes every public claim traceable (`content/README.md`) |

## The trust layer as built (M2)

- **`people`** (`src/collections/People.ts`): `fullName`; `mobile`, typed in any form and stored in E.164 by libphonenumber-js (a number without a country code is read as Indian); `email`, stored in small letters; `mobileVerifiedAt` and `emailVerifiedAt`, set only by the server once the person proves the detail with a one-time code (R2), and no two records hold the same detail verified (a hook now; a partial unique index can join it in the migration); `preferredChannel` (email · WhatsApp; SMS waits on D-08); `language` (English · Gujarati · Hindi, English by default; which ones IIIC offers is I-44); `ageBand` (under 18 · 18 or over: the one line the law draws, `08` §3); `city`; `source`; `utm` (source, medium, campaign, term, content); `tags`; and the person's consents, read-only, newest first. `organisation_id` comes with `organisations` (M4), and practitioners' access to their own clients with bookings (M3): until then practitioners see no one.
- **`consents`** (`src/collections/Consents.ts`, `src/lib/privacy/`): a ledger. An entry is created and never changed or deleted, by anyone, access overridden or not. A consent names the person and the notice version they saw; it takes its purpose and language from that notice, which must have been in force at `grantedAt` (now, or the time a reply arrived, never in the future); its channel is a form on this site (recorded only by the server; staff choose one of the others), email, WhatsApp, a phone call or paper in person; its evidence is the form or message, the IP address and browser the server recorded for a form, and, for anything staff record, where the saved reply is kept (required). A withdrawal copies the person, purpose, notice, language and `grantedAt` of the consent it names and adds `withdrawnAt`; `withdraws` is unique in the database, so a consent is ended once. Where a person stands on a purpose is read from the ledger: the consent they gave last counts while no withdrawal for the purpose came at or after it, whichever consent that withdrawal named (`consentFor`). Each entry is named by its purpose and the time it was given or withdrawn, in IST, with no person's name. The written receipt of a sensitive-data consent (B3a) is sent after the consent is recorded, so M3 and M6 record it without changing the entry.
- **`consent_versions`** (`src/collections/ConsentVersions.ts`): purpose (the consents' seven), language, `version` (numbered by the platform: 1, then 2, per purpose and language; unique together), `text`, `effectiveFrom`, and a name built from them. Purpose and language are set when a version is written. Until its time comes a version can be changed or deleted; from then on it never changes and is kept, whoever asks. Forms show the version in force that took effect last (`currentNotice`).
- **`settings`** (`src/globals/Settings.ts`): the legal information (legal name, trade name, address, GSTIN or registration status, Udyam, customer care, grievance officer, CERT-In point of contact), each typed as it should print and never as a placeholder, with registration numbers in capitals and phones in E.164; bank details; booking defaults (12 hours' notice, 14 days ahead, a 10-minute hold, the buffer, the reschedule window, D-16); quiet hours (21:00 to 08:00, India time); the flags, every one off by default, with payment at booking refused while prices are hidden (D-21, D-24); the processor register (`08` §8); the dark-pattern audits, the latest of which `/legal` prints. Pages read the legal information and the flags on the server, those fields only, cached by the settings' tag (`src/lib/settings/`); `pricesArePublic()` answers M3.
- **`analytics_events`** (`src/collections/AnalyticsEvents.ts`, `src/lib/analytics/`): name, route, register, who-for, `sessionHash`, `at`. The session hash is an HMAC of the visitor's IP address and browser under a key of the day, derived by HKDF from the server's secret and the date in India: the same through one day, different the next, never stored in the browser, and the address and browser themselves are never kept (`12` §7). Written by the server only; owners read the raw events; not in the audit log (S0).

## Rules the schema enforces

- Money in integer paise; tax computed server-side; invoice numbers allocated in a transaction.
- A slot cannot hold two active bookings for one practitioner (exclusion constraint on practitioner and time range for statuses held, pending payment, confirmed, requested).
- Webhook events are stored by provider event id and processed once.
- Deleting a person cascades to Map results, notes, consents (marked withdrawn: in the same transaction, a withdrawal entry is added for each consent still in force, and the entries stay without a person), feedback and testimonials; invoices and payments are anonymised instead.
- Every write to S2 and S3 tables records an audit entry; every read of S3 records one too.
- A page has at most one yellow band, and it closes the page; a section's link name (`anchor`) is unique on its page and is never `scope`, `certificate`, `contact` or `legal` (D-55), nor the page shell's own `main` or `site-nav`, and each of those four fixed blocks appears once at most. A page opens with its one hero. A counselling page carries the scope statement and the crisis numbers, and the course page the certificate statement (`08` §7). A heading is never blank, and a placeholder is written `[[TODO: what is missing, I-xx]]`; a page's title and description hold none. These rules run when a page is published, not when a draft is saved (`05` Content).
