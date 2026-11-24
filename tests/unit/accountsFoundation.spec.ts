// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Accounts } from '@/collections/Accounts'
import { People } from '@/collections/People'
import { SignInRequests } from '@/collections/SignInRequests'
import {
  CUSTOMER_AUTH,
  SESSION_COOKIE_PREFIX,
  SIGN_IN,
  SIGN_IN_COOKIE,
  SIGN_IN_LIMITS,
  codeRequestInput,
  createAccountInput,
  verifyCodeInput,
} from '@/lib/accounts/contract'
import { parseEnv } from '@/lib/env'

/**
 * The foundation of customer accounts (docs/20-accounts-design.md): the numbers docs/03 F7 and
 * docs/08 §9 set, the collections' access, the environment's guards and the pinned library.
 * The builders' own tests sit beside their slices (docs/20 §11).
 */

type Requester = Role | 'anonymous' | 'deactivated owner'

const staff = (roles: Role[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...extra,
})

const requester = (who: Requester) => {
  if (who === 'anonymous') return null
  if (who === 'deactivated owner') return staff(['owner'], { active: false })
  return staff([who])
}

const REQUESTERS: Requester[] = [...ROLES, 'anonymous', 'deactivated owner']

async function answers(
  collection: CollectionConfig,
  operation: 'read' | 'create' | 'update' | 'delete',
) {
  const access = collection.access?.[operation] as Access | undefined
  if (!access) throw new Error(`${collection.slug} has no ${operation} rule`)
  const out: Record<string, unknown> = {}
  for (const who of REQUESTERS) {
    out[who] = await access({ req: { user: requester(who) } } as Parameters<Access>[0])
  }
  return out
}

const only = (allowed: Requester[]) =>
  Object.fromEntries(REQUESTERS.map((who) => [who, allowed.includes(who)]))

function fieldNamed(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    if ('fields' in field && Array.isArray(field.fields)) {
      const found = fieldNamed(field.fields as Field[], name)
      if (found) return found
    }
  }
  return undefined
}

function names(fields: Field[]): string[] {
  return fields.flatMap((field) => [
    ...('name' in field ? [field.name] : []),
    ...('fields' in field && Array.isArray(field.fields) ? names(field.fields as Field[]) : []),
  ])
}

describe('the sign-in numbers', () => {
  it('are the ones docs/03 F7 and docs/08 §9 set: six digits, ten minutes, five tries, thirty days', () => {
    expect(SIGN_IN.codeLength).toBe(6)
    expect(SIGN_IN.codeTtlSeconds).toBe(600)
    expect(SIGN_IN.attemptsPerCode).toBe(5)
    expect(SIGN_IN.trustedSessionDays).toBe(30)
  })

  it('limit code requests per address and per network address (docs/12 §5)', () => {
    expect(SIGN_IN_LIMITS.perIdentifier.length).toBeGreaterThan(0)
    expect(SIGN_IN_LIMITS.perNetwork.length).toBeGreaterThan(0)
    // The sign-in cookie outlives the code, so the account step can follow the code step.
    expect(SIGN_IN_COOKIE.maxAgeSeconds).toBeGreaterThan(SIGN_IN.codeTtlSeconds)
    expect(SIGN_IN_COOKIE.path).toBe('/login')
    expect(SESSION_COOKIE_PREFIX).toMatch(/^iiic-/)
  })

  it('keep Better Auth out of Supabase’s own `auth` schema', () => {
    expect(CUSTOMER_AUTH.schema).not.toBe('auth')
    expect(CUSTOMER_AUTH.schema).toMatch(/^[a-z_]+$/)
  })

  it('take a code of six digits only, and an account only with the consent ticked and an adult', () => {
    expect(verifyCodeInput.safeParse({ code: '123456', trustDevice: false }).success).toBe(true)
    expect(verifyCodeInput.safeParse({ code: '12345', trustDevice: false }).success).toBe(false)
    expect(verifyCodeInput.safeParse({ code: '12345a', trustDevice: false }).success).toBe(false)
    const account = {
      fullName: 'Example Person',
      consent: true,
      noticeVersionId: 1,
      adult: true,
      trustDevice: false,
    }
    expect(createAccountInput.safeParse(account).success).toBe(true)
    expect(createAccountInput.safeParse({ ...account, consent: false }).success).toBe(false)
    expect(createAccountInput.safeParse({ ...account, adult: false }).success).toBe(false)
    expect(
      codeRequestInput.safeParse({ channel: 'sms', identifier: 'someone@example.com' }).success,
    ).toBe(false)
  })
})

describe('the collections', () => {
  it('let owners read accounts and nobody write one through the API (D-127)', async () => {
    expect(await answers(Accounts, 'read')).toEqual(only(['owner']))
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(await answers(Accounts, operation)).toEqual(only([]))
    }
  })

  it('let nobody read or write a sign-in request through the API', async () => {
    for (const operation of ['read', 'create', 'update', 'delete'] as const) {
      expect(await answers(SignInRequests, operation)).toEqual(only([]))
    }
  })

  it('keep no address and no code in a sign-in request', () => {
    const held = names(SignInRequests.fields)
    for (const name of ['email', 'mobile', 'address', 'identifier', 'code', 'otp', 'ip']) {
      expect(held).not.toContain(name)
    }
  })

  it('let only the server set the account a person’s record belongs to', async () => {
    const field = fieldNamed(People.fields, 'account') as Field & {
      access?: { create?: FieldAccess; update?: FieldAccess }
    }
    expect(field).toBeDefined()
    const owner = { req: { user: staff(['owner']) } } as unknown as Parameters<FieldAccess>[0]
    expect(await field.access?.create?.(owner)).toBe(false)
    expect(await field.access?.update?.(owner)).toBe(false)
  })
})

describe('the environment', () => {
  const valid = {
    PAYLOAD_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic',
  }

  it('leaves sign-in closed without Better Auth’s secret, and wants 32 characters for it', () => {
    expect(parseEnv(valid).BETTER_AUTH_SECRET).toBeUndefined()
    expect(parseEnv({ ...valid, BETTER_AUTH_SECRET: '' }).BETTER_AUTH_SECRET).toBeUndefined()
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/)
  })

  it('refuses the fixed test code on any Vercel deployment', () => {
    expect(parseEnv({ ...valid, ACCOUNTS_TEST_CODE: '246810' }).ACCOUNTS_TEST_CODE).toBe('246810')
    expect(() =>
      parseEnv({ ...valid, ACCOUNTS_TEST_CODE: '246810', VERCEL_ENV: 'preview' }),
    ).toThrow(/ACCOUNTS_TEST_CODE/)
    expect(() => parseEnv({ ...valid, ACCOUNTS_TEST_CODE: '2468' })).toThrow(/six digits/)
  })

  it('refuses Better Auth’s usage reports', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_TELEMETRY: '1' })).toThrow(
      /BETTER_AUTH_TELEMETRY/,
    )
    expect(() => parseEnv({ ...valid, BETTER_AUTH_TELEMETRY: 'false' })).not.toThrow()
  })
})

describe('the library', () => {
  it('is Better Auth pinned to one exact version (CLAUDE.md #7’s rule for every dependency)', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['better-auth']).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
