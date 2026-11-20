import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import { copyStarterPage, starterPagesWaiting } from '@/lib/content/copyStarter'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// Copying the starter pages into the admin, against the real database (D-54): every starter
// page must be a page the collection accepts. Obviously fake accounts. The pages are IIIC's
// own starter pages, so this test removes exactly the ones it created and nothing else.
let payload: Payload
const email = (label: string) => `int.starter.${label}@example.invalid`
const PASSWORD = 'test-only-password-starter'
const starters = Object.values(STARTER_PAGES)
const made: (number | string)[] = []
let editor: User
let practitioner: User

async function staff(role: 'owner' | 'editor' | 'practitioner') {
  return payload.create({
    collection: 'users',
    data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
  })
}

/** A request from `user`, their two-factor code entered, as Payload would build it. */
async function request(user: User, body: Record<string, unknown>): Promise<PayloadRequest> {
  const req = await createLocalReq(
    { user: { ...user, collection: 'users', _strategy: 'totp' } as never },
    payload,
  )
  req.json = async () => body
  return req
}

/** What a visitor finds at an address: no sign-in, access rules applied. */
async function visitorFinds(slug: string) {
  const found = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    overrideAccess: false,
  })
  return found.totalDocs
}

async function removeTestData() {
  if (made.length > 0) {
    await payload.delete({ collection: 'pages', where: { id: { in: made } } })
    made.length = 0
  }
  await payload.delete({ collection: 'users', where: { email: { like: 'int.starter.' } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.starter.' } } })
  // The test database holds no real pages. If it ever does, stop before touching them.
  const present = await payload.find({
    collection: 'pages',
    where: { slug: { in: starters.map((page) => page.slug) } },
    pagination: false,
    overrideAccess: true,
  })
  if (present.totalDocs > 0) {
    throw new Error('This test needs a database without the starter pages; it found some.')
  }
  // The owner first: on an empty table the first account becomes the owner anyway.
  await staff('owner')
  editor = await staff('editor')
  practitioner = await staff('practitioner')
})

afterAll(async () => {
  await removeTestData()
})

describe('copying the starter pages into the admin', () => {
  it('refuses staff who do not edit content, and creates nothing', async () => {
    const response = await copyStarterPage(await request(practitioner, { slug: 'about' }))
    expect(response.status).toBe(403)
    expect(await starterPagesWaiting(payload)).toHaveLength(starters.length)
  })

  it('copies every starter page in as a draft the page rules accept', async () => {
    for (const starter of starters) {
      const response = await copyStarterPage(await request(editor, { slug: starter.slug }))
      expect(response.status, starter.slug).toBe(201)
      const { id } = (await response.json()) as { id: number | string }
      made.push(id)

      const page = await payload.findByID({
        collection: 'pages',
        id,
        draft: true,
        overrideAccess: true,
      })
      expect(page._status, starter.slug).toBe('draft')
      expect(page.slug).toBe(starter.slug)
      expect(page.title).toBe(starter.title)
      expect(page.layout.map((block) => block.blockType)).toEqual(
        starter.layout.map((block) => block.blockType),
      )
      expect(page.legalReview ?? undefined).toBe(starter.legalReview)
      expect(page.facts?.map((fact) => fact.statement) ?? []).toEqual(
        starter.facts?.map((fact) => fact.statement) ?? [],
      )
      // Nothing is published by copying: the site keeps showing the starter page.
      expect(await visitorFinds(starter.slug), starter.slug).toBe(0)
    }
    expect(await starterPagesWaiting(payload)).toEqual([])
  }, 120_000)

  it('never overwrites a page that is already here', async () => {
    const first = starters[0]!
    const response = await copyStarterPage(await request(editor, { slug: first.slug }))
    expect(response.status).toBe(409)
    expect(((await response.json()) as { id: number | string }).id).toBe(made[0])
    const found = await payload.find({
      collection: 'pages',
      where: { slug: { equals: first.slug } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(1)
  })
})
