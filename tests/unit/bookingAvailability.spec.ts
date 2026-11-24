// @vitest-environment node
import { ValidationError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { AvailabilityExceptions } from '@/collections/AvailabilityExceptions'
import { AvailabilityRules } from '@/collections/AvailabilityRules'
import { ownProfileOnly } from '@/lib/booking/availabilityHooks'

// The own-profile check for working hours and exceptions (docs/16 §12; docs/05: a practitioner
// keeps their own availability). Fake ids only: profile 10 is staff account 1's, 20 is 2's.

type Args = Parameters<typeof ownProfileOnly>[0]

const profiles: Record<number, { id: number; staff: number }> = {
  10: { id: 10, staff: 1 },
  20: { id: 20, staff: 2 },
}

function run(user: unknown, data: Record<string, unknown>, originalDoc?: Record<string, unknown>) {
  const findByID = vi.fn(async ({ id }: { id: number }) => {
    const profile = profiles[id]
    if (!profile) throw new Error('not found')
    return profile
  })
  return ownProfileOnly({
    collection: AvailabilityRules as never,
    context: {},
    data,
    operation: originalDoc ? 'update' : 'create',
    originalDoc,
    req: { user, payload: { findByID } } as never,
  } as Args)
}

const practitioner = (id: number) => ({ id, roles: ['practitioner'], active: true })

describe('working hours on one’s own profile only', () => {
  it('runs before every change to hours and exceptions', () => {
    expect(AvailabilityRules.hooks?.beforeChange).toContain(ownProfileOnly)
    expect(AvailabilityExceptions.hooks?.beforeChange).toContain(ownProfileOnly)
  })

  it('lets the office and owners set anyone’s, and the server write freely', async () => {
    for (const roles of [['owner'], ['operator']]) {
      await expect(run({ id: 9, roles, active: true }, { practitioner: 20 })).resolves.toEqual({
        practitioner: 20,
      })
    }
    await expect(run(null, { practitioner: 20 })).resolves.toEqual({ practitioner: 20 })
  })

  it('lets a practitioner set their own', async () => {
    await expect(run(practitioner(1), { practitioner: 10 })).resolves.toEqual({ practitioner: 10 })
    await expect(run(practitioner(1), { spans: [] }, { practitioner: 10 })).resolves.toEqual({
      spans: [],
    })
  })

  it('refuses another’s profile, a move to it, and an entry with no profile', async () => {
    await expect(run(practitioner(1), { practitioner: 20 })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      run(practitioner(1), { practitioner: 20 }, { practitioner: 10 }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(run(practitioner(1), {})).rejects.toBeInstanceOf(ValidationError)
    await expect(run(practitioner(1), { practitioner: 99 })).rejects.toBeInstanceOf(ValidationError)
  })
})
