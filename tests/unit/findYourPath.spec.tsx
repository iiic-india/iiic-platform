import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { GET } from '@/app/(platform)/(default)/map/go/route'
import FindYourPathPage from '@/app/(platform)/(default)/map/page'
import { STARTER_PAGES } from '@/content/starter'
import { doorFor, STEP_ZERO_CHOICES, WHO_FOR } from '@/lib/map/stepZero'

afterEach(cleanup)

const go = (query: string) => GET(new Request(`https://iiic.example/map/go${query}`))

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
      expect(STARTER_PAGES[slug], choice.href).toBeDefined()
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
    ['organisation', '/organisations'],
  ])('sends "%s" to %s', (who, door) => {
    const response = go(`?who=${who}`)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(door)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('sends anything else back to the question, never to an address from the request', () => {
    for (const query of ['', '?who=', '?who=everyone', '?who=//evil.example', '?next=/admin']) {
      const response = go(query)
      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/map')
    }
  })
})

describe('Find your path: the page', () => {
  it('asks one question in a form that needs no script', () => {
    const { container } = render(<FindYourPathPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Who is this for?')
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/map/go')
    expect(form.getAttribute('method')).toBe('get')
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
})
