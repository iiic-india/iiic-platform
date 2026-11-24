import { AUTOMATIONS, type Automation } from './catalogue'
import type { AutomationEventName } from './events'

/**
 * The tasks each event starts, read from the catalogue (docs/19 §2), so a subscription is added
 * by adding the automation, never by editing an emitter. Pure.
 */
export type AutomationListeners = { readonly [Name in AutomationEventName]?: readonly string[] }

/**
 * Every M6 subscription. An automation whose task is M3's (B4, B11, B14) or M4's (P2, P3, P4) has
 * no event here; their own listeners stay where they are (src/lib/booking/emit.ts, with M4's P2
 * from src/lib/pipeline/queue.ts), so no task is queued twice for one event.
 */
export function listenersFrom(automations: readonly Automation[]): AutomationListeners {
  const listeners: { [Name in AutomationEventName]?: string[] } = {}
  for (const entry of automations) {
    if (entry.owner === 'M3' || entry.owner === 'M4' || !entry.task) continue
    for (const name of entry.on ?? []) {
      const tasks = (listeners[name] ??= [])
      if (!tasks.includes(entry.task)) tasks.push(entry.task)
    }
  }
  return listeners
}

export const AUTOMATION_LISTENERS: AutomationListeners = listenersFrom(AUTOMATIONS)

/**
 * M3's listeners with M6's added after them, for the booking module's `emit`
 * (src/lib/booking/emit.ts): the calendar write and the documents run first, the messages after.
 */
export function withAutomationListeners<
  L extends { readonly [name: string]: readonly string[] | undefined },
>(base: L): L {
  const merged: Record<string, readonly string[]> = {}
  for (const [name, tasks] of Object.entries(base)) if (tasks) merged[name] = [...tasks]
  for (const [name, tasks] of Object.entries(AUTOMATION_LISTENERS)) {
    if (!tasks) continue
    const existing = merged[name] ?? []
    merged[name] = [...existing, ...tasks.filter((task) => !existing.includes(task))]
  }
  return merged as unknown as L
}
