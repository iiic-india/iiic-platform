// @vitest-environment node
import type { AdminViewServerProps } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { SetupTwoFactor } from '@/components/admin/SetupTwoFactor'
import { TwoFactorCodeForm } from '@/components/admin/TwoFactorCodeForm'
import { VerifyTwoFactor } from '@/components/admin/VerifyTwoFactor'

// Next.js's redirect throws to stop rendering; here it throws something the tests can read.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`)
  },
}))
// Payload's admin template and UI load styles only the Next.js build can handle.
vi.mock('@payloadcms/next/templates', () => ({
  MinimalTemplate: ({ children }: { children: unknown }) => children,
}))
vi.mock('@payloadcms/ui', () => ({ Button: () => null, toast: {} }))

const config = { routes: { admin: '/admin', api: '/api' }, serverURL: '' }

function view(user: Record<string, unknown> | null, back?: string): AdminViewServerProps {
  return {
    initPageResult: { req: { payload: { config }, user } },
    searchParams: back === undefined ? {} : { back },
  } as unknown as AdminViewServerProps
}

/** The props of every element of `type` in a rendered tree. */
function propsOf(tree: unknown, type: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const element = node as { type?: unknown; props?: Record<string, unknown> }
    if (element.type === type && element.props) found.push(element.props)
    visit(element.props?.children)
  }
  visit(tree)
  return found
}

describe('the verify view', () => {
  it('sends someone who has not signed in to the sign-in page', () => {
    expect(() => VerifyTwoFactor(view(null))).toThrow(/^redirect \/admin\/login$/)
  })

  it('sends someone without an authenticator, or who has entered the code, to the admin', () => {
    for (const user of [{ hasTotp: false }, { hasTotp: true, _strategy: 'totp' }]) {
      expect(() => VerifyTwoFactor(view(user)), JSON.stringify(user)).toThrow(/^redirect \/admin$/)
    }
  })

  it('asks for the code, offers a recovery code, and returns only inside the admin', () => {
    const page = VerifyTwoFactor(view({ hasTotp: true, _strategy: 'local-jwt' }, '//evil.example'))
    const [code, recovery] = propsOf(page, TwoFactorCodeForm)
    expect(code).toMatchObject({ endpoint: '/api/verify-totp', next: '/admin' })
    expect(recovery).toMatchObject({
      kind: 'recovery',
      endpoint: '/api/users/recover-two-factor',
      next: '/admin/setup-totp?back=%2Fadmin',
    })

    const back = VerifyTwoFactor(view({ hasTotp: true }, '/admin/collections/media?page=2'))
    expect(propsOf(back, TwoFactorCodeForm)[0]?.next).toBe('/admin/collections/media?page=2')
  })
})

describe('the setup view', () => {
  it('sends someone who has not signed in to the sign-in page', async () => {
    await expect(SetupTwoFactor(view(null))).rejects.toThrow(/^redirect \/admin\/login$/)
  })

  it('sends someone who already has an authenticator to the admin', async () => {
    await expect(SetupTwoFactor(view({ hasTotp: true }))).rejects.toThrow(/^redirect \/admin$/)
  })

  it('offers a new secret and returns only inside the admin', async () => {
    const page = await SetupTwoFactor(
      view({ hasTotp: false, email: 'fake@example.invalid' }, 'javascript:alert(1)'),
    )
    const [form] = propsOf(page, TwoFactorCodeForm)
    expect(form).toMatchObject({ endpoint: '/api/setup-totp', next: '/admin' })
    expect(form?.secret).toMatch(/^[A-Z2-7]{32}$/)
    const [image] = propsOf(page, 'img')
    expect(image).toMatchObject({ alt: 'QR code for your authenticator app' })
    expect(String(image?.src)).toMatch(/^data:image\/png;base64,/)
  })
})
