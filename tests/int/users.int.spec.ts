import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

let payload: Payload

const fake = (n: number) => `int.test.${n}@example.invalid`

describe('users', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    await payload.delete({ collection: 'users', where: { email: { like: 'int.test.' } } })
  })

  afterAll(async () => {
    await payload.delete({ collection: 'users', where: { email: { like: 'int.test.' } } })
  })

  it('makes the first account ever created an owner', async () => {
    const { totalDocs } = await payload.count({ collection: 'users' })
    const created = await payload.create({
      collection: 'users',
      data: {
        name: 'Fake One',
        email: fake(1),
        password: 'test-only-password-1',
        roles: ['editor'],
      },
    })
    expect(created.roles).toEqual(totalDocs === 0 ? ['owner'] : ['editor'])
  })

  it('does not let a non-owner change their own roles', async () => {
    const editor = await payload.create({
      collection: 'users',
      data: {
        name: 'Fake Two',
        email: fake(2),
        password: 'test-only-password-2',
        roles: ['editor'],
      },
    })
    const updated = await payload.update({
      collection: 'users',
      id: editor.id,
      data: { roles: ['owner'] },
      user: editor,
      overrideAccess: false,
    })
    expect(updated.roles).toEqual(['editor'])
  })

  it('does not let a non-owner create staff accounts', async () => {
    const editor = await payload.find({
      collection: 'users',
      where: { email: { equals: fake(2) } },
    })
    await expect(
      payload.create({
        collection: 'users',
        data: {
          name: 'Fake Three',
          email: fake(3),
          password: 'test-only-password-3',
          roles: ['owner'],
        },
        user: editor.docs[0],
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
