// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

// The seams between the three account slices (docs/20 §13), once joined: My IIIC's door
// (src/lib/accounts/scope.ts) and the privacy page's seams (src/lib/accounts/privacy/seams.ts)
// hand on slice A's own sign-in, session and lifecycle functions and slice B's `ownPersonIds`,
// the very same functions and no wrapper, so that every page shares A's one request-cached
// session; and no stand-in written for the slices' separate builds is left under src.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

const session = await import('@/lib/accounts/session')
const lifecycle = await import('@/lib/accounts/lifecycle')
const details = await import('@/lib/accounts/details')
const scope = await import('@/lib/accounts/scope')
const seams = await import('@/lib/accounts/privacy/seams')

describe('My IIIC’s door', () => {
  it('hands on slice A’s session, sign-in and sign-out', () => {
    expect(scope.getAccountSession).toBe(session.getAccountSession)
    expect(scope.requireAccount).toBe(session.requireAccount)
    expect(scope.signOut).toBe(session.signOut)
  })
})

describe('the privacy page’s seams', () => {
  it('are slice A’s functions and slice B’s records, and nothing of their own', () => {
    const expected: Record<string, unknown> = {
      getAccountSession: session.getAccountSession,
      requireAccount: session.requireAccount,
      signOut: session.signOut,
      listDevices: session.listDevices,
      signOutEverywhere: session.signOutEverywhere,
      closeAccount: lifecycle.closeAccount,
      requestDetailCode: details.requestDetailCode,
      confirmDetail: details.confirmDetail,
      whatsAppCodesOpen: details.whatsappCodesOpenHere,
      accountRequest: scope.accountRequest,
      accountsOn: scope.accountsOn,
      findOwnBookings: scope.findOwnBookings,
      openMyIiic: scope.openMyIiic,
      ownPersonIds: scope.ownPersonIds,
    }
    expect(Object.keys(seams).sort()).toEqual(Object.keys(expected).sort())
    for (const [name, real] of Object.entries(expected)) {
      expect(seams[name as keyof typeof seams], name).toBe(real)
    }
  })
})

describe('the joined source', () => {
  it('holds no stand-in left from the slices’ separate builds', () => {
    const root = path.join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(name)) files.push(full)
      }
    }
    walk(root)
    const stubs = files.filter((file) => /\bSTUB\b/.test(readFileSync(file, 'utf8')))
    expect(stubs.map((file) => path.relative(process.cwd(), file))).toEqual([])
  })
})
