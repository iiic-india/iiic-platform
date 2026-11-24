# Review fixes on the joined M6 + M7 branch (PR #38)

Working notes; deleted in the last commit of this batch. One commit per finding.

## Blockers

- [x] A1 · confirmed erasure leaves M4 and M6 data (enquiries, links, organisation, job title, WhatsApp time, subscriber, export files); keep the suppressed address (decision row)
- [x] A2 · analytics beacon loads on `/w/`, `/newsletter/confirm/`, `/newsletter/unsubscribe/` token pages
- [x] B1 · booking emails to counselling clients carry no scope statement or crisis numbers; WhatsApp time-request text has no closing

## Fix, first group

- [x] A4 · a privacy request's person can be changed after the identity check
- [x] A5 · four token routes act on preview hosts (extend D-102)
- [x] B2 · a killed job stays `processing` for good; runs are not bounded by time; N4 sends inline
- [x] B4 · `not-found` load errors become a silent `stale` skip; consent receipt with no consents
- [x] B6 · B13 payment-link reminder ignores `booking.rescheduled`

## Fix, second group

- [x] A3 · access export omits enquiries, subscriber, suppressions, messages
- [ ] A6 · newsletter signup has no Turnstile and only an in-memory limit
- [ ] B3 · price guard scope; a hit fails instead of skipping silently (decision row)
- [ ] B5 · Today and Reports still say messaging waits on M6
- [ ] B7 · one-click unsubscribe as multipart/form-data
- [ ] B8 · welcome email promises more than an issue holds

## CI

- [x] First joined run (45390762347): bookingConcurrency timed out at 5 s. Cause: two transactions plus the adapter's permanently held client filled the pool of 3, and bookSlot read the flags on a second connection. Fixed: flags read on the transaction, pool 4 (docs/12).
- [ ] Final run green
