// @vitest-environment node
import type { Access, CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Automations } from '@/collections/Automations'
import { Messages } from '@/collections/Messages'
import { MessageTemplates } from '@/collections/MessageTemplates'
import { NewsletterIssues } from '@/collections/NewsletterIssues'
import { Subscribers } from '@/collections/Subscribers'
import { Suppressions } from '@/collections/Suppressions'
import { parseEnv } from '@/lib/env'

// M6's collections held to docs/04 and docs/05 (docs/19 §3, §8): who reads and writes each, with
// the two-factor code entered; anonymous visitors and deactivated accounts reach nothing.
type Operation = 'read' | 'create' | 'update' | 'delete'

function requester(role: Role | 'anonymous', strategy = 'totp') {
  return role === 'anonymous' ? null : { id: 1, roles: [role], active: true, _strategy: strategy }
}

async function allowed(
  collection: CollectionConfig,
  operation: Operation,
  role: Role | 'anonymous',
) {
  const access = collection.access?.[operation] as Access | undefined
  return (await access?.({ req: { user: requester(role) } } as Parameters<Access>[0])) === true
}

const TABLE: [CollectionConfig, Record<Operation, readonly Role[]>][] = [
  [Messages, { read: ['owner', 'operator'], create: [], update: [], delete: [] }],
  [
    MessageTemplates,
    {
      read: ['owner', 'operator', 'editor'],
      create: ['owner', 'operator', 'editor'],
      update: ['owner', 'operator', 'editor'],
      delete: ['owner'],
    },
  ],
  [
    Automations,
    { read: ['owner', 'operator'], create: [], update: ['owner', 'operator'], delete: [] },
  ],
  [Subscribers, { read: ['owner', 'operator'], create: [], update: [], delete: ['owner'] }],
  [
    NewsletterIssues,
    {
      read: ['owner', 'operator', 'editor'],
      create: ['owner', 'editor'],
      update: ['owner', 'editor'],
      delete: ['owner', 'editor'],
    },
  ],
  [
    Suppressions,
    { read: ['owner', 'operator'], create: ['owner', 'operator'], update: [], delete: ['owner'] },
  ],
]

describe('messaging collections: access', () => {
  for (const [collection, rules] of TABLE) {
    for (const operation of ['read', 'create', 'update', 'delete'] as const) {
      it(`${collection.slug}: ${operation}`, async () => {
        for (const role of ROLES) {
          expect(await allowed(collection, operation, role), role).toBe(
            rules[operation].includes(role),
          )
        }
        expect(await allowed(collection, operation, 'anonymous')).toBe(false)
      })
    }
  }

  it('keeps practitioners and finance out of the message log (CLAUDE.md #3)', async () => {
    expect(await allowed(Messages, 'read', 'practitioner')).toBe(false)
    expect(await allowed(Messages, 'read', 'finance')).toBe(false)
  })
})

describe('messaging environment (docs/19 §3)', () => {
  const valid = {
    PAYLOAD_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic',
  }

  it('builds and runs without any messaging settings', () => {
    const env = parseEnv({ ...valid, CRON_SECRET: '', MAIL_DOMAIN: '', WHATSAPP_API_KEY: '' })
    expect(env.CRON_SECRET).toBeUndefined()
    expect(env.MESSAGING_TRANSPORT).toBe('live')
  })

  it('takes the three WhatsApp settings together or not at all', () => {
    const whatsapp = {
      WHATSAPP_API_KEY: 'fake-key',
      WHATSAPP_WEBHOOK_SECRET: 'f'.repeat(32),
      WHATSAPP_SENDER_NUMBER: '+910000000000',
    }
    expect(parseEnv({ ...valid, ...whatsapp }).WHATSAPP_SENDER_NUMBER).toBe('+910000000000')
    for (const name of Object.keys(whatsapp)) {
      expect(() => parseEnv({ ...valid, ...whatsapp, [name]: undefined }), name).toThrow(/WhatsApp/)
    }
  })

  it('refuses the fake senders on a Vercel deployment, and a short cron secret', () => {
    expect(() =>
      parseEnv({ ...valid, MESSAGING_TRANSPORT: 'fake', VERCEL_ENV: 'preview' }),
    ).toThrow(/MESSAGING_TRANSPORT/)
    expect(() => parseEnv({ ...valid, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/)
    expect(() => parseEnv({ ...valid, MAIL_DOMAIN: 'not a domain' })).toThrow(/MAIL_DOMAIN/)
  })
})
