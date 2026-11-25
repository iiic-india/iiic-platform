import { createLocalReq, getPayload, type Payload } from 'payload'
import { createElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Frame, Paragraph } from '@/emails/components/Frame'
import type { TemplateImplementation } from '@/emails/types'
import { FakeEmailSender, FakeWhatsAppSender } from '@/lib/messaging/fakes'
import { err, ok } from '@/lib/result'
import type { Person } from '@/payload-types'
import config from '@/payload.config'

// The hooks Release 2's accounts put into M5's and M6's code (docs/20 §12), against the real
// database: a sign-in code goes to the address its first try was handed and to nothing else, the
// message's row holds neither the address nor the code, and a try without them sends nothing
// (H2, H3); an access export holds the person's My IIIC account (H8). Needs the r2a_accounts
// migration. Obviously fake people, addresses and codes, removed at the end.
vi.mock('server-only', () => ({}))

const { deliverWith } = await import('@/lib/messaging/deliver')
const { gatherPersonData } = await import('@/lib/privacy/export')

let payload: Payload
const TAG = 'int.accounts-hooks'
const ADDRESS = `${TAG}.someone@fake.example.invalid`
const CODE = '246810'
const email = new FakeEmailSender()
const whatsapp = new FakeWhatsAppSender()
const created: { signIns: number[]; people: number[]; accounts: number[] } = {
  signIns: [],
  people: [],
  accounts: [],
}

/** 4 March 2099 in India, a day no other test uses. */
const NOW = new Date('2099-03-04T11:00:00+05:30')

/** A stand-in for builder A's A1: the code from the first try only, `stale` without it. */
const fakeCode: TemplateImplementation<{ code: string }> = {
  load: async (_req, message) =>
    message.transient?.code ? ok({ code: message.transient.code }) : err({ code: 'stale' }),
  email: {
    key: 'account-sign-in-code',
    schema: z.object({ code: z.string() }),
    subject: () => 'Fake sign-in code (int.accounts-hooks)',
    preheader: () => 'Fake preheader',
    element: (data, context) => {
      const props = {
        preheader: 'Fake preheader',
        heading: 'Fake heading',
        assetUrl: context.assetUrl,
        footer: context.footer,
      } as Parameters<typeof Frame>[0]
      return createElement(Frame, props, createElement(Paragraph, null, `Fake code ${data.code}.`))
    },
  },
}

const deps = {
  channels: () => ({ email, whatsapp, configured: { email: true, whatsapp: false } }),
  now: () => NOW,
  implementation: () => fakeCode as unknown as TemplateImplementation<never>,
  emit: async () => {},
  site: () => ({
    siteUrl: 'https://fake.example.invalid',
    fromAddress: `${TAG}.from@fake.example.invalid`,
    blockPlaceholders: false,
  }),
}

async function signInRequest() {
  const row = await payload.create({
    collection: 'sign-in-requests',
    data: {
      purpose: 'signIn',
      channel: 'email',
      identifierHash: 'f'.repeat(32),
      networkHash: 'e'.repeat(32),
      requestedAt: NOW.toISOString(),
    },
    overrideAccess: true,
  })
  created.signIns.push(row.id)
  return row
}

async function removeTestData() {
  if (created.signIns.length) {
    await payload.delete({
      collection: 'messages',
      where: {
        and: [
          { subjectCollection: { equals: 'sign-in-requests' } },
          { subjectId: { in: created.signIns } },
        ],
      },
    })
    await payload.delete({ collection: 'sign-in-requests', where: { id: { in: created.signIns } } })
  }
  if (created.accounts.length) {
    await payload.delete({ collection: 'accounts', where: { id: { in: created.accounts } } })
  }
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
})

afterAll(async () => {
  await removeTestData()
})

describe('H2, H3 · a sign-in code', () => {
  it('goes to the address its first try was handed, and the row keeps neither it nor the code', async () => {
    const row = await signInRequest()
    const req = await createLocalReq({}, payload)
    const result = await deliverWith(deps)(
      req,
      {
        automation: 'A1',
        template: 'account-sign-in-code',
        channel: 'email',
        recipient: { kind: 'signIn', id: row.id },
        subject: { collection: 'sign-in-requests', id: row.id },
        sendAt: NOW,
        sendBefore: new Date(NOW.getTime() + 10 * 60 * 1000),
      },
      { transient: { address: ADDRESS, code: CODE } },
    )
    expect(result.ok && result.value.status).toBe('sent')
    const sent = email.sent.filter((entry) => entry.to === ADDRESS)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain(CODE)
    // Signs in no one's name: no person, no withdraw link (the template's footer is `none`).
    expect(sent[0]?.text).not.toContain('/w/')
    const stored = await payload.findByID({
      collection: 'messages',
      id: result.ok ? result.value.messageId : 0,
      depth: 0,
    })
    expect(stored.recipientKind).toBe('signIn')
    expect(stored.person ?? null).toBeNull()
    const json = JSON.stringify(stored)
    expect(json).not.toContain(ADDRESS)
    expect(json).not.toContain(CODE)
  })

  it('sends nothing on a try without the address: skipped, never sent twice', async () => {
    const row = await signInRequest()
    const req = await createLocalReq({}, payload)
    const before = email.sent.length
    const result = await deliverWith(deps)(req, {
      automation: 'A1',
      template: 'account-sign-in-code',
      channel: 'email',
      recipient: { kind: 'signIn', id: row.id },
      subject: { collection: 'sign-in-requests', id: row.id },
      sendAt: NOW,
    })
    expect(result.ok && result.value.status).toBe('skipped')
    expect(email.sent.length).toBe(before)
  })
})

describe('H8 · the access export', () => {
  it('holds the person’s My IIIC account, never Better Auth’s id', async () => {
    const person = (await payload.create({
      collection: 'people',
      data: {
        fullName: `Fake ${TAG} person`,
        email: `${TAG}.person@fake.example.invalid`,
      } as Person,
      overrideAccess: true,
    })) as Person
    created.people.push(person.id)
    const account = await payload.create({
      collection: 'accounts',
      data: { person: person.id, authUserId: `${TAG}-fake-user`, lastSignInChannel: 'email' },
      overrideAccess: true,
    })
    created.accounts.push(account.id)
    const req = await createLocalReq({}, payload)
    const data = await gatherPersonData(req, person.id, NOW)
    expect(data.account).toHaveLength(1)
    expect(JSON.stringify(data.account)).not.toContain('fake-user')
    expect(data.person[0]).not.toHaveProperty('account')
  })
})
