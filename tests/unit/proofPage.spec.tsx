import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Proof, { metadata } from '@/app/(platform)/(default)/proof/page'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import proofStyles from '@/components/proof/proof.module.css'
import { ProofPage, proofPath } from '@/components/proof/ProofPage'
import { COUNSELLING } from '@/content/starter/counselling'
import { FRAMEWORK } from '@/content/starter/framework'
import { HOME } from '@/content/starter/home'
import type { PageContent } from '@/lib/content/types'
import { PROOF_COPY, VOICE_COPY } from '@/lib/proof/copy'
import { getPublishedReviews } from '@/lib/proof/read'
import { NO_VOICES, voicesOn, type ReviewCardData } from '@/lib/proof/voices'
import { PROOF_PAGE } from '@/lib/seo/appPages'

vi.mock('@/lib/proof/read', () => ({ getPublishedReviews: vi.fn(async () => []) }))
// The structured data as a plain script: the real one reads the request's nonce on the server.
vi.mock('@/components/seo/JsonLd', async () => {
  const { createElement } = await import('react')
  return {
    JsonLd: ({ graph }: { graph: unknown }) =>
      createElement('script', {
        type: 'application/ld+json',
        dangerouslySetInnerHTML: { __html: JSON.stringify(graph) },
      }),
  }
})

// Proof and the voices beside the text (docs/02; docs/11 §3.8; D-37), drawn from obviously fake
// reviews: the honest empty states while nothing is published, the filters by door, the card's
// caption, and where a voice sits on a page. What only a browser shows (the sticky column, the
// layout at each width) is in tests/e2e/proof.e2e.spec.ts.

/** A published review as a visitor reads it. Obviously fake. */
function review(id: number, fields: Partial<ReviewCardData> = {}): ReviewCardData {
  return {
    id,
    shownName: `Fake Writer ${id}`,
    displayForm: 'full',
    designation: 'Fake designation',
    organisation: null,
    showOrganisation: false,
    place: 'Fakepur',
    programme: 'Fake programme',
    year: 2016,
    month: null,
    doors: ['consultancy'],
    text: `Fake review words number ${id}.`,
    language: 'en-IN',
    translation: null,
    excerpt: null,
    connection: 'none',
    incentive: null,
    placements: [],
    publishedAt: '2026-11-20T10:00:00.000Z',
    ...fields,
  }
}

beforeEach(() => {
  vi.mocked(getPublishedReviews).mockReset()
  vi.mocked(getPublishedReviews).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

describe('Proof while nothing is published', () => {
  it('says so in each part, offers no filter, and invents nothing (CLAUDE.md #1)', () => {
    render(<ProofPage reviews={[]} door={null} />)
    expect(screen.getByRole('heading', { level: 1, name: PROOF_COPY.title })).toBeTruthy()
    for (const part of [PROOF_COPY.voices, PROOF_COPY.stories, PROOF_COPY.cases]) {
      const section = screen.getByRole('region', { name: part.heading })
      expect(section.id).toBe(part.anchor)
      expect(within(section).getByRole('heading', { name: part.emptyHeading })).toBeTruthy()
      expect(within(section).getByText(part.emptyText)).toBeTruthy()
    }
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('blockquote')).toBeNull()
    expect(document.querySelectorAll('.iiic-card-proof')).toHaveLength(0)
  })

  it('marks the proposed heading and line, and the stories’ heading, as awaiting IIIC (I-41)', () => {
    const { container } = render(<ProofPage reviews={[]} door={null} />)
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(2)
  })

  it('draws no rating and no Review or AggregateRating markup (docs/12 §3)', () => {
    const { container } = render(<ProofPage reviews={[review(1)]} door={null} />)
    const data = container.querySelector('script[type="application/ld+json"]')?.textContent ?? ''
    expect(data).toContain('WebPage')
    expect(data).not.toMatch(/"@type":"(?:Review|AggregateRating|Rating)"|ratingValue|reviewRating/)
    expect(container.textContent).not.toMatch(/★|☆/)
  })

  it('is the route /proof, with its canonical address whatever the filter', async () => {
    expect(metadata.alternates?.canonical).toMatch(/\/proof$/)
    expect(metadata.title).toBeTruthy()
    const page = (await Proof({ searchParams: Promise.resolve({ door: 'counselling' }) })) as
      ReactElement<{ door: unknown }> | undefined
    expect(page?.props.door).toBe('counselling')
    const unknown = (await Proof({ searchParams: Promise.resolve({ door: 'nonsense' }) })) as
      ReactElement<{ door: unknown }> | undefined
    expect(unknown?.props.door).toBeNull()
    expect(PROOF_PAGE.path).toBe('/proof')
  })
})

describe('Proof with published reviews', () => {
  const reviews = [
    review(1),
    review(2, { doors: ['counselling'], displayForm: 'initials', shownName: 'F. W.' }),
    review(3, { doors: ['education'] }),
  ]

  it('shows every review, each with its caption and its own address on the page', () => {
    render(<ProofPage reviews={reviews} door={null} />)
    const cards = document.querySelectorAll('.iiic-card-proof')
    expect(cards).toHaveLength(3)
    expect(cards[0]?.id).toBe('review-1')
    expect(cards[0]?.textContent).toContain('Fake Writer 1 · Fake designation · Fakepur')
    expect(cards[0]?.textContent).toContain('Fake programme, 2016')
  })

  it('filters by door with links that work without JavaScript, the current one marked', () => {
    render(<ProofPage reviews={reviews} door="education" />)
    const filters = screen.getByRole('navigation', { name: PROOF_COPY.voices.filterLabel })
    const current = within(filters).getByRole('link', { current: true })
    expect(current.getAttribute('href')).toBe(proofPath('education'))
    expect(proofPath('education')).toBe('/proof?door=education#voices')
    expect(document.querySelectorAll('.iiic-card-proof')).toHaveLength(1)
  })

  it('says honestly that a door has nothing yet', () => {
    render(<ProofPage reviews={reviews} door="framework" />)
    expect(screen.getByText(PROOF_COPY.voices.emptyDoorText)).toBeTruthy()
  })

  it('shows a counselling review with initials and place only (D-37)', () => {
    render(<ProofPage reviews={reviews} door="counselling" />)
    const card = document.querySelector('.iiic-card-proof')
    expect(card?.textContent).toContain('F. W. · Fakepur')
    expect(card?.textContent).not.toContain('Fake designation')
  })

  it('shows the organisation only where agreed, and discloses a connection and an incentive (docs/08 §6)', () => {
    render(
      <ProofPage
        reviews={[
          review(4, {
            organisation: 'Fake Org',
            showOrganisation: true,
            connection: 'friend',
            incentive: 'a fake gift',
          }),
          review(5, { organisation: 'Hidden Fake Org', showOrganisation: false }),
        ]}
        door={null}
      />,
    )
    const [shown, hidden] = document.querySelectorAll('.iiic-card-proof')
    expect(shown?.textContent).toContain('Fake designation · Fake Org · Fakepur')
    expect(shown?.textContent).toContain('Friend of Gaurang Mistry')
    expect(shown?.textContent).toContain(VOICE_COPY.incentive('a fake gift'))
    expect(hidden?.textContent).not.toContain('Hidden Fake Org')
  })

  it('shows a Gujarati review in its own language, with the approved translation after it', () => {
    render(
      <ProofPage
        reviews={[review(6, { language: 'gu-IN', text: 'નકલી શબ્દો', translation: 'Fake words.' })]}
        door={null}
      />,
    )
    const quote = document.querySelector('blockquote')
    expect(quote?.getAttribute('lang')).toBe('gu-IN')
    expect(screen.getByText(VOICE_COPY.translatedFrom('gu-IN'))).toBeTruthy()
    expect(screen.getByText('Fake words.').getAttribute('lang')).toBe('en-IN')
  })
})

describe('voices beside the text (docs/11 §3.8)', () => {
  /** A page's layout with link names given to some of its sections. */
  function withAnchors(page: PageContent, anchors: Record<number, string>): PageContent['layout'] {
    return page.layout.map((block, index) =>
      anchors[index] ? { ...block, anchor: anchors[index] } : block,
    ) as PageContent['layout']
  }

  it('draws nothing where no review is pinned', () => {
    const { container } = render(
      <RenderBlocks layout={FRAMEWORK.layout} slug="framework" voices={NO_VOICES} />,
    )
    expect(container.querySelector('aside')).toBeNull()
    expect(container.querySelector('.iiic-card-proof')).toBeNull()
  })

  it('sets the voice beside its section, after the claim, with the excerpt and a link to the whole', () => {
    const layout = withAnchors(FRAMEWORK, { 1: 'what-it-is' })
    const pinned = review(7, {
      excerpt: 'Fake review words …',
      placements: [{ page: 'framework', section: 'what-it-is' }],
    })
    const { container } = render(
      <RenderBlocks layout={layout} slug="framework" voices={voicesOn([pinned], 'framework')} />,
    )
    const aside = screen.getByRole('complementary', { name: VOICE_COPY.label })
    expect(aside.className).toContain(proofStyles.voice)
    expect(aside.getAttribute('data-reveal')).toBe('')
    expect(aside.parentElement?.className).toContain(proofStyles.withVoice)
    // The claim comes first in the page, then the voice.
    expect(aside.previousElementSibling?.querySelector('section')).toBeTruthy()
    expect(within(aside).getByText('Fake review words …')).toBeTruthy()
    expect(within(aside).getByRole('link', { name: VOICE_COPY.readAll }).getAttribute('href')).toBe(
      '/proof#review-7',
    )
    expect(container.querySelectorAll('aside')).toHaveLength(1)
  })

  it('puts the first voice under the home page’s hero, small and still', () => {
    const first = review(8, { placements: [{ page: 'home', section: 'first-voice' }] })
    render(<RenderBlocks layout={HOME.layout} slug="home" voices={voicesOn([first], 'home')} />)
    const aside = screen.getByRole('complementary', { name: VOICE_COPY.label })
    expect(aside.closest('.iiic-hero')).toBeTruthy()
    expect(aside.getAttribute('data-reveal')).toBeNull()
    expect(aside.querySelector(`.${proofStyles.small}`)).toBeTruthy()
  })

  it('draws counselling’s voices as plain cards in the text, with no sticky column and no reveal', () => {
    const layout = withAnchors(COUNSELLING, { 1: 'feels-familiar' })
    const pinned = [1, 2, 3].map((id) =>
      review(id, {
        doors: ['counselling'],
        displayForm: 'initials',
        shownName: `F. ${id}.`,
        placements: [{ page: 'counselling', section: 'feels-familiar' }],
      }),
    )
    const { container } = render(
      <RenderBlocks layout={layout} slug="counselling" voices={voicesOn(pinned, 'counselling')} />,
    )
    const aside = screen.getByRole('complementary', { name: VOICE_COPY.label })
    expect(aside.className).toContain(proofStyles.plainVoices)
    expect(aside.querySelectorAll('.iiic-card-proof')).toHaveLength(3)
    expect(container.querySelector(`.${proofStyles.withVoice}`)).toBeNull()
    expect(container.querySelector('[data-reveal]')).toBeNull()
  })

  it('finds each page’s voices by the slot they are pinned to, and only that page’s', () => {
    const voices = voicesOn(
      [
        review(1, { placements: [{ page: 'home', section: 'first-voice' }] }),
        review(2, { placements: [{ page: 'home', section: 'how-it-works' }] }),
        review(3, { placements: [{ page: 'learn', section: 'pillars' }] }),
      ],
      'home',
    )
    expect(voices.first?.id).toBe(1)
    expect(Object.keys(voices.bySection)).toEqual(['how-it-works'])
  })
})
