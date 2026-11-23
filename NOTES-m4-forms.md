# NOTES m4-forms (slice B: public forms) — removed in the last commit

Branch m4/forms from m4/foundation. Design: docs/17 §6, §12 B.

## Interfaces built against
- `src/lib/pipeline/forms.ts`: TeamMapRequestInput, PartnershipEnquiryInput, FORM_MESSAGES, UtmInput (server only).
- `src/lib/pipeline/leads.ts`: ReceiveEnquiry(req, {kind, fields, context}) -> Result<{enquiryId, leadId, outcome}, PipelineError> (codes no-notice, notice-changed).
- `src/lib/privacy/consents.ts` currentNotice(payload, 'enquiryReplies', language).
- `src/lib/analytics/record.ts` recordEventQuietly({name:'request_submitted', route, register}, headers) via next/server after().
- `src/lib/analytics/session.ts` clientAddress(headers); submitter hash = own HKDF info label, day key in IST.
- env(): TURNSTILE_SITE_KEY/SECRET_KEY together or neither; PAYLOAD_SECRET (+ _PREVIOUS).
- Kit markup: iiic-error-summary (role=alert, tabindex -1), iiic-form-grid, iiic-field-wrap, iiic-label, iiic-field, iiic-error, iiic-check.

## Files (mine)
- src/blocks/pageBlocks.ts: blocks teamMapRequest (id team-map-request), partnershipEnquiry (id partnership-enquiry); fixed anchors; once a page.
- src/components/blocks/PageBlocks.tsx: render cases; RenderBlocks takes `forms` (preloaded like `legal`).
- src/components/blocks/PageAt.tsx: loads form setups (notice, drawn token, turnstile key).
- src/components/forms/: EnquiryForm (client, useActionState, permalink #anchor for no-JS), ErrorSummary, Acknowledgement, TurnstileWidget.
- src/lib/enquiryForms/: strings.ts, drawn.ts (HMAC time), submitter.ts (hash), turnstile.ts (siteverify + fake), limits.ts, submit.ts (pure core with deps), actions.ts ('use server'), setup.ts (server: notice + token), wiring.ts (ReceiveEnquiry stub until merge).
- src/lib/security/csp.ts + src/proxy.ts: Turnstile origins only with keys.
- starter: consultancyOffers.ts (form replaces placeholder), institute.ts (Partnerships), about.ts, learn.ts (links to /institute#partnership-enquiry).
- tests/unit/enquiryForms*.spec.ts(x), tests/e2e/enquiryForms.e2e.spec.ts.
- payload-types regenerated (schemaChanges: the two blocks).

## Order
1 notes  2 blocks+types  3 lib/enquiryForms core + tests  4 components  5 render + PageAt  6 CSP/proxy  7 starter pages + tests  8 e2e  9 checks

## Progress
- [x] 1
