# NOTES: m5-notes-privacy (slice A, docs/18 §3, §5, §10)

Working notes for a run that may be cut off. Removed in the last commit.

## Interfaces built against (frozen foundation)

- `src/lib/notes/contract.ts`: LoadKeyring, SealNote, OpenNote, WriteNote, UpdateNote, ReadNote,
  ListOwnNotes, CountNotesForOwner, RekeyNotes, NoteError, SealedNote, NotesKeyring.
- `src/lib/privacy/requests.ts`: REQUEST_TYPES, statuses, RESOLVE_WITHIN, DeadlinesFor,
  recordRequestInput, RequestError, ErasurePlan, PlanErasure, ConfirmErasure, ExportPersonData.
- `src/lib/privacy/breaches.ts`: CERT_IN_WITHIN_HOURS (6), BOARD_REPORT_WITHIN_HOURS (72),
  IncidentClocks, ClockState.
- `src/access/views.ts`: viewRefusal(user, 'notes' | 'privacy' | 'privacyDecision').
- `src/access/policy.ts`: POLICY.sessionNotes.read = { author: true } (no create/update via API).
- `src/lib/audit/record.ts`: recordAudit(req, { action, entity, entityId }).
- `src/lib/result.ts`: ok / err.
- env: NOTES_ENCRYPTION_KEY, NOTES_ENCRYPTION_KEY_PREVIOUS, R2_BUCKET_PRIVATE (all optional).

## Files (slice A only)

- src/lib/notes/keys.ts, seal.ts, notes.ts, rekey.ts; src/scripts/rekey-notes.ts; package.json
  script `notes:rekey` (and in vercel-build after totp:rekey)
- src/lib/privacy/deadlines.ts, breachClocks.ts, requestMoves.ts, erasure.ts, export.ts,
  hooks.ts (clocks on create, attached in one line each to DataRequests and Incidents)
- src/components/admin/notes/*, src/components/admin/privacy/*; payload.config.ts `// M5 A` block
- docs/runbook.md rotation and breach steps
- tests/unit/notesSeal.spec.ts, privacyRequests.spec.ts, breachClocks.spec.ts;
  tests/int/notes.int.spec.ts, privacy.int.spec.ts

## Order of work

1. deadlines + breach clocks (tests first) 2. keys + seal (tests first) 3. notes.ts (int tests
first) 4. rekey + script 5. requestMoves, erasure, export (+ int tests) 6. hooks 7. admin parts
8. runbook 9. checks

## Progress

- (update as each group is committed)
