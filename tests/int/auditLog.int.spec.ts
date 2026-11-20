import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRecoveryCodes } from '@/lib/auth/recoveryEndpoints'
import { resetTwoFactor } from '@/lib/auth/resetTwoFactor'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// The audit log against the real database (docs/08 §9, D-43). Obviously fake accounts.
let payload: Payload
const email = (label: string) => `int.audit.${label}@example.invalid`
const PASSWORD = 'test-only-password-audit'
let owner: User
let editor: User
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User

/** The entries about one record, newest first. */
async function entriesFor(id: number | string) {
  const { docs } = await payload.find({
    collection: 'audit-log',
    where: { entityId: { equals: String(id) } },
    sort: '-at',
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.audit.' } } })
  owner = await payload.create({
    collection: 'users',
    data: { name: 'Fake Owner', email: email('owner'), password: PASSWORD, roles: ['owner'] },
  })
  editor = await payload.create({
    collection: 'users',
    data: { name: 'Fake Editor', email: email('editor'), password: PASSWORD, roles: ['editor'] },
  })
})

afterAll(async () => {
  await payload.delete({ collection: 'users', where: { email: { like: 'int.audit.' } } })
})

describe('the audit log', () => {
  it('records a new record', async () => {
    const entries = await entriesFor(editor.id)
    expect(entries.at(-1)).toMatchObject({ action: 'create', entity: 'users' })
  })

  it('records who changed which fields, never their values', async () => {
    await payload.update({
      collection: 'users',
      id: editor.id,
      data: { name: 'Fake Editor Renamed' },
      user: verified(owner),
      overrideAccess: false,
    })
    const [entry] = await entriesFor(editor.id)
    expect(entry).toMatchObject({
      action: 'update',
      entity: 'users',
      entityId: String(editor.id),
      actorId: String(owner.id),
      actorEmail: email('owner'),
      changed: 'name',
    })
    expect(JSON.stringify(entry)).not.toContain('Renamed')
  })

  it('says nothing when only bookkeeping changed', async () => {
    const before = (await entriesFor(editor.id)).length
    await payload.update({ collection: 'users', id: editor.id, data: { sessions: [] } })
    expect(await entriesFor(editor.id)).toHaveLength(before)
  })

  it("names an owner's reset of two-factor, and new recovery codes, once each", async () => {
    const reset = await createLocalReq({ user: verified(owner) as never }, payload)
    reset.routeParams = { id: String(editor.id) }
    expect((await resetTwoFactor(reset)).status).toBe(200)
    expect((await entriesFor(editor.id))[0]).toMatchObject({
      action: 'reset-two-factor',
      actorId: String(owner.id),
    })

    const codes = await createLocalReq({ user: verified(editor) as never }, payload)
    expect((await createRecoveryCodes(codes)).status).toBe(200)
    const created = (await entriesFor(editor.id)).filter(
      (entry) => entry.action === 'create-recovery-codes',
    )
    expect(created).toHaveLength(1)
  })

  it('is read by owners only, and changed by nobody through Payload', async () => {
    const [entry] = await entriesFor(editor.id)
    const id = entry?.id ?? 0
    await expect(
      payload.find({ collection: 'audit-log', user: verified(editor), overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'audit-log', user: verified(owner), overrideAccess: false }),
    ).resolves.toBeTruthy()
    await expect(
      payload.update({
        collection: 'audit-log',
        id,
        data: { action: 'edited' },
        user: verified(owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'audit-log', id, user: verified(owner), overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('cannot be changed or deleted in the database either', async () => {
    const [entry] = await entriesFor(editor.id)
    const id = entry?.id ?? 0
    await expect(
      payload.db.drizzle.execute(
        sql`UPDATE "audit_log" SET "action" = 'edited' WHERE "id" = ${id}`,
      ),
    ).rejects.toThrow()
    await expect(
      payload.db.drizzle.execute(sql`DELETE FROM "audit_log" WHERE "id" = ${id}`),
    ).rejects.toThrow()
    const [after] = await entriesFor(editor.id)
    expect(after).toMatchObject({ id, action: entry?.action })
  })
})
