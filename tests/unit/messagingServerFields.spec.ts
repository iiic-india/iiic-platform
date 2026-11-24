// @vitest-environment node
import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Automations } from '@/collections/Automations'
import { Messages } from '@/collections/Messages'
import { MessageTemplates } from '@/collections/MessageTemplates'
import { NewsletterIssues } from '@/collections/NewsletterIssues'
import { People } from '@/collections/People'
import { Subscribers } from '@/collections/Subscribers'
import { Suppressions } from '@/collections/Suppressions'
import { guardIssue, NEWSLETTER_SEND_CONTEXT } from '@/lib/newsletter/hooks'

// M6's server-owned fields (docs/19 §3, §8), as M3's review held M3's: no role writes them
// through the REST API or the admin form, on a new record or a changed one. A field is written
// when its collection lets the role create or update at all and the field's own rule lets it too.
// Every staff session here has entered its two-factor code; visitors and deactivated accounts
// write nothing.

type Who = Role | 'anonymous' | 'deactivated owner'
const EVERYONE: readonly Who[] = [...ROLES, 'anonymous', 'deactivated owner']

function requester(who: Who) {
  if (who === 'anonymous') return null
  if (who === 'deactivated owner')
    return { id: 7, roles: ['owner'], active: false, _strategy: 'totp' }
  return { id: 7, roles: [who], active: true, _strategy: 'totp' }
}

/** Every field of a collection, through rows, groups, tabs and arrays, by its dotted name. */
function fieldsOf(fields: readonly Field[], prefix = ''): Map<string, Field> {
  const found = new Map<string, Field>()
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        for (const [inner, value] of fieldsOf(tab.fields, prefix)) found.set(inner, value)
      }
      continue
    }
    const name = 'name' in field ? `${prefix}${field.name}` : prefix
    if ('name' in field) found.set(name, field)
    if ('fields' in field) {
      for (const [inner, value] of fieldsOf(field.fields, 'name' in field ? `${name}.` : prefix)) {
        found.set(inner, value)
      }
    }
  }
  return found
}

async function writes(
  collection: CollectionConfig,
  name: string,
  operation: 'create' | 'update',
  who: Who,
): Promise<boolean> {
  const field = fieldsOf(collection.fields).get(name)
  if (!field) throw new Error(`${collection.slug} has no field ${name}`)
  const user = requester(who)
  const whole = collection.access?.[operation] as Access | undefined
  const allowed = whole ? await whole({ req: { user } } as Parameters<Access>[0]) : true
  if (allowed === false) return false
  const own = ('access' in field ? field.access?.[operation] : undefined) as FieldAccess | undefined
  return own ? Boolean(await own({ req: { user } } as Parameters<FieldAccess>[0])) : true
}

async function writers(collection: CollectionConfig, name: string): Promise<Who[]> {
  const found: Who[] = []
  for (const who of EVERYONE) {
    const create = await writes(collection, name, 'create', who)
    const update = await writes(collection, name, 'update', who)
    if (create || update) found.push(who)
  }
  return found
}

describe('the fields only the server writes (M6)', () => {
  it('lets no role write a message: its state, its keys or the provider’s ids', async () => {
    for (const name of [
      'status',
      'skipReason',
      'lastError',
      'dedupeKey',
      'attempts',
      'provider',
      'providerMessageId',
      'sentAt',
      'deliveredAt',
      'counselling',
      'person',
    ]) {
      expect(await writers(Messages, name), name).toEqual([])
    }
  })

  it('lets no role write a subscriber’s confirmation, consent or token hash', async () => {
    for (const name of [
      'email',
      'status',
      'consent',
      'notice',
      'person',
      'confirmTokenHash',
      'confirmExpiresAt',
      'confirmedAt',
      'unsubscribedAt',
    ]) {
      expect(await writers(Subscribers, name), name).toEqual([])
    }
  })

  it('lets the office pause an automation, and nobody type its key or its counts', async () => {
    for (const name of ['key', 'lastRunAt', 'successCount', 'failureCount']) {
      expect(await writers(Automations, name), name).toEqual([])
    }
    expect(await writers(Automations, 'enabled')).toEqual(['owner', 'operator'])
  })

  it('records an address the office suppresses as the office’s, whatever the form sends', async () => {
    expect(await writers(Suppressions, 'source')).toEqual([])
    expect(await writers(Suppressions, 'address')).toEqual(['owner', 'operator'])
  })

  it('lets nobody type when an issue went or to how many, and only N4 marks it sent', async () => {
    for (const name of ['sentAt', 'recipientCount']) {
      expect(await writers(NewsletterIssues, name), name).toEqual([])
    }
    const editor = { context: {}, user: requester('editor') }
    for (const status of ['sending', 'sent'] as const) {
      expect(() =>
        guardIssue({
          data: { status },
          originalDoc: { status: 'scheduled', scheduledFor: '2099-01-01T05:00:00.000Z' },
          req: editor,
        } as unknown as Parameters<typeof guardIssue>[0]),
      ).toThrow()
    }
    // N4's own update passes its context flag, which no REST call can set.
    const n4 = { context: { [NEWSLETTER_SEND_CONTEXT]: true } }
    expect(
      guardIssue({
        data: { status: 'sent' },
        originalDoc: { status: 'sending' },
        req: n4,
      } as unknown as Parameters<typeof guardIssue>[0]),
    ).toEqual({ status: 'sent' })
  })

  it('lets only an owner approve a template’s wording or record Meta’s decision', async () => {
    for (const name of ['status', 'lastReviewedAt']) {
      expect(await writers(MessageTemplates, name), name).toEqual(['owner'])
    }
  })

  it('lets nobody type when a person last wrote on WhatsApp (the 24-hour window)', async () => {
    expect(await writers(People, 'whatsappLastInboundAt')).toEqual([])
  })
})
