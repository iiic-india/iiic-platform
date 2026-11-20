// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { safeBack } from '@/lib/auth/safeBack'

describe('safeBack', () => {
  it('keeps a path inside the admin, with its query and fragment', () => {
    expect(safeBack('/admin/collections/media', '/admin')).toBe('/admin/collections/media')
    expect(safeBack('/admin?tab=2#top', '/admin')).toBe('/admin?tab=2#top')
    expect(safeBack('/admin', '/admin')).toBe('/admin')
  })

  it('sends anything else to the admin home', () => {
    for (const back of [
      undefined,
      '',
      ['/admin/x'],
      'https://evil.example/admin',
      '//evil.example/admin',
      '/\\evil.example/admin',
      '\\\\evil.example/admin',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pass@admin.invalid/admin',
      '/administrator',
      '/admin/../evil',
      '/',
      'http://[',
    ]) {
      expect(safeBack(back, '/admin'), String(back)).toBe('/admin')
    }
  })

  it('works when the admin is served from the root', () => {
    expect(safeBack('/collections/users', '')).toBe('/collections/users')
    expect(safeBack('//evil.example', '/')).toBe('/')
    expect(safeBack('/.//evil.example', '/')).toBe('/')
  })
})
