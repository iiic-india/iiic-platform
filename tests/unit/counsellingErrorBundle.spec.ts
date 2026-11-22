// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// The counselling 500 (src/app/(platform)/(counselling)/error.tsx) is a client component, so
// every module it imports, and every module those import, is sent to the browser. It once took
// the scope statement from the page blocks, which brought the settings' validation library
// along; that library probes for eval, and the Content-Security-Policy reported it on every
// counselling page (D-42). These tests hold the files it may reach to a short list.
const read = (path: string) => readFileSync(path, 'utf8')
const importsOf = (path: string) =>
  [...read(path).matchAll(/from '([^']+)'/g)].map((match) => match[1])

describe('the counselling 500, a client component', () => {
  it('takes the scope statement from its own small file, never from the page blocks', () => {
    const boundary = 'src/app/(platform)/(counselling)/error.tsx'
    expect(read(boundary).startsWith("'use client'")).toBe(true)
    expect(importsOf(boundary)).toEqual([
      '@/components/blocks/Scope',
      '@/components/site/ServerError',
    ])
  })

  it('reaches nothing but the words, the contact details and the kit’s classes', () => {
    expect(importsOf('src/components/blocks/Scope.tsx')).toEqual([
      '@/lib/counselling/scope',
      './blocks.module.css',
    ])
    expect(importsOf('src/components/site/ServerError.tsx')).toEqual([
      'react',
      '@/lib/seo/site',
      '@/lib/site/contact',
      './ServerError.module.css',
    ])
    expect(importsOf('src/lib/counselling/scope.ts')).toEqual(['@/lib/site/contact'])
    expect(importsOf('src/lib/site/contact.ts')).toEqual([])
    expect(importsOf('src/lib/seo/site.ts')).toEqual([])
  })
})
