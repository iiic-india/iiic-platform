// @vitest-environment node
import type { AdminViewServerProps, ServerProps } from 'payload'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PLACEHOLDERS_COPY as COPY } from '@/components/admin/placeholdersCopy'
import { PlaceholdersNavLink } from '@/components/admin/PlaceholdersNavLink'
import { PlaceholdersView } from '@/components/admin/PlaceholdersView'
import { STARTER_PAGES } from '@/content/starter'

// Next.js's redirect throws to stop rendering; here it throws something the tests can read.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`)
  },
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}))
// Payload's admin template and UI load styles only the Next.js build can handle.
vi.mock('@payloadcms/next/templates', () => ({
  DefaultTemplate: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@payloadcms/ui', () => ({
  Gutter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const editor = { id: 7, collection: 'users', roles: ['editor'], active: true, _strategy: 'totp' }

/** A page in the admin, as a draft with one placeholder and one candidate section. */
const adminPage = {
  id: 12,
  title: 'Fake page',
  slug: 'about',
  layout: [
    {
      blockType: 'statement',
      heading: 'Fake section',
      paragraphs: [{ text: '[[TODO: a fake fact, I-10]]' }],
      copyStatus: 'candidate',
    },
  ],
}

function view(user: Record<string, unknown> | null, docs: unknown[] = []) {
  const find = vi.fn(async () => ({ docs }))
  // The settings as a global nobody has saved: no legal information yet.
  const findGlobal = vi.fn(async () => ({}))
  const payload = { config: { routes: { admin: '/admin' }, serverURL: '' }, find, findGlobal }
  const props = {
    initPageResult: { req: { payload, user, i18n: {} }, permissions: {}, visibleEntities: {} },
    params: {},
    searchParams: {},
  } as unknown as AdminViewServerProps
  return { props, find, findGlobal }
}

describe('the placeholders report', () => {
  it('sends someone who has not signed in to the sign-in page, and reads nothing', async () => {
    const { props, find, findGlobal } = view(null)
    await expect(PlaceholdersView(props)).rejects.toThrow(/^redirect \/admin\/login$/)
    expect(find).not.toHaveBeenCalled()
    expect(findGlobal).not.toHaveBeenCalled()
  })

  it('reads only the legal information of the settings, to know what the footer and /legal still wait for', async () => {
    const { props, findGlobal } = view(editor, [adminPage])
    await PlaceholdersView(props)
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'settings',
        select: { legal: true, darkPatternAudits: true },
      }),
    )
  })

  it('sends a session without the two-factor code back to the admin, and reads nothing', async () => {
    const { props, find } = view({ ...editor, _strategy: 'local-jwt' })
    await expect(PlaceholdersView(props)).rejects.toThrow(/^redirect \/admin$/)
    expect(find).not.toHaveBeenCalled()
  })

  it('shows staff who do not read draft pages no report, and reads nothing for them', async () => {
    for (const user of [
      { ...editor, roles: ['practitioner'] },
      { ...editor, roles: ['finance'] },
      { ...editor, active: false },
    ]) {
      const { props, find } = view(user)
      const html = renderToStaticMarkup(await PlaceholdersView(props))
      expect(html, JSON.stringify(user)).toContain(COPY.notAllowed)
      expect(html).not.toContain('<table')
      expect(find).not.toHaveBeenCalled()
    }
  })

  it('reads the pages with the person’s own access, as their latest drafts', async () => {
    for (const role of ['owner', 'operator', 'editor']) {
      const user = { ...editor, roles: [role] }
      const { props, find } = view(user, [adminPage])
      await PlaceholdersView(props)
      expect(find, role).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'pages',
          draft: true,
          overrideAccess: false,
          user,
        }),
      )
    }
  })

  it('lists what is missing, with a way to each page: the admin’s, or the site’s', async () => {
    const { props } = view(editor, [adminPage])
    const html = renderToStaticMarkup(await PlaceholdersView(props))
    expect(html).toContain(`<h1>${COPY.title}</h1>`)
    // The page in the admin opens in the admin; a starter page opens on the site.
    expect(html).toContain('<a href="/admin/collections/pages/12">Fake page</a>')
    expect(html).toContain('a fake fact')
    expect(html).toContain('<a href="/privacy">Privacy notice</a>')
    expect(html).toContain(`(${COPY.notInAdmin})`)
    // The starter page the admin's page replaces is not read twice.
    expect(html).not.toContain(`<a href="/about">${STARTER_PAGES.about!.title}</a>`)
    // The code's own placeholders, the approvals and the legal drafts are in the report too.
    expect(html).toContain('Every page')
    expect(html).toMatch(new RegExp(`${COPY.candidates} \\(I-41\\): \\d+`))
    expect(html).toMatch(new RegExp(`${COPY.legal} \\(I-22\\): \\d+`))
    expect(html).toContain('The whole page')
  })
})

describe('the way to the report', () => {
  const props = (user: Record<string, unknown> | null) =>
    ({ user, payload: { config: { routes: { admin: '/admin' } } } }) as unknown as ServerProps

  it('is offered only to staff who can open it', () => {
    for (const user of [
      null,
      { ...editor, _strategy: 'local-jwt' },
      { ...editor, roles: ['practitioner'] },
      { ...editor, active: false },
    ]) {
      expect(PlaceholdersNavLink(props(user)), JSON.stringify(user)).toBeNull()
    }
  })

  it('sits in the admin’s navigation, in its markup', () => {
    const html = renderToStaticMarkup(PlaceholdersNavLink(props(editor)))
    expect(html).toBe(
      `<a class="nav__link" href="/admin/placeholders" id="nav-placeholders"><span class="nav__link-label">${COPY.title}</span></a>`,
    )
  })
})
