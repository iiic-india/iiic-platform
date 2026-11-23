// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { ERASURE_CONTEXT, incidentRules, requestRules } from '@/lib/privacy/hooks'
import { MOVE_MESSAGES, refusedMove, type RequestState } from '@/lib/privacy/requestMoves'

// The moves of a privacy request and the clocks set on save (docs/18 §5): what the office may do
// from the form, what only an owner's confirmation does, and the deadlines set when a request or an
// incident is recorded.

const state = (over: Partial<RequestState> = {}): RequestState => ({
  type: 'access',
  status: 'received',
  ...over,
})

describe('a request’s moves', () => {
  it('walks received, acknowledged, verified, preparing, closed', () => {
    expect(refusedMove(state(), state({ status: 'acknowledged' }))).toBeNull()
    expect(
      refusedMove(
        state({ status: 'acknowledged' }),
        state({
          status: 'verified',
          verifiedAt: '2027-01-01T00:00:00Z',
          verificationMethod: 'oneTimeCode',
        }),
      ),
    ).toBeNull()
    expect(refusedMove(state({ status: 'verified' }), state({ status: 'preparing' }))).toBeNull()
    expect(
      refusedMove(
        state({ status: 'preparing' }),
        state({ status: 'closed', resolution: { outcome: 'fulfilled' } }),
      ),
    ).toBeNull()
  })

  it('needs the identity check recorded to mark it verified', () => {
    expect(
      refusedMove(
        state({ status: 'acknowledged' }),
        state({ status: 'verified', verifiedAt: '2027-01-01' }),
      ),
    ).toBe(MOVE_MESSAGES.verifyFirst)
  })

  it('skips no step and never goes back to received', () => {
    expect(refusedMove(state(), state({ status: 'preparing' }))).toMatch(/cannot go from/)
    expect(refusedMove(state({ status: 'verified' }), state({ status: 'received' }))).toMatch(
      /cannot go from/,
    )
  })

  it('closes with an outcome, and a reason when refused or done in part', () => {
    const preparing = state({ status: 'preparing' })
    expect(refusedMove(preparing, state({ status: 'closed' }))).toBe(MOVE_MESSAGES.outcome)
    expect(
      refusedMove(preparing, state({ status: 'closed', resolution: { outcome: 'partly' } })),
    ).toBe(MOVE_MESSAGES.reason)
    expect(
      refusedMove(
        state(),
        state({ status: 'closed', resolution: { outcome: 'refused', note: 'Fake reason.' } }),
      ),
    ).toBeNull()
    expect(
      refusedMove(state(), state({ status: 'closed', resolution: { outcome: 'withdrawn' } })),
    ).toBeNull()
  })

  it('lets a withdrawal or a correction close from verified, and nothing else', () => {
    const closed = (type: RequestState['type']) =>
      refusedMove(
        state({ type, status: 'verified' }),
        state({ type, status: 'closed', resolution: { outcome: 'fulfilled' } }),
      )
    expect(closed('withdrawal')).toBeNull()
    expect(closed('correction')).toBeNull()
    expect(closed('access')).toBe(MOVE_MESSAGES.notReady)
  })

  it('sends only an erasure to an owner, and only the owner’s confirmation closes it as done', () => {
    const erasure = (over: Partial<RequestState>) => state({ type: 'erasure', ...over })
    expect(
      refusedMove(erasure({ status: 'preparing' }), erasure({ status: 'awaitingOwner' })),
    ).toBeNull()
    expect(refusedMove(state({ status: 'preparing' }), state({ status: 'awaitingOwner' }))).toBe(
      MOVE_MESSAGES.awaitingOwnerErasureOnly,
    )
    const done = erasure({ status: 'closed', resolution: { outcome: 'fulfilled' } })
    expect(refusedMove(erasure({ status: 'awaitingOwner' }), done)).toBe(
      MOVE_MESSAGES.erasureByOwner,
    )
    expect(refusedMove(erasure({ status: 'preparing' }), done, { byErasure: true })).toBe(
      MOVE_MESSAGES.erasureByOwner,
    )
    expect(refusedMove(erasure({ status: 'awaitingOwner' }), done, { byErasure: true })).toBeNull()
    expect(
      refusedMove(erasure({ status: 'awaitingOwner' }), erasure({ status: 'preparing' })),
    ).toBeNull()
  })

  it('keeps a closed request closed', () => {
    expect(refusedMove(state({ status: 'closed' }), state({ status: 'preparing' }))).toBe(
      MOVE_MESSAGES.closedStays,
    )
  })
})

/** Runs a beforeChange hook as Payload would, with the parts these hooks read. */
const run = (
  hook: typeof requestRules,
  args: {
    data: Record<string, unknown>
    operation: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    context?: Record<string, unknown>
  },
) =>
  hook({
    collection: {} as never,
    context: args.context ?? {},
    data: args.data,
    operation: args.operation,
    originalDoc: args.originalDoc as never,
    req: {} as PayloadRequest,
  }) as Record<string, unknown>

describe('the clocks set on save', () => {
  it('records a new request as received, with both clocks from its kind and receipt', () => {
    const saved = run(requestRules, {
      operation: 'create',
      data: {
        type: 'consumerComplaint',
        status: 'closed',
        receivedAt: '2027-01-31T04:30:00.000Z',
        acknowledgeBy: '2099-01-01T00:00:00.000Z',
      },
    })
    expect(saved.status).toBe('received')
    expect(saved.acknowledgeBy).toBe('2027-02-02T04:30:00.000Z')
    expect(saved.resolveBy).toBe('2027-02-28T04:30:00.000Z')
    expect(saved.resolveBy_tz).toBe('Asia/Kolkata')
  })

  it('leaves the clocks alone on a save that changes neither the kind nor the time received', () => {
    const originalDoc = {
      type: 'access',
      status: 'received',
      receivedAt: '2027-01-10T04:30:00.000Z',
      acknowledgeBy: '2027-01-12T04:30:00.000Z',
      resolveBy: '2027-02-09T04:30:00.000Z',
    }
    const saved = run(requestRules, {
      operation: 'update',
      originalDoc,
      data: { ...originalDoc, status: 'acknowledged' },
    })
    expect(saved.resolveBy).toBe(originalDoc.resolveBy)
    expect(typeof saved.acknowledgedAt).toBe('string')
  })

  it('works the clocks out again when the time received is corrected', () => {
    const originalDoc = {
      type: 'access',
      status: 'received',
      receivedAt: '2027-01-10T04:30:00.000Z',
      resolveBy: '2027-02-09T04:30:00.000Z',
    }
    const saved = run(requestRules, {
      operation: 'update',
      originalDoc,
      data: { ...originalDoc, receivedAt: '2027-01-11T04:30:00.000Z' },
    })
    expect(saved.resolveBy).toBe('2027-02-10T04:30:00.000Z')
  })

  it('refuses a move the table does not allow, with the reason on the status field', () => {
    const originalDoc = {
      type: 'erasure',
      status: 'awaitingOwner',
      receivedAt: '2027-01-10T04:30:00.000Z',
    }
    const closing = { ...originalDoc, status: 'closed', resolution: { outcome: 'fulfilled' } }
    expect(() => run(requestRules, { operation: 'update', originalDoc, data: closing })).toThrow()
    const confirmed = run(requestRules, {
      operation: 'update',
      originalDoc,
      data: closing,
      context: { [ERASURE_CONTEXT]: true },
    })
    expect((confirmed.resolution as { closedAt?: string }).closedAt).toBeTruthy()
  })

  it('sets an incident’s CERT-In and Board deadlines from its detection', () => {
    const saved = run(incidentRules, {
      operation: 'create',
      data: {
        title: 'Fake incident',
        detectedAt: '2027-06-01T17:10:00.000Z',
        certIn: { reportable: true },
      },
    })
    expect(saved.certIn).toEqual({
      reportable: true,
      dueAt: '2027-06-01T23:10:00.000Z',
      dueAt_tz: 'Asia/Kolkata',
    })
    expect((saved.board as { dueAt: string }).dueAt).toBe('2027-06-04T17:10:00.000Z')
  })
})
