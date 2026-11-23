# NOTES · m4-crm (slice A, the CRM core) — working notes, removed in the last commit

Branch `m4/crm-core` from `m4/foundation` (85918d5). Design: `docs/17-pipeline-design.md` §3, §4, §7, §8, §9, §12 (A).

## Interfaces built against (frozen contracts)

- `src/lib/pipeline/leads.ts`: `ReceiveEnquiry`, `MoveLead`, `LogActivity`, `AttachCall`, `PipelineError`, `EnquiryContext`.
- `src/lib/pipeline/tasks.ts`: `AddWorkingDays`, `CreateTask`, `CloseTask`, `FIRST_REPLY_WORKING_DAYS` (2), `PROPOSAL_FOLLOW_UP_WORKING_DAYS` (3).
- `src/lib/pipeline/matching.ts`: `KeysFor`, `FindMatches`, `Matches`, `FREE_MAIL_DOMAINS`.
- `src/lib/pipeline/staleness.ts`: `HeatOf`, `StaleWhere`, `RaiseLeadAlerts`, `UNTOUCHED_HOURS`, `STALE_AFTER_DAYS`.
- `src/lib/pipeline/events.ts`: `PipelineEvent`, `PipelineEventKey`, `EmitPipelineEvent`.
- `src/lib/pipeline/stages.ts`, `values.ts`, `fields.ts` (`domainOf`, `toWebsite`, `isFinalStage`).
- M3 patterns: `src/lib/booking/emit.ts` (jobs queued in the transaction, key in `input.key`), `src/lib/booking/guard.ts` (`inTransaction`), `src/lib/privacy/consents.ts` (`currentNotice`), `src/collections/Consents.ts` (ledger checks the notice in force).

## Files (slice A only)

- `src/lib/pipeline/core/`: `emit.ts`, `receive.ts`, `match.ts`, `moves.ts`, `activities.ts`, `tasks.ts`, `workingDays.ts`, `heat.ts`, `alerts.ts`, `calls.ts`, `hooks.ts`, `strings.ts`
- hooks wired in `src/collections/{Organisations,Leads,LeadActivities,Tasks,Enquiries,People}.ts`
- `src/jobs/pipeline.ts`: `P2-lead-from-call`, `P3-P4-lead-alerts`
- tests: `tests/unit/pipelineCore*.spec.ts`, `tests/int/pipelineCore*.int.spec.ts`

## Order of work

1. pure: workingDays, keys (match), heat, strings — with unit tests
2. emit, tasks, activities, moves
3. match (FindMatches), receive (ReceiveEnquiry)
4. hooks + wiring in collections; People erasure hook
5. alerts, calls; jobs
6. int tests; checks

## Progress

- Steps 1 to 5 committed (pure parts and unit tests; emit, tasks, activities, moves; match,
  receive; hooks and the People erasure hook; alerts, calls, the two jobs).
- Schema: `enquiries.conflict` (select `emailAndMobileDiffer`); the job slugs P2 and P3-P4 in the
  types. No migration (the lead's).
- Next: int tests `tests/int/pipelineCore.int.spec.ts` (receive, repeat, stale notice, failure
  part-way, alerts once each), then the checks, then remove this file.
