// @vitest-environment node
import type { BeforeListTableServerProps, Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { StarterPages } from '@/components/admin/StarterPages'
import { StarterPagesPanel } from '@/components/admin/StarterPagesPanel'
import { STARTER_PAGES } from '@/content/starter'
import {
  COPY_STARTER_MESSAGES,
  copyStarterPage,
  starterPageData,
  starterPagesWaiting,
} from '@/lib/content/copyStarter'
import { pagePath } from '@/lib/content/slug'

// Payload's admin UI loads styles only the Next.js build can handle.
vi.mock('@payloadcms/ui', () => ({ Button: () => null, toast: {}, useConfig: () => ({}) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }))

const editor = { id: 7, collection: 'users', roles: ['editor'], active: true, _strategy: 'totp' }

function request(
  user: Record<string, unknown> | null,
  body: unknown,
  existing: { id: number; slug: string }[] = [],
) {
  const payload = {
    find: vi.fn(async () => ({ docs: existing })),
    create: vi.fn(async () => ({ id: 41 })),
  }
  const req = { user, payload, json: async () => body } as unknown as PayloadRequest
  return { req, payload }
}

describe('copying a starter page into the admin', () => {
  it('refuses anyone who has not entered their two-factor code in this session', async () => {
    for (const user of [
      null,
      { ...editor, _strategy: 'local-jwt' },
      { ...editor, collection: 'customers' },
      { ...editor, active: false },
    ]) {
      const { req, payload } = request(user, { slug: 'about' })
      const response = await copyStarterPage(req)
      expect(response.status, JSON.stringify(user)).toBe(401)
      expect(await response.json()).toEqual({ message: COPY_STARTER_MESSAGES.signIn })
      expect(payload.find).not.toHaveBeenCalled()
      expect(payload.create).not.toHaveBeenCalled()
    }
  })

  it('refuses staff whose role does not create pages (docs/05)', async () => {
    for (const roles of [['practitioner'], ['finance'], []]) {
      const { req, payload } = request({ ...editor, roles }, { slug: 'about' })
      const response = await copyStarterPage(req)
      expect(response.status, roles.join()).toBe(403)
      expect(payload.find).not.toHaveBeenCalled()
      expect(payload.create).not.toHaveBeenCalled()
    }
  })

  it('knows only the starter pages, and reads nothing for any other address', async () => {
    for (const body of [
      { slug: 'no-such-page' },
      // Names every object has must not pass for pages.
      { slug: 'constructor' },
      { slug: 'toString' },
      { slug: '' },
      { slug: 7 },
      { slug: 'a'.repeat(201) },
      {},
      null,
      'about',
    ]) {
      const { req, payload } = request(editor, body)
      const response = await copyStarterPage(req)
      expect(response.status, JSON.stringify(body)).toBe(404)
      expect(payload.find).not.toHaveBeenCalled()
      expect(payload.create).not.toHaveBeenCalled()
    }
  })

  it('never overwrites a page that is already here, and says which one it is', async () => {
    const { req, payload } = request(editor, { slug: 'about' }, [{ id: 12, slug: 'about' }])
    const response = await copyStarterPage(req)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: COPY_STARTER_MESSAGES.exists, id: 12 })
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('creates the page as a draft, under the collection’s own access rules', async () => {
    for (const role of ['owner', 'operator', 'editor']) {
      const { req, payload } = request({ ...editor, roles: [role] }, { slug: 'privacy' })
      const response = await copyStarterPage(req)
      expect(response.status, role).toBe(201)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toEqual({ id: 41 })
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'pages', where: { slug: { equals: 'privacy' } } }),
      )
      expect(payload.create).toHaveBeenCalledTimes(1)
      expect(payload.create).toHaveBeenCalledWith({
        collection: 'pages',
        data: starterPageData(STARTER_PAGES.privacy!),
        draft: true,
        overrideAccess: false,
        req,
      })
    }
  })
})

describe('a starter page as a draft', () => {
  it('carries everything the page has, as a draft', () => {
    const privacy = STARTER_PAGES.privacy!
    expect(starterPageData(privacy)).toEqual({
      title: 'Privacy notice',
      slug: 'privacy',
      layout: privacy.layout,
      legalReview: 'draft',
      _status: 'draft',
    })
    const about = STARTER_PAGES.about!
    expect(starterPageData(about)).toEqual({
      title: 'About',
      slug: 'about',
      layout: about.layout,
      facts: about.facts,
      _status: 'draft',
    })
  })

  it('is never born published, whichever page it is', () => {
    for (const page of Object.values(STARTER_PAGES)) {
      expect(starterPageData(page)._status, page.slug).toBe('draft')
    }
  })
})

describe('the starter pages still to bring in', () => {
  const payloadWith = (slugs: string[]) => {
    const find = vi.fn(async () => ({ docs: slugs.map((slug) => ({ slug })) }))
    return { payload: { find } as unknown as Payload, find }
  }

  it('are the ones with no page here, draft or published, in the starters’ order', async () => {
    const { payload, find } = payloadWith(['home', 'privacy'])
    const waiting = await starterPagesWaiting(payload)
    const all = Object.keys(STARTER_PAGES)
    expect(waiting.map((page) => page.slug)).toEqual(
      all.filter((slug) => slug !== 'home' && slug !== 'privacy'),
    )
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { slug: { in: all } },
        limit: all.length,
        select: { slug: true },
      }),
    )
  })

  it('are none once every page is here', async () => {
    const { payload } = payloadWith(Object.keys(STARTER_PAGES))
    expect(await starterPagesWaiting(payload)).toEqual([])
  })

  it('live at their own addresses', () => {
    expect(pagePath('home')).toBe('/')
    expect(pagePath('about')).toBe('/about')
    expect(pagePath('organisations/team-map')).toBe('/organisations/team-map')
  })
})

describe('the panel above the Pages list', () => {
  const props = (user: Record<string, unknown> | null, slugs: string[]) =>
    ({
      user,
      payload: { find: vi.fn(async () => ({ docs: slugs.map((slug) => ({ slug })) })) },
    }) as unknown as BeforeListTableServerProps

  it('is shown to no one who could not use it', async () => {
    for (const user of [
      null,
      { ...editor, _strategy: 'local-jwt' },
      { ...editor, roles: ['practitioner'] },
      { ...editor, active: false },
    ]) {
      const given = props(user, [])
      expect(await StarterPages(given), JSON.stringify(user)).toBeNull()
      expect(given.payload.find).not.toHaveBeenCalled()
    }
  })

  it('lists each waiting page with its address, and goes once none is waiting', async () => {
    const all = Object.keys(STARTER_PAGES)
    const panel = await StarterPages(props(editor, all.slice(2)))
    expect(panel?.type).toBe(StarterPagesPanel)
    expect((panel?.props as { pages: unknown }).pages).toEqual(
      all.slice(0, 2).map((slug) => ({
        slug,
        title: STARTER_PAGES[slug]!.title,
        path: pagePath(slug),
      })),
    )
    expect(await StarterPages(props(editor, all))).toBeNull()
  })
})
