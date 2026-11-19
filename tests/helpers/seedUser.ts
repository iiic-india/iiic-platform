import { getPayload } from 'payload'

import config from '../../src/payload.config'

/** Clearly fake staff account for end-to-end tests (CLAUDE.md: seed data is obviously fake). */
export const testUser = {
  name: 'Test Owner (fake)',
  email: 'owner.test@example.invalid',
  password: 'test-only-password-1',
  roles: ['owner'] as ('owner' | 'operator' | 'practitioner' | 'editor' | 'finance')[],
}

export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { equals: testUser.email } } })
  await payload.create({ collection: 'users', data: testUser })
}

export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { equals: testUser.email } } })
}
