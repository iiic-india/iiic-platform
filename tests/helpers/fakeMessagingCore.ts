import type { MessagingCore } from '@/lib/automations/operations/core'
import { messageKey, type PlannedMessage } from '@/lib/messaging/operations'
import { err, ok } from '@/lib/result'

/**
 * A fake of builder A's messaging core for builder C's tests (docs/19 §12): `deliver` keeps one
 * planned message per key, as the real one keeps one `messages` row, and answers `created: false`
 * for a key it already holds; `verifyLink` reads tokens of the form `fake.<purpose>.<id>`. Nothing
 * is sent anywhere.
 */
export function fakeMessagingCore() {
  const planned = new Map<string, PlannedMessage>()
  let nextId = 1
  const ids = new Map<string, number>()
  const core: MessagingCore = {
    deliver: async (_req, message) => {
      const key = messageKey(message)
      const existing = ids.get(key)
      if (existing !== undefined)
        return ok({ messageId: existing, created: false, status: 'queued' })
      const id = nextId++
      ids.set(key, id)
      planned.set(key, message)
      return ok({ messageId: id, created: true, status: 'queued' })
    },
    cancelQueued: async () => 0,
    verifyLink: async (purpose, token) => {
      const [fake, kind, id] = token.split('.')
      if (fake !== 'fake' || kind !== purpose || !Number(id)) {
        return err({ code: 'invalid' as const })
      }
      return ok({ subjectId: Number(id) })
    },
  }
  return {
    core,
    planned,
    /** The planned messages of one automation, in the order they were planned. */
    of: (automation: string) => [...planned.values()].filter((m) => m.automation === automation),
    reset: () => {
      planned.clear()
      ids.clear()
    },
  }
}
