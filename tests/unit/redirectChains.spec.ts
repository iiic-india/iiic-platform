// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CHAIN_MESSAGES, chainProblem, planPublish } from '@/lib/redirects/chains'
import type { Rule } from '@/lib/redirects/table'

// Redirects never chain and never loop (src/lib/redirects/chains.ts; docs/12 §3). Rules are
// given as the site follows them: each `to` is where it leads now, a page's address for a
// redirect that leads to a page by reference (`pageId`).

const PAGE = 7

describe('a redirect checked against the others', () => {
  const others: Rule[] = [
    { id: 1, from: '/old-about', to: '/about' },
    { id: 2, from: '/older-about', to: '/about#contact' },
  ]

  it('passes when it leads straight to a page', () => {
    expect(chainProblem({ from: '/old-team', to: '/about#team' }, others)).toBeNull()
  })

  it('is refused when it leads back to its own address (a loop of one)', () => {
    expect(chainProblem({ from: '/about-us', to: '/about-us#team' }, others)).toEqual({
      field: 'to',
      message: CHAIN_MESSAGES.self,
    })
  })

  it('is refused when its address already has a redirect', () => {
    expect(chainProblem({ from: '/old-about', to: '/framework' }, others)).toEqual({
      field: 'from',
      message: CHAIN_MESSAGES.taken('/old-about'),
    })
  })

  it('is refused when it leads to an address that redirects again (a chain onward)', () => {
    expect(chainProblem({ from: '/x', to: '/old-about#team' }, others)).toEqual({
      field: 'to',
      message: CHAIN_MESSAGES.onward('/old-about', '/about'),
    })
  })

  it('is refused when another redirect leads to its address (a chain inward)', () => {
    expect(chainProblem({ from: '/about', to: '/framework' }, others)).toEqual({
      field: 'from',
      message: CHAIN_MESSAGES.inward('/about', '/old-about'),
    })
  })

  it('is refused when the two would send visitors round for ever (a loop of two)', () => {
    const one: Rule[] = [{ id: 1, from: '/a', to: '/b' }]
    expect(chainProblem({ from: '/b', to: '/a' }, one)).not.toBeNull()
  })

  it('is compared with the others, never with itself', () => {
    expect(chainProblem({ id: 1, from: '/old-about', to: '/framework' }, others)).toBeNull()
  })
})

describe('publishing a page', () => {
  it('at the address it had removes only a redirect made from there while it was away', () => {
    const rules: Rule[] = [
      { id: 1, from: '/framework', to: '/about' },
      { id: 2, from: '/old', to: '/framework' },
    ]
    expect(planPublish({ id: PAGE, address: '/framework' }, rules)).toEqual({
      remove: [1],
      retarget: [],
      create: null,
    })
    expect(planPublish({ id: PAGE, address: '/framework' }, [])).toEqual({
      remove: [],
      retarget: [],
      create: null,
    })
  })

  it('at a new address redirects the old one to the page itself (D-57)', () => {
    expect(planPublish({ id: PAGE, address: '/team', movedFrom: '/about' }, [])).toEqual({
      remove: [],
      retarget: [],
      create: { from: '/about' },
    })
  })

  it('re-points the redirects that named the old address, each keeping its section', () => {
    const rules: Rule[] = [
      { id: 1, from: '/old-about', to: '/about' },
      { id: 2, from: '/old-contact', to: '/about#contact' },
      // One that leads to the page by reference already leads to the new address.
      { id: 3, from: '/older', to: '/team', pageId: PAGE },
      { id: 4, from: '/unrelated', to: '/framework' },
    ]
    expect(planPublish({ id: PAGE, address: '/team', movedFrom: '/about' }, rules)).toEqual({
      remove: [],
      retarget: [
        { id: 1, url: '/team' },
        { id: 2, url: '/team#contact' },
      ],
      create: { from: '/about' },
    })
  })

  it('back to an address it had before removes the redirect from there: no loop', () => {
    // Moved from /a to /b, which left /a → the page; now moved back to /a.
    const rules: Rule[] = [{ id: 1, from: '/a', to: '/a', pageId: PAGE }]
    expect(planPublish({ id: PAGE, address: '/a', movedFrom: '/b' }, rules)).toEqual({
      remove: [1],
      retarget: [],
      create: { from: '/b' },
    })
  })

  it('takes the address of a redirect from elsewhere: the page wins, and nothing chains', () => {
    const rules: Rule[] = [
      { id: 1, from: '/team', to: '/framework' },
      { id: 2, from: '/old-team', to: '/team' },
    ]
    const plan = planPublish({ id: PAGE, address: '/team', movedFrom: '/about' }, rules)
    expect(plan).toEqual({ remove: [1], retarget: [], create: { from: '/about' } })
  })

  it('keeps a redirect someone made from the old address while the page was unpublished', () => {
    const rules: Rule[] = [{ id: 1, from: '/about', to: '/framework' }]
    expect(planPublish({ id: PAGE, address: '/team', movedFrom: '/about' }, rules)).toEqual({
      remove: [],
      retarget: [],
      create: null,
    })
  })

  it('adds no redirect from an address the site answers itself', () => {
    expect(planPublish({ id: PAGE, address: '/mapping', movedFrom: '/map' }, [])).toEqual({
      remove: [],
      retarget: [],
      create: null,
    })
  })

  it('is refused when the home page would give up its address', () => {
    expect(planPublish({ id: PAGE, address: '/welcome', movedFrom: '/' }, [])).toEqual({
      refused: CHAIN_MESSAGES.home,
    })
  })

  it('is refused when a redirect it writes would still chain', () => {
    // A chain the checks would have refused, already among the redirects (/y → /x → /about):
    // re-pointing /x at the new address would carry it on, and the redirects' own check
    // refuses that write, so the publish is refused first, with the reason.
    const rules: Rule[] = [
      { id: 1, from: '/x', to: '/about' },
      { id: 2, from: '/y', to: '/x' },
    ]
    const plan = planPublish({ id: PAGE, address: '/team', movedFrom: '/about' }, rules)
    expect(plan).toEqual({
      refused: CHAIN_MESSAGES.inward('/x', '/y'),
    })
  })
})
