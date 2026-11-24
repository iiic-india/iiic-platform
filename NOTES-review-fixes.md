# Review fixes on the joined M6 + M7 branch (PR #38)

Working notes; deleted in the last commit of this batch. One commit per finding.

## Blockers
- [ ] A1 · confirmed erasure leaves M4 and M6 data (enquiries, links, organisation, job title, WhatsApp time, subscriber, export files); keep the suppressed address (decision row)
- [ ] A2 · analytics beacon loads on `/w/`, `/newsletter/confirm/`, `/newsletter/unsubscribe/` token pages
- [ ] B1 · booking emails to counselling clients carry no scope statement or crisis numbers; WhatsApp time-request text has no closing

## Fix, first group
- [ ] A4 · a privacy request's person can be changed after the identity check
- [ ] A5 · four token routes act on preview hosts (extend D-102)
- [ ] B2 · a killed job stays `processing` for good; runs are not bounded by time; N4 sends inline
- [ ] B4 · `not-found` load errors become a silent `stale` skip; consent receipt with no consents
- [ ] B6 · B13 payment-link reminder ignores `booking.rescheduled`

## Fix, second group
- [ ] A3 · access export omits enquiries, subscriber, suppressions, messages
- [ ] A6 · newsletter signup has no Turnstile and only an in-memory limit
- [ ] B3 · price guard scope; a hit fails instead of skipping silently (decision row)
- [ ] B5 · Today and Reports still say messaging waits on M6
- [ ] B7 · one-click unsubscribe as multipart/form-data
- [ ] B8 · welcome email promises more than an issue holds

## CI
- [ ] First joined run (45390762347) checked and anything it found fixed
- [ ] Final run green
