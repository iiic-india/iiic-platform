// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const notes = vi.hoisted(() => ({
  countNotesForOwner: vi.fn(),
  listOwnNotes: vi.fn(),
  notesAvailable: vi.fn(() => true),
  ownsBooking: vi.fn(),
  readNote: vi.fn(),
  updateNote: vi.fn(),
  writeNote: vi.fn(),
}))
vi.mock('@/lib/notes/notes', () => notes)

const { notesHandlers } = await import('@/lib/notes/endpoints')

// The notes panel's routes (docs/18 §3; CLAUDE.md #6; M7 security review): a practitioner's
// routes refuse anyone else before the query or the body is read, and before the notes module is
// called. Every id is fake.

const staff = (roles: string[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...extra,
})

function request(user: unknown) {
  const json = vi.fn(async () => ({ noteId: 1, body: 'fake words' }))
  const get = vi.fn(() => '1')
  return { req: { user, json, searchParams: { get } } as unknown as PayloadRequest, json, get }
}

describe('the notes routes', () => {
  it('refuse a visitor, a session without the code and every other role before reading input', async () => {
    for (const handler of ['list', 'write', 'update', 'open'] as const) {
      for (const [user, status] of [
        [null, 401],
        [staff(['practitioner'], { _strategy: 'local-jwt' }), 403],
        [staff(['owner']), 403],
        [staff(['operator']), 403],
        [staff(['practitioner'], { active: false }), 403],
      ] as const) {
        const { req, json, get } = request(user)
        const response = await notesHandlers[handler](req)
        expect(response.status, `${handler} ${JSON.stringify(user)}`).toBe(status)
        expect(json).not.toHaveBeenCalled()
        expect(get).not.toHaveBeenCalled()
      }
    }
    for (const call of Object.values(notes)) {
      if (call !== notes.notesAvailable) expect(call).not.toHaveBeenCalled()
    }
  })
})
