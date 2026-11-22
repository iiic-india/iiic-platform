// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canPreview,
  canPreviewAny,
  previewPath,
  previewRequest,
  previewUrl,
} from '@/lib/preview/access'
import { exitPreviewUrl } from '@/lib/preview/routes'

// The live preview's rules and its two routes (docs/15 §5.3, OS-4), against a fake Payload and
// a fake draft mode. Every user here is obviously fake.
const { auth, enable, disable } = vi.hoisted(() => ({
  auth: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth }) }))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ enable, disable, isEnabled: false }),
}))

const staff = (roles: string[], strategy = 'totp', active = true) => ({
  id: 1,
  roles,
  active,
  _strategy: strategy,
})

beforeEach(() => {
  auth.mockReset()
  enable.mockReset()
  disable.mockReset()
})

describe('canPreview', () => {
  it('lets the staff who read drafts preview, once they have entered their code', () => {
    for (const role of ['owner', 'operator', 'editor']) {
      expect(canPreview(staff([role]), 'pages'), role).toBe(true)
      expect(canPreview(staff([role]), 'posts'), role).toBe(true)
    }
  })

  it('refuses visitors, other roles, sessions without the code and deactivated accounts', () => {
    for (const user of [
      null,
      undefined,
      {},
      staff(['practitioner']),
      staff(['finance']),
      staff(['owner'], 'local-jwt'),
      staff(['editor'], 'api-key'),
      staff(['owner'], 'totp', false),
      { roles: ['owner'] },
    ]) {
      expect(canPreview(user, 'pages'), JSON.stringify(user)).toBe(false)
      expect(canPreview(user, 'posts'), JSON.stringify(user)).toBe(false)
      expect(canPreviewAny(user), JSON.stringify(user)).toBe(false)
    }
  })
})

describe('preview links', () => {
  it('opens a page at its own address and an article under /journal', () => {
    expect(previewPath({ collection: 'pages', slug: 'home' })).toBe('/')
    expect(previewPath({ collection: 'pages', slug: 'counselling/fake-page' })).toBe(
      '/counselling/fake-page',
    )
    expect(previewPath({ collection: 'posts', slug: 'fake-article' })).toBe('/journal/fake-article')
  })

  it('gives the admin a relative link, or none while the document has no address', () => {
    expect(previewUrl('pages', 'organisations/team-map')).toBe(
      '/api/preview?collection=pages&slug=organisations%2Fteam-map',
    )
    expect(previewUrl('posts', 'fake-article')).toBe(
      '/api/preview?collection=posts&slug=fake-article',
    )
    for (const slug of [undefined, null, '', 'Not A Slug', '../admin', 'page', 'topic']) {
      expect(previewUrl('posts', slug), String(slug)).toBeNull()
    }
    expect(previewUrl('pages', 'https://elsewhere.example')).toBeNull()
  })

  it('accepts only the two collections and addresses they could have', () => {
    expect(previewRequest.safeParse({ collection: 'users', slug: 'x' }).success).toBe(false)
    expect(previewRequest.safeParse({ collection: 'pages', slug: '//x' }).success).toBe(false)
    expect(previewRequest.safeParse({ collection: 'posts', slug: 'a/b' }).success).toBe(false)
    expect(previewRequest.safeParse({ collection: 'pages', slug: 'a/b' }).success).toBe(true)
  })

  it('leaves preview through its own route, back to the page', () => {
    expect(exitPreviewUrl('/journal/fake-article')).toBe(
      '/api/preview/exit?path=%2Fjournal%2Ffake-article',
    )
  })
})

describe('GET /api/preview', () => {
  const get = async (query: string) => {
    const { GET } = await import('@/app/api/preview/route')
    return GET(new NextRequest(`http://localhost:3000/api/preview${query}`))
  }

  it('turns on draft mode for staff with their code and opens the document at its address', async () => {
    auth.mockResolvedValue({ user: staff(['editor']) })
    const page = await get('?collection=pages&slug=framework')
    expect(page.status).toBe(303)
    expect(page.headers.get('location')).toBe('http://localhost:3000/framework')
    expect(page.headers.get('cache-control')).toBe('no-store')
    const article = await get('?collection=posts&slug=fake-article')
    expect(article.headers.get('location')).toBe('http://localhost:3000/journal/fake-article')
    expect(enable).toHaveBeenCalledTimes(2)
  })

  it('answers anyone else with a plain 404 and no draft mode', async () => {
    for (const user of [
      null,
      staff(['owner'], 'local-jwt'),
      staff(['practitioner']),
      staff(['finance']),
    ]) {
      auth.mockResolvedValue({ user })
      const response = await get('?collection=pages&slug=framework')
      expect(response.status, JSON.stringify(user)).toBe(404)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    expect(enable).not.toHaveBeenCalled()
  })

  it('refuses an address no document could have, even for staff', async () => {
    auth.mockResolvedValue({ user: staff(['owner']) })
    for (const query of [
      '',
      '?collection=pages',
      '?collection=users&slug=x',
      '?collection=pages&slug=%2F%2Felsewhere.example',
      '?collection=posts&slug=topic',
    ]) {
      expect((await get(query)).status, query).toBe(404)
    }
    expect(enable).not.toHaveBeenCalled()
  })
})

describe('GET /api/preview/exit', () => {
  const get = async (query: string) => {
    const { GET } = await import('@/app/api/preview/exit/route')
    return GET(new NextRequest(`http://localhost:3000/api/preview/exit${query}`))
  }

  it('turns draft mode off and returns to the page on this site', async () => {
    const response = await get('?path=%2Fjournal%2Ffake-article')
    expect(disable).toHaveBeenCalledOnce()
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/journal/fake-article')
  })

  it('never leaves the site', async () => {
    for (const path of ['https://elsewhere.example/', '//elsewhere.example', '/\\elsewhere', '']) {
      const response = await get(`?path=${encodeURIComponent(path)}`)
      expect(new URL(response.headers.get('location') ?? '').origin, path).toBe(
        'http://localhost:3000',
      )
    }
  })
})
