import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import blockStyles from '@/components/blocks/blocks.module.css'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { renderText } from '@/components/blocks/text'
import { FLIP_COPY } from '@/components/experience/copy'
import styles from '@/components/experience/experience.module.css'
import { COUNSELLING } from '@/content/starter/counselling'
import {
  FOUNDERS,
  FOUNDERS_CHAPTER_KICKER,
  FOUNDERS_IIIC_LINES,
  FOUNDERS_STORY_LABEL,
} from '@/content/starter/founders'
import { FRAMEWORK, FRAMEWORK_IIIC_LINES } from '@/content/starter/framework'
import { HOME } from '@/content/starter/home'
import { LEGAL } from '@/content/starter/legal'
import type { PageContent } from '@/lib/content/types'
import { devicesAt, isNarrativePath } from '@/lib/experience/narrative'
import type { ComparisonBlock } from '@/payload-types'

import { FakeIntersectionObserver, prefersReducedMotion } from '../helpers/browser'

// The experience devices of docs/11 §3 on the narrative pages, drawn from the starter pages: which
// page carries which device, and that each device keeps IIIC's words as they are. Each client
// component has its own tests (readingBar, flipLines, insightNav and revealChapters.spec.tsx);
// what only a browser can show (the stylesheet, the layout, the view without JavaScript) is in
// tests/e2e/experience.e2e.spec.ts.

const QUESTION = styles.question ?? ''
const QUESTION_GRID = styles.questionGrid ?? ''
const FIGURE = blockStyles.figure ?? ''
const IN_VIEW = '-96px 0px -60% 0px'

/** The nearest element from here up that carries a class. */
function ancestorWith(element: Element | null, className: string): Element | null {
  let node = element
  while (node && !node.classList.contains(className)) node = node.parentElement
  return node
}

beforeEach(() => {
  FakeIntersectionObserver.install()
  prefersReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the narrative pages', () => {
  it('are the home, framework and founders’ pages, and no other', () => {
    for (const path of ['/', '/framework', '/founders']) {
      expect(isNarrativePath(path), path).toBe(true)
    }
    // Counselling and booking above all carry no device (docs/11 §2, principle 6).
    const others = ['/counselling', '/book/session', '/organisations', '/learn', '/home']
    for (const path of [...others, '/framework/x', '/constructor', null]) {
      expect(isNarrativePath(path), String(path)).toBe(false)
    }
    expect(devicesAt('framework')).toEqual({ flip: true, stickyQuestion: true })
    expect(devicesAt('founders')).toEqual({ chapters: true })
    expect(devicesAt('home')).toEqual({ flip: true, reveals: true })
    for (const slug of ['counselling', 'legal', 'constructor', undefined]) {
      expect(devicesAt(slug), String(slug)).toEqual({})
    }
  })

  it('draw no device on a counselling page or on the legal information page', () => {
    const { container } = render(
      <>
        <RenderBlocks layout={COUNSELLING.layout} slug="counselling" />
        <RenderBlocks layout={LEGAL.layout} legalReview={LEGAL.legalReview} slug="legal" />
      </>,
    )
    expect(container.querySelector('[aria-pressed], [data-reveal], nav')).toBeNull()
    expect(container.getElementsByClassName(QUESTION)).toHaveLength(0)
    // The legal page's comparison stays a table, with nothing to flip.
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(FakeIntersectionObserver.all).toEqual([])
  })

  it('draw nothing to flip on the home page while it has no comparison', () => {
    const { container } = render(<RenderBlocks layout={HOME.layout} slug="home" />)
    expect(container.querySelector('[aria-pressed]')).toBeNull()
  })
})

describe('the home page’s reveals (docs/11 §4, §7)', () => {
  const REVEAL_ITEM = styles.revealItem ?? ''
  const draw = (slug = 'home') =>
    render(
      <main>
        <RenderBlocks layout={HOME.layout} slug={slug} />
      </main>,
    )

  it('marks each door’s card and each step to reveal once, all drawn visible', () => {
    const { container } = draw()
    const items = [...container.querySelectorAll<HTMLElement>('[data-reveal]')]
    const cards = [...container.querySelectorAll('.iiic-doors > .iiic-card')]
    const steps = [...container.querySelectorAll('.iiic-steps > li')]
    expect(cards.length).toBeGreaterThan(0)
    expect(steps.length).toBeGreaterThan(0)
    expect(items).toEqual([...cards, ...steps])
    for (const item of items) {
      expect(item.getAttribute('data-reveal')).toBe('')
      expect(item.classList.contains(REVEAL_ITEM)).toBe(true)
    }
    // Nothing else moves: the hero, the facts, the founder's word and the band stay as they are.
    expect(container.querySelector('.iiic-hero [data-reveal], .iiic-band[data-reveal]')).toBeNull()
  })

  it('holds back only what is wholly below the window, and shows it once in view', () => {
    const { container } = draw()
    const [observer] = FakeIntersectionObserver.all
    expect(observer).toBeDefined()
    const [first, below] = [...container.querySelectorAll<HTMLElement>('.iiic-steps > li')]
    if (!first || !below || !observer) throw new Error('The home page has steps')
    observer.report([
      { target: first, inView: false, top: 100 },
      { target: below, inView: false, top: 2000 },
    ])
    expect(first.getAttribute('data-reveal')).toBe('')
    expect(below.getAttribute('data-reveal')).toBe('waiting')
    observer.report([{ target: below, inView: true, top: 600 }])
    expect(below.getAttribute('data-reveal')).toBe('in')
  })

  it('holds back nothing under reduced motion', () => {
    prefersReducedMotion(true)
    draw()
    expect(FakeIntersectionObserver.all).toEqual([])
  })

  it('reveals nothing on another page with the same blocks', () => {
    const { container } = draw('organisations')
    expect(container.querySelector('[data-reveal]')).toBeNull()
    expect(FakeIntersectionObserver.all).toEqual([])
  })
})

/** The framework page's comparison. */
const comparison = FRAMEWORK.layout.find(
  (block): block is ComparisonBlock => block.blockType === 'comparison',
) as ComparisonBlock

describe('Flip the line on the framework page (docs/11 §3.2)', () => {
  const draw = () => render(<RenderBlocks layout={FRAMEWORK.layout} slug="framework" />)

  it('makes each of the five pairs a line named by its object side, in the copy’s order', () => {
    draw()
    const list = screen.getByRole('heading', { level: 2, name: 'Object or subject?' })
    const section = list.closest('section') as HTMLElement
    const lines = within(section)
      .getAllByRole('button', { pressed: false })
      .filter((button) => button.textContent !== FLIP_COPY.flipAll)
    expect(lines.map((button) => button.getAttribute('aria-describedby'))).toEqual(
      Array(5).fill(lines[0]?.getAttribute('aria-describedby')),
    )
    for (const [at, pair] of comparison.pairs.entries()) {
      expect(
        within(section).getByRole('button', {
          name: pair.left,
          pressed: false,
          description: FLIP_COPY.toSubject,
        }),
      ).toBe(lines[at])
    }
  })

  it('reads each line as the subject once pressed, with the keyboard', async () => {
    const user = userEvent.setup()
    draw()
    const first = screen.getByRole('button', { name: 'Life happens to me' })
    first.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('button', {
        name: 'I shape how I meet life',
        pressed: true,
        description: FLIP_COPY.toObject,
      }),
    ).toBe(first)
    expect(document.activeElement).toBe(first)
  })

  it('keeps the plain table, line for line, behind Show both', () => {
    draw()
    const link = screen.getByRole('link', { name: FLIP_COPY.showBoth })
    const both = document.getElementById((link.getAttribute('href') ?? '').slice(1))
    const table = within(both as HTMLElement).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([comparison.leftLabel, comparison.rightLabel])
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(comparison.pairs.map((pair) => pair.left))
    expect(
      within(table)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(comparison.pairs.map((pair) => pair.right))
  })

  it('flips a comparison on the home page too, should the page carry one', () => {
    const layout: PageContent['layout'] = [
      { blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' },
      { ...comparison, pairs: comparison.pairs.slice(0, 2) },
    ]
    render(<RenderBlocks layout={layout} slug="home" />)
    expect(
      screen
        .getAllByRole('button', { pressed: false })
        .filter((button) => button.textContent !== FLIP_COPY.flipAll),
    ).toHaveLength(2)
  })
})

describe('the sticky question (docs/11 §3.3)', () => {
  it('keeps the framework’s “What changes” beside its answers, in the same reading order', () => {
    render(<RenderBlocks layout={FRAMEWORK.layout} slug="framework" />)
    const heading = screen.getByRole('heading', { level: 2, name: 'What changes' })
    const question = ancestorWith(heading, QUESTION) as HTMLElement
    expect(question).not.toBeNull()
    const answers = question.nextElementSibling as HTMLElement
    expect(answers.querySelector('.iiic-lede')?.textContent).toBe(FRAMEWORK_IIIC_LINES.move)
    expect([...answers.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      FRAMEWORK_IIIC_LINES.decisions,
      FRAMEWORK_IIIC_LINES.reasoning,
      FRAMEWORK_IIIC_LINES.discipline,
      FRAMEWORK_IIIC_LINES.trueSelf,
      FRAMEWORK_IIIC_LINES.goals,
    ])
    expect(ancestorWith(question, QUESTION_GRID)).not.toBeNull()
  })

  it('is a heading like any other on a page without the device', () => {
    render(<RenderBlocks layout={FRAMEWORK.layout} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'What changes' })
    expect(ancestorWith(heading, QUESTION)).toBeNull()
  })
})

describe('the founders’ page as chapters (docs/11 §3.5)', () => {
  const LINES = FOUNDERS_IIIC_LINES
  const TITLES = [
    LINES.empireTitle,
    LINES.decisionsTitle,
    LINES.systemsTitle,
    LINES.peopleTitle,
    LINES.gratitudeTitle,
    LINES.brandTitle,
  ]
  const TEXTS = [
    LINES.empire,
    LINES.decisions,
    LINES.systems,
    LINES.people,
    LINES.gratitude,
    LINES.brand,
  ]
  const draw = () =>
    render(
      <main>
        <RenderBlocks layout={FOUNDERS.layout} slug="founders" />
      </main>,
    )
  const chaptersIn = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('[data-reveal]'),
  ]

  it('makes each section between the hero and the band a chapter, drawn visible', () => {
    const { container } = draw()
    const chapters = chaptersIn(container)
    expect(chapters.map((chapter) => chapter.querySelector('h2')?.textContent)).toEqual([
      LINES.storyHeading,
      LINES.shiftHeading,
      'Six Insights',
      LINES.rhythmHeading,
    ])
    expect(chapters.map((chapter) => chapter.getAttribute('data-reveal'))).toEqual(['', '', '', ''])
    expect(container.querySelector('.iiic-hero')?.closest('[data-reveal]')).toBeNull()
    expect(container.querySelector('.iiic-band')?.closest('[data-reveal]')).toBeNull()
  })

  it('puts a kicker above each chapter’s heading, a placeholder until IIIC approves it (I-41)', () => {
    const { container } = draw()
    for (const chapter of chaptersIn(container)) {
      const head = chapter.querySelector('.iiic-section-head') as HTMLElement
      const kicker = head.querySelector('.iiic-kicker') as HTMLElement
      expect(kicker.nextElementSibling?.tagName).toBe('H2')
      expect(kicker.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-41')
    }
    // The story still says what it is (D-28), after its chapter's kicker.
    expect(container.querySelector('#story .iiic-kicker')?.textContent).toBe(
      `${FOUNDERS_CHAPTER_KICKER} · ${FOUNDERS_STORY_LABEL}`,
    )
  })

  it('keeps every line IIIC wrote, word for word (D-55)', () => {
    const { container } = draw()
    const text = container.textContent ?? ''
    for (const line of Object.values(LINES)) expect(text, line).toContain(line)
  })

  it('sets the six insights’ titles beside their cards, the bar marking the card in view', () => {
    draw()
    const list = screen.getByRole('navigation', { name: 'Six Insights' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(TITLES)
    const cards = links.map((link) =>
      document.getElementById((link.getAttribute('href') ?? '').slice(1)),
    ) as HTMLElement[]
    // Each card keeps its own heading, so the page reads the same without the list.
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(TITLES)
    expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual(TEXTS)
    const spy = FakeIntersectionObserver.watching(IN_VIEW) as FakeIntersectionObserver
    expect(spy.watched).toEqual(new Set(cards))
    spy.report([{ target: cards[3] as HTMLElement, inView: true }])
    expect(
      links
        .filter((link) => link.getAttribute('aria-current') === 'true')
        .map((l) => l.textContent),
    ).toEqual([LINES.peopleTitle])
  })

  it('keeps the question with the titles, one h1, and no skipped heading level', () => {
    const { container } = draw()
    const heading = screen.getByRole('heading', { level: 2, name: 'Six Insights' })
    const titles = screen.getByRole('navigation', { name: 'Six Insights' })
    expect(ancestorWith(heading, QUESTION)?.contains(titles)).toBe(true)
    const levels = [...container.querySelectorAll('h1, h2, h3, h4')].map((h) =>
      Number(h.tagName.slice(1)),
    )
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1)
      return level
    })
  })

  it('sets the rupee figures in Fraunces, as written, the headline’s too', () => {
    const { container } = draw()
    expect(
      [...container.getElementsByClassName(FIGURE)].map((figure) => figure.textContent),
    ).toEqual(['₹100 Crore', '₹1000 Crore', '₹100 crore', '₹1000 crore', '₹900 crore'])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(LINES.headline)
  })
})

describe('a rupee figure in any text', () => {
  it('is set apart for the display face, and the words read exactly as written', () => {
    const text = 'From ₹100 Crore to [[TODO: fake figure, I-41]], then ₹1,23,900, and ₹5 lakhs.'
    const { container } = render(<p>{renderText(text)}</p>)
    expect(
      [...container.getElementsByClassName(FIGURE)].map((figure) => figure.textContent),
    ).toEqual(['₹100 Crore', '₹1,23,900', '₹5 lakhs'])
    expect(container.textContent).toBe(text)
    expect(container.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-41')
  })

  it('leaves text without one as the plain string it was', () => {
    expect(renderText('No figure here, only 25 years')).toBe('No figure here, only 25 years')
  })
})
