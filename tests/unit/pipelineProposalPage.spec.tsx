// @vitest-environment node
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { err, ok } from '@/lib/result'

// A proposal's tracked link (docs/17 §5): the page shows the title, the client and the reference
// and a link to the PDF, counts nothing, is never indexed and sends no referrer; every closed or
// unknown link reads alike; the PDF's own address counts the opening and sends a closed link back
// to the page. The proposal actions are faked; the token below is obviously fake.

const actions = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn() }))
vi.mock('@/lib/pipeline/proposal/wiring', () => ({ proposals: () => actions }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({ logger: { error: vi.fn() } }),
  createLocalReq: async () => ({}),
}))

const { default: ProposalLinkPage, metadata } =
  await import('@/app/(platform)/(default)/p/[token]/page')
const { GET } = await import('@/app/(platform)/(default)/p/[token]/pdf/route')

const TOKEN = 'FakeToken0123456789FakeToken0123456789abcde'
const params = (token: string) => ({ params: Promise.resolve({ token }) })
const draw = async (token: string) =>
  renderToStaticMarkup((await ProposalLinkPage(params(token))) as ReactElement)

beforeEach(() => {
  actions.read.mockReset()
  actions.open.mockReset()
})

describe('the tracked link’s page', () => {
  it('is never indexed or followed, and sends no referrer', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
    expect(metadata.alternates).toBeUndefined()
  })

  it('shows the title, the client, the reference and the way to the PDF, and counts nothing', async () => {
    actions.read.mockResolvedValueOnce(
      ok({ title: 'Fake proposal', clientName: 'Fake Org', reference: 'IIIC-P-00001 v1' }),
    )
    const html = await draw(TOKEN)
    expect(html).toContain('<h1>Fake proposal</h1>')
    expect(html).toContain('Prepared for Fake Org')
    expect(html).toContain('Reference IIIC-P-00001 v1')
    expect(html).toContain(`href="/p/${TOKEN}/pdf"`)
    expect(actions.open).not.toHaveBeenCalled()
  })

  it('reads alike for every closed or unknown link', async () => {
    actions.read.mockResolvedValue(err({ code: 'link-closed' }))
    const closed = await draw(TOKEN)
    const unknown = await draw('nonsense')
    expect(closed).toBe(unknown)
    expect(closed).toContain('This link no longer opens a proposal')
    expect(closed).not.toContain('/pdf')
  })
})

describe('the tracked link’s PDF', () => {
  const get = (token: string) => GET(new Request(`http://localhost/p/${token}/pdf`), params(token))

  it('counts the opening and serves the PDF, never cached and never indexed', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 fake')
    actions.open.mockResolvedValueOnce(ok({ versionId: 1, pdf, filename: 'IIIC-P-00001-v1.pdf' }))
    const response = await get(TOKEN)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(actions.open).toHaveBeenCalledWith(expect.anything(), {
      token: TOKEN,
      now: expect.any(Date),
    })
  })

  it('sends a closed link back to its page, and a malformed one home without a lookup', async () => {
    actions.open.mockResolvedValueOnce(err({ code: 'link-closed' }))
    const closed = await get(TOKEN)
    expect(closed.status).toBe(303)
    expect(closed.headers.get('Location')).toBe(`/p/${TOKEN}`)
    const malformed = await get('not-a-token')
    expect(malformed.status).toBe(303)
    expect(malformed.headers.get('Location')).toBe('/')
    expect(actions.open).toHaveBeenCalledTimes(1)
  })
})
