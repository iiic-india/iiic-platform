// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { automationOfTask, retriesSpent, TASK_RETRIES } from '@/lib/automations/failures'
import { hasPlaceholder, showsPrice, storedProviderId } from '@/lib/messaging/guards'

vi.mock('server-only', () => ({}))

const { alertHour, ALERT_THRESHOLD, totalFailures } = await import('@/lib/automations/failureAlert')
const { failureAlert, countWord } = await import('@/emails/core/failureAlert')
const { renderEmail } = await import('@/emails/render')
const { QUEUE_AGAIN_MESSAGES, queueAgain } = await import('@/lib/messaging/requeue')
const { messagingTasks } = await import('@/jobs/messaging')

// The core's pure rules (docs/19 §2, §3, §9): the last checks on a rendered message, when a task
// has spent its retries, the alert's hour and words, the tasks' set-up and the "queue again"
// endpoint's refusals. Obviously fake values throughout.

describe('the last checks before a message leaves', () => {
  it('finds a rupee amount in any form, and nothing in plain dates or references', () => {
    expect(showsPrice('Your session costs ₹2,500')).toBe(true)
    expect(showsPrice('Rs. 500 paid')).toBe(true)
    expect(showsPrice('INR 1200')).toBe(true)
    expect(showsPrice('Friday, 6 November at 3 PM', 'Reference IIIC-S-00012')).toBe(false)
  })
  it('finds a placeholder anywhere', () => {
    expect(hasPlaceholder('Hello', 'Call [[TODO: the phone number, I-03]]')).toBe(true)
    expect(hasPlaceholder('Hello')).toBe(false)
  })
  it('keeps a fake sender’s id unique per row, and a provider’s as given', () => {
    expect(storedProviderId('fake', 'fake-email-1', 42)).toBe('fake-email-1@42')
    expect(storedProviderId('resend', 'abc-123', 42)).toBe('abc-123')
  })
})

describe('a task that spends its retries (docs/19 §2)', () => {
  it('is the failure after three retries, not before', () => {
    const status = (totalTried: number) => ({
      complete: false,
      input: {},
      output: {},
      taskSlug: 'messages-dispatch',
      totalTried,
    })
    expect(retriesSpent(null)).toBe(false)
    expect(retriesSpent(status(0) as never)).toBe(false)
    expect(retriesSpent(status(2) as never)).toBe(false)
    expect(retriesSpent(status(TASK_RETRIES.attempts) as never)).toBe(true)
  })
  it('names the automation of a task from the catalogue', () => {
    expect(automationOfTask('O3-failure-alert')).toBe('O3')
    expect(automationOfTask('B5-reminder-24h')).toBe('B5')
    expect(automationOfTask('messages-dispatch')).toBeNull()
    expect(automationOfTask(undefined)).toBeNull()
  })
  it('gives both of the core’s tasks the retries, the shared onFail and one runner at a time', () => {
    const slugs = messagingTasks.map((task) => task.slug)
    expect(slugs).toEqual(['messages-dispatch', 'O3-failure-alert'])
    for (const task of messagingTasks) {
      expect(task.retries).toEqual(TASK_RETRIES)
      expect(typeof task.onFail).toBe('function')
      expect(task.concurrency).toBeTypeOf('function')
      // A schedule comes from schedules.ts only; never autoRun.
      expect('schedule' in task).toBe(false)
    }
  })
})

describe('O3 · the failure alert (docs/19 §9)', () => {
  it('alerts from three failures, and tags the UTC hour in its key', () => {
    expect(ALERT_THRESHOLD).toBe(3)
    expect(totalFailures({ messages: 1, unanswered: 1, jobs: 1 })).toBe(3)
    expect(alertHour(new Date('2099-01-01T05:59:59.000Z'))).toBe('h2099010105')
    expect(alertHour(new Date('2099-01-01T06:00:00.000Z'))).toBe('h2099010106')
  })
  it('says the count in words up to nine, and holds counts only', async () => {
    expect(countWord(3)).toBe('three')
    expect(countWord(12)).toBe('12')
    const data = { messages: 2, unanswered: 1, jobs: 1, since: '2099-01-01T04:30:00.000Z' }
    const email = await renderEmail(failureAlert.email!, data, {
      siteUrl: 'https://fake.example.invalid',
      assetUrl: 'https://fake.example.invalid/email',
      priceAllowed: false,
      footer: {
        legalLine: 'Fake legal line',
        siteUrl: 'https://fake.example.invalid',
        siteDisplay: 'fake.example.invalid',
      },
    })
    expect(email.subject).toBe('Four sends or jobs failed in the last hour')
    expect(email.text).toContain('10 AM')
    expect(email.text).toContain('https://fake.example.invalid/admin/collections/messages')
    expect(email.text).not.toMatch(/!|\[\[TODO/)
  })
})

describe('queue again (docs/19 §3)', () => {
  const call = (user: unknown, id: unknown = '5') =>
    queueAgain({ user, routeParams: { id } } as never) as Promise<Response>
  const owner = { id: 1, collection: 'users', roles: ['owner'], active: true }

  it('asks for a session with the code first, then the role, then a real id', async () => {
    const none = await call(null)
    expect(none.status).toBe(401)
    expect(await none.json()).toEqual({ message: QUEUE_AGAIN_MESSAGES.signIn })
    expect((await call(owner)).status).toBe(401)
    const editor = { ...owner, roles: ['editor'], _strategy: 'totp' }
    expect((await call(editor)).status).toBe(403)
    const finance = { ...owner, roles: ['finance'], _strategy: 'totp' }
    expect((await call(finance)).status).toBe(403)
    expect((await call({ ...owner, _strategy: 'totp' }, 'nope')).status).toBe(400)
  })
})
