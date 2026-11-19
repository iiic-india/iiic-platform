// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  endSessionsOnDeactivation,
  keepAnActiveOwner,
  refuseDeactivated,
} from '@/collections/Users'

type Args<T extends (...args: never[]) => unknown> = Parameters<T>[0]

describe('refuseDeactivated', () => {
  it('refuses to sign in a deactivated account', () => {
    expect(() =>
      refuseDeactivated({ user: { id: 1, active: false } } as Args<typeof refuseDeactivated>),
    ).toThrow(expect.objectContaining({ status: 403 }))
  })

  it('lets an active account (or one from before the flag) sign in', () => {
    for (const active of [true, null, undefined]) {
      const user = { id: 1, active }
      expect(refuseDeactivated({ user } as Args<typeof refuseDeactivated>)).toBe(user)
    }
  })
})

describe('keepAnActiveOwner', () => {
  const owner = { id: 1, roles: ['owner'], active: true }
  function run(data: Record<string, unknown>, otherActiveOwners: number, originalDoc = owner) {
    const count = vi.fn(async () => ({ totalDocs: otherActiveOwners }))
    const result = keepAnActiveOwner({
      data,
      operation: 'update',
      originalDoc,
      req: { payload: { count } },
    } as unknown as Args<typeof keepAnActiveOwner>)
    return { result, count }
  }

  it('refuses to deactivate the last active owner', async () => {
    await expect(run({ active: false }, 0).result).rejects.toMatchObject({ status: 400 })
  })

  it('refuses to take the owner role from the last active owner', async () => {
    await expect(run({ roles: ['editor'] }, 0).result).rejects.toMatchObject({ status: 400 })
  })

  it('allows either while another active owner remains', async () => {
    await expect(run({ active: false }, 1).result).resolves.toEqual({ active: false })
    await expect(run({ roles: ['editor'] }, 2).result).resolves.toEqual({ roles: ['editor'] })
  })

  it('does not count owners for changes that keep the owner active', async () => {
    const { result, count } = run({ name: 'New name' }, 0)
    await expect(result).resolves.toEqual({ name: 'New name' })
    expect(count).not.toHaveBeenCalled()
  })

  it('leaves changes to other staff alone', async () => {
    const editor = { id: 2, roles: ['editor'], active: true }
    const { result, count } = run({ active: false }, 0, editor)
    await expect(result).resolves.toEqual({ active: false })
    expect(count).not.toHaveBeenCalled()
  })
})

describe('endSessionsOnDeactivation', () => {
  function run(previous: boolean | null | undefined, next: boolean, operation = 'update') {
    const update = vi.fn(async () => ({}))
    const doc = { id: 5, active: next }
    const result = endSessionsOnDeactivation({
      doc,
      operation,
      previousDoc: { id: 5, active: previous },
      req: { payload: { update } },
    } as unknown as Args<typeof endSessionsOnDeactivation>)
    return { result, update, doc }
  }

  it('clears every session when an account is deactivated, overriding field access', async () => {
    const { result, update, doc } = run(true, false)
    await expect(result).resolves.toBe(doc)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 5,
        data: { sessions: [] },
        overrideAccess: true,
      }),
    )
  })

  it('does nothing when the account stays active or was already deactivated', async () => {
    expect(run(true, true).update).not.toHaveBeenCalled()
    expect(run(false, false).update).not.toHaveBeenCalled()
    expect(run(undefined, true).update).not.toHaveBeenCalled()
  })
})
