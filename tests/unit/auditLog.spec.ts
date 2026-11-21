// @vitest-environment node
import type { CollectionConfig, Config } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordAudit } from '@/lib/audit/record'
import { auditLog, changedFields } from '@/plugins/auditLog'

vi.mock('@/lib/audit/record', () => ({ recordAudit: vi.fn() }))
const record = vi.mocked(recordAudit)

beforeEach(() => {
  record.mockClear()
})

describe('changedFields', () => {
  it('names the fields that changed, never their values', () => {
    const before = { id: 1, name: 'Fake A', active: true, roles: ['editor'] }
    const after = { id: 1, name: 'Fake B', active: false, roles: ['editor'] }
    expect(changedFields(after, before)).toEqual(['name', 'active'])
  })

  it('compares lists and objects by content', () => {
    expect(changedFields({ roles: ['owner'] }, { roles: ['editor'] })).toEqual(['roles'])
    expect(changedFields({ roles: ['editor'] }, { roles: ['editor'] })).toEqual([])
  })

  it('ignores bookkeeping, and fields one version does not carry', () => {
    const before = { sessions: [], updatedAt: 'a', loginAttempts: 1, totpSecret: 'x' }
    const after = { sessions: [{ id: 's' }], updatedAt: 'b', loginAttempts: 0 }
    expect(changedFields(after, before)).toEqual([])
  })

  it('calls two-factor by its name', () => {
    expect(changedFields({ hasTotp: true }, { hasTotp: false })).toEqual(['two-factor'])
  })

  it('has nothing to compare on a creation', () => {
    expect(changedFields({ id: 1, name: 'Fake' }, undefined)).toEqual([])
  })
})

type Hook = (args: unknown) => unknown

/** The plugin's own hook of each kind on a collection: it adds one, after any already there. */
function auditHooks(collection: CollectionConfig) {
  const [audited] = auditLog()({ collections: [collection] } as Config).collections ?? []
  const hooks = (audited?.hooks ?? {}) as Record<string, Hook[] | undefined>
  return (kind: string): Hook => {
    const hook = hooks[kind]?.at(-1)
    if (!hook) throw new Error(`The plugin added no ${kind} hook.`)
    return hook
  }
}

const users = auditHooks({ slug: 'users', auth: true, fields: [] })
const USERS = { slug: 'users', auth: {} }
const OWNER = { id: 1, email: 'fake.owner@example.invalid' }
const PERSON = { id: 9, email: 'fake.person@example.invalid' }

describe('the audit plugin', () => {
  it('records a password set with a deactivation once, not again on the write that ends the sessions', async () => {
    const req = { user: OWNER, context: {} }
    const save = { password: 'test-only-password', active: false }
    const endSessions = { sessions: [] }
    await users('beforeChange')({ data: save, operation: 'update', req })
    // Payload hashes the password and drops it from the data before the write.
    delete (save as { password?: string }).password
    // Users.ts ends the sessions in a nested update with the same request, whose audit hook
    // runs before the outer one's.
    await users('beforeChange')({ data: endSessions, operation: 'update', req })
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data: endSessions,
      doc: { ...PERSON, active: false, sessions: [] },
      previousDoc: { ...PERSON, active: false, sessions: [{ id: 's' }] },
      operation: 'update',
      req,
    })
    expect(record).not.toHaveBeenCalled()
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data: save,
      doc: { ...PERSON, active: false },
      previousDoc: { ...PERSON, active: true },
      operation: 'update',
      req,
    })
    expect(record.mock.calls).toEqual([
      [
        req,
        { action: 'update', entity: 'users', entityId: PERSON.id, changed: ['active', 'password'] },
        OWNER,
      ],
    ])
  })

  it('records two-factor set up by the person, whom payload-totp leaves off its write', async () => {
    const req = { user: null, context: {} }
    const data = { totpSecret: 'FAKEFAKEFAKEFAKE' }
    await users('beforeChange')({ data, operation: 'update', req })
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data,
      doc: PERSON,
      previousDoc: PERSON,
      operation: 'update',
      req,
    })
    expect(record).toHaveBeenCalledWith(
      req,
      { action: 'update', entity: 'users', entityId: PERSON.id, changed: ['two-factor'] },
      { id: PERSON.id, email: PERSON.email },
    )
  })

  it('makes nobody the actor of a write without a request that touched no secret', async () => {
    const req = { user: null, context: {} }
    const data = { name: 'Fake Renamed' }
    await users('beforeChange')({ data, operation: 'update', req })
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data,
      doc: { ...PERSON, name: 'Fake Renamed' },
      previousDoc: { ...PERSON, name: 'Fake' },
      operation: 'update',
      req,
    })
    expect(record.mock.calls).toEqual([
      [
        req,
        { action: 'update', entity: 'users', entityId: PERSON.id, changed: ['name'] },
        undefined,
      ],
    ])
  })

  it('names a named action after it, with the secret it cleared', async () => {
    const req = { user: OWNER, context: { auditAction: 'reset-two-factor' } }
    const data = { totpSecret: null, sessions: [] }
    await users('beforeChange')({ data, operation: 'update', req })
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data,
      doc: PERSON,
      previousDoc: PERSON,
      operation: 'update',
      req,
    })
    expect(record).toHaveBeenCalledWith(
      req,
      { action: 'reset-two-factor', entity: 'users', entityId: PERSON.id, changed: ['two-factor'] },
      OWNER,
    )
  })

  it('records a password reset by the emailed link, by the person it signs in', async () => {
    const req = { user: PERSON, context: {} }
    const result = { token: 'fake-token', user: { id: PERSON.id } }
    const returned = await users('afterOperation')({
      args: {},
      collection: USERS,
      operation: 'resetPassword',
      req,
      result,
    })
    expect(returned).toBe(result)
    expect(record.mock.calls).toEqual([
      [
        req,
        { action: 'reset-password', entity: 'users', entityId: PERSON.id, changed: ['password'] },
      ],
    ])
  })

  it("records an owner's Unlock, and not the one a named action runs with access overridden", async () => {
    const findOne = vi.fn().mockResolvedValue({ id: PERSON.id })
    const req = { user: OWNER, context: {}, payload: { db: { findOne } } }
    const unlock = (overrideAccess: boolean) =>
      users('afterOperation')({
        args: { data: { email: ' Fake.Person@Example.invalid ' } },
        collection: USERS,
        operation: 'unlock',
        overrideAccess,
        req,
        result: true,
      })
    expect(await unlock(false)).toBe(true)
    expect(findOne).toHaveBeenCalledWith({
      collection: 'users',
      where: { email: { equals: 'fake.person@example.invalid' } },
      req,
    })
    expect(record.mock.calls).toEqual([
      [req, { action: 'unlock', entity: 'users', entityId: PERSON.id }],
    ])
    record.mockClear()
    expect(await unlock(true)).toBe(true)
    expect(record).not.toHaveBeenCalled()
  })

  it('passes every other operation through untouched', async () => {
    const result = { docs: [] }
    const returned = await users('afterOperation')({
      args: {},
      collection: USERS,
      operation: 'find',
      req: { user: OWNER, context: {} },
      result,
    })
    expect(returned).toBe(result)
    expect(record).not.toHaveBeenCalled()
  })

  it('adds the operation hook to collections with sign-in only', () => {
    const collections = auditLog()({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'pages', fields: [] },
      ],
    } as unknown as Config).collections
    expect(collections?.map((each) => each.hooks?.afterOperation?.length ?? 0)).toEqual([1, 0])
  })
})

describe('recordAudit', () => {
  it('names the actor it is given, or else whoever made the request, and the time zone', async () => {
    const { recordAudit: write } =
      await vi.importActual<typeof import('@/lib/audit/record')>('@/lib/audit/record')
    const create = vi.fn()
    const req = {
      user: OWNER,
      headers: new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
      payload: { create },
    }
    await write(req as never, { action: 'update', entity: 'users', entityId: 9, changed: ['name'] })
    await write(req as never, { action: 'update', entity: 'users', entityId: 9 }, PERSON)
    expect(create.mock.calls.map(([args]) => args.data)).toEqual([
      expect.objectContaining({
        at: expect.any(String),
        at_tz: 'Asia/Kolkata',
        actorId: String(OWNER.id),
        actorEmail: OWNER.email,
        entityId: '9',
        changed: 'name',
        ip: '203.0.113.9',
      }),
      expect.objectContaining({ actorId: String(PERSON.id), actorEmail: PERSON.email }),
    ])
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'audit-log',
      overrideAccess: true,
    })
  })
})
