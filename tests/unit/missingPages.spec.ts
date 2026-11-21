// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  isPrefetch,
  missingPageOf,
  notLogged,
  referrerHost,
  WriteBudget,
} from '@/lib/redirects/missingPages'

// What the 404 page writes to the log, and what it never keeps (src/lib/redirects/missingPages.ts;
// docs/04 `missing_pages`; docs/11 §5.1, item 9): an address and the referring site's host, no
// query string, nothing about the visitor, and no more writes than the log can take.

const request = (headers: Record<string, string>) => new Headers(headers)

describe('the entry a 404 adds to the log', () => {
  it('is the path src/proxy.ts saw, cleaned, and the referring host', () => {
    expect(
      missingPageOf(
        request({
          'x-pathname': '/old-page/',
          referer: 'https://www.Fake-Partner.example/news/item?id=7#top',
        }),
      ),
    ).toEqual({ path: '/old-page', referrerHost: 'www.fake-partner.example' })
  })

  it('has no referring host when the browser sends none, or one that is not a web page', () => {
    expect(missingPageOf(request({ 'x-pathname': '/old-page' }))).toEqual({
      path: '/old-page',
      referrerHost: null,
    })
    for (const referer of ['android-app://com.fake.app/', 'not a url', 'file:///etc/passwd']) {
      expect(referrerHost(referer), referer).toBeNull()
    }
    // A host with a user name or a port still gives only its name.
    expect(referrerHost('https://fake.user:secret@partner.example:8443/page')).toBe(
      'partner.example',
    )
  })

  it('is none for a prefetch, Next.js’s or the browser’s: nobody visited yet', () => {
    const prefetches: Record<string, string>[] = [
      { 'next-router-prefetch': '1' },
      { 'next-router-segment-prefetch': '/_tree' },
      { purpose: 'prefetch' },
      { 'sec-purpose': 'prefetch;prerender' },
    ]
    for (const headers of prefetches) {
      expect(isPrefetch(request(headers)), JSON.stringify(headers)).toBe(true)
      expect(missingPageOf(request({ 'x-pathname': '/old-page', ...headers }))).toBeNull()
    }
    expect(isPrefetch(request({ rsc: '1' }))).toBe(false)
  })

  it('is none without a path, or with one that is malformed', () => {
    expect(missingPageOf(request({}))).toBeNull()
    expect(missingPageOf(request({ 'x-pathname': '/%E0%A4%A' }))).toBeNull()
  })
})

describe('the addresses never logged', () => {
  it('include the routes that are never indexed, reached by a token or an id (D-67)', () => {
    for (const path of ['/book/session', '/b/fake-token', '/feedback/x', '/search', '/admin/x']) {
      expect(notLogged(path), path).toBe(true)
    }
  })

  it('include probes for software the site does not run, and Next.js’s own pages', () => {
    for (const path of [
      '/wp-login.php',
      '/wp-admin/install',
      '/xmlrpc.php',
      '/cgi-bin',
      '/.env',
      '/.git/config',
      '/.well-known/fake',
      '/old/backup.sql',
      '/index.aspx',
      '/404',
      '/500',
      '/_next/static/fake.js',
      '/_not-found',
    ]) {
      expect(notLogged(path), path).toBe(true)
    }
  })

  it('include an address that may carry something about a person', () => {
    for (const path of [
      '/unsubscribe/fake.person@example.invalid',
      '/order/12345678',
      '/call/+91 96240 46464',
      '/call/98242-74345',
      '/call/(079) 2654 3210',
      '/reset/eyJhbGciOiJIUzI1NiJ9abcdEFGH',
      '/verify/3b241101-e2bb-4255-8caf-4136c566a962',
      '/link/a1b2c3d4e5f6a7b8c9d0e1f2',
    ]) {
      expect(notLogged(path), path).toBe(true)
    }
  })

  it('leave the broken links a redirect can fix', () => {
    for (const path of [
      '/about-us',
      '/About-Us',
      '/old/page.html',
      '/event/subjective-self-2-days-workshop-on-self-knowledge',
      '/workshop-2023-04-03',
      '/organisations/fake-service',
      '/counselling/x',
    ]) {
      expect(notLogged(path), path).toBe(false)
    }
  })
})

describe('the writes one server makes in a minute', () => {
  it('stop at the budget and start again in the next minute', () => {
    let now = 0
    const budget = new WriteBudget(3, () => now)
    expect([budget.take(), budget.take(), budget.take(), budget.take()]).toEqual([
      true,
      true,
      true,
      false,
    ])
    now = 59_999
    expect(budget.take()).toBe(false)
    now = 60_000
    expect(budget.take()).toBe(true)
  })
})
