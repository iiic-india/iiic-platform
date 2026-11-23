import type { PayloadRequest } from 'payload'

import { messageKey, type PlannedMessage } from '@/lib/messaging/operations'
import type { MessageStatus } from '@/lib/messaging/types'
import { ok } from '@/lib/result'

import type { CancelScope } from './types'
import type { MessagingCore } from './core'

/**
 * An in-memory messaging core for tests (docs/19 §11), keeping the two promises of the real one
 * that the B-series relies on: one row per message key (a second `deliver` of the same key returns
 * the first row and writes nothing), and `cancelQueued` cancelling only rows still queued about
 * the subject, of the automations named. It sends nothing; the dispatcher's rules are tested on
 * `decideSend` and in the core's own tests.
 */
export type FakeRow = { id: number; key: string; planned: PlannedMessage; status: MessageStatus }

export class FakeMessagingCore implements MessagingCore {
  readonly rows: FakeRow[] = []

  deliver = async (_req: PayloadRequest, planned: PlannedMessage) => {
    const key = messageKey(planned)
    const existing = this.rows.find((row) => row.key === key)
    if (existing) return ok({ messageId: existing.id, created: false, status: existing.status })
    const row: FakeRow = { id: this.rows.length + 1, key, planned, status: 'queued' }
    this.rows.push(row)
    return ok({ messageId: row.id, created: true, status: row.status })
  }

  cancelQueued = async (_req: PayloadRequest, scope: CancelScope) => {
    let cancelled = 0
    for (const row of this.rows) {
      const { subject, automation } = row.planned
      if (row.status !== 'queued') continue
      if (subject.collection !== scope.subject.collection || subject.id !== scope.subject.id) continue
      if (scope.automations && !scope.automations.includes(automation)) continue
      row.status = 'cancelled'
      cancelled += 1
    }
    return cancelled
  }

  /** The rows still queued, by key, for assertions. */
  queuedKeys(): string[] {
    return this.rows.filter((row) => row.status === 'queued').map((row) => row.key)
  }
}
