// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { changedFields } from '@/plugins/auditLog'

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
