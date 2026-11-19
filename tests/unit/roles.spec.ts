import { describe, expect, it } from 'vitest'

import { hasRole, isActive, ROLES } from '@/access/roles'

describe('roles', () => {
  it('lists the five staff roles from docs/05', () => {
    expect(ROLES).toEqual(['owner', 'operator', 'practitioner', 'editor', 'finance'])
  })

  it('matches any of the requested roles', () => {
    expect(hasRole({ roles: ['editor'] }, 'owner', 'editor')).toBe(true)
    expect(hasRole({ roles: ['finance'] }, 'owner', 'editor')).toBe(false)
  })

  it('denies anonymous requests and users without roles', () => {
    expect(hasRole(null, 'owner')).toBe(false)
    expect(hasRole(undefined, 'owner')).toBe(false)
    expect(hasRole({ roles: [] }, 'owner')).toBe(false)
    expect(hasRole({ roles: null }, 'owner')).toBe(false)
  })

  it('gives a deactivated account no role at all', () => {
    expect(hasRole({ roles: ['owner'], active: false }, 'owner')).toBe(false)
    expect(isActive({ roles: ['owner'], active: false })).toBe(false)
    // Accounts created before the active flag existed count as active.
    expect(hasRole({ roles: ['owner'], active: null }, 'owner')).toBe(true)
    expect(isActive(null)).toBe(false)
  })
})
