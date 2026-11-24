import 'server-only'

import { defaultMessagingDeps, type MessagingDeps } from './deps'
import type { Dispatch, DispatchSummary } from './operations'
import { MAX_ATTEMPTS, SENDING_STALE_AFTER_MS } from './states'
import { dueMessages, move, staleSending } from './store'
import { tryMessage, type TryOutcome } from './try'

/**
 * One run of `messages-dispatch` (docs/19 §2, §3), every minute: first the sweep, then the due
 * messages, oldest first. The sweep finds messages claimed five minutes ago that never answered
 * (the function that held them has ended): an email goes back in the queue, since Resend's
 * idempotency key keeps it from going twice within 24 hours; a WhatsApp message becomes `unknown`
 * and is never sent again on its own (at most once), and shows on Today. Each due message is then
 * tried; a claim makes two runs at once safe. With a budget, the run takes no new message once
 * the budget is spent, so it ends well inside its function's time (the next minute takes the
 * rest). Codes and counts only.
 */

const EMPTY: DispatchSummary = {
  sent: 0,
  deferred: 0,
  skipped: 0,
  failed: 0,
  retried: 0,
  unknown: 0,
}

const COUNTED: Partial<Record<TryOutcome, keyof DispatchSummary>> = {
  sent: 'sent',
  deferred: 'deferred',
  skipped: 'skipped',
  failed: 'failed',
  retried: 'retried',
  unknown: 'unknown',
}

export function dispatchWith(deps: MessagingDeps): Dispatch {
  return async (req, now, limit, budget) => {
    const clock = budget?.clock ?? Date.now
    const started = clock()
    const summary: DispatchSummary = { ...EMPTY }
    const at: MessagingDeps = { ...deps, now: () => now }
    const stale = await staleSending(req, new Date(now.getTime() - SENDING_STALE_AFTER_MS))
    for (const row of stale) {
      if (row.channel === 'email') {
        const attempts = await attemptsOf(req, row.id)
        if (attempts < MAX_ATTEMPTS) {
          const moved = await move(
            req,
            row.id,
            ['sending'],
            'queued',
            { sendAt: now, lastError: 'no-answer' },
            now,
          )
          if (moved) summary.retried += 1
          continue
        }
      }
      const moved = await move(req, row.id, ['sending'], 'unknown', { lastError: 'no-answer' }, now)
      if (moved) {
        summary.unknown += 1
        await deps.emit(req, { name: 'message.failed', messageId: row.id })
      }
    }
    for (const id of await dueMessages(req, now, limit)) {
      if (budget && clock() - started >= budget.ms) break
      const outcome = await tryMessage(req, at, id)
      const field = COUNTED[outcome]
      if (field) summary[field] += 1
    }
    return summary
  }
}

async function attemptsOf(req: Parameters<Dispatch>[0], id: number): Promise<number> {
  const found = await req.payload.findByID({
    collection: 'messages',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { attempts: true },
    req,
  })
  return Number(found?.attempts ?? 0)
}

export const dispatch: Dispatch = (req, now, limit, budget) =>
  dispatchWith(defaultMessagingDeps())(req, now, limit, budget)
