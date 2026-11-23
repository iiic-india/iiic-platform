// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CERTIFICATE_ANSWERS,
  CERTIFICATES_COPY,
} from '@/components/admin/certificates/certificatesCopy'
import type { CertificateError } from '@/lib/certificates/contract'
import { certificateEmitterFor, CERTIFICATE_LISTENERS } from '@/lib/certificates/events'
import { VERIFY_COPY } from '@/lib/certificates/verifyCopy'

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

// The certificate routes (docs/18 §4; CLAUDE.md #6): each refuses anonymous, code-less and
// wrong-role requests before it reads the body or calls the module; answers carry the admin's
// words with the right status; the words never call a certificate a degree or diploma or imply
// recognition (CLAUDE.md #9); and C5's event carries the row's id only.

const session = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createPayloadRequest: vi.fn(
    async () => ({ user: session.user, context: {}, payload: {} }) as unknown as PayloadRequest,
  ),
}))

const actions = vi.hoisted(() => ({
  preview: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  reissue: vi.fn(),
  download: vi.fn(),
}))
vi.mock('@/lib/certificates/wiring', () => ({
  certificateActions: () => actions,
  RENDERER_WIRED: false,
}))

const staff = (roles: string[], strategy = 'totp') => ({
  id: 7,
  collection: 'users',
  _strategy: strategy,
  roles,
})

/** A request whose body records whether anything read it. */
function post(path: string, body: unknown) {
  const request = new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const read = vi.spyOn(request, 'text')
  return { request, read }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  session.user = null
  for (const action of Object.values(actions)) action.mockReset()
})

describe('the routes refuse before they read anything', () => {
  const cases: [string, unknown, number][] = [
    ['no one signed in', null, 401],
    ['staff without the code', staff(['owner'], 'local-jwt'), 403],
    ['an editor', staff(['editor']), 403],
    ['finance', staff(['finance']), 403],
  ]

  it.each(cases)('%s gets %i from every route', async (_who, user, status) => {
    session.user = user
    const { POST: preview } = await import('@/app/api/certificates/preview/route')
    const { POST: issue } = await import('@/app/api/certificates/issue/route')
    const { POST: revoke } = await import('@/app/api/certificates/[id]/revoke/route')
    const { POST: reissue } = await import('@/app/api/certificates/[id]/reissue/route')
    const { GET: pdf } = await import('@/app/api/certificates/[id]/pdf/route')
    const { GET: recipients } = await import('@/app/api/certificates/recipients/route')

    const bodies = [
      post('/api/certificates/preview', {}),
      post('/api/certificates/issue', {}),
      post('/api/certificates/1/revoke', { reason: 'Example reason' }),
      post('/api/certificates/1/reissue', { reason: 'Example reason' }),
    ]
    const answers = [
      await preview(bodies[0]!.request),
      await issue(bodies[1]!.request),
      await revoke(bodies[2]!.request, params('1')),
      await reissue(bodies[3]!.request, params('1')),
      await pdf(new Request('http://localhost:3000/api/certificates/1/pdf'), params('1')),
      await recipients(new Request('http://localhost:3000/api/certificates/recipients?q=Ex')),
    ]
    for (const answer of answers) {
      expect(answer.status).toBe(status)
      expect(answer.headers.get('Cache-Control')).toContain('no-store')
      expect(answer.headers.get('X-Robots-Tag')).toContain('noindex')
    }
    for (const { read } of bodies) expect(read).not.toHaveBeenCalled()
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
  })

  it('lets the operator issue but not revoke or reissue', async () => {
    session.user = staff(['operator'])
    actions.issue.mockResolvedValue({
      ok: true,
      value: [{ id: 5, certificateId: 'IIIC-C-2099-0001-6' }],
    })
    const { POST: issue } = await import('@/app/api/certificates/issue/route')
    const { POST: revoke } = await import('@/app/api/certificates/[id]/revoke/route')
    const issued = await issue(post('/api/certificates/issue', { recipients: [] }).request)
    expect(issued.status).toBe(200)
    expect(await issued.json()).toMatchObject({ message: 'Issued IIIC-C-2099-0001-6.' })
    const refused = post('/api/certificates/5/revoke', { reason: 'Example reason' })
    expect((await revoke(refused.request, params('5'))).status).toBe(403)
    expect(refused.read).not.toHaveBeenCalled()
    expect(actions.revoke).not.toHaveBeenCalled()
  })

  it('hands the reissue only the fields that were filled in', async () => {
    session.user = staff(['owner'])
    actions.reissue.mockResolvedValue({ ok: true, value: { id: 6, certificateId: 'X' } })
    const { POST: reissue } = await import('@/app/api/certificates/[id]/reissue/route')
    await reissue(
      post('/api/certificates/5/reissue', {
        reason: 'Name misspelt (fake)',
        nameAsPrinted: 'Example Corrected',
        programmeName: '',
        completedOn: ' ',
      }).request,
      params('5'),
    )
    expect(actions.reissue).toHaveBeenCalledWith(expect.anything(), {
      reason: 'Name misspelt (fake)',
      nameAsPrinted: 'Example Corrected',
      certificateId: 5,
    })
  })

  it('sends the PDF as an attachment named by its ID, never cached', async () => {
    session.user = staff(['operator'])
    actions.download.mockResolvedValue({
      ok: true,
      value: { certificateId: 'IIIC-C-2099-0001-6', pdf: new TextEncoder().encode('%PDF-1.7') },
    })
    const { GET: pdf } = await import('@/app/api/certificates/[id]/pdf/route')
    const answer = await pdf(
      new Request('http://localhost:3000/api/certificates/5/pdf'),
      params('5'),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers.get('Content-Type')).toBe('application/pdf')
    expect(answer.headers.get('Content-Disposition')).toBe(
      'attachment; filename="IIIC-C-2099-0001-6.pdf"',
    )
    expect(answer.headers.get('Cache-Control')).toContain('no-store')
  })
})

describe('what the routes answer', () => {
  it('gives each refusal its status and the admin’s words', async () => {
    const { answerFor } = await import('@/lib/certificates/http')
    const cases: [CertificateError, number][] = [
      [{ code: 'refused', refusal: { status: 401, code: 'sign-in' } }, 401],
      [{ code: 'invalid', issues: ['recipients: Required'] }, 400],
      [{ code: 'person-not-found', personIds: [3, 4] }, 404],
      [{ code: 'not-found' }, 404],
      [{ code: 'signatory-missing' }, 409],
      [{ code: 'already-revoked' }, 409],
      [{ code: 'storage-missing' }, 503],
      [{ code: 'render-failed' }, 503],
    ]
    for (const [error, status] of cases) {
      const answer = answerFor(error)
      expect(answer.status).toBe(status)
      expect(answer.message.length).toBeGreaterThan(0)
    }
    expect(answerFor({ code: 'invalid', issues: ['recipients: Required'] }).message).toContain(
      'recipients: Required',
    )
  })
})

describe('the words (CLAUDE.md #9; VOICE.md)', () => {
  /** Every string the screens and pages can show, the functions called with a sample. */
  const strings = (copy: Record<string, unknown>): string[] =>
    Object.values(copy).flatMap((value) => {
      if (typeof value === 'string') return [value]
      if (typeof value === 'function') {
        return [String((value as (...args: unknown[]) => unknown)(['IIIC-C-2099-0001-6'], 2))]
      }
      if (value && typeof value === 'object') return strings(value as Record<string, unknown>)
      return []
    })

  it('never call a certificate a degree or diploma, or imply recognition', () => {
    const all = [
      ...strings(CERTIFICATES_COPY),
      ...strings(CERTIFICATE_ANSWERS),
      ...strings(VERIFY_COPY),
    ].join('\n')
    expect(all).not.toMatch(
      /\b(degree|diploma|university|accredit\w*|recognis\w*|recogniz\w*|approved|therap\w*|clinical)\b/i,
    )
    expect(all).not.toContain('!')
  })
})

describe('the certificate.issued event (C5)', () => {
  it('queues nothing until M6 adds C5’s task', async () => {
    expect(CERTIFICATE_LISTENERS['certificate.issued']).toEqual([])
  })

  it('queues each listener once with the id and its key, never a name or token', async () => {
    const queue = vi.fn(async () => ({}))
    const req = { payload: { jobs: { queue } } } as unknown as PayloadRequest
    await certificateEmitterFor({ 'certificate.issued': ['C5-certificate-email'] })(req, {
      name: 'certificate.issued',
      certificateId: 42,
    })
    expect(queue).toHaveBeenCalledWith({
      task: 'C5-certificate-email',
      input: { name: 'certificate.issued', certificateId: 42, key: 'certificate.issued:42' },
      req,
    })
  })
})
