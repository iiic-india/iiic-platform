// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  answeredBySite,
  cleanPath,
  isSitePath,
  MAX_PATH_LENGTH,
  pathOf,
  requestPath,
  sectionOf,
  withoutSection,
} from '@/lib/redirects/paths'

// Addresses as the 404 log and the redirects hold them (src/lib/redirects/paths.ts): one form
// per address, so a logged address becomes a redirect that matches the requests that were logged.

describe('a request path, as the log and the redirects keep it', () => {
  it('is decoded, with no trailing slash', () => {
    expect(requestPath('/about-us/')).toBe('/about-us')
    expect(requestPath('/about%2Dus')).toBe('/about-us')
    expect(requestPath('/caf%C3%A9')).toBe('/café')
    expect(requestPath('/')).toBe('/')
    expect(requestPath('/old/page.html')).toBe('/old/page.html')
  })

  it('keeps its case, as Next.js matches routes by case', () => {
    expect(requestPath('/About-Us')).toBe('/About-Us')
  })

  it('is refused when malformed, empty, too long or not a path', () => {
    for (const bad of [
      null,
      undefined,
      '',
      '%E0%A4%A',
      'about',
      '//evil.example',
      '/a//b',
      `/${'a'.repeat(MAX_PATH_LENGTH)}`,
      '/with%3Fquery',
      '/with%23fragment',
      '/back%5Cslash',
      '/line%0Abreak',
      '/nul%00',
    ]) {
      expect(requestPath(bad), String(bad)).toBeNull()
    }
  })

  it('takes the longest address kept, and no longer', () => {
    const longest = `/${'a'.repeat(MAX_PATH_LENGTH - 1)}`
    expect(cleanPath(longest)).toBe(longest)
    expect(cleanPath(`${longest}a`)).toBeNull()
  })

  it('is built from a catch-all route’s decoded segments', () => {
    expect(pathOf('Old', 'Page.html')).toBe('/Old/Page.html')
    expect(pathOf('organisations', 'fake-service')).toBe('/organisations/fake-service')
    expect(pathOf('bad?query')).toBeNull()
  })
})

describe('where a redirect may lead by address', () => {
  it('is a page’s address on this site, with a section if one is named', () => {
    for (const good of ['/', '/about', '/organisations/team-map', '/about#contact', '/#doors']) {
      expect(isSitePath(good), good).toBe(true)
    }
  })

  it('is never another site, a query or an address no page could have', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'about',
      '/About',
      '/about?utm_source=fake',
      '/about/',
      '/about#',
      '/about#Contact',
      '/old page',
      '/old.html',
      '/-about',
      'javascript:alert(1)',
      42,
      null,
    ]) {
      expect(isSitePath(bad), String(bad)).toBe(false)
    }
  })

  it('splits into the address and the section it opens', () => {
    expect(withoutSection('/about#contact')).toBe('/about')
    expect(withoutSection('/#doors')).toBe('/')
    expect(sectionOf('/about#contact')).toBe('#contact')
    expect(sectionOf('/about')).toBe('')
  })
})

describe('the addresses the site answers itself', () => {
  it('cannot be redirected from', () => {
    for (const path of [
      '/',
      '/admin',
      '/admin/collections/pages',
      '/api/health',
      '/_next/static/x.js',
      '/_not-found',
      '/_global-error',
      '/404',
      '/500',
      '/.well-known/security.txt',
      '/og/home',
      '/map',
      '/map/go',
      '/page-not-found',
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/humans.txt',
      '/manifest.webmanifest',
      '/logo.png',
      '/favicon.ico',
      '/icon.svg',
    ]) {
      expect(answeredBySite(path), path).toBe(true)
    }
  })

  it('leave every other address free, a page’s included', () => {
    for (const path of ['/about-us', '/mapping', '/administration', '/framework', '/home']) {
      expect(answeredBySite(path), path).toBe(false)
    }
  })
})
