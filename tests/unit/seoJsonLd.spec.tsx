// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonLd, nonceFromCsp } from '@/components/seo/JsonLd'
import { buildCsp, createNonce } from '@/lib/security/csp'
import { MAP_PAGE } from '@/lib/seo/appPages'
import { type JsonLdGraph, pageGraph } from '@/lib/seo/schema'

// The script element that carries a page's structured data (src/components/seo/JsonLd.tsx).
// The request's policy is the one src/proxy.ts sets, which is where Next.js reads the nonce too.
const request = vi.hoisted(() => ({ csp: null as string | null }))
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(request.csp === null ? {} : { 'content-security-policy': request.csp }),
}))

const policy = (nonce: string) => buildCsp({ nonce, development: false, https: true })

/** The component, rendered as the server renders it. */
const draw = async (graph: JsonLdGraph) => renderToStaticMarkup(await JsonLd({ graph }))

const GRAPH = pageGraph(MAP_PAGE, 'https://fake.example')

beforeEach(() => {
  request.csp = null
})

describe('nonceFromCsp', () => {
  it('reads the nonce from the policy the proxy builds', () => {
    // A base64 value: letters, digits, "+", "/" and "=".
    for (const nonce of ['ZmFrZS1ub25jZQ==', 'a+b/c+d/e+f/g+h/i+j/kQ==', createNonce()]) {
      expect(nonceFromCsp(policy(nonce)), nonce).toBe(nonce)
      expect(
        nonceFromCsp(buildCsp({ nonce, development: true, https: false })),
        `${nonce} in development`,
      ).toBe(nonce)
    }
  })

  it('finds none where there is no policy, or a policy without one', () => {
    expect(nonceFromCsp(null)).toBeUndefined()
    expect(nonceFromCsp(undefined)).toBeUndefined()
    expect(nonceFromCsp('')).toBeUndefined()
    expect(nonceFromCsp("default-src 'none'; frame-ancestors 'none'")).toBeUndefined()
    expect(nonceFromCsp("script-src 'self' 'nonce-'")).toBeUndefined()
  })
})

describe('JsonLd', () => {
  it('is one script element of type application/ld+json, carrying the request’s nonce', async () => {
    request.csp = policy('ZmFrZS1ub25jZQ==')
    const element = await JsonLd({ graph: GRAPH })
    // A plain script element, never next/script, which would load it as a script.
    expect(element.type).toBe('script')
    const html = await draw(GRAPH)
    expect(html.match(/<script\b/g)).toHaveLength(1)
    expect(html.startsWith('<script type="application/ld+json" nonce="ZmFrZS1ub25jZQ==">')).toBe(
      true,
    )
    expect(html.endsWith('</script>')).toBe(true)
  })

  it('holds the graph as JSON a crawler can parse', async () => {
    request.csp = policy('ZmFrZS1ub25jZQ==')
    const html = await draw(GRAPH)
    const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(JSON.parse(json)).toEqual(GRAPH)
    expect(JSON.parse(json)['@context']).toBe('https://schema.org')
  })

  it('takes a new nonce from each request', async () => {
    const first = createNonce()
    const second = createNonce()
    request.csp = policy(first)
    expect(await draw(GRAPH)).toContain(`nonce="${first}"`)
    request.csp = policy(second)
    const html = await draw(GRAPH)
    expect(html).toContain(`nonce="${second}"`)
    expect(html).not.toContain(first)
  })

  it('has no nonce where the request has no policy, and still carries the data', async () => {
    const element = await JsonLd({ graph: GRAPH })
    expect(element.props.nonce).toBeUndefined()
    const html = await draw(GRAPH)
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true)
  })

  it('cannot be ended by its own data: every "<" is escaped', async () => {
    request.csp = policy('ZmFrZS1ub25jZQ==')
    const hostile = 'Fake </script><script>alert(1)</script><!-- title'
    const graph = pageGraph(
      { path: '/fake', title: hostile, description: hostile },
      'https://fake.example',
    )
    const html = await draw(graph)
    // The element's own tags and no other: one opening, one closing.
    expect(html.match(/<script\b/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html.match(/</g)).toHaveLength(2)
    const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    const [page] = (JSON.parse(json) as JsonLdGraph)['@graph']
    expect(page?.name).toBe(hostile)
    expect(page?.description).toBe(hostile)
  })
})
