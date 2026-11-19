import { Secret, TOTP } from 'otpauth'
import { getPayload } from 'payload'

import config from '../../src/payload.config'

type Role = 'owner' | 'operator' | 'practitioner' | 'editor' | 'finance'

/** Clearly fake staff accounts for end-to-end tests (CLAUDE.md: seed data is obviously fake). */
export const testUser = {
  name: 'Test Owner (fake)',
  email: 'owner.test@example.invalid',
  password: 'test-only-password-1',
  roles: ['owner'] as Role[],
  // The RFC 6238 example secret: obviously not a real one.
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
}

/** Someone who has not set up an authenticator yet. */
export const newcomer = {
  name: 'Test Newcomer (fake)',
  email: 'newcomer.test@example.invalid',
  password: 'test-only-password-2',
  roles: ['editor'] as Role[],
}

/** The code an authenticator app would show now for this secret (src/lib/auth/totp.ts). */
export function totpCode(secret: string): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

const EMAILS = [testUser.email, newcomer.email]

/** Creates both accounts afresh and returns their IDs. */
export async function seedTestUsers(): Promise<{
  ownerId: number | string
  newcomerId: number | string
}> {
  const payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { in: EMAILS } } })
  const owner = await payload.create({ collection: 'users', data: testUser })
  const next = await payload.create({ collection: 'users', data: newcomer })
  return { ownerId: owner.id, newcomerId: next.id }
}

export async function cleanupTestUsers(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { in: EMAILS } } })
}
