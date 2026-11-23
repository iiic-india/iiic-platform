# NOTES · m6-runner-core (M6 slice A: the job runner and the messaging core)

Working notes for a resumed run. Removed in the last commit.

## Built against (frozen, from m6/foundation)

- `src/lib/messaging/operations.ts`: `Deliver`, `CancelQueued`, `Dispatch`, `ApplyReport`, `Suppress`,
  `SignLink`, `VerifyLink`, `messageKey`, `PlannedMessage`, `ProviderReport`.
- `src/lib/messaging/channels.ts` (`EmailSender`, `WhatsAppSender`, `Channels`), `fakes.ts`,
  `policy.ts` (`decideSend`, `quietHoursEnd`, `plannedSendTime`), `states.ts` (`canMove`,
  `nextAttemptAt`, `SENDING_STALE_AFTER_MS`), `senders.ts` (`senderFor`), `webhooks.ts`
  (`parseResendEvent`, `isStopRequest`, `WhatsAppNotice`), `types.ts`.
- `src/lib/automations/{catalogue,events,emit,listeners,schedules}.ts`; `src/jobs/index.ts` (no autoRun,
  concurrency control on, `ownerWithCode`).
- `src/emails/{registry,types,render,index}.ts`, `components/Frame.tsx`.
- `src/lib/privacy/consents.ts` `consentFor`; `src/access/policy.ts` `ownerWithCode`, `allow`.
- env: `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_DOMAIN`, `EMAIL_FROM_ADDRESS`,
  `MESSAGING_TRANSPORT`, `WHATSAPP_*`, `VERCEL_ENV`.

## My files (docs/19 §12, A)

- `src/lib/automations/runner.ts` (pure: cron auth, rounds within budget) + `src/app/api/cron/jobs/route.ts`
- `src/lib/automations/failures.ts` (`onFail`), `rows.ts` (automation rows and counters)
- `src/lib/messaging/`: `channelsFor.ts`, `resend.ts`, `aisensy.ts`, `recipients.ts`, `suppress.ts`,
  `deliver.ts`, `try.ts`, `dispatch.ts`, `links.ts`, `withdrawals.ts`, `report.ts` (applyReport), `requeue.ts`
- `src/app/api/webhooks/resend/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`
- `src/jobs/messaging.ts` (`messages-dispatch`, `O3-failure-alert`), `src/emails/core/`
- hooks/endpoints in `Messages.ts` (queue again), `Suppressions.ts`, `Automations.ts`
- tests: `tests/unit/messaging*.spec.ts`, `tests/int/messaging*.int.spec.ts`

## Order of work

1. NOTES (this). 2. runner.ts + cron route + unit tests. 3. channelsFor/resend/aisensy + tests.
2. suppress, recipients, rows, deliver, try, dispatch + unit tests with fakes. 5. webhooks (resend, whatsapp)

- tests. 6. links + withdrawals. 7. jobs/messaging.ts + failures + O3 + core template. 8. requeue endpoint,
  hooks. 9. int tests. 10. checks; remove NOTES.

## Progress

- Done (committed): 1-6. runner + cron route; senders; store/outbox/suppress/recipients/rows; try,
  deliver (+cancelQueued), dispatch (sweep: stale email back to queued, stale WhatsApp unknown);
  report.ts (applyReport, planFor), inbound.ts (pure webhook handlers, svix 2 verify returns void),
  conversation.ts (inbound WhatsApp: window, STOP), body.ts, both webhook routes, Suppressions hook
  (afterChange create emits message.suppressed); tests/unit/messagingWebhooks.spec.ts.
- Next: 7 jobs/messaging.ts + failures.ts + O3 + emails/core failure-alert; 8 requeue endpoint;
  9 int tests (tests/int/messaging*.int.spec.ts; clear payload_jobs my tests queue); 10 checks.
- Note: taskSlug is a Postgres enum of registered tasks; O9/N3/V2 tasks are builder C's.
