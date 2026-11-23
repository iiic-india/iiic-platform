// @vitest-environment node
import type { Metadata } from 'next'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({ findByID: async () => ({ text: 'Fake notice the person saw.' }) }),
  createLocalReq: async () => ({}),
}))
vi.mock('@/components/site/Preview', () => ({ Preview: () => null }))
vi.mock('@/lib/privacy/consents', () => ({ currentNotice: vi.fn() }))
vi.mock('@/lib/newsletter/subscriptions', () => ({ findByToken: vi.fn() }))
vi.mock('@/lib/newsletter/withdrawals', () => ({ consentsInForce: vi.fn() }))
vi.mock('@/lib/automations/operations/core', () => ({ verifySignedLink: vi.fn() }))

import ConfirmPage, {
  metadata as confirmMetadata,
} from '@/app/(platform)/newsletter/confirm/[token]/page'
import NewsletterPage, { metadata as signupMetadata } from '@/app/(platform)/newsletter/page'
import UnsubscribePage, {
  metadata as unsubscribeMetadata,
} from '@/app/(platform)/newsletter/unsubscribe/[token]/page'
import WithdrawPage, { metadata as withdrawMetadata } from '@/app/(platform)/w/[token]/page'
import { verifySignedLink } from '@/lib/automations/operations/core'
import { CONFIRM_COPY, SIGNUP_COPY, UNSUBSCRIBE_COPY, WITHDRAW_COPY } from '@/lib/newsletter/copy'
import { findByToken } from '@/lib/newsletter/subscriptions'
import { consentsInForce } from '@/lib/newsletter/withdrawals'
import { currentNotice } from '@/lib/privacy/consents'
import type { ConsentVersion, Subscriber } from '@/payload-types'

// The newsletter's pages and the withdraw page (docs/19 §8; D-10; docs/08 §3): what each offers
// the person and what it never does. Opening a link changes nothing; each page has one plain
// form; nothing is ticked for the person. The records and the core are faked; fake words only.
const TOKEN = 'A'.repeat(43)
const LINK = 'fake.signed.link-token-value'
const html = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element)
const search = (state?: string) => Promise.resolve(state ? { state } : {})

beforeEach(() => {
  vi.mocked(currentNotice).mockReset()
  vi.mocked(findByToken).mockReset()
  vi.mocked(verifySignedLink).mockReset()
  vi.mocked(consentsInForce).mockReset()
})

describe('the signup page, /newsletter', () => {
  it('shows the notice in force above one plain form, with no checkbox', async () => {
    vi.mocked(currentNotice).mockResolvedValue({ text: 'Fake notice in force.' } as ConsentVersion)
    const page = await html(NewsletterPage({ searchParams: search() }))
    expect(page).toContain('action="/api/newsletter"')
    expect(page).toContain('method="post"')
    expect(page).toContain('Fake notice in force.')
    expect(page).not.toContain('type="checkbox"')
    expect(page).toContain('Candidate copy')
  })

  it('does not ask while no notice is in force', async () => {
    vi.mocked(currentNotice).mockResolvedValue(null)
    const page = await html(NewsletterPage({ searchParams: search() }))
    expect(page).not.toContain('<form')
    expect(page).toContain(SIGNUP_COPY.closed)
  })

  it('names the wrong field in an error summary and marks it', async () => {
    vi.mocked(currentNotice).mockResolvedValue({ text: 'Fake notice.' } as ConsentVersion)
    const page = await html(NewsletterPage({ searchParams: search('invalid') }))
    expect(page).toContain('iiic-error-summary')
    expect(page).toContain('role="alert"')
    expect(page).toContain('aria-invalid="true"')
  })

  it('after a signup, says the same thing for every address and shows no form', async () => {
    vi.mocked(currentNotice).mockResolvedValue({ text: 'Fake notice.' } as ConsentVersion)
    const page = await html(NewsletterPage({ searchParams: search('sent') }))
    expect(page).toContain(SIGNUP_COPY.sent)
    expect(page).not.toContain('<form')
  })

  it('has its own canonical address', () => {
    expect((signupMetadata as Metadata).alternates?.canonical).toBe('/newsletter')
  })
})

describe('the pages reached by a private link', () => {
  it('are never listed and never pass the link on', () => {
    for (const metadata of [confirmMetadata, unsubscribeMetadata, withdrawMetadata]) {
      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(metadata.referrer).toBe('no-referrer')
      expect(metadata.alternates).toBeUndefined()
    }
  })
})

describe('the confirmation page', () => {
  const params = Promise.resolve({ token: TOKEN })

  it('confirms nothing when opened: it shows the notice and a button that posts the token', async () => {
    vi.mocked(findByToken).mockResolvedValue({
      id: 7,
      status: 'pending',
      notice: 3,
      confirmExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as Subscriber)
    const page = await html(ConfirmPage({ params }))
    expect(page).toContain('action="/api/newsletter/confirm"')
    expect(page).toContain(`value="${TOKEN}"`)
    expect(page).toContain('Fake notice the person saw.')
    expect(page).toContain(CONFIRM_COPY.button)
  })

  it('offers a new signup for a link that is unknown or has lapsed, and no button', async () => {
    vi.mocked(findByToken).mockResolvedValue(null)
    expect(await html(ConfirmPage({ params }))).toContain(CONFIRM_COPY.invalid)
    vi.mocked(findByToken).mockResolvedValue({
      id: 7,
      status: 'pending',
      confirmExpiresAt: new Date(Date.now() - 1000).toISOString(),
    } as Subscriber)
    const lapsed = await html(ConfirmPage({ params }))
    expect(lapsed).toContain(CONFIRM_COPY.expired)
    expect(lapsed).not.toContain('<form')
  })
})

describe('the unsubscribe page', () => {
  it('shows one button and no question for a good link', async () => {
    vi.mocked(verifySignedLink).mockResolvedValue({ ok: true, value: { subjectId: 7 } })
    const page = await html(UnsubscribePage({ params: Promise.resolve({ token: LINK }) }))
    expect(page).toContain('action="/api/newsletter/unsubscribe"')
    expect(page).toContain(UNSUBSCRIBE_COPY.button)
    expect(verifySignedLink).toHaveBeenCalledWith('unsubscribe', LINK)
  })

  it('says how else to leave when the link does not work', async () => {
    vi.mocked(verifySignedLink).mockResolvedValue({ ok: false, error: { code: 'invalid' } })
    const page = await html(UnsubscribePage({ params: Promise.resolve({ token: LINK }) }))
    expect(page).toContain(UNSUBSCRIBE_COPY.invalid)
    expect(page).not.toContain('<form')
  })
})

describe('the withdraw page, /w/[token]', () => {
  it('lists each consent in force with its own withdraw button', async () => {
    vi.mocked(verifySignedLink).mockResolvedValue({ ok: true, value: { subjectId: 9 } })
    vi.mocked(consentsInForce).mockResolvedValue([
      {
        purpose: 'marketingEmail',
        label: 'Marketing email',
        grantedAt: '2026-11-01T05:00:00.000Z',
      },
      {
        purpose: 'testimonialPublication',
        label: 'Publishing a testimonial',
        grantedAt: '2026-10-01T05:00:00.000Z',
      },
    ])
    const page = await html(
      WithdrawPage({ params: Promise.resolve({ token: LINK }), searchParams: search() }),
    )
    expect(verifySignedLink).toHaveBeenCalledWith('withdraw', LINK)
    expect(consentsInForce).toHaveBeenCalledWith(expect.anything(), 9)
    expect(page.match(new RegExp(`action="/w/${LINK}/withdraw"`, 'g'))).toHaveLength(2)
    expect(page).toContain('value="marketingEmail"')
    expect(page).toContain('value="testimonialPublication"')
  })

  it('shows nothing of the person for a link that does not work', async () => {
    vi.mocked(verifySignedLink).mockResolvedValue({ ok: false, error: { code: 'expired' } })
    const page = await html(
      WithdrawPage({ params: Promise.resolve({ token: LINK }), searchParams: search() }),
    )
    expect(page).toContain(WITHDRAW_COPY.invalid)
    expect(consentsInForce).not.toHaveBeenCalled()
  })
})
