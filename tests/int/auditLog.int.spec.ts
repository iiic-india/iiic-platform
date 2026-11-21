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

/** Every account this file creates, by exact address. */
const ACCOUNTS = ['owner', 'editor', 'leaver'].map(email)

async function removeTestAccounts() {
  await payload.delete({ collection: 'users', where: { email: { in: ACCOUNTS } } })
}

/** The entries about one staff account, newest first. */
async function entriesFor(id: number | string) {
  const { docs } = await payload.find({
    collection: 'audit-log',
    where: { entity: { equals: 'users' }, entityId: { equals: String(id) } },
    sort: '-at',
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestAccounts()
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
  await removeTestAccounts()
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
      // Shown in IST in the admin, whatever the browser's zone (CLAUDE.md #8).
      at_tz: 'Asia/Kolkata',
    })
    expect(JSON.stringify(entry)).not.toContain('Renamed')
  })

  it('says nothing when only bookkeeping changed', async () => {
    const before = (await entriesFor(editor.id)).length
    await payload.update({ collection: 'users', id: editor.id, data: { sessions: [] } })
    expect(await entriesFor(editor.id)).toHaveLength(before)
  })

  it('records two-factor set up by the person, which payload-totp stores without the request', async () => {
    // As payload-totp's /api/setup-totp writes it: no user, no request (setSecret.js:55-62).
    await payload.update({
      collection: 'users',
      id: editor.id,
      data: { totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
      overrideAccess: true,
    })
    expect((await entriesFor(editor.id))[0]).toMatchObject({
      action: 'update',
      actorId: String(editor.id),
      actorEmail: email('editor'),
      changed: 'two-factor',
    })
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

  it('records a password reset by the emailed link, which writes past the change hooks', async () => {
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: email('editor') },
      disableEmail: true,
    })
    await payload.resetPassword({
      collection: 'users',
      data: { token: token as string, password: 'test-only-password-audit-reset' },
      overrideAccess: true,
    })
    expect((await entriesFor(editor.id))[0]).toMatchObject({
      action: 'reset-password',
      entity: 'users',
      actorId: String(editor.id),
      changed: 'password',
    })
  })

  it("records an owner's Unlock of a locked account", async () => {
    await payload.db.updateOne({
      collection: 'users',
      id: editor.id,
      data: { loginAttempts: 5, lockUntil: new Date(Date.now() + 60_000).toISOString() },
      returning: false,
    })
    await payload.unlock({
      collection: 'users',
      // Payload's generated type lists a password for every auth operation; unlock reads only
      // the email.
      data: { email: email('editor') } as { email: string; password: string },
      overrideAccess: false,
      req: await createLocalReq({ user: verified(owner) as never }, payload),
    })
    expect((await entriesFor(editor.id))[0]).toMatchObject({
      action: 'unlock',
      actorId: String(owner.id),
    })
  })

  it('records a new password and a deactivation saved together once', async () => {
    const leaver = await payload.create({
      collection: 'users',
      data: { name: 'Fake Leaver', email: email('leaver'), password: PASSWORD, roles: ['editor'] },
    })
    // Deactivating ends the sessions in a nested update with the same request (Users.ts).
    await payload.update({
      collection: 'users',
      id: leaver.id,
      data: { password: 'test-only-password-audit-new', active: false },
      user: verified(owner),
      overrideAccess: false,
    })
    const updates = (await entriesFor(leaver.id)).filter((entry) => entry.action === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ actorId: String(owner.id), changed: 'active, password' })
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
