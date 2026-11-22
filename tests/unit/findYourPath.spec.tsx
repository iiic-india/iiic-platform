import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dynamic, GET, maxDuration, POST, runtime } from '@/app/(platform)/(default)/map/go/route'
import FindYourPathPage from '@/app/(platform)/(default)/map/page'
import { starterAt } from '@/content/starter'
import { recordEventQuietly } from '@/lib/analytics/record'
import { doorFor, STEP_ZERO_CHOICES, WHO_FOR } from '@/lib/map/stepZero'

// What next/server's `after` is handed runs once the response has gone; here it waits in a
// list, so a test can tell what ran before the answer and what after. The event itself is
// written by src/lib/analytics/record.ts (tests/unit/analyticsRecord.spec.ts).
const scheduled = vi.hoisted(() => [] as (() => unknown)[])
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    scheduled.push(task)
  },
}))
vi.mock('@/lib/analytics/record', () => ({ recordEventQuietly: vi.fn(async () => undefined) }))
const record = vi.mocked(recordEventQuietly)

beforeEach(() => {
  scheduled.length = 0
  record.mockClear()
})

/** Runs what the route left for after its response, as Next.js would. */
async function afterResponse() {
  for (const task of scheduled.splice(0)) await task()
}

// The page's structured data is drawn by a server component that reads the request's nonce
// (tests/unit/seoJsonLd.spec.tsx tests it). A plain element stands in for it here, with the
// same data.
vi.mock('@/components/seo/JsonLd', () => ({
  JsonLd: ({ graph }: { graph: unknown }) => (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  ),
}))

afterEach(cleanup)

/** The answer as the step-0 form posts it: in the body, never in the address. */
const go = (body: string, type = 'application/x-www-form-urlencoded') =>
  POST(
    new Request('https://iiic.example/map/go', {
      method: 'POST',
      headers: { 'Content-Type': type },
      body,
    }),
  )

describe('Find your path: the answers', () => {
  it('offers the plan’s three answers, each leading to a page that exists', () => {
    expect(STEP_ZERO_CHOICES.map((choice) => choice.value)).toEqual([...WHO_FOR])
    expect(STEP_ZERO_CHOICES.map((choice) => choice.label)).toEqual([
      'Yourself',
      'Your family',
      'Your organisation',
    ])
    for (const choice of STEP_ZERO_CHOICES) {
      const slug = choice.href.replace(/^\//, '').replace(/#.*$/, '')
      expect(starterAt(slug), choice.href).toBeDefined()
    }
  })

  it('knows no other answer', () => {
    expect(doorFor('yourself')).toBe('/counselling')
    for (const other of ['', 'Yourself', 'everyone', null, undefined, 7, {}]) {
      expect(doorFor(other)).toBeNull()
    }
  })
})

describe('Find your path: where an answer is sent', () => {
  it.each([
    ['yourself', '/counselling'],
    ['family', '/counselling'],
    ['organisation', '/organisations/team-map'],
  ])('sends "%s" to %s', async (who, door) => {
    const response = await go(`who=${who}`)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(door)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('sends anything else back to the question, never to an address from the request', async () => {
    for (const body of ['', 'who=', 'who=everyone', 'who=%2F%2Fevil.example', 'next=%2Fadmin']) {
      const response = await go(body)
      expect(response.status, body).toBe(303)
      expect(response.headers.get('Location'), body).toBe('/map')
    }
    // A body that is not a form is not an answer.
    const json = await go('{"who":"yourself"}', 'application/json')
    expect(json.status).toBe(303)
    expect(json.headers.get('Location')).toBe('/map')
  })

  it('never reads an answer from the address', () => {
    const response = GET()
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/map')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('declares its runtime and time limit (docs/12 §6)', () => {
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBe(10)
    expect(dynamic).toBe('force-dynamic')
  })
})

describe('Find your path: counting the answers (docs/03 F1, step 3)', () => {
  it.each([...WHO_FOR])(
    'counts "%s" as a step-0 event once the visitor has been sent on',
    async (who) => {
      const response = await go(`who=${who}`)
      // The answer is sent on before anything is written: the visitor never waits for it.
      expect(response.status).toBe(303)
      expect(record).not.toHaveBeenCalled()
      expect(scheduled).toHaveLength(1)
      await afterResponse()
      expect(record).toHaveBeenCalledTimes(1)
      const [event, headers] = record.mock.calls[0] ?? []
      // The choice, the page and its register: nothing else about the visitor.
      expect(event).toEqual({ name: 'step0', route: '/map', register: 'default', whoFor: who })
      expect(headers).toBeInstanceOf(Headers)
    },
  )

  it('counts nothing that is not one of the three answers, and nothing from an address', async () => {
    for (const body of ['', 'who=', 'who=everyone', 'next=%2Fadmin']) {
      expect((await go(body)).headers.get('Location'), body).toBe('/map')
    }
    expect((await go('{"who":"yourself"}', 'application/json')).headers.get('Location')).toBe(
      '/map',
    )
    GET()
    expect(scheduled).toHaveLength(0)
    expect(record).not.toHaveBeenCalled()
  })

  it('sends the visitor to the same door whether or not the count is written', async () => {
    record.mockRejectedValueOnce(new Error('fake: the database is down'))
    const response = await go('who=organisation')
    expect(response.headers.get('Location')).toBe('/organisations')
    // The count runs after the answer has gone; what happens to it cannot change the answer.
    await expect(afterResponse()).rejects.toThrow('fake')
    expect(response.status).toBe(303)
  })
})

describe('Find your path: the page', () => {
  it('asks one question in a form that needs no script', () => {
    const { container } = render(<FindYourPathPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Who is this for?')
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/map/go')
    // Posted, so the answer never appears in an address the request log keeps.
    expect(form.getAttribute('method')).toBe('post')
    const group = screen.getByRole('group', { name: 'Who is this for?' })
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((radio) => [radio.name, radio.value])).toEqual([
      ['who', 'yourself'],
      ['who', 'family'],
      ['who', 'organisation'],
    ])
    // The visitor chooses: nothing is chosen for them, and the form asks for an answer.
    expect(radios.some((radio) => radio.checked)).toBe(false)
    expect(radios.every((radio) => radio.required)).toBe(true)
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('type')).toBe('submit')
  })

  it('names each answer in words, and shows the unapproved line as a placeholder', () => {
    const { container } = render(<FindYourPathPage />)
    expect(
      [...container.querySelectorAll('.iiic-choice strong')].map((label) => label.textContent),
    ).toEqual(['Yourself', 'Your family', 'Your organisation'])
    expect(container.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-41')
  })

  it('carries its structured data once: the page, and the way to it from the home page', () => {
    const { container } = render(<FindYourPathPage />)
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    const { '@graph': graph } = JSON.parse(scripts[0]?.textContent ?? '') as {
      '@graph': { '@type': string; url?: string; name?: string }[]
    }
    expect(graph.map((node) => node['@type'])).toEqual(['WebPage', 'BreadcrumbList'])
    expect(graph[0]?.name).toBe('Find your path')
    expect(new URL(graph[0]?.url ?? '').pathname).toBe('/map')
    // The unapproved line is on the page, never in the data a search engine reads.
    expect(scripts[0]?.textContent).not.toMatch(/\[\[|TODO/)
  })
})
