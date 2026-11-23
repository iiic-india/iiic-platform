# NOTES · m4-board (slice C: Pipeline board and proposals)

Branch `m4/board-proposals`, from `m4/foundation` (85918d5). Design: `docs/17-pipeline-design.md` §5, §7, §12 (C).

## Interfaces built against

- Contracts (frozen): `src/lib/pipeline/proposals.ts` (ProposalSnapshot, ProposalError, MayPrintFees, CreateVersion, PreviewProposal, PrintVersion, SendVersion, OpenTrackedLink, RecordAnswer, ExpireProposals, ProposalMailer), `values.ts` (PROPOSAL_STATUSES, PROPOSAL_MOVES), `stages.ts` (STAGES_BY_KIND, STAGE_MOVES, PROPOSAL_SENT_STAGE), `events.ts` (PipelineEvent, EmitPipelineEvent), `leads.ts` (MoveLead, LogActivity), `tasks.ts` (CreateTask, AddWorkingDays, PROPOSAL_FOLLOW_UP_WORKING_DAYS), `staleness.ts` (HeatOf).
- Builder A's operations are injected (`ProposalDeps` in `src/lib/pipeline/proposal/deps.ts`); `wiring.ts` holds interim stand-ins until the merge swaps in A's `core/`.
- M3 documents (`m3/join`: `src/lib/pdf/documents.ts` `proposalPage`, `renderProposalPdf`): coded against through `ProposalPrinter` (print.ts) with a fake; the fake prints only where VERCEL_ENV is unset (local, CI).
- Access: POLICY.proposals / proposalVersions / leads; 2FA = `_strategy === 'totp'`; office = owner|operator active users.

## Files (C's alone)

- `src/lib/pipeline/proposal/`: fees, reference, snapshot, tokens, print, mailer, deps, wiring, versions, preview, send, track, answer, expire, hooks, endpoints, copy
- `src/collections/Proposals.ts`, `ProposalVersions.ts`: hooks, endpoints, admin components
- `src/components/admin/pipeline/`: PipelineView, PipelineNavLink, board pieces, proposal and version panels, copy
- `src/payload.config.ts`: view `/admin/pipeline`, nav link
- `src/app/(platform)/(default)/p/[token]/page.tsx`, `pdf/route.ts`
- `src/jobs/proposals.ts`: `P8-expire-proposals`
- tests: `tests/unit/pipelineProposal*.spec.ts`, `tests/int/pipelineProposals.int.spec.ts`

## Order of work

1. pure: fees, reference, tokens, snapshot (+ unit tests)
2. print port + fake, mailer + fake
3. deps + wiring
4. versions, preview, send, track, answer, expire
5. hooks + endpoints + collections
6. /p/[token] page and pdf route
7. P8 job
8. admin panels for proposals and versions
9. board view + nav link + move form, config registration, importmap
10. int tests; checks; docs/17 kept true; remove this file

## Progress

- [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7 · [ ] 8 · [ ] 9 · [ ] 10
