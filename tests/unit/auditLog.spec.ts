// @vitest-environment node
import type { CollectionConfig, Config, Field } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Settings } from '@/globals/Settings'
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

  it('never counts a join, which lists other documents, as this document’s change', () => {
    // A person's consents are a join (src/collections/People.ts): read with its documents
    // after a write and without them before it, whatever the write changed.
    const fields: Field[] = [
      { name: 'city', type: 'text' },
      {
        type: 'row',
        fields: [{ name: 'consents', type: 'join', collection: 'consents', on: 'person' }],
      },
    ]
    const before = { city: 'Fake city', consents: { docs: [], hasNextPage: false } }
    const after = { city: 'Another fake city', consents: { docs: [1, 2], hasNextPage: false } }
    expect(changedFields(after, before, { fields })).toEqual(['city'])
    // A field of the same name that is not a join is compared as any other.
    expect(changedFields(after, before)).toEqual(['city', 'consents'])
  })

  it('names a field inside a named group by both names, however the admin lays them out', () => {
    // Settings keeps its groups inside tabs and rows (src/globals/Settings.ts).
    const fields = Settings.fields
    const before = {
      legal: { gstin: null, grievanceOfficer: { name: 'Fake A', email: null } },
      flags: { pricesPublic: false, payAtBooking: false },
      processors: [],
    }
    const after = {
      legal: {
        gstin: '24AAAAA0000A1Z5',
        grievanceOfficer: { name: 'Fake A', email: 'f@x.invalid' },
      },
      flags: { pricesPublic: true, payAtBooking: false },
      processors: [{ id: 'fake', name: 'Fake processor' }],
    }
    expect(changedFields(after, before, { fields })).toEqual([
      'legal.gstin',
      'legal.grievanceOfficer.email',
      'flags.pricesPublic',
      'processors',
    ])
  })

  it('counts a field a global nobody has saved lacks as empty, when asked to', () => {
    const fields = Settings.fields
    const before = { flags: { pricesPublic: false }, globalType: 'settings' }
    const after = {
      legal: { legalName: 'Fake Proprietor Name', tradeName: null },
      flags: { pricesPublic: false },
      globalType: 'settings',
      updatedAt: 'b',
    }
    expect(changedFields(after, before, { fields })).toEqual([])
    expect(changedFields(after, before, { fields, missingIsEmpty: true })).toEqual([
      'legal.legalName',
    ])
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
/** The person as Payload reads them for an update: hidden fields included, the secret in the clear. */
const STORED = { ...PERSON, totpSecret: 'FAKESTOREDSECRET' }
/** Payload fills every field an update leaves out with its stored value, the hidden secret too. */
const filled = <T extends object>(data: T) => ({ totpSecret: STORED.totpSecret, ...data })

describe('the audit plugin', () => {
  it('records a password set with a deactivation once, not again on the write that ends the sessions', async () => {
    const req = { user: OWNER, context: {} }
    const save = filled({ password: 'test-only-password', active: false })
    const endSessions = filled({ sessions: [] })
    await users('beforeChange')({ data: save, operation: 'update', originalDoc: STORED, req })
    // Payload hashes the password and drops it from the data before the write.
    delete (save as { password?: string }).password
    // Users.ts ends the sessions in a nested update with the same request, whose audit hook
    // runs before the outer one's.
    await users('beforeChange')({
      data: endSessions,
      operation: 'update',
      originalDoc: STORED,
      req,
    })
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
    await users('beforeChange')({
      data,
      operation: 'update',
      originalDoc: { ...PERSON, totpSecret: null },
      req,
    })
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
    const data = filled({ name: 'Fake Renamed' })
    await users('beforeChange')({ data, operation: 'update', originalDoc: STORED, req })
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

  it('does not count the stored secret, which Payload copies into every update, as a change', async () => {
    const req = { user: OWNER, context: {} }
    const data = filled({ name: 'Fake Renamed' })
    await users('beforeChange')({ data, operation: 'update', originalDoc: STORED, req })
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
      [req, { action: 'update', entity: 'users', entityId: PERSON.id, changed: ['name'] }, OWNER],
    ])
  })

  it('records nothing for a write of bookkeeping alone, the stored secret in its data', async () => {
    const req = { user: OWNER, context: {} }
    const data = filled({ loginAttempts: 0 })
    await users('beforeChange')({ data, operation: 'update', originalDoc: STORED, req })
    await users('afterChange')({
      collection: USERS,
      context: req.context,
      data,
      doc: { ...PERSON, loginAttempts: 0 },
      previousDoc: { ...PERSON, loginAttempts: 2 },
      operation: 'update',
      req,
    })
    expect(record).not.toHaveBeenCalled()
  })

  it('names a named action after it, with the secret it cleared', async () => {
    const req = { user: OWNER, context: { auditAction: 'reset-two-factor' } }
    const data = { totpSecret: null, sessions: [] }
    await users('beforeChange')({ data, operation: 'update', originalDoc: STORED, req })
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

  it('records the new collections’ writes, and leaves the analytics events alone', () => {
    const collections = auditLog()({
      collections: ['people', 'consents', 'consent-versions', 'analytics-events'].map((slug) => ({
        slug,
        fields: [],
      })),
    } as unknown as Config).collections
    // Analytics events hold nobody's data and are written for every visitor's step (S0).
    expect(collections?.map((each) => each.hooks?.afterChange?.length ?? 0)).toEqual([1, 1, 1, 0])
  })
})

describe('the audit plugin on a global', () => {
  const [settings, jobs] =
    auditLog()({
      globals: [Settings, { slug: 'payload-jobs-stats', fields: [] }],
    } as unknown as Config).globals ?? []
  const hook = settings?.hooks?.afterChange?.at(-1) as Hook

  it('adds its hook after the global’s own, and leaves Payload’s own global alone', () => {
    expect(settings?.hooks?.afterChange).toHaveLength(
      (Settings.hooks?.afterChange?.length ?? 0) + 1,
    )
    expect(jobs?.hooks?.afterChange ?? []).toHaveLength(0)
  })

  it('records who changed which settings, by name and never by value', async () => {
    const req = { user: OWNER, context: {} }
    await hook({
      context: {},
      doc: { flags: { pricesPublic: true }, legal: { gstin: '24AAAAA0000A1Z5' } },
      previousDoc: { flags: { pricesPublic: false }, legal: { gstin: null } },
      global: Settings,
      req,
    })
    expect(record.mock.calls).toEqual([
      [
        req,
        { action: 'update', entity: 'settings', changed: ['flags.pricesPublic', 'legal.gstin'] },
      ],
    ])
    expect(JSON.stringify(record.mock.calls)).not.toContain('24AAAAA0000A1Z5')
  })

  it('records the first save of a global nobody had saved, field by field', async () => {
    const req = { user: OWNER, context: {} }
    await hook({
      context: {},
      doc: { legal: { legalName: 'Fake Proprietor Name' }, quietHours: { start: '21:00' } },
      previousDoc: { quietHours: { start: '21:00' } },
      global: Settings,
      req,
    })
    expect(record.mock.calls[0]?.[1]).toEqual({
      action: 'update',
      entity: 'settings',
      changed: ['legal.legalName'],
    })
  })

  it('records nothing for a save that changed nothing', async () => {
    const doc = { flags: { pricesPublic: false } }
    await hook({ context: {}, doc, previousDoc: doc, global: Settings, req: { user: OWNER } })
    expect(record).not.toHaveBeenCalled()
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

  it('names the My IIIC account a customer’s request acts for, when it has no user (D-133)', async () => {
    const { recordAudit: write } =
      await vi.importActual<typeof import('@/lib/audit/record')>('@/lib/audit/record')
    const create = vi.fn()
    const customer = {
      user: null,
      context: { auditActor: { id: 'account:10' } },
      headers: new Headers({ 'x-forwarded-for': '203.0.113.11' }),
      payload: { create },
    }
    await write(customer as never, { action: 'create', entity: 'consents', entityId: 5 })
    // A name the caller passes still wins, and null still means no one.
    await write(customer as never, { action: 'create', entity: 'consents', entityId: 6 }, null)
    // A staff user is never replaced by what a context says.
    await write({ ...customer, user: OWNER } as never, { action: 'update', entity: 'people' })
    expect(create.mock.calls.map(([args]) => args.data.actorId)).toEqual([
      'account:10',
      undefined,
      String(OWNER.id),
    ])
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ ip: '203.0.113.11' })
    expect(create.mock.calls[0]?.[0].data.actorEmail).toBeUndefined()
  })
})

describe('the audit plugin on a customer’s write (D-133)', () => {
  const people = auditHooks({ slug: 'people', fields: [{ name: 'city', type: 'text' }] })
  const PEOPLE = { slug: 'people', fields: [{ name: 'city', type: 'text' }] }
  const customer = (auditActor: unknown) => ({ user: null, context: { auditActor } })

  it('names the account the request acts for, on a change and on a deletion', async () => {
    const req = customer({ id: 'account:10' })
    const data = { city: 'Fake city' }
    await people('beforeChange')({ data, operation: 'create', req })
    await people('afterChange')({
      collection: PEOPLE,
      context: req.context,
      data,
      doc: { id: 3, city: 'Fake city' },
      operation: 'create',
      req,
    })
    await people('afterDelete')({ collection: PEOPLE, doc: { id: 3 }, id: 3, req })
    expect(record.mock.calls).toEqual([
      [req, { action: 'create', entity: 'people', entityId: 3, changed: [] }, { id: 'account:10' }],
      [req, { action: 'delete', entity: 'people', entityId: 3 }, { id: 'account:10' }],
    ])
  })

  it('names no one for a context that is not an account’s, and the staff user over any', async () => {
    const forged = customer({ id: 'owner:1' })
    await people('afterDelete')({ collection: PEOPLE, doc: { id: 4 }, id: 4, req: forged })
    const staff = { ...customer({ id: 'account:10' }), user: OWNER }
    await people('afterDelete')({ collection: PEOPLE, doc: { id: 5 }, id: 5, req: staff })
    expect(record.mock.calls.map((call) => call[2])).toEqual([undefined, OWNER])
  })
})
