// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { priceAllowed, TEMPLATES, templateSpec, WHATSAPP_TEMPLATE_KEYS } from '@/emails/registry'
import { jobs } from '@/jobs'
import { AUTOMATION_IDS, AUTOMATIONS, CORE_TASKS } from '@/lib/automations/catalogue'
import { AUTOMATION_EVENT_NAMES, automationEventKey } from '@/lib/automations/events'
import { AUTOMATION_LISTENERS, withAutomationListeners } from '@/lib/automations/listeners'
import { SCHEDULES, withSchedule } from '@/lib/automations/schedules'
import { LISTENERS } from '@/lib/booking/emit'

vi.mock('server-only', () => ({}))

// The catalogue against docs/06 (docs/19 §5): every Release 1 automation is in it once, each
// message-sending automation has a template, and the wiring is read from it.
const docs06 = readFileSync(path.resolve('docs/06-automations.md'), 'utf8')

/** The automation IDs of docs/06's Release 1 tables (everything before "Engine (R2)"). */
function releaseOneIds(): string[] {
  const r1 = docs06.split('### Engine (R2)')[0] ?? ''
  return [...r1.matchAll(/^\| (B\d+a?|P\d+|N\d+|O\d+|V\d+|C\d+) \|/gm)].map((match) => match[1]!)
}

describe('the automation catalogue', () => {
  it('holds every Release 1 automation of docs/06 once', () => {
    const ids = releaseOneIds()
    // B1 to B14 with B3a, P1 to P7, N1 to N4, O1 to O10, V1, V2 and C5.
    expect(ids).toHaveLength(39)
    expect([...AUTOMATION_IDS].sort()).toEqual([...ids].sort())
    expect(new Set(AUTOMATION_IDS).size).toBe(AUTOMATION_IDS.length)
  })

  it('names every task by its automation ID', () => {
    for (const entry of AUTOMATIONS) {
      if (!('task' in entry) || !entry.task) continue
      // O10 is part of the weekly report's task (docs/06: "Weekly, with O2").
      const id = entry.id === 'O10' ? 'O2' : entry.id
      expect(entry.task.split('-'), entry.id).toContain(id)
    }
  })

  it('gives every automation that writes to a person or to staff a template', () => {
    for (const entry of AUTOMATIONS) {
      const messages = entry.channels.some(
        (channel) => channel === 'email' || channel === 'whatsapp',
      )
      if (!messages || entry.owner === 'M3') continue
      const covered = TEMPLATES.some((spec) =>
        (spec.automations as readonly string[]).includes(entry.id),
      )
      expect(covered, entry.id).toBe(true)
    }
  })

  it('subscribes M6 tasks to events, and never M3 tasks twice', () => {
    expect(AUTOMATION_LISTENERS['booking.confirmed']).toEqual(
      expect.arrayContaining([
        'B2-confirmation',
        'B3a-consent-receipt',
        'B5-reminder-24h',
        'B6-reminder-2h',
      ]),
    )
    expect(AUTOMATION_LISTENERS['booking.rescheduled']).toEqual(
      expect.arrayContaining(['B5-reminder-24h', 'B6-reminder-2h', 'B7-change-notice']),
    )
    const merged = withAutomationListeners({ 'booking.confirmed': ['B2-B7-sync-calendar-event'] })
    expect(merged['booking.confirmed']?.[0]).toBe('B2-B7-sync-calendar-event')
    expect(merged['booking.confirmed']).toContain('B2-confirmation')
  })

  it('keys an event by its subject id', () => {
    expect(automationEventKey({ name: 'message.failed', messageId: 9 })).toBe('message.failed:9')
    expect(automationEventKey({ name: 'booking.confirmed', bookingId: 3, cause: 'staff' })).toBe(
      'booking.confirmed:3',
    )
    for (const entry of AUTOMATIONS) {
      for (const name of ('on' in entry ? entry.on : []) ?? []) {
        expect(AUTOMATION_EVENT_NAMES).toContain(name)
      }
    }
  })

  it('schedules only tasks that exist, in UTC with a seconds field', () => {
    const tasks = new Set<string>([
      ...AUTOMATIONS.flatMap((entry) => ('task' in entry && entry.task ? [entry.task] : [])),
      CORE_TASKS.dispatch,
      'O5-purge-missing-pages',
      'B2-poll-pending-orders',
      // M4's proposal expiry (P8, proposed in docs/17; not an automation of docs/06).
      'P8-expire-proposals',
    ])
    for (const [slug, schedule] of Object.entries(SCHEDULES)) {
      expect(tasks.has(slug), slug).toBe(true)
      expect(schedule.cron.split(' ')).toHaveLength(6)
    }
    // 08:30 IST is 03:00 UTC; Monday 09:00 IST is Monday 03:30 UTC.
    expect(SCHEDULES['O1-daily-digest']?.cron).toBe('0 0 3 * * *')
    expect(SCHEDULES['O2-weekly-report']?.cron).toBe('0 30 3 * * 1')
    expect(
      withSchedule({ slug: 'B4-expire-holds', handler: async () => ({ output: {} }) }).schedule,
    ).toEqual([{ cron: '0 * * * * *', queue: 'default' }])
  })

  it('starts every task M3 and M6 registered, by its schedule or an event, and fails it visibly', () => {
    const tasks = jobs.tasks ?? []
    const slugs = tasks.map((task) => String(task.slug))
    for (const slug of Object.keys(SCHEDULES)) expect(slugs, slug).toContain(slug)
    const heard = new Set<string>(
      [...Object.values(LISTENERS), ...Object.values(AUTOMATION_LISTENERS)].flatMap((listeners) => [
        ...(listeners ?? []),
      ]),
    )
    for (const task of tasks) {
      const slug = String(task.slug)
      const scheduled = Boolean(task.schedule?.length)
      expect(scheduled || heard.has(slug), `${slug} has no schedule and no event`).toBe(true)
      expect(scheduled, slug).toBe(slug in SCHEDULES)
      // The shared failure path (O3) on every task, M3's included.
      expect(task.onFail, slug).toBeTypeOf('function')
    }
    // The documents' jobs stay M3's listeners; B3's email hears the invoice the job issues.
    expect(LISTENERS['payment.captured']).toContain('B3-issue-invoice')
    expect(AUTOMATION_LISTENERS['invoice.issued']).toEqual(['B3-receipt'])
    expect(AUTOMATION_LISTENERS['payment.linkSent']).toEqual(['B13-payment-link'])
    expect(AUTOMATION_LISTENERS['refund.processed']).toEqual(['B7-change-notice'])
  })
})

describe('the template registry (docs/19 §7)', () => {
  it('carries no offer in any Release 1 message (docs/06, counselling guardrail)', () => {
    for (const spec of TEMPLATES) expect(spec.offers).toBe(false)
  })

  it('carries the scope statement on counselling confirmations and reminders', () => {
    for (const key of ['booking-confirmed', 'reminder-24h', 'reminder-short'] as const) {
      expect(templateSpec(key).counsellingScope).toBe(true)
    }
  })

  it('shows no price while prices are hidden, except the person’s own payment (D-21, D-24)', () => {
    const hidden = { pricesPublic: false }
    expect(priceAllowed('booking-confirmed', hidden)).toBe(false)
    expect(priceAllowed('booking-confirmed', { pricesPublic: true })).toBe(true)
    expect(priceAllowed('payment-link', hidden)).toBe(true)
    expect(priceAllowed('reminder-24h', { pricesPublic: true })).toBe(false)
  })

  it('gives promotional mail a one-click unsubscribe and internal mail no footer link', () => {
    for (const spec of TEMPLATES) {
      if (spec.kind === 'promotional') expect(spec.footer, spec.key).toBe('unsubscribe')
      if (spec.kind === 'internal') expect(spec.footer, spec.key).toBe('none')
      if (spec.kind === 'internal') expect(spec.sender, spec.key).toBe('platform')
    }
  })

  it('submits to Meta only templates that name the person’s own booking', () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      const spec = templateSpec(key)
      expect(spec.channels).toContain('whatsapp')
      expect(spec.kind).not.toBe('promotional')
    }
    for (const spec of TEMPLATES) {
      if ((spec.channels as readonly string[]).includes('whatsapp')) {
        expect(WHATSAPP_TEMPLATE_KEYS as readonly string[]).toContain(spec.key)
      }
    }
  })
})
