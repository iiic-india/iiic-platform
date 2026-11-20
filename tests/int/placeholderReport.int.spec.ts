import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadPlaceholderReport } from '@/lib/content/placeholderReport'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// The placeholders report against the real database (D-56): it reads pages with the staff
// member's own access. Obviously fake accounts and content.
let payload: Payload
const email = (label: string) => `int.placeholders.${label}@example.invalid`
const PASSWORD = 'test-only-password-placeholders'
const SLUG = 'int-placeholders-draft'
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
let editor: User
let practitioner: User
let pageId: number | string

async function staff(role: 'owner' | 'editor' | 'practitioner') {
  return payload.create({
    collection: 'users',
    data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
  })
}

async function removeTestData() {
  await payload.delete({ collection: 'pages', where: { slug: { equals: SLUG } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.placeholders.' } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  await staff('owner')
  editor = await staff('editor')
  practitioner = await staff('practitioner')
  const page = await payload.create({
    collection: 'pages',
    data: {
      title: 'Fake draft',
      slug: SLUG,
      layout: [
        { blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' },
        {
          blockType: 'statement',
          heading: 'Fake section',
          paragraphs: [{ text: '[[TODO: a fake fact, I-10]]' }],
          copyStatus: 'candidate',
        },
      ],
      _status: 'draft',
    },
    draft: true,
  })
  pageId = page.id
})

afterAll(async () => {
  await removeTestData()
})

describe('the placeholders report', () => {
  it('reads a draft in the admin for staff who edit content, with a way to it', async () => {
    const report = await loadPlaceholderReport(payload, verified(editor), '/admin')
    const row = report.missing.find((entry) => entry.page.path === `/${SLUG}`)
    expect(row).toEqual({
      id: 'I-10',
      what: 'a fake fact',
      section: 'Fake section',
      page: {
        title: 'Fake draft',
        path: `/${SLUG}`,
        href: `/admin/collections/pages/${pageId}`,
        inAdmin: true,
      },
    })
    expect(report.candidates.find((entry) => entry.page.path === `/${SLUG}`)?.sections).toEqual([
      'Fake section',
    ])
    // The starter pages nobody has brought in are read from the repository.
    const privacy = report.legal.find((entry) => entry.page.path === '/privacy')
    expect(privacy?.page.inAdmin).toBe(false)
  })

  it('reads no draft for staff who do not edit content', async () => {
    const report = await loadPlaceholderReport(payload, verified(practitioner), '/admin')
    expect(report.missing.some((entry) => entry.page.path === `/${SLUG}`)).toBe(false)
    expect(report.candidates.some((entry) => entry.page.path === `/${SLUG}`)).toBe(false)
  })
})
